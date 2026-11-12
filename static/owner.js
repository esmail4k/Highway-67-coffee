'use strict';
let staffAccounts=[],overview=null,products=[],promos=[],activeView='overview',editProduct=null,editPromo=null,archiveData=null;
let ownerReviews=[],ownerActivity=[];
const errtxt=(id,s,ok=false)=>{$(id).textContent=s;$(id).classList.toggle('success',ok)};
function loginVisible(yes){$('loginScreen').classList.toggle('hidden',!yes);$('dashboard').classList.toggle('hidden',yes);$('logout').classList.toggle('hidden',yes);$('ownerExport').classList.toggle('hidden',yes)}
$('ownerExport').onclick=()=>{window.location.href='/api/owner/export.csv'};
$('ownerRefresh').onclick=()=>loadAll();
let currentChallenge=null;
$('showPassword').onclick=()=>{
 const button=$('showPassword'),password=$('password'),show=password.type==='password';
 password.type=show?'text':'password';
 button.textContent=show?'إخفاء':'إظهار';
 button.setAttribute('aria-label',show?'إخفاء كلمة المرور':'إظهار كلمة المرور');
 button.setAttribute('aria-pressed',String(show));
};

function otpStep(challenge){currentChallenge=challenge;$('loginForm').classList.add('hidden');$('verifyForm').classList.remove('hidden');$('otpCode').focus()}
function resetLoginStep(){currentChallenge=null;$('loginForm').classList.remove('hidden');$('verifyForm').classList.add('hidden');$('otpCode').value='';$('password').value=''}
$('backToLogin').onclick=()=>{resetLoginStep();$('loginError').textContent=''};
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginError').textContent='';$('loginBtn').disabled=true;try{
 const out=await api('/api/owner/login','POST',{username:$('username').value.trim(),password:$('password').value,remember:$('rememberLogin').checked});
 if(out.requires_verification){otpStep(out.challenge_id);$('loginError').textContent=out.message||'أدخل رمز التحقق المرسل إلى هاتف المالك';return}
 resetLoginStep();loginVisible(false);await loadAll()
 }catch(e){errtxt('loginError',e.message)}finally{$('loginBtn').disabled=false}};
$('verifyForm').onsubmit=async e=>{e.preventDefault();if(!currentChallenge)return;$('loginError').textContent='';$('verifyBtn').disabled=true;try{
 await api('/api/owner/verify','POST',{challenge_id:currentChallenge,code:$('otpCode').value.trim()});
 resetLoginStep();loginVisible(false);await loadAll()
 }catch(e){errtxt('loginError',e.message)}finally{$('verifyBtn').disabled=false}};

