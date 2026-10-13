import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SITE_ORIGIN = "https://fsboj.github.io";
const SITE_PATH = "/FlySinceBirth/events.html";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": SITE_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function serviceKey(): string {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys);
      const value = parsed.default;
      if (typeof value === "string" && value.startsWith("sb_secret_")) return value;
    } catch (_) {
      console.error("SUPABASE_SECRET_KEYS is not valid JSON.");
    }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("Supabase server credentials are unavailable.");
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const apiKey = serviceKey();
const usesSecretKey = apiKey.startsWith("sb_secret_");

async function rest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("apikey", apiKey);
  // New secret keys are not JWTs and must not be sent as Bearer tokens.
  if (!usesSecretKey) headers.set("Authorization", `Bearer ${apiKey}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const result = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers });
  const text = await result.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!result.ok) {
    const message = typeof data === "object" && data && "message" in data
      ? String((data as { message: unknown }).message)
      : "Database request failed.";
    throw new Error(message);
  }
  return data;
}

function isEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function configuredProviders() {
  const providers: string[] = [];
  if (Deno.env.get("STRIPE_SECRET_KEY") && Deno.env.get("STRIPE_WEBHOOK_SECRET")) providers.push("stripe");
  if (Deno.env.get("PAYPAL_CLIENT_ID") && Deno.env.get("PAYPAL_CLIENT_SECRET")) providers.push("paypal");
  return providers;
}

async function loadEvent(eventId: number) {
  const rows = await rest(
    `events?id=eq.${eventId}&select=id,title,date,location,link,ticket_sales_mode,ticket_price,ticket_capacity,ticket_providers`,
  ) as Record<string, unknown>[];
  return rows[0] || null;
}

async function loadOrder(orderId: string) {
  const rows = await rest(
    `event_ticket_orders?id=eq.${encodeURIComponent(orderId)}&select=id,event_id,buyer_email,quantity,unit_price,provider,provider_reference,status,ticket_code,expires_at`,
  ) as Record<string, unknown>[];
  return rows[0] || null;
}

async function updateOrder(orderId: string, patch: Record<string, unknown>, providerReference?: string) {
  const filters = [`id=eq.${encodeURIComponent(orderId)}`];
  if (patch.status === "paid") filters.push("status=eq.pending");
  if (providerReference) filters.push(`provider_reference=eq.${encodeURIComponent(providerReference)}`);
  const rows = await rest(
    `event_ticket_orders?${filters.join("&")}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    },
  ) as Record<string, unknown>[];
  return rows[0] || null;
}

function safeTicketOrder(order: Record<string, unknown>) {
  return {
    id: order.id,
    event_id: order.event_id,
    quantity: order.quantity,
    unit_price: order.unit_price,
    ticket_code: order.ticket_code,
    status: order.status,
  };
}

async function paypalToken() {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
  const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("PayPal checkout is not configured yet.");
  const base = Deno.env.get("PAYPAL_ENV") === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
  const auth = btoa(`${clientId}:${clientSecret}`);
  const result = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const data = await result.json();
  if (!result.ok || !data.access_token) throw new Error("PayPal could not authorize checkout.");
  return { base, accessToken: String(data.access_token) };
}

async function confirmStripe(order: Record<string, unknown>, sessionId: string) {
  const secret = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secret) throw new Error("Stripe checkout is not configured yet.");
  if (order.provider !== "stripe" || order.provider_reference !== sessionId) {
    throw new Error("The Stripe session does not match this ticket order.");
  }
  if (order.status === "paid") return safeTicketOrder(order);
  const result = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const session = await result.json();
  if (!result.ok || session.metadata?.order_id !== order.id) {
    throw new Error("Stripe could not verify this checkout session.");
  }
  const expectedCents = Math.round(Number(order.unit_price) * 100) * Number(order.quantity);
  if (session.payment_status !== "paid" || session.amount_total !== expectedCents || session.currency !== "usd") {
    throw new Error("Stripe has not confirmed payment for these tickets.");
  }
  const updated = await updateOrder(String(order.id), { status: "paid", paid_at: new Date().toISOString() }, sessionId);
  const confirmed = updated || await loadOrder(String(order.id));
  if (!confirmed || confirmed.status !== "paid") throw new Error("Ticket confirmation is still processing. Refresh this page shortly.");
  return safeTicketOrder(confirmed);
}

