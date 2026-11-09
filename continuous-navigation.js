/* Keep the audio document alive while same-site pages change. */
(() => {
 const pages=new Set(['','index.html','artists.html','artist.html','music.html','epalbum.html','my-fsb.html','merch.html','events.html','account.html','videos.html','video.html']);
 const embedded=window.parent!==window && window.parent.location.origin===location.origin && window.parent.FSBNavigation;
 if(embedded){
  window.FSBNavigation=window.parent.FSBNavigation;
  document.addEventListener('click',follow,true);
  document.addEventListener('play',event=>{if(event.target instanceof HTMLVideoElement)window.parent.FSBPlayer?.audio.pause();},true);
  return;
 }
 let frame=null,observer=null,titleObserver=null;
 function active(){return !!window.FSBPlayer?.getState().queue.length;}
 function resize(){if(frame){const height=document.getElementById('miniPlayer')?.hidden?0:document.getElementById('miniPlayer')?.getBoundingClientRect().height||0;frame.style.bottom=height+'px';frame.style.height='calc(100% - '+height+'px)';}}
 function navigate(value,push=true){
  const url=new URL(value,location.href);
  url.searchParams.delete('_fsb_page');
  const pageURL=new URL(url);pageURL.searchParams.set('_fsb_page','20261109-v2');
  if(!frame){
   const style=document.createElement('style');style.textContent='body.fsb-continuous-site> :not(#miniPlayer):not(#fsbSitePage):not(script):not(style){display:none!important}body.fsb-continuous-site{overflow:hidden!important;padding:0!important}#fsbSitePage{position:fixed;inset:0;width:100%;height:auto;border:0;z-index:900;background:#080808}body.fsb-continuous-site>#miniPlayer{z-index:1000}';document.head.append(style);
   frame=document.createElement('iframe');frame.id='fsbSitePage';frame.title='Fly Since Birth website';frame.allow='autoplay; fullscreen';
   frame.addEventListener('load',()=>{try{const child=frame.contentWindow;if(child.location.origin!==location.origin)return;document.title=child.document.title;titleObserver?.disconnect();titleObserver=new MutationObserver(()=>{document.title=child.document.title;});titleObserver.observe(child.document.head,{childList:true,subtree:true,characterData:true});const destination=new URL(child.location.href);destination.searchParams.delete('_fsb_page');if(destination.href!==location.href)history.replaceState({fsbContinuous:true},'',destination.href);resize();}catch(_){}});
   frame.src=pageURL.href;document.body.append(frame);document.body.classList.add('fsb-continuous-site');
   observer=new ResizeObserver(resize);const bar=document.getElementById('miniPlayer');if(bar)observer.observe(bar);window.addEventListener('resize',resize);resize();
  }else frame.contentWindow.location.replace(pageURL.href);
  if(push)history.pushState({fsbContinuous:true},'',url.href);
 }
 function follow(event){
  const link=event.target.closest?.('a[href]');if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.hasAttribute('download')||link.target&&link.target!=='_self')return;
  const url=new URL(link.href,location.href);
  if(url.origin!==location.origin||!pages.has(url.pathname.split('/').pop())){if(embedded)link.target='_top';return;}
  if(url.pathname===location.pathname&&url.search===location.search&&url.hash)return;
  if(!embedded&&!active()&&!frame)return;
  event.preventDefault();event.stopPropagation();window.FSBNavigation.navigate(url.href);
 }
 function go(value){const url=new URL(value,location.href);if(url.origin===location.origin&&pages.has(url.pathname.split('/').pop())&&(active()||frame))navigate(url.href);else window.location.assign(url.href);}
 window.FSBNavigation={navigate,go};
 document.addEventListener('click',follow,true);
 window.addEventListener('popstate',()=>{if(frame)navigate(location.href,false);});
})();