/* Explicitly supported embeds; never load arbitrary pages in the player. */
(() => {
 function parse(value){
  let u;try{u=new URL(value);}catch(_){return null;}
  if(u.protocol!=='https:'||u.username||u.password)return null;
  const host=u.hostname.toLowerCase().replace(/^www\./,'');
  if(/\.(mp4|webm|ogg|mov)$/i.test(u.pathname))return {type:'file',url:u.href};
  let id;
  if(host==='youtu.be')id=u.pathname.split('/')[1];
  else if(['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host))id=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
  if(id&&/^[\w-]{11}$/.test(id))return {type:'youtube',url:'https://www.youtube-nocookie.com/embed/'+id};
  if(host==='vimeo.com'||host==='player.vimeo.com'){
   const m=u.pathname.match(/^\/(?:video\/)?(\d+)(?:\/([a-zA-Z0-9]+))?\/?$/);
   if(m){const hash=u.searchParams.get('h')||m[2];return {type:'vimeo',url:'https://player.vimeo.com/video/'+m[1]+(hash?'?h='+encodeURIComponent(hash):'')};}
  }
  return null;
 }
 function key(value){const source=parse(value);if(source&&source.type!=='file')return source.url;try{const u=new URL(value);return u.origin+u.pathname;}catch(_){return String(value||'');}}
 window.FSBVideoSource={parse,key};
})();
