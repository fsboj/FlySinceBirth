import QRCode from "npm:qrcode@1.5.4";

const SUPPORT_ADDRESS = "fsbsupport@flysbirth.com";
const SMTP_HOST = "smtppro.zoho.com";
const SMTP_PORT = 465;
const SITE_ORIGIN = "https://flysbirth.com";
const PROJECT_REF = "ccvhvxugoebdqwxxankl";

type TicketOrder = {
  id: string;
  event_id: number;
  user_id: string | null;
  buyer_email: string;
  quantity: number;
  unit_price: number;
  ticket_code: string;
  status: string;
  payment_mode: string;
};

function serviceKey() {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const value = JSON.parse(secretKeys).default;
      if (typeof value === "string" && value.startsWith("sb_secret_")) return { key: value, isSecret: true };
    } catch (_) {
      console.error("Supabase server credentials are unavailable.");
    }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return { key: legacy, isSecret: false };
  throw new Error("Supabase server credentials are unavailable.");
}

async function rest(path: string, init: RequestInit = {}) {
  const credentials = serviceKey();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", credentials.key);
  if (!credentials.isSecret) headers.set("Authorization", `Bearer ${credentials.key}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const result = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/${path}`, { ...init, headers });
  const text = await result.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!result.ok) throw new Error("Ticket receipt database operation failed.");
  return data;
}

function base64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character] || character));
}

function safeHeader(value: string) {
  return value.replace(/[\r\n<>]/g, "").trim();
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
          if (!expected.includes(code)) throw new Error("Zoho SMTP rejected a ticket receipt email.");
          return;
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
    await this.readReply(expected);
  }
}

async function claimReceipt(orderId: string): Promise<"claimed" | "already_sent" | "sending" | "failed"> {
  const inserted = await rest(
    "event_ticket_receipt_deliveries?on_conflict=ticket_order_id&select=ticket_order_id",
    {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ ticket_order_id: orderId, status: "sending", attempts: 1 }),
    },
  ) as Array<{ ticket_order_id: string }>;
  if (inserted.length) return "claimed";

  const existing = await rest(
    `event_ticket_receipt_deliveries?ticket_order_id=eq.${encodeURIComponent(orderId)}&select=status,attempts,updated_at`,
  ) as Array<{ status: string; attempts: number; updated_at: string }>;
  const row = existing[0];
  if (!row) return "failed";
  if (row.status === "sent") return "already_sent";
  const staleSending = row.status === "sending" && Date.now() - Date.parse(row.updated_at) > 10 * 60 * 1000;
  if (row.status === "sending" && !staleSending) return "sending";
  if ((row.status !== "failed" && !staleSending) || row.attempts >= 3) return "failed";
  const expectedStatus = staleSending ? "sending" : "failed";
  const retry = await rest(
    `event_ticket_receipt_deliveries?ticket_order_id=eq.${encodeURIComponent(orderId)}&status=eq.${expectedStatus}&attempts=eq.${row.attempts}&updated_at=eq.${encodeURIComponent(row.updated_at)}&select=ticket_order_id`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "sending", attempts: row.attempts + 1, last_error: "", updated_at: new Date().toISOString() }),
    },
  ) as Array<{ ticket_order_id: string }>;
  return retry.length ? "claimed" : "sending";
}

