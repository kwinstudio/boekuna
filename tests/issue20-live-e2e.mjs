import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const source=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
const mixedPdf=Buffer.from(fs.readFileSync(new URL('./fixtures/issue20-mixed-9-21.pdf.b64',import.meta.url),'utf8').trim(),'base64');
const CAPTURE_ORIGIN=process.env.BOOKUNA_MARKETING_CAPTURE_ORIGIN||'https://boekuna-boekhouding.onrender.com';
const CAPTURE_EMAIL=process.env.BOOKUNA_MARKETING_CAPTURE_EMAIL||'';
const CAPTURE_PASSWORD=process.env.BOOKUNA_MARKETING_CAPTURE_PASSWORD||'';
assert.ok(CAPTURE_EMAIL&&CAPTURE_PASSWORD,'Dedicated QA/demo credentials are required for the live processor retest');

function replaceLast(sourceText,needle,replacement){
  const i=sourceText.lastIndexOf(needle);
  if(i<0)throw new Error('Missing bootstrap marker: '+needle);
  return sourceText.slice(0,i)+replacement+sourceText.slice(i+needle.length);
}
function cents(v){return Math.round(Number(v)*100)}
function canonical(lines){
  return (lines||[]).map(v=>({rate:Number(v.rate),taxableAmount:Number(v.taxableAmount),vatAmount:Number(v.vatAmount)}))
    .sort((a,b)=>a.rate-b.rate);
}
function assertMixedGroundTruth({subtotal,vatTotal,total,vatLines}){
  assert.equal(cents(subtotal),42995,'Net must be EUR 429.95');
  assert.equal(cents(vatTotal),5249,'VAT total must be EUR 52.49');
  assert.equal(cents(total),48244,'Gross must be EUR 482.44');
  assert.deepEqual(canonical(vatLines),[
    {rate:9,taxableAmount:315,vatAmount:28.35},
    {rate:21,taxableAmount:114.95,vatAmount:24.14}
  ]);
}

async function captureAccessToken(){
  const url=(source.match(/const SUPABASE_URL='([^']+)'/)||[])[1];
  const key=(source.match(/const SUPABASE_PUBLISHABLE_KEY='([^']+)'/)||[])[1];
  assert.ok(url&&key,'Supabase public auth config missing from frontend source');
  const response=await fetch(url+'/auth/v1/token?grant_type=password',{
    method:'POST',
    headers:{apikey:key,'content-type':'application/json'},
    body:JSON.stringify({email:CAPTURE_EMAIL,password:CAPTURE_PASSWORD})
  });
  const json=await response.json().catch(()=>({}));
  assert.ok(response.ok&&json.access_token,'Dedicated QA/demo account could not authenticate');
  return json.access_token;
}

const accessToken=await captureAccessToken();

// Direct authoritative processor proof on the original synthetic mixed-rate PDF.
{
  const form=new FormData();
  form.append('file',new Blob([mixedPdf],{type:'application/pdf'}),'02_gemengde_btw_9_en_21.pdf');
  form.append('company_json',JSON.stringify({name:'KWINSTUDIO',tradeName:'KWINSTUDIO',country:'Nederland'}));
  form.append('existing_json','[]');
  const response=await fetch('https://kwinest-docprocessor.onrender.com/analyze',{
    method:'POST',
    headers:{Authorization:'Bearer '+accessToken,Origin:CAPTURE_ORIGIN},
    body:form
  });
  const json=await response.json().catch(()=>({}));
  assert.ok(response.ok&&json.ok,'Live document processor /analyze failed: '+JSON.stringify({status:response.status,error:json?.error}));
  console.log('ISSUE20_LIVE_PROCESSOR_RESULT='+JSON.stringify({
    invoiceNumber:json.data?.invoice?.invoiceNumber??null,
    subtotal:json.data?.amounts?.subtotal??null,
    vatTotal:json.data?.amounts?.vatTotal??null,
    total:json.data?.amounts?.total??null,
    vatLines:canonical(json.data?.amounts?.vatLines),
    mixedRates:Boolean(json.data?.processing?.amountDerivation?.mixedRates),
    warnings:json.data?.warnings||[]
  }));
  console.log('ISSUE20_LIVE_INVOICE_NUMBER='+String(json.data?.invoice?.invoiceNumber??'NULL'));
  assertMixedGroundTruth({
    subtotal:json.data?.amounts?.subtotal,
    vatTotal:json.data?.amounts?.vatTotal,
    total:json.data?.amounts?.total,
    vatLines:json.data?.amounts?.vatLines
  });
  assert.equal(Boolean(json.data?.processing?.amountDerivation?.mixedRates),true,'Live processor must classify the document as mixed-rate');
  console.log('ISSUE20_LIVE_PROCESSOR=PASS');
}

