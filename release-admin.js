/* New audio/video uploads are private until the release server authorizes playback. */
(() => {
 const storage=supabaseClient.storage,original=storage.from.bind(storage);
 storage.from=function(bucket){const client=original(bucket);if(!['artist-music','videos'].includes(bucket))return client;const privateClient=original('release-media'),path=p=>String(p).startsWith(bucket+'/')?p:bucket+'/'+p;return new Proxy(client,{get(target,key){if(key==='upload')return (p,file,options)=>privateClient.upload(path(p),file,options);if(key==='getPublicUrl')return p=>privateClient.getPublicUrl(path(p));const value=target[key];return typeof value==='function'?value.bind(target):value;}});};
 document.addEventListener('click',async e=>{const link=e.target.closest('a[href*="/object/public/release-media/"]');if(!link)return;e.preventDefault();const url=new URL(link.href),path=decodeURIComponent(url.pathname.split('/object/public/release-media/')[1]);const r=await original('release-media').createSignedUrl(path,900);if(r.error){alert('Could not open this private upload.');return;}window.open(r.data.signedUrl,'_blank','noopener');});
})();

