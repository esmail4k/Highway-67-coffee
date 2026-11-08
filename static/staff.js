'use strict';
let data=null,selectedPage='live',selectedState='all',loadedShift=null,updating=false;
let feedbackLoaded=false,stockItems=[],stockLoading=false;
function loginVisible(yes){$('loginScreen').classList.toggle('hidden',!yes);$('dashboard').classList.toggle('hidden',yes);$('logout').classList.toggle('hidden',yes);$('exportOrders').classList.toggle('hidden',yes)}
$('exportOrders').onclick=()=>{window.location.href='/api/staff/export.csv'};
let currentChallenge=null;
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
 const out=await api('/api/staff/login','POST',{username:$('username').value,password:$('password').value});
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
  if(next<1){alert('لحذف المنتج بالكامل استخدم زر حذف المنتج');return}
  b.disabled=true;
  try{await api('/api/staff/orders/'+id+'/items/'+item+'/quantity','POST',{qty:next});await refresh()}
  catch(e){alert(e.message)}finally{b.disabled=false}
 });
 document.querySelectorAll('[data-remove-item]').forEach(b=>b.onclick=async()=>{
  const id=Number(b.dataset.removeItem),item=Number(b.dataset.item);
  if(!confirm('حذف هذا المنتج من الفاتورة؟'))return;
  b.disabled=true;
  try{await api('/api/staff/orders/'+id+'/items/'+item+'/remove','POST',{});await refresh()}
  catch(e){alert(e.message)}finally{b.disabled=false}
 });
 document.querySelectorAll('[data-add-item]').forEach(b=>b.onclick=async()=>{
  const id=Number(b.dataset.addItem);
  try{
   const menu=await api('/api/products');
   const available=(menu.products||[]).filter(p=>p.available&&p.price_fils>0);
   if(!available.length){alert('ما فيه منتجات متوفرة حالياً');return}
   const choices=available.map((p,i)=>(i+1)+'. '+p.name+' — '+fmt(p.price_fils)).join('\\n');
   const selection=prompt('اختر رقم المنتج لإضافته إلى الفاتورة #'+id+'\\n'+choices);
   if(selection===null)return;
   const index=Number(selection);
   if(!Number.isInteger(index)||index<1||index>available.length){alert('اختيار غير صحيح');return}
   const qtyText=prompt('كم حبة تبا تضيف؟ (1 إلى 30)','1');
   if(qtyText===null)return;
   const qty=Number(qtyText);
   if(!Number.isInteger(qty)||qty<1||qty>30){alert('الكمية غير صحيحة');return}
   b.disabled=true;
   await api('/api/staff/orders/'+id+'/items/add','POST',{product_id:available[index-1].id,qty});
   await refresh();
  }catch(e){alert(e.message)}finally{b.disabled=false}
 });
 document.querySelectorAll('[data-delete-staff-order]').forEach(b=>b.onclick=async()=>{
  const id=Number(b.dataset.deleteStaffOrder);
  if(!confirm('إلغاء الفاتورة #'+id+' وإزالتها من شاشة الموظفين والمبيعات؟ المدير يقدر يسترجعها.'))return;
  b.disabled=true;
  try{await api('/api/staff/orders/'+id+'/delete','POST',{confirmation:'DELETE '+id});await refresh()}
  catch(e){alert(e.message)}finally{b.disabled=false}
 });
}
async function advance(id,state){try{await api(`/api/staff/orders/${id}/status`,'POST',{status:state});await refresh()}catch(e){alert(e.message)}}
function showLive(){selectedPage='live';selectedState='all';document.querySelectorAll('[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page==='live'));document.querySelectorAll('[data-state]').forEach(x=>x.classList.toggle('active',x.dataset.state==='all'));$('livePage').classList.remove('hidden');$('archivePage').classList.add('hidden');$('reviewsPage').classList.add('hidden');$('stockPage').classList.add('hidden')}
$('startBtn').onclick=async()=>{try{await api('/api/staff/shift/start','POST',{});showLive();await refresh()}catch(e){alert(e.message)}};
$('endBtn').onclick=async()=>{const b=$('endBtn');b.disabled=true;try{
 await api('/api/staff/shift/end','POST',{});
 showLive();data=null;await refresh();
 }catch(e){$('refreshLabel').textContent=e.message;window.alert(e.message)}finally{b.disabled=false}};
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{selectedPage=b.dataset.page;document.querySelectorAll('[data-page]').forEach(x=>x.classList.toggle('active',x===b));$('livePage').classList.toggle('hidden',selectedPage!=='live');$('archivePage').classList.toggle('hidden',selectedPage!=='archive');$('reviewsPage').classList.toggle('hidden',selectedPage!=='reviews');$('stockPage').classList.toggle('hidden',selectedPage!=='stock');if(selectedPage==='reviews')loadFeedback();if(selectedPage==='stock')loadStock();render()});
document.querySelectorAll('[data-state]').forEach(b=>b.onclick=()=>{selectedState=b.dataset.state;document.querySelectorAll('[data-state]').forEach(x=>x.classList.toggle('active',x===b));render()});
function modal(open){$('archiveModal').classList.toggle('show',open)}$('closeModal').onclick=()=>modal(false);$('archiveModal').onclick=e=>{if(e.target===$('archiveModal'))modal(false)};
async function openShift(id){try{loadedShift=(await api('/api/staff/shifts/'+id));let s=loadedShift.shift;$('modalTitle').textContent=shiftName(s);$('modalSummary').innerHTML=summaryCards(loadedShift);$('modalOrders').innerHTML=loadedShift.orders.length?loadedShift.orders.map(o=>bill(o,false)).join(''):'<div class="empty">لا توجد طلبات.</div>';$('shiftLabel').value=s.label||'';$('shiftNotes').value=s.notes||'';$('modalError').textContent='';document.querySelector('[data-mtab="orders"]').click();modal(true)}catch(e){alert(e.message)}}
document.querySelectorAll('[data-mtab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-mtab]').forEach(x=>x.classList.toggle('active',x===b));$('modalOrders').classList.toggle('hidden',b.dataset.mtab!=='orders');$('modalEdit').classList.toggle('hidden',b.dataset.mtab!=='edit')});
$('modalEdit').onsubmit=async e=>{e.preventDefault();if(!loadedShift)return;try{await api(`/api/staff/shifts/${loadedShift.shift.id}/edit`,'POST',{label:$('shiftLabel').value,notes:$('shiftNotes').value});modal(false);await refresh()}catch(e){$('modalError').textContent=e.message}};
async function hideShift(id,b){
 b=b||$('hideShift');
 if(b.dataset.confirmHide!=='yes'){b.dataset.confirmHide='yes';b.textContent='تأكيد الإخفاء';return}
 try{await api(`/api/staff/shifts/${id}/hide`,'POST',{});modal(false);await refresh()}catch(e){alert(e.message)}
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
   const feeling=x.liked===1?'😍 أعجبهم':x.liked===0?'😕 يحتاج تحسين':'— بدون تقييم للطعم';
   const reasons=(x.reasons||[]).map(r=>feedbackReasonNames[r]||r).join(' · ');
   const stars=x.service_score?'★'.repeat(x.service_score)+'☆'.repeat(5-x.service_score):'—';
   return `<article class="review-item"><div class="review-head"><strong>#${Number(x.order_id)} · ${feeling}</strong><small>${when(x.created_at)}</small></div>
    <p><b>الخدمة:</b> <span class="review-stars">${stars}</span></p>
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