async function setReceipt(orderId: string, status: "sent" | "failed", error = "") {
  await rest(`event_ticket_receipt_deliveries?ticket_order_id=eq.${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status, last_error: error.slice(0, 500), sent_at: status === "sent" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }),
  });
}

async function sendEmail(to: string, buyerName: string, event: Record<string, unknown>, order: TicketOrder) {
  const user = Deno.env.get("ZOHO_SMTP_USER");
  const password = Deno.env.get("ZOHO_SMTP_PASSWORD");
  const from = safeHeader(Deno.env.get("ZOHO_SMTP_FROM") || SUPPORT_ADDRESS);
  if (!user || !password) throw new Error("Zoho SMTP is not configured.");
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)) throw new Error("Ticket buyer email address is invalid.");

  const eventName = String(event.title || "FSB Event");
  const ticketIsLive = order.payment_mode === "live";
  const eventDate = String(event.date || "Date to be announced");
  const location = String(event.location || "Location to be announced");
  const total = (Number(order.quantity) * Number(order.unit_price)).toFixed(2);
  const qrUrl = `https://${PROJECT_REF}.supabase.co/functions/v1/event-ticket-qr?code=${encodeURIComponent(order.ticket_code)}`;
  const qrDataUrl = await QRCode.toDataURL(`FSB-TICKET:${order.ticket_code}`, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
    color: { dark: "#000000", light: "#ffffff" },
  });
  const qrBase64 = qrDataUrl.split(",", 2)[1] || "";
  if (!qrBase64.startsWith("iVBOR")) throw new Error("Ticket QR image generation failed.");
  const qrBytes = Uint8Array.from(atob(qrBase64), (character) => character.charCodeAt(0));
  const html = `<!doctype html><html><body style="margin:0;background:#080808;color:#f5f5f5;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#080808;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#111;border:1px solid #333"><tr><td style="padding:30px"><div style="font-size:11px;letter-spacing:4px;color:#aaa">FLY SINCE BIRTH</div><h1 style="font-size:30px;margin:14px 0 6px">${ticketIsLive ? "Your ticket is confirmed" : "Test ticket — no admission"}</h1><p style="color:#ccc;margin:0 0 24px">Hi ${escapeHtml(buyerName)}, ${ticketIsLive ? "your payment is confirmed. Show this QR code at the door." : "this is a test purchase and does not grant admission."}</p><div style="background:#fff;padding:14px;width:220px;margin:0 auto 24px;text-align:center"><img src="cid:fsb-ticket-qr" width="220" height="220" alt="QR code for ${escapeHtml(eventName)} ticket" style="display:block;width:220px;height:220px"></div><h2 style="font-size:20px;margin:0 0 14px">${escapeHtml(eventName)}</h2><p style="margin:6px 0;color:#ddd"><strong>When:</strong> ${escapeHtml(eventDate)}</p><p style="margin:6px 0;color:#ddd"><strong>Where:</strong> ${escapeHtml(location)}</p><p style="margin:6px 0;color:#ddd"><strong>Ticket holder:</strong> ${escapeHtml(buyerName)}</p><p style="margin:6px 0;color:#ddd"><strong>Quantity:</strong> ${escapeHtml(order.quantity)}</p><p style="margin:6px 0 18px;color:#ddd"><strong>Paid:</strong> $${total} USD</p><p style="font-size:12px;color:#aaa;line-height:1.7">Ticket code: <strong>${escapeHtml(order.ticket_code)}</strong><br>Order reference: ${escapeHtml(order.id)}<br>Keep this email available at the venue. Each order QR represents ${escapeHtml(order.quantity)} ticket(s).</p><p style="font-size:12px;color:#999;margin-top:24px">Questions? Reply to this email or contact ${SUPPORT_ADDRESS}.</p></td></tr></table></td></tr></table></body></html>`;
  const plain = [
    ticketIsLive ? "FLY SINCE BIRTH — YOUR TICKET IS CONFIRMED" : "FLY SINCE BIRTH — TEST TICKET, NO ADMISSION",
    `Hi ${buyerName}, ${ticketIsLive ? "your payment is confirmed. Show the QR code in this email at the door." : "this is a test purchase and does not grant admission."}`,
    `Event: ${eventName}`,
    `When: ${eventDate}`,
    `Where: ${location}`,
    `Ticket holder: ${buyerName}`,
    `Quantity: ${order.quantity}`,
    `Paid: $${total} USD`,
    `Ticket code: ${order.ticket_code}`,
    `Order reference: ${order.id}`,
    `QR image: ${qrUrl}`,
    `Each order QR represents ${order.quantity} ticket(s).`,
  ].join("\n");
  const relatedBoundary = `fsb_related_${crypto.randomUUID().replaceAll("-", "")}`;
  const alternativeBoundary = `fsb_alt_${crypto.randomUUID().replaceAll("-", "")}`;
  const encodedHtml = base64(new TextEncoder().encode(html)).match(/.{1,76}/g)?.join("\r\n") || "";
  const encodedPlain = base64(new TextEncoder().encode(plain)).match(/.{1,76}/g)?.join("\r\n") || "";
  const encodedQr = base64(qrBytes).match(/.{1,76}/g)?.join("\r\n") || "";
  const body = [
    `--${relatedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`, "",
    `--${alternativeBoundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", encodedPlain,
    `--${alternativeBoundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", encodedHtml,
    `--${alternativeBoundary}--`,
    `--${relatedBoundary}`, 'Content-Type: image/png; name="fsb-ticket-qr.png"', "Content-Transfer-Encoding: base64",
    "Content-ID: <fsb-ticket-qr>", 'Content-Disposition: inline; filename="fsb-ticket-qr.png"', "", encodedQr,
    `--${relatedBoundary}--`, "",
  ].join("\r\n");
  const headers = [
    `From: Fly Since Birth Support <${from}>`, `To: ${safeHeader(to)}`,
    `Reply-To: ${SUPPORT_ADDRESS}`, `Subject: =?UTF-8?B?${base64(new TextEncoder().encode(`${ticketIsLive ? "FSB ticket confirmed" : "FSB test ticket"} - ${safeHeader(eventName)}`))}?=`,
    "MIME-Version: 1.0", `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
  ].join("\r\n");

  const conn = await Deno.connectTls({ hostname: SMTP_HOST, port: SMTP_PORT });
  const smtp = new SMTPConnection(conn);
  try {
    await smtp.readReply([220]);
    await smtp.command("EHLO flysbirth.com", [250]);
    await smtp.command("AUTH LOGIN", [334]);
    await smtp.command(base64(new TextEncoder().encode(user)), [334]);
    await smtp.command(base64(new TextEncoder().encode(password)), [235]);
    await smtp.command(`MAIL FROM:<${from}>`, [250]);
    await smtp.command(`RCPT TO:<${to}>`, [250, 251]);
    await smtp.command("DATA", [354]);
    await smtp.write(`${headers}\r\n\r\n${body.replace(/^\./gm, "..")}\r\n.\r\n`);
    await smtp.readReply([250]);
    await smtp.command("QUIT", [221]);
  } finally {
    conn.close();
  }
}

export async function sendTicketReceipt(orderId: string): Promise<"sent" | "already_sent" | "sending" | "failed"> {
  const rows = await rest(
    `event_ticket_orders?id=eq.${encodeURIComponent(orderId)}&select=id,event_id,user_id,buyer_email,quantity,unit_price,ticket_code,status,payment_mode`,
  ) as TicketOrder[];
  const order = rows[0];
  if (!order || order.status !== "paid") throw new Error("Only a paid ticket order can receive a ticket email.");

  const claim = await claimReceipt(order.id);
  if (claim !== "claimed") return claim;

  try {
    const [events, profiles] = await Promise.all([
      rest(`events?id=eq.${order.event_id}&select=title,date,location`) as Promise<Array<Record<string, unknown>>>,
      order.user_id
        ? rest(`customer_profiles?user_id=eq.${encodeURIComponent(order.user_id)}&select=display_name`) as Promise<Array<{ display_name: string }>>
        : Promise.resolve([] as Array<{ display_name: string }>),
    ]);
    const event = events[0];
    if (!event) throw new Error("The ticket event could not be found.");
    const profileName = profiles[0]?.display_name?.trim();
    const buyerName = profileName || order.buyer_email.split("@")[0] || "FSB guest";
    await sendEmail(order.buyer_email, buyerName, event, order);
    await setReceipt(order.id, "sent");
    return "sent";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ticket receipt email failed.";
    try { await setReceipt(order.id, "failed", message); } catch (_) { /* preserve the original failure */ }
    console.error("Ticket receipt email could not be delivered.");
    return "failed";
  }
}

