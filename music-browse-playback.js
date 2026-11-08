(() => {
 const $=id=>document.getElementById(id);let visible=[];
 function shuffle(rows){const copy=[...rows];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;}
 function render(){const state=window.FSBPlayer.getState(),queued=state.queue.length>0,rows=queued?state.queue:visible,current=queued?state.queue[state.index]:null,host=$('musicTrackRows');host.replaceChildren();$('shuffleSongs').disabled=!visible.some(s=>s.audio_url&&!s.locked);$('musicTrackNote').textContent=queued?'Current playback order. Click a track to jump to it.':'Tracks in your current library view. Unreleased tracks stay locked.';
  rows.forEach((song,index)=>{const row=document.createElement('li'),active=String(song.id)===String(current?.id);if(active)row.setAttribute('aria-current','true');const b=document.createElement('button');b.type='button';b.disabled=song.locked||!song.audio_url;const n=document.createElement('span');n.textContent=String(index+1).padStart(2,'0');const info=document.createElement('span');info.className='browse-item-info';info.textContent=song.title||'Untitled';const artist=document.createElement('small');artist.textContent=song.artist_name||'FLY SINCE BIRTH';info.append(artist);const label=document.createElement('span');label.className='browse-item-state';label.textContent=song.locked?window.FSBRelease.label(song):active?(window.FSBPlayer.audio.paused?'PAUSED':'PLAYING'):queued&&index<state.index?'PLAYED':queued?'UP NEXT':song.audio_url?'PLAY':'UNAVAILABLE';b.append(n,info,label);b.setAttribute('aria-label',(song.locked?'Unreleased: ':'Play ')+(song.title||'track'));b.onclick=()=>queued?window.FSBPlayer.playAt(index):window.FSBPlayer.play(song,visible);row.append(b);host.append(row);});
  if(!rows.length){const empty=document.createElement('li');empty.className='browse-list-note';empty.textContent='No tracks in this view.';host.append(empty);}
 }
 $('shuffleSongs').onclick=()=>{const queue=shuffle(visible.filter(s=>s.audio_url&&!s.locked));if(queue.length)window.FSBPlayer.play(queue[0],queue);};
 $('toggleMusicTracklist').onclick=()=>{const panel=$('musicTracklist');panel.hidden=!panel.hidden;$('toggleMusicTracklist').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)render();};
 window.addEventListener('fsb:player-change',render);['play','pause','ended'].forEach(event=>window.FSBPlayer.audio.addEventListener(event,render));
 window.FSBMusicBrowse={setSongs(rows){visible=[...rows];render();},shuffle};
})();

