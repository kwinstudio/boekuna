import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
const processorPayload=JSON.parse(fs.readFileSync(new URL('./.qa_issue20_processor_output.json',import.meta.url),'utf8'));
const pdfBytes=Buffer.from(fs.readFileSync(new URL('./fixtures/qa-issue20-mixed.pdf.b64',import.meta.url),'utf8').trim(),'base64');
const extractedLines=String(processorPayload.preview?.text||'').split(/\r?\n/).filter(Boolean);

function replaceLast(source,needle,replacement){
  const i=source.lastIndexOf(needle);
  if(i<0)throw new Error('Missing bootstrap marker: '+needle);
  return source.slice(0,i)+replacement+source.slice(i+needle.length);
}

let appOrigin='';
const processorMethods=[];
const processorServer=http.createServer((req,res)=>{
  if(req.url!=='/analyze'){res.writeHead(404);return res.end('not found')}
  processorMethods.push(req.method||'');
  const headers={
    'access-control-allow-origin':appOrigin,
    'access-control-allow-methods':'POST,OPTIONS',
    'access-control-allow-headers':'*',
    'vary':'Origin'
  };
  if(req.method==='OPTIONS'){res.writeHead(204,headers);return res.end()}
  if(req.method!=='POST'){res.writeHead(405,headers);return res.end()}
  let bytes=0;
  req.on('data',chunk=>{bytes+=chunk.length});
  req.on('end',()=>{
    assert.ok(bytes>=pdfBytes.length,'processor POST must include the actual PDF multipart bytes');
    res.writeHead(200,{...headers,'content-type':'application/json'});
    res.end(JSON.stringify(processorPayload));
  });
});
await new Promise(resolve=>processorServer.listen(0,'127.0.0.1',resolve));
const processorBase=`http://127.0.0.1:${processorServer.address().port}`;

let appHtml=original
  .replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;')
  .replace("const DOCUMENT_PROCESSOR_URL='https://kwinest-docprocessor.onrender.com';",`const DOCUMENT_PROCESSOR_URL='${processorBase}';`);
appHtml=replaceLast(appHtml,'initAuth();',String.raw`
currentUser=TEST_USER;
const stored=localStorage.getItem(userDataKey());
if(stored){
  state=normalizeState(JSON.parse(stored));
}else{
  state=structuredClone(DEFAULT);
  for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
  state.company={...state.company,name:'KWINSTUDIO',tradeName:'KWINSTUDIO',contactName:'Kwin',email:'qa@example.test',phone:'0100000000',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'00000099',vat:'NL000000099B00',iban:'NL91ABNA0417164300',invoicePrefix:'2026-',paymentDays:14,kor:false};
  localStorage.setItem(userDataKey(),JSON.stringify(state));
}
enterApp();
`);

