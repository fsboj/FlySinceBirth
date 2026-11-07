const SUPPORT_ADDRESS = "fsbsupport@flysbirth.com";
const SMTP_HOST = "smtppro.zoho.com";
const SMTP_PORT = 465;
const SITE_ORIGIN = "https://flysbirth.com";
const PROJECT_REF = "ccvhvxugoebdqwxxankl";


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
          if (!expected.includes(code)) throw new Error("Zoho SMTP rejected an FSB order email.");
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


async function claim(orderId:number,kind:string){
 const inserted=await rest("fsb_store_email_deliveries?on_conflict=order_id,kind&select=order_id",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=representation"},body:JSON.stringify({order_id:orderId,kind,status:"sending",attempts:1})}) as any[];
 if(inserted.length)return "claimed";
 const path=`fsb_store_email_deliveries?order_id=eq.${orderId}&kind=eq.${kind}`;
 const [row]=await rest(path+"&select=*") as any[];
 if(row?.status==="sent")return "already_sent";
 if(!row||row.attempts>=5)return "failed";
 if(row.status==="sending"&&Date.now()-Date.parse(row.updated_at)<600000)return "sending";
 const claimed=await rest(path+`&status=eq.${row.status}&attempts=eq.${row.attempts}&updated_at=eq.${encodeURIComponent(row.updated_at)}&select=order_id`,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({status:"sending",attempts:row.attempts+1,updated_at:new Date().toISOString(),last_error:""})}) as any[];
 return claimed.length?"claimed":"sending";
}
export function safeTrackingUrl(value:unknown){try{const u=new URL(String(value||""));return u.protocol==="https:"&&!u.username&&!u.password?u.href:"";}catch{return "";}}
const money=(value:unknown)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(value)||0);
export function orderEmailContent(order:any,items:any[],kind:string){
 const internal=kind==="support";
 const link=SITE_ORIGIN+"/my-fsb.html?order="+encodeURIComponent(order.id)+"#yourOrders";
 const heading=internal?"New FSB order":"Thanks for your order";
 const rows=items.map(i=>`<tr><td style="padding:12px 0;border-bottom:1px solid #ddd"><strong>${escapeHtml(i.product_name)}</strong><br>${escapeHtml([i.variant_size,i.variant_color].filter(Boolean).join(" / "))}<br>Quantity: ${Number(i.quantity)} · ${money(i.unit_price)} each</td><td style="text-align:right">${money(Number(i.unit_price)*Number(i.quantity))}</td></tr>`).join("");
 const shipments=Array.isArray(order.shipments)?order.shipments:[];
 const tracking=shipments.map((s:any)=>({number:s.tracking_number,url:safeTrackingUrl(s.tracking_url),carrier:s.carrier})).concat(items.filter(i=>i.tracking_number||i.tracking_url).map(i=>({number:i.tracking_number,url:safeTrackingUrl(i.tracking_url),carrier:"Shipment"})));
 const trackingHtml=tracking.length?tracking.map((s:any)=>`<p>${escapeHtml(s.carrier||"Shipment")} · ${s.url?`<a href="${escapeHtml(s.url)}">${escapeHtml(s.number||"Track package")}</a>`:escapeHtml(s.number||"Tracking pending")}</p>`).join(""):"<p>Tracking pending. Your items are being prepared. Use the order link below to see tracking once the carrier details are available.</p>";
 const addr=order.shipping_address||{};
 const address=[addr.name,addr.address1,addr.address2,[addr.city,addr.state_code,addr.zip].filter(Boolean).join(", "),addr.country_code].filter(Boolean);
 const subject=(internal?"New FSB order — ":"FSB order receipt — ")+order.order_number;
 const html=`<!doctype html><html><body style="margin:0;background:#f3f3f3;font-family:Arial,sans-serif;color:#111"><div style="max-width:620px;margin:24px auto;background:white;padding:30px"><div style="font-size:12px;letter-spacing:3px">FLY SINCE BIRTH</div><h1>${heading}</h1><p>Hello ${escapeHtml(internal?"FSB team":order.customer_name||"FSB member")},</p><p><strong>${escapeHtml(order.order_number)}</strong><br>${escapeHtml(new Date(order.created_at).toLocaleString("en-US",{timeZone:"America/New_York"}))} ET<br>Payment: Paid</p>${internal?`<p>Customer: ${escapeHtml(order.customer_name)} · ${escapeHtml(order.customer_email)}<br>Fulfillment: ${escapeHtml(order.fulfillment_status)}<br>Printful order: ${escapeHtml(order.printful_order_id||"Awaiting submission")}</p>`:""}<table style="width:100%;border-collapse:collapse">${rows}</table><p>Items: ${money(order.subtotal)}<br>Shipping: ${money(order.shipping_total)}<br>Tax: ${money(order.tax_total)}<br><strong>Total paid: ${money(order.grand_total)} USD</strong></p><h2>Delivery address</h2><p>${address.map(escapeHtml).join("<br>")}</p><h2>Package tracking</h2>${trackingHtml}<p><a href="${link}">View your order and tracking</a></p><p><a href="${SITE_ORIGIN}/account.html?order=${encodeURIComponent(order.id)}#supportForm">Ask FSB about this order</a></p><p>Questions? Reply to this email or contact ${SUPPORT_ADDRESS}.</p></div></body></html>`;
 const plain=[heading,order.order_number,"Payment: Paid",...items.map(i=>`${i.product_name} · ${[i.variant_size,i.variant_color].filter(Boolean).join(" / ")} · ${i.quantity} × ${money(i.unit_price)}`),`Items: ${money(order.subtotal)} | Shipping: ${money(order.shipping_total)} | Tax: ${money(order.tax_total)} | Total paid: ${money(order.grand_total)} USD`,"Delivery:",...address,"Tracking:",...tracking.map((s:any)=>[s.carrier,s.number,s.url].filter(Boolean).join(" · ")),tracking.length?"":"Tracking pending. Check your FSB order page for updates.",link,"Order inquiry: "+SITE_ORIGIN+"/account.html?order="+order.id+"#supportForm",internal?"Customer: "+order.customer_email:"",SUPPORT_ADDRESS].join("\n");
 return {subject,html,plain};
}
async function sendOrderEmail(to:string,order:any,items:any[],kind:string){
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to))throw Error("Invalid order email destination");
 const user=Deno.env.get("ZOHO_SMTP_USER"),password=Deno.env.get("ZOHO_SMTP_PASSWORD");if(!user||!password)throw Error("Zoho SMTP is not configured");
 const content=orderEmailContent(order,items,kind),boundary="fsb-order-"+crypto.randomUUID();
 const enc=(s:string)=>base64(new TextEncoder().encode(s)).match(/.{1,76}/g)?.join("\r\n")||"";
 const message=[`From: FSB Support <${SUPPORT_ADDRESS}>`,`To: ${safeHeader(to)}`,`Reply-To: ${SUPPORT_ADDRESS}`,`Subject: =?UTF-8?B?${base64(new TextEncoder().encode(content.subject))}?=`,`Message-ID: <store-${order.id}-${kind}@flysbirth.com>`,"Date: "+new Date().toUTCString(),"MIME-Version: 1.0",`Content-Type: multipart/alternative; boundary="${boundary}"`,"",`--${boundary}`,"Content-Type: text/plain; charset=UTF-8","Content-Transfer-Encoding: base64","",enc(content.plain),`--${boundary}`,"Content-Type: text/html; charset=UTF-8","Content-Transfer-Encoding: base64","",enc(content.html),`--${boundary}--`,""].join("\r\n");
 const conn=await Deno.connectTls({hostname:SMTP_HOST,port:SMTP_PORT}),smtp=new SMTPConnection(conn);
 try{await smtp.readReply([220]);await smtp.command("EHLO flysbirth.com",[250]);await smtp.command("AUTH LOGIN",[334]);await smtp.command(base64(new TextEncoder().encode(user)),[334]);await smtp.command(base64(new TextEncoder().encode(password)),[235]);await smtp.command(`MAIL FROM:<${SUPPORT_ADDRESS}>`,[250]);await smtp.command(`RCPT TO:<${to}>`,[250,251]);await smtp.command("DATA",[354]);await smtp.write(message.replace(/^\./gm,"..")+"\r\n.\r\n");await smtp.readReply([250]);await smtp.command("QUIT",[221]);}finally{conn.close();}
}
export async function sendStoreReceipts(orderId:number){
 const [order]=await rest(`fsb_store_orders?id=eq.${orderId}&select=*`) as any[];
 if(!order||order.payment_status!=="paid"||order.payment_provider!=="stripe"||!String(order.stripe_session_id).startsWith("cs_live_"))throw Error("Only a paid live store order can receive a receipt");
 const items=await rest(`fsb_store_order_items?order_id=eq.${orderId}&select=*`) as any[];if(!items.length)throw Error("Order items missing");
 const results:Record<string,string>={};
 for(const kind of ["customer","support"]){
 const claimed=await claim(orderId,kind);if(claimed!=="claimed"){results[kind]=claimed;continue;}
 try{await sendOrderEmail(kind==="customer"?order.customer_email:SUPPORT_ADDRESS,order,items,kind);await rest(`fsb_store_email_deliveries?order_id=eq.${orderId}&kind=eq.${kind}`,{method:"PATCH",body:JSON.stringify({status:"sent",sent_at:new Date().toISOString(),updated_at:new Date().toISOString(),last_error:""})});results[kind]="sent";}
 catch{await rest(`fsb_store_email_deliveries?order_id=eq.${orderId}&kind=eq.${kind}`,{method:"PATCH",body:JSON.stringify({status:"failed",updated_at:new Date().toISOString(),last_error:"Zoho order email could not be delivered"})});results[kind]="failed";}
 }return results;
}
export async function syncPrintfulTracking(order:any){
 if(!order.printful_order_id||order.payment_status!=="paid")return;
 if(order.tracking_checked_at&&Date.now()-Date.parse(order.tracking_checked_at)<60000)return;
 const token=Deno.env.get("PRINTFUL_API_TOKEN");if(!token)return;
 const r=await fetch("https://api.printful.com/orders/"+encodeURIComponent(order.printful_order_id),{headers:{Authorization:"Bearer "+token}});
 const d=await r.json();if(!r.ok||String(d.result?.id)!==String(order.printful_order_id)||d.result?.external_id!==order.order_number)throw Error("Shipment status unavailable");
 const shipments=(d.result.shipments||[]).map((s:any)=>({id:String(s.id),carrier:String(s.carrier||""),service:String(s.service||""),tracking_number:String(s.tracking_number||""),tracking_url:safeTrackingUrl(s.tracking_url),ship_date:s.ship_date||null}));
 const lines=await rest(`fsb_store_order_items?order_id=eq.${order.id}&select=id,fulfillment_method,fulfillment_status`) as any[];
 const state=d.result.status==="fulfilled"?"fulfilled":d.result.status==="partial"?"partially_fulfilled":d.result.status==="canceled"?"cancelled":null;
 const update:any={shipments,tracking_checked_at:new Date().toISOString()};
 if(state&&lines.length&&lines.every(i=>i.fulfillment_method==="printful"))update.fulfillment_status=state;
 if(state==="fulfilled")await rest(`fsb_store_order_items?order_id=eq.${order.id}&fulfillment_method=eq.printful`,{method:"PATCH",body:JSON.stringify({fulfillment_status:"fulfilled"})});
 await rest(`fsb_store_orders?id=eq.${order.id}&payment_status=eq.paid`,{method:"PATCH",body:JSON.stringify(update)});
}
