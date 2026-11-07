'use strict';
const $=id=>document.getElementById(id);
let products=[],promotions=[],selection='all',search='',cart={},shopOpen=false,banner=0;
let customizeId=null,customizeSource=null,feedbackToken=null,feedbackOrderId=null,feedbackLiked=null,feedbackStars=null,feedbackReasons=new Set();
const groups=[['Hot Drinks','المشروبات الساخنة','i-cup'],['Cold Drinks','المشروبات الباردة','i-cold'],['Croissants','الكرواسون','i-crois'],['Desserts','الحلويات','i-crois'],['Other','أخرى','i-all']];
function money(fils){return (Number(fils||0)/100).toFixed(2).replace(/\.00$/,'')+' AED'}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function normalized(s){return String(s||'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/[ً-ْ]/g,'').trim()}
function img(p){return '/assets/'+String(p.image||'hot.webp').split('/').map(encodeURIComponent).join('/')}
function finalPrice(p){return Number(p.final_price_fils!=null?p.final_price_fils:p.price_fils)}
function notice(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(notice.t);notice.t=setTimeout(()=>$('toast').classList.remove('show'),2400)}
function qty(){return Object.values(cart).reduce((a,n)=>a+n,0)}
function productForKey(key){return products.find(p=>p.id===key.split('__')[0])}
function syrupForKey(key){return key.endsWith('__caramel')?'caramel':''}
function sum(){return Object.entries(cart).reduce((total,[key,n])=>{const p=productForKey(key);return total+(p?finalPrice(p)*n:0)},0)}
function renderCards(){
 const sections=groups.filter(([id])=>selection==='all'||selection===id).map(([id,label,icon])=>{
 const matches=products.filter(p=>p.category===id&&p.available&&normalized(p.name+' '+p.id+' '+id+' '+(window.highway67Language ? window.highway67Language.productName(p.name) : '')).includes(search));
 if(!matches.length)return '';
 const cards=matches.map(p=>{
 const disc=Number(p.effective_discount||0),sale=disc>0;
 return `<article class="product ${id==='Croissants'?'pastry':''}">${sale?`<span class="discountTag">خصم ${disc}%</span>`:''}<div class="photo"><img loading="lazy" src="${esc(img(p))}" alt="${esc(p.name)}"></div><div class="details"><div class="pname">${esc(p.name)}</div><div class="pricegroup">${sale?`<del class="oldprice">${money(p.price_fils)}</del>`:''}<span class="price ${sale?'saleprice':''}">${money(finalPrice(p))}</span></div><button type="button" class="add" data-add="${esc(p.id)}">+ إضافة</button></div></article>`}).join('');
 return `<section class="category" id="cat-${id.replace(/ /g,'-')}"><h2><svg><use href="#${icon}"/></svg>${label}</h2><div class="products ${id==='Croissants'?'pastries':''}">${cards}</div></section>`}).join('');
 $('sections').innerHTML=sections||'<p class="blank">ما حصلنا منتجات بهالبحث</p>';
 document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>add(b.dataset.add,b));
}

function flyToCart(p,source){
 const target=$('cartButton');
 if(!source||!target)return;
 const image=source.closest('.product')?.querySelector('.photo img');
 if(!image)return;
 if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches){
  target.classList.remove('cart-pop');void target.offsetWidth;target.classList.add('cart-pop');return;
 }
 const start=image.getBoundingClientRect(),end=target.getBoundingClientRect();
 const clone=document.createElement('img');
 clone.src=img(p);clone.alt='';clone.className='fly-to-cart';
 clone.style.cssText+=';top:'+start.top+'px;left:'+start.left+'px;width:'+Math.min(start.width,85)+'px;height:'+Math.min(start.height,85)+'px';
 document.body.appendChild(clone);
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  const dx=end.left+end.width/2-(start.left+Math.min(start.width,85)/2);
  const dy=end.top+end.height/2-(start.top+Math.min(start.height,85)/2);
  clone.style.transform='translate('+dx+'px,'+dy+'px) scale(.18)';
  clone.style.opacity='0.08';
 }));
 setTimeout(()=>{
  clone.remove();
  target.classList.remove('cart-pop');void target.offsetWidth;target.classList.add('cart-pop');
 },680);
}
function closeCustomizer(){
 $('customModal').hidden=true;$('customOverlay').hidden=true;
 document.body.style.overflow='';customizeId=null;customizeSource=null;
}
function openCustomizer(id,source){
 customizeId=id;customizeSource=source;
 const p=products.find(x=>x.id===id);if(!p)return;
 $('customItem').textContent=p.name+' · '+money(finalPrice(p));
 document.querySelector('input[name="syrup"][value=""]').checked=true;
 $('customOverlay').hidden=false;$('customModal').hidden=false;
 document.body.style.overflow='hidden';
 $('confirmCustom').focus();
}
function addToCart(id,syrup,source){
 const p=products.find(x=>x.id===id);if(!p)return;
 const key=id+(syrup?'__'+syrup:'');
 cart[key]=Math.min(30,(cart[key]||0)+1);
 renderCart();flyToCart(p,source);
 notice('تمت إضافة '+p.name+(syrup?' · كراميل':'')+' إلى السلة');
}
function add(id,source){
 if(id==='spanish'||id==='icedspanish')return openCustomizer(id,source);
 addToCart(id,'',source);
}
$('closeCustom').onclick=closeCustomizer;
$('customOverlay').onclick=closeCustomizer;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('customModal').hidden)closeCustomizer()});
$('confirmCustom').onclick=()=>{
 if(!customizeId)return;
 const syrup=document.querySelector('input[name="syrup"]:checked')?.value||'';
 if(syrup&&syrup!=='caramel')return;
 const id=customizeId,source=customizeSource;
 closeCustomizer();addToCart(id,syrup,source);
};
function renderCart(){
 const list=Object.entries(cart).filter(([key,n])=>n>0&&productForKey(key));
 $('cartItems').innerHTML=list.length?list.map(([key,n])=>{
 const p=productForKey(key),syrup=syrupForKey(key);
 return `<div class="rowcart"><div class="cartPreview"><img src="${esc(img(p))}" alt=""><div><b>${esc(p.name)}</b>${syrup?'<small class="cart-syrup">+ كراميل</small>':''}<p>${money(finalPrice(p))} × ${n}</p><button type="button" class="removeItem" data-remove="${esc(key)}" aria-label="حذف ${esc(p.name)} من السلة">حذف المنتج</button></div></div><div class="controls"><button type="button" data-edit="${esc(key)}" data-delta="-1" aria-label="تقليل">−</button><b>${n}</b><button type="button" data-edit="${esc(key)}" data-delta="1" aria-label="زيادة">+</button></div></div>`;
 }).join(''):'<div class="cartEmpty">سلتك فاضية؛ أضف منتجات من القائمة.</div>';
 $('count').textContent=qty();$('total').textContent=money(sum());$('checkoutTotal').textContent=money(sum());
 $('checkout').disabled=!qty()||!shopOpen;
 document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
  const key=b.dataset.edit;cart[key]=Math.max(0,Math.min(30,(cart[key]||0)+Number(b.dataset.delta)));
  if(!cart[key])delete cart[key];renderCart();
 });
 document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{delete cart[b.dataset.remove];renderCart();notice('تم حذف المنتج من السلة')});
 $('clearCart').hidden=!list.length;
}
function drawer(open){$('drawer').classList.toggle('show',open);$('overlay').classList.toggle('show',open)}
function step(s){$('cartStep').hidden=s!=='cart';$('checkoutForm').hidden=s!=='checkout';$('successStep').hidden=s!=='success';$('drawerTitle').textContent=s==='cart'?'سلة الطلبات':s==='checkout'?'إتمام الطلب':'الطلب تم استلامه'}
$('cartButton').onclick=()=>{step('cart');drawer(true)};$('clearCart').onclick=()=>{cart={};renderCart();notice('تم تفريغ السلة')};$('closeCart').onclick=()=>drawer(false);$('overlay').onclick=()=>drawer(false);
$('checkout').onclick=()=>{if(!shopOpen){notice('استقبال الطلبات مغلق حالياً');return}if(!qty()){notice('اختار منتجات أولاً');return}step('checkout')};
$('goCart').onclick=()=>step('cart');
$('checkoutForm').onsubmit=async e=>{
 e.preventDefault();$('submitOrder').disabled=true;$('checkoutError').textContent='جاري إرسال الطلب...';
 try{
  const payload={customer_name:$('customerName').value.trim(),phone:$('customerPhone').value.trim(),car_plate:$('customerCar').value.trim(),notes:$('customerNotes').value.trim(),items:Object.keys(cart).filter(k=>cart[k]>0).map(key=>({id:key.split('__')[0],qty:cart[key],syrup:syrupForKey(key)}))};
  const res=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await res.json();if(!res.ok)throw Error(result.error||'تعذر تسجيل الطلب');
  $('receiptText').textContent=`رقم طلبك #${result.id} — الإجمالي ${money(result.total_fils)}. وصل الطلب إلى شاشة الموظفين.`;
  feedbackToken=result.feedback_token||null;feedbackOrderId=result.id;resetFeedback();
  cart={};renderCart();step('success');$('drawer').scrollTop=0;
 }catch(err){$('checkoutError').textContent=err.message}finally{$('submitOrder').disabled=false}
};

