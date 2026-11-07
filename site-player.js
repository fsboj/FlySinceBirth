/* One bottom music player, with a queue supplied by the current listening context. */
(() => {
 if(window.FSBPlayer)return;
 let bar=document.getElementById('miniPlayer'),audio=document.getElementById('audioPlayer')||document.getElementById('releaseAudioPlayer');
 if(!bar){bar=document.createElement('aside');bar.id='miniPlayer';bar.className='mini-player';bar.hidden=true;bar.setAttribute('aria-label','Music player');bar.innerHTML='<div class="mini-player-info"><strong id="nowTitle">Choose a song</strong><span id="nowArtist">FLY SINCE BIRTH</span></div><span class="mini-player-status" id="playerStatus" role="status" aria-live="polite"></span><button class="mini-player-close" id="closeMiniPlayer" type="button" aria-label="Close music player">×</button>';document.body.append(bar);}
 if(!audio){audio=document.createElement('audio');audio.id='audioPlayer';}
 audio.className='audio-player';audio.controls=true;audio.setAttribute('controlsList','nodownload');audio.setAttribute('aria-label','Now playing');audio.preload='metadata';audio.style.cssText='';
 const controls=document.createElement('div');controls.className='site-player-controls';
 const arrow=(name,glyph)=>{const b=document.createElement('button');b.type='button';b.className='site-player-skip';b.setAttribute('aria-label',name);b.title=name;b.textContent=glyph;return b;};
 const previous=arrow('Previous track','‹'),next=arrow('Next track','›');controls.append(previous,audio,next);bar.insertBefore(controls,bar.querySelector('#closeMiniPlayer'));
 const style=document.createElement('style');style.textContent='#miniPlayer[hidden]{display:none!important}#miniPlayer{position:fixed;inset:auto 0 0;z-index:1000;display:grid;grid-template-columns:minmax(150px,260px) minmax(220px,1fr) auto;align-items:center;gap:18px;padding:9px clamp(16px,4vw,48px);min-height:72px;background:rgba(8,8,8,.97);border-top:1px solid #333;box-shadow:0 -8px 30px #0009;backdrop-filter:blur(14px);color:#fff;font-family:Arial,sans-serif}#miniPlayer .mini-player-info{min-width:0}#miniPlayer .mini-player-info strong,#miniPlayer .mini-player-info span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#miniPlayer .mini-player-info strong{font-size:13px}#miniPlayer .mini-player-info span{margin-top:4px}#miniPlayer .site-player-controls{display:flex;gap:10px;align-items:center;min-width:0}#miniPlayer .audio-player{display:block;flex:1;width:100%;min-width:100px;height:40px;margin:0;accent-color:#fff}#miniPlayer .site-player-skip{flex:0 0 34px;width:34px;height:36px;border:1px solid #444;background:#111;color:#fff;font-size:28px;line-height:1;cursor:pointer;border-radius:6px}#miniPlayer .site-player-skip:disabled{opacity:.3;cursor:default}#miniPlayer .site-player-skip:focus-visible{outline:2px solid #fff;outline-offset:3px}#miniPlayer .mini-player-close{width:34px;height:34px;border:1px solid #444;background:#111;color:#fff;font-size:22px;cursor:pointer}#miniPlayer .mini-player-status{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}body.mini-player-open{padding-bottom:110px!important}@media(max-width:600px){#miniPlayer{grid-template-columns:minmax(0,1fr) auto;gap:8px 12px;padding:10px 14px}#miniPlayer .mini-player-info{grid-column:1/-1}#miniPlayer .site-player-controls{grid-column:1}#miniPlayer .mini-player-close{grid-column:2}#miniPlayer .fsb-motion-player{width:42px;height:42px}}';document.head.append(style);
 let queue=[],index=-1,version=0;const names=new Map();
 const status=value=>{document.getElementById('playerStatus').textContent=value;};
 const playable=song=>song?.id&&song.audio_url&&!song.locked;
 function announce(){previous.disabled=index<=0;next.disabled=index<0||index>=queue.length-1;window.dispatchEvent(new CustomEvent('fsb:player-change',{detail:{queue:queue.map(s=>({...s})),index}}));}
 async function playAt(target,step=1){
  if(target<0||target>=queue.length)return;
  const token=++version;audio.pause();status('Loading track…');
  try{
   const catalog=await window.FSBRelease.catalog(true);if(token!==version)return;
   const latest=new Map(catalog.artist_songs.map(s=>[String(s.id),s]));let chosen=target;
   while(chosen>=0&&chosen<queue.length&&!playable(latest.get(String(queue[chosen].id))))chosen+=step;
   if(chosen<0||chosen>=queue.length){status('No released tracks remain in this direction.');return;}
   const song={...queue[chosen],...latest.get(String(queue[chosen].id))};
   if(!song.artist_name){if(!names.has(String(song.artist_id))){const db=window.supabaseClient||(typeof supabaseClient!=='undefined'?supabaseClient:null);if(db){const r=await db.from('artists').select('name').eq('id',song.artist_id).maybeSingle();if(r.data?.name)names.set(String(song.artist_id),r.data.name);}}song.artist_name=names.get(String(song.artist_id))||'FLY SINCE BIRTH';}
   if(token!==version)return;queue[chosen]=song;index=chosen;
   bar.hidden=false;document.body.classList.add('mini-player-open');document.getElementById('nowTitle').textContent=song.title||'Untitled';window.FSBPlayerCredits.set(document.getElementById('nowArtist'),song);window.FSBMotion?.player(song);window.fsbTrackMedia?.(audio,'music','song:'+song.id);
   audio.src=song.audio_url;announce();await audio.play();if(token===version)status('Playing '+song.title);
  }catch(error){if(token===version)status(error?.name==='NotAllowedError'?'Press play to continue.':'This track could not play. Try again or choose another song.');}
 }
 function play(song,source=[song]){if(!playable(song)){status('This song is not released yet.');return;}
  const seen=new Set();queue=source.filter(s=>{if(!playable(s)||seen.has(String(s.id)))return false;seen.add(String(s.id));return true;}).map(s=>({...s}));
  const target=queue.findIndex(s=>String(s.id)===String(song.id));if(target<0){queue=[{...song}];index=-1;return playAt(0);}index=-1;return playAt(target);
 }
 function close(){version++;audio.pause();audio.removeAttribute('src');audio.load();bar.hidden=true;document.body.classList.remove('mini-player-open');queue=[];index=-1;announce();}
 previous.onclick=()=>playAt(index-1,-1);next.onclick=()=>playAt(index+1);document.getElementById('closeMiniPlayer').onclick=close;
 audio.addEventListener('ended',()=>{if(index>=0&&index<queue.length-1)playAt(index+1);else status('You reached the end of this list.');});
 window.FSBPlayer={play,playAt,close,audio,getState:()=>({queue:queue.map(s=>({...s})),index})};announce();
})();
