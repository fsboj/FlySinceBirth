(function(){
function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
function init(){
 const n=document.querySelector('.admin-nav'),m=document.getElementById('mainPage'); if(!n||!m)return;
 const eventsPanel=document.getElementById('events');
 if(eventsPanel && m.parentElement && eventsPanel.previousElementSibling!==m){
  m.parentElement.insertBefore(eventsPanel,m.nextElementSibling);
 }
 const bs=[...n.querySelectorAll('button')],ids=['mainPage','sideMenu','artistPages','videos','events','upcoming','store'];
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
  if(selectedId==='videos'){
   const mainPanel=document.getElementById('mainPage');
   if(mainPanel){mainPanel.classList.add('active');mainPanel.style.setProperty('display','block','important');mainPanel.style.setProperty('visibility','visible','important');}
   document.querySelectorAll('.main-page-subpanel').forEach(p=>{p.classList.toggle('active',p===target);p.style.setProperty('display',p===target?'block':'none','important');});
  }
  if(selectedId==='videos'&&typeof loadVideos==='function')await loadVideos();
  if(selectedId==='mainPage')sub('site');
  if(selectedId==='artistPages')openArtistManager();
  if(selectedId==='events'){
    const list=document.getElementById('eventsList');
    if(list)list.innerHTML='<div class="admin-item"><div class="item-name">Loading events...</div></div>';
    if(typeof loadEvents==='function')await loadEvents();
    else if(list)list.innerHTML='<div class="admin-item"><div class="item-name">Event loader is unavailable. Refresh the page and try again.</div></div>';
  }
  if(selectedId==='upcoming'){if(typeof loadArtistsForUpcoming==='function')loadArtistsForUpcoming();if(typeof loadUpcomingReleases==='function')loadUpcomingReleases()}
  if(selectedId==='store' && typeof window.loadMerchProductsAdmin==='function') await window.loadMerchProductsAdmin();
 });
 const ids2=['site','photos','music','artists','videos','sections'],ts=[...document.querySelectorAll('.main-page-tabs button')],h=document.getElementById('mainPageSubPanels');
 ids2.forEach(id=>{const p=document.getElementById(id);if(p&&h&&p.parentElement!==h){p.classList.remove('panel','active');p.classList.add('main-page-subpanel');p.style.display='none';h.appendChild(p)}});
 function sub(id){document.querySelectorAll('.main-page-subpanel').forEach(p=>p.style.display='none');ts.forEach(x=>x.classList.remove('active'));const p=document.getElementById(id);if(p)p.style.display='block';const b=ts.find(x=>(x.getAttribute('onclick')||'').includes("'"+id+"'"));if(b)b.classList.add('active')}
 ts.filter(b=>(b.getAttribute('onclick')||'').includes('showMainSubPanel(')).forEach(b=>b.onclick=e=>{e.preventDefault();const z=(b.getAttribute('onclick')||'').match(/showMainSubPanel\(['"]([^'"]+)/);if(z)sub(z[1])});
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
  artistFeatureCache=null;
  const featureSelects=['artistSongFeatureArtists','videoFeatureArtistSelect'].map(id=>document.getElementById(id)).filter(Boolean);
  await Promise.all(featureSelects.map(select=>window.populateArtistFeatureSelect(select)));
  const select=document.getElementById('artistPageSelect');
  if(select){const option=document.createElement('option');option.value=created.data.id;option.textContent=created.data.name;select.appendChild(option);select.value=String(created.data.id);select.dispatchEvent(new Event('change'));}
  alert(cleanName+' added successfully.');
 }catch(e){alert('Could not add artist: '+(e.message||e));}
}
function syncReleaseArtistSelector(selectedId){
 const pageSelect=document.getElementById('artistPageSelect'),releaseSelect=document.getElementById('artistReleaseArtist');
 if(!pageSelect||!releaseSelect)return;
 const keep=selectedId||releaseSelect.value||pageSelect.value||'';
 releaseSelect.innerHTML='<option value="">SELECT AN ARTIST</option>';
 [...pageSelect.options].filter(o=>o.value).forEach(o=>{const n=document.createElement('option');n.value=o.value;n.textContent=o.textContent;releaseSelect.appendChild(n)});
 if([...releaseSelect.options].some(o=>o.value===String(keep)))releaseSelect.value=String(keep);
}
function openArtistManager(){
 const s=document.getElementById('artistPageSelect'); if(!s)return;
 syncReleaseArtistSelector(s.value);
 s.onchange=async function(){
  const id=this.value,manager=document.getElementById('artistPageManager');
  syncReleaseArtistSelector(id);
  if(!id){if(manager)manager.style.display='none';if(typeof window.setSelectedArtistPageId==='function')window.setSelectedArtistPageId(null);else window.selectedArtistPageId=null;return}
  if(manager)manager.style.display='block';
  if(typeof window.setSelectedArtistPageId==='function')window.setSelectedArtistPageId(id);else window.selectedArtistPageId=id;
  try{
   await Promise.allSettled([
    loadArtistProfile(id),
    renderArtistMusic(id),
    typeof loadArtistLinksAdmin==='function'?loadArtistLinksAdmin():Promise.resolve()
   ]);
  }catch(e){
   console.error('Could not load selected artist editor:',e);
  }
 };
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
  if(songList)songList.innerHTML='<div class="admin-item"><div class="item-name">COULD NOT LOAD SINGLES</div><div class="item-meta">'+escapeHtml(e.message||e)+'</div></div>';
  if(releaseList)releaseList.innerHTML='<div class="admin-item"><div class="item-name">COULD NOT LOAD ALBUMS / EPS</div><div class="item-meta">'+esc(e.message||e)+'</div></div>';
 }
}
function renderSingles(list,songs){
 if(!list)return;
 list.innerHTML='';
 list.style.setProperty('display','flex','important');
 list.style.setProperty('flex-direction','column','important');
 list.style.setProperty('align-items','stretch','important');
 list.style.setProperty('gap','12px','important');
 list.style.setProperty('width','100%','important');
 if(!songs.length){list.innerHTML='<div class="admin-item"><div class="item-name">NO STANDALONE SINGLES</div></div>';return}
 songs.forEach(song=>{
  const card=document.createElement('div');
  card.className='admin-item artist-single-editor-card';
  card.style.cssText='display:block;width:100%;box-sizing:border-box;padding:14px;overflow:visible';
  const summary=document.createElement('div');
  summary.className='artist-single-summary';
  summary.style.cssText='display:flex;align-items:center;gap:14px;cursor:pointer;min-height:65px';
  const img=song.image_url?'<img src="'+esc(song.image_url)+'" alt="" style="width:54px;height:54px;object-fit:cover;border:1px solid #242424;flex:0 0 auto">':'<div style="width:54px;height:54px;border:1px solid #242424;display:flex;align-items:center;justify-content:center;color:#555;font-size:10px;flex:0 0 auto">SINGLE</div>';
  summary.innerHTML=img+'<div><div class="item-name" style="font-size:12px;line-height:1.25">'+esc(song.title)+'</div><div class="item-meta">CLICK TO EDIT</div></div>';
  const editor=document.createElement('div');
  editor.className='inline-song-editor';
  editor.style.cssText='display:none;position:static;clear:both;width:100%;box-sizing:border-box;margin-top:16px;padding:20px;border:1px solid #242424;background:#090909';
  editor.innerHTML=inlineSongEditorHtml(song);
  summary.addEventListener('click',()=>{
   const open=editor.style.display!=='none';
   document.querySelectorAll('#artistSongsAdminList .inline-song-editor').forEach(x=>{x.style.display='none'});
   document.querySelectorAll('#artistSongsAdminList .artist-single-summary .item-meta').forEach(x=>{x.textContent='CLICK TO EDIT'});
   if(!open){editor.style.display='block';summary.querySelector('.item-meta').textContent='CLICK TO CLOSE'}
  });
  editor.querySelector('.inline-song-save').onclick=()=>saveInlineSong(song.id,editor);
  editor.querySelector('.inline-song-delete').onclick=()=>deleteArtistSong(song.id).then(()=>renderArtistMusic(selectedArtistPageId));
  card.appendChild(summary);
  card.appendChild(editor);
  list.appendChild(card);
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
  await window.renderArtistMusic(selectedArtistPageId);if(typeof setStatus==='function')setStatus('SONG UPDATED');
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
window.renderArtistMusic=renderArtistMusic;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
let artistFeatureCache=null;
async function getArtistFeatureOptions(){
 if(!artistFeatureCache){const result=await supabaseClient.from('artists').select('id,name').order('name',{ascending:true});if(result.error)throw result.error;artistFeatureCache=result.data||[]}
 return artistFeatureCache;
}
function renderArtistFeaturePicker(select){
 if(!select)return;
 const host=[...document.querySelectorAll('.artist-feature-picker')].find(node=>node.dataset.selectId===select.id);
 if(!host)return;
 host.replaceChildren();
 host.style.cssText='border:1px solid #333;border-radius:10px;background:#0b0b0b;padding:10px;';
 const search=document.createElement('input');search.type='search';search.className='artist-feature-search';search.placeholder='Search FSB artists…';search.autocomplete='off';search.setAttribute('aria-label','Search FSB artists');
 search.style.cssText='width:100%;min-width:0;padding:11px 12px;border:1px solid #333;border-radius:7px;background:#111;color:#fff;';
 const chips=document.createElement('div');chips.style.cssText='display:flex;flex-wrap:wrap;gap:7px;margin-top:9px;';
 const results=document.createElement('div');results.setAttribute('role','listbox');results.setAttribute('aria-label','FSB artists');results.style.cssText='display:flex;flex-direction:column;gap:4px;margin-top:8px;max-height:190px;overflow:auto;';
 const message=document.createElement('small');message.style.cssText='display:block;color:#aaa;margin-top:7px;';
 host.append(search,chips,results,message);
 function draw(){
  chips.replaceChildren();results.replaceChildren();
  const selected=[...select.options].filter(option=>option.selected);
  selected.forEach(option=>{const chip=document.createElement('span');chip.style.cssText='display:inline-flex;align-items:center;gap:7px;padding:6px 9px;border-radius:999px;background:#202020;color:#fff;font-size:12px;';
   const label=document.createElement('span');label.textContent=option.textContent;const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Remove '+option.textContent);remove.style.cssText='border:0;background:none;color:#fff;font-size:17px;cursor:pointer;padding:0;';
   remove.onclick=()=>{option.selected=false;draw()};chip.append(label,remove);chips.appendChild(chip);
  });
  const primary=select.id==='videoFeatureArtistSelect'?(document.getElementById('videoArtistSelect')||{}).value:window.selectedArtistPageId;
  [...select.options].forEach(option=>{if(primary&&String(option.value)===String(primary))option.selected=false});
  const term=search.value.trim().toLocaleLowerCase();
  const matches=[...select.options].filter(option=>String(option.value)!==String(primary||'')&&option.textContent.toLocaleLowerCase().includes(term));
  const shown=matches.slice(0,30);
  shown.forEach(option=>{const item=document.createElement('button');item.type='button';item.setAttribute('role','option');item.setAttribute('aria-selected',String(option.selected));item.textContent=(option.selected?'✓  ':'＋  ')+option.textContent;item.style.cssText='text-align:left;padding:9px 10px;border:1px solid '+(option.selected?'#8ab4ff':'#292929')+';border-radius:6px;background:'+(option.selected?'#172334':'#111')+';color:#fff;cursor:pointer;';
   item.onclick=()=>{option.selected=!option.selected;draw();search.focus()};results.appendChild(item);
  });
  message.textContent=selected.length?selected.length+' FSB artist'+(selected.length===1?'':'s')+' selected. Search and select more.':(matches.length?'Choose one or more artists from the list.':'No matching artists.');
 }
 search.addEventListener('input',draw);draw();
}
window.populateArtistFeatureSelect=async function(select,selectedIds){
 if(!select)return;const artists=await getArtistFeatureOptions(),selected=new Set((selectedIds||[]).map(String));select.replaceChildren();
 artists.forEach(artist=>{const option=document.createElement('option');option.value=String(artist.id);option.textContent=artist.name||('Artist '+artist.id);option.selected=selected.has(String(artist.id));select.appendChild(option)});
 renderArtistFeaturePicker(select);
};
window.refreshArtistFeaturePickers=function(){
 document.querySelectorAll('.artist-feature-picker').forEach(host=>{
  const select=document.getElementById(host.dataset.selectId);
  if(select)renderArtistFeaturePicker(select);
 });
};
window.saveArtistFeatureLinks=async function(table,idColumn,recordId,select,primaryArtistId){
 const ids=select?[...select.selectedOptions].map(o=>String(o.value)).filter(id=>id&&id!==String(primaryArtistId)):[];
 const del=await supabaseClient.from(table).delete().eq(idColumn,recordId);if(del.error)throw del.error;
 if(ids.length){const rows=ids.map((artist_id,index)=>({[idColumn]:recordId,artist_id,sort_order:index+1}));const ins=await supabaseClient.from(table).insert(rows);if(ins.error)throw ins.error}
};
window.addExternalFeatureRow=function(containerId,credit){
 const container=document.getElementById(containerId);if(!container)return;
 const row=document.createElement('div');row.className='external-feature-row';row.style.cssText='display:grid;grid-template-columns:minmax(140px,1fr) minmax(180px,2fr) auto;gap:8px;align-items:center;margin:8px 0';
 const name=document.createElement('input');name.type='text';name.maxLength=120;name.placeholder='Artist name';name.value=credit&&credit.name||'';
 const link=document.createElement('input');link.type='url';link.placeholder='https://artist profile';link.value=credit&&credit.url||'';
 const remove=document.createElement('button');remove.type='button';remove.className='button danger';remove.textContent='REMOVE';remove.onclick=()=>row.remove();
 row.append(name,link,remove);container.appendChild(row);
};
window.collectExternalFeatureCredits=function(containerId){
 const container=document.getElementById(containerId);if(!container)return [];
 return [...container.querySelectorAll('.external-feature-row')].map((row,index)=>{
  const name=row.querySelector('input[type="text"]').value.trim(),url=row.querySelector('input[type="url"]').value.trim();
  if(!name&&!url)return null;
  if(!name||!url)throw new Error('Enter both the name and link for non-FSB featured artist '+(index+1)+'.');
  let parsed;try{parsed=new URL(url)}catch(_){throw new Error('Enter a valid web link for '+name+'.')}
  if(!['http:','https:'].includes(parsed.protocol))throw new Error('Use an http or https link for '+name+'.');
  return {name,url:parsed.href};
 }).filter(Boolean);
};
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
 row.style.cssText='display:grid;grid-template-columns:45px minmax(120px,1fr) minmax(110px,1fr) minmax(110px,1fr) minmax(150px,1fr) 90px;gap:10px;align-items:center';
 row.innerHTML='<div style="text-align:center">'+number+'</div><input class="artist-upload-track-title" placeholder="Track title"><label style="display:flex;flex-direction:column;gap:5px;font-size:11px">AUDIO<input class="artist-upload-track-file" type="file" accept="audio/*"></label><label style="display:flex;flex-direction:column;gap:5px;font-size:11px">VIDEO<input class="artist-upload-track-video" type="file" accept="video/*"></label><label style="display:flex;flex-direction:column;gap:5px;font-size:11px">FEATURE ARTISTS<select class="artist-track-feature-select" multiple size="3" aria-label="Featured artists for track"></select></label><button class="button danger" type="button">REMOVE</button>';
 row.querySelector('button').onclick=()=>{row.remove();[...container.children].forEach((x,i)=>x.firstElementChild.textContent=i+1)};
 container.appendChild(row);window.populateArtistFeatureSelect(row.querySelector('.artist-track-feature-select')).catch(e=>alert('Could not load artists: '+e.message));
}
async function createArtistScheduledRelease(type,title,date,artworkFile,rows,releaseVideoFiles){
 if(!selectedArtistPageId)throw new Error('Please select an artist page first.');
 if(!title)throw new Error('Enter a project title.');
 if(!date)throw new Error('Select a release date.');
 if(!artworkFile)throw new Error('Select project artwork.');
 if(!rows.length)throw new Error('Add at least one song.');
 const tracks=rows.map((row,i)=>{
  const titleEl=row.querySelector('.artist-upload-track-title,.artist-release-track-title');
  const audioEl=row.querySelector('.artist-upload-track-file,.artist-release-track-file');
  const videoEl=row.querySelector('.artist-upload-track-video,.artist-release-track-video');
  const trackTitle=titleEl&&titleEl.value.trim(),audio=audioEl&&audioEl.files[0],video=videoEl&&videoEl.files[0];
  if(!trackTitle)throw new Error('Enter a title for track '+(i+1)+'.');
  if(!audio)throw new Error('Select an audio file for track '+(i+1)+'.');
  return {title:trackTitle,audio,video,featureIds:[...(row.querySelector('.artist-track-feature-select')?.selectedOptions||[])].map(o=>o.value)};
 });
 const artwork=await artistUploadFile('artist-artwork',selectedArtistPageId,artworkFile,'releases');
 const ins=await supabaseClient.from('artist_releases').insert({artist_id:selectedArtistPageId,title,type,artwork_url:artwork,release_date:date||null,sort_order:0}).select().single();
 if(ins.error)throw ins.error;
 const releaseVideos=releaseVideoFiles||[];
 for(let i=0;i<releaseVideos.length;i++){
  const v=releaseVideos[i];
  if(!v.file)continue;
  const link=await artistUploadFile('videos',selectedArtistPageId,v.file,'artist-releases/'+ins.data.id);
  const thumb=await artistUploadFile('artist-artwork',selectedArtistPageId,v.thumbnail,'release-video-thumbnails/'+ins.data.id);
  const vr=await supabaseClient.from('videos').insert({title:v.title||('Video '+(i+1)),link,image:thumb,sort_order:i+1,artist_id:selectedArtistPageId,release_id:ins.data.id}).select('id').single();
  if(vr.error)throw vr.error;
  await window.saveArtistFeatureLinks('video_artist_features','video_id',vr.data.id,v.featureSelect,selectedArtistPageId);
 }
 for(let i=0;i<tracks.length;i++){
  const {title:trackTitle,audio,video}=tracks[i];
  const audioUrl=await artistUploadFile('artist-music',selectedArtistPageId,audio,'releases/'+ins.data.id);
  const videoUrl=await artistUploadFile('videos',selectedArtistPageId,video,'artist-videos/'+ins.data.id);
  const song=await supabaseClient.from('artist_songs').insert({artist_id:selectedArtistPageId,title:trackTitle,audio_url:audioUrl,image_url:artwork,video_url:videoUrl,sort_order:i+1,plays:0,is_top_song:false,sections:[type==='album'?'albums':'eps'],release_id:ins.data.id,track_number:i+1}).select('id').single();
  if(song.error)throw song.error;
  await window.saveArtistFeatureLinks('artist_song_features','song_id',song.data.id,rows[i].querySelector('.artist-track-feature-select'),selectedArtistPageId);
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
  const artistSelect=document.getElementById('artistReleaseArtist');
  const artistId=artistSelect&&artistSelect.value;
  if(!artistId)throw new Error('Please select an artist for this release.');
  selectedArtistPageId=artistId;
  const type=document.getElementById('artistReleaseType').value;
  const title=document.getElementById('artistReleaseTitle').value.trim();
  const date=document.getElementById('artistReleaseDate').value;
  const art=document.getElementById('artistReleaseArtwork').files[0];
  const rows=[...document.querySelectorAll('#artistReleaseTracks .admin-item')];
  const b=document.getElementById('artistReleaseSubmitButton');if(b){b.disabled=true;b.textContent='UPLOADING...'}
  const releaseVideos=[...document.querySelectorAll('#artistReleaseVideos .artist-release-video-row')].map(function(row){return {title:row.querySelector('.artist-release-video-title')?.value.trim()||'',file:row.querySelector('.artist-release-video-file')?.files[0]||null,thumbnail:row.querySelector('.artist-release-video-thumb')?.files[0]||null,featureSelect:row.querySelector('.artist-release-video-features')}}); if(releaseVideos.some(function(v){return !v.file}))throw new Error('Select a video file for every release video row.'); await createArtistScheduledRelease(type,title,date,art,rows,releaseVideos);
  document.getElementById('artistReleaseTitle').value='';document.getElementById('artistReleaseDate').value='';document.getElementById('artistReleaseArtwork').value='';if(document.getElementById('artistReleaseVideos'))document.getElementById('artistReleaseVideos').innerHTML='';document.getElementById('artistReleaseTracks').innerHTML='';
  await renderArtistMusic(selectedArtistPageId);if(typeof setStatus==='function')setStatus('UPCOMING RELEASE SAVED');
  alert('Upcoming '+type.toUpperCase()+' saved. It will appear publicly on '+(date||'the release date')+'.');
 }catch(e){alert('Upcoming release failed: '+(e.message||e))}finally{const b=document.getElementById('artistReleaseSubmitButton');if(b){b.disabled=false;b.textContent='SAVE UPCOMING RELEASE'}}
};
function setupArtistMusicUploadUI(){
 const type=document.getElementById('artistMusicUploadType'),fields=document.getElementById('artistMusicProjectFields'),tracks=document.getElementById('artistMusicProjectTracks'),add=document.getElementById('artistMusicAddTrack');
 const releaseVideos=document.getElementById('artistReleaseVideos'),addReleaseVideo=document.getElementById('artistAddReleaseVideo');
 window.populateArtistFeatureSelect(document.getElementById('artistSongFeatureArtists')).catch(e=>console.error('Could not load feature artists',e));
 window.populateArtistFeatureSelect(document.getElementById('videoFeatureArtistSelect')).catch(e=>console.error('Could not load video feature artists',e));
 if(releaseVideos&&addReleaseVideo){
  const addVideo=()=>{
   const row=document.createElement('div');row.className='admin-item artist-release-video-row';row.style.cssText='display:grid;grid-template-columns:repeat(3,minmax(120px,1fr)) minmax(150px,1fr) 90px;gap:10px;align-items:center';
   row.innerHTML='<input class="artist-release-video-title" placeholder="Video title"><input class="artist-release-video-file" type="file" accept="video/*"><input class="artist-release-video-thumb" type="file" accept="image/*"><label style="display:flex;flex-direction:column;gap:5px;font-size:11px">FEATURE ARTISTS<select class="artist-release-video-features" multiple size="3" aria-label="Featured artists for video"></select></label><button class="button danger" type="button">REMOVE</button>';
   row.querySelector('button').onclick=()=>row.remove();releaseVideos.appendChild(row);window.populateArtistFeatureSelect(row.querySelector('.artist-release-video-features')).catch(e=>alert('Could not load artists: '+e.message));
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
 const sync=()=>{const project=type.value!=='single';fields.style.display=project?'block':'none';['artistSingleTitleGroup','artistSingleArtworkGroup','artistSingleAudioGroup','artistSingleSectionsGroup','artistSingleFeaturesGroup'].forEach(id=>{const x=document.getElementById(id);if(x)x.style.display=project?'none':''});if(project&&!tracks.children.length)artistUploadTrackRow(tracks,1)};
 type.addEventListener('change',sync);add.onclick=()=>artistUploadTrackRow(tracks,tracks.children.length+1);sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setupArtistMusicUploadUI);else setupArtistMusicUploadUI();


// Events fallback: define these in this file so the Events panel works even if
// another legacy inline admin script fails to initialize.
window.loadEvents = async function(){
  const escapeHtml=function(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')};
 const container=document.getElementById('eventsList');
 if(!container)return;
 const db=(typeof supabaseClient!=='undefined'?supabaseClient:window.supabaseClient);
 if(!db){container.innerHTML='<div class="admin-item"><div class="item-name">Supabase is not initialized. Refresh and try again.</div></div>';return;}
 container.innerHTML='<div class="admin-item"><div class="item-name">Loading events...</div></div>';
 try{
  const r=await db.from('events').select('*').order('sort_order',{ascending:true});
  if(r.error)throw r.error;
  container.innerHTML='';
  (r.data||[]).forEach(function(ev){
   const item=document.createElement('div');item.className='admin-item';
   const safe=function(v){return escapeHtml(v||'')};
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
  const style=document.createElement('style');style.textContent='#fsbEventModal{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.82);display:none;align-items:center;justify-content:center;padding:18px}#fsbEventModal .fsb-event-card{width:min(720px,100%);max-height:92vh;overflow:auto;background:#090909;border:1px solid #444;padding:24px;color:#fff}#fsbEventModal .fsb-event-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:20px}#fsbEventModal label{display:block;font-size:11px;letter-spacing:1px;margin-bottom:7px;color:#aaa}#fsbEventModal input:not([type=checkbox]):not([type=file]),#fsbEventModal input[type=file],#fsbEventModal select,#fsbEventModal textarea{width:100%;box-sizing:border-box;background:#111;color:#fff;border:1px solid #444;padding:12px}#fsbEventModal .fsb-full{grid-column:1/-1}#fsbEventModal .fsb-feature{display:flex;align-items:center;gap:10px}#fsbEventModal .fsb-feature label{margin:0}#fsbEventModal .fsb-event-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:24px}#fsbEventModal .fsb-ticket-providers{display:flex;gap:18px;flex-wrap:wrap}#fsbEventModal .fsb-ticket-providers label{display:flex;align-items:center;gap:8px;margin:0}@media(max-width:560px){#fsbEventModal .fsb-event-grid{grid-template-columns:1fr}#fsbEventModal .fsb-full{grid-column:auto}}';document.head.appendChild(style);
  el=document.createElement('div');el.id='fsbEventModal';el.innerHTML='<div class="fsb-event-card" role="dialog" aria-modal="true" aria-labelledby="fsbEventModalTitle"><div class="panel-title" id="fsbEventModalTitle">ADD EVENT</div><div class="panel-description">Event details shown on the FSB website.</div><form id="fsbEventForm"><div class="fsb-event-grid"><div><label for="fsbEventTitle">EVENT NAME *</label><input id="fsbEventTitle" required maxlength="180" placeholder="FSB Summer Bash"></div><div><label for="fsbEventDate">DATE AND TIME</label><input id="fsbEventDate" placeholder="Oct 15, 2026 · 7 PM"></div><div class="fsb-full"><label for="fsbEventLocation">VENUE / ADDRESS</label><input id="fsbEventLocation" placeholder="Venue name and address"></div><div class="fsb-full"><label for="fsbEventPerformers">OTHER ARTISTS PERFORMING</label><textarea id="fsbEventPerformers" rows="3" placeholder="Enter artist names, separated by commas"></textarea></div><div class="fsb-full"><label for="fsbTicketSalesMode">TICKET SALES METHOD</label><select id="fsbTicketSalesMode"><option value="external">External ticket website</option><option value="on_site">Sell tickets on the FSB site</option></select></div><div class="fsb-full" id="fsbExternalTicketFields"><label for="fsbEventLink">EXTERNAL TICKET / EVENT URL</label><input id="fsbEventLink" type="url" placeholder="https://"></div><div class="fsb-full" id="fsbOnSiteTicketFields" style="display:none"><div class="fsb-event-grid" style="margin-top:0"><div><label for="fsbTicketPrice">TICKET PRICE (USD) *</label><input id="fsbTicketPrice" type="number" min="0.01" step="0.01" placeholder="25.00"></div><div><label for="fsbTicketCapacity">TICKET CAPACITY (OPTIONAL)</label><input id="fsbTicketCapacity" type="number" min="1" step="1" placeholder="Unlimited"></div><div class="fsb-full"><label>ON-SITE CHECKOUT PROVIDERS</label><div class="fsb-ticket-providers"><label><input id="fsbTicketStripe" type="checkbox" checked> Stripe</label><label><input id="fsbTicketPaypal" type="checkbox" checked> PayPal</label></div><div class="panel-description">Stripe requires its checkout and webhook secrets; PayPal requires its app credentials in Supabase.</div></div></div></div><div class="fsb-full"><label for="fsbEventVideo">EVENT VIDEO LINK</label><input id="fsbEventVideo" type="url" placeholder="https://"></div><div><label for="fsbEventContactName">CONTACT NAME</label><input id="fsbEventContactName" placeholder="Contact person or organization"></div><div><label for="fsbEventContactPhone">CONTACT PHONE</label><input id="fsbEventContactPhone" type="tel" placeholder="Phone number"></div><div class="fsb-full"><label for="fsbEventContactEmail">CONTACT EMAIL</label><input id="fsbEventContactEmail" type="email" placeholder="events@example.com"></div><div class="fsb-full"><label for="fsbEventImage">EVENT FLYER / IMAGE (OPTIONAL)</label><input id="fsbEventImage" type="file" accept="image/*"><div id="fsbEventImageCurrent" style="font-size:12px;color:#aaa;margin-top:8px"></div></div><div class="fsb-full fsb-feature"><input id="fsbEventFeatured" type="checkbox"><label for="fsbEventFeatured">FEATURE THIS EVENT AT THE TOP OF UPCOMING EVENTS</label></div></div><div class="fsb-event-actions"><button class="button" type="button" id="fsbEventCancel">CANCEL</button><button class="button primary" type="submit" id="fsbEventSave">ADD EVENT</button></div></form></div>';
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
  el.querySelector('#fsbEventPerformers').value=ev?(ev.performers||''):'';
  el.querySelector('#fsbEventLink').value=ev?(ev.link||''):'';
  el.querySelector('#fsbTicketSalesMode').value=ev?(ev.ticket_sales_mode||'external'):'external';
  el.querySelector('#fsbTicketPrice').value=ev&&ev.ticket_price!=null?ev.ticket_price:'';
  el.querySelector('#fsbTicketCapacity').value=ev&&ev.ticket_capacity!=null?ev.ticket_capacity:'';
  el.querySelector('#fsbTicketStripe').checked=!ev||!Array.isArray(ev.ticket_providers)||ev.ticket_providers.includes('stripe');
  el.querySelector('#fsbTicketPaypal').checked=!ev||!Array.isArray(ev.ticket_providers)||ev.ticket_providers.includes('paypal');
  const updateTicketFields=function(){const onSite=el.querySelector('#fsbTicketSalesMode').value==='on_site';el.querySelector('#fsbOnSiteTicketFields').style.display=onSite?'block':'none';el.querySelector('#fsbExternalTicketFields').style.display=onSite?'none':'block';el.querySelector('#fsbTicketPrice').required=onSite};
  el.querySelector('#fsbTicketSalesMode').onchange=updateTicketFields;updateTicketFields();
  el.querySelector('#fsbEventVideo').value=ev?(ev.video_link||''):'';
  el.querySelector('#fsbEventContactName').value=ev?(ev.contact_name||''):'';
  el.querySelector('#fsbEventContactEmail').value=ev?(ev.contact_email||''):'';
  el.querySelector('#fsbEventContactPhone').value=ev?(ev.contact_phone||''):'';
  el.querySelector('#fsbEventFeatured').checked=!!(ev&&ev.featured);
  el.querySelector('#fsbEventImageCurrent').textContent=existingImage?'Current flyer saved. Choose a file only to replace it.':'No flyer uploaded yet.';
  el.style.display='flex';el.querySelector('#fsbEventTitle').focus();
 }
 window.addEvent=function(){openForm(null)};
 window.removeEvent=async function(id){
  if(!confirm('Remove this event from the website? This cannot be undone.'))return;
  try{
   const db=eventDb();
   const r=await db.from('events').delete().eq('id',id).select('id');
   if(r.error)throw r.error;
   if(!r.data||!r.data.length)throw new Error('No event was deleted. Check Supabase permissions for the events table.');
   await window.loadEvents();
   if(typeof window.setStatus==='function')window.setStatus('EVENT REMOVED');
  }catch(e){alert('Could not remove event: '+(e.message||e))}
 };
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
    const ticketMode=el.querySelector('#fsbTicketSalesMode').value,onSite=ticketMode==='on_site',providers=[];if(onSite){if(el.querySelector('#fsbTicketStripe').checked)providers.push('stripe');if(el.querySelector('#fsbTicketPaypal').checked)providers.push('paypal');if(!providers.length)throw new Error('Select Stripe, PayPal, or both for on-site checkout.');if(!(Number(el.querySelector('#fsbTicketPrice').value)>0))throw new Error('Enter a ticket price greater than zero.')}const capacityValue=el.querySelector('#fsbTicketCapacity').value.trim();
    const payload={title,date:el.querySelector('#fsbEventDate').value.trim(),location:el.querySelector('#fsbEventLocation').value.trim(),link:el.querySelector('#fsbEventLink').value.trim(),video_link:el.querySelector('#fsbEventVideo').value.trim(),performers:el.querySelector('#fsbEventPerformers').value.trim(),contact_name:el.querySelector('#fsbEventContactName').value.trim(),contact_email:el.querySelector('#fsbEventContactEmail').value.trim(),contact_phone:el.querySelector('#fsbEventContactPhone').value.trim(),featured:el.querySelector('#fsbEventFeatured').checked,image:image||'',ticket_sales_mode:ticketMode,ticket_price:onSite?Number(el.querySelector('#fsbTicketPrice').value):null,ticket_capacity:onSite&&capacityValue?Number(capacityValue):null,ticket_providers:onSite?providers:['stripe','paypal']};
    if(wasEditing){const up=await db.from('events').update(payload).eq('id',editingEventId);if(up.error)throw up.error}
    else{const sr=await db.from('events').select('sort_order').order('sort_order',{ascending:false}).limit(1);if(sr.error)throw sr.error;payload.sort_order=sr.data&&sr.data.length?(Number(sr.data[0].sort_order)||0)+1:1;const ins=await db.from('events').insert(payload);if(ins.error)throw ins.error}
    close();await window.loadEvents();if(typeof setStatus==='function')setStatus(wasEditing?'EVENT UPDATED':'EVENT ADDED');
   }catch(err){alert('Could not save event: '+(err.message||err))}
   finally{btn.disabled=false;btn.textContent=editingEventId!==null&&editingEventId!==undefined?'SAVE CHANGES':'ADD EVENT'}
  });
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initForm);else initForm();
})();


// Hardening for the Upcoming Releases artist picker: load on tab open and on
// focus, and show the actual database error instead of leaving a dead dropdown.
(function(){
 function db(){if(typeof supabaseClient!=='undefined')return supabaseClient;if(window.supabaseClient)return window.supabaseClient;throw new Error('Supabase client is not ready yet.')}
 function safe(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#039;')}
 let busy=false,loaded=false;
 window.loadArtistsForUpcoming=async function(){
  const s=document.getElementById('upcomingArtist');if(!s||busy)return;
  busy=true;s.disabled=true;s.innerHTML='<option value="">LOADING ARTISTS...</option>';
  try{
   const r=await db().from('artists').select('id,name').order('name',{ascending:true});
   if(r.error)throw r.error;
   const artists=r.data||[];
   const prior=s.value;
   s.innerHTML='<option value="">NO ARTIST SELECTED</option>'+artists.map(a=>'<option value="'+safe(String(a.id))+'">'+safe(a.name)+'</option>').join('');
   if(prior && artists.some(a=>String(a.id)===String(prior)))s.value=prior;
   if(!artists.length)s.innerHTML='<option value="">NO ARTISTS FOUND — ADD ONE IN ARTIST PAGES</option>';
   s.disabled=false;loaded=true;
   const note=s.parentElement.querySelector('.upcoming-artist-error');if(note)note.remove();
   if(typeof window.populateUpcomingTargetOptions==='function')await window.populateUpcomingTargetOptions();
  }catch(e){
   console.error('Upcoming artist picker failed:',e);
   s.disabled=false;s.innerHTML='<option value="">ARTISTS FAILED TO LOAD — CLICK TO RETRY</option>';
   let note=s.parentElement.querySelector('.upcoming-artist-error');
   if(!note){note=document.createElement('div');note.className='item-meta upcoming-artist-error';note.style.color='#e88';s.parentElement.appendChild(note)}
   note.textContent='Artist list error: '+(e.message||String(e));
  }finally{busy=false}
 };
 function bind(){
  const s=document.getElementById('upcomingArtist');if(!s||s.dataset.fsbPickerBound)return;s.dataset.fsbPickerBound='1';
  s.addEventListener('focus',function(){if(!loaded)window.loadArtistsForUpcoming()});
  s.addEventListener('pointerdown',function(){if(!loaded)window.loadArtistsForUpcoming()});
  s.addEventListener('change',function(){if(typeof window.populateUpcomingTargetOptions==='function')window.populateUpcomingTargetOptions()});
  window.loadArtistsForUpcoming();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();

(function(){
 const $=id=>document.getElementById(id);
 function db(){if(typeof supabaseClient!=='undefined')return supabaseClient;if(window.supabaseClient)return window.supabaseClient;throw new Error('Supabase client is not ready yet.')}
 function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
 function list(v){return String(v||'').split(',').map(x=>x.trim()).filter(Boolean)}
 function slug(v){return String(v||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')}
 function setStatus(message,bad){let n=$('merchProductsStatus');if(!n){const host=$('merchProductsAdminList');if(!host)return;n=document.createElement('div');n.id='merchProductsStatus';n.className='item-meta';n.style.marginTop='15px';host.parentNode.insertBefore(n,host)}n.style.color=bad?'#e88':'#aaa';n.textContent=message}
 function reset(){['merchProductId','merchProductName','merchProductPrice','merchProductComparePrice','merchProductDescription','merchProductImages','merchProductSizes','merchProductColors','merchProductSupplier','merchProductSupplierId','merchProductSupplierUrl','merchProductPrintfulId','merchProductPrintfulVariant'].forEach(id=>{if($(id))$(id).value=''});['merchProductStock','merchProductSort'].forEach(id=>{if($(id))$(id).value=id==='merchProductStock'?'0':'0'});if($('merchProductCategory'))$('merchProductCategory').value='Apparel';if($('merchProductFulfillment'))$('merchProductFulfillment').value='own_inventory';if($('merchProductTrackStock'))$('merchProductTrackStock').checked=true;if($('merchProductFeatured'))$('merchProductFeatured').checked=false;if($('merchProductActive'))$('merchProductActive').checked=false;const b=document.querySelector('[onclick="saveMerchProduct()"]');if(b)b.textContent='SAVE PRODUCT'}
 window.resetMerchProductForm=reset;
 window.loadMerchProductsAdmin=async function(){
  const host=$('merchProductsAdminList');if(!host)return;host.innerHTML='<div class="admin-item"><div class="item-name">Loading products…</div></div>';
  try{const r=await db().from('merch_products').select('*').order('sort_order',{ascending:true}).order('created_at',{ascending:false});if(r.error)throw r.error;const rows=r.data||[];if(!rows.length){host.innerHTML='<div class="admin-item"><div class="item-name">No store products yet.</div><div class="item-meta">Create your first product using the form above.</div></div>';return}
   host.innerHTML=rows.map(p=>'<div class="admin-item"><div class="item-info"><img class="item-image" src="'+esc((p.images||[])[0]||'flysincebirthchrome.PNG')+'" alt=""><div><div class="item-name">'+esc(p.name)+'</div><div class="item-meta">'+esc(p.category)+' · $'+Number(p.price||0).toFixed(2)+' · '+esc(({printful:'PRINTFUL',supplier:'OTHER SUPPLIER',own_inventory:'OWN INVENTORY'})[p.fulfillment_method]||p.fulfillment_method)+' · '+(p.active?'PUBLISHED':'DRAFT')+(p.fulfillment_method==='own_inventory'?' · STOCK '+Number(p.stock_quantity||0):'')+'</div></div></div><div class="actions" style="margin-top:0"><button class="button" type="button" data-edit-product="'+esc(p.id)+'">EDIT</button><button class="button danger" type="button" data-delete-product="'+esc(p.id)+'">DELETE</button></div></div>').join('');
   host.querySelectorAll('[data-edit-product]').forEach(b=>b.onclick=()=>edit(rows.find(p=>String(p.id)===b.dataset.editProduct)));
   host.querySelectorAll('[data-delete-product]').forEach(b=>b.onclick=()=>removeProduct(b.dataset.deleteProduct,rows));
  }catch(e){console.error('Store product admin load failed',e);host.innerHTML='<div class="admin-item"><div class="item-name">Could not load store products.</div><div class="item-meta">'+esc(e.message||e)+'</div></div>'}
 };
 function edit(p){if(!p)return;$('merchProductId').value=p.id;$('merchProductName').value=p.name||'';$('merchProductCategory').value=p.category||'Apparel';$('merchProductPrice').value=p.price??'';$('merchProductComparePrice').value=p.compare_at_price??'';$('merchProductDescription').value=p.description||'';$('merchProductImages').value=(p.images||[]).join('\n');$('merchProductSizes').value=(p.sizes||[]).join(', ');$('merchProductColors').value=(p.colors||[]).join(', ');$('merchProductFulfillment').value=p.fulfillment_method||'own_inventory';$('merchProductSupplier').value=p.supplier_name||'';$('merchProductSupplierId').value=p.supplier_product_id||'';$('merchProductSupplierUrl').value=p.supplier_product_url||'';$('merchProductPrintfulId').value=p.printful_product_id||'';$('merchProductPrintfulVariant').value=p.printful_variant_id||'';$('merchProductStock').value=p.stock_quantity??0;$('merchProductSort').value=p.sort_order??0;$('merchProductTrackStock').checked=!!p.track_inventory;$('merchProductFeatured').checked=!!p.featured;$('merchProductActive').checked=!!p.active;const b=document.querySelector('[onclick="saveMerchProduct()"]');if(b)b.textContent='UPDATE PRODUCT';$('merchProductName').scrollIntoView({behavior:'smooth',block:'center'});setStatus('Editing '+p.name,false)}
 window.saveMerchProduct=async function(){
  const name=$('merchProductName').value.trim(),price=Number($('merchProductPrice').value);
  const compareRaw=$('merchProductComparePrice').value.trim(),comparePrice=compareRaw===''?null:Number(compareRaw);
  const stockRaw=$('merchProductStock').value.trim(),stockQuantity=stockRaw===''?0:Number(stockRaw);
  const sortRaw=$('merchProductSort').value.trim(),sortOrder=sortRaw===''?0:Number(sortRaw);
  if(!name){setStatus('Enter a product name.',true);return}
  if(!$('merchProductPrice').value||!Number.isFinite(price)||price<0){setStatus('Enter a valid price.',true);return}
  if(compareRaw!==''&&(!Number.isFinite(comparePrice)||comparePrice<0)){setStatus('Enter a valid compare-at price.',true);return}
  if(!Number.isSafeInteger(stockQuantity)||stockQuantity<0){setStatus('Enter a whole, non-negative stock quantity.',true);return}
  if(!Number.isSafeInteger(sortOrder)){setStatus('Enter a whole-number sort order.',true);return}
  const images=$('merchProductImages').value.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const method=$('merchProductFulfillment').value;
  const payload={name,slug:slug(name),category:$('merchProductCategory').value,price,compare_at_price:comparePrice,description:$('merchProductDescription').value.trim(),images,sizes:list($('merchProductSizes').value),colors:list($('merchProductColors').value),fulfillment_method:method,supplier_name:$('merchProductSupplier').value.trim()||null,supplier_product_id:$('merchProductSupplierId').value.trim()||null,supplier_product_url:$('merchProductSupplierUrl').value.trim()||null,printful_product_id:$('merchProductPrintfulId').value.trim()||null,printful_variant_id:$('merchProductPrintfulVariant').value.trim()||null,stock_quantity:stockQuantity,sort_order:sortOrder,track_inventory:$('merchProductTrackStock').checked,featured:$('merchProductFeatured').checked,active:$('merchProductActive').checked,updated_at:new Date().toISOString()};
  const id=$('merchProductId').value;const button=document.querySelector('[onclick="saveMerchProduct()"]');if(button){button.disabled=true;button.textContent='SAVING…'}
  try{let q;if(id)q=await db().from('merch_products').update(payload).eq('id',id);else q=await db().from('merch_products').insert(payload);if(q.error)throw q.error;setStatus('Product saved.',false);reset();await window.loadMerchProductsAdmin()}catch(e){console.error('Product save failed',e);setStatus('Could not save product: '+(e.message||e)+'. If this is a permission error, secure admin access must be configured before writes are enabled.',true)}finally{if(button){button.disabled=false;button.textContent=$('merchProductId').value?'UPDATE PRODUCT':'SAVE PRODUCT'}}
 };
 async function removeProduct(id,rows){const p=rows.find(x=>String(x.id)===String(id));if(!p||!confirm('Delete "'+p.name+'" from the store?'))return;try{const r=await db().from('merch_products').delete().eq('id',id);if(r.error)throw r.error;setStatus('Product deleted.',false);await window.loadMerchProductsAdmin()}catch(e){setStatus('Could not delete product: '+(e.message||e),true)}}
 function init(){if(!$('merchProductsAdminList'))return;window.loadMerchProductsAdmin();const tab=document.querySelector('.admin-nav button');if(tab&&!tab.dataset.fsbMerchLoadBound){tab.dataset.fsbMerchLoadBound='1';document.querySelectorAll('.main-page-tabs button').forEach(b=>b.addEventListener('click',()=>{if((b.getAttribute('onclick')||'').includes("'merch'"))window.loadMerchProductsAdmin()}))}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

/* Customer account support inbox. Replies are shown in the customer's account;
   email notifications require a separately configured mail provider. */
(function(){
 const $=id=>document.getElementById(id);
 function db(){if(typeof supabaseClient!=='undefined')return supabaseClient;if(window.supabaseClient)return window.supabaseClient;throw new Error('Supabase client is not ready yet.')}
 function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
 function mount(){const store=$('store');if(!store||$('fsbSupportAdmin'))return;const panel=document.createElement('section');panel.id='fsbSupportAdmin';panel.style.cssText='display:block;margin-top:40px;padding-top:30px;border-top:1px solid #242424';panel.innerHTML='<div class="panel-header"><div class="panel-title">CUSTOMER SUPPORT</div><div class="panel-description">Account help and order inquiries. Replies are visible in the customer account. Email notifications are not enabled until an FSB mail provider is configured.</div></div><div id="fsbSupportAdminStatus" class="item-meta" role="status" aria-live="polite"></div><div id="fsbSupportAdminList" class="item-list"><div class="admin-item"><div class="item-name">Open the STORE tab to load support requests.</div></div></div>';const merch=$('merch');if(merch)store.insertBefore(panel,merch);else store.appendChild(panel)}
 function status(text,bad){const node=$('fsbSupportAdminStatus');if(node){node.textContent=text;node.style.color=bad?'#e88':'#aaa'}}
 window.loadFsbSupportAdmin=async function(){mount();const host=$('fsbSupportAdminList');if(!host)return;host.innerHTML='<div class="admin-item"><div class="item-name">Loading support requests…</div></div>';try{const {data,error}=await db().from('customer_support_requests').select('id,customer_email,topic,subject,message,related_store_order_id,related_ticket_order_id,status,admin_reply,created_at').order('created_at',{ascending:false});if(error)throw error;if(!data?.length){host.innerHTML='<div class="admin-item"><div class="item-name">No support requests yet.</div></div>';return}host.innerHTML=data.map(r=>'<article class="admin-item" style="display:block"><div class="item-name">'+esc(r.subject)+'</div><div class="item-meta">'+esc(r.customer_email)+' · '+esc(r.topic.replace('_',' '))+' · '+esc(new Date(r.created_at).toLocaleString())+' · '+(r.related_store_order_id?'Store order #'+esc(r.related_store_order_id):r.related_ticket_order_id?'Ticket order '+esc(r.related_ticket_order_id):'No linked order')+'</div><div style="white-space:pre-wrap;line-height:1.6;margin:14px 0">'+esc(r.message)+'</div><label style="display:block;margin:12px 0 6px">STATUS</label><select data-support-status="'+esc(r.id)+'" style="max-width:260px"><option value="open" '+(r.status==='open'?'selected':'')+'>Open</option><option value="in_progress" '+(r.status==='in_progress'?'selected':'')+'>In progress</option><option value="waiting_customer" '+(r.status==='waiting_customer'?'selected':'')+'>Waiting for customer</option><option value="closed" '+(r.status==='closed'?'selected':'')+'>Closed</option></select><label style="display:block;margin:12px 0 6px">REPLY (SHOWN IN CUSTOMER ACCOUNT)</label><textarea data-support-reply="'+esc(r.id)+'" maxlength="5000" rows="4" style="width:100%;max-width:760px">'+esc(r.admin_reply||'')+'</textarea><div class="actions"><button type="button" class="button primary" data-support-save="'+esc(r.id)+'">SAVE REPLY &amp; STATUS</button></div></article>').join('');host.querySelectorAll('[data-support-save]').forEach(button=>button.addEventListener('click',()=>save(button.dataset.supportSave,button)))}catch(e){console.error('Support inbox load failed',e);host.innerHTML='<div class="admin-item"><div class="item-name">Could not load support requests.</div><div class="item-meta">'+esc(e.message||e)+'</div></div>'}};
 async function save(id,button){const reply=hostValue('[data-support-reply="'+CSS.escape(id)+'"]');const nextStatus=hostValue('[data-support-status="'+CSS.escape(id)+'"]');if(reply==null||nextStatus==null)return;button.disabled=true;button.textContent='SAVING…';try{const now=new Date().toISOString();const {data,error}=await db().from('customer_support_requests').update({admin_reply:reply,status:nextStatus,admin_replied_at:reply.trim()?now:null,updated_at:now}).eq('id',id).select('id').maybeSingle();if(error)throw error;if(!data)throw new Error('No request was updated. Confirm this account has FSB admin access.');status('Reply and status saved.',false);await window.loadFsbSupportAdmin()}catch(e){console.error('Support reply save failed',e);status('Could not save reply: '+(e.message||e),true);button.disabled=false;button.textContent='SAVE REPLY & STATUS'}}
 function hostValue(selector){const node=document.querySelector(selector);return node?node.value:null}
 function init(){mount();document.addEventListener('click',event=>{const button=event.target.closest('button');if(button&&(button.getAttribute('onclick')||'').includes("'store'"))window.loadFsbSupportAdmin()});const store=$('store');if(store?.classList.contains('active'))window.loadFsbSupportAdmin()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