let appHtml=source.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
const parallelPdfInspection="const browserStructurePromise=ext==='pdf'&&file.size<9*1024*1024?readPdfStructure(file).catch(err=>{console.warn('Parallel PDF inspection',err);return null}):null;";
assert.ok(appHtml.includes(parallelPdfInspection),'Frontend source must contain parallel PDF inspection hook');
appHtml=appHtml.replace(parallelPdfInspection,'const browserStructurePromise=null;');
appHtml=replaceLast(appHtml,'initAuth();',String.raw`
currentUser=TEST_USER;
const stored=localStorage.getItem(userDataKey());
if(stored){
  state=normalizeState(JSON.parse(stored));
}else{
  state=structuredClone(DEFAULT);
  for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
  state.company={...state.company,name:'KWINSTUDIO',tradeName:'KWINSTUDIO',contactName:'QA',email:'qa@boekuna-demo.example',phone:'0100000000',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',invoicePrefix:'2026-',paymentDays:14,kor:false};
  localStorage.setItem(userDataKey(),JSON.stringify(state));
}
enterApp();
`);

const server=http.createServer((req,res)=>{
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(appHtml);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.route(CAPTURE_ORIGIN+'/app',route=>route.fulfill({
  status:200,contentType:'text/html; charset=utf-8',body:appHtml,headers:{'cache-control':'no-store'}
}));
await context.route('https://kwinest-docprocessor.onrender.com/**',async route=>{
  const req=route.request();
  const headers={...req.headers()};
  if(req.method()!=='OPTIONS')headers.authorization='Bearer '+accessToken;
  await route.continue({headers});
});
const page=await context.newPage();
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(String(e)));

try{
  await page.goto(CAPTURE_ORIGIN+'/app',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor();
  await page.evaluate(()=>navigate('documents'));
  await page.evaluate(()=>{pendingUploadKind='purchase'});

  const processorResponsePromise=page.waitForResponse(
    r=>r.url().includes('kwinest-docprocessor.onrender.com/analyze')&&r.request().method()==='POST',
    {timeout:150000}
  );
  await page.locator('#docFile').setInputFiles({
    name:'02_gemengde_btw_9_en_21.pdf',
    mimeType:'application/pdf',
    buffer:mixedPdf
  });
  const processorResponse=await processorResponsePromise;
  const processorJson=await processorResponse.json().catch(()=>({}));
  assert.ok(processorResponse.ok()&&processorJson.ok,'Browser upload must receive successful live processor response');
  assertMixedGroundTruth({
    subtotal:processorJson.data?.amounts?.subtotal,
    vatTotal:processorJson.data?.amounts?.vatTotal,
    total:processorJson.data?.amounts?.total,
    vatLines:processorJson.data?.amounts?.vatLines
  });

  await page.getByRole('heading',{name:'Document controleren'}).waitFor({timeout:30000});
  const review=await page.evaluate(()=>({
    party:pendingPdfImport?.parsed?.party,
    invoiceNumber:pendingPdfImport?.parsed?.invoiceNumber,
    net:pendingPdfImport?.parsed?.net,
    vatAmount:pendingPdfImport?.parsed?.vatAmount,
    gross:pendingPdfImport?.parsed?.gross,
    vatRate:pendingPdfImport?.parsed?.vatRate,
    mixedRates:pendingPdfImport?.parsed?.mixedRates,
    vatLines:pendingPdfImport?.parsed?.vatLines,
    sourceQuality:pendingPdfImport?.parsed?.sourceQuality,
    selected:document.querySelector('#pdfImportForm [name="vatRate"]')?.value,
    selectedLabel:document.querySelector('#pdfImportForm [name="vatRate"] option:checked')?.textContent?.trim()
  }));
  assert.equal(review.sourceQuality,'processor-v2');
  console.log('ISSUE20_REVIEW_INVOICE_NUMBER='+String(review.invoiceNumber??'NULL'));
  assert.equal(cents(review.net),42995);
  assert.equal(cents(review.vatAmount),5249);
  assert.equal(cents(review.gross),48244);
  assert.equal(review.vatRate,null);
  assert.equal(review.mixedRates,true);
  assert.deepEqual(canonical(review.vatLines),[
    {rate:9,taxableAmount:315,vatAmount:28.35},
    {rate:21,taxableAmount:114.95,vatAmount:24.14}
  ]);
  assert.equal(review.selected,'');
  assert.match(review.selectedLabel||'',/Gemengd|controleer/i);

  if(!review.invoiceNumber){
    await page.locator('#pdfImportForm [name="invoiceNumber"]').fill('KKG/26/09/7741');
  }
  const validity=await page.evaluate(()=>document.getElementById('pdfImportForm')?.checkValidity()||false);
  assert.equal(validity,true,'Live mixed-rate review must be savable after correcting any unrelated required metadata');
  await page.evaluate(()=>savePdfInvoiceImport());
  await page.waitForFunction(()=>state?.expenses?.some(e=>e.invoiceNumber==='KKG/26/09/7741'));

  const beforeReload=await page.evaluate(()=>{
    const e=state.expenses.find(x=>x.invoiceNumber==='KKG/26/09/7741');
    const persisted=JSON.parse(localStorage.getItem(userDataKey())||'{}').expenses?.find(x=>x.invoiceNumber==='KKG/26/09/7741');
    return {memory:e,persisted};
  });
  for(const e of [beforeReload.memory,beforeReload.persisted]){
    assert.equal(e.vatRate,null);
    assert.equal(e.mixedRates,true);
    assert.deepEqual(canonical(e.vatLines),[
      {rate:9,taxableAmount:315,vatAmount:28.35},
      {rate:21,taxableAmount:114.95,vatAmount:24.14}
    ]);
    assert.equal(cents(e.vatAmount),5249);
    assert.equal(cents(e.gross),48244);
  }

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>state?.expenses?.some(e=>e.invoiceNumber==='KKG/26/09/7741'));
  await page.evaluate(()=>navigate('expenses'));

  const reopened=await page.evaluate(()=>{
    const e=state.expenses.find(x=>x.invoiceNumber==='KKG/26/09/7741');
    return {
      vatRate:e.vatRate,mixedRates:e.mixedRates,vatLines:e.vatLines,
      label:expenseVatRateLabel(e),vat:expenseVat(e),gross:expenseGross(e)
    };
  });
  assert.equal(reopened.vatRate,null,'Reopen must never resurrect stale 21%');
  assert.equal(reopened.mixedRates,true);
  assert.equal(reopened.label,'Gemengd');
  assert.equal(cents(reopened.vat),5249);
  assert.equal(cents(reopened.gross),48244);
  assert.deepEqual(canonical(reopened.vatLines),[
    {rate:9,taxableAmount:315,vatAmount:28.35},
    {rate:21,taxableAmount:114.95,vatAmount:24.14}
  ]);

  const row=page.locator('table tbody tr').filter({hasText:'KeukenKern Groothandel B.V.'}).first();
  assert.ok(await row.count(),'Expense list must contain the saved supplier');
  const rowText=await row.innerText();
  assert.match(rowText,/Gemengd/,'Expense list must show Gemengd');
  assert.doesNotMatch(rowText,/(^|\s)21%(\s|$)/,'Expense list must not present the mixed document as scalar 21%');

  await page.evaluate(()=>{
    const e=state.expenses.find(x=>x.invoiceNumber==='KKG/26/09/7741');
    expenseActions(e.id);
  });
  const modalText=await page.locator('.modal').innerText();
  assert.match(modalText,/Gemengd btw/);
  assert.match(modalText,/9%:\s*€\s*315,00 grondslag\s*\/\s*€\s*28,35 btw/);
  assert.match(modalText,/21%:\s*€\s*114,95 grondslag\s*\/\s*€\s*24,14 btw/);
  await page.evaluate(()=>closeModal());

  const csv=await page.evaluate(()=>{
    const originalDownload=download;let capture=null;
    download=(name,data,mime)=>{capture={name,data,mime}};
    try{exportExpensesCSV()}finally{download=originalDownload}
    return capture;
  });
  assert.ok(csv?.data,'CSV export must produce data');
  const csvLine=csv.data.split('\n').find(line=>line.includes('KeukenKern Groothandel B.V.'));
  assert.ok(csvLine,'CSV must contain the saved mixed-rate expense');
  const cols=csvLine.split(';');
  assert.equal(cols[4],'"Gemengd"');
  assert.doesNotMatch(cols[4],/21/);
  assert.match(cols[5],/9%:\s*€\s*315,00 grondslag\s*\/\s*€\s*28,35 btw/);
  assert.match(cols[5],/21%:\s*€\s*114,95 grondslag\s*\/\s*€\s*24,14 btw/);

  assert.deepEqual(pageErrors,[],'No browser page errors expected: '+pageErrors.join(' | '));
  console.log('ISSUE20_LIVE_E2E=PASS');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
