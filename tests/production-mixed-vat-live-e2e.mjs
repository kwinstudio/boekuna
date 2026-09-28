import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const source=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
const mixedPdf=Buffer.from(fs.readFileSync(new URL('./fixtures/02_gemengde_btw_9_en_21.pdf.b64',import.meta.url),'utf8').trim(),'base64');
const ORIGIN='https://boekuna-boekhouding.onrender.com';
const EMAIL=process.env.BOOKUNA_MARKETING_CAPTURE_EMAIL||'';
const PASSWORD=process.env.BOOKUNA_MARKETING_CAPTURE_PASSWORD||'';
assert.ok(EMAIL&&PASSWORD,'Dedicated QA/demo credentials are required');

function cents(v){return Math.round(Number(v)*100)}
function canonical(lines){
  return (lines||[]).map(v=>({rate:Number(v.rate),taxableAmount:Number(v.taxableAmount),vatAmount:Number(v.vatAmount)}))
    .sort((a,b)=>a.rate-b.rate);
}
function assertGroundTruth(x){
  assert.equal(cents(x.subtotal),42995);
  assert.equal(cents(x.vatTotal),5249);
  assert.equal(cents(x.total),48244);
  assert.deepEqual(canonical(x.vatLines),[
    {rate:9,taxableAmount:315,vatAmount:28.35},
    {rate:21,taxableAmount:114.95,vatAmount:24.14}
  ]);
}
function replaceLast(s,needle,replacement){
  const i=s.lastIndexOf(needle);
  if(i<0)throw new Error('Missing marker: '+needle);
  return s.slice(0,i)+replacement+s.slice(i+needle.length);
}

const liveResponse=await fetch(ORIGIN+'/?qa='+Date.now(),{redirect:'follow'});
assert.equal(liveResponse.status,200,'Production homepage must return 200');
const liveHtml=await liveResponse.text();
assert.ok(liveHtml.includes('Optioneel. Corrigeer of laat leeg als de herkenning niet betrouwbaar is.'),
  'Production HTML must contain the f17c43b review-safe IBAN UI');
assert.ok(liveHtml.includes('/assets/product/boekuna-document-review-mobile.webp'),
  'Production HTML must contain the real mobile document-review capture');

const supabaseUrl=(source.match(/const SUPABASE_URL='([^']+)'/)||[])[1];
const supabaseKey=(source.match(/const SUPABASE_PUBLISHABLE_KEY='([^']+)'/)||[])[1];
assert.ok(supabaseUrl&&supabaseKey,'Supabase public auth config missing');
const auth=await fetch(supabaseUrl+'/auth/v1/token?grant_type=password',{
  method:'POST',headers:{apikey:supabaseKey,'content-type':'application/json'},
  body:JSON.stringify({email:EMAIL,password:PASSWORD})
});
const authJson=await auth.json().catch(()=>({}));
assert.ok(auth.ok&&authJson.access_token,'Dedicated QA/demo account could not authenticate');
const token=authJson.access_token;

let authoritative;
{
  const form=new FormData();
  form.append('file',new Blob([mixedPdf],{type:'application/pdf'}),'02_gemengde_btw_9_en_21.pdf');
  form.append('company_json',JSON.stringify({name:'KWINSTUDIO',tradeName:'KWINSTUDIO',country:'Nederland'}));
  form.append('existing_json','[]');
  const res=await fetch('https://kwinest-docprocessor.onrender.com/analyze',{
    method:'POST',headers:{Authorization:'Bearer '+token,Origin:ORIGIN},body:form
  });
  authoritative=await res.json().catch(()=>({}));
  assert.ok(res.ok&&authoritative.ok,'Live processor failed: '+JSON.stringify({status:res.status,error:authoritative?.error}));
  assert.equal(authoritative.data?.invoice?.invoiceNumber,'KKG/26/09/7741');
  assertGroundTruth({
    subtotal:authoritative.data?.amounts?.subtotal,
    vatTotal:authoritative.data?.amounts?.vatTotal,
    total:authoritative.data?.amounts?.total,
    vatLines:authoritative.data?.amounts?.vatLines
  });
  assert.equal(Boolean(authoritative.data?.processing?.amountDerivation?.mixedRates),true);
  console.log('03C_LIVE_PROCESSOR_RESULT='+JSON.stringify({
    invoiceNumber:authoritative.data?.invoice?.invoiceNumber,
    subtotal:authoritative.data?.amounts?.subtotal,
    vatTotal:authoritative.data?.amounts?.vatTotal,
    total:authoritative.data?.amounts?.total,
    vatLines:canonical(authoritative.data?.amounts?.vatLines),
    mixedRates:Boolean(authoritative.data?.processing?.amountDerivation?.mixedRates)
  }));
}

let appHtml=source.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
const parallelPdfInspection="const browserStructurePromise=ext==='pdf'&&file.size<9*1024*1024?readPdfStructure(file).catch(err=>{console.warn('Parallel PDF inspection',err);return null}):null;";
assert.ok(appHtml.includes(parallelPdfInspection),'Parallel PDF inspection hook missing');
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

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.route(ORIGIN+'/app',route=>route.fulfill({
  status:200,contentType:'text/html; charset=utf-8',body:appHtml,headers:{'cache-control':'no-store'}
}));
await context.route('https://kwinest-docprocessor.onrender.com/**',async route=>{
  const req=route.request();
  const headers={...req.headers()};
  if(req.method()!=='OPTIONS')headers.authorization='Bearer '+token;
  await route.continue({headers});
});
const page=await context.newPage();
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(String(e)));

