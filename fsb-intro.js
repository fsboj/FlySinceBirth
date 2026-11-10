/* A short first-visit brand intro. Never blocks deep links, recovery, or playback frames. */
(() => {
 const key='fsbIntroSeen:v1',root=document.documentElement;
 const params=new URLSearchParams(location.search),auth=['code','token_hash','access_token','type','error','error_description'].some(name=>params.has(name));
 if(window.self!==window.top||location.hash||auth||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 try{if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1');}catch(_){return;}
 const style=document.createElement('style');style.textContent=`
 html.fsb-intro-active{overflow:hidden!important}
 html.fsb-intro-active body>:not(#fsbIntro):not(script):not(style){visibility:hidden!important}
 #fsbIntro{position:fixed;inset:0;z-index:100000;background:radial-gradient(ellipse at center,#171717 0%,#050505 65%);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:24px;color:#eee;font-family:Arial,sans-serif;opacity:1;transition:opacity .2s ease}
 #fsbIntro.fsb-intro-leaving{opacity:0;pointer-events:none}
 #fsbIntro .fsb-intro-mark{position:relative;width:min(56vw,310px);height:min(64vw,350px);animation:fsbIntroReveal 1s cubic-bezier(.2,.7,.2,1) both}
 #fsbIntro .fsb-intro-mark img{display:block;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 0 25px #fff1)}
 #fsbIntro .fsb-intro-mark:after{content:"";position:absolute;inset:0;background:linear-gradient(112deg,transparent 35%,#fff9 48%,#fff 50%,#fff5 53%,transparent 65%);background-size:300% 100%;background-position:150% 0;mask:url('fsbchrome.PNG') center/contain no-repeat;-webkit-mask:url('fsbchrome.PNG') center/contain no-repeat;mix-blend-mode:screen;animation:fsbIntroSweep 1.5s .2s ease-out both;pointer-events:none}
 #fsbIntro .fsb-intro-name{font-size:11px;letter-spacing:.38em;text-align:center;padding:0 24px;opacity:0;animation:fsbIntroName .6s .35s ease forwards}
 #fsbIntroSkip{position:absolute;bottom:max(24px,env(safe-area-inset-bottom));right:max(24px,env(safe-area-inset-right));min-height:44px;padding:10px 17px;border:1px solid #ffffff55;border-radius:24px;background:#101010;color:#ddd;font:12px Arial,sans-serif;letter-spacing:.08em;cursor:pointer}
 #fsbIntroSkip:hover{background:#242424;border-color:#aaa}#fsbIntroSkip:focus-visible{outline:2px solid white;outline-offset:4px}
 @keyframes fsbIntroReveal{from{opacity:0;transform:translateY(10px) scale(.93)}to{opacity:1;transform:translateY(0) scale(1)}}
 @keyframes fsbIntroSweep{from{background-position:150% 0;opacity:0}20%{opacity:.7}to{background-position:-50% 0;opacity:0}}
 @keyframes fsbIntroName{to{opacity:.8}}
 @media(max-width:600px){#fsbIntro .fsb-intro-mark{width:min(64vw,260px);height:min(75vw,300px)}#fsbIntroSkip{right:20px;bottom:max(20px,env(safe-area-inset-bottom))}}
 `;document.head.append(style);root.classList.add('fsb-intro-active');
 let overlay,observer,normalTimer,fadeTimer,hardTimer,finished=false,previousFocus=document.activeElement;
 function finish(){if(finished)return;finished=true;clearTimeout(normalTimer);clearTimeout(fadeTimer);clearTimeout(hardTimer);observer?.disconnect();root.classList.remove('fsb-intro-active');const restore=overlay?.contains(document.activeElement);overlay?.remove();style.remove();document.removeEventListener('keydown',keys,true);window.removeEventListener('pagehide',finish);if(restore){const target=previousFocus&&previousFocus!==document.body&&previousFocus.isConnected?previousFocus:document.querySelector('.public-nav a');target?.focus({preventScroll:true});}}
 function close(){if(finished)return;overlay?.classList.add('fsb-intro-leaving');clearTimeout(normalTimer);fadeTimer=setTimeout(finish,200);}
 function keys(event){if(event.key==='Escape'){event.preventDefault();close();}else if(event.key==='Tab'){event.preventDefault();document.getElementById('fsbIntroSkip')?.focus({preventScroll:true});}}
 function mount(){if(!document.body||finished||overlay)return;observer?.disconnect();overlay=document.createElement('div');overlay.id='fsbIntro';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Fly Since Birth intro');overlay.innerHTML='<div class="fsb-intro-mark" aria-hidden="true"><img src="fsbchrome.PNG" alt="" fetchpriority="high"></div><div class="fsb-intro-name">FLY SINCE BIRTH</div><button id="fsbIntroSkip" type="button">SKIP INTRO</button>';document.body.prepend(overlay);overlay.querySelector('img').onerror=finish;const skip=overlay.querySelector('button');skip.onclick=close;skip.focus({preventScroll:true});document.addEventListener('keydown',keys,true);normalTimer=setTimeout(close,1800);}
 window.addEventListener('pagehide',finish);hardTimer=setTimeout(finish,3000);
 if(document.body)mount();else{observer=new MutationObserver(mount);observer.observe(root,{childList:true,subtree:true});}
})();