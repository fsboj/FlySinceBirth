import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {syncPrintfulTracking,sendShippingNotifications} from './_shared/store-receipt.ts';
function equal(a:string,b:string){if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
Deno.serve(async req=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';if(token.length!==72)return new Response('Unauthorized',{status:401});
 const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:config,error:configError}=await client.from('fsb_store_job_config').select('token').eq('job_name','shipping').maybeSingle();
 if(configError||!config?.token||!equal(token,config.token))return new Response('Unauthorized',{status:401});
 try{
 const {data:orders,error}=await client.from('fsb_store_orders').select('*').eq('payment_status','paid').neq('fulfillment_status','cancelled').order('tracking_checked_at',{ascending:true,nullsFirst:true}).limit(25);if(error)throw Error('Order lookup unavailable');
 let checked=0,sent=0,failed=0;
 for(const order of orders||[]){try{if(order.printful_order_id)await syncPrintfulTracking(order);const results=await sendShippingNotifications(Number(order.id));sent+=results.filter(s=>s==='sent').length;failed+=results.filter(s=>s==='failed').length;checked++;}catch{failed++;}
 await client.from('fsb_store_orders').update({tracking_checked_at:new Date().toISOString()}).eq('id',order.id);}
 await client.from('fsb_store_job_config').update({last_run_at:new Date().toISOString(),last_error:failed?failed+' shipping checks or emails need retry':null}).eq('job_name','shipping');
 return Response.json({checked,sent,failed});
 }catch{await client.from('fsb_store_job_config').update({last_run_at:new Date().toISOString(),last_error:'Shipping background check failed'}).eq('job_name','shipping');return Response.json({error:'Shipping check unavailable'},{status:500});}
});