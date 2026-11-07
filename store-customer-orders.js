(function(){
 const host=document.getElementById("fsbOrderList");if(!host)return;
 const client=typeof supabaseClient!=="undefined"?supabaseClient:window.supabaseClient;
 const text=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;};
 const money=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n)||0);
 const safeUrl=value=>{try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password?u.href:"";}catch{return "";}};
 let loading=false,userId=null;
 async function load(){
 if(loading)return;loading=true;const refresh=document.getElementById("refreshFsbOrders");if(refresh)refresh.disabled=true;
 try{
 const {data:{session}}=await client.auth.getSession();userId=session?.user?.id||null;
 if(!userId){host.replaceChildren(text("p","Sign in to view your orders.","empty"));const a=text("a","SIGN IN");a.href="account.html?return="+encodeURIComponent("my-fsb.html#yourOrders");host.append(a);return;}
 const sync=await client.functions.invoke("store-order-sync",{body:{action:"sync"}});
 const {data:orders,error}=await client.from("fsb_store_orders").select("id,order_number,created_at,grand_total,payment_status,fulfillment_status,production_approval,shipments").eq("user_id",userId).order("created_at",{ascending:false});if(error)throw error;
 host.replaceChildren();if(!orders?.length){host.append(text("p","No store orders yet.","empty"));return;}
 const {data:items,error:itemError}=await client.from("fsb_store_order_items").select("order_id,product_name,quantity,unit_price,variant_size,variant_color,tracking_number,tracking_url,fulfillment_status").in("order_id",orders.map(o=>o.id));if(itemError)throw itemError;
 for(const order of orders){
 const card=document.createElement("article");card.className="fsb-order-card";card.id="fsb-order-"+order.id;
 card.append(text("h4",order.order_number||"Order #"+order.id),text("p",new Date(order.created_at).toLocaleDateString()+" · "+order.payment_status+" · "+(order.production_approval==="pending"?"Awaiting production approval":order.fulfillment_status),"fsb-order-muted"));
 const lines=(items||[]).filter(i=>i.order_id===order.id);
 lines.forEach(i=>card.append(text("p",i.product_name+" × "+i.quantity+" · "+[i.variant_size,i.variant_color].filter(Boolean).join(" / ")+" · "+money(Number(i.unit_price)*i.quantity))));
 const packages=Array.isArray(order.shipments)?order.shipments.slice():[];
 lines.filter(i=>i.tracking_url||i.tracking_number).forEach(i=>{if(!packages.some(p=>p.tracking_number===i.tracking_number))packages.push({tracking_url:i.tracking_url,tracking_number:i.tracking_number,carrier:"Shipment"});});
 if(!packages.length)card.append(text("p",order.payment_status==="paid"?(order.production_approval==="pending"?"Your order is awaiting production approval. Contact FSB Support for a processing estimate.":"Tracking pending — your order is being prepared."):"Tracking becomes available after payment and shipment.","fsb-order-muted"));
 packages.forEach((p,index)=>{const url=safeUrl(p.tracking_url);if(url){const a=text("a","TRACK PACKAGE "+(packages.length>1?index+1:"")+" · "+(p.carrier||"Carrier")+(p.tracking_number?" · "+p.tracking_number:""));a.href=url;a.target="_blank";a.rel="noopener noreferrer";a.className="fsb-order-link";card.append(a);}else card.append(text("p","Tracking: "+(p.tracking_number||"Pending"),"fsb-order-muted"));});
 const footer=document.createElement("div");footer.className="fsb-order-actions";footer.append(text("strong","Total "+money(order.grand_total)));
 const inquiry=text("a","ORDER INQUIRY");inquiry.className="fsb-order-link";inquiry.href="account.html?order="+encodeURIComponent(order.id)+"#supportForm";footer.append(inquiry);card.append(footer);host.append(card);
 }
 if(sync.error||sync.data?.unavailable)host.append(text("p","Showing saved tracking details. Carrier updates could not be refreshed right now.","fsb-order-muted"));
 const requested=new URLSearchParams(location.search).get("order");if(requested&&orders.some(o=>String(o.id)===requested))document.getElementById("fsb-order-"+requested)?.scrollIntoView({block:"center"});
 }catch{host.replaceChildren(text("p","Your orders could not be loaded. Please refresh to try again.","empty"));}
 finally{loading=false;if(refresh)refresh.disabled=false;}
 }
 document.getElementById("refreshFsbOrders")?.addEventListener("click",load);
 client.auth.onAuthStateChange(()=>setTimeout(load,0));load();
})();