function resetFeedback(){
 feedbackLiked=null;feedbackStars=null;feedbackReasons.clear();
 $('feedbackCard').hidden=false;$('feedbackReasons').hidden=true;$('feedbackComment').value='';$('feedbackError').textContent='';
 $('sendFeedback').disabled=false;$('sendFeedback').textContent='إرسال التقييم 💛';
 document.querySelectorAll('[data-liked],[data-reason],[data-star]').forEach(b=>b.classList.remove('active'));
}
document.querySelectorAll('[data-liked]').forEach(b=>b.onclick=()=>{
 feedbackLiked=b.dataset.liked==='yes';
 $('feedbackReasons').hidden=feedbackLiked;
 if(feedbackLiked)feedbackReasons.clear();
 document.querySelectorAll('[data-liked]').forEach(x=>x.classList.toggle('active',x===b));
 document.querySelectorAll('[data-reason]').forEach(x=>x.classList.toggle('active',feedbackReasons.has(x.dataset.reason)));
});
document.querySelectorAll('[data-reason]').forEach(b=>b.onclick=()=>{
 if(feedbackReasons.has(b.dataset.reason))feedbackReasons.delete(b.dataset.reason);
 else feedbackReasons.add(b.dataset.reason);
 b.classList.toggle('active',feedbackReasons.has(b.dataset.reason));
});
document.querySelectorAll('[data-star]').forEach(b=>b.onclick=()=>{
 feedbackStars=Number(b.dataset.star);
 document.querySelectorAll('[data-star]').forEach(x=>x.classList.toggle('active',Number(x.dataset.star)<=feedbackStars));
});
$('skipFeedback').onclick=()=>{$('feedbackCard').hidden=true};
$('sendFeedback').onclick=async()=>{
 if(feedbackLiked===null&&feedbackStars===null&&!$('feedbackComment').value.trim()){
  $('feedbackError').textContent='اختر تقييم واحد على الأقل أو اضغط يمكن مرة ثانية';return;
 }
 if(!feedbackToken||!feedbackOrderId){$('feedbackError').textContent='تعذر التحقق من رقم الطلب';return}
 $('sendFeedback').disabled=true;$('feedbackError').textContent='';
 try{
  const res=await fetch('/api/feedback',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({order_id:feedbackOrderId,feedback_token:feedbackToken,
    liked:feedbackLiked,reasons:[...feedbackReasons],service_score:feedbackStars,comment:$('feedbackComment').value.trim()})
  });
  const data=await res.json();
  if(!res.ok)throw Error(data.error||'تعذر حفظ التقييم');
  $('feedbackCard').hidden=true;
  notice('💛 شكراً من القلب! تقييمك وصلنا');
  feedbackToken=null;
 }catch(err){$('feedbackError').textContent=err.message;$('sendFeedback').disabled=false}
};

