'use strict';
let data=null,selectedPage='live',selectedState='all',loadedShift=null,updating=false;
let feedbackLoaded=false,stockItems=[],stockLoading=false;
// Always use in-page confirmation for staff actions; native browser prompts can be blocked.
let staffDialogResolve=null, staffDialogPreviousFocus=null;
function staffDialogFinish(approved){
 if(!staffDialogResolve)return;
 const resolve=staffDialogResolve;
 staffDialogResolve=null;
 $('staffConfirmModal').classList.remove('show');
 if(staffDialogPreviousFocus&&staffDialogPreviousFocus.isConnected)staffDialogPreviousFocus.focus();
 resolve(approved);
}
function staffAsk({title,message,details='',confirmText='نعم، تأكيد',danger=false}){
 if(staffDialogResolve)return Promise.resolve(false);
 staffDialogPreviousFocus=document.activeElement;
 $('staffConfirmTitle').textContent=title;
 $('staffConfirmMessage').textContent=message;
 $('staffConfirmInfo').textContent=details;
 $('staffConfirmInfo').hidden=!details;
 $('staffConfirmYes').textContent=confirmText;
 $('staffConfirmYes').classList.toggle('red',danger);
 $('staffConfirmModal').classList.add('show');
 $('staffConfirmNo').focus();
 return new Promise(resolve=>{staffDialogResolve=resolve});
}
$('staffConfirmNo').onclick=()=>staffDialogFinish(false);
$('staffConfirmYes').onclick=()=>staffDialogFinish(true);
$('staffConfirmModal').onclick=e=>{if(e.target===$('staffConfirmModal'))staffDialogFinish(false)};
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&staffDialogResolve){e.preventDefault();staffDialogFinish(false)}
});
function loginVisible(yes){$('loginScreen').classList.toggle('hidden',!yes);$('dashboard').classList.toggle('hidden',yes);$('logout').classList.toggle('hidden',yes);$('exportOrders').classList.toggle('hidden',yes)}
$('exportOrders').onclick=()=>{window.location.href='/api/staff/export.csv'};
let currentChallenge=null;
$('showPassword').onclick=()=>{
 const button=$('showPassword'),password=$('password'),show=password.type==='password';
 password.type=show?'text':'password';
 button.textContent=show?'إخفاء':'إظهار';
 button.setAttribute('aria-label',show?'إخفاء كلمة المرور':'إظهار كلمة المرور');
 button.setAttribute('aria-pressed',String(show));
};

async function refreshOrderStatus(){
 try{
  const status=await api('/api/shift');
  $('staffPaused').classList.toggle('hidden',Boolean(status.orders_enabled));
 }catch{$('staffPaused').classList.add('hidden')}
}

function otpStep(challenge){currentChallenge=challenge;$('loginForm').classList.add('hidden');$('verifyForm').classList.remove('hidden');$('otpCode').focus()}
function resetLoginStep(){currentChallenge=null;$('loginForm').classList.remove('hidden');$('verifyForm').classList.add('hidden');$('otpCode').value='';$('password').value=''}
$('backToLogin').onclick=()=>{resetLoginStep();$('loginError').textContent=''};
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginError').textContent='';$('loginBtn').disabled=true;try{
 const out=await api('/api/staff/login','POST',{username:$('username').value.trim(),password:$('password').value,remember:$('rememberLogin').checked});
 if(out.requires_verification){otpStep(out.challenge_id);$('loginError').textContent=out.message||'أدخل رمز التحقق المرسل إلى هاتف المالك';return}
 resetLoginStep();loginVisible(false);await refresh()
 }catch(e){$('loginError').textContent=e.message}finally{$('loginBtn').disabled=false}};
$('verifyForm').onsubmit=async e=>{e.preventDefault();if(!currentChallenge)return;$('loginError').textContent='';$('verifyBtn').disabled=true;try{
 await api('/api/staff/verify','POST',{challenge_id:currentChallenge,code:$('otpCode').value.trim()});
 resetLoginStep();loginVisible(false);await refresh()
 }catch(e){$('loginError').textContent=e.message}finally{$('verifyBtn').disabled=false}};

