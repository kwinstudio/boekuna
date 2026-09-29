import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const preview=process.env.BOOKUNA_PREVIEW_URL||'https://boekuna-pr6-de1c73cb.onrender.com';
const email='document-bg-smoke@example.com';
const password='Qa!'+crypto.randomBytes(18).toString('hex')+'aA1';
const artifacts=path.resolve('tests/artifacts');
fs.mkdirSync(artifacts,{recursive:true});

const mixed=Buffer.from(fs.readFileSync('tests/fixtures/02_gemengde_btw_9_en_21.pdf.b64','utf8').trim(),'base64');
const reviewPdf=await PDFDocument.create();
const page1=reviewPdf.addPage([595,842]);
const font=await reviewPdf.embedFont(StandardFonts.Helvetica);
page1.drawText('FACTUUR',{x:50,y:780,size:20,font});
page1.drawText('Factuurnummer: QA-REVIEW-001',{x:50,y:740,size:12,font});
page1.drawText('Datum: 29-09-2026',{x:50,y:715,size:12,font});
page1.drawText('Leverancier: Testleverancier B.V.',{x:50,y:690,size:12,font});
page1.drawText('Totaal: EUR 121,00',{x:50,y:640,size:14,font});
page1.drawText('Te betalen: EUR 120,00',{x:50,y:615,size:14,font});
page1.drawText('BTW: onbekend',{x:50,y:590,size:12,font});
const review=Buffer.from(await reviewPdf.save());
const corrupt=Buffer.from('%PDF-1.7\nthis is intentionally unreadable for QA\n%%EOF');

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1280,height:900}});
const p=await context.newPage();

async function authRequest(config,pathname,body){
  const res=await fetch(config.url+pathname,{
    method:'POST',
    headers:{apikey:config.key,Authorization:'Bearer '+config.key,'content-type':'application/json'},
    body:JSON.stringify(body)
  });
  const json=await res.json().catch(()=>({}));
  return {status:res.status,ok:res.ok,json};
}
async function createCandidateSession(config){
  const signup=await authRequest(config,'/auth/v1/signup',{email,password});
  if(signup.json?.access_token)return signup.json;
  console.log('BOOKUNA_SMOKE_SIGNUP_STATUS='+signup.status);
  console.log('BOOKUNA_SMOKE_SIGNUP_ERROR='+String(signup.json?.msg||signup.json?.message||signup.json?.error_description||signup.json?.error||''));
  console.log('BOOKUNA_SMOKE_WAITING_CONFIRMATION='+email);
  for(let i=0;i<10;i++){
    const token=await authRequest(config,'/auth/v1/token?grant_type=password',{email,password});
    if(token.json?.access_token)return token.json;
    await new Promise(r=>setTimeout(r,3000));
  }
  throw new Error('Candidate QA account was not confirmed within the smoke window');
}
function authStorageKey(url){
  const ref=new URL(url).hostname.split('.')[0];
  return 'sb-'+ref+'-auth-token';
}
async function ensureApp(){
  await p.evaluate(async()=>{
    const sb=await getSupabase();
    const {data:{user}}=await sb.auth.getUser();
    if(user&&(!currentUser||currentUser.id!==user.id)){await hydrateCloudAccount(user);enterApp()}
  });
  await p.waitForFunction(()=>!!currentUser&&getComputedStyle(document.getElementById('mainApp')).display!=='none',{timeout:30000});
}
async function waitForJobs(n){
  await p.waitForFunction(n=>Array.isArray(documentProcessingJobs)&&documentProcessingJobs.length>=n,n,{timeout:60000});
}
async function terminalSnapshot(){
  return await p.evaluate(()=>documentProcessingJobs.map(j=>({id:j.id,state:j.state,attempt:Number(j.attempt||0),client_ref:j.client_ref,file_name:j.file_name,review_fields:j.review_fields||[],error_code:j.error_code||''})));
}

