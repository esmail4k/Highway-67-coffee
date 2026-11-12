'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const markup=fs.readFileSync('static/index.html','utf8');
const dom=new JSDOM(markup,{url:'http://localhost/',pretendToBeVisual:true,runScripts:'outside-only'});
const {window}=dom,document=window.document;
window.setInterval=()=>0;
window.scrollTo=()=>{};
window.HTMLElement.prototype.scrollIntoView=function(){};
let feedbackCalls=0,lastPayload=null;
window.fetch=async(path,options={})=>{
 let response={};
 if(path==='/api/products')response={products:[],promotions:[]};
 else if(path==='/api/shift')response={open:true,orders_enabled:true};
 else if(path==='/api/feedback'){
  feedbackCalls++;
  lastPayload=JSON.parse(options.body);
  response={ok:true};
 }else{throw Error('Unexpected request: '+path)}
 return {ok:true,status:200,json:async()=>response};
};
function waitUntil(pred,timeout=2500){
 return new Promise((ok,fail)=>{
  const start=Date.now();
  function retry(){if(pred())return ok();if(Date.now()-start>timeout)return fail(Error('Timed out'));setTimeout(retry,10)}retry();
 });
}
async function main(){
 window.eval(fs.readFileSync('static/app.js','utf8')+
  '\nwindow.__reviewTest={setOrder:(id,token)=>{feedbackToken=token;feedbackOrderId=id;resetFeedback();rememberPendingReview();step("success")},refresh:()=>refreshReviewReminder()};');
 const $=id=>document.getElementById(id);
 assert.equal($('reviewReminder').hidden,true);
 window.__reviewTest.setOrder(25,'review-test-token-long-string');
 assert.equal($('feedbackCard').hidden,true,'Review should not block checkout confirmation');
 assert.equal($('reviewOptionalIntro').hidden,false);
 $('openFeedback').click();
 assert.equal($('feedbackCard').hidden,false);
 assert.equal($('feedbackReasons').hidden,true);
 document.querySelector('[data-rating="4"]').click();
 assert.equal($('feedbackReasons').hidden,false);
 document.querySelector('[data-reason="taste"]').click();
 $('feedbackComment').value='Please improve this drink';
 $('sendFeedback').click();
 await waitUntil(()=>feedbackCalls===1);
 await waitUntil(()=>$('feedbackCard').hidden);
 assert.equal(lastPayload.rating_score,4);
 assert.deepEqual(lastPayload.reasons,['taste']);
 assert.equal(lastPayload.comment,'Please improve this drink');
 assert.equal(lastPayload.liked,false);
 assert.equal(window.localStorage.getItem('highway67_pending_review_v2'),null);

 window.__reviewTest.setOrder(26,'another-pending-test-token');
 $('openFeedback').click();
 $('skipFeedback').click();
 assert.equal(feedbackCalls,1,'Skipping must never submit feedback');
 assert.ok(window.localStorage.getItem('highway67_pending_review_v2'),'Skipped review remains optional');
 window.__reviewTest.refresh();
 assert.equal($('reviewReminder').hidden,false);
 $('resumeReview').click();
 assert.equal($('feedbackCard').hidden,false);
 assert.ok($('receiptText').textContent.includes('#26'));
 console.log('Optional review, 1–10 rating, reasons, skip and return reminder passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
