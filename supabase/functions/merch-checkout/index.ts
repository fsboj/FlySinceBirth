import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SITE_ORIGIN = "https://flysbirth.com";
const SITE_PATH = "/merch.html";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": SITE_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function serviceKey(): { key: string; secret: boolean } {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const value = JSON.parse(secretKeys).default;
      if (typeof value === "string" && value.startsWith("sb_secret_")) return { key: value, secret: true };
    } catch (_) { /* fall back to legacy key */ }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return { key: legacy, secret: false };
  throw new Error("Supabase server credentials are unavailable.");
}

async function rest(path: string, init: RequestInit = {}) {
  const credentials = serviceKey();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", credentials.key);
  if (!credentials.secret) headers.set("Authorization", `Bearer ${credentials.key}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const result = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers });
  const text = await result.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!result.ok) {
    const message = typeof data === "object" && data && "message" in data ? String((data as { message: unknown }).message) : "Store database request failed.";
    throw new Error(message);
  }
  return data;
}

function checkoutStatus() {
  const stripe = (Deno.env.get("MERCH_STRIPE_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY")) || "";
  const webhook = (Deno.env.get("MERCH_STRIPE_WEBHOOK_SECRET") || Deno.env.get("STRIPE_WEBHOOK_SECRET")) || "";

  const test = /^(sk|rk)_test_/.test(stripe);
  const live = /^(sk|rk)_live_/.test(stripe) && Deno.env.get("MERCH_LIVE_CHECKOUT_ENABLED") === "true";
  const missing: string[] = [];
  if (!test && !/^(sk|rk)_live_/.test(stripe)) missing.push("STRIPE_SECRET_KEY (test key)");
  if (/^(sk|rk)_live_/.test(stripe) && !live) missing.push("MERCH_LIVE_CHECKOUT_ENABLED (keep off until ready for real sales)");
  if (!webhook) missing.push("STRIPE_WEBHOOK_SECRET");

  if (Deno.env.get("MERCH_CHECKOUT_ENABLED") !== "true") missing.push("MERCH_CHECKOUT_ENABLED");
  return { enabled: Deno.env.get("MERCH_CHECKOUT_ENABLED") === "true" && !!webhook && (test || live), missing, mode: live ? "live" : "test" };
}

async function customerFromRequest(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const publicKey = request.headers.get("apikey");
  if (!token || !publicKey || !supabaseUrl) throw new Error("Sign in to your FSB account before checkout.");
  const result = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: publicKey, Authorization: `Bearer ${token}` } });
  if (!result.ok) throw new Error("Your sign-in expired. Sign in again before checkout.");
  const user = await result.json();
  if (!user.id || !user.email || !user.email_confirmed_at) throw new Error("Confirm your email address before checkout.");
  return { id: String(user.id), email: String(user.email) };
}

function cleanAddress(value: Record<string, unknown>) {
  const address = {
    name: String(value.name || "").trim().slice(0, 120),
    address1: String(value.address1 || "").trim().slice(0, 200),
    address2: String(value.address2 || "").trim().slice(0, 200),
    city: String(value.city || "").trim().slice(0, 100),
    state_code: String(value.state_code || "").trim().toUpperCase().slice(0, 20),
    country_code: String(value.country_code || "").trim().toUpperCase().slice(0, 2),
    zip: String(value.zip || "").trim().slice(0, 20),
    phone: String(value.phone || "").trim().slice(0, 40),
  };
  if (!address.name || !address.address1 || !address.city || !address.country_code || address.country_code.length !== 2 || !address.zip) {
    throw new Error("Enter the recipient name and complete shipping address.");
  }
  if (["US", "CA", "AU"].includes(address.country_code) && !address.state_code) throw new Error("Enter the state or province for this address.");
  return address;
}

type CartInput = { id: number; size?: string; color?: string; quantity: number };
type PricedLine = {
  product_id: number; product_name: string; product_image: string | null; variant_size: string | null;
  variant_color: string | null; quantity: number; unit_price: number; fulfillment_method: string;
  printful_variant_id: string; printful_catalog_variant_id?: string; supplier_name: string | null;
  shipping_price: number | null; shipping_countries: string[];
};

async function resolveCart(raw: unknown): Promise<PricedLine[]> {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 20) throw new Error("Your bag is empty or has too many different items.");
  const items = raw as CartInput[];
  const ids = [...new Set(items.map((item) => Number(item.id)))];
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 1)) throw new Error("The bag contains an invalid item.");
  const rows = await rest(`merch_products?id=in.(${ids.join(",")})&active=eq.true&select=id,name,price,images,sizes,colors,variants,fulfillment_method,printful_variant_id,supplier_name,shipping_price,shipping_countries,track_inventory,stock_quantity`) as Array<Record<string, unknown>>;
  const products = new Map(rows.map((product) => [Number(product.id), product]));
  if (products.size !== ids.length) throw new Error("An item in your bag is no longer available.");
  const lines: PricedLine[] = [];
  for (const item of items) {
    const product = products.get(Number(item.id))!;
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new Error("Choose a quantity from 1 to 10 for each item.");
    if (!["printful", "supplier", "own_inventory"].includes(String(product.fulfillment_method))) throw new Error("An item has no fulfillment method.");
    const size = String(item.size || "").trim();
    const color = String(item.color || "").trim();
    const sizes = Array.isArray(product.sizes) ? product.sizes.map(String) : [];
    const colors = Array.isArray(product.colors) ? product.colors.map(String) : [];
    if (sizes.length && !sizes.includes(size)) throw new Error(`Choose an available size for ${String(product.name)}.`);
    if (colors.length && !colors.includes(color)) throw new Error(`Choose an available color for ${String(product.name)}.`);
    const variants = Array.isArray(product.variants) ? product.variants as Array<Record<string, unknown>> : [];
    const mapped = variants.find((variant) =>
      String(variant.size || variant.name || "").trim().toLowerCase() === size.toLowerCase() &&
      String(variant.color || "").trim().toLowerCase() === color.toLowerCase()
    );
    const variantId = String(mapped?.printful_variant_id || ((!sizes.length && !colors.length) ? product.printful_variant_id || "" : "")).trim();
    if (product.fulfillment_method === "printful" && !/^[0-9]{1,20}$/.test(variantId)) throw new Error(`The Printful variant for ${String(product.name)}${size ? ` (${size}${color ? `, ${color}` : ""})` : ""} has not been configured in Admin.`);
    if (variants.length && !mapped) throw new Error("That size and color combination is not available.");
    if (product.fulfillment_method !== "printful" && product.track_inventory) {
      const stock = Number(mapped ? mapped.stock_quantity : product.stock_quantity);
      if (!Number.isInteger(stock) || stock < quantity) throw new Error("An item is sold out or has insufficient stock.");
    }
    let catalogVariantId = "";
    if (product.fulfillment_method === "printful") {
      const token = Deno.env.get("PRINTFUL_API_TOKEN");
      if (!token) throw new Error("Printful is not configured yet.");
      const result = await fetch(`https://api.printful.com/store/variants/${variantId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await result.json();
      // Manual/API stores return the variant directly; platform stores may wrap it.
      const syncVariant = data.result?.sync_variant || data.result;
      if (!result.ok || !syncVariant?.synced || !syncVariant.variant_id || String(syncVariant.id) !== variantId) {
        throw new Error("A Printful product needs a configured sync variant with its print design.");
      }
      if (syncVariant.is_ignored || ["discontinued", "out_of_stock", "temporary_out_of_stock"].includes(syncVariant.availability_status)) {
        throw new Error("That Printful size and color is currently unavailable.");
      }
      catalogVariantId = String(syncVariant.variant_id);
    }
    const images = Array.isArray(product.images) ? product.images as unknown[] : [];
    const price = Number(product.price);
    if (!Number.isFinite(price) || price <= 0) throw new Error(`The price for ${String(product.name)} is not valid.`);
    lines.push({
      product_id: Number(product.id), product_name: String(product.name), product_image: images.length ? String(images[0]) : null,
      variant_size: size || null, variant_color: color || null, quantity, unit_price: price,
      fulfillment_method: String(product.fulfillment_method), printful_variant_id: product.fulfillment_method === "printful" ? variantId : "",
      printful_catalog_variant_id: catalogVariantId, supplier_name: typeof product.supplier_name === "string" ? product.supplier_name : null,
      shipping_price: product.shipping_price == null ? null : Number(product.shipping_price),
      shipping_countries: Array.isArray(product.shipping_countries) ? product.shipping_countries.map(String) : [],
    });
  }
  return lines;
}

