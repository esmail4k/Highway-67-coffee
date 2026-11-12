'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('static/i18n.js','utf8');
const stored=new Map();

function openPage(page){
 let click;
 const toggle={
  textContent:'',attributes:{},
  setAttribute(k,v){this.attributes[k]=v},
  addEventListener(event,listener){if(event==='click')click=listener}
 };
 const html={attributes:{},setAttribute(k,v){this.attributes[k]=v}};
 const body={
  getAttribute(key){return key==='data-language-page'?page:null},
  hasAttribute(){return false},setAttribute(){}
 };
 const document={
  body,documentElement:html,title:'',
  getElementById(id){return id==='langToggle'?toggle:null},
  querySelectorAll(){return []},
  createTreeWalker(){return {nextNode(){return null}}}
 };
 const localStorage={
  getItem(key){return stored.get(key)||null},
  setItem(key,value){stored.set(key,value)}
 };
 const window={};
 const sandbox={
  document,localStorage,window,
  MutationObserver:class{observe(){}},
  NodeFilter:{SHOW_TEXT:4},
  requestAnimationFrame(fn){fn()}
 };
 vm.runInNewContext(source,sandbox);
 return {
  toggle,document,lang:window.highway67Language,
  click(){assert.equal(typeof click,'function');click()}
 };
}
stored.clear();
const staff=openPage('staff');
assert.equal(staff.lang.get(),'ar');
assert.equal(staff.toggle.textContent,'English');
assert.equal(staff.document.documentElement.attributes.dir,'rtl');
staff.click();
assert.equal(staff.lang.get(),'en');
assert.equal(staff.toggle.textContent,'العربية');
assert.equal(staff.lang.translate('إضافات المشروب'),'Drink extras');
assert.equal(staff.lang.translate('إضافة منتج للفاتورة #42'),'Add item to invoice #42');
assert.equal(staff.lang.translate('الكمية'),'Quantity');
assert.equal(staff.lang.translate('لاتيه · 15.99 AED'),'Latte · 15.99 AED');
const owner=openPage('owner');
assert.equal(owner.lang.get(),'en');
assert.equal(owner.document.documentElement.attributes.dir,'ltr');
assert.equal(owner.lang.translate('إضافات المنتج'),'Item extras');
assert.equal(owner.lang.translate('تعديل الاسم والمنتج'),'Edit name and item');
assert.equal(owner.lang.translate('إكسترا بينات'),'Extra peanuts');
owner.click();
assert.equal(owner.lang.get(),'ar');
assert.equal(owner.document.documentElement.attributes.dir,'rtl');
const customer=openPage('customer');
assert.equal(customer.lang.get(),'ar');
assert.equal(customer.lang.translate('إضافات المشروب'),'إضافات المشروب');
const more=openPage('staff');
if(more.lang.get()==='ar')more.click();
assert.equal(more.lang.translate('نعم، إلغاء الفاتورة'),'Yes, cancel invoice');
assert.equal(more.lang.translate('هل أنت متأكد من إنهاء الوردية الحالية؟'),'Are you sure you want to end the current shift?');
assert.equal(more.lang.translate('كيف تقيّم طلبك من 10؟'),'How would you rate your order out of 10?');
assert.equal(more.lang.translate('حلاوة المشروب'),'Drink sweetness');
assert.equal(more.lang.translate('10 منتج متوفر'),'10 available products');
assert.equal(more.lang.translate('تقييم الطلب السابق #47'),'Rating for previous order #47');
assert.equal(more.lang.translate('لا، رجوع'),'No, go back');
console.log('Arabic/English language checks passed.');
