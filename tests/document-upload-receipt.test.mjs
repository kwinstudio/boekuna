import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the production upload function, without copying its implementation.
const source=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
const start=source.indexOf('async function persistSelectedDocument(');
const end=source.indexOf('async function startPersistentDocumentProcessingQueue(',start);
assert.ok(start>=0&&end>start);
function setup(){
 let finishJob,failJob;
 const job=new Promise((resolve,reject)=>{finishJob=resolve;failJob=reject});
 const messages=[];
 const db={from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{id:'doc-1'}})})})})})};
 const context=vm.createContext({getSupabase:async()=>db,currentUser:{id:'owner'},uid:()=> 'ref',safeStorageName:x=>x,
  state:{documents:[],company:{}},today:()=> '2026-10-07',save:()=>{},
  documentProcessingTransition:(item,state)=>{item.state=state},
  setDocumentProcessingMessage:(item,title,text)=>messages.push({title,text}),
  uploadPersistentDocumentBlob:async()=>{},invokeDocumentProcessing:()=>job,
  scheduleDocumentProcessingRender:()=>{},renderGlobalDocumentIndicator:()=>{}});
 vm.runInContext(source.slice(start,end),context);
 return {context,messages,finishJob,failJob,item:{file:{name:'synthetic.pdf',type:'application/pdf',size:100}}};
}
for(const outcome of ['success','missing_job','network_error']){
 const t=setup(),processing=t.context.persistSelectedDocument(t.item,'batch-synthetic');
 // Flush asynchronous upload and database reads; enqueue remains unresolved.
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(t.item.uploaded,true);
 assert.equal(t.item.documentPersisted,true);
 assert.notEqual(t.item.receivedPersisted,true);
 assert.ok(!t.messages.some(x=>/ontvangen/i.test(x.title)), 'No received confirmation before the job exists');
 assert.ok(!t.messages.some(x=>/bestand ontvangen/i.test(x.text)), 'No safe receipt text before the job exists');
 if(outcome==='success'){
  t.finishJob({job:{id:'job-1',state:'queued'}});await processing;
  assert.equal(t.item.receivedPersisted,true);assert.equal(t.item.jobId,'job-1');
  assert.match(t.messages.at(-1).text,/Bestand ontvangen/);
 }else{
  if(outcome==='missing_job')t.finishJob({});else t.failJob(Object.assign(new Error('offline'),{code:'NETWORK_ERROR'}));
  await assert.rejects(processing);
  assert.notEqual(t.item.receivedPersisted,true);
  assert.equal(t.item.documentPersisted,true,'Resume can recover the stored document');
 }
}
// Mixed accepted/pending batches remain visible until the recovered job appears.
const pending={clientRef:'pending',state:'queued',documentPersisted:true,uploaded:true};
const accepted={clientRef:'accepted',state:'queued',receivedPersisted:true};
const jobs=[{id:'job-accepted',client_ref:'accepted',batch_id:'batch-synthetic',state:'queued'}];
const session={persistent:true,id:'batch-synthetic',items:[accepted,pending],allReceived:false};
const context=vm.createContext({documentProcessingSession:session,documentProcessingJobs:jobs,
 documentProcessingConnectivityLost:false,persistentDocumentActiveBatchIds:()=>new Set(['batch-synthetic']),
 persistentDocumentNeedsReview:()=>false,persistentDocumentIsTerminal:()=>false,
 localUploadCardHtml:()=>'<div>pending</div>',persistentDocumentCardHtml:()=>'<div>accepted</div>',esc:x=>x,
 scheduleDocumentProcessingRender:()=>{},renderGlobalDocumentIndicator:()=>{},createUploadError:()=>({})});
for(const [name,next] of [['localPersistentProcessingItems','localUploadCardHtml'],['renderDocumentProcessingBoard','updateLocalDocumentFromJob'],['syncPersistentJobsToUploadSession','fetchDocumentProcessingJobs']]){
 const a=source.indexOf('function '+name+'('),b=source.indexOf('function '+next+'(',a);
 assert.ok(a>=0&&b>a);
 vm.runInContext(source.slice(a,b).replace(/async\s*$/,''),context);
}
assert.equal(context.localPersistentProcessingItems().length,1);
assert.doesNotMatch(context.renderDocumentProcessingBoard(),/<strong>Ontvangen\.<\/strong>/);
jobs.push({id:'job-recovered',client_ref:'pending',batch_id:'batch-synthetic',state:'queued'});
context.syncPersistentJobsToUploadSession();
assert.equal(pending.receivedPersisted,true);assert.equal(pending.jobId,'job-recovered');
assert.equal(session.allReceived,true);
assert.equal(context.localPersistentProcessingItems().length,0);
assert.match(context.renderDocumentProcessingBoard(),/<strong>Ontvangen\.<\/strong>/);
console.log('PASS: durable receipt, missing-job/network boundary, mixed batch visibility and recovered acceptance');
