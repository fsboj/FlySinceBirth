(() => {
 const style=document.createElement('style');style.textContent='#nowArtist,#playerArtistName,#albumPlayerCredit{font-size:13px!important;line-height:1.5!important;color:#b8b8b8}#albumPlayerCredit{display:block;font-weight:400;margin-top:4px}';document.head.append(style);
 function text(song,fallback='FLY SINCE BIRTH'){const artist=String(song.artist_name||fallback).trim();const album=song.release_type==='album'?String(song.release_title||'').trim():'';return artist+(album?' · '+album:'');}
 function set(element,song,fallback){if(!element)return;element.textContent=text(song,fallback);element.title=element.textContent;}
 window.FSBPlayerCredits={text,set};
})();
