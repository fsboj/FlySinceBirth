import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SITE_ORIGIN = "https://fsboj.github.io";
const SUPPORT_ADDRESS = "fsbsupport@flysbirth.com";
const SMTP_HOST = "smtppro.zoho.com";
const SMTP_PORT = 465;
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
      const value = JSON.parse(secretKeys).default;
      if (typeof value === "string" && value.startsWith("sb_secret_")) return value;
    } catch (_) {
      console.error("Supabase server credentials are unavailable.");
    }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("Supabase server credentials are unavailable.");
}

function apiKeyIsSecret(key: string) {
  return key.startsWith("sb_secret_");
}

async function rest(path: string, init: RequestInit = {}) {
  const key = serviceKey();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  if (!apiKeyIsSecret(key)) headers.set("Authorization", `Bearer ${key}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const result = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/${path}`, {
    ...init,
    headers,
  });
  const text = await result.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!result.ok) throw new Error("Supabase could not update the notification status.");
  return data;
}

type SupportRequest = {
  id: string;
  customer_id: string;
  customer_email: string;
  topic: string;
  subject: string;
  message: string;
  related_store_order_id: number | null;
  related_ticket_order_id: string | null;
  created_at: string;
};

async function claimDelivery(requestId: string) {
  const inserted = await rest(
    "customer_support_email_deliveries?on_conflict=support_request_id&select=support_request_id,status,attempts",
    {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ support_request_id: requestId, status: "sending", attempts: 1 }),
    },
  ) as Array<{ support_request_id: string; status: string; attempts: number }>;
  if (inserted.length) return { claimed: true };

  const existing = await rest(
    `customer_support_email_deliveries?support_request_id=eq.${encodeURIComponent(requestId)}&select=status,attempts`,
  ) as Array<{ status: string; attempts: number }>;
  const row = existing[0];
  if (!row || row.status !== "failed" || row.attempts >= 3) return { claimed: false };

  const retry = await rest(
    `customer_support_email_deliveries?support_request_id=eq.${encodeURIComponent(requestId)}&status=eq.failed&attempts=eq.${row.attempts}&select=support_request_id`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "sending", attempts: row.attempts + 1, last_error: "", updated_at: new Date().toISOString() }),
    },
  ) as Array<{ support_request_id: string }>;
  return { claimed: retry.length > 0 };
}

