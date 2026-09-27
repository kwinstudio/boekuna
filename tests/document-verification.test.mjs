import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
function replaceLast(source,needle,replacement){
  const i=source.lastIndexOf(needle);if(i<0)throw new Error('Missing bootstrap marker: '+needle);
  return source.slice(0,i)+replacement+source.slice(i+needle.length);
}
let appHtml=original.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
appHtml=replaceLast(appHtml,'initAuth();',String.raw`
currentUser=TEST_USER;
state=structuredClone(DEFAULT);
state.company={...state.company,name:'Verification QA BV',email:'qa@example.test',phone:'0101234567',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300'};
state.contacts=[{id:'supplier-1',type:'supplier',name:'Voorbeeld Leverancier BV',email:'',phone:'',address:'',postal:'',city:'',kvk:'',vat:''}];
state.expenses=[{id:'expense-1',vendor:'Voorbeeld Leverancier BV',date:'2026-09-27',category:'Inkoop',paymentMethod:'Bank',exVat:100,vatRate:21,vatAmount:21,gross:121,invoiceNumber:'INK-100'}];
state.documents=[];
enterApp();
`);

const server=http.createServer((req,res)=>{
  if(req.url?.startsWith('/manifest.webmanifest')){res.writeHead(200,{'content-type':'application/manifest+json'});return res.end('{}')}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(appHtml);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {port}=server.address();
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));

function aiPayload(overrides={}){
  return {
    ok:true,model:'gpt-5.6-sol',pass:'verify',usage:{input_tokens:5000,output_tokens:500},
    data:{
      documentType:'purchase_invoice',type:'purchase',party:'Voorbeeld Leverancier BV',
      email:null,phone:null,vatId:null,kvk:null,address:null,postal:null,city:null,country:'Nederland',iban:null,
      invoiceNumber:'INK-100',issueDate:'2026-09-27',dueDate:null,paymentReference:null,
      description:'Consultancy september',orderNumber:null,currency:'EUR',paymentTermDays:null,
      net:100,vatAmount:21,gross:121,vatRate:21,payout:null,discount:null,shipping:null,
      selfBilling:false,status:'open',mixedRates:false,vatLines:[{rate:21,taxableAmount:100,vatAmount:21}],
      lineItems:[{desc:'Consultancy september',qty:1,unit:100,vat:21,total:100}],adjustments:[],adjustmentParty:null,
      confidence:94,fieldConfidence:{party:95,email:0,phone:0,vatId:0,kvk:0,address:0,postal:0,city:0,country:90,iban:0,invoiceNumber:95,issueDate:95,dueDate:0,paymentReference:0,description:90,net:98,vatAmount:98,gross:98,vatRate:98,payout:0,currency:95,orderNumber:0,paymentTermDays:0},
      warnings:[],reasoningSummary:'Zelfstandig uit het document bepaald.',
      ...overrides
    }
  };
}

async function installMock(queue){
  await page.evaluate(queue=>{
    window.__verificationFetchCount=0;
    window.__verificationQueue=queue;
    window.fetch=async (url,opts={})=>{
      if(String(url).includes('/analyze-invoice')){
        window.__verificationFetchCount++;
        const next=window.__verificationQueue.shift()||{status:503,body:{ok:false,error:'NO_RESPONSE'}};
        return new Response(JSON.stringify(next.body),{status:next.status,headers:{'content-type':'application/json'}});
      }
      return new Response(JSON.stringify({ok:true}),{status:200,headers:{'content-type':'application/json'}});
    };
  },queue);
}

async function putDoc(id,verification){
  await page.evaluate(({id,verification})=>{
    state.documents.push({id,fileId:'file-'+id,name:id+'.pdf',type:'purchase_invoice',date:'2026-09-27',linkedType:'expense',linkedId:'expense-1',source:'document-import',verification});
    save();
  },{id,verification});
}

function pendingVerification(pass1){
  return {version:1,key:'sha-test',status:'pending',method:'independent-ai',attempts:0,maxAttempts:2,reasons:['lower-confidence'],pass1,sourceText:'Voorbeeld documenttekst',createdAt:new Date().toISOString(),differences:[],financialIssues:[]};
}