$('newOrder').onclick=()=>{step('cart');drawer(false);$('checkoutForm').reset();window.scrollTo({top:0,behavior:'smooth'})};
$('searchButton').onclick=()=>{$('searchbox').classList.toggle('visible');$('searchButton').setAttribute('aria-expanded',$('searchbox').classList.contains('visible'));if($('searchbox').classList.contains('visible'))$('searchInput').focus();else{$('searchInput').value='';search='';renderCards()}};
$('searchInput').addEventListener('input',e=>{search=normalized(e.target.value);renderCards()});
$('searchInput').addEventListener('keydown',e=>{if(e.key==='Escape'){$('searchbox').classList.remove('visible');$('searchInput').value='';search='';renderCards()}});
document.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{selection=b.dataset.cat;document.querySelectorAll('[data-cat]').forEach(x=>x.classList.toggle('active',x===b));renderCards()});
function changeBanner(v){banner=(banner+v+3)%3;$('hero').classList.toggle('active-alt',banner>0);$('hero').querySelectorAll('.dots span').forEach((x,i)=>x.style.backgroundColor=i===banner?'#d6a352':'#fff')}
$('prevBanner').onclick=()=>changeBanner(-1);$('nextBanner').onclick=()=>changeBanner(1);
function remaining(iso){let sec=Math.max(0,Math.floor((Date.parse(iso)-Date.now())/1000));if(sec<=0)return 'انتهى العرض';let h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return (h>0?h+' ساعة و ':'')+m+' دقيقة و '+String(s).padStart(2,'0')+' ثانية'}
function renderPromos(){
 const active=promotions.filter(p=>Date.parse(p.expires_at)>Date.now());
 $('offers').hidden=!active.length;
 $('offers').innerHTML=active.map(p=>`<article class="promoCard"><img src="${esc('/assets/'+p.image)}" alt=""><div><strong><svg class="spark" viewBox="0 0 24 24"><path d="m12 2 2.4 6.7 7 2-7 2.5L12 20l-2.5-6.8-7-2.5 7-2z"/></svg>${esc(p.title)}</strong><p>${esc(p.subtitle||'عرض خاص لمدة محدودة')}</p><div class="timer" data-until="${esc(p.expires_at)}">باقي ${remaining(p.expires_at)}</div><button type="button" data-offer="${esc(p.product_id)}" class="promoCta">شاهد المنتج</button></div></article>`).join('');
 document.querySelectorAll('[data-offer]').forEach(b=>b.onclick=()=>{selection='all';document.querySelectorAll('[data-cat]').forEach(x=>x.classList.toggle('active',x.dataset.cat==='all'));search='';$('searchInput').value='';renderCards();const item=document.querySelector('[data-add="'+b.dataset.offer+'"]');if(item){item.closest('.product').scrollIntoView({behavior:'smooth',block:'center'});item.closest('.product').style.boxShadow='0 0 0 3px #c49b6c';setTimeout(()=>item.closest('.product')&&(item.closest('.product').style.boxShadow=''),2000)}});
}
async function refreshShift(){try{const res=await fetch('/api/shift',{cache:'no-store'});if(!res.ok)throw Error();const s=await res.json();shopOpen=Boolean(s.open&&s.orders_enabled);$('storeStatus').textContent=shopOpen?'المقهى يستقبل الطلبات الآن — الدفع عند الاستلام':'استقبال الطلبات متوقف حالياً؛ تقدر تتصفح القائمة';renderCart()}catch{$('storeStatus').textContent='تعذر التحقق من حالة استقبال الطلبات'}}
async function load(){try{const r=await fetch('/api/products',{cache:'no-store'});if(!r.ok)throw Error();const result=await r.json();products=result.products||[];promotions=result.promotions||[];renderCards();renderCart();renderPromos();await refreshShift()}catch(err){$('sections').innerHTML='<p class="blank">تعذر تحميل المنتجات. حدّث الصفحة وحاول مرة ثانية.</p>'}}
setInterval(()=>{document.querySelectorAll('[data-until]').forEach(x=>x.textContent='باقي '+remaining(x.dataset.until));if(promotions.some(p=>Date.parse(p.expires_at)<=Date.now())){promotions=promotions.filter(p=>Date.parse(p.expires_at)>Date.now());renderPromos()}},1000);
setInterval(refreshShift,15000);setInterval(load,60000);load();