async function shippingRates(address: Record<string, string>, lines: PricedLine[]) {
  const manualLines = lines.filter(line => line.fulfillment_method !== "printful");
  let manualAmount = 0;
  for (const line of manualLines) {
    if (line.shipping_price == null || !Number.isFinite(line.shipping_price) || line.shipping_price < 0 || !line.shipping_countries.includes(address.country_code)) {
      throw new Error(`Shipping for ${line.product_name} is not available to this country yet.`);
    }
    manualAmount += Math.round(line.shipping_price * 100) * line.quantity;
  }
  const printfulLines = lines.filter(line => line.fulfillment_method === "printful");
  if (!printfulLines.length) return [{ id: "FSB_STANDARD", name: "Standard shipping", amount: manualAmount / 100, currency: "USD", min_delivery_days: null, max_delivery_days: null }];
  const rates = await printfulRates(address, printfulLines);
  return rates.map(rate => ({ ...rate, name: manualLines.length ? rate.name + " + other items (separate shipments)" : rate.name, amount: (Math.round(rate.amount * 100) + manualAmount) / 100,
    min_delivery_days: manualLines.length ? null : rate.min_delivery_days, max_delivery_days: manualLines.length ? null : rate.max_delivery_days }));
}

async function printfulRates(address: Record<string, string>, lines: PricedLine[]) {
  const token = Deno.env.get("PRINTFUL_API_TOKEN");
  if (!token) throw new Error("Printful checkout is not configured yet.");
  const result = await fetch("https://api.printful.com/shipping/rates", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: address,
      items: lines.map((line) => ({ variant_id: Number(line.printful_catalog_variant_id), quantity: line.quantity, value: line.unit_price.toFixed(2) })),
      currency: "USD", locale: "en_US",
    }),
  });
  const data = await result.json();
  if (!result.ok || data.code !== 200 || !Array.isArray(data.result)) {
    console.error("Printful rate quote failed", data.code || result.status);
    throw new Error("Printful could not calculate shipping for this address and bag. Check the address and product variants, then try again.");
  }
  const rates = data.result.filter((rate: Record<string, unknown>) =>
    typeof rate.id === "string" && Number(rate.rate) >= 0 && String(rate.currency || "").toUpperCase() === "USD"
  ).map((rate: Record<string, unknown>) => ({
    id: String(rate.id), name: String(rate.name || rate.id).slice(0, 120), amount: Number(rate.rate),
    currency: "USD", min_delivery_days: rate.minDeliveryDays ?? null, max_delivery_days: rate.maxDeliveryDays ?? null,
  }));
  if (!rates.length) throw new Error("Printful returned no USD shipping services for this address.");
  return rates;
}

