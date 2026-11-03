import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { sendTicketReceipt } from '../_shared/ticket-receipt.ts';
const origins=new Set(['https://flysbirth.com','https://www.flysbirth.com']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'',headers={'Access-Control-Allow-Origin':origins.has(origin)?origin:'https://flysbirth.com','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST'||!origins.has(origin))return reply({error:'Not allowed'},403);
 try{
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!token)return reply({error:'Sign in to admin.'},401);
  const user=await db.auth.getUser(token);if(user.error||!user.data.user)return reply({error:'Sign in to admin.'},401);
  const admin=await db.from('fsb_store_admins').select('user_id,email').eq('user_id',user.data.user.id).maybeSingle();if(admin.error)throw admin.error;
  if(!admin.data||admin.data.email.toLowerCase()!==(user.data.user.email||'').toLowerCase())return reply({error:'Admin access required.'},403);
  const raw=await req.text();if(raw.length>4000)return reply({error:'Request too large'},413);const b=JSON.parse(raw);
  const eventId=b.eventId==null||b.eventId===''?null:Number(b.eventId);if(eventId!==null&&(!Number.isSafeInteger(eventId)||eventId<1))return reply({error:'Invalid event'},400);
  if(b.action==='setup'){
   const events=await db.from('events').select('id,title,date,location,ticket_sales_mode,ticket_price,ticket_capacity,ticket_providers').order('id',{ascending:false});if(events.error)throw events.error;
   const secret=(Deno.env.get('MERCH_STRIPE_SECRET_KEY')||Deno.env.get('STRIPE_SECRET_KEY'))||'';
   return reply({events:events.data,stripeMode:/^(sk|rk)_live_/.test(secret)?'live':secret?'test':'unconfigured',paypalMode:Deno.env.get('PAYPAL_CLIENT_ID')?(Deno.env.get('PAYPAL_ENV')==='live'?'live':'test'):'unconfigured'});
  }

  if(b.action==='verifyStripe'){
   const secret=Deno.env.get('MERCH_STRIPE_SECRET_KEY')||Deno.env.get('STRIPE_SECRET_KEY')||'';
   if(!/^(sk|rk)_live_/.test(secret))return reply({error:'Live Stripe credentials are not configured.'},409);
   const form=new URLSearchParams({mode:'payment',success_url:'https://flysbirth.com/events.html',cancel_url:'https://flysbirth.com/events.html','line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':'100','line_items[0][price_data][product_data][name]':'FSB connection verification - do not pay','line_items[0][quantity]':'1','metadata[order_type]':'ticket_setup_check',expires_at:String(Math.floor(Date.now()/1000)+1800)});
   const created=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':'fsb-ticket-verify-'+crypto.randomUUID()},body:form});
   const session=await created.json();
   if(!created.ok||!session.id)return reply({error:session.error?.message||'Live Stripe checkout could not be verified.'},409);
   const expired=await fetch('https://api.stripe.com/v1/checkout/sessions/'+encodeURIComponent(session.id)+'/expire',{method:'POST',headers:{Authorization:'Bearer '+secret}});
   const closed=await expired.json();
   if(!expired.ok||closed.status!=='expired')return reply({error:'Verification session cleanup needs attention.'},409);

   let artifactsArchived=false;
   const items=await fetch('https://api.stripe.com/v1/checkout/sessions/'+encodeURIComponent(session.id)+'/line_items?expand%5B%5D=data.price.product',{headers:{Authorization:'Bearer '+secret}});
   if(items.ok){const data=await items.json();const price=data.data?.[0]?.price,product=typeof price?.product==='string'?price.product:price?.product?.id;
    if(price?.id&&product){const results=await Promise.all([['prices',price.id],['products',product]].map(([resource,id])=>fetch('https://api.stripe.com/v1/'+resource+'/'+encodeURIComponent(id),{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/x-www-form-urlencoded'},body:'active=false'})));artifactsArchived=results.every(r=>r.ok);}
   }
   return reply({verified:session.livemode===true,mode:session.livemode?'live':'test',sessionExpired:true,paymentStatus:session.payment_status,artifactsArchived});
  }

  if(b.action==='list'){
   const offset=Number(b.offset||0);if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return reply({error:'Invalid page'},400);
   const q=String(b.search||'').trim().replace(/[^\p{L}\p{N}@ .+\-]/gu,'').slice(0,100);
   let query=db.from('event_ticket_orders').select('id,event_id,user_id,buyer_email,quantity,unit_price,status,ticket_code,created_at,paid_at,expires_at,provider,payment_mode,checked_in_quantity,events(title,date,location)',{count:'exact'}).order('created_at',{ascending:false}).order('id',{ascending:false});
   if(eventId)query=query.eq('event_id',eventId);
   if(b.status){if(!['paid','pending','failed','expired','refunded'].includes(b.status))return reply({error:'Invalid status'},400);query=query.eq('status',b.status);}
   if(q){const names=await db.from('customer_profiles').select('user_id').ilike('display_name','%'+q+'%').limit(100);if(names.error)throw names.error;const clauses=['buyer_email.ilike.%'+q+'%'];if(uuid.test(q))clauses.push('ticket_code.eq.'+q,'id.eq.'+q);if(names.data?.length)clauses.push('user_id.in.('+names.data.map(p=>p.user_id).join(',')+')');query=query.or(clauses.join(','));}
   const orders=await query.range(offset,offset+49);if(orders.error)throw orders.error;
   const ids=orders.data.map(o=>o.id),users=[...new Set(orders.data.map(o=>o.user_id).filter(Boolean))];
   const profiles=users.length?await db.from('customer_profiles').select('user_id,display_name').in('user_id',users):{data:[]};if(profiles.error)throw profiles.error;
   const deliveries=ids.length?await db.from('event_ticket_receipt_deliveries').select('ticket_order_id,status,attempts,sent_at').in('ticket_order_id',ids):{data:[]};if(deliveries.error)throw deliveries.error;
   const totals=await db.rpc('event_ticket_admin_totals',{p_event_id:eventId});if(totals.error)throw totals.error;
   return reply({orders:orders.data.map(o=>({...o,buyer_name:profiles.data?.find(p=>p.user_id===o.user_id)?.display_name||'FSB guest',receipt:deliveries.data?.find(d=>d.ticket_order_id===o.id)||null})),count:orders.count,totals:totals.data});
  }
  if(b.action==='lookup'){
   const code=String(b.code||'').replace(/^FSB-TICKET:/i,'').trim();if(!uuid.test(code))return reply({error:'Enter or scan a valid FSB ticket code.'},400);
   if(!eventId)return reply({error:'Select the event before checking tickets.'},400);
   const r=await db.from('event_ticket_orders').select('id,event_id,user_id,buyer_email,quantity,status,ticket_code,payment_mode,checked_in_quantity,events(title,date,location)').eq('ticket_code',code).maybeSingle();if(r.error)throw r.error;if(!r.data)return reply({error:'Ticket not found.'},404);
   if(r.data.event_id!==eventId)return reply({error:'This ticket is for a different event.'},409);
   const p=r.data.user_id?await db.from('customer_profiles').select('display_name').eq('user_id',r.data.user_id).maybeSingle():{data:null};
   const history=await db.from('event_ticket_admissions').select('admitted_quantity,created_at').eq('order_id',r.data.id).order('created_at',{ascending:false});if(history.error)throw history.error;
   return reply({order:{...r.data,buyer_name:p.data?.display_name||'FSB guest'},admissions:history.data});
  }
  if(b.action==='admit'){
   if(!uuid.test(b.code)||!uuid.test(b.requestId)||!eventId||!Number.isInteger(b.quantity)||b.quantity<1||b.quantity>10)return reply({error:'Invalid check-in request.'},400);
   const r=await db.rpc('admit_event_ticket',{p_code:b.code,p_event_id:eventId,p_quantity:b.quantity,p_admin_id:user.data.user.id,p_request_id:b.requestId});if(r.error)return reply({error:r.error.message},409);return reply(r.data);
  }
  if(b.action==='retryEmail'){
   if(!uuid.test(b.orderId))return reply({error:'Invalid order'},400);
   const receipt=await db.from('event_ticket_receipt_deliveries').select('status,attempts').eq('ticket_order_id',b.orderId).maybeSingle();if(receipt.error)throw receipt.error;
   if(receipt.data?.status==='sent')return reply({error:'The ticket email was already sent.'},409);
   if(receipt.data?.status==='sending')return reply({error:'Email delivery is already in progress.'},409);
   return reply({status:await sendTicketReceipt(b.orderId)});
  }
  return reply({error:'Unknown action'},400);
 }catch(e){console.error('event-ticket-admin',e instanceof Error?e.message:'request failed');return reply({error:'Could not complete ticket request. Please retry.'},400);}
});