const appServer=http.createServer((req,res)=>{
  if(req.url?.startsWith('/manifest.webmanifest')){res.writeHead(200,{'content-type':'application/manifest+json'});return res.end('{}')}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(appHtml);
});
await new Promise(resolve=>appServer.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${appServer.address().port}`;
appOrigin=new URL(base).origin;

const pdfModule=`
export const GlobalWorkerOptions={workerSrc:''};
const lines=${JSON.stringify(extractedLines)};
const items=lines.map((str,i)=>({str,transform:[1,0,0,1,40,800-i*18],width:Math.max(80,str.length*5)}));
export function getDocument(){
  return {promise:Promise.resolve({
    numPages:1,
    getPage:async()=>({
      getTextContent:async()=>({items}),
      getViewport:()=>({width:595,height:842}),
      render:()=>({promise:Promise.resolve()})
    }),
    getAttachments:async()=>null
  })};
}
`;

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',e=>errors.push(String(e)));

await page.route('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs',route=>route.fulfill({
  status:200,contentType:'text/javascript; charset=utf-8',
  headers:{'access-control-allow-origin':'*'},body:pdfModule
}));
await page.route('https://vuwfyhtejsxhdfyvkkeq.supabase.co/functions/v1/analyze-invoice',route=>{
  const method=route.request().method();
  const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'*'};
  if(method==='OPTIONS')return route.fulfill({status:204,headers});
  return route.fulfill({
    status:200,contentType:'application/json',headers,
    body:JSON.stringify({ok:true,processor:true,data:processorPayload.data})
  });
});

function sortedLines(lines){
  return (lines||[]).map(v=>({
    rate:Number(v.rate),
    taxableAmount:Number(v.taxableAmount),
    vatAmount:Number(v.vatAmount)
  })).sort((a,b)=>a.rate-b.rate)
}

try{
  await page.goto(base+'/app',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor();

  await page.locator('#invoicePdfFile').setInputFiles({
    name:'02_gemengde_btw_9_en_21.pdf',
    mimeType:'application/pdf',
    buffer:pdfBytes
  });

  await page.getByRole('heading',{name:'Document controleren'}).waitFor({timeout:15000});
  assert.ok(processorMethods.includes('POST'),'Browser must upload to processor');

  const review=await page.evaluate(()=>({
    vatRate:pendingPdfImport?.parsed?.vatRate,
    mixedRates:pendingPdfImport?.parsed?.mixedRates,
    vatLines:pendingPdfImport?.parsed?.vatLines,
    net:pendingPdfImport?.parsed?.net,
    vatAmount:pendingPdfImport?.parsed?.vatAmount,
    gross:pendingPdfImport?.parsed?.gross,
    invoiceNumber:pendingPdfImport?.parsed?.invoiceNumber
  }));
  if(!review.invoiceNumber){
    await page.locator('#pdfImportForm [name="invoiceNumber"]').fill('KKG/26/09/7741');
  }else{
    assert.equal(review.invoiceNumber,'KKG/26/09/7741');
  }
  assert.equal(review.vatRate,null,'authoritative mixed VAT must have no scalar rate');
  assert.equal(review.mixedRates,true);
  assert.deepEqual(sortedLines(review.vatLines),[
    {rate:9,taxableAmount:315,vatAmount:28.35},
    {rate:21,taxableAmount:114.95,vatAmount:24.14}
  ]);
  assert.equal(review.net,429.95);
  assert.equal(review.vatAmount,52.49);
  assert.equal(review.gross,482.44);

  const vatSelect=page.locator('#pdfImportForm [name="vatRate"]');
  assert.equal(await vatSelect.inputValue(),'');
  assert.equal(String(await vatSelect.locator('option:checked').textContent()).trim(),'Gemengd / controleer');

  await page.evaluate(()=>savePdfInvoiceImport());
  await page.waitForFunction(()=>state.expenses.length===1&&state.documents.length===1);

  const saved=await page.evaluate(()=>({
    expense:structuredClone(state.expenses[0]),
    verification:structuredClone(state.documents[0].verification),
    persisted:JSON.parse(localStorage.getItem(userDataKey())||'{}')?.expenses?.[0]
  }));
  assert.equal(saved.expense.vatRate,null);
  assert.equal(saved.expense.mixedRates,true);
  assert.deepEqual(sortedLines(saved.expense.vatLines),[
    {rate:9,taxableAmount:315,vatAmount:28.35},
    {rate:21,taxableAmount:114.95,vatAmount:24.14}
  ]);
  assert.equal(saved.expense.exVat,429.95);
  assert.equal(saved.expense.vatAmount,52.49);
  assert.equal(saved.expense.gross,482.44);
  assert.equal(saved.persisted.vatRate,null);
  assert.equal(saved.persisted.mixedRates,true);
  assert.equal(saved.verification.pass1.vatRate,null);
  assert.equal(saved.verification.pass1.mixedRates,true);
  assert.deepEqual(sortedLines(saved.verification.pass1.vatLines),sortedLines(saved.expense.vatLines));

  // PASS2 regression: identical authoritative financial data must verify, not mutate bookkeeping.
  await page.waitForFunction(()=>state.documents[0]?.verification?.status==='verified',{timeout:5000});
  const afterPass2=await page.evaluate(()=>({
    expense:structuredClone(state.expenses[0]),
    status:state.documents[0]?.verification?.status,
    pass2:structuredClone(state.documents[0]?.verification?.pass2)
  }));
  assert.equal(afterPass2.status,'verified');
  assert.equal(afterPass2.pass2.vatRate,null);
  assert.equal(afterPass2.pass2.mixedRates,true);
  assert.deepEqual(sortedLines(afterPass2.pass2.vatLines),sortedLines(saved.expense.vatLines));
  assert.deepEqual(afterPass2.expense,saved.expense,'PASS2 must not mutate accepted financial bookkeeping');

  // Full persistence/reopen through a real browser reload.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>state.expenses.length===1&&state.documents.length===1);
  await page.evaluate(()=>navigate('expenses'));
  await page.locator('#pageTitle').filter({hasText:'Inkoop & kosten'}).waitFor();

  const reopened=await page.evaluate(()=>{
    const e=state.expenses[0];
    return {
      vatRate:e.vatRate,mixedRates:e.mixedRates,vatLines:e.vatLines,
      exVat:e.exVat,vatAmount:e.vatAmount,gross:expenseGross(e),
      label:expenseVatRateLabel(e)
    }
  });
  assert.equal(reopened.vatRate,null,'reopen must never restore stale scalar 21');
  assert.equal(reopened.mixedRates,true);
  assert.equal(reopened.label,'Gemengd');
  assert.equal(reopened.exVat,429.95);
  assert.equal(reopened.vatAmount,52.49);
  assert.equal(reopened.gross,482.44);
  assert.deepEqual(sortedLines(reopened.vatLines),sortedLines(saved.expense.vatLines));

  const cells=page.locator('table tbody tr').first().locator('td');
  assert.equal(String(await cells.nth(5).textContent()).trim(),'Gemengd','expense list must show Gemengd');

  await page.evaluate(()=>expenseActions(state.expenses[0].id));
  const modal=String(await page.locator('.modal').innerText());
  assert.match(modal,/Gemengd btw/);
  assert.match(modal,/9%: €\s*315,00 grondslag \/ €\s*28,35 btw/);
  assert.match(modal,/21%: €\s*114,95 grondslag \/ €\s*24,14 btw/);
  await page.evaluate(()=>closeModal());

  const csv=await page.evaluate(()=>{
    const old=download;let captured=null;
    download=(name,data,mime)=>{captured={name,data,mime}};
    try{exportExpensesCSV()}finally{download=old}
    return captured;
  });
  assert.ok(csv?.data);
  const csvLines=csv.data.split('\n');
  assert.equal(csvLines[0],'"Datum";"Leverancier";"Categorie";"Excl btw";"Btw-tarief";"Btw-verdeling";"Btw";"Incl btw"');
  const mixedRow=csvLines[1];
  assert.match(mixedRow,/"Gemengd"/,'CSV must not export scalar 21 for mixed VAT');
  assert.match(mixedRow,/9%: €\s*315,00 grondslag \/ €\s*28,35 btw/);
  assert.match(mixedRow,/21%: €\s*114,95 grondslag \/ €\s*24,14 btw/);
  assert.doesNotMatch(mixedRow,/;"21";/,'mixed CSV rate column must not be 21');

  // Single-rate regressions and existing export semantics.
  const singles=await page.evaluate(()=>{
    const base={vendor:'QA',date:'2026-09-28',category:'Inkoop',paymentMethod:'Bank',taxTreatment:'standard'};
    return [0,9,21].map(rate=>{
      const exVat=100,vatAmount=Number((exVat*rate/100).toFixed(2));
      const e=normalizeExpenseVatSemantics({...base,vatRate:rate,mixedRates:false,vatLines:[{rate,taxableAmount:exVat,vatAmount}],exVat,vatAmount,gross:exVat+vatAmount});
      return {rate,label:expenseVatRateLabel(e),exportRate:expenseVatRateExport(e),vat:expenseVat(e),gross:expenseGross(e)}
    })
  });
  assert.deepEqual(singles,[
    {rate:0,label:'0%',exportRate:'0',vat:0,gross:100},
    {rate:9,label:'9%',exportRate:'9',vat:9,gross:109},
    {rate:21,label:'21%',exportRate:'21',vat:21,gross:121}
  ]);

  assert.deepEqual(errors,[],'browser errors: '+errors.join(' | '));
  console.log('03A issue #20 browser E2E: PASS (real mixed PDF → processor output → review → save → PASS2 → reopen → list → detail → CSV + 0/9/21 regressions)');
}finally{
  await browser.close();
  await new Promise(resolve=>appServer.close(resolve));
  await new Promise(resolve=>processorServer.close(resolve));
}