try{
  await p.goto(preview,{waitUntil:'domcontentloaded',timeout:20000});
  const runtime=await p.evaluate(()=>({supabase:SUPABASE_URL,key:SUPABASE_PUBLISHABLE_KEY,processor:DOCUMENT_PROCESSOR_URL,max:DOCUMENT_PROCESSING_MAX_FILES,parallel:DOCUMENT_PROCESSING_MAX_PARALLEL}));
  const target={supabase:runtime.supabase,processor:runtime.processor,max:runtime.max,parallel:runtime.parallel};
  assert.equal(target.supabase,'https://ozisiotrzeubwbffnxyr.supabase.co','Preview must target candidate Supabase');
  assert.equal(target.processor,'https://boekuna-pr6-de1c73cb-processor.onrender.com','Preview must target candidate processor');
  assert.equal(target.max,10);
  assert.equal(target.parallel,2);

  const auth=await createCandidateSession({url:runtime.supabase,key:runtime.key});
  console.log('BOOKUNA_SMOKE_AUTH_USER_ID='+(auth.user?.id||''));
  const storedSession={
    access_token:auth.access_token,
    refresh_token:auth.refresh_token,
    token_type:auth.token_type||'bearer',
    expires_in:Number(auth.expires_in||3600),
    expires_at:Math.floor(Date.now()/1000)+Number(auth.expires_in||3600),
    user:auth.user
  };
  await p.evaluate(({key,value})=>localStorage.setItem(key,value),{key:authStorageKey(runtime.supabase),value:JSON.stringify(storedSession)});
  await p.reload({waitUntil:'domcontentloaded',timeout:30000});
  await ensureApp();

  const input=p.locator('#invoicePdfFile');
  await input.setInputFiles([
    {name:'01-mixed-vat.pdf',mimeType:'application/pdf',buffer:mixed},
    {name:'02-mixed-vat-copy.pdf',mimeType:'application/pdf',buffer:mixed},
    {name:'03-review-required.pdf',mimeType:'application/pdf',buffer:review},
    {name:'04-unreadable.pdf',mimeType:'application/pdf',buffer:corrupt},
    {name:'05-unreadable.pdf',mimeType:'application/pdf',buffer:corrupt}
  ]);
  await p.evaluate(()=>startDocumentProcessingQueue([...document.getElementById('invoicePdfFile').files],'auto',{sourceInputId:'invoicePdfFile'}));
  await p.waitForFunction(()=>documentProcessingSession?.persistent&&documentProcessingSession.allReceived===true,{timeout:120000});
  assert.match(await p.locator('.document-processing-board').innerText(),/Je documenten zijn ontvangen/i);

  const afterReceive=await p.evaluate(()=>({
    batch:documentProcessingSession.id,
    received:documentProcessingSession.items.filter(x=>x.receivedPersisted).length,
    transfers:activeDocumentTransfers,
    jobs:documentProcessingJobs.length,
    active:documentProcessingJobs.filter(j=>!PERSISTENT_DOCUMENT_TERMINAL.has(j.state)).length
  }));
  assert.equal(afterReceive.received,5);
  assert.equal(afterReceive.transfers,0);

  await p.evaluate(()=>navigate('dashboard'));
  await p.waitForFunction(()=>page==='dashboard');
  if(afterReceive.active>0)assert.equal(await p.locator('#documentProcessingGlobal').isVisible(),true,'Global indicator must remain visible after navigation');
  await p.evaluate(()=>navigate('contacts'));
  await p.waitForFunction(()=>page==='contacts');
  if(afterReceive.active>0)assert.equal(await p.locator('#documentProcessingGlobal').isVisible(),true,'Global indicator must persist across pages');

  await p.reload({waitUntil:'domcontentloaded',timeout:30000});
  await ensureApp();
  await waitForJobs(5);
  await p.evaluate(()=>navigate('documents'));
  await p.waitForFunction(()=>page==='documents');
  assert.equal(await p.evaluate(()=>documentProcessingJobs.length),5,'Refresh must not create duplicate jobs');

  await context.setOffline(true);
  await p.evaluate(()=>{documentProcessingConnectivityLost=true;render()});
  assert.match(await p.locator('.document-processing-board').innerText(),/Verbinding onderbroken/i);
  assert.match(await p.locator('.document-processing-board').innerText(),/documenten zijn ontvangen/i);
  await context.setOffline(false);
  await p.evaluate(()=>{documentProcessingConnectivityLost=false;window.dispatchEvent(new Event('online'))});

  await p.waitForFunction(()=>documentProcessingJobs.length===5&&documentProcessingJobs.every(j=>PERSISTENT_DOCUMENT_TERMINAL.has(j.state)),{timeout:240000});
  const terminal=await terminalSnapshot();
  const counts=terminal.reduce((a,j)=>(a[j.state]=(a[j.state]||0)+1,a),{});
  assert.equal(terminal.length,5);
  assert.ok((counts.ready||0)+(counts.review_required||0)>=2,'Readable documents must finish independently');
  assert.ok((counts.failed||0)>=1,'Unreadable document must fail without failing the batch');
  assert.ok((counts.review_required||0)>=1,'Incomplete financial document must require human review');

  const refs=await p.evaluate(()=>documentProcessingJobs.map(j=>j.client_ref));
  assert.equal(new Set(refs).size,5,'Each uploaded source must have exactly one job');

  const reviewJob=terminal.find(j=>j.state==='review_required');
  await p.evaluate(id=>openPersistentDocumentReview(id),reviewJob.id);
  await p.waitForSelector('#pdfImportForm',{timeout:30000});
  assert.equal(await p.locator('#pdfImportForm').count(),1);
  await p.evaluate(()=>cancelDocumentReview());

  const failed=terminal.find(j=>j.state==='failed');
  const beforeAttempts=Object.fromEntries(terminal.map(j=>[j.id,j.attempt]));
  await p.evaluate(id=>retryPersistentDocument(id),failed.id);
  await p.waitForFunction(({id,attempt})=>{const j=documentProcessingJobs.find(x=>x.id===id);return !!j&&(Number(j.attempt||0)>attempt||!PERSISTENT_DOCUMENT_TERMINAL.has(j.state))},{id:failed.id,attempt:failed.attempt},{timeout:60000});
  await p.waitForFunction(id=>{const j=documentProcessingJobs.find(x=>x.id===id);return !!j&&PERSISTENT_DOCUMENT_TERMINAL.has(j.state)},failed.id,{timeout:180000});
  const afterRetry=await terminalSnapshot();
  assert.equal(afterRetry.length,5,'Retry must not create a new job');
  for(const j of afterRetry){
    if(j.id===failed.id)assert.ok(j.attempt>beforeAttempts[j.id],'Only selected failed job must increment attempt');
    else assert.equal(j.attempt,beforeAttempts[j.id],'Retry must not restart other batch items');
  }

  const sbState=await p.evaluate(async()=>{const sb=await getSupabase();await sb.auth.signOut();return true});
  assert.equal(sbState,true);
  await p.waitForTimeout(800);
  const relog=await p.evaluate(async({email,password})=>{const sb=await getSupabase();const {data,error}=await sb.auth.signInWithPassword({email,password});return {ok:!!data?.session,error:error?.message||''}},{email,password});
  assert.equal(relog.ok,true,'QA user must be able to log back in');
  await ensureApp();
  await waitForJobs(5);
  assert.equal(await p.evaluate(()=>documentProcessingJobs.length),5,'Logout/login must restore status without duplicate processing');

  await p.evaluate(()=>navigate('documents'));
  await p.waitForTimeout(300);
  await p.screenshot({path:path.join(artifacts,'document-background-live-smoke.png'),fullPage:true});

  const final=await terminalSnapshot();
  console.log('BOOKUNA_LIVE_SMOKE_RESULT='+JSON.stringify({target,afterReceive,counts,final}));
  console.log('document background live smoke: PASS');
}finally{
  await browser.close();
}
