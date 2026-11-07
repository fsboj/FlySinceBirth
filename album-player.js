/* Album queue uses server-authorized audio URLs for every track. */
(() => {
 const $=id=>document.getElementById(id),audio=$('releaseAudioPlayer');if(!audio)return;
 let tracks=[],queue=[],index=-1,request=0;
 const playable=song=>!!song?.audio_url&&!song.locked;
 const status=text=>{$('albumPlayerStatus').textContent=text;};
 function render(){
  $('albumPlayAll').disabled=!tracks.some(playable);$('albumShuffle').disabled=!tracks.some(playable);
  $('albumPrevious').disabled=index<=0;$('albumNext').disabled=index<0||index>=queue.length-1;
  const host=$('albumQueue');host.replaceChildren();$('albumQueuePanel').hidden=!queue.length;
  for(const [i,song]of queue.entries()){
   const button=document.createElement('button');button.type='button';button.className='album-queue-song';button.setAttribute('aria-label','Play '+song.title);if(i===index)button.setAttribute('aria-current','true');
   const number=document.createElement('span');number.textContent=String(i+1).padStart(2,'0');
   const title=document.createElement('span');title.textContent=song.title||'Untitled';
   const state=document.createElement('small');state.textContent=i===index?'CURRENT':i<index?'PLAYED':'UP NEXT';button.append(number,title,state);button.onclick=()=>playAt(i);host.append(button);
  }
  document.querySelectorAll('#trackList [data-album-song]').forEach(row=>row.classList.toggle('album-track-current',String(queue[index]?.id)===row.dataset.albumSong));
 }
 async function playAt(next,step=1){
  if(next<0||next>=queue.length)return;
  const token=++request;audio.pause();status('Loading track…');
  try{
   const catalog=await window.FSBRelease.catalog(true);if(token!==request)return;
   const latest=new Map(catalog.artist_songs.map(song=>[String(song.id),song]));
   let chosen=next;while(chosen>=0&&chosen<queue.length&&!playable(latest.get(String(queue[chosen].id))))chosen+=step;
   if(chosen<0||chosen>=queue.length){status('No released tracks remain in this direction.');return;}
   const song=latest.get(String(queue[chosen].id));queue[chosen]={...queue[chosen],...song};index=chosen;
   window.fsbTrackMedia?.(audio,'music','song:'+song.id);window.FSBMotion?.player(song);
   audio.src=song.audio_url;audio.style.display='block';$('albumNowPlaying').textContent=song.title||'Untitled';render();
   await audio.play();if(token===request)status('Playing '+song.title);
  }catch(error){if(token===request)status(error?.name==='NotAllowedError'?'Press play in the audio player to continue.':'Playback could not start. Try this track again.');}
 }
 function begin(songId,shuffle=false){
  queue=tracks.filter(playable).map(song=>({...song}));
  if(shuffle)for(let i=queue.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[queue[i],queue[j]]=[queue[j],queue[i]];}
  index=-1;render();if(!queue.length){status('No tracks are released yet.');return;}
  const start=songId==null?0:queue.findIndex(song=>String(song.id)===String(songId));if(start<0){status('This track is not released yet.');return;}playAt(start);
 }
 $('albumPlayAll').onclick=()=>begin();$('albumShuffle').onclick=()=>begin(null,true);
 $('albumPrevious').onclick=()=>playAt(index-1,-1);$('albumNext').onclick=()=>playAt(index+1);
 audio.addEventListener('ended',()=>{if(index>=0&&index<queue.length-1)playAt(index+1);else status('Album finished. Play Album to listen again.');});
 window.FSBAlbum={setTracks(value){tracks=[...value].sort((a,b)=>(a.track_number||0)-(b.track_number||0));render();},playSong(song){begin(song.id);}};render();
})();