$('logout').onclick=async()=>{await api('/api/staff/logout','POST',{}).catch(()=>{});data=null;loginVisible(true)};
async function boot(){await refreshOrderStatus();try{const r=await api('/api/staff/session');loginVisible(!r.authenticated);if(r.authenticated)await refresh()}catch{loginVisible(true)}}
async function refresh(){if(updating||!$('loginScreen').classList.contains('hidden'))return;updating=true;try{let latest=await api('/api/staff/overview');if(data){const before=new Set((data.orders||[]).map(x=>x.id));const added=(latest.orders||[]).filter(x=>!before.has(x.id));$('refreshLabel').textContent=added.length?`وصل ${added.length} طلب جديد`:'تحديث تلقائي كل 5 ثوانٍ'}data=latest;render()}catch(e){if(e.message.includes('دخول'))loginVisible(true);else $('refreshLabel').textContent=e.message}finally{updating=false}}
function render(){if(!data)return;const s=data.shift;
 $('shiftStatus').textContent=s?'يوم العمل مفتوح':'اليوم مغلق — ابدأ يوماً جديداً';$('shiftStatus').classList.toggle('on',!!s);
 $('startBtn').classList.toggle('hidden',!!s);$('endBtn').classList.toggle('hidden',!s);
 $('stats').innerHTML=summaryCards(data);const visible=data.orders.filter(o=>selectedState==='all'||o.status===selectedState).sort((a,b)=>({new:0,ready:1,delivered:2,cancelled:3}[a.status]-{new:0,ready:1,delivered:2,cancelled:3}[b.status])||b.id-a.id);
 $('orders').innerHTML=visible.length?visible.map(o=>bill(o,true)).join(''):'<div class="empty">لا توجد طلبات في هذه الوردية بعد.</div>';
 document.querySelectorAll('[data-order]').forEach(b=>b.onclick=()=>advance(Number(b.dataset.order),b.dataset.status));
 bindStaffInvoiceControls();
 $('top').innerHTML=topProducts(data);$('detail').innerHTML=`<div class="kpirow"><span>طلبات جاهزة</span><b>${data.counts.ready}</b></div><div class="kpirow"><span>طلبات مُسلّمة</span><b>${data.counts.delivered}</b></div><div class="kpirow"><span>صافي مبيعات الوردية</span><b>${fmt(data.sales_fils)}</b></div>`;
 $('archive').innerHTML='';
 document.querySelectorAll('[data-viewshift]').forEach(b=>b.onclick=()=>openShift(Number(b.dataset.viewshift)));

}
async function bindStaffInvoiceControls(){
 document.querySelectorAll('[data-qty-change]').forEach(b=>b.onclick=async()=>{
  const id=Number(b.dataset.qtyChange),item=Number(b.dataset.item),next=Number(b.dataset.qty)+Number(b.dataset.delta);
  if(next<1){uiAlert('لحذف المنتج بالكامل استخدم زر حذف المنتج');return}
  b.disabled=true;
  try{await api('/api/staff/orders/'+id+'/items/'+item+'/quantity','POST',{qty:next});await refresh()}
  catch(e){uiAlert(e.message)}finally{b.disabled=false}
 });
 document.querySelectorAll('[data-remove-item]').forEach(b=>b.onclick=async()=>{
  const id=Number(b.dataset.removeItem),item=Number(b.dataset.item);
  if(!await staffAsk({title:'حذف منتج من الفاتورة',message:'هل تريد حذف هذا المنتج من الفاتورة؟',details:'الإجمالي يتحدث تلقائياً، والفواتير السابقة ما تتأثر.',confirmText:'نعم، احذف المنتج',danger:true}))return;
  b.disabled=true;
  try{await api('/api/staff/orders/'+id+'/items/'+item+'/remove','POST',{});await refresh()}
  catch(e){uiAlert(e.message)}finally{b.disabled=false}
 });
 document.querySelectorAll('[data-add-item]').forEach(b=>b.onclick=()=>openInvoiceProductPicker(Number(b.dataset.addItem)));
 document.querySelectorAll('[data-delete-staff-order]').forEach(b=>b.onclick=async()=>{
  const id=Number(b.dataset.deleteStaffOrder);
  if(!await staffAsk({title:'إلغاء الفاتورة #'+id,message:'هل تريد إلغاء هذه الفاتورة؟',details:'تختفي من الطلبات النشطة والمبيعات. يقدر المدير يسترجعها من سجلاته.',confirmText:'نعم، إلغاء الفاتورة',danger:true}))return;
  b.disabled=true;
  try{await api('/api/staff/orders/'+id+'/delete','POST',{confirmation:'DELETE '+id});await refresh()}
  catch(e){uiAlert(e.message)}finally{b.disabled=false}
 });
}

