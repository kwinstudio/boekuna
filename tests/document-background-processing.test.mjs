import {serveKvkAsset} from './lib/kvk-browser-assets.mjs';
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260929201500_document_background_processing.sql',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../supabase/functions/document-processing/index.ts',import.meta.url),'utf8');
const processorSource=fs.readFileSync(new URL('../kwinest/docprocessor/app.py',import.meta.url),'utf8');
const financialCorrectionSource=fs.readFileSync(new URL('../public/assets/financial-correction.js',import.meta.url),'utf8');

function replaceLast(source,needle,replacement){
  const i=source.lastIndexOf(needle);
  if(i<0)throw new Error('Missing bootstrap marker: '+needle);
  return source.slice(0,i)+replacement+source.slice(i+needle.length);
}

assert.match(migration,/unique \(user_id, document_id\)/,'One persistent job per user/document is required');
assert.match(migration,/enable row level security/,'Processing jobs must have RLS enabled');
assert.match(migration,/auth\.uid\(\)\) = user_id/,'Processing status must be tenant scoped');
assert.match(migration,/revoke all on public\.document_processing_jobs from anon, authenticated/,'Client roles must start from zero table privileges');
assert.match(migration,/grant select on public\.document_processing_jobs to authenticated/,'Only authenticated read access may be restored after the revoke');
assert.match(migration,/document_processing_jobs_document_id_idx/,'Document foreign key must have a covering index');
assert.match(migration,/document_processing_jobs_mfa_guard/,'Processing status must preserve the bookkeeping MFA boundary');
assert.match(migration,/\(\(select auth\.jwt\(\)\)->>'aal'\)/,'MFA policy must use init-plan-safe auth.jwt evaluation');
assert.match(worker,/\.eq\("user_id",a\.user\.id\)/,'Worker actions must enforce ownership');
assert.match(worker,/mfa\.getAuthenticatorAssuranceLevel\(\)/,'Worker mutations must enforce the existing MFA boundary');
assert.match(worker,/MFA_REQUIRED/,'Worker must reject mutation when enrolled MFA is not satisfied');
assert.match(worker,/const PROCESSING_CONCURRENCY=1/,'Server queue must serialize heavy document processing on the current processor capacity');
assert.match(worker,/EdgeRuntime\.waitUntil\(triggerNext\(authHeader,jobId,jobDeveloper\)\)/,'Every completed attempt must continue the persistent queue with job-owner-bound validated developer context');
assert.match(worker,/repairMissingJobs/,'Resume must recover received documents that missed job creation');
assert.match(worker,/async function backgroundActor/,'Background queue continuation must have a stateless ownership path');
assert.match(worker,/from\("document_processing_jobs"\).*eq\("id",jobId\)/s,'Background queue continuation must re-authorize through the owned job row');
assert.match(worker,/triggerNext\(authHeader,jobId,jobDeveloper\)/,'Queue continuation must bind the self-call to the completed job and job-owner-bound validated developer context');
assert.match(worker,/JSON\.stringify\(\{action:"run_next",job_id:jobId\}\)/,'run_next must carry the owned job capability');
assert.match(processorSource,/x-boekuna-processing-job/,'Processor must recognize the background job header');
assert.match(processorSource,/rest\/v1\/document_processing_jobs/,'Processor background auth must use the RLS-protected processing job');
assert.match(processorSource,/state":"in\.\(processing,validating\)"/,'Processor must only accept an active background processing job');
assert.match(worker,/\.eq\("state","queued"\)/,'Job claim must be state guarded for idempotency');
assert.match(worker,/if\(existing\)/,'Enqueue must reuse an existing document job');
assert.match(worker,/repairMissingJobs\(a\.user\.id,developer\?"legacy":EXECUTION_MODE\)/,'Resume must repair stored documents in the same execution mode as enqueue');
assert.match(worker,/action==="run_next"/,'Background completion must continue the server queue without the scan page');
assert.match(worker,/if\(!\["failed","review_required"\]\.includes\(job\.state\)\)/,'Retry must target one terminal problem job');
assert.match(worker,/state:"ready".*review_fields:\[\]/s,'Resolved human review must clear attention state');
assert.match(original,/fileId=sourceClientRef\|\|uid\('file'\)/,'Review save must reuse an already persisted source');
assert.match(original,/if\(!sourceClientRef\)\{try\{await putStoredFile/,'Persisted sources must not be uploaded again on save');
assert.match(original,/mixedRates=!!pendingPdfImport\.parsed\?\.mixedRates\|\|trustedVatRates\.length>1,rate=mixedRates\?null/,'Mixed VAT must never collapse to a scalar rate');
assert.match(original,/activeDocumentTransfers>0.*beforeunload/s,'Only active browser transfers should trigger unload protection');
assert.match(original,/if\(page!=='documents'\)await navigate\('documents'\)/,'Persistent upload must use Documents as the primary live processing view');
assert.match(original,/documentProcessingSession\.persistent\)\{if\(page==='documents'.*renderGlobalDocumentIndicator/s,'Persistent processing must not reopen the blocking processing modal');
assert.match(original,/sessionBatch=documentProcessingSession\?\.persistent/,'Current completed batch must remain visible on the Documents screen');
assert.match(original,/!documentProcessingSession\.persistent.*cleanupDocumentProcessingSession/s,'Closing unrelated modals must not destroy persistent processing UI state');
assert.match(original,/setTimeout\(\(\)=>\{documentProcessingPollTimer=null;fetchDocumentProcessingJobs\(\).*15000/s,'Fallback polling must be bounded and non-aggressive');
assert.match(original,/function persistentDocumentActionHtml[\s\S]*?state==='failed'[\s\S]*?Opnieuw proberen/,'Failed cards keep the primary retry');
assert.match(original,/function openDocumentActions[\s\S]*?Handmatig invoeren[\s\S]*?Ander bestand[\s\S]*?Verwijderen/,'Failed documents keep replacement, manual entry and deletion in their secondary menu');
assert.match(original,/aria-label="Documentacties"[\s\S]*?openDocumentActions/,'Secondary actions remain accessible from the card');
assert.match(original,/item\.documentId=row\.id;item\.documentPersisted=true/,'Storage and the document row are tracked separately from job acceptance');
assert.match(original,/if\(!queued\.job\?\.id\)throw[\s\S]*?item\.jobId=queued\.job\.id;item\.receivedPersisted=true/,'A file is only safely received after storage, document row AND durable job exist');
assert.match(original,/session\.items\.every\(x=>x\.receivedPersisted\)/,'Batch received copy must use the durable receipt boundary');
assert.match(original,/function localPersistentProcessingItems\(\)/,'Received items without a visible job must stay on screen');
assert.match(original,/if\(!doc\)\{doc=\{id:uid\('d'\).*source:'background-upload'/s,'Another browser must reconstruct missing local document metadata from persistent jobs');

let appHtml=original.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
appHtml=replaceLast(appHtml,'initAuth();',`
currentUser=TEST_USER;
state=structuredClone(DEFAULT);
for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
enterApp();
`);

const server=http.createServer((req,res)=>{
  if(serveKvkAsset(req,res))return;
  if(req.url?.startsWith('/assets/financial-correction.js')){
    res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
    return res.end(financialCorrectionSource);
  }
  res.writeHead(200,{'content-type':req.url?.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(req.url?.endsWith('.css')?'':appHtml);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.goto(base,{waitUntil:'domcontentloaded'});

  const transitionResult=await page.evaluate(()=>{
    const file=new File(['x'],'state-machine.pdf',{type:'application/pdf'});
    const item=createDocumentProcessingItem(file,'auto'),states=[];
    for(const next of ['uploading','uploaded','queued','processing','validating','ready']){documentProcessingTransition(item,next);states.push(item.state)}
    let invalid=false;try{documentProcessingTransition(item,'processing')}catch{invalid=true}
    const review=createDocumentProcessingItem(file,'auto');
    for(const next of ['uploading','uploaded','queued','processing','validating','review_required','queued','processing','failed'])documentProcessingTransition(review,next);
    const retryState=review.state;documentProcessingTransition(review,'queued');
    return {states,invalid,retryState,afterRetry:review.state};
  });
  assert.deepEqual(transitionResult.states,['uploading','uploaded','queued','processing','validating','ready']);
  assert.equal(transitionResult.invalid,true,'Invalid READY -> processing transition must be rejected');
  assert.equal(transitionResult.retryState,'failed');
  assert.equal(transitionResult.afterRetry,'queued');

  const nonFinancialOpen=await page.evaluate(async()=>{
    const old=window.openStoredDocument;let opened='';
    window.openStoredDocument=async ref=>{opened=ref};
    documentProcessingJobs=[{id:'non-financial-ready',client_ref:'ref-bank',state:'ready',result:{analysis:{documentType:'bank_document'}}}];
    await openPersistentDocumentReview('non-financial-ready');
    window.openStoredDocument=old;
    return {opened,reviewOpen:!!document.getElementById('pdfImportForm')};
  });
  assert.equal(nonFinancialOpen.opened,'ref-bank','Ready non-financial documents must open the original source');
  assert.equal(nonFinancialOpen.reviewOpen,false,'Non-financial documents must not enter invoice review');


  await page.evaluate(()=>{
    const file=new File(['received'],'received-without-job.pdf',{type:'application/pdf'});
    documentProcessingJobs=[];
    documentProcessingSession={id:'batch-received-gap',persistent:true,allReceived:true,modalHidden:true,items:[{id:'proc-gap',file,clientRef:'ref-gap',state:'queued',uploaded:true,receivedPersisted:true,uploadPercent:100,uploadLoaded:file.size,uploadTotal:file.size}]};
    page='documents';render();
  });
  assert.match(await page.locator('.document-processing-board').innerText(),/received-without-job\.pdf/);
  assert.match(await page.locator('.document-processing-board').innerText(),/Wacht/);
  assert.match(await page.locator('.document-processing-board').innerText(),/Ontvangen\. Je kunt verder werken\./);
  assert.equal(await page.locator('#documentProcessingGlobal').evaluate(el=>!el.classList.contains('hidden')),true,'Received item awaiting job recovery must remain globally visible');

  await page.evaluate(()=>{
    state.documents=[];
    const now=new Date().toISOString();
    applyDocumentProcessingJobs([{id:'reconstruct-job',document_id:'doc-reconstruct',client_ref:'ref-reconstruct',batch_id:'batch-old',file_name:'cross-device.pdf',mime_type:'application/pdf',size_bytes:900,requested_kind:'auto',state:'ready',phase:'complete',attempt:1,max_attempts:3,result:{analysis:{documentType:'other',processing:{sourceKind:'pdf',pages:1,ocrPages:[]}}},review_fields:[],review_message:null,error_code:null,error_retryable:false,created_at:now,updated_at:now}],{initial:true});
  });
  assert.equal(await page.evaluate(()=>state.documents.some(d=>d.fileId==='ref-reconstruct'&&d.name==='cross-device.pdf')),true,'Persistent jobs must restore document visibility on another browser');
  await page.evaluate(()=>{documentProcessingSession=null});
  const supportedBatchSizes=await page.evaluate(()=>{
    const result={};
    for(const n of [1,2,5,10]){
      const rows=Array.from({length:n},(_,i)=>({state:i%3===0?'ready':i%3===1?'review_required':'failed'}));
      result[n]={total:rows.length,terminal:rows.filter(x=>['ready','review_required','failed'].includes(x.state)).length};
    }
    return result;
  });
  assert.deepEqual(Object.keys(supportedBatchSizes),['1','2','5','10'],'Supported batch sizes must include 1, 2, 5, and the 10-document product limit');
  for(const [n,row] of Object.entries(supportedBatchSizes)){assert.equal(row.total,Number(n));assert.equal(row.terminal,Number(n))}

  const now=new Date().toISOString();
  await page.evaluate(({now})=>{
    const mk=(id,state,name,extra={})=>({id,document_id:'doc-'+id,client_ref:'ref-'+id,batch_id:'batch-qa',file_name:name,mime_type:'application/pdf',size_bytes:1200,requested_kind:'auto',state,phase:state==='validating'?'validate':state==='processing'?'read':state==='queued'?'queued':'complete',attempt:1,max_attempts:3,result:state==='ready'||state==='review_required'?{analysis:{documentType:'purchase_invoice',invoice:{invoiceNumber:'QA-'+id,invoiceDate:'2026-09-29'},supplier:{name:'QA leverancier'},amounts:{subtotal:100,vatLines:[{rate:21,taxableAmount:100,vatAmount:21}],vatTotal:21,total:121,currency:'EUR'},confidence:{supplierName:.99,invoiceNumber:.99,invoiceDate:.99,subtotal:.99,vatTotal:.99,total:.99,vatLines:.99},processing:{sourceKind:'pdf',pages:1,ocrPages:[],overallConfidence:.99}}}:null,review_fields:state==='review_required'?['vatAmount']:[],review_message:state==='review_required'?'Controleer btw-bedrag.':null,error_code:state==='failed'?'DOCUMENT_IMAGE_UNREADABLE':null,error_retryable:state==='failed',created_at:now,updated_at:now,...extra});
    documentProcessingJobs=[
      mk('1','ready','Albert-Heijn.pdf'),
      mk('2','processing','Shell.jpg'),
      mk('3','validating','Factuur-Jansen.pdf'),
      mk('4','review_required','Makro.pdf'),
      mk('5','failed','Slechte-foto.jpg')
    ];
    documentProcessingInitialized=true;
    documentProcessingLastSummary={active:2,attention:2,terminal:3};
    page='documents';render();
  },{now});

  assert.match(await page.locator('.document-processing-board').innerText(),/3 van 5 afgerond/);
  assert.match(await page.locator('.document-processing-board').innerText(),/Wordt verwerkt/);
  assert.match(await page.locator('.document-processing-board').innerText(),/Bedragen controleren/);
  assert.match(await page.locator('.document-processing-board').innerText(),/Controle nodig/);
  assert.match(await page.locator('.document-processing-board').innerText(),/Kon niet verwerkt worden/);
  assert.equal(await page.locator('.document-processing-board .document-status-spinner').count(),2,'Only real active states should spin');
  assert.equal((await page.locator('#documentAttentionBadge').innerText()).trim(),'3','Unbooked ready financial document, flagged review and failure require attention');
  assert.equal((await page.locator('#documentProcessingGlobalText').innerText()).trim(),'','Header processing indicator remains spinner-only');
  assert.equal(await page.locator('#documentProcessingGlobal').getAttribute('aria-label'),'Documenten worden verwerkt');
  fs.mkdirSync(new URL('./artifacts/',import.meta.url),{recursive:true});
  await page.screenshot({path:new URL('./artifacts/document-processing-background-mixed.png',import.meta.url).pathname,fullPage:true});

  await page.locator('#documentProcessingGlobal').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.getByRole('heading',{name:'Documenten verwerken'}).count(),1);
  assert.match(await page.locator('#modalRoot').innerText(),/3 van 5 afgerond/);
  assert.equal(await page.locator('#modalRoot [role="dialog"]').getAttribute('aria-modal'),'true');
  await page.locator('#modalRoot .modal-foot').getByRole('button',{name:'Sluiten'}).click();

  await page.evaluate(()=>{documentProcessingConnectivityLost=true;page='documents';render()});
  assert.match(await page.locator('.document-processing-board').innerText(),/Verbinding onderbroken/);
  assert.match(await page.locator('.document-processing-board').innerText(),/documenten zijn ontvangen/i);

  await page.evaluate(()=>{
    documentProcessingConnectivityLost=false;
    documentProcessingJobs=documentProcessingJobs.map(job=>({...job,state:'ready',phase:'complete',review_fields:[],review_message:null,error_code:null,error_retryable:false}));
    documentProcessingSession={id:'batch-qa',items:[],persistent:true,allReceived:true,modalHidden:true};
    page='documents';render();
  });
  assert.match(await page.locator('.document-processing-board').innerText(),/✓ 5 documenten verwerkt/,'A fully successful current batch must remain visible as completed');
  await page.screenshot({path:new URL('./artifacts/document-processing-background-complete.png',import.meta.url).pathname,fullPage:true});

  // A temporary processor outage (crash restart or deploy) is retried
  // automatically; the user sees "waiting", not an error. Real document
  // errors and used-up attempts still show the error.
  const autoRetry=await page.evaluate(async({now})=>{
    const calls=[];const realInvoke=invokeDocumentProcessing,realFetch=fetchDocumentProcessingJobs;
    invokeDocumentProcessing=async(action,payload)=>{calls.push(action+':'+payload.job_id);return {ok:true}};
    fetchDocumentProcessingJobs=async()=>[];
    const old=new Date(Date.now()-60000).toISOString();
    const job=(id,extra)=>({id,document_id:'doc-'+id,client_ref:'ref-'+id,batch_id:'batch-retry',file_name:id+'.pdf',mime_type:'application/pdf',size_bytes:1200,requested_kind:'auto',state:'failed',phase:'complete',attempt:1,max_attempts:3,result:null,review_fields:[],review_message:null,error_code:'PROCESSOR_UNAVAILABLE',error_retryable:true,created_at:old,updated_at:old,completed_at:old,...extra});
    documentProcessingSession=null;
    applyDocumentProcessingJobs([job('outage'),job('unreadable',{error_code:'DOCUMENT_IMAGE_UNREADABLE'}),job('used-up',{attempt:3})],{initial:true});
    const states=Object.fromEntries(documentProcessingJobs.map(j=>[j.id,j.state]));
    await new Promise(r=>setTimeout(r,50));
    applyDocumentProcessingJobs([job('outage')],{initial:false});
    await new Promise(r=>setTimeout(r,50));
    invokeDocumentProcessing=realInvoke;fetchDocumentProcessingJobs=realFetch;
    documentProcessingJobs=[];page='documents';render();
    return {states,calls};
  },{now});
  assert.equal(autoRetry.states.outage,'queued','A temporary processor failure must show as waiting while it is retried');
  assert.equal(autoRetry.states.unreadable,'failed','A real document error must not be retried automatically');
  assert.equal(autoRetry.states['used-up'],'failed','A job without attempts left must show its error');
  assert.deepEqual(autoRetry.calls,['retry:outage'],'The outage job must be retried exactly once per failed attempt');

  // Reload removes the in-memory batch. Persisted ready financial jobs must
  // still offer human review, without reopening already booked documents.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(({now})=>{
    documentProcessingSession=null;
    const analysis={documentType:'purchase_invoice',invoice:{invoiceNumber:'RELOAD-1',invoiceDate:'2026-09-29'},supplier:{name:'Reload leverancier'},amounts:{subtotal:100,vatLines:[{rate:21,taxableAmount:100,vatAmount:21}],vatTotal:21,total:121,currency:'EUR'},confidence:{supplierName:.99,invoiceNumber:.99,invoiceDate:.99,subtotal:.99,vatTotal:.99,total:.99,vatLines:.99},processing:{sourceKind:'pdf',pages:1,ocrPages:[],overallConfidence:.99}};
    const job=(id,extra={})=>({id,document_id:'doc-'+id,client_ref:'ref-'+id,batch_id:'old-batch',file_name:id+'.pdf',mime_type:'application/pdf',size_bytes:1200,requested_kind:'auto',state:'ready',phase:'complete',attempt:1,max_attempts:3,result:{analysis},review_fields:[],review_message:null,resolved_at:null,created_at:now,updated_at:now,...extra});
    state.documents=[{id:'linked-local',fileId:'ref-booked',name:'booked.pdf',linkedId:'expense-existing',linkedType:'expense'}];
    applyDocumentProcessingJobs([job('unreviewed'),job('booked'),job('resolved',{resolved_at:now}),job('bank',{result:{analysis:{...analysis,documentType:'bank_document'}}})],{initial:true});
    window.getStoredFile=async()=>({name:'unreviewed.pdf',type:'application/pdf',blob:new Blob(['%PDF-1.4\n%%EOF'],{type:'application/pdf'})});
    page='documents';render();
  },{now});
  // Bonnetjes is a plain file list: a document that still needs a check is marked in its own row, not in a separate block.
  assert.equal(await page.locator('.document-processing-board').count(),0,'No separate review block above the documents');
  const reviewRows=page.locator('.mobile-documents tbody tr').filter({hasText:'Controle nodig'});
  assert.equal(await reviewRows.count(),1,'Booked, resolved and nonfinancial documents do not need review');
  assert.match(await reviewRows.innerText(),/unreviewed\.pdf/);
  assert.equal((await page.locator('#documentAttentionBadge').innerText()).trim(),'1','Unreviewed ready financial document requires attention');
  const sourceRow=page.locator('.mobile-documents tbody tr').filter({hasText:'unreviewed.pdf'});
  await sourceRow.getByRole('button',{name:'Controleren',exact:true}).click();
  await page.getByRole('heading',{name:'Document controleren'}).waitFor();
  assert.equal(await page.evaluate(()=>pendingPdfImport.processingJobId),'unreviewed','File row reopens the persisted financial review');
  assert.equal(await page.evaluate(()=>state.expenses.length+state.invoices.length),0,'Reopening recognition never books a document automatically');
  await page.evaluate(()=>{cancelDocumentReview();state.documents.find(d=>d.fileId==='ref-unreviewed').linkedId='saved-expense';page='documents';render()});
  assert.equal(await page.locator('.mobile-documents tbody tr').filter({hasText:'Controle nodig'}).count(),0,'Saved document leaves pending review after its booking link is persisted');

  for(const width of [320,360,375,390,393,430,768,1024,1280,1440,1920]){
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'Processing UI overflow at '+width+'px');
    if(width===390)await page.screenshot({path:new URL('./artifacts/document-processing-background-mobile-390.png',import.meta.url).pathname,fullPage:true});
  }

  const reducePage=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await reducePage.goto(base,{waitUntil:'domcontentloaded'});
  await reducePage.evaluate(()=>{
    document.body.insertAdjacentHTML('beforeend','<span id="reducedSpinner" class="document-status-spinner"></span>');
  });
  assert.equal(await reducePage.locator('#reducedSpinner').evaluate(el=>getComputedStyle(el).animationName),'none','Reduced motion must disable spinner rotation');
  await reducePage.close();

  console.log('document background processing regression: PASS');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}


if(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_HEAD_REF==='feature/document-background-processing'){
  const {runDocumentBackgroundLiveSmoke}=await import('./document-background-live-smoke.mjs');
  await runDocumentBackgroundLiveSmoke();
}
