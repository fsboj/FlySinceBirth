import {createClient} from "npm:@supabase/supabase-js@2.57.4";
import {sendStoreReceipts,syncPrintfulTracking} from "./_shared/store-receipt.ts";
const cors={"Access-Control-Allow-Origin":"https://flysbirth.com","Access-Control-Allow-Headers":"authorization,apikey,x-client-info,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:cors});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST"||req.headers.get("origin")!=="https://flysbirth.com")return reply({error:"Request not allowed"},403);
 const token=req.headers.get("authorization")?.replace(/^Bearer\s+/i,"");if(!token)return reply({error:"Sign in to view your orders"},401);
 const client=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await client.auth.getUser(token);if(error||!user?.email_confirmed_at)return reply({error:"Sign in with a verified FSB account"},401);
 try{
 const body=await req.json();let query=client.from("fsb_store_orders").select("*").eq("user_id",user.id);
 if(body.action==="receipts"){
 if(!Number.isSafeInteger(Number(body.orderId))||Number(body.orderId)<1)return reply({error:"Invalid order"},400);
 const {data:admins}=await client.from("fsb_store_admins").select("user_id,email").eq("user_id",user.id).ilike("email",user.email!);
 if(admins?.length)query=client.from("fsb_store_orders").select("*");
 const {data:order}=await query.eq("id",Number(body.orderId)).maybeSingle();if(!order)return reply({error:"Order not found"},404);
 return reply({deliveries:await sendStoreReceipts(Number(order.id))});
 }
 if(body.action!=="sync")return reply({error:"Unknown action"},400);
 const {data:orders,error:readError}=await query.eq("payment_status","paid").not("printful_order_id","is",null).order("created_at",{ascending:false}).limit(20);if(readError)throw Error("Could not load orders");
 let refreshed=0,unavailable=0;for(const order of orders||[]){try{await syncPrintfulTracking(order);refreshed++;}catch{unavailable++;}}
 return reply({refreshed,unavailable});
 }catch{return reply({error:"Order update could not be completed. Please try again."},500);}
});