let invoiceItemOrderId=null,invoiceProductChoices=[],invoiceSelectedProduct=null,invoiceAddBusy=false;
function normalizeInvoiceProductSearch(value){
 return String(value||'').trim().toLocaleLowerCase()
  .replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي')
  .replace(/[ً-ْـ]/g,'').replace(/[_-]/g,' ');
}
function closeInvoiceProductPicker(){
 if(invoiceAddBusy)return;
 $('addItemModal').classList.remove('show');
 invoiceItemOrderId=null;
 invoiceSelectedProduct=null;
 invoiceProductChoices=[];
}
function chosenInvoiceAddons(){
 return Array.from(document.querySelectorAll('#invoiceAddonOptions [data-invoice-addon]')).map(input=>({
  id:Number(input.dataset.invoiceAddon),
  qty:input.type==='checkbox'||input.type==='radio'?(input.checked?1:0):Number(input.value)
 })).filter(x=>x.qty>0);
}
function renderInvoiceAddonOptions(){
 const allExtras=invoiceSelectedProduct?.addons||[];
 const isAcai=invoiceSelectedProduct?.id==='acai_smoothie';
 const peanut=isAcai?allExtras.filter(a=>a.name==='إكسترا زبدة الفول السوداني'):allExtras;
 const banana=isAcai?allExtras.find(a=>a.name==='موز'):null;
 const area=$('invoiceAddonOptions');
 area.hidden=!peanut.length&&!banana;
 const normalChoices=peanut.map(a=>
  '<label class="invoice-addon-choice"><span>'+safe(a.name)+' <small class="'+(isAcai?'acai-price-positive':'')+'">+'+fmt(a.price_fils)+'</small></span>'
  +(a.max_qty===1?'<input type="checkbox" data-invoice-addon="'+a.id+'">':'<input type="number" data-invoice-addon="'+a.id+'" min="0" max="'+a.max_qty+'" value="0" step="1">')
  +'</label>'
 ).join('');
 const bananaChoices=banana?'<fieldset class="invoice-banana-options"><legend>تبى موز مع الأساي؟</legend><div class="invoice-banana-choices">'
  +'<label><input type="radio" name="invoiceBanana" value="no" checked><span>بدون موز</span></label>'
  +'<label><input type="radio" name="invoiceBanana" value="1" data-invoice-addon="'+banana.id+'"><span>مع موز</span><small class="acai-price-positive">+'+fmt(banana.price_fils)+'</small></label>'
  +'</div></fieldset>':'';
 area.innerHTML=(peanut.length?'<strong>إضافات المنتج</strong>'+normalChoices:'')+bananaChoices;
 area.querySelectorAll('input').forEach(input=>{
  input.addEventListener('change',updateInvoiceProductSubtotal);
  input.addEventListener('input',updateInvoiceProductSubtotal);
 });
}
function updateInvoiceProductSubtotal(){
 const selected=invoiceSelectedProduct;
 const qty=Number($('addItemQuantity').value);
 const chosen=chosenInvoiceAddons();
 const validAddons=chosen.every(x=>{
  const addon=(selected?.addons||[]).find(a=>a.id===x.id);
  return addon&&Number.isInteger(x.qty)&&x.qty<=addon.max_qty;
 });
 const valid=selected&&Number.isInteger(qty)&&qty>=1&&qty<=30&&validAddons;
 const extrasTotal=chosen.reduce((total,x)=>{
  const addon=(selected?.addons||[]).find(a=>a.id===x.id);
  return total+(addon?addon.price_fils*x.qty:0);
 },0);
 $('addItemSubtotal').textContent=valid?'الإضافة: '+fmt(qty*(Number(selected.final_price_fils??selected.price_fils)+extrasTotal)):'';
 $('saveAddItem').disabled=!valid||invoiceAddBusy;
}
function pickInvoiceProduct(id){
 invoiceSelectedProduct=invoiceProductChoices.find(p=>p.id===id)||null;
 $('addItemSelection').innerHTML=invoiceSelectedProduct
  ?'<div class="invoice-picked-item"><img src="'+safe(asset(invoiceSelectedProduct.image))+'" alt=""><span><b>'+safe(invoiceSelectedProduct.name)+'</b><small>سعر الكوب: '+fmt(invoiceSelectedProduct.final_price_fils??invoiceSelectedProduct.price_fils)+'</small></span></div>'
  :'اختر المنتج من القائمة';
 $('addItemError').textContent='';
 document.querySelectorAll('[data-invoice-product]').forEach(b=>{
  const chosen=b.dataset.invoiceProduct===id;
  b.classList.toggle('selected',chosen);
  b.setAttribute('aria-pressed',String(chosen));
 });
 renderInvoiceAddonOptions();
 updateInvoiceProductSubtotal();
}
function renderInvoiceProductChoices(){
 const q=normalizeInvoiceProductSearch($('addItemSearch').value);
 const shown=invoiceProductChoices.filter(p=>
  normalizeInvoiceProductSearch(p.name+' '+p.id+' '+p.category+
   ' '+(window.highway67Language?.productName?.(p.name)||'')).includes(q)
 );
 $('addItemResultsCount').textContent=shown.length+' منتج متوفر';
 $('addItemProducts').innerHTML=shown.length?shown.map(p=>{
  const price=Number(p.final_price_fils??p.price_fils);
  const discounted=price<Number(p.price_fils);
  return '<button type="button" class="invoice-product-choice'+(invoiceSelectedProduct?.id===p.id?' selected':'')+'" data-invoice-product="'+safe(p.id)+'" aria-pressed="'+String(invoiceSelectedProduct?.id===p.id)+'"><img src="'+safe(asset(p.image))+'" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'"><span><strong>'+safe(p.name)+'</strong><small>'+safe(p.category)+'</small></span><span class="invoice-product-price">'+(discounted?'<del>'+fmt(p.price_fils)+'</del>':'')+fmt(price)+'<small>اختر المنتج</small></span></button>';
 }).join(''):'<div class="empty">ما لقينا منتج متوفر بهذا الاسم. جرّب اسم ثاني.</div>';
}
async function openInvoiceProductPicker(id){
 if(invoiceAddBusy)return;
 invoiceItemOrderId=id;invoiceSelectedProduct=null;invoiceProductChoices=[];
 $('addItemInvoiceNumber').textContent='#'+id;
 $('addItemSearch').value='';$('addItemQuantity').value='1';
 $('addItemError').textContent='';$('addItemSelection').textContent='اختر المنتج من القائمة';
 $('addItemResultsCount').textContent='';
 $('addItemProducts').innerHTML='<div class="empty">جاري تحميل المنتجات...</div>';
 $('invoiceAddonOptions').innerHTML='';$('invoiceAddonOptions').hidden=true;
 $('saveAddItem').disabled=true;$('addItemSubtotal').textContent='';
 $('addItemModal').classList.add('show');
 $('addItemSearch').focus();
 try{
  const menu=await api('/api/products');
  if(invoiceItemOrderId!==id)return;
  invoiceProductChoices=(menu.products||[]).filter(p=>
    p&&p.available&&typeof p.name==='string'&&typeof p.id==='string'&&
    Number(p.price_fils)>0&&Number.isFinite(Number(p.final_price_fils??p.price_fils))&&
    Number(p.final_price_fils??p.price_fils)>=0
  );
  renderInvoiceProductChoices();
  if(!invoiceProductChoices.length)$('addItemError').textContent='ما في منتجات متوفرة حالياً.';
 }catch(e){$('addItemError').textContent=e.message;$('addItemProducts').innerHTML=''}
}
$('addItemSearch').oninput=renderInvoiceProductChoices;
$('addItemProducts').onclick=e=>{
 const choice=e.target.closest('[data-invoice-product]');
 if(choice){
  pickInvoiceProduct(choice.dataset.invoiceProduct);
  $('addItemSelection').scrollIntoView?.({block:'nearest',behavior:'smooth'});
 }
};
$('addItemQuantity').oninput=updateInvoiceProductSubtotal;
$('addItemMinus').onclick=()=>{$('addItemQuantity').value=String(Math.max(1,Number($('addItemQuantity').value||1)-1));updateInvoiceProductSubtotal()};
$('addItemPlus').onclick=()=>{$('addItemQuantity').value=String(Math.min(30,Number($('addItemQuantity').value||1)+1));updateInvoiceProductSubtotal()};
$('closeAddItemModal').onclick=closeInvoiceProductPicker;
$('cancelAddItem').onclick=closeInvoiceProductPicker;
$('addItemModal').onclick=e=>{if(e.target===$('addItemModal'))closeInvoiceProductPicker()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('addItemModal').classList.contains('show'))closeInvoiceProductPicker()});
$('addItemForm').onsubmit=async e=>{
 e.preventDefault();
 if(invoiceAddBusy||!invoiceSelectedProduct||!invoiceItemOrderId)return;
 const qty=Number($('addItemQuantity').value);
 if(!Number.isInteger(qty)||qty<1||qty>30){$('addItemError').textContent='اختر كمية من 1 إلى 30';return}
 invoiceAddBusy=true;$('addItemError').textContent='';$('saveAddItem').disabled=true;
 $('saveAddItem').textContent='جاري إضافة المنتج...';
 try{
  const addons=chosenInvoiceAddons();
  if(addons.some(x=>{const a=(invoiceSelectedProduct.addons||[]).find(a=>a.id===x.id);return !a||!Number.isInteger(x.qty)||x.qty>a.max_qty}))throw Error('عدد الإضافات غير صحيح');
  const addedName=invoiceSelectedProduct.name;
  await api('/api/staff/orders/'+invoiceItemOrderId+'/items/add','POST',{product_id:invoiceSelectedProduct.id,qty,addons});
  invoiceAddBusy=false;
  closeInvoiceProductPicker();
  await refresh();
  $('refreshLabel').textContent='تمت إضافة '+addedName+' إلى الفاتورة';
 }catch(err){invoiceAddBusy=false;$('addItemError').textContent=err.message;updateInvoiceProductSubtotal()}
 finally{$('saveAddItem').textContent='إضافة إلى الفاتورة'}
};
async function advance(id,state){try{await api(`/api/staff/orders/${id}/status`,'POST',{status:state});await refresh()}catch(e){uiAlert(e.message)}}
function showLive(){selectedPage='live';selectedState='all';document.querySelectorAll('[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page==='live'));document.querySelectorAll('[data-state]').forEach(x=>x.classList.toggle('active',x.dataset.state==='all'));$('livePage').classList.remove('hidden');$('archivePage').classList.add('hidden');$('reviewsPage').classList.add('hidden');$('stockPage').classList.add('hidden')}
$('startBtn').onclick=async()=>{
 const today=new Intl.DateTimeFormat('ar-AE',{timeZone:'Asia/Dubai',dateStyle:'full'}).format(new Date());
 if(!await staffAsk({title:'بدء يوم عمل جديد',message:'هل تريد فتح يوم عمل جديد؟',details:'التاريخ: '+today+' — يتم إنشاء وردية جديدة من دون حذف سجلات الأيام السابقة.',confirmText:'نعم، بدء اليوم'}))return;
 const b=$('startBtn');b.disabled=true;
 try{await api('/api/staff/shift/start','POST',{});showLive();data=null;await refresh()}
 catch(e){$('refreshLabel').textContent=e.message;uiAlert(e.message)}
 finally{b.disabled=false}
};
$('endBtn').onclick=async()=>{
 const pending=Number(data?.counts?.new||0)+Number(data?.counts?.ready||0);
 if(pending){
  await staffAsk({title:'لا يمكن إنهاء اليوم الآن',message:'توجد '+pending+' طلبات لم تُسلّم بعد.',details:'سلّم الطلبات أو ألغِها قبل إغلاق الوردية.',confirmText:'فهمت'});
  return;
 }
 const total=fmt(data?.sales_fils||0);
 if(!await staffAsk({title:'إنهاء يوم العمل',message:'هل أنت متأكد من إنهاء الوردية الحالية؟',details:'مبيعات الطلبات المُسلّمة: '+total+'. يبقى سجل اليوم محفوظاً للمدير.',confirmText:'نعم، إنهاء اليوم',danger:true}))return;
 const b=$('endBtn');b.disabled=true;
 try{
  await api('/api/staff/shift/end','POST',{});
  showLive();data=null;await refresh();
 }catch(e){$('refreshLabel').textContent=e.message;uiAlert(e.message)}
 finally{b.disabled=false}
};
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{selectedPage=b.dataset.page;document.querySelectorAll('[data-page]').forEach(x=>x.classList.toggle('active',x===b));$('livePage').classList.toggle('hidden',selectedPage!=='live');$('archivePage').classList.toggle('hidden',selectedPage!=='archive');$('reviewsPage').classList.toggle('hidden',selectedPage!=='reviews');$('stockPage').classList.toggle('hidden',selectedPage!=='stock');if(selectedPage==='reviews')loadFeedback();if(selectedPage==='stock')loadStock();render()});
document.querySelectorAll('[data-state]').forEach(b=>b.onclick=()=>{selectedState=b.dataset.state;document.querySelectorAll('[data-state]').forEach(x=>x.classList.toggle('active',x===b));render()});
function modal(open){$('archiveModal').classList.toggle('show',open)}$('closeModal').onclick=()=>modal(false);$('archiveModal').onclick=e=>{if(e.target===$('archiveModal'))modal(false)};
async function openShift(id){try{loadedShift=(await api('/api/staff/shifts/'+id));let s=loadedShift.shift;$('modalTitle').textContent=shiftName(s);$('modalSummary').innerHTML=summaryCards(loadedShift);$('modalOrders').innerHTML=loadedShift.orders.length?loadedShift.orders.map(o=>bill(o,false)).join(''):'<div class="empty">لا توجد طلبات.</div>';$('shiftLabel').value=s.label||'';$('shiftNotes').value=s.notes||'';$('modalError').textContent='';document.querySelector('[data-mtab="orders"]').click();modal(true)}catch(e){uiAlert(e.message)}}
document.querySelectorAll('[data-mtab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-mtab]').forEach(x=>x.classList.toggle('active',x===b));$('modalOrders').classList.toggle('hidden',b.dataset.mtab!=='orders');$('modalEdit').classList.toggle('hidden',b.dataset.mtab!=='edit')});
$('modalEdit').onsubmit=async e=>{e.preventDefault();if(!loadedShift)return;try{await api(`/api/staff/shifts/${loadedShift.shift.id}/edit`,'POST',{label:$('shiftLabel').value,notes:$('shiftNotes').value});modal(false);await refresh()}catch(e){$('modalError').textContent=e.message}};
async function hideShift(id,b){
 b=b||$('hideShift');
 if(!await staffAsk({title:'إخفاء سجل يوم',message:'هل تريد إخفاء هذا اليوم من شاشة الموظفين؟',details:'المدير بيقدر يشوف السجل ويسترجعه.',confirmText:'نعم، إخفاء',danger:true}))return;
 try{await api(`/api/staff/shifts/${id}/hide`,'POST',{});modal(false);await refresh()}catch(e){uiAlert(e.message)}
};
$('hideShift').onclick=()=>{if(loadedShift)hideShift(loadedShift.shift.id,$('hideShift'))};
setInterval(()=>refresh(),5000);setInterval(refreshOrderStatus,30000);boot();

