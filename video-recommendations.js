/* Public, server-gated catalog only; never recommend locked video URLs. */
(() => {
 function select(catalog,current,limit=9){
  const normalize=value=>window.FSBVideoSource.key(value);
  const seen=new Set(current.url?[normalize(current.url)]:[]);
  const candidates=[
   ...(catalog.videos||[]).map(media=>({media,itemType:'video',imageUrl:media.image,playUrl:media.link})),
   ...(catalog.artist_songs||[]).map(raw=>{const media=window.FSBRelease.videoItem(raw);return {media,itemType:'song',imageUrl:media.image_url,playUrl:media.video_url};}),
   ...(catalog.artist_releases||[]).map(raw=>{const media=window.FSBRelease.videoItem(raw);return {media,itemType:'release',imageUrl:media.artwork_url,playUrl:media.video_url};})
  ].filter(item=>!item.media.locked&&!!item.playUrl&&!(item.itemType===current.type&&String(item.media.id)===String(current.id)))
   .map(item=>({...item,...item.media,score:
    (current.artist_id!=null&&String(item.media.artist_id)===String(current.artist_id)?2:0)+
    (current.release_id!=null&&String(item.media.release_id||(item.itemType==='release'?item.media.id:''))===String(current.release_id)?1:0),random:Math.random()}))
   .sort((a,b)=>b.score-a.score||a.random-b.random);
  return candidates.filter(item=>{const url=normalize(item.playUrl);if(!url||seen.has(url))return false;seen.add(url);return true;}).slice(0,limit);
 }
 window.FSBVideoRecommendations={select};
})();
