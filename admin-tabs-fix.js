(function(){
function init(){
 const n=document.querySelector('.admin-nav'),m=document.getElementById('mainPage');
 if(!n||!m)return;
 const bs=[...n.querySelectorAll('button')],ids=['mainPage','sideMenu','artistPages','upcoming'];
 bs.forEach((b,i)=>b.onclick=e=>{e.preventDefault();bs.forEach(x=>x.classList.remove('active'));b.classList.add('active');ids.forEach(id=>{const p=document.getElementById(id);if(p)p.style.display=id===ids[i]?'block':'none'});if(ids[i]==='mainPage')sub('site');if(ids[i]==='artistPages')openArtistManager()});
 const ids2=['site','photos','music','artists','videos','events','merch','sections'],ts=[...document.querySelectorAll('.main-page-tabs button')],h=document.getElementById('mainPageSubPanels');
 ids2.forEach(id=>{const p=document.getElementById(id);if(p&&h&&p.parentElement!==h){p.classList.remove('panel','active');p.classList.add('main-page-subpanel');p.style.display='none';h.appendChild(p)}});
 function sub(id){document.querySelectorAll('.main-page-subpanel').forEach(p=>p.style.display='none');ts.forEach(x=>x.classList.remove('active'));const p=document.getElementById(id);if(p)p.style.display='block';const b=ts.find(x=>(x.getAttribute('onclick')||'').includes("'"+id+"'"));if(b)b.classList.add('active')}
 ts.forEach(b=>b.onclick=e=>{e.preventDefault();const z=(b.getAttribute('onclick')||'').match(/showMainSubPanel\(['"]([^'"]+)/);if(z)sub(z[1])});
 sub('site');openArtistManager();
}
function openArtistManager(){
 const s=document.getElementById('artistPageSelect');
 if(!s)return;
 if(![...s.options].some(o=>o.value==='3')){const o=document.createElement('option');o.value='3';o.textContent='FSB CHNXX';s.appendChild(o)}
 s.onchange=function(){
  const id=this.value,manager=document.getElementById('artistPageManager');
  if(!id){if(manager)manager.style.display='none';return}
  if(manager)manager.style.display='block';
  renderArtistMusic(id);
 };
}
async function renderArtistMusic(artistId){
 const songList=document.getElementById('artistSongsAdminList');
 const releaseList=document.getElementById('artistReleasesAdminList');
 if(songList)songList.innerHTML='<div class="admin-item"><div class="item-name">LOADING SONGS...</div></div>';
 if(releaseList)releaseList.innerHTML='<div class="admin-item"><div class="item-name">LOADING ALBUMS / EPS...</div></div>';
 try{
  const [sr,rr]=await Promise.all([
   supabaseClient.from('artist_songs').select('*').eq('artist_id',artistId).order('created_at',{ascending:false}),
   supabaseClient.from('artist_releases').select('*').eq('artist_id',artistId).order('created_at',{ascending:false})
  ]);
  if(sr.error)throw sr.error;
  if(rr.error)throw rr.error;
  const songs=sr.data||[], releases=rr.data||[];
  if(songList){
   const singles=songs.filter(x=>!x.release_id);
   songList.innerHTML=singles.length?'':'<div class="admin-item"><div class="item-name">NO STANDALONE SONGS</div></div>';
   singles.forEach(x=>{const row=document.createElement('div');row.className='admin-item';row.innerHTML='<div><div class="item-name">'+esc(x.title)+'</div><div class="item-meta">SINGLE</div></div><div class="actions"><button class="button" type="button" onclick="editArtistSong(\''+x.id+'\')">EDIT</button><button class="button danger" type="button" onclick="deleteArtistSong(\''+x.id+'\')">DELETE</button></div>';songList.appendChild(row)});
  }
  if(releaseList){
   releaseList.innerHTML=releases.length?'':'<div class="admin-item"><div class="item-name">NO ALBUMS OR EPS</div></div>';
   for(const rel of releases){
    const tracks=songs.filter(x=>String(x.release_id)===String(rel.id)).sort((a,b)=>(a.track_number||0)-(b.track_number||0));
    const row=document.createElement('div');row.className='admin-item';row.style.display='block';
    row.innerHTML='<div style="display:flex;justify-content:space-between;gap:15px;align-items:center"><div><div class="item-name">'+esc(rel.title)+'</div><div class="item-meta">'+esc(String(rel.type||'RELEASE').toUpperCase())+' • '+tracks.length+' TRACKS</div></div><div class="actions" style="margin-top:0"><button class="button" type="button" onclick="editArtistRelease(\''+rel.id+'\')">EDIT RELEASE</button><button class="button danger" type="button" onclick="deleteArtistRelease(\''+rel.id+'\')">DELETE</button></div></div><div class="release-tracks open">'+(tracks.length?'':'<div class="item-meta">NO TRACKS</div>')+'</div>';
    const box=row.querySelector('.release-tracks');
    tracks.forEach((t,i)=>{const tr=document.createElement('div');tr.className='admin-item';tr.innerHTML='<div><div class="item-name">'+(i+1)+'. '+esc(t.title)+'</div></div><div class="actions"><button class="button" type="button" onclick="editArtistSong(\''+t.id+'\')">EDIT SONG</button><button class="button danger" type="button" onclick="deleteArtistSong(\''+t.id+'\')">DELETE</button></div>';box.appendChild(tr)});
    releaseList.appendChild(row);
   }
  }
 }catch(e){
  console.error('Artist music manager error:',e);
  if(releaseList)releaseList.innerHTML='<div class="admin-item"><div class="item-name">COULD NOT LOAD ALBUMS / EPS</div><div class="item-meta">'+esc(e.message||String(e))+'</div></div>';
 }
}
function esc(v){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();