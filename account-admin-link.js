/* Dashboard entry is shown only after checking the signed-in account's grants. */
(() => {
 const db=supabaseClient,link=document.getElementById('accountAdminLink');if(!link)return;let version=0;
 async function refresh(){const request=++version;link.hidden=true;try{
  const result=await db.auth.getUser();if(request!==version)return;const user=result.data?.user;if(result.error||!user)return;
  const email=String(user.email||'').toLowerCase();if(!email)return;
  const [owner,artist]=await Promise.all([
   db.from('fsb_store_admins').select('user_id').eq('user_id',user.id).eq('email',email).maybeSingle(),
   db.from('artist_access').select('artist_id,enabled').eq('user_id',user.id).eq('email',email).eq('enabled',true).maybeSingle()
  ]);
  if(request!==version)return;
  link.hidden=!((!owner.error&&!!owner.data)||(!artist.error&&!!artist.data?.artist_id&&!!user.email_confirmed_at));
 }catch(_){if(request===version)link.hidden=true;}}
 db.auth.onAuthStateChange(event=>{version++;link.hidden=true;if(event!=='SIGNED_OUT')setTimeout(refresh,0);});
 window.addEventListener('focus',refresh);refresh();
})();

