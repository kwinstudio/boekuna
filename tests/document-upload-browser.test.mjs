import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');

function replaceLast(source,needle,replacement){
  const i=source.lastIndexOf(needle);
  if(i<0)throw new Error('Missing bootstrap marker: '+needle);
  return source.slice(0,i)+replacement+source.slice(i+needle.length);
}

const invoiceLines=[
  'FACTUUR',
  'Leverancier: Voorbeeld Leverancier BV',
  'Adres: Teststraat 10, 3011 AA Rotterdam',
  'KVK: 87654321',
  'BTW: NL987654321B01',
  'E-mail: facturen@voorbeeld.test',
  'Factuurnummer: QA-PDF-03-001',
  'Factuurdatum: 28-09-2026',
  'Vervaldatum: 12-10-2026',
  'Omschrijving: Consultancy september',
  'Subtotaal: EUR 100,00',
  'BTW 21%: EUR 21,00',
  'Totaal te betalen: EUR 121,00',
  'Betalingskenmerk: QA-PDF-03-001'
];

const processorPayload={
  ok:true,
  data:{
    documentType:'purchase_invoice',
    originalFileName:'qa-pdf-02.pdf',
    pageCount:1,
    supplier:{name:'Voorbeeld Leverancier BV',address:'Teststraat 10',postalCode:'3011 AA',city:'Rotterdam',country:'Nederland',kvk:'87654321',vatNumber:'NL987654321B01',email:'facturen@voorbeeld.test'},
    customer:{},
    invoice:{invoiceNumber:'QA-PDF-02-001',invoiceDate:'2026-09-28',dueDate:'2026-10-12',paymentTermDays:14,description:'Consultancy september'},
    amounts:{subtotal:100,vatLines:[{rate:21,taxableAmount:100,vatAmount:21}],vatTotal:21,total:121,currency:'EUR'},
    status:'open',
    lineItems:[{description:'Consultancy september',quantity:1,unitPrice:100,vatRate:21,lineTotal:100}],
    adjustments:[],
    confidence:{supplierName:.99,invoiceNumber:.99,invoiceDate:.99,subtotal:.99,vatTotal:.99,total:.99},
    warnings:[],
    processing:{sourceKind:'pdf',pages:1,ocrPages:[],tablesFound:0,fastPath:'deterministic',overallConfidence:.99}
  },
  preview:{text:invoiceLines.join('\n').replaceAll('QA-PDF-03-001','QA-PDF-02-001'),pages:[{page:1,ocrConfidence:null}],tables:[]},
  duplicateCandidates:[]
};

const mixedProcessorPayload=structuredClone(processorPayload);
mixedProcessorPayload.data.originalFileName='qa-mixed-vat.pdf';
mixedProcessorPayload.data.invoice.invoiceNumber='QA-MIXED-001';
mixedProcessorPayload.data.invoice.description='Gemengde btw 9 en 21';
mixedProcessorPayload.data.amounts={subtotal:200,vatLines:[{rate:9,taxableAmount:100,vatAmount:9},{rate:21,taxableAmount:100,vatAmount:21}],vatTotal:30,total:230,currency:'EUR'};
mixedProcessorPayload.data.lineItems=[
  {description:'Dienst laag tarief',quantity:1,unitPrice:100,vatRate:9,lineTotal:100},
  {description:'Dienst hoog tarief',quantity:1,unitPrice:100,vatRate:21,lineTotal:100}
];

let processorResponse=processorPayload;
let appOrigin='';
let processorMode='success';
let processorMethods=[];
let processorOrigins=[];

const processorServer=http.createServer((req,res)=>{
  if(req.url!=='/analyze'){res.writeHead(404);return res.end('not found')}
  processorMethods.push(req.method||'');
  processorOrigins.push(String(req.headers.origin||''));
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
    assert.ok(bytes>0,'Browser processor POST must contain multipart upload bytes');
    if(processorMode==='success'){
      res.writeHead(200,{...headers,'content-type':'application/json'});
      return res.end(JSON.stringify(processorResponse));
    }
    res.writeHead(503,{...headers,'content-type':'application/json'});
    res.end(JSON.stringify({ok:false,error:{code:'PROCESSOR_UNAVAILABLE',category:'temporary',retryable:true,state:'no_changes',reference_id:'BK-QAPDF'}}));
  });
});
await new Promise(resolve=>processorServer.listen(0,'127.0.0.1',resolve));
const processorPort=processorServer.address().port;
const processorBase=`http://127.0.0.1:${processorPort}`;

let appHtml=original
  .replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;')
  .replace("const DOCUMENT_PROCESSOR_URL='https://kwinest-docprocessor.onrender.com';",`const DOCUMENT_PROCESSOR_URL='${processorBase}';`);
