import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SITE_ORIGIN = "https://fsboj.github.io";
const RETURN_URL = `${SITE_ORIGIN}/FlySinceBirth/account.html`;
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

function supabaseServerKey(): string {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const value = JSON.parse(secretKeys).default;
      if (typeof value === "string" && value.startsWith("sb_secret_")) return value;
    } catch (_) {
      console.error("Supabase secret key configuration is invalid.");
    }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("Supabase server credentials are unavailable.");
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serverKey = supabaseServerKey();
const usesSecretKey = serverKey.startsWith("sb_secret_");

async function supabaseRest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("apikey", serverKey);
  if (!usesSecretKey) headers.set("Authorization", `Bearer ${serverKey}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const result = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers });
  const text = await result.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!result.ok) throw new Error("Could not securely load your payment profile.");
  return data;
}

async function authenticatedUser(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const publishableKey = request.headers.get("apikey");
  if (!token || !publishableKey || !supabaseUrl) throw new Error("Sign in to your FSB account first.");
  const result = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
  });
  if (!result.ok) throw new Error("Your sign-in expired. Sign in again.");
  const user = await result.json();
  if (!user.id || !user.email || user.email_confirmed_at == null) {
    throw new Error("Confirm your account email before managing payment methods.");
  }
  const payload = token.split(".")[1];
  let claims: Record<string, unknown> = {};
  try { claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))); } catch (_) {
    throw new Error("Your sign-in could not be verified. Sign in again.");
  }
  if (claims.aal !== "aal2") {
    const factorsResponse = await fetch(`${supabaseUrl}/auth/v1/factors`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
    });
    if (!factorsResponse.ok) throw new Error("Could not verify your two-step security status.");
    const factors = await factorsResponse.json();
    if ((factors.totp || []).some((factor: Record<string, unknown>) => factor.status === "verified")) {
      throw new Error("Complete two-step verification before managing your payment methods. Sign out and sign in again.");
    }
  }
  return { id: String(user.id), email: String(user.email), name: String(user.user_metadata?.display_name || "") };
}

function stripeSecret(): string {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Stripe card management is not configured yet. Contact FSB Support.");
  return key;
}

async function stripeRequest(path: string, init: RequestInit = {}) {
  const secret = stripeSecret();
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${secret}`);
  if (init.body) headers.set("Content-Type", "application/x-www-form-urlencoded");
  const result = await fetch(`https://api.stripe.com/v1/${path}`, { ...init, headers });
  const data = await result.json();
  if (!result.ok) {
    const message = typeof data?.error?.message === "string" ? data.error.message : "Stripe could not complete this request.";
    throw new Error(message);
  }
  return data;
}

async function portalConfiguration() {
  const path = "customer_payment_portal_settings?id=eq.1&select=stripe_configuration_id";
  const saved = await supabaseRest(path) as Record<string, unknown>[];
  if (saved[0]?.stripe_configuration_id) {
    const configurationId = String(saved[0].stripe_configuration_id);
    const configuration = await stripeRequest(`billing_portal/configurations/${encodeURIComponent(configurationId)}`);
    if (configuration.active && configuration.features?.payment_method_update?.enabled) return configurationId;
    throw new Error("FSB’s Stripe card settings are unavailable. Contact FSB Support.");
  }

  const form = new URLSearchParams({
    "features[payment_method_update][enabled]": "true",
    default_return_url: RETURN_URL,
  });
  const configuration = await stripeRequest("billing_portal/configurations", {
    method: "POST",
    headers: { "Idempotency-Key": "fsb-customer-card-portal-v1" },
    body: form,
  });
  if (!configuration.id || !configuration.features?.payment_method_update?.enabled) {
    throw new Error("Stripe could not enable secure card management.");
  }
  await supabaseRest("customer_payment_portal_settings?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ id: 1, stripe_configuration_id: configuration.id, updated_at: new Date().toISOString() }),
  });
  const persisted = await supabaseRest(path) as Record<string, unknown>[];
  if (!persisted[0]?.stripe_configuration_id) throw new Error("Stripe card settings are still processing. Try again shortly.");
  return String(persisted[0].stripe_configuration_id);
}

async function stripeCustomer(user: { id: string; email: string; name: string }) {
  const found = await supabaseRest(
    `customer_payment_customers?user_id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id`,
  ) as Record<string, unknown>[];
  if (found[0]?.stripe_customer_id) return String(found[0].stripe_customer_id);

  const customerForm = new URLSearchParams({
    email: user.email,
    "metadata[supabase_user_id]": user.id,
  });
  if (user.name) customerForm.set("name", user.name);
  const customer = await stripeRequest("customers", {
    method: "POST",
    headers: { "Idempotency-Key": `fsb-customer-${user.id}` },
    body: customerForm,
  });
  if (!customer.id) throw new Error("Stripe could not prepare your payment profile.");

  await supabaseRest("customer_payment_customers?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: user.id, stripe_customer_id: customer.id, updated_at: new Date().toISOString() }),
  });
  const saved = await supabaseRest(
    `customer_payment_customers?user_id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id`,
  ) as Record<string, unknown>[];
  const stripeCustomerId = saved[0]?.stripe_customer_id;
  if (!stripeCustomerId) throw new Error("Stripe payment setup is still processing. Try again shortly.");
  return String(stripeCustomerId);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.headers.get("origin") !== SITE_ORIGIN) return response({ error: "Origin is not allowed." }, 403);
  if (request.method !== "POST") return response({ error: "Use POST." }, 405);

  try {
    if (!supabaseUrl) throw new Error("Supabase URL is not configured.");
    const user = await authenticatedUser(request);
    const configuration = await portalConfiguration();
    const customer = await stripeCustomer(user);
    const session = await stripeRequest("billing_portal/sessions", {
      method: "POST",
      body: new URLSearchParams({ customer, configuration, return_url: RETURN_URL }),
    });
    if (!session.url) throw new Error("Stripe did not return a secure payment management link.");
    return response({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not open payment settings.";
    return response({ error: message }, 400);
  }
});