async function setDelivery(requestId: string, status: "sent" | "failed", error = "") {
  await rest(`customer_support_email_deliveries?support_request_id=eq.${encodeURIComponent(requestId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status, last_error: error.slice(0, 500), updated_at: new Date().toISOString() }),
  });
}

function base64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

class SMTPConnection {
  private buffer = "";
  private readonly decoder = new TextDecoder();

  constructor(private readonly conn: Deno.Conn) {}

  async write(text: string) {
    const data = new TextEncoder().encode(text);
    let offset = 0;
    while (offset < data.length) offset += await this.conn.write(data.subarray(offset));
  }

  async readReply(expected: number[]) {
    while (true) {
      const lines = this.buffer.split("\r\n");
      const complete = lines.length - 1;
      if (complete > 0) {
        this.buffer = lines.slice(complete).join("\r\n");
        const replyLines = lines.slice(0, complete);
        const finalLine = replyLines.at(-1) || "";
        if (finalLine.length >= 4 && finalLine[3] === " ") {
          const code = Number(finalLine.slice(0, 3));
          if (!expected.includes(code)) throw new Error("Zoho SMTP rejected a mail step.");
          return replyLines.join("\n");
        }
        continue;
      }
      const chunk = new Uint8Array(2048);
      const count = await this.conn.read(chunk);
      if (count === null) throw new Error("Zoho SMTP closed the connection.");
      this.buffer += this.decoder.decode(chunk.subarray(0, count), { stream: true });
    }
  }

  async command(command: string, expected: number[]) {
    await this.write(`${command}\r\n`);
    return this.readReply(expected);
  }
}

async function sendSupportEmail(item: SupportRequest) {
  const user = Deno.env.get("ZOHO_SMTP_USER");
  const password = Deno.env.get("ZOHO_SMTP_PASSWORD");
  const from = Deno.env.get("ZOHO_SMTP_FROM") || SUPPORT_ADDRESS;
  if (!user || !password) throw new Error("Zoho SMTP is not configured.");

  const conn = await Deno.connectTls({ hostname: SMTP_HOST, port: SMTP_PORT });
  const smtp = new SMTPConnection(conn);
  try {
    await smtp.readReply([220]);
    await smtp.command("EHLO flysbirth.com", [250]);
    await smtp.command("AUTH LOGIN", [334]);
    await smtp.command(base64(new TextEncoder().encode(user)), [334]);
    await smtp.command(base64(new TextEncoder().encode(password)), [235]);
    await smtp.command(`MAIL FROM:<${from}>`, [250]);
    await smtp.command(`RCPT TO:<${SUPPORT_ADDRESS}>`, [250, 251]);
    await smtp.command("DATA", [354]);

    const orderReference = item.related_ticket_order_id
      ? `Ticket order: ${item.related_ticket_order_id}`
      : item.related_store_order_id
        ? `Store order: ${item.related_store_order_id}`
        : "No linked order";
    const body = [
      "A customer sent a new support request through the FSB website.",
      "",
      `Customer: ${item.customer_email}`,
      `Topic: ${{ account: "Account help", feature_collaboration: "Feature / Collaboration Support", ticket: "Tickets", order: "Store order", payment: "Payment", other: "Other" }[item.topic] || item.topic}`,
      `Subject: ${item.subject}`,
      orderReference,
      `Submitted: ${item.created_at}`,
      "",
      "Message:",
      item.message,
      "",
      "Open the FSB admin page to manage and reply to this request.",
      "https://fsboj.github.io/FlySinceBirth/admin.html",
    ].join("\n");
    const encodedBody = base64(new TextEncoder().encode(body)).match(/.{1,76}/g)?.join("\r\n") || "";
    const headers = [
      `From: Fly Since Birth Support <${from}>`,
      `To: ${SUPPORT_ADDRESS}`,
      `Reply-To: ${item.customer_email}`,
      "Subject: [FSB Website] New support request",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
    ].join("\r\n");
    await smtp.write(`${headers}\r\n\r\n${encodedBody}\r\n.\r\n`);
    await smtp.readReply([250]);
    await smtp.command("QUIT", [221]);
  } finally {
    conn.close();
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return response({ error: "Method not allowed." }, 405);
  if (req.headers.get("origin") !== SITE_ORIGIN) return response({ error: "Invalid website origin." }, 403);

  const authorization = req.headers.get("authorization") || "";
  const publicKey = req.headers.get("apikey") || "";
  if (!authorization.startsWith("Bearer ") || !publicKey) return response({ error: "Sign in to continue." }, 401);

  const body = await req.json().catch(() => ({}));
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return response({ error: "Invalid support request." }, 400);
  }

  try {
    const userResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
      headers: { apikey: publicKey, Authorization: authorization },
    });
    if (!userResponse.ok) return response({ error: "Sign in again to send this request." }, 401);
    const user = await userResponse.json();

    const rows = await rest(
      `customer_support_requests?id=eq.${encodeURIComponent(requestId)}&select=id,customer_id,customer_email,topic,subject,message,related_store_order_id,related_ticket_order_id,created_at`,
    ) as SupportRequest[];
    const item = rows[0];
    if (!item || item.customer_id !== user.id || item.customer_email.toLowerCase() !== String(user.email || "").toLowerCase()) {
      return response({ error: "Support request not found." }, 404);
    }

    const claim = await claimDelivery(requestId);
    if (!claim.claimed) return response({ status: "already_notified" });
    try {
      await sendSupportEmail(item);
      await setDelivery(requestId, "sent");
      return response({ status: "sent" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email could not be sent.";
      await setDelivery(requestId, "failed", message);
      console.error("Support request notification failed.");
      return response({ error: "Your request was saved, but FSB email notification could not be sent." }, 502);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Support notification failed.");
    return response({ error: "Your request was saved, but FSB email notification could not be sent." }, 500);
  }
});

