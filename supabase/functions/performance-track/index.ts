import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
const origins = new Set(['https://flysbirth.com','https://www.flysbirth.com','https://fsboj.github.io']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Access-Control-Allow-Origin':origins.has(origin)?origin:'https://flysbirth.com','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json'}});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST'||!origins.has(origin))return reply({error:'Not allowed'},403);
 try{
  const raw=await req.text();if(raw.length>3000)return reply({error:'Request too large'},413);
  const b=JSON.parse(raw);
  if(!uuid.test(b.visitor_id)||!uuid.test(b.playback_id)||!['music','video'].includes(b.media_type)||!['open','start','engaged','complete'].includes(b.phase)||typeof b.content_key!=='string'||b.content_key.length>99)return reply({error:'Invalid event'},400);
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  let user=null;
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(token){const r=await db.auth.getUser(token);if(r.error||!r.data.user)return reply({error:'Invalid session'},401);user=r.data.user;}
  if(user){const a=await db.from('fsb_store_admins').select('user_id').eq('user_id',user.id).maybeSingle();if(a.error)throw a.error;if(a.data)return reply({ignored:'admin'});}
  const recent=await db.from('fsb_performance_events').select('id',{count:'exact',head:true}).eq('visitor_id',b.visitor_id).gte('created_at',new Date(Date.now()-60000).toISOString());
  if(recent.error)throw recent.error;if((recent.count||0)>=60)return reply({error:'Too many events'},429);
  const parts=b.content_key.split(':');
  const table=parts[0]==='song'?'artist_songs':parts[0]==='video'?'videos':parts[0]==='release'?'artist_releases':null;
  if(!table||parts.length!==2||!(parts[0]==='release'?uuid.test(parts[1]):/^\d+$/.test(parts[1]))||(b.media_type==='music'&&parts[0]!=='song'))return reply({error:'Invalid content'},400);
  const item=await db.from(table).select('*').eq('id',parts[1]).maybeSingle();if(item.error)throw item.error;
  const media=item.data;if(!media||(b.media_type==='music'?!media.audio_url:!(parts[0]==='video'?media.link:media.video_url)))return reply({error:'Content unavailable'},404);
  let name='Anonymous visitor',artist='';
  if(user){const p=await db.from('customer_profiles').select('display_name').eq('user_id',user.id).maybeSingle();if(p.error)throw p.error;name=String(p.data?.display_name||'FSB member').slice(0,160);}
  if(media.artist_id){const a=await db.from('artists').select('name').eq('id',media.artist_id).maybeSingle();artist=a.data?.name||'';}
  if(b.phase==='engaged'||b.phase==='complete'){
   const start=await db.from('fsb_performance_events').select('id').eq('playback_id',b.playback_id).eq('visitor_id',b.visitor_id).eq('content_key',b.content_key).eq('media_type',b.media_type).eq('phase','start').maybeSingle();
   if(start.error)throw start.error;if(!start.data)return reply({error:'Playback has not started'},409);
  }
  const r=await db.from('fsb_performance_events').insert({playback_id:b.playback_id,visitor_id:b.visitor_id,user_id:user?.id||null,listener_name:name,media_type:b.media_type,content_key:b.content_key,title:String(media.title||'Untitled').slice(0,300),artist_name:artist,phase:b.phase,source_path:String(b.source_path||'').split('?')[0].slice(0,120)});
  if(r.error&&r.error.code!=='23505')throw r.error;
  return reply({ok:true});
 }catch(e){console.error('performance-track',e instanceof Error?e.message:'invalid request');return reply({error:'Could not record activity'},400);}
});