try{
  await page.goto(ORIGIN+'/app',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor();
  await page.evaluate(()=>navigate('documents'));
  await page.evaluate(()=>{pendingUploadKind='purchase'});

  const processorPromise=page.waitForResponse(
    r=>r.url().includes('kwinest-docprocessor.onrender.com/analyze')&&r.request().method()==='POST',
    {timeout:150000}
  );
  await page.locator('#docFile').setInputFiles({
    name:'02_gemengde_btw_9_en_21.pdf',mimeType:'application/pdf',buffer:mixedPdf
  });
  const processorResponse=await processorPromise;
  const processorJson=await processorResponse.json().catch(()=>({}));
  assert.ok(processorResponse.ok()&&processorJson.ok,'Browser upload must receive successful live processor response');
  assertGroundTruth({
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
    iban:pendingPdfImport?.parsed?.iban,
    vatRate:pendingPdfImport?.parsed?.vatRate,
    mixedRates:pendingPdfImport?.parsed?.mixedRates,
    vatLines:pendingPdfImport?.parsed?.vatLines,
    sourceQuality:pendingPdfImport?.parsed?.sourceQuality,
    selected:document.querySelector('#pdfImportForm [name="vatRate"]')?.value,
    selectedLabel:document.querySelector('#pdfImportForm [name="vatRate"] option:checked')?.textContent?.trim()
  }));
  assert.match(review.sourceQuality||'',/^processor-v2(?:-ai)?$/,'Processor source must remain authoritative');
  assert.equal(review.invoiceNumber,'KKG/26/09/7741');
  assert.equal(cents(review.net),42995);
  assert.equal(cents(review.vatAmount),5249);
  assert.equal(cents(review.gross),48244);
  assert.equal(review.iban,'','Invalid synthetic supplier IBAN must be cleared before save');
  assert.equal(review.vatRate,null);
  assert.equal(review.mixedRates,true);
  assert.deepEqual(canonical(review.vatLines),[
    {rate:9,taxableAmount:315,vatAmount:28.35},
    {rate:21,taxableAmount:114.95,vatAmount:24.14}
  ]);
  assert.equal(review.selected,'');
  assert.match(review.selectedLabel||'',/Gemengd|controleer/i);
  assert.equal(await page.locator('#pdfImportForm [name="iban"]').inputValue(),'');
  assert.equal(await page.evaluate(()=>document.getElementById('pdfImportForm')?.checkValidity()||false),true,
    'Mixed-rate review must be savable with invalid extracted IBAN safely cleared');

  await page.evaluate(()=>savePdfInvoiceImport());
  await page.waitForFunction(()=>state?.expenses?.some(e=>e.invoiceNumber==='KKG/26/09/7741'));

  const beforeReload=await page.evaluate(()=>{
    const e=state.expenses.find(x=>x.invoiceNumber==='KKG/26/09/7741');
    const persisted=JSON.parse(localStorage.getItem(userDataKey())||'{}').expenses?.find(x=>x.invoiceNumber==='KKG/26/09/7741');
    const supplier=state.contacts.find(c=>c.id===e?.supplierId)||state.contacts.find(c=>c.name===e?.vendor);
    return {memory:e,persisted,supplierIban:supplier?.iban||''};
  });
  for(const e of [beforeReload.memory,beforeReload.persisted]){
    assert.equal(e.vatRate,null);
    assert.equal(e.mixedRates,true);
    assert.equal(cents(e.vatAmount),5249);
    assert.equal(cents(e.gross),48244);
    assert.deepEqual(canonical(e.vatLines),[
      {rate:9,taxableAmount:315,vatAmount:28.35},
      {rate:21,taxableAmount:114.95,vatAmount:24.14}
    ]);
  }
  assert.equal(beforeReload.supplierIban,'','Invalid synthetic supplier IBAN must not persist');

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>state?.expenses?.some(e=>e.invoiceNumber==='KKG/26/09/7741'));
  await page.evaluate(()=>navigate('expenses'));
  const reopened=await page.evaluate(()=>{
    const e=state.expenses.find(x=>x.invoiceNumber==='KKG/26/09/7741');
    return {vatRate:e.vatRate,mixedRates:e.mixedRates,vatLines:e.vatLines,label:expenseVatRateLabel(e),vat:expenseVat(e),gross:expenseGross(e)};
  });
  assert.equal(reopened.vatRate,null);
  assert.equal(reopened.mixedRates,true);
  assert.equal(reopened.label,'Gemengd');
  assert.equal(cents(reopened.vat),5249);
  assert.equal(cents(reopened.gross),48244);

  const row=page.locator('table tbody tr').filter({hasText:'KeukenKern Groothandel B.V.'}).first();
  assert.ok(await row.count(),'Saved supplier must appear in expenses list');
  const rowText=await row.innerText();
  assert.match(rowText,/Gemengd/);
  assert.doesNotMatch(rowText,/(^|\s)21%(\s|$)/);

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
    const original=download;let capture=null;
    download=(name,data,mime)=>{capture={name,data,mime}};
    try{exportExpensesCSV()}finally{download=original}
    return capture;
  });
  const line=csv?.data?.split('\n').find(x=>x.includes('KeukenKern Groothandel B.V.'));
  assert.ok(line,'CSV must contain mixed-rate expense');
  const cols=line.split(';');
  assert.equal(cols[4],'"Gemengd"');
  assert.doesNotMatch(cols[4],/21/);
  assert.match(cols[5],/9%:\s*€\s*315,00 grondslag\s*\/\s*€\s*28,35 btw/);
  assert.match(cols[5],/21%:\s*€\s*114,95 grondslag\s*\/\s*€\s*24,14 btw/);

  assert.deepEqual(pageErrors,[],'No page errors expected: '+pageErrors.join(' | '));
  console.log('03C production mixed-VAT E2E: PASS (live processor → review → save → reload → list → detail → CSV)');
}finally{
  await browser.close();
}
