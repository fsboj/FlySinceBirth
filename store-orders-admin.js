(() => {
  const $ = id => document.getElementById(id);
  const host = $("store");
  if (!host) return;
  const section = document.createElement("div");
  section.style.cssText = "margin-top:40px;padding-top:28px;border-top:1px solid #333";
  section.innerHTML = '<div class="panel-title">CUSTOMER ORDERS</div><p class="panel-description">Paid orders are ready for fulfillment. Ship your own inventory or place other supplier orders manually using the product link. Add tracking here for the customer to see in their account.</p><button class="button" type="button" id="refreshStoreOrders">REFRESH ORDERS</button><p id="storeOrdersStatus" class="item-meta" role="status"></p><div id="storeOrdersList"></div><button class="button" type="button" id="moreStoreOrders" hidden>LOAD MORE ORDERS</button>';
  host.appendChild(section);
  let limit = 30, busy = false;
  const text = (tag, value, parent) => { const e = document.createElement(tag); e.textContent = value; parent.appendChild(e); return e; };
  function safeUrl(value) { try { const url = new URL(value); return url.protocol === "https:" ? url.href : ""; } catch (_) { return ""; } }
  function field(label, value, parent) {
    const wrap = document.createElement("label"); wrap.style.cssText = "display:grid;gap:6px;font-size:10px;letter-spacing:1px";
    text("span",label,wrap);
    const input = document.createElement("input"); input.value = value || ""; input.style.cssText = "background:#111;color:#fff;border:1px solid #444;padding:10px"; wrap.appendChild(input); parent.appendChild(wrap); return input;
  }
  async function load() {
    if (busy) return; busy = true; $("refreshStoreOrders").disabled = true; $("storeOrdersStatus").textContent = "Loading orders…";
    try {
      const result = await supabaseClient.from("fsb_store_orders").select("*").order("created_at",{ascending:false}).limit(limit+1);
      if (result.error) throw result.error;
      const orders = (result.data || []).slice(0,limit), ids = orders.map(o=>o.id);
      $("moreStoreOrders").hidden = (result.data || []).length <= limit;
      const itemResult = ids.length ? await supabaseClient.from("fsb_store_order_items").select("*").in("order_id",ids).order("id") : {data:[]};
      if (itemResult.error) throw itemResult.error;
      const items = itemResult.data || [], productIds = [...new Set(items.map(i=>i.product_id).filter(Boolean))];
      const productsResult = productIds.length ? await supabaseClient.from("merch_products").select("id,supplier_product_id,supplier_product_url").in("id",productIds) : {data:[]};
      if (productsResult.error) throw productsResult.error;
      const products = new Map((productsResult.data || []).map(p=>[p.id,p]));
      $("storeOrdersList").replaceChildren();
      for (const order of orders) {
        const card=document.createElement("section");card.style.cssText="margin-top:20px;border:1px solid #333;padding:20px";
        text("h3",order.order_number,card);
        text("p",String(order.payment_status).toUpperCase()+" · "+String(order.fulfillment_status).replaceAll("_"," ").toUpperCase()+" · $"+Number(order.grand_total).toFixed(2)+" "+String(order.currency).toUpperCase(),card);
        text("p",[order.customer_name,order.customer_email,new Date(order.created_at).toLocaleString()].filter(Boolean).join(" · "),card);
        const address=order.shipping_address||{};
        const delivery=text("p",[address.name,address.address1,address.address2,address.city,address.state_code,address.zip,address.country_code,address.phone].filter(Boolean).join(" · "),card);
        delivery.style.cssText="font-size:12px;color:#aaa;line-height:1.8;overflow-wrap:anywhere";
        const orderItems=items.filter(i=>i.order_id===order.id);
        for(const item of orderItems){
          const row=document.createElement("div");row.style.cssText="margin-top:18px;padding-top:16px;border-top:1px solid #333";card.appendChild(row);
          const product=products.get(item.product_id)||{};
          text("strong",item.product_name+" × "+item.quantity+[item.variant_size,item.variant_color].filter(Boolean).map(v=>" · "+v).join(""),row);
          text("p",({own_inventory:"SHIP FROM YOUR INVENTORY",supplier:"ORDER FROM OTHER SUPPLIER",printful:"PRINTFUL"})[item.fulfillment_method]+" · "+(item.supplier_name||"")+" "+(product.supplier_product_id?"· SKU "+product.supplier_product_id:""),row);
          const url=safeUrl(product.supplier_product_url);
          if(url){const a=text("a","OPEN SUPPLIER PRODUCT",row);a.href=url;a.target="_blank";a.rel="noopener noreferrer";a.style.cssText="color:#fff;text-decoration:underline;font-size:11px";}
          const fields=document.createElement("div");fields.style.cssText="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:12px 0";row.appendChild(fields);
          const statusWrap=document.createElement("label");fields.appendChild(statusWrap);text("span","FULFILLMENT STATUS",statusWrap);
          const status=document.createElement("select");status.style.cssText="display:block;width:100%;background:#111;color:#fff;padding:10px;border:1px solid #444";statusWrap.appendChild(status);
          for(const value of ["unfulfilled","processing","fulfilled","cancelled","failed"]){const option=document.createElement("option");option.value=value;option.textContent=value.replaceAll("_"," ").toUpperCase();option.selected=value===item.fulfillment_status;status.appendChild(option);}
          const supplierOrder=field("SUPPLIER ORDER ID",item.supplier_order_id,fields);
          const tracking=field("TRACKING NUMBER",item.tracking_number,fields);
          const trackingUrl=field("TRACKING LINK (HTTPS)",item.tracking_url,fields);
          const save=text("button","SAVE FULFILLMENT",row);save.type="button";save.className="button";
          const message=text("p","",row);message.setAttribute("role","status");message.className="item-meta";
          const paid=order.payment_status==="paid";
          [status,supplierOrder,tracking,trackingUrl,save].forEach(e=>e.disabled=!paid);
          if(!paid)message.textContent="Fulfill only after payment is confirmed.";
          save.onclick=async()=>{
            const link=trackingUrl.value.trim();if(link&&!safeUrl(link)){message.textContent="Use a tracking link beginning with https://.";return;}
            save.disabled=true;message.textContent="Saving…";
            try{
              const fresh=await supabaseClient.from("fsb_store_orders").select("payment_status").eq("id",order.id).single();
              if(fresh.error)throw fresh.error;if(fresh.data.payment_status!=="paid")throw new Error("Payment is not confirmed.");
              const updated=await supabaseClient.from("fsb_store_order_items").update({fulfillment_status:status.value,supplier_order_id:supplierOrder.value.trim()||null,tracking_number:tracking.value.trim()||null,tracking_url:link||null}).eq("id",item.id).eq("order_id",order.id);
              if(updated.error)throw updated.error;
              const states=await supabaseClient.from("fsb_store_order_items").select("fulfillment_status").eq("order_id",order.id);if(states.error)throw states.error;
              const values=(states.data||[]).map(i=>i.fulfillment_status);
              const overall=values.every(v=>v==="fulfilled")?"fulfilled":values.some(v=>v==="fulfilled")?"partially_fulfilled":values.every(v=>v==="cancelled")?"cancelled":values.some(v=>v==="processing")?"processing":"unfulfilled";
              const updateOrder=await supabaseClient.from("fsb_store_orders").update({fulfillment_status:overall,updated_at:new Date().toISOString()}).eq("id",order.id).eq("payment_status","paid");
              if(updateOrder.error)throw updateOrder.error;
              message.textContent="Saved. The customer can see this in their account.";
            }catch(error){message.textContent=error.message||"Could not save fulfillment.";}finally{save.disabled=false;}
          };
        }
        $("storeOrdersList").appendChild(card);
      }
      $("storeOrdersStatus").textContent=orders.length?"Showing "+orders.length+" recent orders.":"No store orders yet.";
    }catch(error){$("storeOrdersStatus").textContent=error.message||"Could not load orders.";}finally{busy=false;$("refreshStoreOrders").disabled=false;}
  }
  $("refreshStoreOrders").onclick=()=>{limit=30;load();};
  $("moreStoreOrders").onclick=()=>{limit+=30;load();};
  document.querySelectorAll(".admin-nav button").forEach(button=>button.addEventListener("click",()=>{queueMicrotask(()=>{if(host.classList.contains("active"))load();});}));
})();
