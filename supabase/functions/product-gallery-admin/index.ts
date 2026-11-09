import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SITE_ORIGIN = "https://flysbirth.com";
const SITE_PATH = "/merch.html";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": SITE_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function serviceKey(): { key: string; secret: boolean } {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const value = JSON.parse(secretKeys).default;
      if (typeof value === "string" && value.startsWith("sb_secret_")) return { key: value, secret: true };
    } catch (_) { /* fall back to legacy key */ }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return { key: legacy, secret: false };
  throw new Error("Supabase server credentials are unavailable.");
}

async function rest(path: string, init: RequestInit = {}) {
  const credentials = serviceKey();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", credentials.key);
  if (!credentials.secret) headers.set("Authorization", `Bearer ${credentials.key}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const result = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers });
  const text = await result.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!result.ok) {
    const message = typeof data === "object" && data && "message" in data ? String((data as { message: unknown }).message) : "Store database request failed.";
    throw new Error(message);
  }
  return data;
}


async function pf(path:string,init:RequestInit={}){const token=Deno.env.get("PRINTFUL_API_TOKEN");if(!token)throw new Error("Printful is unavailable.");const r=await fetch("https://api.printful.com"+path,{...init,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"}});const data=await r.json();if(!r.ok)throw new Error(data.error?.message||data.result||"Printful request failed.");return data.result;}
async function owner(request:Request){const token=request.headers.get("authorization");const api=request.headers.get("apikey");if(!token||!api)throw new Error("Sign in as the FSB owner.");const r=await fetch(supabaseUrl+"/auth/v1/user",{headers:{Authorization:token,apikey:api}});const user=await r.json();if(!r.ok||!user.id||!user.email_confirmed_at)throw new Error("Sign in as the FSB owner.");const rows=await rest("fsb_store_admins?user_id=eq."+encodeURIComponent(user.id)+"&select=user_id") as unknown[];if(!rows.length)throw new Error("Owner access required.");}
Deno.serve(async(request:Request)=>{
 if(request.method==="OPTIONS")return new Response("ok",{headers:CORS_HEADERS});
 if(request.method!=="POST"||request.headers.get("origin")!==SITE_ORIGIN)return response({error:"Not allowed."},403);
 try{await owner(request);const body=await request.json();const id=Number(body.productId);
 const rows=await rest("merch_products?active=eq.true&fulfillment_method=eq.printful&select=id,name,images,variants,printful_product_id"+(id?"&id=eq."+id:"")) as any[];
 if(body.action==="list")return response({products:rows.map(p=>({id:p.id,name:p.name}))});
 if(rows.length!==1)throw new Error("Choose a Printful product.");const p=rows[0];
 const data=await pf("/store/products/"+p.printful_product_id);const variants=data.sync_variants||[];const colors=[...new Map(variants.map((v:any)=>[v.color,v])).values()] as any[];
 const catalog=colors[0]?.product?.product_id;if(!catalog)throw new Error("Missing catalog product.");
 const settings=await pf("/mockup-generator/printfiles/"+catalog);

 if(body.action==="start"){
   if(!settings.option_groups?.includes("Flat")||!settings.options?.includes("Back"))throw new Error("No product-only back view is available for this product.");
   const groups=new Map<string,any>();for(const v of colors){
     const back=v.files.find((f:any)=>f.type==="back"||f.type==="embroidery_back");
     const place=back?.type||(settings.available_placements.back?"back":Object.keys(settings.available_placements)[0]);
     const file=back||v.files.find((f:any)=>f.type===place)||v.files.find((f:any)=>f.type!=="preview"&&settings.available_placements[f.type]);
     const url=back?(back.url||back.preview_url):(place==="back"?"https://flysbirth.com/blank-print.png":file?.url||file?.preview_url);
     if(!url)throw new Error("Missing artwork for the product-only back view.");
     const placementFile=settings.variant_printfiles.find((x:any)=>Number(x.variant_id)===Number(v.variant_id))?.placements?.[place];const area=settings.printfiles.find((x:any)=>x.printfile_id===placementFile);if(!area)throw new Error("Missing product print area.");
     const key=JSON.stringify([place,url,area.width,area.height]);if(!groups.has(key))groups.set(key,{variant_ids:[],files:[{placement:place,image_url:url,position:{area_width:area.width,area_height:area.height,width:area.width,height:area.height,top:0,left:0}}]});
     groups.get(key).variant_ids.push(Number(v.variant_id));
   }
   const tasks=[];for(const job of groups.values()){const task=await pf("/mockup-generator/create-task/"+catalog,{method:"POST",body:JSON.stringify({...job,format:"jpg",width:1200,option_groups:["Flat"],options:["Back"]})});tasks.push(task.task_key);}
   return response({tasks,name:p.name});
 }
 if(body.action==="status"||body.action==="save"){
   if(!Array.isArray(body.tasks)||!body.tasks.length||body.tasks.length>12||body.tasks.some((t:any)=>typeof t!=="string"||!/^[a-zA-Z0-9_-]{1,160}$/.test(t)))throw new Error("Invalid photo tasks.");
   const results=[];for(const key of body.tasks)results.push(await pf("/mockup-generator/task?task_key="+encodeURIComponent(key)));
   if(results.some(t=>t.status==="failed"||t.error))throw new Error(results.find(t=>t.error)?.error||"Photo generation failed.");
   if(results.some(t=>t.status!=="completed"))return response({status:"pending"});
   const views:any[]=[];for(const task of results)for(const mock of task.mockups||[]){
     const back=(mock.extra||[]).filter((x:any)=>x.option_group==="Flat"&&x.option==="Back").map((x:any)=>x.url);
     if(mock.placement==="back"&&mock.mockup_url)back.unshift(mock.mockup_url);
     for(const url of [...new Set(back)])views.push({url,variant_ids:mock.variant_ids,label:"Back"});
   }
   if(!views.length)throw new Error("Printful returned no confirmed product-only back images.");
   if(body.action==="status")return response({status:"completed",views});
   const stored:any[]=[];for(const view of views){
     const url=new URL(view.url);if(url.protocol!=="https:"||!(/(^|\\.)(printful\\.com|printful\\.io|amazonaws\\.com)$/.test(url.hostname)))throw new Error("Unexpected image host.");
     const image=await fetch(url.href);if(!image.ok)throw new Error("Could not download product image.");const bytes=await image.arrayBuffer();if(bytes.byteLength>10*1024*1024)throw new Error("Product image is too large.");
     const path="merch-products/views/"+p.id+"/"+crypto.randomUUID()+".jpg";const credentials=serviceKey();const headers:Record<string,string>={apikey:credentials.key,"Content-Type":"image/jpeg","x-upsert":"false"};if(!credentials.secret)headers.Authorization="Bearer "+credentials.key;
     const upload=await fetch(supabaseUrl+"/storage/v1/object/site-images/"+path,{method:"POST",headers,body:bytes});if(!upload.ok)throw new Error("Could not save product image.");
     stored.push({...view,url:supabaseUrl+"/storage/v1/object/public/site-images/"+path});
   }
   const updated=(p.variants||[]).map((v:any)=>{const sync=variants.find((x:any)=>String(x.id)===String(v.printful_variant_id));const backs=stored.filter(x=>x.variant_ids.includes(Number(sync?.variant_id)));const front=sync?.files?.find((f:any)=>f.type==="preview"&&/front/i.test(f.filename||"")&&!/model|lifestyle|person/i.test(f.filename||""));if(!front||!backs.length)throw new Error("Missing a front or back view for "+v.color+". Existing photos were kept.");const image=front.preview_url;return {...v,image,images:[image,...backs.map(x=>x.url)],image_views:[{url:image,label:"Front"},...backs.map(x=>({url:x.url,label:x.label}))]};});
   const images=[...new Set(updated.flatMap((v:any)=>v.images))];await rest("merch_products?id=eq."+p.id,{method:"PATCH",body:JSON.stringify({images,variants:updated,updated_at:new Date().toISOString()})});
   return response({status:"saved",name:p.name,images:images.length,colors:colors.length});
 }
 if(body.action==="inspect")return response({id:p.id,name:p.name,catalog,settings,variants:colors.map(v=>({id:v.id,variant_id:v.variant_id,color:v.color,technique:v.technique,options:v.options,files:v.files}))});
 return response({error:"Unknown action."},400);
 }catch(e){return response({error:e instanceof Error?e.message:"Product photos unavailable."},400);}
});