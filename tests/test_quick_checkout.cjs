'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync('static/index.html','utf8');
const dom=new JSDOM(html,{url:'http://localhost/',pretendToBeVisual:true,runScripts:'outside-only'});
const {window:w}=dom,doc=w.document;
w.setInterval=()=>0;
w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};
const requestLog=[];
const product={id:'espresso',name:'إسبريسو',category:'Hot Drinks',available:1,
 price_fils:1200,final_price_fils:1200,image:'hot.webp',addons:[]};
w.fetch=async(path,opts={})=>{
 const body=opts.body?JSON.parse(opts.body):null;
 requestLog.push({path,body});
 let data,status=200;
 if(path==='/api/products')data={products:[product],promotions:[]};
 else if(path==='/api/shift')data={open:true,orders_enabled:true};
 else if(path==='/api/orders'){
  assert.equal(body.quick,true);
  assert.equal(typeof body.request_id,'string');
  assert.ok(body.request_id.length>=16);
  assert.equal(body.customer_name,undefined);
  assert.equal(body.phone,undefined);
  assert.equal(body.car_plate,undefined);
  data={ok:true,id:52,total_fils:2400,feedback_token:'secret-one-order-token'};
  status=201;
 }
 else if(path==='/api/orders/52/details'){
  assert.equal(body.order_token,'secret-one-order-token');
  data={ok:true,id:52};
 }
 else throw Error('Unexpected API '+path);
 return {ok:true,status,json:async()=>data};
};
const tick=(check)=>new Promise((resolve,reject)=>{
 const began=Date.now();
 function poll(){if(check())return resolve();if(Date.now()-began>2000)return reject(Error('Timed out'));setTimeout(poll,10)}poll();
});
async function main(){
 w.eval(fs.readFileSync('static/app.js','utf8')+
  '\nwindow.__quickTest={setCart:()=>{products='+JSON.stringify([product])+';cart={espresso:2};cartNotes={espresso:"Less sugar"};shopOpen=true;renderCart()}};');
 w.__quickTest.setCart();
 const $=id=>doc.getElementById(id);
 $('checkout').click();
 assert.equal($('checkoutForm').hidden,false);
 assert.equal($('successStep').hidden,true);
 assert.equal($('checkoutForm').querySelectorAll('input[required]').length,0);
 assert.equal($('checkoutForm').querySelectorAll('input[type="tel"]').length,0);
 assert.match($('checkoutForm').textContent,/تأكيد الطلب بدون تعبئة بيانات/);
 assert.match($('checkoutTotal').textContent,/24 AED/);
 $('checkoutForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await tick(()=>$('successStep').hidden===false);
 assert.equal(requestLog.filter(x=>x.path==='/api/orders').length,1);
 const sent=requestLog.find(x=>x.path==='/api/orders').body;
 assert.equal(sent.items.length,1);
 assert.equal(sent.items[0].item_note,'Less sugar');
 assert.equal($('orderNumber').textContent,'#52');
 assert.match($('receiptText').textContent,/الموظفين/);
 assert.equal($('orderDetailsForm').querySelectorAll('[required]').length,0);
 $('optionalOrderDetails').open=true;
 $('customerName').value='Guest A';
 $('customerPhone').value='0501234567';
 $('orderDetailsForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await tick(()=>requestLog.some(x=>x.path==='/api/orders/52/details'));
 const updated=requestLog.find(x=>x.path==='/api/orders/52/details').body;
 assert.equal(updated.customer_name,'Guest A');
 assert.equal(updated.phone,'0501234567');
 assert.equal(requestLog.filter(x=>x.path==='/api/orders').length,1,'details must not create a second order');
 console.log('Quick checkout without fields, real receipt number, and optional details update passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
