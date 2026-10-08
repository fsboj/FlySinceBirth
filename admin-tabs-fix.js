(function(){
function init(){
 const n=document.querySelector('.admin-nav'),m=document.getElementById('mainPage');
 if(!n||!m)return;
 const bs=[...n.querySelectorAll('button')],ids=['mainPage','sideMenu','artistPages','upcoming'];
 bs.forEach((b,i)=>b.onclick=e=>{e.preventDefault();bs.forEach(x=>x.classList.remove('active'));b.classList.add('active');ids.forEach(id=>{const p=document.getElementById(id);if(p)p.style.display=id===ids[i]?'block':'none'});if(ids[i]==='mainPage')sub('site');if(ids[i]==='artistPages')openArtistManager()});
 const ids2=['site','photos','text','music','artists','videos','events','merch','sections'],ts=[...document.querySelectorAll('.main-page-tabs button')],h=document.getElementById('mainPageSubPanels');
 ids2.forEach(id=>{const p=document.getElementById(id);if(p&&h&&p.parentElement!==h){p.classList.remove('panel','active');p.classList.add('main-page-subpanel');p.style.display='none';h.appendChild(p)}});
 function sub(id){document.querySelectorAll('.main-page-subpanel').forEach(p=>p.style.display='none');ts.forEach(x=>x.classList.remove('active'));const p=document.getElementById(id);if(p)p.style.display='block';const b=ts.find(x=>(x.getAttribute('onclick')||'').includes("'"+id+"'"));if(b)b.classList.add('active')}
 ts.forEach(b=>b.onclick=e=>{e.preventDefault();const z=(b.getAttribute('onclick')||'').match(/showMainSubPanel\(['"]([^'"]+)/);if(z)sub(z[1])});
 sub('site');
 openArtistManager();
}
function openArtistManager(){
 const s=document.getElementById('artistPageSelect');
 if(!s)return;
 if(![...s.options].some(o=>o.value==='3')){const o=document.createElement('option');o.value='3';o.textContent='FSB CHNXX';s.appendChild(o)}
 s.onchange=function(){
  const id=this.value;
  const manager=document.getElementById('artistPageManager');
  if(!id){if(manager)manager.style.display='none';return}
  if(manager)manager.style.display='block';
  window.selectedArtistPageId=String(id);
  const opt=this.options[this.selectedIndex];
  const name=opt?opt.textContent:'ARTIST';
  const ni=document.getElementById('artistPageName');if(ni)ni.value=name;
  const sn=document.getElementById('selectedArtistName');if(sn)sn.textContent=name;
  Promise.resolve().then(async function(){
   if(typeof window.loadArtistSongsAdmin==='function')await window.loadArtistSongsAdmin();
   if(typeof window.loadArtistReleasesAdmin==='function')await window.loadArtistReleasesAdmin();
   if(typeof window.loadArtistLinksAdmin==='function')await window.loadArtistLinksAdmin();
  }).catch(function(e){
   console.error('Artist manager error',e);
   const r=document.getElementById('artistReleasesAdminList');
   if(r)r.innerHTML='<div class="admin-item"><div class="item-name">ERROR LOADING ARTIST MUSIC</div><div class="item-meta">'+String(e.message||e)+'</div></div>';
  });
 };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();