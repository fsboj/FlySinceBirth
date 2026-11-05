import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'apikey, authorization, content-type, x-client-info','Access-Control-Allow-Methods':'GET, OPTIONS','Cache-Control':'no-store'};
export function sanitizeCatalog(songs:any[],releases:any[],videos:any[],nowMs:number){
 const byId=new Map(releases.map(r=>[String(r.id),r]));
 const at=(r:any)=>r?.release_at?Date.parse(r.release_at):0;
 const effective=(r:any)=>r.release_id&&r.release_early===true?at(r):Math.max(at(r),at(byId.get(String(r.release_id))));
 const deadlines=[...releases.map(at),...songs.map(effective),...videos.map(effective)].filter(t=>t>nowMs);
 const cleanReleases=releases.map(r=>{const locked=at(r)>nowMs;return {...r,locked,early_tracks_available:songs.filter(s=>String(s.release_id)===String(r.id)&&effective(s)<=nowMs&&!!s.audio_url).length,unlock_at:r.release_at||null,has_video:!!r.video_url,video_url:locked?null:r.video_url};});
 const cleanSongs=songs.map(s=>{const parent=byId.get(String(s.release_id)),deadline=effective(s),locked=deadline>nowMs,hidden=locked&&!!parent?.hide_track_names;return {...s,title:hidden?'Track '+String(s.track_number||s.sort_order||songs.filter(x=>String(x.release_id)===String(s.release_id)).findIndex(x=>x.id===s.id)+1).padStart(2,'0'):s.title,lyrics:locked?null:s.lyrics,audio_url:locked?null:s.audio_url,video_url:locked?null:s.video_url,has_audio:!!s.audio_url,has_video:!!s.video_url,locked,names_hidden:hidden,unlock_at:deadline?new Date(deadline).toISOString():null,release_title:parent?.title||'',release_type:parent?.type||'single'};});
 const cleanVideos=videos.map(v=>{const parent=byId.get(String(v.release_id)),deadline=effective(v),locked=deadline>nowMs;return {...v,title:locked&&parent?.hide_track_names?'Upcoming video':v.title,link:locked?null:v.link,has_video:!!v.link,locked,unlock_at:deadline?new Date(deadline).toISOString():null};});
 return {artist_songs:cleanSongs,artist_releases:cleanReleases,videos:cleanVideos,server_now:new Date(nowMs).toISOString(),next_unlock:deadlines.length?new Date(Math.min(...deadlines)).toISOString():null,timezone:'America/New_York'};
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='GET')return new Response('Use GET',{status:405,headers:cors});
 try{
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  async function all(table:string){const rows:any[]=[];for(let i=0;;i+=1000){const r=await db.from(table).select('*').order('id').range(i,i+999);if(r.error)throw r.error;rows.push(...r.data);if(r.data.length<1000)return rows;}}
  const [songs,releases,videos,clock]=await Promise.all([all('artist_songs'),all('artist_releases'),all('videos'),db.rpc('fsb_release_clock')]);if(clock.error)throw clock.error;
  const result=sanitizeCatalog(songs,releases,videos,Date.parse(clock.data.now));
  async function sign(value:string|null){if(!value)return value;let url;try{url=new URL(value);}catch(_){return value;}const prefix='/storage/v1/object/public/release-media/';if(url.origin!==Deno.env.get('SUPABASE_URL')||!url.pathname.startsWith(prefix))return value;const path=decodeURIComponent(url.pathname.slice(prefix.length));const r=await db.storage.from('release-media').createSignedUrl(path,3600);if(r.error)throw r.error;return r.data.signedUrl;}
  await Promise.all(result.artist_songs.map(async s=>{if(!s.locked){s.audio_url=await sign(s.audio_url);s.video_url=await sign(s.video_url);}}));
  await Promise.all(result.artist_releases.map(async r=>{if(!r.locked)r.video_url=await sign(r.video_url);}));
  await Promise.all(result.videos.map(async v=>{if(!v.locked)v.link=await sign(v.link);}));
  return Response.json(result,{headers:cors});
 }catch(e){console.error('release-catalog',e instanceof Error?e.message:'failed');return Response.json({error:'The release catalog is temporarily unavailable.'},{status:503,headers:cors});}
});