$('logout').onclick=async()=>{await api('/api/owner/logout','POST',{}).catch(()=>{});loginVisible(true)};
async function boot(){try{const s=await api('/api/owner/session');loginVisible(!s.authenticated);if(s.authenticated)await loadAll()}catch{loginVisible(true)}}
async function loadAll(){try{[overview,{products},{promotions:promos},{accounts:staffAccounts}]=await Promise.all([api('/api/owner/overview'),api('/api/owner/products'),api('/api/owner/promotions'),api('/api/owner/staff/accounts')]);render();if(activeView==='activity')loadOwnerActivity()}catch(e){uiAlert(e.message)}}
function render(){if(!overview)return;$('shiftStatus').textContent=overview.shift?'الوردية #'+overview.shift.id+' مفتوحة':'لا توجد وردية مفتوحة';$('shiftStatus').classList.toggle('on',!!overview.shift);
 renderBusinessTotals();renderDailySales();
 $('overviewStats').innerHTML=summaryCards(overview);$('recentOrders').innerHTML=overview.orders.length?overview.orders.map(o=>ownerBill(o)).join(''):'<div class="empty">لا توجد طلبات في الوردية الحالية.</div>';
 $('overviewTop').innerHTML=topProducts(overview);$('overviewTotals').innerHTML=`<div class="kpirow"><span>طلبات جديدة</span><b>${overview.counts.new}</b></div><div class="kpirow"><span>جاهزة</span><b>${overview.counts.ready}</b></div><div class="kpirow"><span>مُسلّمة</span><b>${overview.counts.delivered}</b></div><div class="kpirow"><span>المبيعات</span><b>${fmt(overview.sales_fils)}</b></div>`;
 renderOwnerProducts();
 const weekdayNames=['الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت','الأحد'];
 $('promoList').innerHTML=promos.length?promos.map(p=>{let days=[];try{days=JSON.parse(p.days||'[]')}catch{}const schedule=p.mode==='weekly'?days.map(d=>weekdayNames[d]).join('، ')+' · '+p.start_time+'–'+p.end_time:((p.start_at||'')+' إلى '+(p.end_at||''));return `<article class="miniPromo"><div><strong>${safe(p.title)}</strong> <span class="badge ${p.enabled?'green':'grey'}">${p.enabled?'مفعّل':'متوقف'}</span><p>${safe(p.subtitle)}<br>المنتج: ${safe((products.find(x=>x.id===p.product_id)||{}).name||p.product_id)} · خصم ${p.discount_percent}%<br>${safe(schedule)}</p></div><div class="actions"><button class="button outline sm" data-editpromo="${p.id}">تعديل</button><button class="button red sm" data-deletepromo="${p.id}">حذف</button></div></article>`}).join(''):'<div class="empty">ما في عروض بعد. أضف أول عرض من الزر الموجود فوق.</div>';
 document.querySelectorAll('[data-editpromo]').forEach(b=>b.onclick=()=>promoModal(promos.find(p=>p.id===Number(b.dataset.editpromo))));
 document.querySelectorAll('[data-deletepromo]').forEach(b=>b.onclick=async()=>{if(!uiConfirm('حذف هذا العرض؟'))return;try{await api('/api/owner/promos/'+b.dataset.deletepromo+'/delete','POST',{});await loadAll()}catch(e){uiAlert(e.message)}});
 $('promoProduct').innerHTML=products.map(p=>`<option value="${safe(p.id)}">${safe(p.name)}</option>`).join('');
 $('archiveList').innerHTML=overview.shifts.length?overview.shifts.map(s=>`<article class="shift"><div><strong>${shiftName(s)}</strong> ${s.hidden_for_staff?'<span class="badge red">مخفي عن الموظفين</span>':''} ${s.ended_at?'':'<span class="badge green">مفتوح</span>'}<p>${s.order_count} طلب · ${fmt(s.sales_fils)} · ${s.ended_at?'انتهى '+when(s.ended_at):'بدأ '+when(s.started_at)}</p></div><div class="actions"><button class="button outline sm" data-viewshift="${s.id}">عرض وتعديل</button>${s.hidden_for_staff?`<button class="button green sm" data-restore="${s.id}">استرجاع</button>`:''}${s.ended_at?`<button class="button red sm" data-purge="${s.id}">حذف نهائي</button>`:''}</div></article>`).join(''):'<div class="empty">لا توجد أيام مسجلة.</div>';
 document.querySelectorAll('[data-viewshift]').forEach(b=>b.onclick=()=>openShift(Number(b.dataset.viewshift)));
 document.querySelectorAll('[data-restore]').forEach(b=>b.onclick=async()=>{try{await api('/api/owner/shifts/'+b.dataset.restore+'/restore','POST',{});await loadAll()}catch(e){uiAlert(e.message)}});
 document.querySelectorAll('[data-purge]').forEach(b=>b.onclick=async()=>{
  const id=Number(b.dataset.purge);
  if(b.dataset.confirmPurge!=='yes'){b.dataset.confirmPurge='yes';b.textContent='تأكيد الحذف النهائي';return}
  try{await api('/api/owner/shifts/'+id+'/permanent-delete','POST',{confirmation:'DELETE '+id});await loadAll()}catch(e){uiAlert(e.message)}
 });
 renderStaffAccounts();
 bindInvoiceDeletes();
}

