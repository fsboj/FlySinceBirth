/* Silent cover loops. The original image stays in place as the fallback. */
(() => {
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'), loops=new Set();
 const style=document.createElement('style');style.textContent='.fsb-motion-cover{position:absolute!important;object-fit:cover;pointer-events:none;z-index:1;background:#111}.fsb-motion-player{width:64px;height:64px;object-fit:cover;display:block;margin:0 12px 0 0;flex-shrink:0}.mini-player-info.fsb-has-art{display:flex;align-items:center}.fsb-motion-now{display:flex;align-items:center;gap:12px;margin-bottom:12px}.fsb-motion-now img{width:72px;height:72px;object-fit:cover}';document.head.append(style);
 const safe=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
 function update(){for(const item of loops){if(!item.video.isConnected){item.video.pause();item.resize.disconnect();observer.unobserve(item.video);loops.delete(item);continue;}if(item.visible&&!document.hidden&&!reduced.matches&&!navigator.connection?.saveData){item.video.play().catch(()=>{});}else item.video.pause();item.video.hidden=reduced.matches||!!navigator.connection?.saveData;}}
 const observer=new IntersectionObserver(entries=>{for(const e of entries){const item=[...loops].find(x=>x.video===e.target);if(item)item.visible=e.isIntersecting;}update();},{threshold:.05});
 function mount(image,song){
  if(!image||!song)return;const parent=image.parentElement;if(!parent)return;
  if(!image.isConnected){requestAnimationFrame(()=>{if(image.isConnected)mount(image,song);});return;}
  const prior=[...loops].find(x=>x.image===image);if(prior){prior.video.pause();prior.video.remove();prior.resize.disconnect();observer.unobserve(prior.video);loops.delete(prior);}
  const url=safe(song.animated_artwork_url);if(!url)return;
  if(getComputedStyle(parent).position==='static')parent.style.position='relative';
  const video=document.createElement('video');video.className='fsb-motion-cover';video.muted=true;video.defaultMuted=true;video.loop=true;video.playsInline=true;video.preload='none';video.setAttribute('muted','');video.setAttribute('playsinline','');video.setAttribute('aria-hidden','true');video.tabIndex=-1;
  const position=()=>{if(!image.isConnected)return;video.style.left=image.offsetLeft+'px';video.style.top=image.offsetTop+'px';video.style.width=image.offsetWidth+'px';video.style.height=image.offsetHeight+'px';video.style.borderRadius=getComputedStyle(image).borderRadius;};
  const resize=new ResizeObserver(position),item={video,image,resize,visible:false};
  video.addEventListener('error',()=>{video.remove();resize.disconnect();observer.unobserve(video);loops.delete(item);},{once:true});
  video.style.opacity='0';video.addEventListener('loadeddata',()=>{video.style.opacity='1';},{once:true});video.src=url;parent.append(video);resize.observe(image);image.addEventListener('load',position,{once:true});requestAnimationFrame(position);loops.add(item);observer.observe(video);update();
 }
 function decorate(element,song){const image=element.querySelector('img');if(image)mount(image,song);}
 function player(song){
  let host=document.querySelector('.mini-player-info');
  if(host){let image=host.querySelector('.fsb-motion-player');if(!image){const text=document.createElement('div');while(host.firstChild)text.append(host.firstChild);image=document.createElement('img');image.className='fsb-motion-player';image.alt='';host.append(image,text);host.classList.add('fsb-has-art');}image.src=safe(song.image_url)||'fsblogo.PNG';mount(image,song);return;}
  const release=document.getElementById('releaseImage');if(release){release.src=safe(song.image_url)||release.src;mount(release,song);return;}
  host=document.querySelector('.player');if(host){let row=host.querySelector('.fsb-motion-now');if(!row){row=document.createElement('div');row.className='fsb-motion-now';row.innerHTML='<img alt=""><span></span>';host.prepend(row);}row.querySelector('img').src=safe(song.image_url)||'fsblogo.PNG';row.querySelector('span').textContent=song.title||'';mount(row.querySelector('img'),song);}
 }
 document.addEventListener('visibilitychange',update);reduced.addEventListener('change',update);
 new MutationObserver(()=>{if([...loops].some(x=>!x.video.isConnected))update();}).observe(document.body,{childList:true,subtree:true});
 window.FSBMotion={mount,decorate,player};
})();
