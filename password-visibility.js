/* Shared accessible show/hide controls for password fields. */
(() => {
 const style=document.createElement('style');style.textContent='.fsb-password-field{position:relative;display:block;width:100%}.fsb-password-field>input{padding-right:56px!important}.fsb-password-field>.fsb-password-eye{position:absolute!important;right:3px!important;top:50%!important;transform:translateY(-50%);display:grid!important;place-items:center!important;width:44px!important;height:40px!important;padding:9px!important;margin:0!important;border:0!important;background:transparent!important;color:#bbb!important;cursor:pointer;letter-spacing:0!important}.fsb-password-eye:hover{color:#fff!important}.fsb-password-eye:focus-visible{outline:2px solid #fff;outline-offset:-4px;border-radius:5px}.fsb-password-eye svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.fsb-password-eye .eye-slash{display:none}.fsb-password-eye[aria-pressed="true"] .eye-slash{display:block}';document.head.appendChild(style);
 function mount(){document.querySelectorAll('input[type="password"]').forEach(input=>{
  if(input.dataset.fsbEye||input.parentElement.querySelector('.password-toggle,.gate-password-toggle'))return;input.dataset.fsbEye='1';
  const wrap=document.createElement('span');wrap.className='fsb-password-field';input.before(wrap);wrap.appendChild(input);
  const toggle=document.createElement('button');toggle.type='button';toggle.className='fsb-password-eye';toggle.setAttribute('aria-label','Show password');toggle.setAttribute('aria-pressed','false');if(input.id)toggle.setAttribute('aria-controls',input.id);
  toggle.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="eye-slash" d="M3 3l18 18"/></svg>';
  const hide=()=>{input.type='password';toggle.setAttribute('aria-label','Show password');toggle.setAttribute('aria-pressed','false');};
  toggle.addEventListener('click',()=>{const show=input.type==='password';input.type=show?'text':'password';toggle.setAttribute('aria-label',show?'Hide password':'Show password');toggle.setAttribute('aria-pressed',String(show));});
  input.form?.addEventListener('reset',hide);wrap.appendChild(toggle);
 });}
 function init(){mount();new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();