function renderBusinessTotals(){
 const t=overview?.business_totals||{};
 const data=[
  ['مبيعات اليوم',t.today_sales_fils||0,'المبيعات المسلّمة اليوم',true],
  ['مبيعات الشهر',t.month_sales_fils||0,'من أول الشهر حتى اليوم',true],
  ['إجمالي المبيعات',t.all_sales_fils||0,'جميع الأيام المسجّلة',true],
  ['عدد الطلبات',t.all_orders||0,'جميع الطلبات بما فيها غير المسلّمة',false]
 ];
 $('ownerTotalStats').innerHTML=data.map(([title,amount,desc,currency])=>`<div class="owner-total-card"><div class="label">${title}</div><div class="value">${currency?fmt(amount):Number(amount)}</div><small>${desc}</small></div>`).join('');
}
function renderDailySales(){
 const days=[...(overview?.daily_sales||[])].reverse();
 const max=Math.max(100,...days.map(x=>Number(x.sales_fils||0)));
 $('ownerDailySales').innerHTML=days.length?days.map(x=>{
  const width=Math.max(0,Math.min(100,100*Number(x.sales_fils||0)/max));
  return `<div class="owner-daily-row"><small>${safe(x.day)}</small><div class="owner-daily-track"><i style="width:${width.toFixed(2)}%"></i></div><b>${fmt(x.sales_fils)}</b></div>`;
 }).join(''):'<div class="empty">ما فيه مبيعات مسجلة بعد.</div>';
}
function renderOwnerProducts(){
 const term=String($('ownerProductSearch').value||'').trim().toLowerCase();
 const filtered=products.filter(p=>(p.name+' '+p.id+' '+p.category).toLowerCase().includes(term));
 $('productList').innerHTML=filtered.length?filtered.map(p=>{
  const live=!!p.available;
  return `<article class="productRow">
    <img src="${safe(asset(p.image))}" alt="">
    <div class="pd"><b>${safe(p.name)}</b><small>${safe(p.category)} ${p.promo_only?'· عرض فقط':''}</small></div>
    <div class="pvalue">${p.discount_percent?`<div class="promoPrice"><del class="struck">${fmt(p.price_fils)}</del><strong class="discount">${fmt(Math.floor((p.price_fils*(100-p.discount_percent)+50)/100))}</strong></div>`:fmt(p.price_fils)}</div>
    <span class="owner-stock-state ${live?'':'off'}">${live?'متوفر':'غير متوفر'}</span>
    <button type="button" class="button ${live?'outline':'green'} sm owner-stock-btn" data-availability="${safe(p.id)}" data-value="${live?'false':'true'}">${live?'تعيين غير متوفر':'إعادة التوفر'}</button>
    <button type="button" class="button outline sm" data-editproduct="${safe(p.id)}">تعديل الاسم والمنتج</button><button type="button" class="button sm" data-manage-addons="${safe(p.id)}">الإضافات</button>
  </article>`;
 }).join(''):'<div class="empty">ما حصلنا منتجات بهالبحث.</div>';
 document.querySelectorAll('[data-editproduct]').forEach(b=>b.onclick=()=>productModal(products.find(p=>p.id===b.dataset.editproduct)));
 document.querySelectorAll('[data-manage-addons]').forEach(b=>b.onclick=()=>openAddonModal(b.dataset.manageAddons));
 document.querySelectorAll('[data-availability]').forEach(b=>b.onclick=async()=>{
  const id=b.dataset.availability,available=b.dataset.value==='true';
  b.disabled=true;
  try{
   await api('/api/owner/products/'+encodeURIComponent(id)+'/availability','POST',{available});
   const p=products.find(p=>p.id===id);if(p)p.available=available?1:0;
   renderOwnerProducts();
  }catch(e){uiAlert(e.message);b.disabled=false}
 });
}
async function loadOwnerReviews(){
 const el=$('ownerFeedbackList');
 el.innerHTML='<div class="empty">جاري تحميل التقييمات...</div>';
 try{
  const result=await api('/api/owner/feedback');
  ownerReviews=result.feedback||[];
  const reasons={
   too_sweet:'حالي زيادة',not_hot:'الحرارة مب مضبوطة',taste:'الطعم أقل من المتوقع',
   missing:'ناقص منتج أو إضافة',presentation:'الشكل يحتاج تحسين',other:'سبب آخر'};
  el.innerHTML=ownerReviews.length?ownerReviews.map(x=>{
   const mood=x.liked===1?' أعجبهم':x.liked===0?' يحتاج تحسين':'— بدون تقييم للطعم';
   const stars=x.rating_score?x.rating_score+'/10':x.service_score?x.service_score+'/5':'—';
   const tags=(x.reasons||[]).map(t=>reasons[t]||t).join(' · ');
   return `<article class="owner-review"><div class="header"><b>طلب #${Number(x.order_id)} · ${mood}</b><small>${when(x.created_at)}</small></div>
   <p>تقييم الطلب: <span class="stars">${stars}</span></p>${tags?'<p>'+safe(tags)+'</p>':''}
   ${x.comment?'<p>'+safe(x.comment)+'</p>':'<p>الزبون ما أضاف ملاحظة</p>'}</article>`;
  }).join(''):'<div class="empty">لا توجد تقييمات حتى الآن.</div>';
 }catch(e){el.innerHTML='<div class="empty">'+safe(e.message)+'</div>'}
}

