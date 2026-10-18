/* Store aisles and subcategories, shared by the product editor and storefront. */
(function(){
 const table='merch_store_categories';
 let categories=[],products=[],dialog=null;
 const $=id=>document.getElementById(id);
 function client(){if(typeof supabaseClient!=='undefined')return supabaseClient;if(window.supabaseClient)return window.supabaseClient;throw new Error('Supabase client is not ready yet.')}
 function slug(value){return String(value||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')}
 function status(message,bad){const node=$('merchCategoryManagerStatus');if(!node)return;node.textContent=message;node.classList.toggle('is-bad',!!bad)}
 function sorted(items){return [...items].sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.name).localeCompare(String(b.name)))}
 function categoryPath(id){const category=categories.find(item=>String(item.id)===String(id));if(!category)return '';const parent=category.parent_id==null?null:categories.find(item=>String(item.id)===String(category.parent_id));return parent?parent.name+' · '+category.name:category.name}
 window.fsbStoreCategories=categories;
 window.fsbMerchCategoryPath=categoryPath;
 function ensureLegacyOption(value){
  const select=$('merchProductCategory');if(!select||!value)return;
  const legacyValue='legacy:'+value;
  if(![...select.options].some(option=>option.value===legacyValue)){let group=select.querySelector('optgroup[data-legacy]');if(!group){group=document.createElement('optgroup');group.label='Unassigned legacy categories';group.dataset.legacy='1';select.appendChild(group)}group.appendChild(new Option('Unassigned — '+value,legacyValue))}
 }
 function renderProductCategorySelect(selected){
  const select=$('merchProductCategory');if(!select)return;
  const selectedValue=selected==null?select.value:String(selected);
  select.replaceChildren(new Option('Choose a shop aisle or category',''));
  const roots=sorted(categories.filter(item=>item.parent_id==null));
  roots.forEach(root=>{
   const group=document.createElement('optgroup');group.label=root.name+(root.is_active?'':' (hidden from shop)');
   group.appendChild(new Option('All '+root.name+' products'+(root.is_active?'':' · HIDDEN'),String(root.id)));
   sorted(categories.filter(item=>String(item.parent_id)===String(root.id))).forEach(child=>group.appendChild(new Option(child.name+(child.is_active?'':' · HIDDEN'),String(child.id))));
   select.appendChild(group);
  });
  if(selectedValue.startsWith('legacy:'))ensureLegacyOption(selectedValue.slice(7));
  select.value=selectedValue;
 }
 async function loadCategories(){
  try{
   const db=client();
   const [categoryResult,productResult]=await Promise.all([
    db.from(table).select('*').order('sort_order',{ascending:true}).order('name',{ascending:true}),
    db.from('merch_products').select('id,category_id')
   ]);
   if(categoryResult.error)throw categoryResult.error;
   if(productResult.error)throw productResult.error;
   categories=categoryResult.data||[];products=productResult.data||[];
   window.fsbStoreCategories=categories;renderProductCategorySelect();
   if(dialog?.open)renderManager();
   return categories;
  }catch(error){console.error('Store aisle load failed',error);status('Could not load shop aisles: '+(error.message||error),true);return []}
 }
 window.fsbLoadMerchStoreCategories=loadCategories;
 window.fsbSetMerchProductCategory=async function(id,legacy){
  await loadCategories();
  const value=id!=null?String(id):legacy?'legacy:'+legacy:'';
  if(!id&&legacy)ensureLegacyOption(legacy);
  renderProductCategorySelect(value);
 };
 function button(label,handler,kind){const b=document.createElement('button');b.type='button';b.className='button'+(kind?' '+kind:'');b.textContent=label;b.addEventListener('click',handler);return b}
 function createDialog(){
  if(dialog)return dialog;
  const style=document.createElement('style');
  style.textContent='dialog.fsb-aisle-modal{color:#fff;background:#080808;border:1px solid #333;border-radius:12px;padding:0;width:min(920px,calc(100vw - 28px));max-height:92vh;overflow:auto;box-shadow:0 24px 90px #000}dialog.fsb-aisle-modal::backdrop{background:rgba(0,0,0,.82)}.fsb-aisle-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:18px 22px;background:#080808;border-bottom:1px solid #292929}.fsb-aisle-body{padding:22px}.fsb-aisle-create{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end;padding:16px;border:1px solid #303030;margin:15px 0 22px}.fsb-aisle-create label{display:grid;gap:7px;color:#aaa;font-size:10px;letter-spacing:1px}.fsb-aisle-create input,.fsb-aisle-create select,.fsb-aisle-row input[type=text]{padding:11px;background:#111;color:#fff;border:1px solid #444;border-radius:4px}.fsb-aisle-list{display:grid;gap:8px}.fsb-aisle-row{display:grid;grid-template-columns:minmax(140px,1fr) auto auto;gap:9px;align-items:center;padding:12px;border:1px solid #2a2a2a}.fsb-aisle-row.child{margin-left:22px}.fsb-aisle-row-main{display:grid;gap:6px;min-width:0}.fsb-aisle-meta{color:#777;font-size:10px;letter-spacing:1px}.fsb-aisle-toggle{display:flex;align-items:center;gap:7px;color:#aaa;font-size:10px;white-space:nowrap}.fsb-aisle-actions{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}.fsb-aisle-actions .button{padding:8px 10px;font-size:9px}.fsb-aisle-status{min-height:18px;margin:8px 0;color:#aaa;font-size:12px}.fsb-aisle-status.is-bad{color:#e88}.aisle-launch-row{display:flex;justify-content:flex-end;margin:8px 0 18px}@media(max-width:650px){.fsb-aisle-body{padding:14px}.fsb-aisle-head{padding:14px}.fsb-aisle-create{grid-template-columns:1fr}.fsb-aisle-row{grid-template-columns:1fr 1fr}.fsb-aisle-row-main{grid-column:1/-1}.fsb-aisle-row.child{margin-left:12px}.fsb-aisle-actions{grid-column:1/-1;justify-content:flex-start}}';
  document.head.appendChild(style);
  dialog=document.createElement('dialog');dialog.id='merchAisleManagerModal';dialog.className='fsb-aisle-modal';
  dialog.innerHTML='<div class="fsb-aisle-head"><div class="panel-title">SHOP AISLES & CATEGORIES</div><button type="button" class="button" data-close-aisles>CLOSE</button></div><div class="fsb-aisle-body"><div class="item-meta">Create an aisle, then add categories to its dropdown. Turn off an aisle or category to remove it from the shop navigation. Empty categories stay hidden automatically.</div><div class="fsb-aisle-create"><label>NAME<input id="merchNewCategoryName" maxlength="80" placeholder="Example: Long sleeve shirts"></label><label>ADD TO<select id="merchNewCategoryParent"><option value="">New top-level aisle</option></select></label><button type="button" class="button primary" id="createMerchCategory">ADD AISLE</button></div><div id="merchCategoryManagerStatus" class="fsb-aisle-status" role="status" aria-live="polite"></div><div id="merchCategoryManagerList" class="fsb-aisle-list"></div></div>';
  dialog.querySelector('[data-close-aisles]').onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
  dialog.querySelector('#merchNewCategoryParent').addEventListener('change',event=>{dialog.querySelector('#createMerchCategory').textContent=event.target.value?'ADD CATEGORY':'ADD AISLE'});
  dialog.querySelector('#createMerchCategory').onclick=createCategory;
  document.body.appendChild(dialog);return dialog;
 }
 function buildManager(){
  const store=$('store');if(!store)return;
  const header=[...store.querySelectorAll('.panel-header')].find(node=>[...node.querySelectorAll('.panel-title')].some(title=>(title.textContent||'').trim().toUpperCase()==='STORE PRODUCTS'));
  if(!header||$('manageMerchAisles'))return;
  const row=document.createElement('div');row.className='aisle-launch-row';
  const open=button('MANAGE SHOP AISLES',async()=>{createDialog();await loadCategories();renderManager();if(!dialog.open)dialog.showModal()},'primary');open.id='manageMerchAisles';row.appendChild(open);header.insertAdjacentElement('afterend',row);
 }
 async function createCategory(){
  const name=dialog.querySelector('#merchNewCategoryName').value.trim(),parentValue=dialog.querySelector('#merchNewCategoryParent').value,parent=categories.find(item=>String(item.id)===parentValue)||null;
  if(!name){status('Enter a name for the aisle or category.',true);return}
  if(parent&&parent.parent_id!=null){status('Categories can be one level below an aisle. Choose a top-level aisle.',true);return}
  const base=slug((parent?parent.slug+'-':'')+name);if(!base){status('Enter a valid name.',true);return}
  const siblingSort=categories.filter(item=>String(item.parent_id||'')===String((parent&&parent.id)||'' )).map(item=>Number(item.sort_order||0));
  const sortOrder=Math.max(0,...siblingSort)+10;
  const result=await client().from(table).insert({name,slug:base,parent_id:parent?parent.id:null,is_active:true,sort_order:sortOrder});
  if(result.error){status('Could not add aisle or category: '+result.error.message,true);return}
  dialog.querySelector('#merchNewCategoryName').value='';status(parent?'Category added.':'Aisle added.',false);await loadCategories();renderManager();
 }
 async function changeActive(category,active){
  const result=await client().from(table).update({is_active:active,updated_at:new Date().toISOString()}).eq('id',category.id);
  if(result.error){status('Could not change visibility: '+result.error.message,true);return}
  status((active?'Shown':'Hidden')+' '+category.name+'.',false);await loadCategories();renderManager();
 }
 async function renameCategory(category,input){
  const name=input.value.trim();if(!name){status('Category names cannot be blank.',true);return}
  const parent=categories.find(item=>String(item.id)===String(category.parent_id));
  const nextSlug=slug((parent?parent.slug+'-':'')+name);
  const result=await client().from(table).update({name,slug:nextSlug,updated_at:new Date().toISOString()}).eq('id',category.id);
  if(result.error){status('Could not rename category: '+result.error.message,true);return}
  status('Saved '+name+'.',false);await loadCategories();renderManager();
 }
 async function moveCategory(category,direction){
  const siblings=sorted(categories.filter(item=>String(item.parent_id||'')===String(category.parent_id||''))),index=siblings.findIndex(item=>String(item.id)===String(category.id)),other=siblings[index+direction];if(!other)return;
  const updates=await Promise.all([
   client().from(table).update({sort_order:Number(other.sort_order||0),updated_at:new Date().toISOString()}).eq('id',category.id),
   client().from(table).update({sort_order:Number(category.sort_order||0),updated_at:new Date().toISOString()}).eq('id',other.id)
  ]);
  const error=updates.find(result=>result.error)?.error;if(error){status('Could not reorder categories: '+error.message,true);return}
  await loadCategories();renderManager();status('Navigation order updated.',false);
 }
 async function deleteCategory(category){
  const hasChildren=categories.some(item=>String(item.parent_id)===String(category.id)),hasProducts=products.some(item=>String(item.category_id)===String(category.id));
  if(hasChildren||hasProducts){status('Move its subcategories and products before deleting. You can turn it off to hide it.',true);return}
  if(!confirm('Permanently remove "'+category.name+'" from the shop categories?'))return;
  const result=await client().from(table).delete().eq('id',category.id);
  if(result.error){status('Could not delete category: '+result.error.message,true);return}
  status('Category deleted.',false);await loadCategories();renderManager();
 }
 function renderManager(){
  if(!dialog)return;
  const parentSelect=dialog.querySelector('#merchNewCategoryParent'),selected=parentSelect.value;
  parentSelect.replaceChildren(new Option('New top-level aisle',''));
  sorted(categories.filter(item=>item.parent_id==null)).forEach(item=>parentSelect.appendChild(new Option(item.name,String(item.id))));
  parentSelect.value=selected;
  const host=dialog.querySelector('#merchCategoryManagerList');host.replaceChildren();
  const roots=sorted(categories.filter(item=>item.parent_id==null));
  roots.forEach(root=>{
   [root,...sorted(categories.filter(item=>String(item.parent_id)===String(root.id)))].forEach(category=>{
    const row=document.createElement('div');row.className='fsb-aisle-row'+(category.parent_id!=null?' child':'');
    const main=document.createElement('div');main.className='fsb-aisle-row-main';
    const meta=document.createElement('span');meta.className='fsb-aisle-meta';meta.textContent=category.parent_id==null?'TOP-LEVEL AISLE':'IN '+root.name.toUpperCase();
    const name=document.createElement('input');name.type='text';name.maxLength=80;name.value=category.name;name.setAttribute('aria-label','Name for '+category.name);
    main.append(meta,name);
    const label=document.createElement('label');label.className='fsb-aisle-toggle';const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=!!category.is_active;toggle.addEventListener('change',()=>changeActive(category,toggle.checked));label.append(toggle,document.createTextNode('SHOW IN SHOP'));
    const actions=document.createElement('div');actions.className='fsb-aisle-actions';
    actions.appendChild(button('SAVE NAME',()=>renameCategory(category,name)));
    const sibling=sorted(categories.filter(item=>String(item.parent_id||'')===String(category.parent_id||''))),position=sibling.findIndex(item=>String(item.id)===String(category.id));
    const up=button('↑',()=>moveCategory(category,-1));up.setAttribute('aria-label','Move '+category.name+' up');up.disabled=position<=0;actions.appendChild(up);
    const down=button('↓',()=>moveCategory(category,1));down.setAttribute('aria-label','Move '+category.name+' down');down.disabled=position>=sibling.length-1;actions.appendChild(down);
    if(category.parent_id==null)actions.appendChild(button('+ CATEGORY',()=>{parentSelect.value=String(category.id);parentSelect.dispatchEvent(new Event('change'));dialog.querySelector('#merchNewCategoryName').focus()}));
    actions.appendChild(button('DELETE',()=>deleteCategory(category),'danger'));
    row.append(main,label,actions);host.appendChild(row);
   });
  });
  if(!categories.length){const empty=document.createElement('div');empty.className='item-meta';empty.textContent='No aisles found. Add the first top-level aisle above.';host.appendChild(empty)}
 }
 function init(){
  const select=$('merchProductCategory');if(!select)return;
  buildManager();renderProductCategorySelect();
  document.querySelectorAll('.admin-nav button').forEach(button=>button.addEventListener('click',()=>{setTimeout(loadCategories,0)}));
  loadCategories();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else setTimeout(init,0);
})();
