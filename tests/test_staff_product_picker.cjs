'use strict';
// Browser-like regression for the full staff invoice product picker.
// It never connects to the real cafe: all HTTP requests are intercepted.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

const markup=fs.readFileSync('static/staff.html','utf8');
const dom=new JSDOM(markup,{
 url:'http://localhost/staff',
 pretendToBeVisual:true,
 runScripts:'outside-only'
});
const {window}=dom,document=window.document;
window.setInterval=()=>0; // No background polling in the test.
window.alert=message=>{throw Error('Unexpected alert: '+message)};
window.confirm=()=>true;
let requests=[],shiftOpen=true,cancelled=false;
let order={
 id:17,status:'new',created_at:'2026-11-10T07:00:00Z',
 customer_name:'Test Guest',phone:'0500000000',car_plate:'123',
 notes:'',total_fils:1000,items:[
  {id:1,product_id:'espresso',name:'إسبريسو',image:'hot.webp',qty:1,price_fils:1000,original_fils:1000,syrup:'',item_note:'',addons:[]}
 ]
};
const acai={
 id:'acai_smoothie',name:'سموذي أساي',category:'Cold Drinks',
 available:1,price_fils:2000,final_price_fils:1500,image:'acai-original-white.jpg',
 addons:[{id:9,name:'إكسترا زبدة الفول السوداني',price_fils:200,max_qty:1},{id:10,name:'موز',price_fils:200,max_qty:1}]
};
window.fetch=async function(path,options={}){
 const method=options.method||'GET';
 requests.push({path,method,body:options.body?JSON.parse(options.body):null});
 let data,status=200;
 if(path==='/api/staff/session')data={authenticated:true};
 else if(path==='/api/shift')data={open:shiftOpen,orders_enabled:true};
 else if(path==='/api/staff/overview')data={
  shift:shiftOpen?{id:1,local_date:'2026-11-10',ended_at:null}:null,
  counts:{new:!cancelled&&shiftOpen?1:0,ready:0,delivered:0,cancelled:0},
  sales_fils:0,total_orders:cancelled?0:1,orders:cancelled?[]:[order],top_products:[]
 };
 else if(path==='/api/staff/orders/17/delete'&&method==='POST'){
  const body=JSON.parse(options.body);
  if(body.confirmation!=='DELETE 17')throw Error('Invalid cancellation proof');
  cancelled=true;data={ok:true};
 }
 else if(path==='/api/staff/shift/end'&&method==='POST'){shiftOpen=false;data={ok:true};}
 else if(path==='/api/staff/shift/start'&&method==='POST'){shiftOpen=true;data={ok:true};}
 else if(path==='/api/products')data={products:[acai],promotions:[]};
 else if(path==='/api/staff/orders/17/items/add'&&method==='POST'){
  const body=JSON.parse(options.body);
  const addOnCost=(body.addons||[]).reduce((n,x)=>n+([9,10].includes(x.id)?200*x.qty:0),0);
  const price=1500+addOnCost;
  order.items.push({id:2,product_id:body.product_id,name:acai.name,
   image:acai.image,qty:body.qty,price_fils:price,original_fils:2000,
   syrup:'',item_note:'',addons:[{id:9,name:'إكسترا زبدة الفول السوداني',qty:1,price_fils:200},{id:10,name:'موز',qty:1,price_fils:200}]});
  order.total_fils+=price*body.qty;
  data={ok:true,total_fils:order.total_fils};
 }else{status=404;data={error:'Unexpected test API route: '+method+' '+path}};
 return {ok:status<400,status,json:async()=>data};
};

