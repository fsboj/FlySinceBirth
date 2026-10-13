import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

function serviceKey(): { key: string; isSecretKey: boolean } {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const value = JSON.parse(secretKeys).default;
      if (typeof value === "string" && value.startsWith("sb_secret_")) return { key: value, isSecretKey: true };
    } catch (_) {
      console.error("SUPABASE_SECRET_KEYS is not valid JSON.");
    }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return { key: legacy, isSecretKey: false };
  throw new Error("Supabase server credentials are unavailable.");
}

const credentials = serviceKey();

async function rest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("apikey", credentials.key);
  if (!credentials.isSecretKey) headers.set("Authorization", `Bearer ${credentials.key}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const result = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers });
  const text = await result.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!result.ok) throw new Error("Ticket database update failed.");
  return data;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

function fromHex(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  return new Uint8Array(hex.match(/.{2}/g)!.map((part) => parseInt(part, 16)));
}

async function validStripeSignature(payload: string, signature: string): Promise<boolean> {
  if (!webhookSecret) return false;
  const parts = signature.split(",").map((part) => part.split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value || "");
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(webhookSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`)));
  return signatures.some((signatureHex) => {
    const candidate = fromHex(signatureHex);
    return candidate !== null && equalBytes(candidate, expected);
  });
}

async function loadOrder(orderId: string) {
  const rows = await rest(`event_ticket_orders?id=eq.${encodeURIComponent(orderId)}&select=id,unit_price,quantity,provider,provider_reference,status`) as Record<string, unknown>[];
  return rows[0] || null;
}

async function updateOrder(orderId: string, sessionId: string, patch: Record<string, unknown>) {
  await rest(`event_ticket_orders?id=eq.${encodeURIComponent(orderId)}&provider=eq.stripe&provider_reference=eq.${encodeURIComponent(sessionId)}&status=eq.pending`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!supabaseUrl || !webhookSecret) return new Response("Webhook is not configured", { status: 503 });
  const payload = await request.text();
  if (!await validStripeSignature(payload, request.headers.get("stripe-signature") || "")) {
    return new Response("Invalid Stripe signature", { status: 400 });
  }

  try {
    const event = JSON.parse(payload);
    const session = event.data?.object;
    if (!session || typeof session.id !== "string") return Response.json({ received: true });
    if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired'].includes(event.type)) {
      return Response.json({ received: true });
    }
    const orderId = String(session.metadata?.order_id || session.client_reference_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return new Response("Invalid ticket order reference", { status: 400 });
    const order = await loadOrder(orderId);
    if (!order || order.provider !== "stripe" || order.provider_reference !== session.id) {
      return new Response("Ticket order reference did not match", { status: 400 });
    }
    if (event.type === "checkout.session.expired") {
      await updateOrder(orderId, session.id, { status: "expired" });
      return Response.json({ received: true });
    }
    const expectedCents = Math.round(Number(order.unit_price) * 100) * Number(order.quantity);
    if (session.payment_status !== "paid" || session.amount_total !== expectedCents || session.currency !== "usd") {
      return new Response("Payment details did not match ticket order", { status: 400 });
    }
    if (order.status === "pending") {
      await updateOrder(orderId, session.id, { status: "paid", paid_at: new Date().toISOString() });
    }
    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe ticket webhook error:", error);
    return new Response("Webhook processing failed", { status: 500 });
  }
});

