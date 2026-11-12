'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

// All pages offer exactly the same protected Owner/Staff navigation.
for(const path of ['static/index.html','static/staff.html','static/owner.html']){
 const page=new JSDOM(fs.readFileSync(path,'utf8'),{url:'http://localhost/'});
 const menu=page.window.document.querySelector('.role-login-menu');
 assert.ok(menu,path+' needs a visible role chooser');
 const links=[...menu.querySelectorAll('.role-login-options a')].map(a=>a.getAttribute('href'));
 assert.deepEqual(links,['/owner','/staff'],path+' should offer exactly two roles');
 assert.ok(menu.querySelector('summary').textContent.trim(),path+' has a menu label');
}

// Staff and owner receipts show one quantity and only the LINE total, not n x unit price.
const doc=new JSDOM('<html><body><span id="clock"></span></body></html>',{
 url:'http://localhost/staff',runScripts:'outside-only'
});
doc.window.setInterval=()=>0;
doc.window.eval(fs.readFileSync('static/admin-common.js','utf8')+'\nwindow.__invoiceBill=bill;');
const order={
 id:17,status:'new',created_at:'2026-11-12T15:00:00Z',
 customer_name:'Test Guest',phone:'0500000000',car_plate:'123',
 total_fils:2400,items:[{id:1,name:'إسبريسو',image:'hot.webp',
 qty:2,price_fils:1200,syrup:'',item_note:'',addons:[]}]
};
let output=doc.window.__invoiceBill(order,false);
assert.match(output,/الكمية: <b>2<\/b>/);
assert.match(output,/bill-row-total[^>]*>24 AED/);
assert.doesNotMatch(output,/2 × 12 AED/);
output=doc.window.__invoiceBill(order,true);
assert.match(output,/bill-qty-label[^>]*>الكمية/);
assert.match(output,/bill-row-total[^>]*>24 AED/);
assert.doesNotMatch(output,/2 × 12 AED/);

// Customer cart has one quantity control and one line total, with live recalculation.
const page=new JSDOM(fs.readFileSync('static/index.html','utf8'),{
 url:'http://localhost/',pretendToBeVisual:true,runScripts:'outside-only'
});
const w=page.window;w.setInterval=()=>0;w.scrollTo=()=>{};
w.HTMLElement.prototype.scrollIntoView=function(){};
const product={id:'espresso',name:'إسبريسو',category:'Hot Drinks',
 price_fils:1200,final_price_fils:1200,available:1,image:'hot.webp',addons:[]};
w.fetch=async(path)=>{
 const result=path==='/api/products'?{products:[product],promotions:[]}
  :path==='/api/shift'?{open:true,orders_enabled:true}:null;
 if(!result)throw Error('Unexpected request '+path);
 return {ok:true,status:200,json:async()=>result};
};
w.eval(fs.readFileSync('static/app.js','utf8')+
 '\nwindow.__cartTest=()=>{products=[{id:"espresso",name:"إسبريسو",category:"Hot Drinks",price_fils:1200,final_price_fils:1200,available:1,image:"hot.webp",addons:[]}];cart={espresso:2};shopOpen=true;renderCart();};');
w.__cartTest();
let row=w.document.querySelector('#cartItems .cart-line');
assert.ok(row);
assert.match(row.textContent,/الكمية/);
assert.match(row.querySelector('.cart-line-total').textContent,/24 AED/);
assert.doesNotMatch(row.textContent,/12 AED × 2/);
assert.equal(row.querySelectorAll('.cart-qty-controls').length,1);
row.querySelector('[data-delta="1"]').click();
row=w.document.querySelector('#cartItems .cart-line');
assert.equal(row.querySelector('.cart-qty-controls b').textContent,'3');
assert.match(row.querySelector('.cart-line-total').textContent,/36 AED/);
console.log('Owner/Staff navigation and simple quantity/line totals passed');