async function confirmPayPal(order: Record<string, unknown>, paypalOrderId: string) {
  if (order.provider !== "paypal" || order.provider_reference !== paypalOrderId) {
    throw new Error("The PayPal order does not match this ticket order.");
  }
  if (order.status === "paid") return safeTicketOrder(order);
  const { base, accessToken } = await paypalToken();
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const currentResult = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, { headers });
  let paypalOrder = await currentResult.json();
  if (!currentResult.ok) throw new Error("PayPal could not verify this order.");
  if (paypalOrder.status === "APPROVED") {
    const captureResult = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
      method: "POST",
      headers: { ...headers, "PayPal-Request-Id": `capture-${String(order.id)}` },
      body: "{}",
    });
    paypalOrder = await captureResult.json();
    if (!captureResult.ok && paypalOrder.status !== "COMPLETED") throw new Error("PayPal could not capture this payment.");
  }
  const unit = paypalOrder.purchase_units?.find((item: Record<string, unknown>) => item.custom_id === order.id);
  const captures = unit?.payments?.captures || [];
  const capturedAmount = captures.reduce((sum: number, capture: Record<string, unknown>) => {
    return sum + Number((capture.amount as Record<string, unknown> | undefined)?.value || 0);
  }, 0);
  const expectedAmount = Number(order.unit_price) * Number(order.quantity);
  if (paypalOrder.status !== "COMPLETED" || !unit || Math.abs(capturedAmount - expectedAmount) > 0.005 ||
      captures.some((capture: Record<string, unknown>) => (capture.amount as Record<string, unknown>)?.currency_code !== "USD")) {
    throw new Error("PayPal has not confirmed payment for these tickets.");
  }
  const updated = await updateOrder(String(order.id), { status: "paid", paid_at: new Date().toISOString() }, paypalOrderId);
  const confirmed = updated || await loadOrder(String(order.id));
  if (!confirmed || confirmed.status !== "paid") throw new Error("Ticket confirmation is still processing. Refresh this page shortly.");
  return safeTicketOrder(confirmed);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.headers.get("origin") !== SITE_ORIGIN) return response({ error: "Origin is not allowed." }, 403);
  if (request.method !== "POST") return response({ error: "Use POST." }, 405);

  try {
    if (!supabaseUrl) throw new Error("Supabase URL is not configured.");
    const body = await request.json();
    if (body.action === "status") {
      const eventId = Number(body.eventId);
      if (!Number.isSafeInteger(eventId) || eventId < 1) return response({ error: "Invalid event." }, 400);
      const event = await loadEvent(eventId);
      if (!event) return response({ error: "Event not found." }, 404);
      const availableProviders = configuredProviders().filter((provider) =>
        Array.isArray(event.ticket_providers) && event.ticket_providers.includes(provider)
      );
      const reserved = Number(await rest(`rpc/event_ticket_reserved_count`, {
        method: "POST",
        body: JSON.stringify({ p_event_id: eventId }),
      }));
      const remaining = event.ticket_capacity == null ? null : Math.max(0, Number(event.ticket_capacity) - reserved);
      return response({
        ticket_sales_mode: event.ticket_sales_mode,
        ticket_price: event.ticket_price,
        ticket_capacity: event.ticket_capacity,
        remaining,
        providers: availableProviders,
      });
    }

    if (body.action === "start") {
      const eventId = Number(body.eventId);
      const quantity = Number(body.quantity);
      const email = isEmail(body.email) ? body.email.trim() : "";
      const provider = body.provider === "stripe" || body.provider === "paypal" ? body.provider : "";
      if (!Number.isSafeInteger(eventId) || eventId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 10 || !email || !provider) {
        return response({ error: "Check your email, ticket quantity, and payment method." }, 400);
      }
      if (!configuredProviders().includes(provider)) return response({ error: `${provider} checkout is not configured yet.` }, 503);
      const event = await loadEvent(eventId);
      if (!event || event.ticket_sales_mode !== "on_site" || !Number(event.ticket_price)) {
        return response({ error: "On-site ticket sales are not enabled for this event." }, 409);
      }
      const created = await rest("rpc/reserve_event_ticket_order", {
        method: "POST",
        body: JSON.stringify({ p_event_id: eventId, p_quantity: quantity, p_buyer_email: email, p_provider: provider }),
      }) as Record<string, unknown>[];
      const order = Array.isArray(created) ? created[0] : created;
      if (!order?.id) throw new Error("Could not reserve tickets for checkout.");
      const total = (Number(order.unit_price) * Number(order.quantity)).toFixed(2);
      const returnUrl = `${SITE_ORIGIN}${SITE_PATH}`;

      try {
        if (provider === "stripe") {
          const secret = Deno.env.get("STRIPE_SECRET_KEY");
          if (!secret) throw new Error("Stripe checkout is not configured yet.");
          const form = new URLSearchParams();
          form.set("mode", "payment");
          form.set("success_url", `${returnUrl}?ticket_order=${order.id}&stripe_session={CHECKOUT_SESSION_ID}`);
          form.set("cancel_url", `${returnUrl}?ticket_cancelled=${order.id}`);
          form.set("customer_email", email);
          // Keep the provider checkout just ahead of the one-hour inventory reservation.
          form.set("expires_at", String(Math.floor(Date.now() / 1000) + 3480));
          form.set("client_reference_id", String(order.id));
          form.set("metadata[order_id]", String(order.id));
          form.set("line_items[0][price_data][currency]", "usd");
          form.set("line_items[0][price_data][unit_amount]", String(Math.round(Number(order.unit_price) * 100)));
          form.set("line_items[0][price_data][product_data][name]", `${String(event.title)} ticket`);
          form.set("line_items[0][quantity]", String(order.quantity));
          const checkoutResult = await fetch("https://api.stripe.com/v1/checkout/sessions", {
            method: "POST",
            headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
            body: form,
          });
          const checkout = await checkoutResult.json();
          if (!checkoutResult.ok || !checkout.url || !checkout.id) throw new Error("Stripe could not start checkout.");
          await updateOrder(String(order.id), { provider_reference: checkout.id });
          return response({ checkoutUrl: checkout.url, provider });
        }

        const { base, accessToken } = await paypalToken();
        const paypalResult = await fetch(`${base}/v2/checkout/orders`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "PayPal-Request-Id": String(order.id),
          },
          body: JSON.stringify({
            intent: "CAPTURE",
            purchase_units: [{
              reference_id: String(order.id),
              custom_id: String(order.id),
              description: `${String(event.title)} (${quantity} ticket${quantity === 1 ? "" : "s"})`,
              amount: { currency_code: "USD", value: total },
            }],
            application_context: {
              return_url: `${returnUrl}?ticket_order=${order.id}&provider=paypal`,
              cancel_url: `${returnUrl}?ticket_cancelled=${order.id}`,
              user_action: "PAY_NOW",
            },
          }),
        });
        const paypalOrder = await paypalResult.json();
        const approvalUrl = paypalOrder.links?.find((link: Record<string, unknown>) => link.rel === "approve")?.href;
        if (!paypalResult.ok || !paypalOrder.id || !approvalUrl) throw new Error("PayPal could not start checkout.");
        await updateOrder(String(order.id), { provider_reference: paypalOrder.id });
        return response({ checkoutUrl: approvalUrl, provider });
      } catch (error) {
        await updateOrder(String(order.id), { status: "failed" });
        throw error;
      }
    }

    if (body.action === "confirm") {
      const orderId = typeof body.orderId === "string" ? body.orderId : "";
      if (!/^[0-9a-f-]{36}$/i.test(orderId)) return response({ error: "Invalid ticket order." }, 400);
      const order = await loadOrder(orderId);
      if (!order) return response({ error: "Ticket order not found." }, 404);
      if (order.status === "paid") return response({ order: safeTicketOrder(order) });
      if (new Date(String(order.expires_at)).getTime() < Date.now()) {
        await updateOrder(orderId, { status: "expired" });
        return response({ error: "This checkout expired. Please start again." }, 410);
      }
      const confirmed = order.provider === "stripe"
        ? await confirmStripe(order, String(body.sessionId || ""))
        : order.provider === "paypal"
        ? await confirmPayPal(order, String(body.paypalOrderId || ""))
        : null;
      if (!confirmed) return response({ error: "Payment provider is not supported." }, 400);
      return response({ order: confirmed });
    }

    return response({ error: "Unknown checkout action." }, 400);
  } catch (error) {
    console.error("Event ticket checkout error:", error);
    const message = error instanceof Error ? error.message : "Ticket checkout failed.";
    if (message.includes("Not enough tickets remain")) return response({ error: message }, 409);
    if (message.includes("not configured")) return response({ error: message }, 503);
    return response({ error: message }, 400);
  }
});