try{
  await page.goto(`http://127.0.0.1:${port}/app`,{waitUntil:'domcontentloaded'});

  // Conditional gate: a clean deterministic document should not consume PASS 2.
  const gate=await page.evaluate(()=>({
    strong:shouldQueueDocumentVerification({recognitionBad:0,recognitionWarn:0,confidenceScore:96,mixedRates:false,fieldConfidence:{party:95,gross:98},processor:{ocrUsed:false}}),
    weak:shouldQueueDocumentVerification({recognitionBad:0,recognitionWarn:1,confidenceScore:82,mixedRates:false,fieldConfidence:{party:75,gross:85},processor:{ocrUsed:true,ocrConfidence:.71}})
  }));
  assert.equal(gate.strong,false,'Strong deterministic documents must skip the paid second AI pass');
  assert.equal(gate.weak,true,'Uncertain/OCR documents must queue independent verification');

  const base={party:'Voorbeeld Leverancier BV',issueDate:'2026-09-27',description:'Consultancy september',net:100,vatAmount:21,gross:121,vatRate:21,invoiceNumber:'INK-100',currency:'EUR',mixedRates:false};

  // Agreement: independent pass only updates verification metadata, never bookkeeping values.
  await putDoc('agree',pendingVerification(base));
  await installMock([{status:200,body:aiPayload()}]);
  const expenseBefore=await page.evaluate(()=>structuredClone(state.expenses[0]));
  await page.evaluate(()=>runDocumentVerification('agree'));
  await page.waitForFunction(()=>state.documents.find(d=>d.id==='agree')?.verification?.status==='verified');
  const agree=await page.evaluate(()=>structuredClone(state.documents.find(d=>d.id==='agree').verification));
  const expenseAfter=await page.evaluate(()=>structuredClone(state.expenses[0]));
  assert.equal(agree.status,'verified');
  assert.equal(agree.attempts,1);
  assert.deepEqual(agree.differences,[]);
  assert.deepEqual(expenseAfter,expenseBefore,'PASS 2 may not silently mutate the saved financial record');
  assert.equal(await page.evaluate(()=>window.__verificationFetchCount),1);

  // Relevant financial disagreement: store both values and flag, never choose one automatically.
  await putDoc('mismatch',pendingVerification(base));
  await installMock([{status:200,body:aiPayload({vatAmount:12,gross:112,vatRate:12})}]);
  await page.evaluate(()=>runDocumentVerification('mismatch'));
  await page.waitForFunction(()=>state.documents.find(d=>d.id==='mismatch')?.verification?.status==='needs_review');
  const mismatch=await page.evaluate(()=>structuredClone(state.documents.find(d=>d.id==='mismatch').verification));
  assert.equal(mismatch.status,'needs_review');
  assert.ok(mismatch.differences.some(x=>x.field==='vatAmount'&&x.current===21&&x.alternative===12),'VAT difference must preserve current and alternative values');
  assert.ok(mismatch.differences.some(x=>x.field==='gross'&&x.current===121&&x.alternative===112),'Gross difference must be surfaced');
  assert.equal(await page.evaluate(()=>state.expenses[0].vatAmount),21,'Saved VAT must remain untouched');
  assert.equal(await page.evaluate(()=>state.expenses[0].gross),121,'Saved gross must remain untouched');

  // Provider failure: basic document remains, finite retries, no duplicate result/cost loop.
  await putDoc('failure',pendingVerification(base));
  await installMock([
    {status:503,body:{ok:false,error:'AI_SERVICE_UNAVAILABLE'}},
    {status:503,body:{ok:false,error:'AI_SERVICE_UNAVAILABLE'}}
  ]);
  await page.evaluate(()=>runDocumentVerification('failure'));
  await page.waitForFunction(()=>state.documents.find(d=>d.id==='failure')?.verification?.status==='technical_error');
  let failed=await page.evaluate(()=>structuredClone(state.documents.find(d=>d.id==='failure').verification));
  assert.equal(failed.attempts,1);
  assert.equal(await page.evaluate(()=>state.documents.filter(d=>d.id==='failure').length),1,'Provider failure may not duplicate the document');
  await page.evaluate(()=>{const v=state.documents.find(d=>d.id==='failure').verification;v.status='pending';v.nextRetryAt=0});
  await page.evaluate(()=>runDocumentVerification('failure'));
  await page.waitForFunction(()=>state.documents.find(d=>d.id==='failure')?.verification?.attempts===2);
  failed=await page.evaluate(()=>structuredClone(state.documents.find(d=>d.id==='failure').verification));
  assert.equal(failed.status,'technical_error');
  await page.evaluate(()=>{const v=state.documents.find(d=>d.id==='failure').verification;v.status='pending';v.nextRetryAt=0});
  await page.evaluate(()=>runDocumentVerification('failure'));
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(()=>window.__verificationFetchCount),2,'Automatic verification must stop after max attempts');

  // User-facing status and discrepancy details work on desktop and mobile.
  await page.evaluate(()=>navigate('documents'));
  await page.locator('text=Controle nodig').first().waitFor();
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>render());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'Verification status UI must not cause mobile page overflow');
  await page.evaluate(()=>openDocumentVerification('mismatch'));
  await page.getByRole('heading',{name:'Controle nodig'}).waitFor();
  const body=await page.locator('.modal-body').innerText();
  assert.match(body,/Opgeslagen:/);
  assert.match(body,/Extra controle:/);
  assert.match(body,/€\s*21,00|21,00/);
  assert.match(body,/€\s*12,00|12,00/);

  assert.deepEqual(errors,[],'Browser page errors: '+errors.join(' | '));
  console.log('Document verification regression: PASS (conditional non-blocking PASS2, immutable bookkeeping, discrepancies, finite retries, mobile status)');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
