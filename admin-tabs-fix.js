(function(){
function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
function init(){
 const n=document.querySelector('.admin-nav'),m=document.getElementById('mainPage'); if(!n||!m)return;
 const bs=[...n.querySelectorAll('button')],ids=['mainPage','sideMenu','artistPages','upcoming'];
 bs.forEach((b,i)=>b.onclick=e=>{e.preventDefault();bs.forEach(x=>x.classList.remove('active'));b.classList.add('active');ids.forEach(id=>{const p=document.getElementById(id);if(p)p.style.display=id===ids[i]?'block':'none'});if(ids[i]==='mainPage')sub('site');if(ids[i]==='artistPages')openArtistManager()});
 const ids2=['site','photos','music','artists','videos','events','merch','sections'],ts=[...document.querySelectorAll('.main-page-tabs button')],h=document.getElementById('mainPageSubPanels');
 ids2.forEach(id=>{const p=document.getElementById(id);if(p&&h&&p.parentElement!==h){p.classList.remove('panel','active');p.classList.add('main-page-subpanel');p.style.display='none';h.appendChild(p)}});
 function sub(id){document.querySelectorAll('.main-page-subpanel').forEach(p=>p.style.display='none');ts.forEach(x=>x.classList.remove('active'));const p=document.getElementById(id);if(p)p.style.display='block';const b=ts.find(x=>(x.getAttribute('onclick')||'').includes("'"+id+"'"));if(b)b.classList.add('active')}
 ts.forEach(b=>b.onclick=e=>{e.preventDefault();const z=(b.getAttribute('onclick')||'').match(/showMainSubPanel\(['"]([^'"]+)/);if(z)sub(z[1])});
 sub('site');openArtistManager();
}
function openArtistManager(){
 const s=document.getElementById('artistPageSelect'); if(!s)return;
 s.onchange=function(){const id=this.value,manager=document.getElementById('artistPageManager');if(!id){if(manager)manager.style.display='none';return}if(manager)manager.style.display='block';window.selectedArtistPageId=id;loadArtistProfile(id);renderArtistMusic(id);if(typeof loadArtistLinksAdmin==='function')loadArtistLinksAdmin()};
}
async function loadArtistProfile(id){
 try{
  const r=await supabaseClient.from('artists').select('*').eq('id',id).single(); if(r.error)throw r.error; const a=r.data||{};
  const name=a.name||'ARTIST';
  const h=document.getElementById('selectedArtistName');if(h)h.textContent=name;
  const n=document.getElementById('artistPageName');if(n)n.value=a.name||'';
  const b=document.getElementById('artistPageBio');if(b)b.value=a.bio||'';
  const ip=document.getElementById('artistPageImagePreview');if(ip)ip.innerHTML=a.image?'<img src="'+esc(a.image)+'" style="width:120px;height:120px;object-fit:cover;border:1px solid #242424">':'';
  const bp=document.getElementById('artistPageBackgroundPreview');if(bp)bp.innerHTML=a.background_image?'<img src="'+esc(a.background_image)+'" style="width:220px;height:120px;object-fit:cover;border:1px solid #242424">':'';
 }catch(e){console.error('Artist profile load error:',e)}
}
async function renderArtistMusic(artistId){
 const songList=document.getElementById('artistSongsAdminList'),releaseList=document.getElementById('artistReleasesAdminList');
 if(songList)songList.innerHTML='<div class="admin-item"><div class="item-name">LOADING SINGLES...</div></div>';
 if(releaseList)releaseList.innerHTML='<div class="admin-item"><div class="item-name">LOADING ALBUMS / EPS...</div></div>';
 try{
  const [sr,rr]=await Promise.all([
   supabaseClient.from('artist_songs').select('*').eq('artist_id',artistId).order('created_at',{ascending:false}),
   supabaseClient.from('artist_releases').select('*').eq('artist_id',artistId).order('created_at',{ascending:false})
  ]);
  if(sr.error)throw sr.error;if(rr.error)throw rr.error;
  const songs=sr.data||[],releases=rr.data||[];
  renderSingles(songList,songs.filter(x=>!x.release_id));
  renderReleases(releaseList,releases,songs);
 }catch(e){
  console.error('Artist music manager error:',e);
  if(songList)songList.innerHTML='<div class="admin-item"><div class="item-name">COULD NOT LOAD SINGLES</div><div class="item-meta">'+esc(e.message||e)+'</div></div>';
  if(releaseList)releaseList.innerHTML='<div class="admin-item"><div class="item-name">COULD NOT LOAD ALBUMS / EPS</div><div class="item-meta">'+esc(e.message||e)+'</div></div>';
 }
}
function renderSingles(list,songs){
 if(!list)return;
 list.innerHTML='';
 list.style.display='grid';list.style.gridTemplateColumns='repeat(5,minmax(0,1fr))';list.style.gap='12px';
 const style=document.createElement('style');style.textContent='@media(max-width:900px){#artistSongsAdminList{grid-template-columns:repeat(3,minmax(0,1fr))!important}}@media(max-width:600px){#artistSongsAdminList{grid-template-columns:repeat(2,minmax(0,1fr))!important}}';document.head.appendChild(style);
 if(!songs.length){list.style.display='block';list.innerHTML='<div class="admin-item"><div class="item-name">NO STANDALONE SINGLES</div></div>';return}
 songs.forEach(song=>{
  const card=document.createElement('div');card.className='admin-item';card.style.cssText='display:block;cursor:pointer;min-height:95px;padding:14px';
  const img=song.image_url?'<img src="'+esc(song.image_url)+'" style="width:54px;height:54px;object-fit:cover;border:1px solid #242424;margin-bottom:10px">':'<div style="width:54px;height:54px;border:1px solid #242424;margin-bottom:10px;display:flex;align-items:center;justify-content:center;color:#555;font-size:10px">SINGLE</div>';
  card.innerHTML=img+'<div class="item-name" style="font-size:12px;line-height:1.25">'+esc(song.title)+'</div><div class="item-meta">EDIT</div>';
  const editor=document.createElement('div');editor.style.cssText='display:none;grid-column:1/-1;border:1px solid #242424;background:#090909;padding:20px';
  editor.innerHTML=inlineSongEditorHtml(song);
  card.addEventListener('click',e=>{if(e.target.closest('button,input,label,select'))return;const open=editor.style.display!=='none';document.querySelectorAll('#artistSongsAdminList .inline-song-editor').forEach(x=>x.style.display='none');editor.style.display=open?'none':'block'});
  editor.className='inline-song-editor';
  editor.querySelector('.inline-song-save').onclick=()=>saveInlineSong(song.id,editor);
  editor.querySelector('.inline-song-delete').onclick=()=>deleteArtistSong(song.id).then(()=>renderArtistMusic(selectedArtistPageId));
  list.appendChild(card);list.appendChild(editor);
 });
}
function inlineSongEditorHtml(song){
 const sections=Array.isArray(song.sections)?song.sections:[];
 return '<div class="panel-title" style="font-size:18px">EDIT SINGLE</div><div class="form-grid" style="margin-top:18px">'+
 '<div class="form-group"><label>SONG NAME</label><input class="inline-title" value="'+esc(song.title)+'"></div>'+
 '<div class="form-group"><label>REPLACE PHOTO</label><input class="inline-image" type="file" accept="image/*"></div>'+
 '<div class="form-group"><label>REPLACE SONG TRACK</label><input class="inline-audio" type="file" accept="audio/*"></div>'+
 '<div class="form-group"><label>REPLACE VIDEO</label><input class="inline-video" type="file" accept="video/*"></div>'+
 '<div class="form-group full"><label>MUSIC SECTIONS</label><div style="display:flex;gap:16px;flex-wrap:wrap">'+
 ['singles','albums','eps','top'].map(x=>'<label style="display:flex;gap:7px;align-items:center"><input class="inline-section" type="checkbox" value="'+x+'" '+(sections.includes(x)?'checked':'')+'> '+x.toUpperCase()+'</label>').join('')+
 '</div></div></div><div class="actions"><button class="button primary inline-song-save">SAVE SONG</button><button class="button danger inline-song-delete">DELETE SONG</button></div>';
}
async function uploadInlineFile(bucket,artistId,file,folder){
 if(!file)return null;
 const ext=file.name.split('.').pop().toLowerCase(),path=artistId+'/'+(folder?folder+'/':'')+Date.now()+'-'+Math.random().toString(36).slice(2)+'.'+ext;
 const u=await supabaseClient.storage.from(bucket).upload(path,file);if(u.error)throw u.error;
 return supabaseClient.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
async function saveInlineSong(id,editor){
 try{
  const title=editor.querySelector('.inline-title').value.trim();if(!title){alert('Enter a song name.');return}
  const sections=[...editor.querySelectorAll('.inline-section:checked')].map(x=>x.value);
  const data={title,sections,is_top_song:sections.includes('top')};
  const image=await uploadInlineFile('artist-artwork',selectedArtistPageId,editor.querySelector('.inline-image').files[0],'');
  const audio=await uploadInlineFile('artist-music',selectedArtistPageId,editor.querySelector('.inline-audio').files[0],'');
  const video=await uploadInlineFile('videos',selectedArtistPageId,editor.querySelector('.inline-video').files[0],'artist-videos');
  if(image)data.image_url=image;if(audio)data.audio_url=audio;if(video)data.video_url=video;
  const r=await supabaseClient.from('artist_songs').update(data).eq('id',id);if(r.error)throw r.error;
  await renderArtistMusic(selectedArtistPageId);if(typeof setStatus==='function')setStatus('SONG UPDATED');
 }catch(e){alert('Could not update song: '+(e.message||e))}
}
function renderReleases(list,releases,songs){
 if(!list)return;list.innerHTML='';list.style.display='flex';list.style.flexDirection='column';list.style.gap='12px';
 if(!releases.length){list.innerHTML='<div class="admin-item"><div class="item-name">NO ALBUMS OR EPS</div></div>';return}
 releases.forEach(rel=>{
  const tracks=songs.filter(x=>String(x.release_id)===String(rel.id)).sort((a,b)=>(a.track_number||0)-(b.track_number||0));
  const row=document.createElement('div');row.className='admin-item';row.style.cssText='display:block;padding:0;overflow:hidden';
  const head=document.createElement('button');head.type='button';head.className='release-toggle';head.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:15px;padding:20px';
  head.innerHTML='<span><span class="item-name">'+esc(rel.title)+'</span><span class="item-meta" style="display:block">'+esc(String(rel.type||'RELEASE').toUpperCase())+' • '+tracks.length+' TRACKS</span></span><span style="font-size:18px;color:#777">+</span>';
  const body=document.createElement('div');body.className='release-tracks';body.style.cssText='padding:0 20px 20px 20px';
  body.innerHTML='<div class="actions" style="margin-top:0"><button class="button release-edit">EDIT RELEASE</button><button class="button danger release-delete">DELETE RELEASE</button></div>';
  const trackBox=document.createElement('div');trackBox.style.cssText='margin-top:18px;display:flex;flex-direction:column;gap:8px';
  tracks.forEach((t,i)=>{const tr=document.createElement('div');tr.className='admin-item';tr.style.padding='12px 14px';tr.innerHTML='<div><div class="item-name">'+(i+1)+'. '+esc(t.title)+'</div><div class="item-meta">TRACK</div></div><div class="actions" style="margin-top:0"><button class="button track-edit">EDIT SONG</button><button class="button danger track-delete">DELETE</button></div>';tr.querySelector('.track-edit').onclick=()=>editArtistSong(t.id);tr.querySelector('.track-delete').onclick=async()=>{await deleteArtistSong(t.id);await renderArtistMusic(selectedArtistPageId)};trackBox.appendChild(tr)});
  body.appendChild(trackBox);
  head.onclick=()=>{const open=body.style.display==='block';document.querySelectorAll('#artistReleasesAdminList .release-tracks').forEach(x=>x.style.display='none');document.querySelectorAll('#artistReleasesAdminList .release-toggle span:last-child').forEach(x=>x.textContent='+');body.style.display=open?'none':'block';head.querySelector('span:last-child').textContent=open?'+':'−'};
  body.querySelector('.release-edit').onclick=e=>{e.stopPropagation();editArtistRelease(rel.id)};
  body.querySelector('.release-delete').onclick=e=>{e.stopPropagation();deleteArtistRelease(rel.id).then(()=>renderArtistMusic(selectedArtistPageId))};
  row.appendChild(head);row.appendChild(body);list.appendChild(row);
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();