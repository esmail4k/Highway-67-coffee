'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync('static/index.html','utf8');
const dom=new JSDOM(html,{url:'http://localhost/',pretendToBeVisual:true,runScripts:'outside-only'});
const {window:w}=dom,doc=w.document;
w.setInterval=()=>0;
w.HTMLElement.prototype.scrollIntoView=function(){};
w.scrollTo=()=>{};
const catalog=[
 {id:'acai_smoothie',name:'سموذي أساي',category:'Cold Drinks',available:1,
  price_fils:2000,final_price_fils:2000,image:'acai-original-white.jpg',
  addons:[{id:9,name:'إكسترا زبدة الفول السوداني',price_fils:200,max_qty:1},
          {id:10,name:'موز',price_fils:200,max_qty:1}]},
 {id:'spanish',name:'إسبانيش لاتيه',category:'Hot Drinks',available:1,
  price_fils:1600,final_price_fils:1600,image:'hot.webp',addons:[]}
];
w.fetch=async(path)=>{
 const response=path==='/api/products'?{products:catalog,promotions:[]}
  :path==='/api/shift'?{open:true,orders_enabled:true}:null;
 if(!response)throw Error('Unexpected API: '+path);
 return {ok:true,status:200,json:async()=>response};
};
w.eval(fs.readFileSync('static/app.js','utf8')+'\nwindow.__acaiTest={setCatalog:()=>{products='+JSON.stringify(catalog)+';shopOpen=true;renderCards()},open:(id)=>openCustomizer(id,null),cart:()=>cart,extras:()=>currentCustomAddons(),price:(key)=>unitPrice(key)};');
const waitUntil=(fn)=>new Promise((resolve,reject)=>{
 let start=Date.now();const poll=()=>fn()?resolve():Date.now()-start>2500?reject(Error('Timed out')):setTimeout(poll,10);poll();
});
async function main(){
 w.__acaiTest.setCatalog();
 w.__acaiTest.open('acai_smoothie');
 assert.equal(doc.getElementById('customModal').hidden,false);
 assert.equal(doc.getElementById('syrupFieldset').hidden,true);
 assert.equal(w.getComputedStyle(doc.getElementById('syrupFieldset')).display,'none',
  'Hidden syrup fieldset must not be displayed as a grid for acai');
 assert.equal(doc.getElementById('customCaramelPrice').hidden,true);
 assert.equal(doc.getElementById('acaiBananaFieldset').hidden,false);
 assert.equal(doc.querySelector('input[name="acaiBanana"]:checked').value,'no');
 assert.equal(doc.querySelectorAll('#extraOptionsList [data-addon-choice]').length,1);
 assert.match(doc.getElementById('extraOptionsList').textContent,/زبدة الفول السوداني/);
 assert.match(doc.querySelector('.custom-extra-option .acai-price-positive').textContent,/2 AED/);
 assert.match(doc.getElementById('customItem').textContent,/20 AED/);
 doc.querySelector('#extraOptionsList input[type="checkbox"]').click();
 assert.match(doc.getElementById('customItem').textContent,/22 AED/);
 doc.querySelector('input[name="acaiBanana"][value="yes"]').click();
 assert.deepEqual(JSON.parse(JSON.stringify(w.__acaiTest.extras())),[{id:9,qty:1},{id:10,qty:1}]);
 assert.match(doc.getElementById('customItem').textContent,/24 AED/);
 doc.getElementById('confirmCustom').click();
 const cartKeys=Object.keys(w.__acaiTest.cart());
 assert.equal(cartKeys.length,1);
 assert.ok(cartKeys[0].startsWith('acai_smoothie__addons'));
 assert.doesNotMatch(cartKeys[0],/caramel/);
 assert.equal(w.__acaiTest.price(cartKeys[0]),2400);
 // New acai orders default to no banana and no paid add-ons.
 w.__acaiTest.open('acai_smoothie');
 assert.equal(doc.querySelector('input[name="acaiBanana"]:checked').value,'no');
 assert.equal(doc.querySelector('#extraOptionsList input[type="checkbox"]').checked,false);
 doc.getElementById('confirmCustom').click();
 assert.equal(w.__acaiTest.cart().acai_smoothie,1);
 assert.equal(w.__acaiTest.price('acai_smoothie'),2000);
 // The coffee customizer retains its own syrup options independently.
 w.__acaiTest.open('spanish');
 assert.equal(doc.getElementById('syrupFieldset').hidden,false);
 assert.equal(doc.getElementById('acaiBananaFieldset').hidden,true);
 console.log('Acai-only peanut/banana choices, AED2 prices, no caramel, and Spanish syrup isolation passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
