/* Same sign-in, server-enforced artist ownership; owner controls stay separate. */
(() => {
 const db=supabaseClient;let mode=null,artist=null,initialized=false;
 const byId=id=>document.getElementById(id);
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn)=>{const b=node('button',text,'button');b.type='button';b.onclick=fn;return b;};
 const ready=()=>new Promise(resolve=>{const finish=()=>setTimeout(resolve,0);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',finish,{once:true});else finish();});
 const from=db.from.bind(db);
 db.from=function(table){const q=from(table);if(mode!=='artist'||!['artist_songs','artist_releases','videos','artist_links'].includes(table))return q;return new Proxy(q,{get(target,key){if(key==='select')return(...args)=>target.select(...args).eq('artist_id',artist.artist_id);const v=target[key];return typeof v==='function'?v.bind(target):v;}});};
 async function enter(session){
  const owner=await from('fsb_store_admins').select('user_id').eq('user_id',session.user.id).maybeSingle();if(owner.error)throw owner.error;
  if(owner.data){mode='owner';await ready();mountOwner();return true;}
  const r=await from('artist_access').select('*,artists(name)').eq('user_id',session.user.id).eq('enabled',true).maybeSingle();if(r.error)throw r.error;
  if(!r.data?.artist_id||!session.user.email_confirmed_at||r.data.email!==String(session.user.email||'').toLowerCase())return false;
  mode='artist';artist={...r.data,artist_name:r.data.artists?.name||r.data.artist_name};document.body.classList.add('fsb-artist-account');await ready();await scopeArtist();return true;
 }
 function lockSelectors(){if(mode!=='artist')return;for(const id of ['artistPageSelect','artistReleaseArtist','videoArtistSelect','videoManageArtistSelect']){const s=byId(id);if(!s)continue;if(s.options.length!==1||s.options[0].value!==String(artist.artist_id)){s.replaceChildren(new Option(artist.artist_name,String(artist.artist_id)));}s.value=String(artist.artist_id);s.disabled=true;}}
 async function scopeArtist(){
  const style=node('style',`body.fsb-artist-account .admin-nav button:not([data-artist-allowed]),body.fsb-artist-account section.panel:not(#artistPages):not(#videos),body.fsb-artist-account #artistCreateModal,body.fsb-artist-account .save-bar{display:none!important}`);document.head.appendChild(style);
  const heading=document.querySelector('.admin-title');if(heading)heading.textContent='FSB ARTIST ADMIN';const subtitle=document.querySelector('.admin-status');if(subtitle)subtitle.textContent='YOUR PROFILE · MUSIC · VIDEOS';
  const nav=document.querySelector('.admin-nav');const pageButton=[...nav.querySelectorAll('button')].find(b=>b.textContent.trim()==='ARTIST PAGES'),videoButton=[...nav.querySelectorAll('button')].find(b=>b.textContent.trim()==='VIDEOS');
  const open=async(id,b)=>{document.querySelectorAll('section.panel').forEach(p=>{p.classList.remove('active');p.style.setProperty('display','none','important');});const p=byId(id);p.classList.add('active');p.style.setProperty('display','block','important');nav.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));lockSelectors();if(id==='videos')await window.loadVideos();};
  pageButton.dataset.artistAllowed='1';pageButton.textContent='MY ARTIST PAGE';pageButton.onclick=()=>open('artistPages',pageButton);videoButton.dataset.artistAllowed='1';videoButton.textContent='MY VIDEOS';videoButton.onclick=()=>open('videos',videoButton);
  const wrapSelector=name=>{const old=window[name];if(typeof old!=='function')return;window[name]=async function(){await old.apply(this,arguments);lockSelectors();};};['loadArtistPageSelector','loadVideoArtistSelector','loadArtistsForUpcoming'].forEach(wrapSelector);
  const originalSelected=window.setSelectedArtistPageId;window.setSelectedArtistPageId=function(){return originalSelected(String(artist.artist_id));};
  window.showPanel=(id,b)=>{if(id==='artistPages'||id==='videos')return open(id,b||pageButton);};
  const strip=node('div',null,'artist-account-strip');strip.style.cssText='display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:16px 0;color:#bbb;font:14px Arial';strip.append(node('span',artist.artist_name+' · '+artist.email));nav.before(strip);
  const panel=byId('artistPages');panel.querySelector('.panel-description').textContent='Manage your profile, links, releases and media. Changes you save update your artist content. Only the FSB owner can delete an artist page.';
  panel.querySelectorAll('button').forEach(b=>{if((b.getAttribute('onclick')||'').includes('openArtistCreateModal')||(b.textContent||'').trim()==='+ ADD ARTIST'||/(?:deleteArtist|removeArtist)\s*\(/i.test(b.getAttribute('onclick')||'')||/^(DELETE|REMOVE) ARTIST(?: PAGE)?$/i.test((b.textContent||'').trim())){b.hidden=true;b.disabled=true;}});
  await window.loadArtistPageSelector();await window.loadVideoArtistSelector();lockSelectors();window.setSelectedArtistPageId(artist.artist_id);await window.loadSelectedArtistPage(String(artist.artist_id));if(window.renderArtistMusic)await window.renderArtistMusic(String(artist.artist_id));await window.loadVideos();await open('artistPages',pageButton);

  let accessCheckBusy=false,accessDenied=false;
  async function checkArtistAccess(){
   if(accessCheckBusy||accessDenied||document.hidden)return;accessCheckBusy=true;
   try{
    const {data:{user},error}=await db.auth.getUser();if(error)return;
    const grant=user?await from('artist_access').select('artist_id,email,enabled').eq('user_id',user.id).eq('artist_id',artist.artist_id).eq('enabled',true).maybeSingle():{data:null,error:null};
    if(grant.error)return;
    if(!user?.email_confirmed_at||!grant.data||grant.data.email!==String(user.email||'').toLowerCase()){
     accessDenied=true;mode='denied';clearInterval(accessTimer);
     document.querySelectorAll('body > *').forEach(el=>{if(el.tagName!=='SCRIPT'&&el.tagName!=='STYLE')el.inert=true;});
     const notice=node('section');notice.id='fsbArtistAccessRevoked';notice.setAttribute('role','alert');notice.style.cssText='position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:28px;background:#080808;color:#fff;text-align:center;font:16px/1.6 Arial';
     notice.append(node('h1','ARTIST ACCESS REMOVED'),node('p','This account no longer has permission to manage this artist page.'));
     const back=node('a','BACK TO SITE','button');back.href='index.html';notice.append(back);document.body.append(notice);
    }
   }finally{accessCheckBusy=false;}
  }
  const accessTimer=setInterval(checkArtistAccess,15000);window.addEventListener('focus',checkArtistAccess);document.addEventListener('visibilitychange',checkArtistAccess);

  // Existing upload dialogs may repopulate or temporarily unlock artist selectors.
  new MutationObserver(lockSelectors).observe(document.body,{childList:true,subtree:true});
 }
 function mountOwner(){
  if(initialized)return;initialized=true;const nav=document.querySelector('.admin-nav'),panel=node('section',null,'panel');panel.id='artistAccess';const header=node('div',null,'panel-header');header.append(node('div','ARTIST ACCESS','panel-title'),node('div','Every artist in Artist Pages appears here automatically. Choose Change Email, then Invite Artist to activate their login. Each artist manages only their own content. Deleting an artist page removes its editing access.','panel-description'));panel.append(header);const status=node('p');status.setAttribute('role','status');const list=node('div',null,'item-list');panel.append(status,list);nav.parentElement.appendChild(panel);
  const tab=button('ARTIST ACCESS',async()=>{document.querySelectorAll('section.panel').forEach(p=>{p.classList.remove('active');p.style.setProperty('display','none','important');});nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===tab));panel.classList.add('active');panel.style.setProperty('display','block','important');await refresh();});nav.appendChild(tab);
  async function action(row,kind){
   const body={action:kind,access_id:row.id};
   if(kind==='change_email'){
    const value=prompt('Website login email for '+row.artist_name+':',row.email||'');if(value===null)return;body.email=value.trim().toLowerCase();
    if(body.email===row.email)return;
    if(body.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)){alert('Enter a valid email address.');return;}
    if(!confirm('Assign '+row.artist_name+' to '+body.email+'? The previous account will lose artist editing access. Send an invitation afterward to activate the new address. Their content stays in place.'))return;
   }
   if(kind==='invite'&&!row.email){status.textContent='Click Change Email to add a login email first.';return;}
   if(kind==='invite'&&!confirm('Send the artist sign-in invitation to '+row.email+' and enable access to '+row.artist_name+' only?'))return;
   if(kind==='revoke'&&!confirm('Disable website artist access for '+row.artist_name+'? Their public content and email inbox will remain.'))return;
   list.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='Working…';
   try{
    const r=await db.functions.invoke('artist-access-admin',{body});
    if(r.error){let message=r.error.message;try{const detail=await r.error.context?.json();if(detail?.error)message=detail.error;}catch(_){}throw Error(message);}
    if(r.data?.error)throw Error(r.data.error);
    status.textContent=kind==='change_email'?'Email updated. Click Invite Artist to activate the new login.':kind==='invite'?'Invitation sent. Existing customers can also sign in with their current FSB password.':'Artist access disabled.';
    await refresh(false);
   }catch(e){status.textContent='Could not update access: '+e.message;list.querySelectorAll('button').forEach(b=>b.disabled=false);}
  }
  async function refresh(clear=true){if(clear)status.textContent='Loading…';const r=await from('artist_access').select('*,artists(name)').not('artist_id','is',null).order('artist_name');if(r.error){status.textContent=r.error.message;return;}list.replaceChildren();for(const raw of r.data.sort((a,b)=>(a.artists?.name||a.artist_name).localeCompare(b.artists?.name||b.artist_name))){const row={...raw,artist_name:raw.artists?.name||raw.artist_name};const item=node('div',null,'admin-item');item.style.cssText='display:flex;justify-content:space-between;gap:20px;align-items:center;flex-wrap:wrap';const info=node('div');info.append(node('div',row.artist_name,'item-name'),node('div',row.email||'NO EMAIL SET · Use Change Email','item-meta'),node('div',row.enabled?'INVITED / ACCESS ENABLED':'NOT ACTIVE','item-meta'));const actions=node('div',null,'actions');actions.append(button('CHANGE EMAIL',()=>action(row,'change_email')));const invite=button(row.invited_at?'RESEND INVITATION':'INVITE ARTIST',()=>action(row,'invite'));invite.disabled=!row.email;invite.title=row.email?'Send an artist invitation':'Add an email with Change Email first';actions.append(invite);if(row.enabled)actions.append(button('DISABLE ACCESS',()=>action(row,'revoke')));item.append(info,actions);list.append(item);}if(clear)status.textContent='Add artists in Artist Pages, then set their email and send an invitation here. Only you can activate access or delete artist pages.';}
  window.addEventListener('focus',()=>{if(panel.classList.contains('active'))refresh();});
 }
 window.FSBArtistAccess={enter,isArtist:()=>mode==='artist'};
})();