function waitUntil(check,timeout=2000){
 return new Promise((resolve,reject)=>{
  const started=Date.now();
  function retry(){
   if(check())return resolve();
   if(Date.now()-started>timeout)return reject(Error('Timed out waiting for the picker'));
   setTimeout(retry,10);
  }
  retry();
 });
}
async function main(){
 window.eval(fs.readFileSync('static/admin-common.js','utf8')+'\n'+
             fs.readFileSync('static/staff.js','utf8'));
 await waitUntil(()=>document.querySelector('[data-add-item="17"]'));
 const addButton=document.querySelector('[data-add-item="17"]');
 assert.match(addButton.textContent,/إضافة منتج/);
 addButton.click();
 await waitUntil(()=>document.querySelector('[data-invoice-product="acai_smoothie"]'));
 assert.equal(document.getElementById('addItemModal').classList.contains('show'),true);
 let listed=document.querySelector('[data-invoice-product="acai_smoothie"]');
 assert.ok(listed.querySelector('img'));
 assert.match(listed.textContent,/سموذي أساي/);
 assert.match(listed.textContent,/15 AED/);
 const search=document.getElementById('addItemSearch');
 search.value='ACAI SMOOTHIE';
 search.dispatchEvent(new window.Event('input',{bubbles:true}));
 listed=document.querySelector('[data-invoice-product="acai_smoothie"]');
 assert.ok(listed,'English name/ID should match the Arabic product');
 search.value='أساي';
 search.dispatchEvent(new window.Event('input',{bubbles:true}));
 listed=document.querySelector('[data-invoice-product="acai_smoothie"]');
 assert.ok(listed);
 listed.click();
 assert.equal(document.getElementById('saveAddItem').disabled,false);
 assert.ok(document.getElementById('addItemSelection').querySelector('img'));
 document.getElementById('addItemPlus').click();
 assert.equal(document.getElementById('addItemQuantity').value,'2');
 const peanut=document.querySelector('[data-invoice-addon="9"]');
 assert.ok(peanut,'Owner-defined product extras should be shown');
 peanut.checked=true;
 peanut.dispatchEvent(new window.Event('change',{bubbles:true}));
 const banana=document.querySelector('input[type="radio"][name="invoiceBanana"][data-invoice-addon="10"]');
 assert.ok(banana,'Banana must be selectable as Yes/No for acai');
 banana.click();
 assert.match(document.getElementById('addItemSubtotal').textContent,/38 AED/);
 document.getElementById('addItemForm').dispatchEvent(
  new window.Event('submit',{bubbles:true,cancelable:true})
 );
 await waitUntil(()=>requests.some(r=>r.path==='/api/staff/orders/17/items/add'));
 const sent=requests.find(r=>r.path==='/api/staff/orders/17/items/add');
 assert.deepEqual(JSON.parse(JSON.stringify(sent.body)),{
  product_id:'acai_smoothie',qty:2,addons:[{id:9,qty:1},{id:10,qty:1}]
 });
 await waitUntil(()=>document.getElementById('addItemModal').classList.contains('show')===false);
 await waitUntil(()=>document.querySelector('#orders .billtotal')?.textContent.includes('48 AED'));
 assert.equal(order.total_fils,4800);
 // Cancel should NEVER send a request after choosing No.
 let cancel=document.querySelector('[data-delete-staff-order="17"]');
 assert.ok(cancel);
 cancel.click();
 assert.equal(document.getElementById('staffConfirmModal').classList.contains('show'),true);
 assert.equal(document.getElementById('staffConfirmYes').textContent,'نعم، إلغاء الفاتورة');
 document.getElementById('staffConfirmNo').click();
 assert.equal(requests.filter(x=>x.path==='/api/staff/orders/17/delete').length,0);
 assert.equal(cancelled,false);
 // Confirm Yes sends the actual cancellation request.
 cancel=document.querySelector('[data-delete-staff-order="17"]');
 cancel.click();
 document.getElementById('staffConfirmYes').click();
 await waitUntil(()=>cancelled);
 await waitUntil(()=>document.getElementById('orders').textContent.includes('لا توجد طلبات'));
 assert.equal(requests.filter(x=>x.path==='/api/staff/orders/17/delete').length,1);
 // Ending the shift also requires explicit yes.
 document.getElementById('endBtn').click();
 await waitUntil(()=>document.getElementById('staffConfirmModal').classList.contains('show'));
 document.getElementById('staffConfirmNo').click();
 assert.equal(shiftOpen,true);
 assert.equal(requests.filter(x=>x.path==='/api/staff/shift/end').length,0);
 document.getElementById('endBtn').click();
 document.getElementById('staffConfirmYes').click();
 await waitUntil(()=>!shiftOpen);
 await waitUntil(()=>document.getElementById('startBtn').classList.contains('hidden')===false);
 document.getElementById('startBtn').click();
 await waitUntil(()=>document.getElementById('staffConfirmModal').classList.contains('show'));
 document.getElementById('staffConfirmYes').click();
 await waitUntil(()=>shiftOpen);
 console.log('Staff product picker, cancel/confirm and start/end shift passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
