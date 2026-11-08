(() => {
 const db=window.supabaseClient,$=id=>document.getElementById(id),releaseId=new URLSearchParams(location.search).get('id');
 const element=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const date=value=>value?new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'long',day:'numeric',year:'numeric'}).format(new Date(value.length===10?value+'T12:00:00Z':value)):'';
 function artistCredits(host,ids,names,external=[]){let count=0;for(const id of [...new Set(ids.filter(Boolean).map(String))]){if(count)host.append(document.createTextNode(count===1?' feat. ':', '));const a=element('a',names.get(id)||'Artist');a.href='artist.html?id='+encodeURIComponent(id);host.append(a);count++;}for(const credit of external){try{const url=new URL(credit.url);if(!credit.name||!['http:','https:'].includes(url.protocol))continue;if(count)host.append(document.createTextNode(count===1?' feat. ':', '));const a=element('a',credit.name);a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';host.append(a);count++;}catch(_){}}}
 async function load(){
  if(!releaseId)throw Error('Choose an album or EP from the music library.');
  const catalog=await window.FSBRelease.catalog(),release=catalog.artist_releases.find(r=>String(r.id)===releaseId);if(!release)throw Error('This album or EP could not be found.');
  const tracks=catalog.artist_songs.filter(s=>String(s.release_id)===releaseId).sort((a,b)=>(a.track_number??2147483647)-(b.track_number??2147483647)||String(a.id).localeCompare(String(b.id)));
  const videos=catalog.videos.filter(v=>String(v.release_id)===releaseId);
  const [artists,songFeatures,videoFeatures]=await Promise.all([db.from('artists').select('id,name'),tracks.length?db.from('artist_song_features').select('song_id,artist_id,sort_order').in('song_id',tracks.map(s=>s.id)).order('sort_order'):Promise.resolve({data:[]}),videos.length?db.from('video_artist_features').select('video_id,artist_id,sort_order').in('video_id',videos.map(v=>v.id)).order('sort_order'):Promise.resolve({data:[]})]);
  if(artists.error)throw artists.error;const names=new Map((artists.data||[]).map(a=>[String(a.id),a.name]));
  $('releaseTitle').textContent=release.title||'Untitled';document.title=(release.title||'Release')+' | Fly Since Birth';$('releaseType').textContent=release.type==='ep'?'EP':'ALBUM';artistCredits($('releaseArtist'),[release.artist_id],names);
  $('releaseDate').textContent=(release.locked?'Releases ':'Released ')+date(release.unlock_at||release.release_date);if(!release.release_date&&!release.unlock_at)$('releaseDate').textContent='';
  $('releaseSummary').textContent=tracks.length+' '+(tracks.length===1?'track':'tracks')+(release.locked?' · Upcoming':'');$('releaseImage').src=release.artwork_url||'fsblogo.PNG';$('releaseImage').alt=(release.title||'Release')+' cover';$('releaseImage').onerror=function(){this.onerror=null;this.src='fsblogo.PNG';};
  const playable=tracks.filter(t=>!t.locked&&t.audio_url);if(release.locked){$('releaseNotice').hidden=false;$('releaseNotice').textContent=playable.length?playable.length+' '+(playable.length===1?'track is':'tracks are')+' available now. The remaining tracks unlock worldwide at midnight Eastern on '+date(release.unlock_at||release.release_date)+'.':'Preview the tracklist and save your favorites. Playback unlocks worldwide at midnight Eastern'+(release.release_date?' on '+date(release.unlock_at||release.release_date):'')+'.';}
  $('albumPlayerStatus').textContent=tracks.some(t=>t.locked)?'Released tracks play in order. Locked tracks are skipped.':'Choose a track or play the full '+(release.type==='ep'?'EP.':'album.');
  if(window.fsbMusicLibraryReady)await window.fsbMusicLibraryReady;
  const enriched=tracks.map(t=>({...t,artist_name:names.get(String(t.artist_id))||names.get(String(release.artist_id))||'FLY SINCE BIRTH',release_title:release.title,release_type:release.type,image_url:t.image_url||release.artwork_url}));
  $('trackList').replaceChildren();if(!tracks.length)$('trackList').append(element('p','The tracklist will be announced soon.','release-empty'));
  for(const [index,track] of enriched.entries()){
   const row=element('div',null,'release-track');row.dataset.albumSong=String(track.id);const number=element('span',String(track.track_number||index+1).padStart(2,'0'),'track-number');number.setAttribute('aria-hidden','true');
   const meta=element('div',null,'track-meta'),title=element('button',track.title||'Untitled','track-title');title.type='button';title.disabled=track.locked||!track.audio_url;title.setAttribute('aria-label',(track.locked?'Unreleased: ':'Play ')+(track.title||'track'));title.onclick=()=>window.FSBAlbum.playSong(track);meta.append(title);const credits=element('span',null,'track-credits');artistCredits(credits,[track.artist_id,...(songFeatures.data||[]).filter(f=>String(f.song_id)===String(track.id)).map(f=>f.artist_id)],names,track.external_features||[]);meta.append(credits);
   const controls=element('div',null,'track-controls'),play=element('button',null,'track-play');play.type='button';play.dataset.albumPlay=String(track.id);play.disabled=track.locked||!track.audio_url;play.onclick=()=>window.FSBAlbum.playSong(track);controls.append(play);row.append(number,meta,controls);
   window.decorateSongControls?.(row,track);const actions=row.querySelector('.fsb-song-actions');if(actions)controls.append(actions);
   if(!track.locked&&release.locked)meta.append(element('span','AVAILABLE NOW','track-availability'));else if(!track.locked&&!track.audio_url)meta.append(element('span','AUDIO UNAVAILABLE','track-availability'));
   $('trackList').append(row);
  }
  window.FSBAlbum.setTracks(enriched);
  $('releaseVideoList').replaceChildren();const items=[...(release.video_url&&!release.locked?[{title:release.title,link:release.video_url,image:release.artwork_url,artist_id:release.artist_id,releaseVideo:true}]:[]),...videos.filter(v=>!v.locked&&v.link)];const seen=new Set();
  for(const video of items){if(seen.has(video.link))continue;seen.add(video.link);const card=element('article',null,'release-video'),link=element('a');link.href='video.html?'+(video.releaseVideo?'release_id='+encodeURIComponent(releaseId):'video_id='+encodeURIComponent(video.id));link.style.cssText='color:inherit;text-decoration:none';const image=element('img');image.src=video.image||'fsblogo.PNG';image.alt='';image.loading='lazy';link.append(image,element('div',video.title||'Video','release-video-title'));card.append(link);const credits=element('div',null,'release-video-credits');artistCredits(credits,[video.artist_id,...(videoFeatures.data||[]).filter(f=>String(f.video_id)===String(video.id)).map(f=>f.artist_id)],names,video.external_features||[]);card.append(credits);$('releaseVideoList').append(card);}
  $('releaseVideos').hidden=!items.length;
 }
 load().catch(error=>{$('releaseTitle').textContent='Release unavailable';$('releaseSummary').textContent=error.message||'Please refresh and try again.';$('trackList').replaceChildren();$('releaseTracks').hidden=true;$('releaseArtwork').hidden=true;});
})();

