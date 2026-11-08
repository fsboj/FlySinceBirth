import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
const origins=new Set(['https://flysbirth.com','https://www.flysbirth.com','https://fsboj.github.io']);
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':origins.has(origin)?origin:'https://flysbirth.com','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Vary':'Origin'};
 const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return respond({error:'Method not allowed'},405);
 try{
  const authorization=req.headers.get('authorization')||'';if(!authorization.startsWith('Bearer '))return respond({error:'Sign in first.'},401);
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const auth=await db.auth.getUser(authorization.slice(7));if(auth.error||!auth.data.user)return respond({error:'Sign in again.'},401);
  const user=auth.data.user;const owner=await db.from('fsb_store_admins').select('user_id').eq('user_id',user.id).eq('email',user.email).maybeSingle();
  if(owner.error||!owner.data)return respond({error:'Only the FSB owner can manage artist access.'},403);
  const body=await req.json();if(!['invite','revoke','change_email'].includes(body.action)||!/^[-a-f0-9]{36}$/i.test(String(body.access_id)))return respond({error:'Choose an artist and action.'},400);
  const result=await db.from('artist_access').select('*').eq('id',body.access_id).single();if(result.error)throw result.error;const row=result.data;
  if(body.action==='revoke'){const r=await db.from('artist_access').update({enabled:false}).eq('id',row.id);if(r.error)throw r.error;return respond({ok:true});}
  if(body.action==='change_email'){
   const email=String(body.email||'').trim().toLowerCase();if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return respond({error:'Enter a valid email address.'},400);
   if(email===row.email)return respond({ok:true,unchanged:true});
   const saved=await db.from('artist_access').update({email,user_id:null,enabled:false,invited_at:null}).eq('id',row.id).eq('email',row.email).select('id').single();if(saved.error)throw saved.error;
   return respond({ok:true});
  }
  if(!row.user_id){
   for(let page=1;page<=100;page++){
    const accounts=await db.auth.admin.listUsers({page,perPage:1000});if(accounts.error)throw accounts.error;
    const existing=accounts.data.users.find(u=>u.email?.toLowerCase()===row.email);if(existing){row.user_id=existing.id;break;}
    if(accounts.data.users.length<1000)break;if(page===100)throw Error('Contact FSB support to link this account.');
   }
  }
  if(row.invited_at&&Date.now()-Date.parse(row.invited_at)<60000)return respond({error:'Please wait one minute before sending another invitation.'},429);
  let artistId=row.artist_id;
  if(!artistId){
   const existing=await db.from('artists').select('id').ilike('name',row.artist_name).limit(1).maybeSingle();if(existing.error)throw existing.error;artistId=existing.data?.id;
   if(!artistId){const slug=row.artist_name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');const created=await db.from('artists').insert({name:row.artist_name,slug,homepage_featured:false,bio:null}).select('id').single();if(created.error)throw created.error;artistId=created.data.id;}
   const assigned=await db.from('artist_access').update({artist_id:artistId}).eq('id',row.id);if(assigned.error)throw assigned.error;
  }
  // Re-enable a known account by sending recovery, never change anyone's password here.
  if(row.user_id){
   const target=await db.auth.admin.getUserById(row.user_id);if(target.error)throw target.error;
   if(target.data.user.email?.toLowerCase()!==row.email)throw Error('The assigned account email changed. Contact FSB support before inviting again.');
   const mail=await db.auth.resetPasswordForEmail(row.email,{redirectTo:'https://flysbirth.com/reset-password.html'});if(mail.error)throw mail.error;
  }else{
   const invite=await db.auth.admin.inviteUserByEmail(row.email,{redirectTo:'https://flysbirth.com/reset-password.html'});if(invite.error)throw invite.error;
   row.user_id=invite.data.user.id;
  }
  const saved=await db.from('artist_access').update({user_id:row.user_id,artist_id:artistId,enabled:true,invited_at:new Date().toISOString()}).eq('id',row.id).eq('email',row.email).select('id').single();if(saved.error)throw saved.error;
  return respond({ok:true});
 }catch(e){console.error('Artist access action failed:',e.message);return respond({error:e.message||'Could not update artist access.'},400);}
});