const feedbackReasonNames={
 too_sweet:'حالي زيادة',not_hot:'الحرارة مب مضبوطة',taste:'الطعم مب مثل المتوقع',
 missing:'ناقص إضافة أو طلب',presentation:'الشكل يقدر يتحسن',other:'شي ثاني'
};
async function loadFeedback(){
 const list=$('reviewsList');list.innerHTML='<div class="empty">Loading...</div>';
 try{
  const result=await api('/api/staff/feedback');
  const entries=result.feedback||[];
  list.innerHTML=entries.length?entries.map(x=>{
   const feeling=x.liked===1?' أعجبهم':x.liked===0?' يحتاج تحسين':'— بدون تقييم للطعم';
   const reasons=(x.reasons||[]).map(r=>feedbackReasonNames[r]||r).join(' · ');
   const stars=x.rating_score?x.rating_score+'/10':x.service_score?x.service_score+'/5':'—';
   return `<article class="review-item"><div class="review-head"><strong>#${Number(x.order_id)} · ${feeling}</strong><small>${when(x.created_at)}</small></div>
    <p><b>تقييم الطلب:</b> <span class="review-stars">${stars}</span></p>
    ${reasons?`<p>${safe(reasons)}</p>`:''}
    <p>${x.comment?safe(x.comment):'الزبون ما أضاف ملاحظة'}</p></article>`;
  }).join(''):'<div class="empty">لا توجد تقييمات حتى الآن.</div>';
  feedbackLoaded=true;
 }catch(e){list.innerHTML='<div class="empty">'+safe(e.message)+'</div>';}
}