function ownerBill(o){
 if(o.deleted_at)return bill(o,false)+`<div class="deleteInvoice"><span class="badge red">فاتورة محذوفة · لا تُحسب</span> <button type="button" class="button green sm" data-restoreinvoice="${o.id}">استرجاع الفاتورة #${o.id}</button></div>`;
 return bill(o,false)+`<div class="deleteInvoice"><button type="button" class="button red sm" data-deleteinvoice="${o.id}">حذف الفاتورة #${o.id}</button></div>`
}
async function loadOwnerActivity(){
 const container=$('ownerActivityList'),deleted=$('ownerDeletedInvoices');
 if(!container||!deleted)return;
 try{
  const result=await api('/api/owner/activity');
  ownerActivity=result.logs||[];
  container.innerHTML=ownerActivity.length?ownerActivity.map(l=>`<article class="activity-record"><strong>${safe(l.actor)}</strong> · <small>${when(l.created_at)}</small><p>${safe(l.detail)}</p>${l.order_id?'<small>الفاتورة #'+Number(l.order_id)+'</small>':''}</article>`).join(''):'<div class="empty">ما فيه تعديلات مسجّلة للحين.</div>';
  deleted.innerHTML=(result.deleted_orders||[]).length?result.deleted_orders.map(o=>`<article class="activity-record"><strong>فاتورة #${o.id} · ${safe(o.customer_name)}</strong><p>${fmt(o.total_fils)} · حذفها ${safe(o.deleted_by)} · ${when(o.deleted_at)}</p><button class="button green sm" data-restoreinvoice="${o.id}">استرجاع الفاتورة</button></article>`).join(''):'<div class="empty">ما فيه فواتير محذوفة.</div>';
  bindInvoiceDeletes()
 }catch(e){container.textContent=e.message}
}
$('refreshOwnerActivity').onclick=loadOwnerActivity;
function bindInvoiceDeletes(){
 document.querySelectorAll('[data-restoreinvoice]').forEach(b=>b.onclick=async()=>{
  const id=Number(b.dataset.restoreinvoice);
  if(!uiConfirm('استرجاع الفاتورة #'+id+' وإعادتها إلى الحسابات؟'))return;
  b.disabled=true;
  try{await api('/api/owner/orders/'+id+'/restore','POST',{});await loadAll();await loadOwnerActivity()}
  catch(e){uiAlert(e.message);b.disabled=false}
 });
 document.querySelectorAll('[data-deleteinvoice]').forEach(b=>b.onclick=async()=>{
  const id=Number(b.dataset.deleteinvoice);
  if(b.dataset.confirmDelete!=='yes'){
   b.dataset.confirmDelete='yes';b.textContent='تأكيد حذف الفاتورة #'+id;b.setAttribute('aria-label','تأكيد الحذف النهائي للفاتورة #'+id);return;
  }
  b.disabled=true;
  try{
   await api('/api/owner/orders/'+id+'/delete','POST',{confirmation:'DELETE '+id});
   await loadAll();
   if(archiveData?.shift){const sid=archiveData.shift.id;const latest=await api('/api/owner/shifts/'+sid);archiveData=latest;$('shiftModalStats').innerHTML=summaryCards(latest);$('shiftModalOrders').innerHTML=latest.orders.length?latest.orders.map(o=>ownerBill(o)).join(''):'<div class="empty">لا توجد فواتير في هذا اليوم.</div>';bindInvoiceDeletes()}
  }catch(e){uiAlert(e.message);b.disabled=false}
 });
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
 activeView=b.dataset.view;
 document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));
 ['overview','products','promos','archive','staffAccounts','feedback','activity'].forEach(k=>$('view-'+k).classList.toggle('hidden',k!==activeView));
 if(activeView==='feedback')loadOwnerReviews();if(activeView==='activity')loadOwnerActivity();
});
$('ownerProductSearch').addEventListener('input',renderOwnerProducts);
$('refreshOwnerFeedback').onclick=loadOwnerReviews;
function modal(id,on){$(id).classList.toggle('show',on)}document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>modal(b.dataset.close,false));document.querySelectorAll('.modalBackdrop').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)modal(m.id,false)}));
function productModal(p){editProduct=p||null;$('productTitle').textContent=p?'تعديل المنتج':'إضافة منتج جديد';$('productId').value=p?.id||'';$('productName').value=p?.name||'';$('productCat').value=p?.category||'Hot Drinks';$('productPrice').value=p?(p.price_fils/100).toFixed(2):'';$('productDiscount').value=p?.discount_percent||0;$('productAvailable').checked=p?!!p.available:true;$('productPromoOnly').checked=p?!!p.promo_only:false;$('productImage').src=asset(p?.image||'hot.webp');$('productUpload').value='';errtxt('productError','');modal('productModal',true)}
$('newProduct').onclick=()=>productModal();$('productUpload').onchange=e=>{const f=e.target.files[0];if(f)$('productImage').src=URL.createObjectURL(f)};
async function fileToDataUrl(file){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('اختر صورة PNG أو JPG أو WebP');
 const url=URL.createObjectURL(file);
 let image;
 try{
  image=await new Promise((resolve,reject)=>{
   const photo=new Image();
   photo.onload=()=>resolve(photo);
   photo.onerror=()=>reject(Error('تعذر فتح الصورة'));
   photo.src=url;
  });
  // Resize and compress locally before sending. The server accepts up to 850 KB.
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('هذا المتصفح لا يدعم تجهيز الصور');
  for(const maxDim of [1000,850,700,560,440]){
   const scale=Math.min(1,maxDim/Math.max(image.naturalWidth,image.naturalHeight));
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(image,0,0,canvas.width,canvas.height);
   for(const quality of [.85,.72,.58]){
    const result=canvas.toDataURL('image/webp',quality);
    if(result.startsWith('data:image/webp;base64,')&&(result.length-result.indexOf(',')-1)*.75<800000)return result;
   }
  }
  throw Error('تعذر تصغير الصورة. اختر صورة بدقة أقل');
 }finally{URL.revokeObjectURL(url)}
}
$('productForm').onsubmit=async e=>{e.preventDefault();$('saveProduct').disabled=true;errtxt('productError','');try{
 const payload={id:$('productId').value||null,name:$('productName').value,category:$('productCat').value,price:Number($('productPrice').value),discount_percent:Number($('productDiscount').value),available:$('productAvailable').checked,promo_only:$('productPromoOnly').checked};
 const file=$('productUpload').files[0];
 // Validate and compress the image BEFORE creating the product, to avoid partial saves.
 const imageValue=file?await fileToDataUrl(file):null;
 const r=await api('/api/owner/product/save','POST',payload);
 // If the upload fails, subsequent Save retries edit the same product instead of duplicating it.
 $('productId').value=r.id;
 if(imageValue){
  await api('/api/owner/products/'+encodeURIComponent(r.id)+'/image','POST',{image:imageValue});
  $('productUpload').value='';
 }
 modal('productModal',false);await loadAll();
 }catch(err){errtxt('productError',err.message)}finally{$('saveProduct').disabled=false}};
