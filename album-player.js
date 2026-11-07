(() => {
 const $=id=>document.getElementById(id);let tracks=[];
 const playable=s=>!!s.audio_url&&!s.locked;
 function render(){const state=window.FSBPlayer.getState();$('albumPlayAll').disabled=!tracks.some(playable);$('albumShuffle').disabled=!tracks.some(playable);const host=$('albumQueue');host.replaceChildren();$('albumQueuePanel').hidden=!state.queue.length;
  state.queue.forEach((song,i)=>{const b=document.createElement('button');b.type='button';b.className='album-queue-song';b.setAttribute('aria-label','Play '+song.title);if(i===state.index)b.setAttribute('aria-current','true');const n=document.createElement('span');n.textContent=String(i+1).padStart(2,'0');const title=document.createElement('span');title.textContent=song.title||'Untitled';const label=document.createElement('small');label.textContent=i===state.index?'CURRENT':i<state.index?'PLAYED':'UP NEXT';b.append(n,title,label);b.onclick=()=>window.FSBPlayer.playAt(i);host.append(b);});
  document.querySelectorAll('#trackList [data-album-song]').forEach(row=>row.classList.toggle('album-track-current',String(state.queue[state.index]?.id)===row.dataset.albumSong));
 }
 function begin(songId,shuffle=false){const queue=tracks.filter(playable).map(s=>({...s}));if(shuffle)for(let i=queue.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[queue[i],queue[j]]=[queue[j],queue[i]];}const song=songId==null?queue[0]:queue.find(s=>String(s.id)===String(songId));if(song)return window.FSBPlayer.play(song,queue);$('albumPlayerStatus').textContent='No tracks are released yet.';}
 $('albumPlayAll').onclick=()=>begin();$('albumShuffle').onclick=()=>begin(null,true);window.addEventListener('fsb:player-change',render);
 window.FSBAlbum={setTracks(value){tracks=[...value].sort((a,b)=>(a.track_number||0)-(b.track_number||0));render();},playSong(song){begin(song.id);}};render();
})();
