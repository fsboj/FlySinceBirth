import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SITE_ORIGIN = "https://fsboj.github.io";
const SITE_PATH = "/FlySinceBirth/merch.html";
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

function checkoutEnabled() {
  const stripe = Deno.env.get("STRIPE_SECRET_KEY") || "";
  const webhook = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
  const printful = Deno.env.get("PRINTFUL_API_TOKEN") || "";
  const test = stripe.startsWith("sk_test_");
  const live = stripe.startsWith("sk_live_") && Deno.env.get("MERCH_LIVE_CHECKOUT_ENABLED") === "true";
  return Deno.env.get("MERCH_CHECKOUT_ENABLED") === "true" && !!webhook && !!printful && (test || live);
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
  printful_variant_id: string;
};

async function resolveCart(raw: unknown): Promise<PricedLine[]> {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 20) throw new Error("Your bag is empty or has too many different items.");
  const items = raw as CartInput[];
  const ids = [...new Set(items.map((item) => Number(item.id)))];
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 1)) throw new Error("The bag contains an invalid item.");
  const rows = await rest(`merch_products?id=in.(${ids.join(",")})&active=eq.true&select=id,name,price,images,sizes,colors,variants,fulfillment_method,printful_variant_id`) as Array<Record<string, unknown>>;
  const products = new Map(rows.map((product) => [Number(product.id), product]));
  if (products.size !== ids.length) throw new Error("An item in your bag is no longer available.");
  const lines: PricedLine[] = [];
  for (const item of items) {
    const product = products.get(Number(item.id))!;
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new Error("Choose a quantity from 1 to 10 for each item.");
    if (product.fulfillment_method !== "printful") throw new Error("This bag includes an item whose shipping is not set up yet. Remove it and try again later.");
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
    if (!/^[0-9]{1,20}$/.test(variantId)) throw new Error(`The Printful variant for ${String(product.name)}${size ? ` (${size}${color ? `, ${color}` : ""})` : ""} has not been configured in Admin.`);
    const images = Array.isArray(product.images) ? product.images as unknown[] : [];
    const price = Number(product.price);
    if (!Number.isFinite(price) || price <= 0) throw new Error(`The price for ${String(product.name)} is not valid.`);
    lines.push({
      product_id: Number(product.id), product_name: String(product.name), product_image: images.length ? String(images[0]) : null,
      variant_size: size || null, variant_color: color || null, quantity, unit_price: price,
      fulfillment_method: "printful", printful_variant_id: variantId,
    });
  }
  return lines;
}

async function printfulRates(address: Record<string, string>, lines: PricedLine[]) {
  const token = Deno.env.get("PRINTFUL_API_TOKEN");
  if (!token) throw new Error("Printful checkout is not configured yet.");
  const result = await fetch("https://api.printful.com/shipping/rates", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: address,
      items: lines.map((line) => ({ variant_id: Number(line.printful_variant_id), quantity: line.quantity, value: line.unit_price.toFixed(2) })),
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
  try {
    if (!supabaseUrl) throw new Error("Supabase URL is not configured.");
    const body = await request.json();
    if (body.action === "status") return response({ enabled: checkoutEnabled(), provider: "stripe", fulfillment: "printful" });
    if (!checkoutEnabled()) return response({ error: "FSB checkout is not configured yet. No order or charge will be created." }, 503);
    const customer = await customerFromRequest(request);

    if (body.action === "quote") {
      const address = cleanAddress(body.address || {});
      const lines = await resolveCart(body.items);
      const rates = await printfulRates(address, lines);
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
      const currentRates = await printfulRates(saved.quote.address, saved.quote.lines);
      const rate = currentRates.find((item) => item.id === rateId);
      if (!rate) throw new Error("That shipping option is no longer available. Request new rates.");
      const subtotal = saved.quote.lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
      const total = subtotal + Number(rate.amount);
      const orderNumber = `FSB-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const orderRows = await rest("fsb_store_orders?select=id,order_number", {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ order_number: orderNumber, customer_email: customer.email, currency: "usd", subtotal: subtotal.toFixed(2), shipping_total: Number(rate.amount).toFixed(2), tax_total: "0.00", grand_total: total.toFixed(2), payment_status: "pending", fulfillment_status: "unfulfilled", payment_provider: "stripe", shipping_address: { ...saved.quote.address, carrier: "Printful", service: rate.name, rate_id: rate.id }, user_id: customer.id, checkout_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() }),
      }) as Array<{ id: number; order_number: string }>;
      const order = orderRows[0];
      if (!order?.id) throw new Error("Could not create your order.");
      const itemRows = await rest("fsb_store_order_items", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify(saved.quote.lines.map((line) => ({ order_id: order.id, product_id: line.product_id, product_name: line.product_name, product_image: line.product_image, variant_size: line.variant_size, variant_color: line.variant_color, quantity: line.quantity, unit_price: line.unit_price.toFixed(2), fulfillment_method: "printful", printful_variant_id: line.printful_variant_id, fulfillment_status: "unfulfilled" }))),
      });
      void itemRows;
      const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY")!;
      const form = new URLSearchParams();
      form.set("mode", "payment");
      form.set("customer_email", customer.email);
      form.set("automatic_tax[enabled]", "true");
      form.set("success_url", `${SITE_ORIGIN}${SITE_PATH}?store_order=${order.id}&stripe_session={CHECKOUT_SESSION_ID}`);
      form.set("cancel_url", `${SITE_ORIGIN}${SITE_PATH}?checkout_cancelled=1`);
      form.set("expires_at", String(Math.floor(Date.now() / 1000) + 30 * 60));
      form.set("client_reference_id", String(order.id));
      form.set("metadata[order_id]", String(order.id));
      saved.quote.lines.forEach((line, index) => {
        form.set(`line_items[${index}][price_data][currency]`, "usd");
        form.set(`line_items[${index}][price_data][unit_amount]`, String(Math.round(line.unit_price * 100)));
        form.set(`line_items[${index}][price_data][product_data][name]`, `${line.product_name}${line.variant_size || line.variant_color ? ` (${[line.variant_size, line.variant_color].filter(Boolean).join(" / ")})` : ""}`.slice(0, 200));
        form.set(`line_items[${index}][quantity]`, String(line.quantity));
      });
      const shippingIndex = saved.quote.lines.length;
      form.set(`line_items[${shippingIndex}][price_data][currency]`, "usd");
      form.set(`line_items[${shippingIndex}][price_data][unit_amount]`, String(Math.round(Number(rate.amount) * 100)));
      form.set(`line_items[${shippingIndex}][price_data][product_data][name]`, `Shipping — ${rate.name}`.slice(0, 200));
      form.set(`line_items[${shippingIndex}][quantity]`, "1");
      const checkoutResult = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${stripeSecret}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form });
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
    const message = error instanceof Error ? error.message : "Checkout could not be prepared.";
    if (/not configured/i.test(message)) return response({ error: message }, 503);
    return response({ error: message }, 400);
  }
});

