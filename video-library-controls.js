(() => {
 const grid=document.getElementById('videoGrid');if(!grid)return;
 const style=document.createElement('style');style.textContent='.video-library-controls{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 28px}.video-library-controls input,.video-library-controls select{background:#111;color:#fff;border:1px solid #393939;padding:12px;font:14px Arial;min-width:170px;max-width:100%}.video-library-controls input{flex:1}.video-card[hidden]{display:none!important}';document.head.appendChild(style);
 const controls=document.createElement('div');controls.className='video-library-controls';
 const search=document.createElement('input');search.type='search';search.placeholder='Search videos or artists';search.setAttribute('aria-label','Search videos or artists');
 const artist=document.createElement('select');artist.setAttribute('aria-label','Filter videos by artist');
 const kind=document.createElement('select');kind.setAttribute('aria-label','Filter video type');
 for(const [value,label]of [['','All video types'],['video','Standalone videos'],['song','Song videos'],['release','Album / EP videos']])kind.add(new Option(label,value));
 controls.append(search,artist,kind);grid.before(controls);
 const empty=document.createElement('p');empty.className='status';empty.textContent='No videos match your search.';empty.hidden=true;grid.after(empty);
 function filter(){let visible=0;for(const card of grid.querySelectorAll('.video-card')){card.hidden=!!((artist.value&&card.dataset.videoArtist!==artist.value)||(kind.value&&card.dataset.videoKind!==kind.value)||!card.textContent.toLowerCase().includes(search.value.trim().toLowerCase()));if(!card.hidden)visible++;}empty.hidden=visible>0||!grid.querySelector('.video-card');window.FSBVideoBrowse?.setVisible([...grid.querySelectorAll('.video-card')].filter(card=>!card.hidden).map(card=>card.dataset.fsbVideoFavoriteType+':'+card.dataset.fsbVideoFavoriteId));}
 function refresh(){const keep=artist.value;artist.replaceChildren(new Option('All artists',''));const names=new Map();for(const card of grid.querySelectorAll('.video-card')){const id=card.dataset.videoArtist;if(id)names.set(id,card.querySelector('.video-artist a')?.textContent||'Artist');}for(const [id,name]of [...names].sort((a,b)=>a[1].localeCompare(b[1])))artist.add(new Option(name,id));artist.value=keep;filter();}
 search.addEventListener('input',filter);artist.addEventListener('change',filter);kind.addEventListener('change',filter);
 window.FSBVideoLibrary={refresh};refresh();
})();