appHtml=replaceLast(appHtml,'initAuth();',`
currentUser=TEST_USER;
state=structuredClone(DEFAULT);
for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
state.company={...state.company,name:'QA PDF BV',tradeName:'Boekuna PDF QA',contactName:'QA',email:'qa-pdf@example.test',phone:'0100000000',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',invoicePrefix:'2026-',paymentDays:14,kor:false};
enterApp();
`);

const appServer=http.createServer((req,res)=>{
  if(req.url?.startsWith('/manifest.webmanifest')){res.writeHead(200,{'content-type':'application/manifest+json'});return res.end('{}')}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(appHtml);
});
await new Promise(resolve=>appServer.listen(0,'127.0.0.1',resolve));
const appPort=appServer.address().port;
const base=`http://127.0.0.1:${appPort}`;
appOrigin=new URL(base).origin;

const pdfModule=`
export const GlobalWorkerOptions={workerSrc:''};
const lines=${JSON.stringify(invoiceLines)};
const items=lines.map((str,i)=>({str,transform:[1,0,0,1,40,800-i*28],width:Math.max(80,str.length*6)}));
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

async function routePdfJs(page){
  await page.route('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs',route=>route.fulfill({
    status:200,
    contentType:'text/javascript; charset=utf-8',
    headers:{'access-control-allow-origin':'*'},
    body:pdfModule
  }));
}

async function routeFallbackAi(page){
  await page.route('https://vuwfyhtejsxhdfyvkkeq.supabase.co/functions/v1/analyze-invoice',async route=>{
    const method=route.request().method();
    const headers={'access-control-allow-origin':appOrigin,'access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'*'};
    if(method==='OPTIONS')return route.fulfill({status:204,headers});
    return route.fulfill({
      status:503,
      contentType:'application/json',
      headers,
      body:JSON.stringify({ok:false,error:{code:'PROCESSOR_UNAVAILABLE',category:'temporary',retryable:true,state:'no_changes'}})
    });
  });
}

const browser=await chromium.launch({headless:true});

async function newAppPage(){
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await routePdfJs(page);
  await page.goto(base+'/app',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor();
  return page;
}

try{
  // QA-PDF-02: the actual browser must perform CORS preflight, POST the PDF,
  // reach the real review UI, then save the resulting bookkeeping/document state.
  {
    processorMode='success';
    processorResponse=processorPayload;
    processorMethods=[];
    processorOrigins=[];
    const page=await newAppPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('dialog',dialog=>dialog.accept());
    const optionsStatus=await page.evaluate(url=>fetch(url,{method:'OPTIONS'}).then(r=>r.status),processorBase+'/analyze');
    assert.equal(optionsStatus,204,'QA-PDF-02 processor OPTIONS contract must answer successfully in the browser');

    await page.locator('#invoicePdfFile').setInputFiles({
      name:'qa-pdf-02.pdf',
      mimeType:'application/pdf',
      buffer:Buffer.from('%PDF-1.7\n% Boekuna browser QA\n')
    });

    await page.getByRole('heading',{name:'Document controleren'}).waitFor({timeout:15000});
    assert.equal(await page.locator('#pdfImportForm [name="party"]').inputValue(),'Voorbeeld Leverancier BV');
    assert.equal(await page.locator('#pdfImportForm [name="invoiceNumber"]').inputValue(),'QA-PDF-02-001');
    assert.equal(await page.locator('#pdfImportForm [name="gross"]').inputValue(),'121.00');
    assert.ok(processorMethods.includes('OPTIONS'),'QA-PDF-02 must exercise the processor OPTIONS contract in a real browser');
    assert.ok(processorMethods.includes('POST'),'QA-PDF-02 must reach POST /analyze after the OPTIONS check');
    assert.ok(processorOrigins.includes(appOrigin),'QA-PDF-02 browser requests must carry the app Origin');

    const saveButton=page.getByRole('button',{name:'Gecontroleerd & opslaan'});
    assert.match(String(await saveButton.getAttribute('onclick')),/savePdfInvoiceImport/,'Review save button must stay wired to the production save flow');
    const preSave=await page.evaluate(()=>({valid:document.getElementById('pdfImportForm')?.checkValidity()||false,bad:Number(pendingPdfImport?.parsed?.recognitionBad||0),warn:Number(pendingPdfImport?.parsed?.recognitionWarn||0)}));
    assert.equal(preSave.valid,true,'QA-PDF-02 review form must be valid before save');
    await page.evaluate(()=>savePdfInvoiceImport());
    const saved=await page.evaluate(()=>({documents:state.documents.length,expenses:state.expenses.length,invoiceNumber:state.expenses[0]?.invoiceNumber,gross:state.expenses[0]?expenseGross(state.expenses[0]):null}));
    assert.deepEqual(saved,{documents:1,expenses:1,invoiceNumber:'QA-PDF-02-001',gross:121});
    assert.deepEqual(errors,[],'QA-PDF-02 browser errors: '+errors.join(' | '));
    await page.close();
  }

  // QA-DOC-REL-001: authoritative mixed 9% + 21% VAT must clear the local stale 21% scalar
  // through processor merge, review, save, persistence/reopen, list, detail modal and CSV export.
  {
    processorMode='success';
    processorResponse=mixedProcessorPayload;
    processorMethods=[];
    processorOrigins=[];
    const page=await newAppPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('dialog',dialog=>dialog.accept());

    await page.locator('#invoicePdfFile').setInputFiles({
      name:'qa-mixed-vat.pdf',
      mimeType:'application/pdf',
      buffer:Buffer.from('%PDF-1.7\n% Boekuna mixed VAT browser QA\n')
    });

    await page.getByRole('heading',{name:'Document controleren'}).waitFor({timeout:15000});
    const review=await page.evaluate(()=>({
      vatRate:pendingPdfImport?.parsed?.vatRate,
      mixedRates:pendingPdfImport?.parsed?.mixedRates,
      vatLines:pendingPdfImport?.parsed?.vatLines,
      selected:document.querySelector('#pdfImportForm [name="vatRate"]')?.value
    }));
    assert.equal(review.vatRate,null,'Mixed processor result must explicitly clear the local 21% scalar before review');
    assert.equal(review.mixedRates,true,'Mixed processor result must remain marked mixed');
    assert.deepEqual(review.vatLines.map(v=>Number(v.rate)),[9,21],'Trusted processor VAT groups must reach review intact');
    assert.equal(review.selected,'','Mixed review must show Gemengd / controleer instead of a scalar rate');

    await page.evaluate(()=>savePdfInvoiceImport());
    const saved=await page.evaluate(()=>{
      const e=state.expenses[0];
      return {vatRate:e?.vatRate,mixedRates:e?.mixedRates,vatLines:e?.vatLines,vatAmount:e?.vatAmount,gross:e?expenseGross(e):null}
    });
    assert.equal(saved.vatRate,null,'Mixed expense persistence must not contain an authoritative scalar VAT rate');
    assert.equal(saved.mixedRates,true,'Mixed expense persistence must preserve mixedRates');
    assert.deepEqual(saved.vatLines.map(v=>Number(v.rate)),[9,21],'Saved trusted VAT groups must preserve 9% and 21%');
    assert.equal(saved.vatAmount,30);
    assert.equal(saved.gross,230);

    const reopened=await page.evaluate(()=>{
      const stale={...state.expenses[0],vatRate:21,mixedRates:true};
      state.expenses[0]=stale;
      state=normalizeState(JSON.parse(JSON.stringify(state)));
      navigate('expenses');
      const e=state.expenses[0];
      return {vatRate:e.vatRate,mixedRates:e.mixedRates,label:expenseVatRateLabel(e),rates:expenseVatRates(e)}
    });
    assert.equal(reopened.vatRate,null,'Reopen normalization must scrub a legacy stale 21% scalar from mixed persisted data');
    assert.equal(reopened.mixedRates,true);
    assert.equal(reopened.label,'Gemengd');
    assert.deepEqual(reopened.rates,[9,21]);

    const listVat=String(await page.locator('table tbody tr').first().locator('td').nth(5).textContent()).trim();
    assert.equal(listVat,'Gemengd','Expense list must never render mixed VAT as 21%');

    await page.evaluate(()=>expenseActions(state.expenses[0].id));
    const modalText=await page.locator('.modal').textContent();
    assert.match(modalText,/Gemengd btw/,'Expense detail modal must label the booking as mixed VAT');
    assert.match(modalText,/9%:/,'Expense detail modal must expose the 9% trusted group');
    assert.match(modalText,/21%:/,'Expense detail modal must expose the 21% trusted group');
    await page.getByRole('button',{name:'Sluiten'}).click();

    const csv=await page.evaluate(()=>{
      const originalDownload=download;
      let capture=null;
      download=(name,data,mime)=>{capture={name,data,mime}};
      try{exportExpensesCSV()}finally{download=originalDownload}
      return capture
    });
    const csvRow=csv.data.split('\n')[1].split(';');
    assert.equal(csvRow[4],'"Gemengd"','CSV scalar VAT-rate column must export Gemengd for mixed VAT');
    assert.match(csvRow[5],/9%:/,'CSV must preserve the 9% VAT-group breakdown');
    assert.match(csvRow[5],/21%:/,'CSV must preserve the 21% VAT-group breakdown');
    assert.deepEqual(errors,[],'QA-DOC-REL-001 browser errors: '+errors.join(' | '));

    const singleRates=await page.evaluate(()=>{
      return [0,9,21].map(rate=>{
        const vat=rate===0?0:rate,net=100,gross=net+vat;
        const local={type:'purchase',documentType:'purchase_invoice',party:'Local Parser',invoiceNumber:'LOCAL',issueDate:'2026-09-28',net,vatAmount:vat,gross,vatRate:21,mixedRates:false,vatLines:[{rate:21,taxableAmount:net,vatAmount:21}],fieldConfidence:{}};
        const authoritative={sourceQuality:'processor-v2',type:'purchase',documentType:'purchase_invoice',party:'Processor',invoiceNumber:'SINGLE-'+rate,issueDate:'2026-09-28',net,vatAmount:vat,gross,vatRate:rate,mixedRates:false,vatLines:[{rate,taxableAmount:net,vatAmount:vat}],fieldConfidence:{}};
        const merged=mergeAIParsed(local,authoritative,'purchase');
        const expense=normalizeExpenseVatSemantics({vatRate:merged.vatRate,mixedRates:merged.mixedRates,vatLines:merged.vatLines});
        return {rate,mergedRate:merged.vatRate,mixed:merged.mixedRates,label:expenseVatRateLabel(expense),exportRate:expenseVatRateExport(expense)}
      })
    });
    assert.deepEqual(singleRates,[
      {rate:0,mergedRate:0,mixed:false,label:'0%',exportRate:'0'},
      {rate:9,mergedRate:9,mixed:false,label:'9%',exportRate:'9'},
      {rate:21,mergedRate:21,mixed:false,label:'21%',exportRate:'21'}
    ],'Authoritative single-rate 0%, 9% and 21% semantics must remain unchanged');

    await page.close();
  }

  // QA-PDF-03: a temporary processor failure must reach the local PDF.js fallback
  // without the historical "Can't find variable: pdfLibPromise" browser crash.
  {
    processorMode='unavailable';
    processorResponse=processorPayload;
    processorMethods=[];
    processorOrigins=[];
    const page=await newAppPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('dialog',dialog=>dialog.accept());
    await routeFallbackAi(page);
    const optionsStatus=await page.evaluate(url=>fetch(url,{method:'OPTIONS'}).then(r=>r.status),processorBase+'/analyze');
    assert.equal(optionsStatus,204,'QA-PDF-03 processor OPTIONS contract must remain available during fallback scenarios');

    assert.equal(await page.evaluate(()=>typeof pdfLibPromise),'object','pdfLibPromise must be initialized before loadPdfLib runs');

    const direct=await page.evaluate(async()=>{
      const f=new File([new Uint8Array([37,80,68,70,45,49,46,55])],'qa-loader.pdf',{type:'application/pdf'});
      const s=await readPdfStructure(f);
      return {pages:s.numPages,text:s.text};
    });
    assert.equal(direct.pages,1);
    assert.match(direct.text,/QA-PDF-03-001/);

    await page.locator('#invoicePdfFile').setInputFiles({
      name:'qa-pdf-03.pdf',
      mimeType:'application/pdf',
      buffer:Buffer.from('%PDF-1.7\n% Boekuna local fallback QA\n')
    });

    await page.getByRole('heading',{name:'Document controleren'}).waitFor({timeout:15000});
    assert.equal(await page.locator('#pdfImportForm [name="invoiceNumber"]').inputValue(),'QA-PDF-03-001');
    assert.equal(await page.locator('#pdfImportForm [name="gross"]').inputValue(),'121.00');
    assert.ok(processorMethods.includes('OPTIONS'),'QA-PDF-03 outage path must still exercise the processor OPTIONS contract');
    assert.ok(processorMethods.includes('POST'),'QA-PDF-03 outage path must attempt the processor before fallback');
    assert.ok(processorOrigins.includes(appOrigin),'QA-PDF-03 browser requests must carry the app Origin');
    assert.ok(!errors.some(x=>/pdfLibPromise/i.test(x)),'QA-PDF-03 must never throw pdfLibPromise ReferenceError');
    assert.ok(!errors.some(x=>/ReferenceError/i.test(x)),'QA-PDF-03 fallback must not throw a browser ReferenceError');
    await page.close();
  }

  console.log('PDF browser regressions: PASS (QA-PDF-02 single-rate upload/save; QA-DOC-REL-001 mixed 9%+21% merge/review/save/reopen/UI/CSV; single 0/9/21 VAT regressions; QA-PDF-03 processor-outage fallback)');
}finally{
  await browser.close();
  await new Promise(resolve=>appServer.close(resolve));
  await new Promise(resolve=>processorServer.close(resolve));
}
