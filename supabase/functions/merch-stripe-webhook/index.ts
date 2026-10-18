import "jsr:@supabase/functions-js/edge-runtime.d.ts";

function serviceKey(): { key: string; secret: boolean } {
  const bundle = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (bundle) { try { const key = JSON.parse(bundle).default; if (typeof key === "string" && key.startsWith("sb_secret_")) return { key, secret: true }; } catch (_) { /* try legacy */ } }
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (key) return { key, secret: false };
  throw new Error("Supabase server credentials are unavailable.");
}

async function rest(path: string, init: RequestInit = {}) {
  const credentials = serviceKey();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", credentials.key);
  if (!credentials.secret) headers.set("Authorization", `Bearer ${credentials.key}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const result = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/${path}`, { ...init, headers });
  const text = await result.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!result.ok) throw new Error("Store order database update failed.");
  return data;
}

function equalBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}
function fromHex(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  return new Uint8Array(hex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)));
}
async function validSignature(payload: string, signature: string) {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return false;
  const parts = signature.split(",").map((part) => part.split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value || "");
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`)));
  return signatures.some((value) => { const candidate = fromHex(value); return !!candidate && equalBytes(candidate, expected); });
}

async function submitPrintfulOrder(order: Record<string, unknown>) {
  const token = Deno.env.get("PRINTFUL_API_TOKEN");
  if (!token) throw new Error("Printful is not configured.");
  const claimed = await rest(`fsb_store_orders?id=eq.${order.id}&payment_status=eq.paid&fulfillment_status=eq.unfulfilled&select=id`, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ fulfillment_status: "processing", updated_at: new Date().toISOString() }),
  }) as Array<{ id: number }>;
  if (!claimed.length) return;
  const items = await rest(`fsb_store_order_items?order_id=eq.${order.id}&select=product_name,quantity,unit_price,printful_variant_id`) as Array<Record<string, unknown>>;
  if (!items.length || items.some((item) => !/^\d{1,20}$/.test(String(item.printful_variant_id || "")))) {
    throw new Error("Store order has an unmapped Printful variant.");
  }
  const address = order.shipping_address as Record<string, unknown>;
  const body = {
    external_id: String(order.order_number),
    shipping: String(address.rate_id || "STANDARD"),
    recipient: {
      name: address.name, address1: address.address1, address2: address.address2 || "", city: address.city,
      state_code: address.state_code || "", country_code: address.country_code, zip: address.zip, phone: address.phone || "",
      email: order.customer_email,
    },
    items: items.map((item) => ({ variant_id: Number(item.printful_variant_id), quantity: Number(item.quantity), retail_price: Number(item.unit_price).toFixed(2) })),
  };
  const result = await fetch("https://api.printful.com/orders?confirm=1&update_existing=true", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await result.json();
  if (!result.ok || data.code !== 200 || !data.result?.id) {
    console.error("Printful order submission failed", data.code || result.status);
    await rest(`fsb_store_orders?id=eq.${order.id}&fulfillment_status=eq.processing`, { method: "PATCH", body: JSON.stringify({ fulfillment_status: "unfulfilled", updated_at: new Date().toISOString() }) });
    throw new Error("Printful could not accept the paid order yet.");
  }
  await rest(`fsb_store_orders?id=eq.${order.id}`, { method: "PATCH", body: JSON.stringify({ printful_order_id: String(data.result.id), fulfillment_status: "processing", updated_at: new Date().toISOString() }) });
  await rest(`fsb_store_order_items?order_id=eq.${order.id}`, { method: "PATCH", body: JSON.stringify({ supplier_order_id: String(data.result.id), fulfillment_status: "processing" }) });
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const payload = await request.text();
  if (!await validSignature(payload, request.headers.get("stripe-signature") || "")) return new Response("Invalid Stripe signature", { status: 400 });
  try {
    const event = JSON.parse(payload);
    if (!["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.expired"].includes(event.type)) return Response.json({ received: true });
    const session = event.data?.object;
    const orderId = String(session?.metadata?.order_id || session?.client_reference_id || "");
    if (!/^\d+$/.test(orderId) || !session?.id) return new Response("Invalid store order reference", { status: 400 });
    const rows = await rest(`fsb_store_orders?id=eq.${encodeURIComponent(orderId)}&select=id,order_number,customer_email,subtotal,shipping_total,tax_total,grand_total,payment_status,payment_provider,payment_reference,stripe_session_id,shipping_address,printful_order_id,fulfillment_status`) as Array<Record<string, unknown>>;
    const order = rows[0];
    if (!order || order.payment_provider !== "stripe" || (order.stripe_session_id !== session.id && order.payment_reference !== session.id)) return new Response("Store order reference did not match", { status: 400 });
    if (event.type === "checkout.session.expired") {
      if (order.payment_status === "pending") await rest(`fsb_store_orders?id=eq.${orderId}&payment_status=eq.pending`, { method: "PATCH", body: JSON.stringify({ payment_status: "failed", fulfillment_status: "cancelled", updated_at: new Date().toISOString() }) });
      return Response.json({ received: true });
    }
    const expectedSubtotal = Math.round((Number(order.subtotal) + Number(order.shipping_total)) * 100);
    if (session.payment_status !== "paid" || session.currency !== "usd" || Number(session.amount_subtotal) < expectedSubtotal || Number(session.amount_total) < expectedSubtotal) return new Response("Payment details did not match store order", { status: 400 });
    const tax = Number(session.total_details?.amount_tax || 0) / 100;
    await rest(`fsb_store_orders?id=eq.${orderId}&payment_status=eq.pending`, { method: "PATCH", body: JSON.stringify({ payment_status: "paid", tax_total: tax.toFixed(2), grand_total: (Number(session.amount_total) / 100).toFixed(2), updated_at: new Date().toISOString() }) });
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
    if (stripeKey.startsWith("sk_live_") && Deno.env.get("MERCH_LIVE_CHECKOUT_ENABLED") === "true" && !order.printful_order_id) await submitPrintfulOrder({ ...order, payment_status: "paid" });
    return Response.json({ received: true });
  } catch (error) {
    console.error("Store payment webhook failed:", error instanceof Error ? error.message : "unknown error");
    return new Response("Store payment confirmation is processing. Stripe will retry.", { status: 500 });
  }
});

