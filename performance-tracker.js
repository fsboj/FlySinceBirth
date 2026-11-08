/* First-party playback activity. No IP addresses, fingerprints or query strings. */
(() => {
  if(window.fsbTrackMedia)return;
  const endpoint='https://ccvhvxugoebdqwxxankl.supabase.co/functions/v1/performance-track';
  const key='sb_publishable_vXhQFYGVd6hOHsX4i-ePnw_y687N16Z';
  let visitor;
  try{visitor=localStorage.getItem('fsb-performance-visitor');if(!/^[0-9a-f-]{36}$/i.test(visitor||'')){visitor=crypto.randomUUID();localStorage.setItem('fsb-performance-visitor',visitor);}}catch(_){visitor=crypto.randomUUID();}
  const states=new WeakMap();
  const client=()=>window.supabaseClient||(typeof supabaseClient!=='undefined'?supabaseClient:null);
  function state(type,content){return {id:crypto.randomUUID(),type,content,sent:new Set(),seconds:0,last:0,chain:Promise.resolve()};}
  function send(s,phase){
    if(s.sent.has(phase)||navigator.doNotTrack==='1')return;
    s.sent.add(phase);
    s.chain=s.chain.then(async()=>{
      const session=await client()?.auth.getSession();
      const token=session?.data?.session?.access_token;
      const headers={'Content-Type':'application/json',apikey:key};if(token)headers.Authorization='Bearer '+token;
      const body={visitor_id:visitor,playback_id:s.id,media_type:s.type,content_key:s.content,phase,source_path:location.pathname};
      for(let attempt=0;attempt<2;attempt++){
        try{const r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(body),keepalive:true});if(r.ok||r.status<500)return;}catch(_){}
      }
    }).catch(()=>{});
  }
  function progress(s,playing,duration){
    const now=performance.now();
    if(playing){if(s.last)s.seconds+=Math.min(2.5,(now-s.last)/1000);s.last=now;
      if(s.seconds>=Math.min(30,Number.isFinite(duration)&&duration>0?duration*.5:30))send(s,'engaged');
      if(Number.isFinite(duration)&&duration>0&&s.seconds>=duration*.9)send(s,'complete');
    }else s.last=0;
  }
  window.fsbTrackMedia=(element,type,content)=>{
    if(!element||!content)return;
    const s=state(type,content);states.set(element,s);
    if(element.dataset.fsbTrackingBound)return;
    element.dataset.fsbTrackingBound='true';
    element.addEventListener('playing',()=>{let s=states.get(element);if(s.finished){s=state(s.type,s.content);states.set(element,s);}send(s,'start');s.last=performance.now();});
    element.addEventListener('timeupdate',()=>{const s=states.get(element);progress(s,!element.paused&&!element.seeking&&!element.ended,element.duration);});
    ['pause','waiting','seeking'].forEach(event=>element.addEventListener(event,()=>{states.get(element).last=0;}));
    element.addEventListener('ended',()=>{const s=states.get(element);progress(s,false,element.duration);s.finished=true;});
  };
  let ytPromise,vmPromise;
  function loadSdk(url,ready){return new Promise((resolve,reject)=>{if(ready())return resolve();const tag=document.createElement('script');tag.src=url;tag.onload=()=>resolve();tag.onerror=reject;document.head.appendChild(tag);});}
  window.fsbTrackVideo=(element,content)=>{
    if(!element||!content)return;
    if(element.tagName==='VIDEO'){window.fsbTrackMedia(element,'video',content);return;}
    const s=state('video',content);send(s,'open');
    let url;try{url=new URL(element.src);}catch(_){return;}
    if(/(^|\.)youtube(?:-nocookie)?\.com$/.test(url.hostname)){
      url.searchParams.set('enablejsapi','1');url.searchParams.set('origin',location.origin);element.src=url.href;
      ytPromise ||= new Promise((resolve,reject)=>{if(window.YT?.Player)return resolve();const prev=window.onYouTubeIframeAPIReady;window.onYouTubeIframeAPIReady=()=>{prev?.();resolve();};loadSdk('https://www.youtube.com/iframe_api',()=>!!window.YT?.Player).catch(reject);});
      ytPromise.then(()=>{if(!element.isConnected)return;let playing=false;
        const player=new YT.Player(element,{events:{onStateChange:e=>{playing=e.data===1;if(playing){if(s.finished){s.id=crypto.randomUUID();s.sent.clear();s.seconds=0;s.finished=false;}send(s,'start');s.last=performance.now();}else{s.last=0;if(e.data===0){s.finished=true;window.dispatchEvent(new CustomEvent("fsb:video-ended",{detail:{content}}));}}}}});
        const timer=setInterval(()=>{if(!element.isConnected){clearInterval(timer);return;}try{progress(s,playing,player.getDuration());}catch(_){}},1000);
      }).catch(()=>{});
    }else if(url.hostname==='player.vimeo.com'){
      vmPromise ||= loadSdk('https://player.vimeo.com/api/player.js',()=>!!window.Vimeo?.Player);
      vmPromise.then(()=>{const player=new Vimeo.Player(element);player.on('play',()=>{if(s.finished){s.id=crypto.randomUUID();s.sent.clear();s.seconds=0;s.finished=false;}send(s,'start');s.last=performance.now();});player.on('timeupdate',d=>progress(s,true,d.duration));player.on('pause',()=>{s.last=0;});player.on('ended',()=>{s.last=0;s.finished=true;window.dispatchEvent(new CustomEvent('fsb:video-ended',{detail:{content}}));});}).catch(()=>{});
    }
  };
})();


