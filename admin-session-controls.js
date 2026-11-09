/* Visible sign-out for both the full owner and limited artist dashboards. */
(() => {
 function init(){
  const header=document.querySelector('.admin-header');if(!header||document.getElementById('fsbAdminLogout'))return;
  const style=document.createElement('style');style.textContent='.admin-header{flex-wrap:wrap;gap:16px}.admin-header #fsbAdminLogout,.admin-header #fsbAdminBackToSite{width:auto;margin:0;padding:12px 18px;white-space:nowrap;font-size:11px;letter-spacing:1.5px} .admin-header-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.admin-header-actions a{display:inline-flex;align-items:center;justify-content:center;text-decoration:none}';document.head.appendChild(style);
  const button=document.createElement('button');button.id='fsbAdminLogout';button.className='button';button.type='button';button.textContent='LOG OUT';
  button.onclick=async()=>{
   if(document.querySelector('dialog[open],#artistMediaEditor')&&!confirm('Log out and close your open editor? Unsaved changes will be lost.'))return;
   button.disabled=true;button.textContent='LOGGING OUT…';
   try{const result=await supabaseClient.auth.signOut({scope:'local'});if(result.error)throw result.error;location.replace('admin.html');}
   catch(error){button.disabled=false;button.textContent='LOG OUT';alert('Could not log out: '+error.message);}
  };
  const actions=document.createElement('div');actions.className='admin-header-actions';const back=document.createElement('a');back.id='fsbAdminBackToSite';back.className='button';back.href='index.html';back.textContent='BACK TO SITE';back.onclick=event=>{if(document.querySelector('dialog[open],#artistMediaEditor')&&!confirm('Return to the website? Unsaved changes in your open editor will be lost.'))event.preventDefault();};actions.append(back,button);header.appendChild(actions);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();