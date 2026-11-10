/* Six homepage merch slots; manual images stay saved when Auto is enabled. */
(() => {
 const key='merch_rotation_slots';
 function defaults(){return Array.from({length:6},()=>({auto:true,product_id:null}));}
 function settings(value){try{const raw=typeof value==='string'?JSON.parse(value):value;return defaults().map((fallback,i)=>({auto:raw?.[i]?.auto!==false,product_id:Number(raw?.[i]?.product_id)>0?Number(raw[i].product_id):null}));}catch(_){return defaults();}}
 function shuffle(items,rng=Math.random){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
 function slots(products,manual,config,rng=Math.random){
  const catalog=products.filter(p=>p.active!==false&&Array.isArray(p.images)&&p.images.some(Boolean)).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)||Number(b.id)-Number(a.id));
  const used=new Set(config.filter(s=>!s.auto&&s.product_id).map(s=>Number(s.product_id)));
  const result=Array(6).fill(null);
  for(let i=0;i<6;i++){
   const setting=config[i]||{auto:true};
   if(!setting.auto){const row=manual.find(r=>Number(r.sort_order)===i);if(row?.visible!==false&&row?.image_url){const p=catalog.find(p=>Number(p.id)===setting.product_id);result[i]={src:row.image_url,product_id:p?.id||null,name:p?.name||'FSB merch',slot:i,auto:false};}continue;}
   const remaining=catalog.filter(p=>!used.has(Number(p.id))),p=i<4?remaining[0]:shuffle(remaining,rng)[0];
   if(p){used.add(Number(p.id));result[i]={src:p.images.find(Boolean),product_id:p.id,name:p.name,slot:i,auto:true};}
  }
  return result;
 }
 let generation=0;
 async function start(client){
  const token=++generation,element=document.querySelector('.clothing-box img');if(!element)return;
  if(window.merchRotationTimer)clearInterval(window.merchRotationTimer);
  const [settingResult,manualResult,productResult]=await Promise.all([
   client.from('site_content').select('key,value').in('key',[key,'merch_hover_delay','merch_hover_cycle']),
   client.from('merch_image_rotation').select('image_url,sort_order,visible,id').order('sort_order').order('id'),
   client.from('merch_products').select('id,name,images,active,created_at').eq('active',true).order('created_at',{ascending:false}).order('id',{ascending:false})
  ]);
  if(token!==generation)return;
  if(settingResult.error||manualResult.error||productResult.error){console.warn('Could not load homepage merch rotation.');return;}
  const values=Object.fromEntries((settingResult.data||[]).map(r=>[r.key,r.value])),config=settings(values[key]);
  const delay=Math.max(1,Math.min(120,parseInt(values.merch_hover_delay,10)||10))*1000,max=Math.max(1,Math.min(6,parseInt(values.merch_hover_cycle,10)||6));
  let frames=slots(productResult.data||[],manualResult.data||[],config).slice(0,max).filter(Boolean),index=0,draw=0;if(!frames.length)return;
  let link=document.getElementById('homeMerchProductLink');if(!link){link=document.createElement('a');link.id='homeMerchProductLink';element.before(link);link.append(element);link.style.cssText='display:flex;align-items:center;justify-content:center;width:100%;height:100%;text-decoration:none';}
  async function show(frame,fade){const drawToken=++draw;const preload=new Image();preload.src=frame.src;try{await preload.decode();}catch(_){if(!preload.complete||!preload.naturalWidth)return;}if(token!==generation||drawToken!==draw)return;
   const update=()=>{if(token!==generation||drawToken!==draw)return;element.src=frame.src;element.alt=frame.name;link.href='merch.html'+(frame.product_id?'?product='+encodeURIComponent(frame.product_id):'');link.setAttribute('aria-label',frame.product_id?'Shop '+frame.name:'Visit the FSB shop');link.title=frame.name;element.dataset.merchProduct=frame.product_id||'';element.dataset.merchSlot=String(frame.slot+1);element.style.opacity='1';};
   const motion=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;element.style.transition=motion?'opacity .3s ease':'none';
   if(fade&&motion){element.style.opacity='0';setTimeout(update,300);}else update();
  }
  show(frames[0],false);
  if(frames.length>1)window.merchRotationTimer=setInterval(()=>{if(document.hidden||!element.getClientRects().length)return;index++;if(index>=frames.length){index=0;frames=slots(productResult.data||[],manualResult.data||[],config).slice(0,max).filter(Boolean);}if(frames[index])show(frames[index],true);},delay);
 }
 window.FSBMerchRotation={key,defaults,settings,slots,start};
})();