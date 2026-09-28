import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const FIXTURE=path.join(ROOT,'tests','fixtures','02_gemengde_btw_9_en_21.pdf.b64');
const APP_ORIGIN='https://boekuna-boekhouding.onrender.com';
const PROCESSOR='https://kwinest-docprocessor.onrender.com';
const EMAIL=process.env.BOOKUNA_MARKETING_CAPTURE_EMAIL||'';
const PASSWORD=process.env.BOOKUNA_MARKETING_CAPTURE_PASSWORD||'';
const TARGET_SHA='7b9de3b37c1d84e01b15ec704a5420eece5b4bfd';
const INVOICE='KKG/26/09/7741';

assert.ok(EMAIL&&PASSWORD,'Dedicated production QA credentials are required');
assert.ok(fs.existsSync(FIXTURE),'Original mixed VAT fixture is missing');

const pdfBytes=Buffer.from(fs.readFileSync(FIXTURE,'utf8').trim(),'base64');
const tmp=path.join(ROOT,'tests','.qa-live-pr28-mixed-vat.pdf');
fs.writeFileSync(tmp,pdfBytes);

const cents=v=>v==null?null:Math.round(Number(v)*100);
const canon=lines=>(lines||[]).map(v=>({
  rate:Number(v.rate),
  taxableAmount:Number(v.taxableAmount),
  vatAmount:Number(v.vatAmount)
})).sort((a,b)=>a.rate-b.rate);

function assertTruth(label,x){
  assert.equal(x.invoiceNumber,INVOICE,label+' invoice number');
  assert.equal(cents(x.net),42995,label+' net');
  assert.equal(cents(x.vatAmount),5249,label+' VAT total');
  assert.equal(cents(x.gross),48244,label+' gross');
  assert.equal(x.mixedRates,true,label+' mixedRates');
  assert.equal(x.vatRate,null,label+' scalar vatRate must be null');
  assert.deepEqual(canon(x.vatLines),[
    {rate:9,taxableAmount:315,vatAmount:28.35},
    {rate:21,taxableAmount:114.95,vatAmount:24.14}
  ],label+' trusted VAT groups');
}

const healthResponse=await fetch(PROCESSOR+'/health',{headers:{'user-agent':'boekuna-03a-live-qa'}});
const health=await healthResponse.json();
assert.equal(healthResponse.status,200,'production processor health HTTP');
assert.equal(health.ok,true,'production processor health ok');
assert.equal(health.version,'3.0','production processor version');
console.log('LIVE_HEALTH '+JSON.stringify({status:healthResponse.status,health}));

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(String(e)));

let originalState=null;
let testFileId=null;
let testExpenseId=null;
let testDocId=null;
let liveResult=null;