let selectedAddonProductId=null;
function resetAddonEditor(){
 $('addonId').value='';$('addonName').value='';$('addonPrice').value='';
 $('addonMaxQty').value='1';$('addonEnabled').checked=true;
 $('addonFormTitle').textContent='إضافة جديدة';errtxt('addonError','');
}
function renderOwnerAddons(){
 const p=products.find(x=>x.id===selectedAddonProductId);
 $('addonTitle').textContent='إضافات: '+(p?.name||'المنتج');
 const list=p?.addons||[];
 $('addonList').innerHTML=list.length?list.map(a=>
  '<div class="addon-owner-row"><div><strong>'+safe(a.name)+'</strong><small>'+fmt(a.price_fils)+' · أقصى عدد لكل كوب: '+a.max_qty+(a.enabled?' · متوفرة':' · مخفية')+'</small></div><div class="actions"><button type="button" class="button outline sm" data-edit-addon="'+a.id+'">تعديل</button><button type="button" class="button red sm" data-delete-addon="'+a.id+'">حذف</button></div></div>'
 ).join(''):'<div class="empty">لا توجد إضافات لهذا المنتج بعد.</div>';
 document.querySelectorAll('[data-edit-addon]').forEach(b=>b.onclick=()=>{
  const a=list.find(a=>a.id===Number(b.dataset.editAddon));
  if(!a)return;
  $('addonId').value=a.id;$('addonName').value=a.name;
  $('addonPrice').value=(a.price_fils/100).toFixed(2);
  $('addonMaxQty').value=a.max_qty;$('addonEnabled').checked=!!a.enabled;
  $('addonFormTitle').textContent='تعديل الإضافة';
  errtxt('addonError','');
  $('addonName').focus();
 });
 document.querySelectorAll('[data-delete-addon]').forEach(b=>b.onclick=async()=>{
  const id=Number(b.dataset.deleteAddon);
  if(!uiConfirm('حذف هذه الإضافة من المنتج؟'))return;
  b.disabled=true;
  try{
   await api('/api/owner/addons/'+id+'/delete','POST',{});
   await loadAll();resetAddonEditor();renderOwnerAddons();
  }catch(err){errtxt('addonError',err.message);b.disabled=false}
 });
}
function openAddonModal(productId){
 selectedAddonProductId=productId;
 $('addonProductId').value=productId;
 resetAddonEditor();renderOwnerAddons();
 modal('addonModal',true);
}
$('resetAddon').onclick=resetAddonEditor;
$('addonForm').onsubmit=async e=>{
 e.preventDefault();
 const b=$('saveAddon');b.disabled=true;errtxt('addonError','');
 try{
  await api('/api/owner/addons/save','POST',{
   id:$('addonId').value?Number($('addonId').value):null,
   product_id:$('addonProductId').value,
   name:$('addonName').value.trim(),
   price:Number($('addonPrice').value),
   max_qty:Number($('addonMaxQty').value),
   enabled:$('addonEnabled').checked
  });
  await loadAll();
  resetAddonEditor();renderOwnerAddons();
  errtxt('addonError','تم حفظ الإضافة',true);
 }catch(err){errtxt('addonError',err.message)}
 finally{b.disabled=false}
};
function promoModal(p){editPromo=p||null;$('promoTitle').textContent=p?'تعديل العرض':'إنشاء عرض';$('promoId').value=p?.id||'';$('promoName').value=p?.title||'';$('promoSubtitle').value=p?.subtitle||'';$('promoProduct').value=p?.product_id||products[0]?.id||'';$('promoDiscount').value=p?.discount_percent||0;$('promoMode').value=p?.mode||'weekly';$('promoStartTime').value=p?.start_time||'00:00';$('promoEndTime').value=p?.end_time||'23:59';$('promoStartAt').value=p?.start_at||'';$('promoEndAt').value=p?.end_at||'';$('promoEnabled').checked=p?!!p.enabled:true;let days=[];try{days=JSON.parse(p?.days||'[0]')}catch{}document.querySelectorAll('.dayCheck').forEach(x=>x.checked=days.includes(Number(x.value)));$('promoMode').onchange();errtxt('promoError','');modal('promoModal',true)}
$('newPromo').onclick=()=>promoModal();$('promoMode').onchange=()=>{$('weeklyFields').classList.toggle('hidden',$('promoMode').value!=='weekly');$('onceFields').classList.toggle('hidden',$('promoMode').value!=='one_time')};
$('promoForm').onsubmit=async e=>{e.preventDefault();$('savePromo').disabled=true;errtxt('promoError','');try{const mode=$('promoMode').value;const payload={id:$('promoId').value?Number($('promoId').value):null,title:$('promoName').value,subtitle:$('promoSubtitle').value,product_id:$('promoProduct').value,mode,discount_percent:Number($('promoDiscount').value),enabled:$('promoEnabled').checked,days:Array.from(document.querySelectorAll('.dayCheck:checked')).map(x=>Number(x.value)),start_time:$('promoStartTime').value,end_time:$('promoEndTime').value,start_at:$('promoStartAt').value,end_at:$('promoEndAt').value};await api('/api/owner/promo/save','POST',payload);modal('promoModal',false);await loadAll()}catch(err){errtxt('promoError',err.message)}finally{$('savePromo').disabled=false}};
async function openShift(id){try{archiveData=await api('/api/owner/shifts/'+id);const s=archiveData.shift;$('shiftModalTitle').textContent=shiftName(s);$('shiftModalStats').innerHTML=summaryCards(archiveData);$('shiftModalOrders').innerHTML=archiveData.orders.length?archiveData.orders.map(o=>ownerBill(o)).join(''):'<div class="empty">لا توجد طلبات.</div>';bindInvoiceDeletes();$('shiftEditLabel').value=s.label||'';$('shiftEditDate').value=s.local_date;$('shiftEditNotes').value=s.notes||'';$('shiftEdit').classList.toggle('hidden',!s.ended_at);errtxt('shiftModalError','');document.querySelector('[data-archivetab="details"]').click();modal('shiftModal',true)}catch(e){uiAlert(e.message)}}
document.querySelectorAll('[data-archivetab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-archivetab]').forEach(x=>x.classList.toggle('active',x===b));$('shiftModalOrders').classList.toggle('hidden',b.dataset.archivetab!=='details');$('shiftEdit').classList.toggle('hidden',b.dataset.archivetab!=='edit'||!archiveData?.shift?.ended_at)});
$('shiftEdit').onsubmit=async e=>{e.preventDefault();if(!archiveData)return;try{await api('/api/owner/shifts/'+archiveData.shift.id+'/edit','POST',{label:$('shiftEditLabel').value,local_date:$('shiftEditDate').value,notes:$('shiftEditNotes').value});modal('shiftModal',false);await loadAll()}catch(err){errtxt('shiftModalError',err.message)}};
setInterval(async()=>{if($('loginScreen').classList.contains('hidden')&&activeView==='overview')try{overview=await api('/api/owner/overview');render()}catch{}},7000);
boot();

