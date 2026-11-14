'use strict';
const $=id=>document.getElementById(id);
let products=[],promotions=[],selection='all',search='',cart={},cartNotes={},shopOpen=false,banner=0;
let customizeId=null,customizeSource=null,confirmTimer=null,feedbackToken=null,feedbackOrderId=null,feedbackRating=null,feedbackReasons=new Set();
const groups=[['Hot Drinks','المشروبات الساخنة','i-cup'],['Cold Drinks','المشروبات الباردة','i-cold'],['Croissants','الكرواسون','i-crois'],['Desserts','الحلويات','i-crois'],['Other','أخرى','i-all']];
function money(fils){return (Number(fils||0)/100).toFixed(2).replace(/\.00$/,'')+' AED'}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function normalized(s){return String(s||'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/[ً-ْ]/g,'').trim()}
function img(p){return '/assets/'+String(p.image||'hot.webp').split('/').map(encodeURIComponent).join('/')}
function finalPrice(p){return Number(p.final_price_fils!=null?p.final_price_fils:p.price_fils)}
function notice(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(notice.t);notice.t=setTimeout(()=>$('toast').classList.remove('show'),2400)}
function qty(){return Object.values(cart).reduce((a,n)=>a+n,0)}
function productForKey(key){return products.find(p=>p.id===key.split('__')[0])}
function shotsForKey(key){const match=/__caramel([1-5])(?:__addons[0-9,-]+)?$/.exec(key);return match?Number(match[1]):(key.endsWith('__caramel')?1:0)}
function syrupForKey(key){return shotsForKey(key)>0?'caramel':''}
function extrasForKey(key){
 const match=/__addons([0-9,-]+)$/.exec(key);
 if(!match)return [];
 return match[1].split(',').map(k=>{const [id,qty]=k.split('-').map(Number);return {id,qty}}).filter(x=>Number.isInteger(x.id)&&Number.isInteger(x.qty)&&x.qty>0);
}
function addonCostForKey(key){
 const p=productForKey(key);
 if(!p)return 0;
 return extrasForKey(key).reduce((sum,selected)=>{
  const addon=(p.addons||[]).find(a=>a.id===selected.id);
  return sum+(addon?addon.price_fils*selected.qty:0);
 },0);
}
function extraLabelForKey(key){
 const p=productForKey(key);
 if(!p)return '';
 return extrasForKey(key).map(sel=>{
  const addon=(p.addons||[]).find(a=>a.id===sel.id);
  return addon?'+ '+addon.name+(sel.qty>1?' × '+sel.qty:''):'إضافة لم تعد متاحة';
 }).join('، ');
}
function unitPrice(key){const p=productForKey(key);return p?finalPrice(p)+(syrupForKey(key)?100:0)+addonCostForKey(key):0}
function sum(){return Object.entries(cart).reduce((total,[key,n])=>total+unitPrice(key)*n,0)}
function renderCards(){
 const sections=groups.filter(([id])=>selection==='all'||selection===id).map(([id,label,icon])=>{
 const matches=products.filter(p=>p.category===id&&normalized(p.name+' '+p.id+' '+id+' '+(window.highway67Language ? window.highway67Language.productName(p.name) : '')).includes(search));
 if(!matches.length)return '';
 const cards=matches.map((p,index)=>{
 const disc=Number(p.effective_discount||0),sale=disc>0;
 return `<article class="product ${id==='Croissants'?'pastry':''} ${p.available?'':'sold-out'}" style="--item-delay:${Math.min(index*45,450)}ms">${sale?`<span class="discountTag">خصم ${disc}%</span>`:''}${!p.available?'<span class="sold-out-tag">غير متوفر</span>':''}<div class="photo"><img loading="lazy" src="${esc(img(p))}" alt="${esc(p.name)}"></div><div class="details"><div class="pname">${esc(p.name)}</div><div class="pricegroup">${sale?`<del class="oldprice">${money(p.price_fils)}</del>`:''}<span class="price ${sale?'saleprice':''}">${money(finalPrice(p))}</span></div><button type="button" class="add" data-add="${esc(p.id)}" ${p.available?'':'disabled aria-disabled="true"'}>${p.available?'+ إضافة':'غير متوفر'}</button></div></article>`}).join('');
 return `<section class="category" id="cat-${id.replace(/ /g,'-')}"><h2><svg><use href="#${icon}"/></svg>${label}</h2><div class="products ${id==='Croissants'?'pastries':''}">${cards}</div></section>`}).join('');
 $('sections').innerHTML=sections||'<p class="blank">ما حصلنا منتجات بهالبحث</p>';
 document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>add(b.dataset.add,b));
}

function cartPulse(){
 const target=$('cartButton'),badge=$('count');
 target.classList.remove('cart-pop');badge.classList.remove('badge-pop');
 void target.offsetWidth;target.classList.add('cart-pop');badge.classList.add('badge-pop');
 setTimeout(()=>{target.classList.remove('cart-pop');badge.classList.remove('badge-pop')},750);
}
function cartSparkles(){
 const center=$('cartButton').getBoundingClientRect();
 if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
 for(let i=0;i<5;i++){
  const spark=document.createElement('span');
  spark.textContent=i%2?'✦':'✧';
  spark.style.cssText='position:fixed;z-index:92;pointer-events:none;left:'+(center.left+center.width/2)+'px;top:'+(center.top+center.height/2)+'px;color:#bb8b3b;font-size:18px;line-height:1';
  document.body.appendChild(spark);
  const angle=(i*2*Math.PI/5)-Math.PI/2;
  const animation=spark.animate([
   {transform:'translate(-50%,-50%) scale(.3)',opacity:1},
   {transform:'translate(calc(-50% + '+Math.round(Math.cos(angle)*49)+'px),calc(-50% + '+Math.round(Math.sin(angle)*49)+'px)) scale(1.25)',opacity:0}
  ],{duration:600,easing:'cubic-bezier(.19,1,.22,1)'});
  animation.onfinish=()=>spark.remove();setTimeout(()=>spark.remove(),800);
 }
}
function flyToCart(p,source){
 const target=$('cartButton');
 if(!source||!target)return cartPulse();
 const image=source.closest('.product')?.querySelector('.photo img');
 if(!image)return cartPulse();
 if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return cartPulse();
 const start=image.getBoundingClientRect(),end=target.getBoundingClientRect();
 const size=Math.min(start.width,start.height,88);
 const x=start.left+start.width/2-size/2,y=start.top+start.height/2-size/2;
 const dx=end.left+end.width/2-(x+size/2),dy=end.top+end.height/2-(y+size/2);
 const clone=document.createElement('img');
 clone.src=img(p);clone.alt='';clone.className='fly-to-cart';
 clone.style.cssText+=';left:'+x+'px;top:'+y+'px;width:'+size+'px;height:'+size+'px;transition:none;';
 document.body.appendChild(clone);
 const keyframes=[
  {transform:'translate(0px,0px) rotate(0deg) scale(1)',opacity:1,offset:0},
  {transform:'translate('+(dx*.22)+'px,'+(dy*.08-35)+'px) rotate(-9deg) scale(1.15)',opacity:1,offset:.28},
  {transform:'translate('+(dx*.65)+'px,'+(dy*.65-25)+'px) rotate(12deg) scale(.65)',opacity:1,offset:.69},
  {transform:'translate('+dx+'px,'+dy+'px) rotate(0deg) scale(.16)',opacity:.15,offset:1}
 ];
 if(clone.animate){
  const animation=clone.animate(keyframes,{duration:850,easing:'cubic-bezier(.25,.6,.3,1)',fill:'forwards'});
  animation.onfinish=()=>{clone.remove();cartPulse();cartSparkles()};
  setTimeout(()=>{if(clone.isConnected){clone.remove();cartPulse();cartSparkles()}},960);
 }else{
  requestAnimationFrame(()=>{clone.style.transition='transform .8s ease,opacity .8s ease';clone.style.transform='translate('+dx+'px,'+dy+'px) scale(.2)';clone.style.opacity='0'});
  setTimeout(()=>{clone.remove();cartPulse()},850);
 }
}
function showCartConfirm(p,shots,source){
 const banner=$('cartConfirm'),name=$('cartConfirmName');
 name.textContent='✓ '+p.name+(shots?' + كراميل × '+shots:'')+' تمت إضافته للسلة';
 banner.hidden=false;
 clearTimeout(confirmTimer);
 confirmTimer=setTimeout(()=>{banner.hidden=true},4300);
 if(source&&source.isConnected){
  if(!source.dataset.addOriginal)source.dataset.addOriginal=source.textContent;
  const mark=String(Number(source.dataset.addMark||0)+1);
  source.dataset.addMark=mark;
  source.textContent='✓ تمت الإضافة';
  source.classList.add('added');
  source.closest('.product')?.classList.add('just-added');
  setTimeout(()=>{
   if(source.isConnected&&source.dataset.addMark===mark){
    source.textContent=source.dataset.addOriginal;
    source.classList.remove('added');
    source.closest('.product')?.classList.remove('just-added');
   }
  },1350);
 }
}
$('cartConfirmOpen').onclick=()=>{clearTimeout(confirmTimer);$('cartConfirm').hidden=true;step('cart');drawer(true)};
$('cartConfirmClose').onclick=()=>{$('cartConfirm').hidden=true};
function closeCustomizer(){
 $('customModal').hidden=true;$('customOverlay').hidden=true;
 document.body.style.overflow='';customizeId=null;customizeSource=null;
}
function currentCustomAddons(){
 const chosen=Array.from(document.querySelectorAll('#extraOptionsList [data-addon-choice]')).map(input=>{
  const qty=input.type==='checkbox'?(input.checked?1:0):Number(input.value);
  return {id:Number(input.dataset.addonChoice),qty};
 }).filter(x=>Number.isInteger(x.id)&&Number.isInteger(x.qty)&&x.qty>0);
 if(customizeId==='acai_smoothie'&&document.querySelector('input[name="acaiBanana"]:checked')?.value==='yes'){
  const p=products.find(p=>p.id===customizeId),banana=(p?.addons||[]).find(a=>a.name==='موز');
  if(banana)chosen.push({id:banana.id,qty:1});
 }
 return chosen.sort((a,b)=>a.id-b.id);
}
function updateCustomPrice(){
 const p=products.find(x=>x.id===customizeId);
 if(!p)return;
 const caramel=!$('syrupFieldset').hidden&&document.querySelector('input[name="syrup"]:checked')?.value==='caramel';
 const extras=currentCustomAddons();
 const extraTotal=extras.reduce((total,x)=>{
  const a=(p.addons||[]).find(a=>a.id===x.id);
  return total+(a?a.price_fils*x.qty:0);
 },0);
 $('customItem').textContent=p.name+' · '+money(finalPrice(p)+(caramel?100:0)+extraTotal);
}
function openCustomizer(id,source){
 customizeId=id;customizeSource=source;
 const p=products.find(x=>x.id===id);if(!p)return;
 const isAcai=id==='acai_smoothie';
 const syrupAllowed=!isAcai&&['spanish','icedspanish','latte','icedlatte'].includes(id);
 $('customModal').dataset.product=id;
 $('syrupFieldset').hidden=!syrupAllowed;
 $('customCaramelPrice').hidden=!syrupAllowed;
 $('acaiBananaFieldset').hidden=!isAcai;
 $('customHint').textContent=isAcai?'اختر الأساي بالطريقة اللي تحبها':syrupAllowed?'اختر إضافات مشروبك':'اختر الإضافات التي تريدها مع المشروب';
 document.querySelector('input[name="syrup"][value=""]').checked=true;
 document.querySelector('input[name="acaiBanana"][value="no"]').checked=true;
 const addons=isAcai?(p.addons||[]).filter(a=>a.name==='إكسترا زبدة الفول السوداني'):(p.addons||[]);
 $('extraOptions').querySelector('h3').textContent=isAcai?'زبدة الفول السوداني':'إضافات المشروب';
 $('extraOptions').hidden=!addons.length;
 $('extraOptionsList').innerHTML=addons.map(a=>{
  const choice=a.max_qty===1
   ?'<input type="checkbox" data-addon-choice="'+a.id+'" aria-label="'+esc(a.name)+'">'
   :'<input type="number" data-addon-choice="'+a.id+'" min="0" max="'+a.max_qty+'" step="1" value="0" aria-label="عدد '+esc(a.name)+'">';
  return '<label class="custom-extra-option"><span><strong>'+esc(a.name)+'</strong><small class="'+(isAcai?'acai-price-positive':'')+'">+'+money(a.price_fils)+(isAcai?'':(a.max_qty===1?' · مرة واحدة':' · حد أقصى '+a.max_qty))+'</small></span>'+choice+'</label>';
 }).join('');
 document.querySelectorAll('#extraOptionsList [data-addon-choice]').forEach(input=>input.addEventListener('change',updateCustomPrice));
 document.querySelectorAll('#extraOptionsList input[type=number]').forEach(input=>input.addEventListener('input',updateCustomPrice));
 updateCustomPrice();
 $('customOverlay').hidden=false;$('customModal').hidden=false;
 document.body.style.overflow='hidden';
 $('confirmCustom').focus();
}
function addToCart(id,shots,source,addons=[]){
 const p=products.find(x=>x.id===id);if(!p||!p.available)return;
 const selected=addons.slice().sort((a,b)=>a.id-b.id);
 const suffix=selected.length?'__addons'+selected.map(x=>x.id+'-'+x.qty).join(','):'';
 const key=id+(id!=='acai_smoothie'&&shots?'__caramel1':'')+suffix;
 cart[key]=Math.min(30,(cart[key]||0)+1);
 renderCart();flyToCart(p,source);showCartConfirm(p,shots,source);
}
function add(id,source){
 const product=products.find(p=>p.id===id&&p.available);
 if(!product)return notice('هذا المنتج غير متوفر حالياً');
 if(id==='acai_smoothie'||['spanish','icedspanish','latte','icedlatte'].includes(id)||(product.addons||[]).length)return openCustomizer(id,source);
 addToCart(id,0,source);
}
$('closeCustom').onclick=closeCustomizer;
$('customOverlay').onclick=closeCustomizer;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('customModal').hidden)closeCustomizer()});
document.querySelectorAll('input[name="syrup"]').forEach(r=>r.addEventListener('change',updateCustomPrice));
document.querySelectorAll('input[name="acaiBanana"]').forEach(r=>r.addEventListener('change',updateCustomPrice));
$('confirmCustom').onclick=()=>{
 if(!customizeId)return;
 const syrup=document.querySelector('input[name="syrup"]:checked')?.value||'';
 if(syrup&&syrup!=='caramel')return;
 const id=customizeId,source=customizeSource,shots=syrup==='caramel'&&!$('syrupFieldset').hidden?1:0;
 const selected=currentCustomAddons();
 const p=products.find(x=>x.id===id);
 if(selected.some(x=>{const a=(p?.addons||[]).find(a=>a.id===x.id);return !a||x.qty>a.max_qty})){
  return notice('تأكد من عدد الإضافات المسموح');}
 closeCustomizer();addToCart(id,shots,source,selected);
};
function renderCheckoutNotes(){
 $('checkoutItemNotes').innerHTML=Object.entries(cart).filter(([key,n])=>n>0&&productForKey(key)).map(([key,n])=>{
  const p=productForKey(key);
  return `<div class="checkout-item-note"><b>${esc(p.name)}${syrupForKey(key)?' · + كراميل':''}${extrasForKey(key).length?' · '+esc(extraLabelForKey(key)):''}</b><small class="checkout-qty-summary">الكمية: ${n}</small><label>ملاحظة لهذا المنتج (اختياري)</label><input data-note="${esc(key)}" maxlength="160" value="${esc(cartNotes[key]||'')}" placeholder="مثلاً: بدون سكر، حليب أقل..."></div>`;
 }).join('');
 document.querySelectorAll('#checkoutItemNotes [data-note]').forEach(inp=>inp.addEventListener('input',()=>syncNote(inp)));
}
function syncNote(input){
 const key=input.dataset.note;
 if(!Object.hasOwn(cart,key))return;
 cartNotes[key]=input.value;
 document.querySelectorAll('[data-note]').forEach(other=>{if(other!==input&&other.dataset.note===key)other.value=input.value});
}
function renderCart(){
 const list=Object.entries(cart).filter(([key,n])=>n>0&&productForKey(key));
 $('cartItems').innerHTML=list.length?list.map(([key,n])=>{
 const p=productForKey(key),shots=shotsForKey(key);
 return `<div class="cart-line"><div class="rowcart"><div class="cartPreview"><img src="${esc(img(p))}" alt=""><div><b>${esc(p.name)}</b>${shots?'<small class="cart-syrup">+ كراميل · 1 درهم</small>':''}${extrasForKey(key).length?'<small class="cart-syrup">'+esc(extraLabelForKey(key))+'</small>':''}<p class="cart-qty-label">الكمية</p><div class="controls cart-qty-controls"><button type="button" data-edit="${esc(key)}" data-delta="-1" aria-label="تقليل">−</button><b>${n}</b><button type="button" data-edit="${esc(key)}" data-delta="1" aria-label="زيادة">+</button></div><button type="button" class="removeItem" data-remove="${esc(key)}" aria-label="حذف ${esc(p.name)} من السلة">حذف المنتج</button></div></div><strong class="cart-line-total">${money(unitPrice(key)*n)}</strong></div><div class="cart-item-note"><label>ملاحظة خاصة لهذا المنتج (اختياري)</label><input data-note="${esc(key)}" maxlength="160" value="${esc(cartNotes[key]||'')}" placeholder="مثلاً: بدون سكر، ثلج أقل..."></div>${!p.available?'<div class="cart-unavailable">غير متوفر حالياً، احذف هذا المنتج قبل تأكيد الطلب</div>':''}</div>`;
 }).join(''):'<div class="cartEmpty">سلتك فاضية؛ أضف منتجات من القائمة.</div>';
 $('count').textContent=qty();$('total').textContent=money(sum());$('checkoutTotal').textContent=money(sum());
 $('checkout').disabled=!qty()||!shopOpen||list.some(([key])=>!productForKey(key).available);
 document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
  const key=b.dataset.edit;cart[key]=Math.max(0,Math.min(30,(cart[key]||0)+Number(b.dataset.delta)));
  if(!cart[key]){delete cart[key];delete cartNotes[key]}renderCart();
 });
 document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{delete cart[b.dataset.remove];delete cartNotes[b.dataset.remove];renderCart();notice('تم حذف المنتج من السلة')});
 document.querySelectorAll('#cartItems [data-note]').forEach(inp=>inp.addEventListener('input',()=>syncNote(inp)));
 $('clearCart').hidden=!list.length;
 renderCheckoutNotes();
}
function drawer(open){$('drawer').classList.toggle('show',open);$('overlay').classList.toggle('show',open)}
function step(s){$('cartStep').hidden=s!=='cart';$('checkoutForm').hidden=s!=='checkout';$('successStep').hidden=s!=='success';$('drawerTitle').textContent=s==='cart'?'سلة الطلبات':s==='checkout'?'إتمام الطلب':'الطلب تم استلامه'}
$('cartButton').onclick=()=>{step('cart');drawer(true)};$('clearCart').onclick=()=>{cart={};cartNotes={};renderCart();notice('تم تفريغ السلة')};$('closeCart').onclick=()=>drawer(false);$('overlay').onclick=()=>drawer(false);
$('checkout').onclick=()=>{if(!shopOpen){notice('استقبال الطلبات مغلق حالياً');return}if(!qty()){notice('اختار منتجات أولاً');return}if(Object.keys(cart).some(k=>!productForKey(k)?.available)){notice('في منتج غير متوفر بالسلة، احذفه أولاً');return}renderCheckoutNotes();step('checkout')};
$('goCart').onclick=()=>step('cart');
$('checkoutForm').onsubmit=async e=>{
 e.preventDefault();$('submitOrder').disabled=true;$('checkoutError').textContent='جاري إرسال الطلب...';
 try{
  const payload={customer_name:$('customerName').value.trim(),phone:$('customerPhone').value.trim(),car_plate:$('customerCar').value.trim(),notes:$('customerNotes').value.trim(),items:Object.keys(cart).filter(k=>cart[k]>0).map(key=>({id:key.split('__')[0],qty:cart[key],syrup:syrupForKey(key),syrup_qty:shotsForKey(key),addons:extrasForKey(key),item_note:(cartNotes[key]||'').trim()}))};
  const res=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await res.json();if(!res.ok)throw Error(result.error||'تعذر تسجيل الطلب');
  $('receiptText').textContent=`رقم طلبك #${result.id} — الإجمالي ${money(result.total_fils)}. وصل الطلب إلى شاشة الموظفين.`;
  feedbackToken=result.feedback_token||null;feedbackOrderId=result.id;resetFeedback();rememberPendingReview();
  cart={};cartNotes={};renderCart();step('success');$('drawer').scrollTop=0;
 }catch(err){$('checkoutError').textContent=err.message}finally{$('submitOrder').disabled=false}
};


