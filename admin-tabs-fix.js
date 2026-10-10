(function(){
function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
function init(){
 const n=document.querySelector('.admin-nav'),m=document.getElementById('mainPage'); if(!n||!m)return;
 const eventsPanel=document.getElementById('events');
 if(eventsPanel && m.parentElement && eventsPanel.previousElementSibling!==m){
  m.parentElement.insertBefore(eventsPanel,m.nextElementSibling);
 }
 const bs=[...n.querySelectorAll('button')],ids=['mainPage','sideMenu','artistPages','events','upcoming'];
 bs.forEach((b,i)=>b.onclick=async e=>{
  e.preventDefault();
  const selectedId=ids[i];
  bs.forEach(x=>x.classList.toggle('active',x===b));
  document.querySelectorAll('section.panel').forEach(p=>{p.classList.remove('active');p.style.setProperty('display','none','important')});
  const target=document.getElementById(selectedId);
  if(!target){console.error('Admin panel missing:',selectedId);return}
  target.classList.add('active');
  target.style.removeProperty('display');
  target.style.setProperty('display','block','important');
  target.style.setProperty('visibility','visible','important');
  if(selectedId==='mainPage')sub('site');
  if(selectedId==='artistPages')openArtistManager();
  if(selectedId==='events'){
    const list=document.getElementById('eventsList');
    if(list)list.innerHTML='<div class="admin-item"><div class="item-name">Loading events...</div></div>';
    if(typeof loadEvents==='function')await loadEvents();
    else if(list)list.innerHTML='<div class="admin-item"><div class="item-name">Event loader is unavailable. Refresh the page and try again.</div></div>';
  }
  if(selectedId==='upcoming'){if(typeof loadArtistsForUpcoming==='function')loadArtistsForUpcoming();if(typeof loadUpcomingReleases==='function')loadUpcomingReleases()}
 });
 const ids2=['site','photos','music','artists','videos','merch','sections'],ts=[...document.querySelectorAll('.main-page-tabs button')],h=document.getElementById('mainPageSubPanels');
 ids2.forEach(id=>{const p=document.getElementById(id);if(p&&h&&p.parentElement!==h){p.classList.remove('panel','active');p.classList.add('main-page-subpanel');p.style.display='none';h.appendChild(p)}});
 function sub(id){document.querySelectorAll('.main-page-subpanel').forEach(p=>p.style.display='none');ts.forEach(x=>x.classList.remove('active'));const p=document.getElementById(id);if(p)p.style.display='block';const b=ts.find(x=>(x.getAttribute('onclick')||'').includes("'"+id+"'"));if(b)b.classList.add('active')}
 ts.forEach(b=>b.onclick=e=>{e.preventDefault();const z=(b.getAttribute('onclick')||'').match(/showMainSubPanel\(['"]([^'"]+)/);if(z)sub(z[1])});
 sub('site');openArtistManager();
}
async function addArtist(){
 const name=prompt('ARTIST NAME');
 if(!name||!name.trim())return;
 const cleanName=name.trim();
 const slug=cleanName.toLowerCase().trim().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
 if(!slug){alert('Please enter a valid artist name.');return;}
 try{
  const existing=await supabaseClient.from('artists').select('id').eq('slug',slug).maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data){alert('An artist with that name already exists.');return;}
  const maxResult=await supabaseClient.from('artists').select('sort_order').order('sort_order',{ascending:false}).limit(1);
  if(maxResult.error)throw maxResult.error;
  const nextOrder=((maxResult.data&&maxResult.data[0]&&Number(maxResult.data[0].sort_order))||0)+1;
  const created=await supabaseClient.from('artists').insert({name:cleanName,slug:slug,sort_order:nextOrder,homepage_featured:false}).select('id,name,slug').single();
  if(created.error)throw created.error;
  const select=document.getElementById('artistPageSelect');
  if(select){const option=document.createElement('option');option.value=created.data.id;option.textContent=created.data.name;select.appendChild(option);select.value=String(created.data.id);select.dispatchEvent(new Event('change'));}
  alert(cleanName+' added successfully.');
 }catch(e){alert('Could not add artist: '+(e.message||e));}
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
  const bp=document.getElementById('artistPageBackgroundPreview');if(bp)bp.innerHTML=a.background_image_url?'<img src="'+esc(a.background_image)+'" style="width:220px;height:120px;object-fit:cover;border:1px solid #242424">':'';
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
  renderSingles(songList,songs.filter(x=>!x.release_id && (!Array.isArray(x.sections) || x.sections.includes('singles'))));
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
async function artistUploadFile(bucket,artistId,file,folder){
 if(!file)return null;
 const ext=file.name.split('.').pop().toLowerCase();
 const path=artistId+'/'+(folder?folder+'/':'')+Date.now()+'-'+Math.random().toString(36).slice(2)+'.'+ext;
 const u=await supabaseClient.storage.from(bucket).upload(path,file);
 if(u.error)throw u.error;
 return supabaseClient.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
function artistUploadTrackRow(container,number){
 const row=document.createElement('div');
 row.className='admin-item';
 row.style.cssText='display:grid;grid-template-columns:45px 1fr 1fr 1fr 90px;gap:10px;align-items:center';
 row.innerHTML='<div style="text-align:center">'+number+'</div><input class="artist-upload-track-title" placeholder="Track title"><label style="display:flex;flex-direction:column;gap:5px;font-size:11px">AUDIO<input class="artist-upload-track-file" type="file" accept="audio/*"></label><label style="display:flex;flex-direction:column;gap:5px;font-size:11px">VIDEO<input class="artist-upload-track-video" type="file" accept="video/*"></label><button class="button danger" type="button">REMOVE</button>';
 row.querySelector('button').onclick=()=>{row.remove();[...container.children].forEach((x,i)=>x.firstElementChild.textContent=i+1)};
 container.appendChild(row);
}
async function createArtistScheduledRelease(type,title,date,artworkFile,rows,releaseVideoFiles){
 if(!selectedArtistPageId)throw new Error('Please select an artist page first.');
 if(!title)throw new Error('Enter a project title.');
 if(!date)throw new Error('Select a release date.');
 if(!artworkFile)throw new Error('Select project artwork.');
 if(!rows.length)throw new Error('Add at least one song.');
 const artwork=await artistUploadFile('artist-artwork',selectedArtistPageId,artworkFile,'releases');
 const ins=await supabaseClient.from('artist_releases').insert({artist_id:selectedArtistPageId,title,type,artwork_url:artwork,release_date:date||null,sort_order:0}).select().single();
 if(ins.error)throw ins.error;
 const releaseVideos=releaseVideoFiles||[];
 for(let i=0;i<releaseVideos.length;i++){
  const v=releaseVideos[i];
  if(!v.file)continue;
  const link=await artistUploadFile('videos',selectedArtistPageId,v.file,'artist-releases/'+ins.data.id);
  const thumb=await artistUploadFile('artist-artwork',selectedArtistPageId,v.thumbnail,'release-video-thumbnails/'+ins.data.id);
  const vr=await supabaseClient.from('videos').insert({title:v.title||('Video '+(i+1)),link,image:thumb,sort_order:i+1,artist_id:selectedArtistPageId,release_id:ins.data.id});
  if(vr.error)throw vr.error;
 }
 for(let i=0;i<rows.length;i++){
  const titleEl=rows[i].querySelector('.artist-upload-track-title,.artist-release-track-title');
  const audioEl=rows[i].querySelector('.artist-upload-track-file,.artist-release-track-file');
  const videoEl=rows[i].querySelector('.artist-upload-track-video,.artist-release-track-video');
  const trackTitle=titleEl&&titleEl.value.trim(),audio=audioEl&&audioEl.files[0],video=videoEl&&videoEl.files[0];
  if(!trackTitle)throw new Error('Enter a title for track '+(i+1)+'.');
  if(!audio)throw new Error('Select an audio file for track '+(i+1)+'.');
  const audioUrl=await artistUploadFile('artist-music',selectedArtistPageId,audio,'releases/'+ins.data.id);
  const videoUrl=await artistUploadFile('videos',selectedArtistPageId,video,'artist-videos/'+ins.data.id);
  const song=await supabaseClient.from('artist_songs').insert({artist_id:selectedArtistPageId,title:trackTitle,audio_url:audioUrl,image_url:artwork,video_url:videoUrl,sort_order:i+1,plays:0,is_top_song:false,sections:[type==='album'?'albums':'eps'],release_id:ins.data.id,track_number:i+1});
  if(song.error)throw song.error;
 }
 return ins.data;
}
window.addArtistReleaseTrack=function(){
 const container=document.getElementById('artistReleaseTracks');if(!container)return;
 artistUploadTrackRow(container,container.children.length+1);
};
window.uploadArtistMusic=async function(){
 const type=document.getElementById('artistMusicUploadType')?.value||'single';
 if(type==='single'){if(typeof uploadArtistSong==='function')return uploadArtistSong();return}
 try{
  const title=document.getElementById('artistMusicProjectTitle').value.trim();
  const date=document.getElementById('artistMusicProjectDate').value;
  const art=document.getElementById('artistMusicProjectArtwork').files[0];
  const rows=[...document.querySelectorAll('#artistMusicProjectTracks .admin-item')];
  const button=document.getElementById('artistSongSubmitButton');if(button){button.disabled=true;button.textContent='UPLOADING...'}
  await createArtistScheduledRelease(type,title,date,art,rows,[]);
  document.getElementById('artistMusicProjectTitle').value='';document.getElementById('artistMusicProjectDate').value='';document.getElementById('artistMusicProjectArtwork').value='';
  document.getElementById('artistMusicProjectTracks').innerHTML='';
  await renderArtistMusic(selectedArtistPageId);if(typeof setStatus==='function')setStatus('MUSIC UPLOADED');
  alert(type.toUpperCase()+' uploaded successfully. It will release on '+(date||'the selected release date')+'.');
 }catch(e){alert('Music upload failed: '+(e.message||e))}finally{const b=document.getElementById('artistSongSubmitButton');if(b){b.disabled=false;b.textContent='UPLOAD MUSIC'}}
};
window.saveArtistRelease=async function(){
 try{
  const type=document.getElementById('artistReleaseType').value;
  const title=document.getElementById('artistReleaseTitle').value.trim();
  const date=document.getElementById('artistReleaseDate').value;
  const art=document.getElementById('artistReleaseArtwork').files[0];
  const rows=[...document.querySelectorAll('#artistReleaseTracks .admin-item')];
  const b=document.getElementById('artistReleaseSubmitButton');if(b){b.disabled=true;b.textContent='UPLOADING...'}
  const releaseVideos=[...document.querySelectorAll('#artistReleaseVideos .artist-release-video-row')].map(function(row){return {title:row.querySelector('.artist-release-video-title')?.value.trim()||'',file:row.querySelector('.artist-release-video-file')?.files[0]||null,thumbnail:row.querySelector('.artist-release-video-thumb')?.files[0]||null}}); if(releaseVideos.some(function(v){return !v.file}))throw new Error('Select a video file for every release video row.'); await createArtistScheduledRelease(type,title,date,art,rows,releaseVideos);
  document.getElementById('artistReleaseTitle').value='';document.getElementById('artistReleaseDate').value='';document.getElementById('artistReleaseArtwork').value='';if(document.getElementById('artistReleaseVideos'))document.getElementById('artistReleaseVideos').innerHTML='';document.getElementById('artistReleaseTracks').innerHTML='';
  await renderArtistMusic(selectedArtistPageId);if(typeof setStatus==='function')setStatus('UPCOMING RELEASE SAVED');
  alert('Upcoming '+type.toUpperCase()+' saved. It will appear publicly on '+(date||'the release date')+'.');
 }catch(e){alert('Upcoming release failed: '+(e.message||e))}finally{const b=document.getElementById('artistReleaseSubmitButton');if(b){b.disabled=false;b.textContent='SAVE UPCOMING RELEASE'}}
};
function setupArtistMusicUploadUI(){
 const type=document.getElementById('artistMusicUploadType'),fields=document.getElementById('artistMusicProjectFields'),tracks=document.getElementById('artistMusicProjectTracks'),add=document.getElementById('artistMusicAddTrack');
 const releaseVideos=document.getElementById('artistReleaseVideos'),addReleaseVideo=document.getElementById('artistAddReleaseVideo');
 if(releaseVideos&&addReleaseVideo){
  const addVideo=()=>{
   const row=document.createElement('div');row.className='admin-item artist-release-video-row';row.style.cssText='display:grid;grid-template-columns:1fr 1fr 1fr 90px;gap:10px;align-items:center';
   row.innerHTML='<input class="artist-release-video-title" placeholder="Video title"><input class="artist-release-video-file" type="file" accept="video/*"><input class="artist-release-video-thumb" type="file" accept="image/*"><button class="button danger" type="button">REMOVE</button>';
   row.querySelector('button').onclick=()=>row.remove();releaseVideos.appendChild(row);
  };
  addReleaseVideo.onclick=addVideo;
 }
 const releaseTracks=document.getElementById('artistReleaseTracks');
 if(releaseTracks){
  [...releaseTracks.children].forEach(row=>{
   if(!row.querySelector('.artist-release-track-video')){
    const audio=row.querySelector('.artist-release-track-file');
    const input=document.createElement('input');input.type='file';input.accept='video/*';input.className='artist-release-track-video';
    if(audio)audio.insertAdjacentElement('afterend',input);
   }
   row.style.display='grid';row.style.gridTemplateColumns='45px 1fr 1fr 1fr 90px';row.style.gap='10px';
  });
 }
 if(!type||!fields||!tracks||!add)return;
 const sync=()=>{const project=type.value!=='single';fields.style.display=project?'block':'none';['artistSingleTitleGroup','artistSingleArtworkGroup','artistSingleAudioGroup','artistSingleSectionsGroup'].forEach(id=>{const x=document.getElementById(id);if(x)x.style.display=project?'none':''});if(project&&!tracks.children.length)artistUploadTrackRow(tracks,1)};
 type.addEventListener('change',sync);add.onclick=()=>artistUploadTrackRow(tracks,tracks.children.length+1);sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setupArtistMusicUploadUI);else setupArtistMusicUploadUI();


// Events fallback: define these in this file so the Events panel works even if
// another legacy inline admin script fails to initialize.
window.loadEvents = async function(){
 const container=document.getElementById('eventsList');
 if(!container)return;
 if(!window.supabaseClient){container.innerHTML='<div class="admin-item"><div class="item-name">Supabase is not initialized. Refresh and try again.</div></div>';return;}
 container.innerHTML='<div class="admin-item"><div class="item-name">Loading events...</div></div>';
 try{
  const r=await window.supabaseClient.from('events').select('*').order('sort_order',{ascending:true});
  if(r.error)throw r.error;
  container.innerHTML='';
  (r.data||[]).forEach(function(ev){
   const item=document.createElement('div');item.className='admin-item';
   const safe=function(v){return esc(v||'')};
   item.innerHTML='<div class="item-info"><div class="item-image">'+(ev.image?'<img src="'+safe(ev.image)+'" alt="" style="width:100%;height:100%;object-fit:cover">':'')+'</div><div><div class="item-name">'+safe(ev.title||ev.name||'Untitled Event')+'</div><div class="item-meta">'+safe(ev.date||'DATE NOT SET')+' · '+safe(ev.location||'LOCATION NOT SET')+'</div><div class="item-meta">'+(ev.contact_name?'CONTACT: '+safe(ev.contact_name)+' · ':'')+(ev.contact_email?safe(ev.contact_email)+' · ':'')+(ev.contact_phone?safe(ev.contact_phone):'')+'</div><div class="item-meta">'+(ev.featured?'FEATURED EVENT · ':'')+(ev.video_link?'EVENT VIDEOS LINK ADDED':'NO EVENT VIDEOS LINK')+'</div></div></div><div class="actions"><button class="button event-edit" type="button">EDIT</button><button class="button danger event-remove" type="button">REMOVE</button></div>';
   item.querySelector('.event-edit').onclick=function(){window.editEvent(ev.id)};
   item.querySelector('.event-remove').onclick=function(){window.removeEvent(ev.id)};
   container.appendChild(item);
  });
  if(!(r.data||[]).length)container.innerHTML='<div class="admin-item"><div class="item-name">NO EVENTS YET</div><div class="item-meta">Use + ADD EVENT to create one.</div></div>';
 }catch(e){
  console.error('Events loader failed:',e);
  container.innerHTML='<div class="admin-item"><div class="item-name">ERROR LOADING EVENTS</div><div class="item-meta">'+esc(e.message||e)+'</div></div>';
 }
};
window.addEvent = async function(){
 try{
  const title=prompt('Event name:');if(!title||!title.trim())return;
  const date=prompt('Event date (e.g. Oct 15, 2026):')||'';
  const location=prompt('Venue / location:')||'';
  const link=prompt('Ticket or event information URL (optional):')||'';
  const video_link=prompt('Link to videos from this event (optional):')||'';
  const featured=confirm('Feature this event at the top of Upcoming Events? Choose OK for YES, Cancel for NO.');
  let image='';
  const fileInput=document.getElementById('eventImageFile'),file=fileInput&&fileInput.files&&fileInput.files[0];
  if(file){
   const path='events/'+Date.now()+'-'+file.name;
   const up=await window.supabaseClient.storage.from('site-images').upload(path,file);
   if(up.error)throw up.error;
   image=window.supabaseClient.storage.from('site-images').getPublicUrl(path).data.publicUrl;
  }
  const sr=await window.supabaseClient.from('events').select('sort_order').order('sort_order',{ascending:false}).limit(1);
  if(sr.error)throw sr.error;
  const next=sr.data&&sr.data.length?(sr.data[0].sort_order||0)+1:1;
  const ins=await window.supabaseClient.from('events').insert({title:title.trim(),date,location,link,image,video_link,featured,sort_order:next});
  if(ins.error)throw ins.error;
  if(fileInput)fileInput.value='';
  await window.loadEvents();
  if(typeof window.setStatus==='function')window.setStatus('EVENT ADDED');
 }catch(e){alert('Could not add event: '+(e.message||e))}
};


(function(){
 function eventDb(){if(typeof supabaseClient!=='undefined')return supabaseClient;if(window.supabaseClient)return window.supabaseClient;throw new Error('Supabase is not initialized. Refresh the admin page.')}
 function modal(){
  let el=document.getElementById('fsbEventModal');if(el)return el;
  const style=document.createElement('style');style.textContent='#fsbEventModal{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.82);display:none;align-items:center;justify-content:center;padding:18px}#fsbEventModal .fsb-event-card{width:min(720px,100%);max-height:92vh;overflow:auto;background:#090909;border:1px solid #444;padding:24px;color:#fff}#fsbEventModal .fsb-event-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:20px}#fsbEventModal label{display:block;font-size:11px;letter-spacing:1px;margin-bottom:7px;color:#aaa}#fsbEventModal input:not([type=checkbox]):not([type=file]),#fsbEventModal input[type=file],#fsbEventModal textarea{width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #444;padding:12px}#fsbEventModal .fsb-full{grid-column:1/-1}#fsbEventModal .fsb-feature{display:flex;align-items:center;gap:10px}#fsbEventModal .fsb-feature label{margin:0}#fsbEventModal .fsb-event-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:24px}@media(max-width:560px){#fsbEventModal .fsb-event-grid{grid-template-columns:1fr}#fsbEventModal .fsb-full{grid-column:auto}}';document.head.appendChild(style);
  el=document.createElement('div');el.id='fsbEventModal';el.innerHTML='<div class="fsb-event-card" role="dialog" aria-modal="true" aria-labelledby="fsbEventModalTitle"><div class="panel-title" id="fsbEventModalTitle">ADD EVENT</div><div class="panel-description">Event details shown on the FSB website.</div><form id="fsbEventForm"><div class="fsb-event-grid"><div><label for="fsbEventTitle">EVENT NAME *</label><input id="fsbEventTitle" required maxlength="180" placeholder="FSB Summer Bash"></div><div><label for="fsbEventDate">DATE AND TIME</label><input id="fsbEventDate" placeholder="Oct 15, 2026 · 7 PM"></div><div class="fsb-full"><label for="fsbEventLocation">VENUE / ADDRESS</label><input id="fsbEventLocation" placeholder="Venue name and address"></div><div class="fsb-full"><label for="fsbEventLink">TICKET / EVENT INFORMATION URL</label><input id="fsbEventLink" type="url" placeholder="https://"></div><div class="fsb-full"><label for="fsbEventVideo">EVENT VIDEO LINK</label><input id="fsbEventVideo" type="url" placeholder="https://"></div><div><label for="fsbEventContactName">CONTACT NAME</label><input id="fsbEventContactName" placeholder="Contact person or organization"></div><div><label for="fsbEventContactPhone">CONTACT PHONE</label><input id="fsbEventContactPhone" type="tel" placeholder="Phone number"></div><div class="fsb-full"><label for="fsbEventContactEmail">CONTACT EMAIL</label><input id="fsbEventContactEmail" type="email" placeholder="events@example.com"></div><div class="fsb-full"><label for="fsbEventImage">EVENT FLYER / IMAGE (OPTIONAL)</label><input id="fsbEventImage" type="file" accept="image/*"><div id="fsbEventImageCurrent" style="font-size:12px;color:#aaa;margin-top:8px"></div></div><div class="fsb-full fsb-feature"><input id="fsbEventFeatured" type="checkbox"><label for="fsbEventFeatured">FEATURE THIS EVENT AT THE TOP OF UPCOMING EVENTS</label></div></div><div class="fsb-event-actions"><button class="button" type="button" id="fsbEventCancel">CANCEL</button><button class="button primary" type="submit" id="fsbEventSave">ADD EVENT</button></div></form></div>';
  document.body.appendChild(el);el.addEventListener('click',e=>{if(e.target===el)close()});el.querySelector('#fsbEventCancel').onclick=close;document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});return el;
 }
 let editingEventId=null,existingImage='';
 function close(){const el=document.getElementById('fsbEventModal');if(el)el.style.display='none';editingEventId=null;existingImage=''}
 function openForm(ev){
  const el=modal(),form=el.querySelector('#fsbEventForm');form.reset();editingEventId=ev?ev.id:null;existingImage=ev&&ev.image||'';
  el.querySelector('#fsbEventModalTitle').textContent=ev?'EDIT EVENT':'ADD EVENT';
  el.querySelector('#fsbEventSave').textContent=ev?'SAVE CHANGES':'ADD EVENT';
  el.querySelector('#fsbEventTitle').value=ev?(ev.title||ev.name||''):'';
  el.querySelector('#fsbEventDate').value=ev?(ev.date||ev.event_date||''):'';
  el.querySelector('#fsbEventLocation').value=ev?(ev.location||''):'';
  el.querySelector('#fsbEventLink').value=ev?(ev.link||''):'';
  el.querySelector('#fsbEventVideo').value=ev?(ev.video_link||''):'';
  el.querySelector('#fsbEventContactName').value=ev?(ev.contact_name||''):'';
  el.querySelector('#fsbEventContactEmail').value=ev?(ev.contact_email||''):'';
  el.querySelector('#fsbEventContactPhone').value=ev?(ev.contact_phone||''):'';
  el.querySelector('#fsbEventFeatured').checked=!!(ev&&ev.featured);
  el.querySelector('#fsbEventImageCurrent').textContent=existingImage?'Current flyer saved. Choose a file only to replace it.':'No flyer uploaded yet.';
  el.style.display='flex';el.querySelector('#fsbEventTitle').focus();
 }
 window.addEvent=function(){openForm(null)};
 window.editEvent=async function(id){
  try{const r=await eventDb().from('events').select('*').eq('id',id).single();if(r.error)throw r.error;openForm(r.data)}
  catch(e){alert('Could not load event: '+(e.message||e))}
 };
 const initForm=function(){
  const el=modal(),form=el.querySelector('#fsbEventForm');if(form.dataset.ready)return;form.dataset.ready='1';
  form.addEventListener('submit',async function(e){
   e.preventDefault();const btn=el.querySelector('#fsbEventSave');btn.disabled=true;btn.textContent='SAVING...';
   try{
    const wasEditing=editingEventId!==null&&editingEventId!==undefined;const db=eventDb(),title=el.querySelector('#fsbEventTitle').value.trim();if(!title)throw new Error('Enter an event name.');
    let image=existingImage;const file=el.querySelector('#fsbEventImage').files[0];
    if(file){const path='events/'+Date.now()+'-'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const up=await db.storage.from('site-images').upload(path,file,{upsert:false});if(up.error)throw up.error;image=db.storage.from('site-images').getPublicUrl(path).data.publicUrl}
    const payload={title,date:el.querySelector('#fsbEventDate').value.trim(),location:el.querySelector('#fsbEventLocation').value.trim(),link:el.querySelector('#fsbEventLink').value.trim(),video_link:el.querySelector('#fsbEventVideo').value.trim(),contact_name:el.querySelector('#fsbEventContactName').value.trim(),contact_email:el.querySelector('#fsbEventContactEmail').value.trim(),contact_phone:el.querySelector('#fsbEventContactPhone').value.trim(),featured:el.querySelector('#fsbEventFeatured').checked,image:image||''};
    if(wasEditing){const up=await db.from('events').update(payload).eq('id',editingEventId);if(up.error)throw up.error}
    else{const sr=await db.from('events').select('sort_order').order('sort_order',{ascending:false}).limit(1);if(sr.error)throw sr.error;payload.sort_order=sr.data&&sr.data.length?(Number(sr.data[0].sort_order)||0)+1:1;const ins=await db.from('events').insert(payload);if(ins.error)throw ins.error}
    close();await window.loadEvents();if(typeof setStatus==='function')setStatus(wasEditing?'EVENT UPDATED':'EVENT ADDED');
   }catch(err){alert('Could not save event: '+(err.message||err))}
   finally{btn.disabled=false;btn.textContent=editingEventId!==null&&editingEventId!==undefined?'SAVE CHANGES':'ADD EVENT'}
  });
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initForm);else initForm();
})();