function renderStock(){
 const list=$('stockProducts');
 const categoryNames={'Hot Drinks':'Hot drinks','Cold Drinks':'Cold drinks','Croissants':'Croissants','Desserts':'Desserts','Other':'Other'};
 const localized=window.highway67Language?.get()==='en';
 list.innerHTML=stockItems.length?stockItems.map(p=>{
  const available=!!p.available;
  const title=localized&&window.highway67Language?.productName?window.highway67Language.productName(p.name):p.name;
  return `<div class="stock-product ${available?'':'stock-unavailable'}"><div class="stock-product-name"><strong>${safe(title)}</strong><small>${categoryNames[p.category]||safe(p.category)}</small></div><span class="stock-state ${available?'stock-on':'stock-off'}">${available?'متوفر':'غير متوفر'}</span><button type="button" class="button sm ${available?'outline':'green'}" data-stock="${safe(p.id)}" data-available="${available?'false':'true'}">${available?'تعيين غير متوفر':'إعادة التوفر'}</button></div>`;
 }).join(''):'<div class="empty">لا توجد منتجات حالياً.</div>';
 list.querySelectorAll('[data-stock]').forEach(btn=>btn.onclick=async()=>{
  const pid=btn.dataset.stock,available=btn.dataset.available==='true';
  btn.disabled=true;$('stockStatus').textContent='';
  try{
   await api('/api/staff/products/'+encodeURIComponent(pid)+'/availability','POST',{available});
   const p=stockItems.find(x=>x.id===pid);
   if(p)p.available=available?1:0;
   renderStock();
   $('stockStatus').textContent=available?'تم إرجاع المنتج للمنيو':'تم وضع علامة غير متوفر للزبائن';
  }catch(e){$('stockStatus').textContent=e.message;btn.disabled=false}
 });
}
async function loadStock(){
 if(stockLoading)return;
 stockLoading=true;
 try{
  const result=await api('/api/staff/products');
  stockItems=result.products||[];
  renderStock();
 }catch(e){$('stockStatus').textContent=e.message}
 finally{stockLoading=false}
}
$('refreshStock').onclick=loadStock;
setInterval(()=>{if(selectedPage==='stock'&&$('loginScreen').classList.contains('hidden'))loadStock()},30000);
