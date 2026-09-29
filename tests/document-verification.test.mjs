import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
const financialCorrectionSource=fs.readFileSync(new URL('../public/assets/financial-correction.js',import.meta.url),'utf8');
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
  if(req.url?.startsWith('/assets/financial-correction.js')){res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});return res.end(financialCorrectionSource)}
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

function processorPayload({net=100,vatAmount=21,gross=121,vatRate=21,vatLines=null,mixedRates=false}={}){
  const groups=vatLines??[{rate:vatRate,taxableAmount:net,vatAmount}];
  return {
    ok:true,processor:true,model:'gpt-5.6-sol',pass:'verify',usage:{input_tokens:5000,output_tokens:500},
    data:{
      documentType:'purchase_invoice',originalFileName:'verified.pdf',pageCount:1,
      supplier:{name:'Voorbeeld Leverancier BV',address:null,postalCode:null,city:null,country:'Nederland',kvk:null,vatNumber:null,iban:null,email:null},
      customer:{name:null,address:null,postalCode:null,city:null,country:null,kvk:null,vatNumber:null,iban:null,email:null},
      invoice:{invoiceNumber:'INK-100',invoiceDate:'2026-09-27',dueDate:null,paymentTermDays:null,orderNumber:null,paymentReference:null,description:'Consultancy september'},
      amounts:{subtotal:net,vatLines:groups,vatTotal:vatAmount,total:gross,settlementAmount:null,discount:null,shipping:null,currency:'EUR'},
      status:'open',lineItems:[{description:'Consultancy september',quantity:1,unitPrice:net,vatRate,lineTotal:net}],adjustments:[],
      confidence:{supplierName:.95,invoiceNumber:.95,invoiceDate:.95,description:.95,subtotal:.98,vatTotal:.98,total:.98,vatLines:.98},
      warnings:[],processing:{ai:true,aiModel:'gpt-5.6-sol',overallConfidence:.94,independentVerification:true,amountDerivation:{mixedRates}}
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
  const gate=await page.evaluate(()=>{
    const strongDoc={recognitionBad:0,recognitionWarn:0,confidenceScore:96,mixedRates:false,fieldConfidence:{party:95,gross:98,vatLines:99,description:92},processor:{ocrUsed:false}};
    const weakDoc={recognitionBad:0,recognitionWarn:1,confidenceScore:82,mixedRates:false,fieldConfidence:{party:75,gross:85},processor:{ocrUsed:true,ocrConfidence:.71}};
    const weakVatDoc={recognitionBad:0,recognitionWarn:0,confidenceScore:96,mixedRates:false,fieldConfidence:{party:95,gross:98,vatLines:55,description:92},processor:{ocrUsed:false}};
    return {
      enabled:EXTERNAL_AI_REVIEW_ENABLED,
      strong:shouldQueueDocumentVerification(strongDoc),
      weak:shouldQueueDocumentVerification(weakDoc),
      weakVatLines:shouldQueueDocumentVerification(weakVatDoc),
      weakReasons:documentVerificationReasons(weakDoc),
      weakVatReasons:documentVerificationReasons(weakVatDoc)
    };
  });
  assert.equal(gate.enabled,false,'External AI review must be disabled by default');
  assert.equal(gate.strong,false,'Strong deterministic documents must not queue a second pass');
  assert.equal(gate.weak,false,'Uncertain/OCR documents must not call external AI while disabled');
  assert.equal(gate.weakVatLines,false,'Weak VAT-group confidence must not call external AI while disabled');
  assert.ok(gate.weakReasons.length>0,'Uncertain/OCR documents must still be marked for human review');
  assert.ok(gate.weakVatReasons.includes('vat-lines-confidence'),'Weak VAT-group confidence must still be surfaced for review');

  const cents=await page.evaluate(()=>[financialMoneyCents('1.005'),financialMoneyCents('-1.005'),financialMoneyCents('12100.01')]);
  assert.deepEqual(cents,[101,-101,1210001],'Money conversion must use deterministic half-up minor units');

  const base={party:'Voorbeeld Leverancier BV',issueDate:'2026-09-27',description:'Consultancy september',net:100,vatAmount:21,gross:121,vatRate:21,vatLines:[{rate:21,taxableAmount:100,vatAmount:21}],invoiceNumber:'INK-100',currency:'EUR',mixedRates:false};

  // Agreement: independent pass only updates verification metadata, never bookkeeping values.
  await putDoc('agree',pendingVerification(base));
  await installMock([{status:200,body:processorPayload()}]);
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

  // One cent is a real financial difference. Percentage-based tolerances may not hide it.
  await putDoc('one-cent',pendingVerification(base));
  await installMock([{status:200,body:processorPayload({vatAmount:21.01,gross:121.01,vatLines:[{rate:21,taxableAmount:100,vatAmount:21.01}]})}]);
  await page.evaluate(()=>runDocumentVerification('one-cent'));
  await page.waitForFunction(()=>state.documents.find(d=>d.id==='one-cent')?.verification?.status==='needs_review');
  const oneCent=await page.evaluate(()=>structuredClone(state.documents.find(d=>d.id==='one-cent').verification));
  assert.ok(oneCent.differences.some(x=>x.field==='vatAmount'&&x.current===21&&x.alternative===21.01),'A one-cent VAT difference must be surfaced');
  assert.ok(oneCent.differences.some(x=>x.field==='gross'&&x.current===121&&x.alternative===121.01),'A one-cent gross difference must be surfaced');

  // VAT substructure is financial truth too: equal top-level totals may not hide a wrong VAT breakdown.
  await putDoc('vat-lines',pendingVerification(base));
  await installMock([{status:200,body:processorPayload({vatLines:[{rate:21,taxableAmount:90,vatAmount:21}]})}]);
  await page.evaluate(()=>runDocumentVerification('vat-lines'));
  await page.waitForFunction(()=>state.documents.find(d=>d.id==='vat-lines')?.verification?.status==='needs_review');
  const vatLinesMismatch=await page.evaluate(()=>structuredClone(state.documents.find(d=>d.id==='vat-lines').verification));
  assert.ok(vatLinesMismatch.differences.some(x=>x.field==='vatLines'),'PASS 2 must compare VAT groups, not just headline VAT');

  // Persistence guard: single-rate groups are rebuilt from user-confirmed totals; mixed-rate groups must reconcile exactly.
  const vatPersistence=await page.evaluate(()=>({
    single:trustedVatLinesForImport({mixedRates:false,vatLines:[{rate:21,taxableAmount:3.63,vatAmount:4.39}]},100,21,21),
    mixedGood:trustedVatLinesForImport({mixedRates:true,vatLines:[{rate:9,taxableAmount:100,vatAmount:9},{rate:21,taxableAmount:100,vatAmount:21}]},200,30,0),
    mixedBad:trustedVatLinesForImport({mixedRates:true,vatLines:[{rate:9,taxableAmount:100,vatAmount:9},{rate:21,taxableAmount:90,vatAmount:21}]},200,30,0),
    zeroRateConflict:trustedVatLinesForImport({mixedRates:false,vatLines:[]},100,21,0)
  }));
  assert.deepEqual(vatPersistence.single,{ok:true,lines:[{rate:21,taxableAmount:100,vatAmount:21}]},'Single-rate VAT groups must come from confirmed headline values');
  assert.equal(vatPersistence.mixedGood.ok,true,'A cent-exact mixed VAT split may be persisted');
  assert.equal(vatPersistence.mixedBad.ok,false,'A mixed VAT split that does not reconcile must be blocked');
  assert.equal(vatPersistence.zeroRateConflict.ok,false,'0% may not be stored when the confirmed VAT amount is non-zero');

  // Final save validation is exact in currency minor units; large invoices may not hide a one-cent mismatch.
  const schemaCentCheck=await page.evaluate(()=>validateCandidateSchema({
    type:'purchase',party:'Voorbeeld Leverancier BV',documentType:'purchase_invoice',invoiceNumber:'BIG-1',issueDate:'2026-09-27',
    net:10000,vatAmount:2100,gross:12100.01,dueDate:'',iban:'',kvk:'',vatId:''
  }));
  assert.ok(schemaCentCheck.some(x=>/cent-exact/.test(x)),'A €0.01 mismatch on a large invoice must block final save');

  const settlementChecks=await page.evaluate(()=>invoiceRecognitionChecks({
    type:'sale',party:'Klant BV',documentType:'sale_invoice',invoiceNumber:'SET-1',issueDate:'2026-09-27',
    net:10000,vatAmount:2100,gross:12100,vatRate:21,payout:12000,
    adjustments:[{type:'factoring_fee',gross:100.01}],lineItems:[],mixedRates:false
  }));
  assert.ok(settlementChecks.some(x=>x.code==='factoring'&&x.level==='warn'),'A one-cent settlement mismatch may not be marked as reconciled');

  // Relevant financial disagreement: store both values and flag, never choose one automatically.
  await putDoc('mismatch',pendingVerification(base));
  await installMock([{status:200,body:processorPayload({vatAmount:12,gross:112,vatRate:12})}]);
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
  console.log('Document verification regression: PASS (cent-exact PASS2, VAT-group comparison, trusted persistence, immutable bookkeeping, discrepancies, finite retries, mobile status)');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