const REVIEW_KEY='highway67_pending_review_v2';
function pendingReview(){
 try{
  const record=JSON.parse(localStorage.getItem(REVIEW_KEY)||'null');
  if(record&&Number.isInteger(record.id)&&record.id>0&&
     typeof record.token==='string'&&record.token.length>10&&
     Date.now()-record.created<7*24*3600*1000)return record;
  localStorage.removeItem(REVIEW_KEY);
 }catch(e){}
 return null;
}
function rememberPendingReview(){
 if(!feedbackToken||!feedbackOrderId)return;
 try{localStorage.setItem(REVIEW_KEY,JSON.stringify({
  id:feedbackOrderId,token:feedbackToken,created:Date.now()
 }))}catch(e){}
 refreshReviewReminder(true);
}
function clearPendingReview(){
 try{localStorage.removeItem(REVIEW_KEY)}catch(e){}
 refreshReviewReminder(true);
}
function refreshReviewReminder(hiddenForNow=false){
 $('reviewReminder').hidden=hiddenForNow||!pendingReview();
}
function resetFeedback(){
 feedbackRating=null;feedbackReasons.clear();
 $('reviewOptionalIntro').hidden=false;
 $('feedbackCard').hidden=true;$('feedbackReasons').hidden=true;
 $('feedbackComment').value='';$('feedbackError').textContent='';
 $('sendFeedback').disabled=false;$('sendFeedback').textContent='إرسال التقييم';
 document.querySelectorAll('[data-reason],[data-rating]').forEach(b=>{
  b.classList.remove('active');
  if(b.dataset.rating)b.setAttribute('aria-pressed','false');
 });
}
function showRatingForm(){
 if(!feedbackToken||!feedbackOrderId)return;
 $('reviewOptionalIntro').hidden=true;
 $('feedbackCard').hidden=false;
 $('feedbackCard').scrollIntoView?.({block:'nearest',behavior:'smooth'});
}
$('openFeedback').onclick=showRatingForm;
$('resumeReview').onclick=()=>{
 const record=pendingReview();if(!record){refreshReviewReminder();return}
 feedbackToken=record.token;feedbackOrderId=record.id;resetFeedback();
 $('receiptText').textContent='تقييم الطلب السابق #'+record.id;
 step('success');drawer(true);showRatingForm();refreshReviewReminder(true);
};
$('dismissReview').onclick=()=>refreshReviewReminder(true);
document.querySelectorAll('[data-rating]').forEach(button=>button.onclick=()=>{
 feedbackRating=Number(button.dataset.rating);
 $('feedbackReasons').hidden=feedbackRating>6;
 if(feedbackRating>6)feedbackReasons.clear();
 document.querySelectorAll('[data-rating]').forEach(b=>{
  const selected=b===button;
  b.classList.toggle('active',selected);
  b.setAttribute('aria-pressed',String(selected));
 });
 document.querySelectorAll('[data-reason]').forEach(b=>b.classList.toggle('active',feedbackReasons.has(b.dataset.reason)));
});
document.querySelectorAll('[data-reason]').forEach(button=>button.onclick=()=>{
 if(feedbackReasons.has(button.dataset.reason))feedbackReasons.delete(button.dataset.reason);
 else feedbackReasons.add(button.dataset.reason);
 button.classList.toggle('active',feedbackReasons.has(button.dataset.reason));
});
$('skipFeedback').onclick=()=>{
 $('feedbackCard').hidden=true;
 $('reviewOptionalIntro').hidden=false;
 refreshReviewReminder(true);
};
$('sendFeedback').onclick=async()=>{
 if(feedbackRating===null&&!$('feedbackComment').value.trim()){
  $('feedbackError').textContent='اختر رقم من 1 إلى 10 أو اكتب ملاحظة، أو اختر لاحقاً';return
 }
 if(!feedbackToken||!feedbackOrderId){
  $('feedbackError').textContent='تعذر التحقق من الطلب';return
 }
 $('sendFeedback').disabled=true;$('feedbackError').textContent='';
 try{
  const res=await fetch('/api/feedback',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({order_id:feedbackOrderId,feedback_token:feedbackToken,
    rating_score:feedbackRating,
    liked:feedbackRating===null?null:feedbackRating>=7,
    reasons:feedbackRating!==null&&feedbackRating<=6?[...feedbackReasons]:[],
    service_score:null,comment:$('feedbackComment').value.trim()})
  });
  const data=await res.json();
  if(!res.ok)throw Error(data.error||'تعذر حفظ التقييم');
  $('feedbackCard').hidden=true;
  $('reviewOptionalIntro').hidden=true;
  $('receiptText').textContent='تم تسجيل تقييم الطلب #'+feedbackOrderId+'، شكراً على رأيك.';
  feedbackToken=null;
  clearPendingReview();
  notice('تم تسجيل تقييمك. شكراً لك');
 }catch(err){
  $('feedbackError').textContent=err.message;
  $('sendFeedback').disabled=false;
  if(err.message.includes('بالفعل')||err.message.includes('غير صالح')){feedbackToken=null;clearPendingReview()}
 }
};