function quoteId(value: unknown) { return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : ""; }

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.headers.get("origin") !== SITE_ORIGIN) return response({ error: "Origin is not allowed." }, 403);
  if (request.method !== "POST") return response({ error: "Use POST." }, 405);
  let createdOrderId: number | null = null;
  try {
    if (!supabaseUrl) throw new Error("Supabase URL is not configured.");
    const body = await request.json();
    if (body.action === "status") return response({ ...checkoutStatus(), provider: "stripe", fulfillment: "printful" });
    if (!checkoutStatus().enabled) return response({ error: "FSB checkout is not configured yet. No order or charge will be created." }, 503);
    const customer = await customerFromRequest(request);

    if (body.action === "quote") {
      const address = cleanAddress(body.address || {});
      const lines = await resolveCart(body.items);
      const rates = await shippingRates(address, lines);
      const quote = { address, lines, rates };
      const created = await rest("fsb_store_checkout_quotes?select=id,expires_at", {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ user_id: customer.id, quote, expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString() }),
      }) as Array<{ id: string; expires_at: string }>;
      if (!created[0]?.id) throw new Error("Could not save your shipping quote. Please try again.");
      return response({ quoteId: created[0].id, expiresAt: created[0].expires_at, rates });
    }

    if (body.action === "start") {
      const id = quoteId(body.quoteId);
      const rateId = typeof body.rateId === "string" ? body.rateId : "";
      if (!id || !rateId) return response({ error: "Choose a shipping option before continuing." }, 400);
      const quotes = await rest(`fsb_store_checkout_quotes?id=eq.${id}&user_id=eq.${customer.id}&consumed_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,quote,expires_at`) as Array<{ id: string; quote: { address: Record<string, string>; lines: PricedLine[]; rates: Array<Record<string, unknown>> }; expires_at: string }>;
      const saved = quotes[0];
      if (!saved) throw new Error("Your shipping quote expired. Please request new rates.");
      const freshLines = await resolveCart(saved.quote.lines.map(line => ({ id: line.product_id, size: line.variant_size || "", color: line.variant_color || "", quantity: line.quantity })));
      if (JSON.stringify(freshLines) !== JSON.stringify(saved.quote.lines)) throw new Error("An item changed. Request new shipping options.");
      const currentRates = await shippingRates(saved.quote.address, freshLines);
      const rate = currentRates.find((item) => item.id === rateId);
      const quotedRate = saved.quote.rates.find(item => item.id === rateId);
      if (rate && (!quotedRate || Math.round(Number(quotedRate.amount) * 100) !== Math.round(rate.amount * 100))) throw new Error("Shipping rates changed. Request new shipping options.");
      if (!rate) throw new Error("That shipping option is no longer available. Request new rates.");
      const claim = await rest(`fsb_store_checkout_quotes?id=eq.${id}&user_id=eq.${customer.id}&consumed_at=is.null&select=id`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ consumed_at: new Date().toISOString() }) }) as Array<{ id: string }>;
      if (!claim.length) throw new Error("This shipping quote was already used. Request new shipping options.");
      const subtotal = saved.quote.lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
      const total = subtotal + Number(rate.amount);
      const orderNumber = `FSB-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const orderRows = await rest("fsb_store_orders?select=id,order_number", {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ order_number: orderNumber, customer_email: customer.email, customer_name: saved.quote.address.name, currency: "usd", subtotal: subtotal.toFixed(2), shipping_total: Number(rate.amount).toFixed(2), tax_total: "0.00", grand_total: total.toFixed(2), payment_status: "pending", fulfillment_status: "unfulfilled", payment_provider: "stripe", shipping_address: { ...saved.quote.address, carrier: saved.quote.lines.every(line => line.fulfillment_method === "printful") ? "Printful" : "FSB / suppliers", service: rate.name, rate_id: rate.id }, user_id: customer.id, checkout_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() }),
      }) as Array<{ id: number; order_number: string }>;
      const order = orderRows[0];
      if (!order?.id) throw new Error("Could not create your order.");
      createdOrderId = order.id;
      const itemRows = await rest("fsb_store_order_items", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify(saved.quote.lines.map((line) => ({ order_id: order.id, product_id: line.product_id, product_name: line.product_name, product_image: line.product_image, variant_size: line.variant_size, variant_color: line.variant_color, quantity: line.quantity, unit_price: line.unit_price.toFixed(2), fulfillment_method: line.fulfillment_method, supplier_name: line.supplier_name, printful_variant_id: line.printful_variant_id || null, fulfillment_status: "unfulfilled" }))),
      });
      void itemRows;
      await rest("rpc/fsb_store_inventory", { method: "POST", body: JSON.stringify({ order_id_input: order.id, action_input: "reserve" }) });
      const stripeSecret = (Deno.env.get("MERCH_STRIPE_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY"))!;
      // Isolate the quoted delivery address per order so another browser checkout cannot overwrite it.
      const address = saved.quote.address;
      const customerForm = new URLSearchParams({ email: customer.email, name: address.name, "shipping[name]": address.name });
      for (const [field, value] of Object.entries({ line1: address.address1, line2: address.address2, city: address.city, state: address.state_code, postal_code: address.zip, country: address.country_code })) {
        if (value) customerForm.set(`shipping[address][${field}]`, value);
      }
      customerForm.set("metadata[fsb_order_id]", String(order.id));
      const stripeCustomerResult = await fetch("https://api.stripe.com/v1/customers", { method: "POST", headers: { Authorization: `Bearer ${stripeSecret}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `fsb-merch-customer-${order.id}` }, body: customerForm });
      const stripeCustomer = await stripeCustomerResult.json();
      if (!stripeCustomerResult.ok || !stripeCustomer.id) throw new Error("Stripe could not prepare your delivery address. No payment was taken.");
      const form = new URLSearchParams();
      form.set("mode", "payment");
      form.set("payment_intent_data[receipt_email]", customer.email);
      form.set("payment_intent_data[metadata][order_id]", String(order.id));
      form.set("payment_intent_data[metadata][order_type]", "merch");
      form.set("customer", String(stripeCustomer.id));
      form.set("customer_update[address]", "auto");
      form.set("automatic_tax[enabled]", "true");
      form.set("billing_address_collection", "required");
      form.set("success_url", `${SITE_ORIGIN}${SITE_PATH}?store_order=${order.id}&stripe_session={CHECKOUT_SESSION_ID}`);
      form.set("cancel_url", `${SITE_ORIGIN}${SITE_PATH}?checkout_cancelled=1`);
      form.set("expires_at", String(Math.floor(Date.now() / 1000) + 30 * 60));
      form.set("client_reference_id", String(order.id));
      form.set("metadata[order_id]", String(order.id));
      form.set("metadata[order_type]", "merch");
      saved.quote.lines.forEach((line, index) => {
        form.set(`line_items[${index}][price_data][currency]`, "usd");
        form.set(`line_items[${index}][price_data][unit_amount]`, String(Math.round(line.unit_price * 100)));
        form.set(`line_items[${index}][price_data][product_data][name]`, `${line.product_name}${line.variant_size || line.variant_color ? ` (${[line.variant_size, line.variant_color].filter(Boolean).join(" / ")})` : ""}`.slice(0, 200));
        form.set(`line_items[${index}][quantity]`, String(line.quantity));
      });
      form.set("shipping_options[0][shipping_rate_data][type]", "fixed_amount");
      form.set("shipping_options[0][shipping_rate_data][fixed_amount][amount]", String(Math.round(rate.amount * 100)));
      form.set("shipping_options[0][shipping_rate_data][fixed_amount][currency]", "usd");
      form.set("shipping_options[0][shipping_rate_data][display_name]", rate.name.slice(0, 100));
      form.set("shipping_options[0][shipping_rate_data][tax_behavior]", "exclusive");
      const checkoutResult = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${stripeSecret}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `fsb-merch-session-${order.id}` }, body: form });
      const checkout = await checkoutResult.json();
      if (!checkoutResult.ok || !checkout.id || !checkout.url) {
        await rest(`fsb_store_orders?id=eq.${order.id}`, { method: "PATCH", body: JSON.stringify({ payment_status: "failed", fulfillment_status: "cancelled" }) });
        throw new Error("Stripe could not start checkout. No payment was taken.");
      }
      await rest(`fsb_store_orders?id=eq.${order.id}`, { method: "PATCH", body: JSON.stringify({ stripe_session_id: checkout.id, payment_reference: checkout.id }) });
      await rest(`fsb_store_checkout_quotes?id=eq.${id}&user_id=eq.${customer.id}&consumed_at=is.null`, { method: "PATCH", body: JSON.stringify({ consumed_at: new Date().toISOString() }) });
      return response({ checkoutUrl: checkout.url });
    }

    return response({ error: "Unknown checkout action." }, 400);
  } catch (error) {
    if (createdOrderId) {
      try {
        await rest("rpc/fsb_store_inventory", { method: "POST", body: JSON.stringify({ order_id_input: createdOrderId, action_input: "release" }) });
        await rest(`fsb_store_orders?id=eq.${createdOrderId}&payment_status=eq.pending`, { method: "PATCH", body: JSON.stringify({ payment_status: "failed", fulfillment_status: "cancelled" }) });
      } catch (_) { console.error("Checkout cleanup needs attention", createdOrderId); }
    }
    const message = error instanceof Error ? error.message : "Checkout could not be prepared.";
    if (/not configured/i.test(message)) return response({ error: message }, 503);
    return response({ error: message }, 400);
  }
});

