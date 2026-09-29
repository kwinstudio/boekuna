import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260929201500_document_background_processing.sql',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../supabase/functions/document-processing/index.ts',import.meta.url),'utf8');
const financialCorrectionSource=fs.readFileSync(new URL('../public/assets/financial-correction.js',import.meta.url),'utf8');

function replaceLast(source,needle,replacement){
  const i=source.lastIndexOf(needle);
  if(i<0)throw new Error('Missing bootstrap marker: '+needle);
  return source.slice(0,i)+replacement+source.slice(i+needle.length);
}

assert.match(migration,/unique \(user_id, document_id\)/,'One persistent job per user/document is required');
assert.match(migration,/enable row level security/,'Processing jobs must have RLS enabled');
assert.match(migration,/auth\.uid\(\)\) = user_id/,'Processing status must be tenant scoped');
assert.match(migration,/revoke insert, update, delete on public\.document_processing_jobs from anon, authenticated/,'Clients must not mutate jobs directly');
assert.match(worker,/\.eq\("user_id",a\.user\.id\)/,'Worker actions must enforce ownership');
assert.match(worker,/\.eq\("state","queued"\)/,'Job claim must be state guarded for idempotency');
assert.match(worker,/if\(existing\)/,'Enqueue must reuse an existing document job');
assert.match(worker,/if\(!\["failed","review_required"\]\.includes\(job\.state\)\)/,'Retry must target one terminal problem job');
assert.match(worker,/state:"ready".*review_fields:\[\]/s,'Resolved human review must clear attention state');
assert.match(original,/fileId=sourceClientRef\|\|uid\('file'\)/,'Review save must reuse an already persisted source');
assert.match(original,/if\(!sourceClientRef\)\{try\{await putStoredFile/,'Persisted sources must not be uploaded again on save');
assert.match(original,/mixedRates=!!pendingPdfImport\.parsed\?\.mixedRates\|\|trustedVatRates\.length>1,rate=mixedRates\?null/,'Mixed VAT must never collapse to a scalar rate');
assert.match(original,/activeDocumentTransfers>0.*beforeunload/s,'Only active browser transfers should trigger unload protection');
assert.match(original,/setTimeout\(\(\)=>\{documentProcessingPollTimer=null;fetchDocumentProcessingJobs\(\).*15000/s,'Fallback polling must be bounded and non-aggressive');

let appHtml=original.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
appHtml=replaceLast(appHtml,'initAuth();',`
currentUser=TEST_USER;
state=structuredClone(DEFAULT);
for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
enterApp();
`);

const server=http.createServer((req,res)=>{
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
  assert.equal((await page.locator('#documentAttentionBadge').innerText()).trim(),'2','Review + failure require attention');
  assert.match(await page.locator('#documentProcessingGlobalText').innerText(),/3\/5/);

  await page.locator('#documentProcessingGlobal').click();
  assert.equal(await page.getByRole('heading',{name:'Documenten verwerken'}).count(),1);
  assert.match(await page.locator('#modalRoot').innerText(),/3 van 5 afgerond/);
  await page.getByRole('button',{name:'Sluiten'}).click();

  await page.evaluate(()=>{documentProcessingConnectivityLost=true;page='documents';render()});
  assert.match(await page.locator('.document-processing-board').innerText(),/Verbinding onderbroken/);
  assert.match(await page.locator('.document-processing-board').innerText(),/documenten zijn ontvangen/i);

  for(const width of [320,360,375,390,393,430,768,1024,1280,1440,1920]){
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'Processing UI overflow at '+width+'px');
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