try{
  await page.goto(APP_ORIGIN+'/?login=1&qa='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('#loginEmail').waitFor({timeout:30000});
  await page.locator('#loginEmail').fill(EMAIL);
  await page.locator('#loginPassword').fill(PASSWORD);
  await page.locator('#authForm button[type="submit"]').click();
  await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor({timeout:60000});

  const entitlement=await page.evaluate(async()=>{
    const b=await loadBillingSummary(true);
    return {allowed:hasBoekunaSmartLayer(b),plan:b?.plan||null,status:b?.status||null,entitlement_status:b?.entitlement_status||null};
  });
  assert.equal(entitlement.allowed,true,'dedicated QA account must have live smart-document entitlement');

  originalState=await page.evaluate(()=>structuredClone(state));
  const preexisting=await page.evaluate(invoice=>({
    expenses:state.expenses.filter(e=>String(e.invoiceNumber||'')===invoice).length,
    documents:state.documents.filter(d=>String(d.name||'').includes('02_gemengde_btw_9_en_21')).length
  }),INVOICE);
  assert.deepEqual(preexisting,{expenses:0,documents:0},'dedicated QA account must start without this fixture');

  await page.evaluate(()=>navigate('documents'));
  await page.locator('#pageTitle').filter({hasText:'Documenten'}).waitFor();
  await page.evaluate(()=>{pendingUploadKind='purchase'});

  const analyzePromise=page.waitForResponse(r=>r.url()===PROCESSOR+'/analyze'&&r.request().method()==='POST',{timeout:180000});
  await page.locator('#docFile').setInputFiles(tmp);
  const analyzeResponse=await analyzePromise;
  const analyzeJson=await analyzeResponse.json();
  assert.equal(analyzeResponse.status(),200,'live PASS1 /analyze status');
  assert.equal(analyzeJson?.ok,true,'live PASS1 /analyze ok');

  const raw1=analyzeJson.data||{};
  const raw1Lines=canon(raw1?.amounts?.vatLines);
  assert.equal(raw1?.invoice?.invoiceNumber,INVOICE,'PASS1 processor invoice number');
  assert.equal(cents(raw1?.amounts?.subtotal),42995,'PASS1 processor net');
  assert.equal(cents(raw1?.amounts?.vatTotal),5249,'PASS1 processor VAT total');
  assert.equal(cents(raw1?.amounts?.total),48244,'PASS1 processor gross');
  assert.equal(raw1Lines.length,2,'PASS1 processor exact trusted VAT group count');
  assert.deepEqual(raw1Lines,[
    {rate:9,taxableAmount:315,vatAmount:28.35},
    {rate:21,taxableAmount:114.95,vatAmount:24.14}
  ]);
  assert.equal(!!raw1?.processing?.amountDerivation?.mixedRates,true,'PASS1 processor mixedRates');
  assert.notEqual(cents(raw1?.amounts?.subtotal),45409,'PASS1 must not regress to old wrong net');
  console.log('LIVE_PASS1 '+JSON.stringify({
    status:analyzeResponse.status(),
    invoiceNumber:raw1?.invoice?.invoiceNumber,
    net:raw1?.amounts?.subtotal,
    vatAmount:raw1?.amounts?.vatTotal,
    gross:raw1?.amounts?.total,
    mixedRates:!!raw1?.processing?.amountDerivation?.mixedRates,
    vatLines:raw1Lines,
    vatLineSource:raw1?.processing?.vatLineSource||null
  }));

  await page.getByRole('heading',{name:'Document controleren'}).waitFor({timeout:30000});
  const review=await page.evaluate(()=>({
    invoiceNumber:pendingPdfImport?.parsed?.invoiceNumber||'',
    net:pendingPdfImport?.parsed?.net??null,
    vatAmount:pendingPdfImport?.parsed?.vatAmount??null,
    gross:pendingPdfImport?.parsed?.gross??null,
    mixedRates:!!pendingPdfImport?.parsed?.mixedRates,
    vatRate:pendingPdfImport?.parsed?.vatRate??null,
    vatLines:pendingPdfImport?.parsed?.vatLines||[],
    selected:document.querySelector('#pdfImportForm [name="vatRate"]')?.value??null,
    selectedText:document.querySelector('#pdfImportForm [name="vatRate"] option:checked')?.textContent?.trim()||'',
    iban:pendingPdfImport?.parsed?.iban||'',
    schemaErrors:validateCandidateSchema(pendingPdfImport?.parsed||{})
  }));
  assertTruth('review',review);
  assert.equal(review.selected,'','review VAT select must have no scalar value');
  assert.equal(review.selectedText,'Gemengd / controleer','review mixed VAT label');
  console.log('LIVE_REVIEW '+JSON.stringify({
    invoiceNumber:review.invoiceNumber,net:review.net,vatAmount:review.vatAmount,gross:review.gross,
    mixedRates:review.mixedRates,vatRate:review.vatRate,vatLines:canon(review.vatLines),
    selectedText:review.selectedText,ibanPresent:!!review.iban,schemaErrors:review.schemaErrors
  }));

  // Independent live PASS2 call against the deployed production /verify endpoint
  // using the exact same original PDF bytes and the authenticated QA session.
  const accessToken=await page.evaluate(()=>getApiAccessToken());
  const directVerifyForm=new FormData();
  directVerifyForm.append('file',new Blob([pdfBytes],{type:'application/pdf'}),'02_gemengde_btw_9_en_21.pdf');
  directVerifyForm.append('company_json',JSON.stringify(await page.evaluate(()=>state.company||{})));
  const directVerifyResponse=await fetch(PROCESSOR+'/verify',{
    method:'POST',
    headers:{Authorization:'Bearer '+accessToken,Origin:APP_ORIGIN},
    body:directVerifyForm
  });
  const directVerifyJson=await directVerifyResponse.json();
  console.log('LIVE_PASS2_DIRECT_RAW '+JSON.stringify({status:directVerifyResponse.status,body:directVerifyJson}));
  assert.equal(directVerifyResponse.status,200,'direct live PASS2 /verify status');
  assert.equal(directVerifyJson?.ok,true,'direct live PASS2 /verify ok');
  const raw2=directVerifyJson.data||{},raw2Lines=canon(raw2?.amounts?.vatLines);
  assert.equal(raw2?.invoice?.invoiceNumber,INVOICE,'PASS2 processor invoice number');
  assert.equal(cents(raw2?.amounts?.subtotal),42995,'PASS2 processor net');
  assert.equal(cents(raw2?.amounts?.vatTotal),5249,'PASS2 processor VAT total');
  assert.equal(cents(raw2?.amounts?.total),48244,'PASS2 processor gross');
  assert.deepEqual(raw2Lines,raw1Lines,'PASS2 processor must preserve deterministic VAT groups');
  assert.equal(!!raw2?.processing?.amountDerivation?.mixedRates,true,'PASS2 processor mixedRates');
  assert.notEqual(cents(raw2?.amounts?.subtotal),45409,'PASS2 must not regress to old wrong net');
  console.log('LIVE_PASS2_DIRECT '+JSON.stringify({
    status:directVerifyResponse.status,
    invoiceNumber:raw2?.invoice?.invoiceNumber,
    net:raw2?.amounts?.subtotal,vatAmount:raw2?.amounts?.vatTotal,gross:raw2?.amounts?.total,
    mixedRates:!!raw2?.processing?.amountDerivation?.mixedRates,vatLines:raw2Lines,
    vatLineSource:raw2?.processing?.vatLineSource||null
  }));

  assert.deepEqual(review.schemaErrors,[],'review candidate must be saveable without hidden invalid fields');

  const verifyResponsePromise=page.waitForResponse(r=>{
    if(!r.url().includes('/functions/v1/analyze-invoice')||r.request().method()!=='POST')return false;
    const body=r.request().postData()||'';
    return body.includes('"reviewMode":"verify"');
  },{timeout:180000});

  page.on('dialog',d=>d.accept());
  await page.evaluate(()=>savePdfInvoiceImport());
  await page.waitForFunction(invoice=>state.expenses.some(e=>String(e.invoiceNumber||'')===invoice),INVOICE,{timeout:30000});
  await page.evaluate(()=>syncCloudStateNow());

  const ids=await page.evaluate(invoice=>{
    const e=state.expenses.find(x=>String(x.invoiceNumber||'')===invoice);
    const d=state.documents.find(x=>x.linkedType==='expense'&&x.linkedId===e?.id);
    return {expenseId:e?.id||null,docId:d?.id||null,fileId:d?.fileId||null};
  },INVOICE);
  testExpenseId=ids.expenseId;testDocId=ids.docId;testFileId=ids.fileId;
  assert.ok(testExpenseId&&testDocId&&testFileId,'save must create expense, document and stored file');

  const verifyResponse=await verifyResponsePromise;
  const verifyJson=await verifyResponse.json();
  assert.equal(verifyResponse.status(),200,'live PASS2 endpoint status');
  assert.equal(verifyJson?.ok,true,'live PASS2 endpoint ok');
  assert.equal(verifyJson?.pass,'verify','live PASS2 endpoint marker');

  await page.waitForFunction(docId=>{
    const d=state.documents.find(x=>x.id===docId);
    return d?.verification?.status==='verified'||d?.verification?.status==='needs_review'||d?.verification?.status==='technical_error';
  },testDocId,{timeout:180000});

  const saved=await page.evaluate(({expenseId,docId})=>{
    const e=state.expenses.find(x=>x.id===expenseId),d=state.documents.find(x=>x.id===docId);
    return {
      expense:{
        invoiceNumber:e?.invoiceNumber||'',net:e?.exVat??null,vatAmount:e?.vatAmount??null,gross:e?expenseGross(e):null,
        mixedRates:!!e?.mixedRates,vatRate:e?.vatRate??null,vatLines:e?.vatLines||[]
      },
      verification:structuredClone(d?.verification||{})
    };
  },{expenseId:testExpenseId,docId:testDocId});
  assertTruth('saved expense',saved.expense);
  assert.equal(saved.verification.status,'verified','PASS2 verification status');
  assertTruth('PASS1 snapshot',saved.verification.pass1);
  assertTruth('PASS2 snapshot',saved.verification.pass2);
  assert.deepEqual({
    net:saved.verification.pass1.net,vatAmount:saved.verification.pass1.vatAmount,gross:saved.verification.pass1.gross,
    mixedRates:saved.verification.pass1.mixedRates,vatRate:saved.verification.pass1.vatRate,vatLines:canon(saved.verification.pass1.vatLines)
  },{
    net:saved.verification.pass2.net,vatAmount:saved.verification.pass2.vatAmount,gross:saved.verification.pass2.gross,
    mixedRates:saved.verification.pass2.mixedRates,vatRate:saved.verification.pass2.vatRate,vatLines:canon(saved.verification.pass2.vatLines)
  },'PASS2 must preserve cent-exact deterministic mixed VAT structure');
  assert.deepEqual(saved.verification.differences||[],[],'PASS2 financial/document differences');

  await page.evaluate(()=>syncCloudStateNow());
  await page.reload({waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor({timeout:60000});
  await page.waitForFunction(invoice=>state.expenses.some(e=>String(e.invoiceNumber||'')===invoice),INVOICE,{timeout:60000});
  await page.evaluate(()=>navigate('expenses'));
  await page.locator('#pageTitle').filter({hasText:'Inkoop & kosten'}).waitFor();

  const reopened=await page.evaluate(invoice=>{
    const e=state.expenses.find(x=>String(x.invoiceNumber||'')===invoice);
    const d=state.documents.find(x=>x.linkedType==='expense'&&x.linkedId===e?.id);
    return {
      expense:{
        invoiceNumber:e?.invoiceNumber||'',net:e?.exVat??null,vatAmount:e?.vatAmount??null,gross:e?expenseGross(e):null,
        mixedRates:!!e?.mixedRates,vatRate:e?.vatRate??null,vatLines:e?.vatLines||[]
      },
      verification:structuredClone(d?.verification||{}),
      expenseId:e?.id||null
    };
  },INVOICE);
  assertTruth('reopened expense',reopened.expense);
  assert.deepEqual(reopened.expense,saved.expense,'saved and reopened financial values must be identical');
  assert.equal(reopened.verification.status,'verified');
  assertTruth('reopened PASS2 snapshot',reopened.verification.pass2);

  const row=page.locator('table tbody tr').filter({hasText:INVOICE}).first();
  await row.waitFor();
  const listVat=String(await row.locator('td').nth(5).textContent()).trim();
  assert.equal(listVat,'Gemengd','expense list VAT label');

  await page.evaluate(id=>expenseActions(id),reopened.expenseId);
  const detail=String(await page.locator('.modal').innerText());
  assert.match(detail,/Gemengd btw/,'detail mixed VAT label');
  assert.match(detail,/9%: €\s*315,00 grondslag \/ €\s*28,35 btw/,'detail 9% group');
  assert.match(detail,/21%: €\s*114,95 grondslag \/ €\s*24,14 btw/,'detail 21% group');
  await page.evaluate(()=>closeModal());

  const csv=await page.evaluate(()=>{
    const original=download;let captured=null;
    download=(name,data,mime)=>{captured={name,data,mime}};
    try{exportExpensesCSV()}finally{download=original}
    return captured;
  });
  const csvRow=String(csv?.data||'').split('\n').find(x=>x.includes('KKG/26/09/7741'))||'';
  assert.ok(csvRow,'CSV must contain imported invoice');
  assert.match(csvRow,/"Gemengd"/,'CSV mixed VAT scalar column');
  assert.doesNotMatch(csvRow,/;"21";/,'CSV must not export stale scalar 21');
  assert.match(csvRow,/9%: €\s*315,00 grondslag \/ €\s*28,35 btw/,'CSV 9% group');
  assert.match(csvRow,/21%: €\s*114,95 grondslag \/ €\s*24,14 btw/,'CSV 21% group');

  assert.deepEqual(pageErrors,[],'browser page errors');

  liveResult={
    targetSha:TARGET_SHA,
    processorUrl:PROCESSOR,
    health,
    fixture:'tests/fixtures/02_gemengde_btw_9_en_21.pdf.b64',
    pass1:{
      invoiceNumber:raw1.invoice.invoiceNumber,
      net:raw1.amounts.subtotal,
      vatAmount:raw1.amounts.vatTotal,
      gross:raw1.amounts.total,
      mixedRates:!!raw1.processing?.amountDerivation?.mixedRates,
      vatLines:raw1Lines
    },
    review:{
      invoiceNumber:review.invoiceNumber,net:review.net,vatAmount:review.vatAmount,gross:review.gross,
      mixedRates:review.mixedRates,vatRate:review.vatRate,vatLines:canon(review.vatLines),label:review.selectedText
    },
    pass2:{
      status:saved.verification.status,
      snapshot:saved.verification.pass2,
      differences:saved.verification.differences||[]
    },
    saved:saved.expense,
    reopened:reopened.expense,
    listVat,
    detailVerified:true,
    csvVerified:true,
    liveAnalyzeStatus:analyzeResponse.status(),
    liveVerifyStatus:verifyResponse.status()
  };
  console.log('LIVE_QA_RESULT '+JSON.stringify(liveResult));
  console.log('03A LIVE PR28 MIXED VAT: PASS');
}finally{
  try{
    if(originalState&&page&&!page.isClosed()){
      await page.evaluate(async({originalState,fileId})=>{
        if(fileId)await deleteStoredFile(fileId);
        state=normalizeState(originalState);
        localStorage.setItem(userDataKey(),JSON.stringify(state));
        await syncCloudStateNow();
      },{originalState,fileId:testFileId});
      console.log('QA cleanup: original dedicated-account ledger restored');
    }
  }catch(e){
    console.error('QA cleanup failed:',String(e));
  }
  await browser.close();
  fs.rmSync(tmp,{force:true});
}