function renderStaffAccounts(){
 $('staffAccountsList').innerHTML=staffAccounts.length?staffAccounts.map(a=>`<div class="accountRow"><div class="accountInfo"><strong>${safe(a.username)}</strong> <span class="badge ${a.enabled?'green':'red'}">${a.enabled?'مفعّل':'موقوف'}</span><small>آخر دخول: ${a.last_login_at?when(a.last_login_at):'لم يدخل بعد'}</small></div><div class="accountActions"><input type="password" minlength="10" maxlength="128" placeholder="كلمة مرور جديدة" autocomplete="new-password" data-pw="${a.id}" aria-label="تغيير كلمة مرور ${safe(a.username)}"><button class="button outline sm" data-reset="${a.id}">تغيير كلمة المرور</button><button class="button ${a.enabled?'red':'green'} sm" data-enabled="${a.id}" data-state="${a.enabled?0:1}">${a.enabled?'إيقاف الحساب':'تفعيل الحساب'}</button></div></div>`).join(''):'<div class="empty">لا يوجد موظفون. أنشئ الحساب الأول.</div>';
 document.querySelectorAll('[data-enabled]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api('/api/owner/staff/accounts/'+b.dataset.enabled+'/toggle','POST',{enabled:b.dataset.state==='1'});await loadAll()}catch(e){errtxt('accountError',e.message);b.disabled=false}});
 document.querySelectorAll('[data-reset]').forEach(b=>b.onclick=async()=>{const input=document.querySelector('[data-pw="'+b.dataset.reset+'"]');const password=input.value;if(password.length<10){errtxt('accountError','اكتب كلمة مرور جديدة من 10 أحرف على الأقل');return}b.disabled=true;try{await api('/api/owner/staff/accounts/'+b.dataset.reset+'/reset-password','POST',{password});input.value='';errtxt('accountError','تم تغيير كلمة المرور',true);await loadAll()}catch(e){errtxt('accountError',e.message);b.disabled=false}})
}
$('newStaffForm').onsubmit=async e=>{e.preventDefault();$('createStaffBtn').disabled=true;errtxt('accountError','');try{await api('/api/owner/staff/accounts/create','POST',{username:$('staffAccountName').value.trim(),password:$('staffAccountPassword').value});$('newStaffForm').reset();await loadAll();errtxt('accountError','تم إنشاء حساب الموظف',true)}catch(e){errtxt('accountError',e.message)}finally{$('createStaffBtn').disabled=false}};