$('newOrder').onclick=()=>{step('cart');drawer(false);$('checkoutForm').reset();window.scrollTo({top:0,behavior:'smooth'})};
$('searchButton').onclick=()=>{$('searchbox').classList.toggle('visible');$('searchButton').setAttribute('aria-expanded',$('searchbox').classList.contains('visible'));if($('searchbox').classList.contains('visible'))$('searchInput').focus();else{$('searchInput').value='';search='';renderCards()}};
$('searchInput').addEventListener('input',e=>{search=normalized(e.target.value);renderCards()});
$('searchInput').addEventListener('keydown',e=>{if(e.key==='Escape'){$('searchbox').classList.remove('visible');$('searchInput').value='';search='';renderCards()}});
document.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{selection=b.dataset.cat;document.querySelectorAll('[data-cat]').forEach(x=>x.classList.toggle('active',x===b));renderCards()});
function changeBanner(v){banner=(banner+v+3)%3;$('hero').classList.toggle('active-alt',banner>0);$('hero').querySelectorAll('.dots span').forEach((x,i)=>x.style.backgroundColor=i===banner?'#d6a352':'#fff')}
$('prevBanner').onclick=()=>changeBanner(-1);$('nextBanner').onclick=()=>changeBanner(1);
function remaining(iso){let sec=Math.max(0,Math.floor((Date.parse(iso)-Date.now())/1000));if(sec<=0)return 'انتهى العرض';let h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return (h>0?h+' ساعة و ':'')+m+' دقيقة و '+String(s).padStart(2,'0')+' ثانية'}
function renderAcaiHero(){
 const offer=promotions.find(p=>p.product_id==='acai_smoothie'&&Date.parse(p.expires_at)>Date.now());
 const panel=$('acaiHero');
 panel.hidden=!offer;
 if(offer){
  $('hero').classList.remove('active-alt');
  const sec=Math.max(0,Math.floor((Date.parse(offer.expires_at)-Date.now())/1000));
  $('acaiHeroTimer').textContent=[Math.floor(sec/3600),Math.floor(sec%3600/60),sec%60].map(n=>String(n).padStart(2,'0')).join(':');
 }
}
function renderPromos(){
 renderAcaiHero();
 const active=promotions.filter(p=>Date.parse(p.expires_at)>Date.now()&&p.product_id!=='acai_smoothie');
 $('offers').hidden=!active.length;
 $('offers').innerHTML=active.map(p=>`<article class="promoCard"><img src="${esc('/assets/'+p.image)}" alt=""><div><strong><svg class="spark" viewBox="0 0 24 24"><path d="m12 2 2.4 6.7 7 2-7 2.5L12 20l-2.5-6.8-7-2.5 7-2z"/></svg>${esc(p.title)}</strong><p>${esc(p.subtitle||'عرض خاص لمدة محدودة')}</p><div class="timer" data-until="${esc(p.expires_at)}">باقي ${remaining(p.expires_at)}</div><button type="button" data-offer="${esc(p.product_id)}" class="promoCta">شاهد المنتج</button></div></article>`).join('');
 document.querySelectorAll('[data-offer]').forEach(b=>b.onclick=()=>{selection='all';document.querySelectorAll('[data-cat]').forEach(x=>x.classList.toggle('active',x.dataset.cat==='all'));search='';$('searchInput').value='';renderCards();const item=document.querySelector('[data-add="'+b.dataset.offer+'"]');if(item){item.closest('.product').scrollIntoView({behavior:'smooth',block:'center'});item.closest('.product').style.boxShadow='0 0 0 3px #c49b6c';setTimeout(()=>item.closest('.product')&&(item.closest('.product').style.boxShadow=''),2000)}});
}
async function refreshShift(){try{const res=await fetch('/api/shift',{cache:'no-store'});if(!res.ok)throw Error();const s=await res.json();const previousOpen=shopOpen;shopOpen=Boolean(s.open&&s.orders_enabled);$('storeStatus').textContent=shopOpen?'المقهى يستقبل الطلبات الآن — الدفع عند الاستلام':'استقبال الطلبات متوقف حالياً؛ تقدر تتصفح القائمة';if(previousOpen!==shopOpen)renderCart()}catch{$('storeStatus').textContent='تعذر التحقق من حالة استقبال الطلبات'}}
async function load(){try{const r=await fetch('/api/products',{cache:'no-store'});if(!r.ok)throw Error();const result=await r.json();const fresh=result.products||[];
  const oldProducts=JSON.stringify(products.map(p=>[p.id,p.available,p.price_fils,p.final_price_fils,p.name,p.image]));
  const newProducts=JSON.stringify(fresh.map(p=>[p.id,p.available,p.price_fils,p.final_price_fils,p.name,p.image]));
  products=fresh;promotions=result.promotions||[];
  if(oldProducts!==newProducts){renderCards();renderCart()}
  renderPromos();await refreshShift()}catch(err){$('sections').innerHTML='<p class="blank">تعذر تحميل المنتجات. حدّث الصفحة وحاول مرة ثانية.</p>'}}
setInterval(()=>{renderAcaiHero();document.querySelectorAll('[data-until]').forEach(x=>x.textContent='باقي '+remaining(x.dataset.until));if(promotions.some(p=>Date.parse(p.expires_at)<=Date.now())){promotions=promotions.filter(p=>Date.parse(p.expires_at)>Date.now());renderPromos()}},1000);
setInterval(refreshShift,15000);setInterval(load,20000);refreshReviewReminder();load();