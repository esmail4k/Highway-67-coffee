'use strict';
let data=null,selectedPage='live',selectedState='all',loadedShift=null,updating=false;
function loginVisible(yes){$('loginScreen').classList.toggle('hidden',!yes);$('dashboard').classList.toggle('hidden',yes);$('logout').classList.toggle('hidden',yes)}
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginError').textContent='';$('loginBtn').disabled=true;try{await api('/api/staff/login','POST',{username:$('username').value,password:$('password').value});$('password').value='';loginVisible(false);await refresh()}catch(err){$('loginError').textContent=err.message}finally{$('loginBtn').disabled=false}};
$('logout').onclick=async()=>{await api('/api/staff/logout','POST',{}).catch(()=>{});data=null;loginVisible(true)};
async function boot(){try{const r=await api('/api/staff/session');loginVisible(!r.authenticated);if(r.authenticated)await refresh()}catch{loginVisible(true)}}
async function refresh(){if(updating||!$('loginScreen').classList.contains('hidden'))return;updating=true;try{let latest=await api('/api/staff/overview');if(data){const before=new Set((data.orders||[]).map(x=>x.id));const added=(latest.orders||[]).filter(x=>!before.has(x.id));$('refreshLabel').textContent=added.length?`وصل ${added.length} طلب جديد`:'تحديث تلقائي كل 5 ثوانٍ'}data=latest;render()}catch(e){if(e.message.includes('دخول'))loginVisible(true);else $('refreshLabel').textContent=e.message}finally{updating=false}}
function render(){if(!data)return;const s=data.shift;
 $('shiftStatus').textContent=s?'الوردية #'+s.id+' مفتوحة':'اليوم مغلق — ابدأ يوماً جديداً';$('shiftStatus').classList.toggle('on',!!s);
 $('startBtn').classList.toggle('hidden',!!s);$('endBtn').classList.toggle('hidden',!s);
 $('stats').innerHTML=summaryCards(data);const visible=data.orders.filter(o=>selectedState==='all'||o.status===selectedState).sort((a,b)=>({new:0,ready:1,delivered:2}[a.status]-{new:0,ready:1,delivered:2}[b.status])||b.id-a.id);
 $('orders').innerHTML=visible.length?visible.map(o=>bill(o,true)).join(''):'<div class="empty">لا توجد طلبات في هذه الوردية بعد.</div>';
 document.querySelectorAll('[data-order]').forEach(b=>b.onclick=()=>advance(Number(b.dataset.order),b.dataset.status));
 $('top').innerHTML=topProducts(data);$('detail').innerHTML=`<div class="kpirow"><span>رقم الوردية</span><b>${s?'#'+s.id:'—'}</b></div><div class="kpirow"><span>طلبات جاهزة</span><b>${data.counts.ready}</b></div><div class="kpirow"><span>طلبات مُسلّمة</span><b>${data.counts.delivered}</b></div><div class="kpirow"><span>صافي مبيعات الوردية</span><b>${fmt(data.sales_fils)}</b></div>`;
 $('archive').innerHTML=(data.shifts||[]).filter(x=>x.ended_at).length?data.shifts.filter(x=>x.ended_at).map(s=>`<article class="shift"><div><strong>${shiftName(s)}</strong><p>انتهى: ${when(s.ended_at)} | ${s.order_count} طلب | ${fmt(s.sales_fils)}</p></div><div class="actions"><button class="button outline sm" data-viewshift="${s.id}">عرض وتعديل</button><button class="button light sm" data-hideshift="${s.id}">إخفاء</button></div></article>`).join(''):'<div class="empty">لا توجد أيام سابقة ظاهرة لك.</div>';
 document.querySelectorAll('[data-viewshift]').forEach(b=>b.onclick=()=>openShift(Number(b.dataset.viewshift)));
 document.querySelectorAll('[data-hideshift]').forEach(b=>b.onclick=()=>hideShift(Number(b.dataset.hideshift),b));
}
async function advance(id,state){try{await api(`/api/staff/orders/${id}/status`,'POST',{status:state});await refresh()}catch(e){alert(e.message)}}
function showLive(){selectedPage='live';selectedState='all';document.querySelectorAll('[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page==='live'));document.querySelectorAll('[data-state]').forEach(x=>x.classList.toggle('active',x.dataset.state==='all'));$('livePage').classList.remove('hidden');$('archivePage').classList.add('hidden')}
$('startBtn').onclick=async()=>{try{await api('/api/staff/shift/start','POST',{});showLive();await refresh()}catch(e){alert(e.message)}};
$('endBtn').onclick=async()=>{const b=$('endBtn');b.disabled=true;try{
 const forced=b.dataset.force==='yes';await api('/api/staff/shift/end','POST',{force_cancel_pending:forced});
 b.dataset.force='';b.textContent='إنهاء اليوم';b.classList.remove('red');showLive();data=null;await refresh();
 }catch(e){
 if(e.pending_count){b.dataset.force='yes';b.textContent='تأكيد الإنهاء وإلغاء '+e.pending_count+' طلب';b.classList.add('red');$('refreshLabel').textContent=e.message;}
 else{alert(e.message)}
 }finally{b.disabled=false}};
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{selectedPage=b.dataset.page;document.querySelectorAll('[data-page]').forEach(x=>x.classList.toggle('active',x===b));$('livePage').classList.toggle('hidden',selectedPage!=='live');$('archivePage').classList.toggle('hidden',selectedPage!=='archive');render()});
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
setInterval(()=>refresh(),5000);boot();