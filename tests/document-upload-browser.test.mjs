import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
const financialCorrectionSource=fs.readFileSync(new URL('../public/assets/financial-correction.js',import.meta.url),'utf8');
const originalMixedVatFixture=Buffer.from(fs.readFileSync(new URL('./fixtures/02_gemengde_btw_9_en_21.pdf.b64',import.meta.url),'utf8').trim(),'base64');

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

const correctionProcessorPayload=structuredClone(processorPayload);
correctionProcessorPayload.data.originalFileName='qa-financial-correction.pdf';
correctionProcessorPayload.data.invoice.invoiceNumber='QA-CORRECTION-12866';
correctionProcessorPayload.data.invoice.description='Smart financial correction 128,66';
correctionProcessorPayload.data.amounts={subtotal:128.66,vatLines:[{rate:21,taxableAmount:128.66,vatAmount:0}],vatTotal:0,total:128.66,currency:'EUR'};
correctionProcessorPayload.data.lineItems=[];
correctionProcessorPayload.data.confidence={supplierName:.99,invoiceNumber:.99,invoiceDate:.99,subtotal:.42,vatTotal:.42,total:.99,vatLines:.42};
correctionProcessorPayload.data.processing={sourceKind:'pdf',pages:1,ocrPages:[1],tablesFound:0,fastPath:'deterministic',overallConfidence:.72};
correctionProcessorPayload.preview={text:'FACTUUR\nTotaal incl. btw EUR 128,66\nBTW 21%\nExcl. btw EUR 128,66\nBTW EUR 0,00',pages:[{page:1,ocrConfidence:.72}],tables:[]};
correctionProcessorPayload.duplicateCandidates=[];

const issue30ProcessorPayload=structuredClone(processorPayload);
issue30ProcessorPayload.data.originalFileName='02_gemengde_btw_9_en_21.pdf';
issue30ProcessorPayload.data.supplier={name:'Originele mixed-VAT fixture leverancier',address:'Teststraat 9',postalCode:'3011 AA',city:'Rotterdam',country:'Nederland',kvk:'87654321',vatNumber:'NL987654321B01',iban:'NL00ZZZZ0000000002',email:'facturen@example.test'};
issue30ProcessorPayload.data.invoice={invoiceNumber:'KKG/26/09/7741',invoiceDate:'2026-09-28',dueDate:null,paymentTermDays:null,description:'Originele mixed-VAT fixture'};
issue30ProcessorPayload.data.amounts={subtotal:429.95,vatLines:[{rate:9,taxableAmount:315,vatAmount:28.35},{rate:21,taxableAmount:114.95,vatAmount:24.14}],vatTotal:52.49,total:482.44,currency:'EUR'};
issue30ProcessorPayload.data.status='open';
issue30ProcessorPayload.data.lineItems=[];
issue30ProcessorPayload.data.adjustments=[];
issue30ProcessorPayload.data.confidence={supplierName:.99,iban:.99,invoiceNumber:.99,invoiceDate:.99,subtotal:.99,vatTotal:.99,total:.99,vatLines:.99};
issue30ProcessorPayload.data.warnings=[];
issue30ProcessorPayload.data.processing={sourceKind:'pdf',pages:1,ocrPages:[],tablesFound:2,fastPath:'deterministic',overallConfidence:.99,vatGroupSource:'validated-mixed-rate-groups'};
issue30ProcessorPayload.preview={text:'Originele 9% + 21% mixed-VAT fixture\nIBAN NL00ZZZZ0000000002',pages:[{page:1,ocrConfidence:null}],tables:[]};
issue30ProcessorPayload.duplicateCandidates=[];

const selfBillingProcessorPayload=structuredClone(processorPayload);
selfBillingProcessorPayload.data.originalFileName='self-billing-23003.pdf';
selfBillingProcessorPayload.data.documentType='sales_invoice';
selfBillingProcessorPayload.data.selfBilling=true;
selfBillingProcessorPayload.data.supplier={name:'QA PDF BV',address:'Teststraat 1',postalCode:'3011 AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vatNumber:'NL123456789B01',iban:'NL91ABNA0417164300',email:'qa-pdf@example.test'};
selfBillingProcessorPayload.data.customer={name:'Restaurant Company Europe',address:'',postalCode:'',city:'',country:'Nederland',kvk:null,vatNumber:null,email:''};
selfBillingProcessorPayload.data.invoice={invoiceNumber:'Y41829623003',invoiceDate:'2023-05-03',dueDate:null,paymentTermDays:null,description:'Uren tarief'};
selfBillingProcessorPayload.data.amounts={subtotal:155,vatLines:[{rate:21,taxableAmount:155,vatAmount:32.55}],vatTotal:32.55,total:187.55,settlementAmount:180.97,currency:'EUR'};
selfBillingProcessorPayload.data.status='paid';
selfBillingProcessorPayload.data.lineItems=[];
selfBillingProcessorPayload.data.adjustments=[{type:'factoring_fee',description:'Factoring',subtotal:5.44,vatTotal:1.14,total:6.58,vatRate:21,direction:'deduction',counterparty:'Payday / ABN AMRO'}];
selfBillingProcessorPayload.data.confidence={supplierName:.99,customerName:.99,invoiceNumber:.99,invoiceDate:.99,subtotal:.99,vatTotal:.99,total:.99,vatLines:.99,selfBilling:.99,settlementAmount:.99,adjustments:.99};
selfBillingProcessorPayload.data.processing={sourceKind:'pdf',pages:1,ocrPages:[],tablesFound:0,fastPath:'deterministic',overallConfidence:.99,selfBilling:true,selfBillingEvidence:'explicit-source-text',financialBlocks:{verified:true,adjustmentArithmeticOk:true,settlementArithmeticOk:true}};
selfBillingProcessorPayload.preview={text:'Normale lokale tekst zonder self-billing marker',pages:[{page:1,ocrConfidence:null}],tables:[]};
selfBillingProcessorPayload.duplicateCandidates=[];

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
  if(req.url?.startsWith('/assets/financial-correction.js')){res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});return res.end(financialCorrectionSource)}
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
  // QA-RECEIPT-MOBILE-01: the mobile camera control must preserve the production
  // image allowlist, request the environment-facing camera and reach review.
  {
    processorMode='success';
    processorResponse=structuredClone(processorPayload);
    processorResponse.data.documentType='receipt';
    processorResponse.data.originalFileName='qa-mobile-receipt.png';
    processorResponse.data.invoice.invoiceNumber=null;
    processorResponse.data.invoice.description='Mobiele kassabon';
    processorResponse.data.processing={sourceKind:'image',pages:1,ocrPages:[1],tablesFound:0,fastPath:'deterministic',overallConfidence:.99};
    processorResponse.preview={text:'BOEKUNA QA BON\\nSubtotaal EUR 100,00\\nBTW 21% EUR 21,00\\nTotaal EUR 121,00',pages:[{page:1,ocrConfidence:.99}],tables:[]};
    processorMethods=[];
    processorOrigins=[];
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await routePdfJs(page);
    await page.goto(base+'/app',{waitUntil:'domcontentloaded'});
    await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor();
    const camera=page.locator('#receiptCameraFile');
    assert.equal(await camera.getAttribute('capture'),'environment','Mobile receipt control must request the rear/environment camera');
    const accepts=String(await camera.getAttribute('accept')||'');
    assert.match(accepts,/image\/jpeg/);
    assert.match(accepts,/image\/png/);
    assert.doesNotMatch(accepts,/image\/\*/);
    const onePixelPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8\/x8AAusB9Y9Z9Z0AAAAASUVORK5CYII=','base64');
    await camera.setInputFiles({name:'qa-mobile-receipt.png',mimeType:'image/png',buffer:onePixelPng});
    await page.getByRole('heading',{name:'Document controleren'}).waitFor({timeout:15000});
    assert.ok(processorMethods.includes('POST'),'Mobile receipt photo must reach POST /analyze');
    assert.ok(processorOrigins.includes(appOrigin),'Mobile receipt photo must preserve the app Origin');
    const mobileReview=await page.evaluate(()=>({
      width:window.innerWidth,
      kind:pendingUploadKind,
      source:pendingPdfImport?.parsed?.processor?.kind,
      ocrUsed:pendingPdfImport?.parsed?.processor?.ocrUsed,
      gross:pendingPdfImport?.parsed?.gross
    }));
    assert.deepEqual(mobileReview,{width:390,kind:'purchase',source:'image',ocrUsed:true,gross:121});
    await page.close();
  }

  // QA-OCR-BETA-001: only the explicitly allowlisted authenticated account
  // routes to the PP-OCRv6 beta processor; every other account stays stable.
  {
    const page=await newAppPage();
    const routing=await page.evaluate(betaUserId=>{
      const previous=currentUser;
      currentUser={...TEST_USER,id:betaUserId};
      const beta=activeDocumentProcessorUrl();
      currentUser=TEST_USER;
      const stable=activeDocumentProcessorUrl();
      currentUser=previous;
      return {beta,stable};
    },'d0323018-5346-475b-9c93-073d5d4fbab7');
    assert.equal(routing.beta,'https://boekuna-pr58-ocr-staging.onrender.com','Allowlisted account must use the PP-OCRv6 beta processor');
    assert.equal(routing.stable,processorBase,'Non-beta accounts must stay on the stable processor');
    await page.close();
  }

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
    assert.equal(await page.locator('#pdfImportForm [name="vatRate"]').isDisabled(),true,'Mixed VAT must disable the scalar rate control');
    assert.match(String(await page.locator('#financialCorrectionPanel').textContent()),/meerdere btw-tarieven/i);
    assert.equal(await page.getByRole('button',{name:'Gebruik deze bedragen'}).count(),0,'Mixed VAT must never offer single-rate autocorrection');

    await page.evaluate(()=>savePdfInvoiceImport());
    const saved=await page.evaluate(()=>{
      const e=state.expenses[0];
      const raw=JSON.parse(localStorage.getItem(userDataKey())||'{}')?.expenses?.[0];
      return {
        inMemory:{vatRate:e?.vatRate,mixedRates:e?.mixedRates,vatLines:e?.vatLines,vatAmount:e?.vatAmount,gross:e?expenseGross(e):null},
        persisted:{vatRate:raw?.vatRate,mixedRates:raw?.mixedRates,vatLines:raw?.vatLines,vatAmount:raw?.vatAmount,gross:raw?.gross}
      }
    });
    assert.equal(saved.inMemory.vatRate,null,'Mixed expense state must not contain an authoritative scalar VAT rate');
    assert.equal(saved.inMemory.mixedRates,true,'Mixed expense state must preserve mixedRates');
    assert.deepEqual(saved.inMemory.vatLines.map(v=>Number(v.rate)),[9,21],'Saved trusted VAT groups must preserve 9% and 21%');
    assert.equal(saved.inMemory.vatAmount,30);
    assert.equal(saved.inMemory.gross,230);
    assert.equal(saved.persisted.vatRate,null,'Persisted JSON must store null for mixed authoritative vatRate');
    assert.equal(saved.persisted.mixedRates,true,'Persisted JSON must store mixedRates=true');
    assert.deepEqual(saved.persisted.vatLines.map(v=>Number(v.rate)),[9,21],'Persisted JSON must retain both trusted VAT groups');

    const reopened=await page.evaluate(()=>{
      const persisted=JSON.parse(localStorage.getItem(userDataKey())||'{}');
      state=normalizeState(persisted);
      navigate('expenses');
      const e=state.expenses[0];
      return {vatRate:e.vatRate,mixedRates:e.mixedRates,label:expenseVatRateLabel(e),rates:expenseVatRates(e)}
    });
    assert.equal(reopened.vatRate,null,'Reopen from persisted state must keep mixed vatRate null');
    assert.equal(reopened.mixedRates,true);
    assert.equal(reopened.label,'Gemengd');
    assert.deepEqual(reopened.rates,[9,21]);

    const legacyReopened=await page.evaluate(()=>{
      const persisted=JSON.parse(localStorage.getItem(userDataKey())||'{}');
      persisted.expenses[0].vatRate=21;
      persisted.expenses[0].mixedRates=true;
      state=normalizeState(persisted);
      navigate('expenses');
      const e=state.expenses[0];
      return {vatRate:e.vatRate,mixedRates:e.mixedRates,label:expenseVatRateLabel(e),rates:expenseVatRates(e)}
    });
    assert.equal(legacyReopened.vatRate,null,'Reopen normalization must scrub a legacy stale 21% scalar from mixed persisted data');
    assert.equal(legacyReopened.mixedRates,true);
    assert.equal(legacyReopened.label,'Gemengd');
    assert.deepEqual(legacyReopened.rates,[9,21]);

    const listVat=String(await page.locator('table tbody tr').first().locator('td').nth(5).textContent()).trim();
    assert.equal(listVat,'Gemengd','Expense list must never render mixed VAT as 21%');

    await page.evaluate(()=>expenseActions(state.expenses[0].id));
    const modalText=await page.locator('.modal').textContent();
    assert.match(modalText,/Gemengd btw/,'Expense detail modal must label the booking as mixed VAT');
    assert.match(modalText,/9%:/,'Expense detail modal must expose the 9% trusted group');
    assert.match(modalText,/21%:/,'Expense detail modal must expose the 21% trusted group');
    await page.evaluate(()=>closeModal());

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

    const mergeSemantics=await page.evaluate(()=>{
      const localMixed={type:'purchase',documentType:'purchase_invoice',party:'Local Parser',invoiceNumber:'LOCAL-MIXED',issueDate:'2026-09-28',net:200,vatAmount:30,gross:230,iban:'NL00ZZZZ0000000002',vatRate:21,mixedRates:true,vatLines:[{rate:21,taxableAmount:100,vatAmount:21},{rate:9,taxableAmount:100,vatAmount:9}],fieldConfidence:{}};
      const processorMixed={sourceQuality:'processor-v2',type:'purchase',documentType:'purchase_invoice',party:'Processor',invoiceNumber:'MIXED',issueDate:'2026-09-28',net:200,vatAmount:30,gross:230,iban:'',vatRate:null,mixedRates:true,vatLines:[{rate:9,taxableAmount:100,vatAmount:9},{rate:21,taxableAmount:100,vatAmount:21}],fieldConfidence:{}};
      const processorMerged=mergeAIParsed(localMixed,processorMixed,'purchase');
      const laterAi={type:'purchase',documentType:'purchase_invoice',party:'Later AI',invoiceNumber:'MIXED',issueDate:'2026-09-28',net:200,vatAmount:30,gross:230,iban:'NL00ZZZZ0000000002',vatRate:21,mixedRates:false,vatLines:[{rate:21,taxableAmount:200,vatAmount:30}],fieldConfidence:{}};
      const afterLaterAi=mergeAIParsed(processorMerged,laterAi,'purchase');
      const fallbackExpense=normalizeExpenseVatSemantics({exVat:200,vatRate:21,mixedRates:true,vatAmount:null,gross:null,vatLines:processorMixed.vatLines,taxTreatment:'standard'});
      return {
        processor:{iban:processorMerged.iban,vatRate:processorMerged.vatRate,mixedRates:processorMerged.mixedRates,rates:processorMerged.vatLines.map(v=>Number(v.rate))},
        later:{iban:afterLaterAi.iban,vatRate:afterLaterAi.vatRate,mixedRates:afterLaterAi.mixedRates,rates:afterLaterAi.vatLines.map(v=>Number(v.rate)),sourceQuality:afterLaterAi.sourceQuality},
        fallback:{vat:expenseVat(fallbackExpense),gross:expenseGross(fallbackExpense),label:expenseVatRateLabel(fallbackExpense)}
      }
    });
    assert.deepEqual(mergeSemantics.processor,{iban:'',vatRate:null,mixedRates:true,rates:[9,21]},'Authoritative processor must clear an invalid stale local IBAN while preserving mixed VAT semantics');
    assert.deepEqual(mergeSemantics.later,{iban:'',vatRate:null,mixedRates:true,rates:[9,21],sourceQuality:'processor-v2'},'Later non-authoritative AI must not reintroduce an invalid IBAN or overwrite trusted processor VAT groups');
    assert.deepEqual(mergeSemantics.fallback,{vat:30,gross:230,label:'Gemengd'},'Mixed VAT totals must fall back to trusted VAT groups when scalar VAT amount is absent');

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

  // QA-FIN-CORR-001: inconsistent low-confidence OCR becomes explicit USER truth,
  // then deterministic cent-exact correction is proposed, applied and persisted.
  {
    processorMode='success';
    processorResponse=correctionProcessorPayload;
    processorMethods=[];
    processorOrigins=[];
    const page=await newAppPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('dialog',dialog=>dialog.accept());

    await page.locator('#invoicePdfFile').setInputFiles({
      name:'qa-financial-correction.pdf',
      mimeType:'application/pdf',
      buffer:Buffer.from('%PDF-1.7\n% Boekuna smart financial correction QA\n')
    });
    await page.getByRole('heading',{name:'Document controleren'}).waitFor({timeout:15000});
    await page.evaluate(()=>setDocumentReviewStep(2));

    const gross=page.locator('#pdfImportForm [name="gross"]');
    const rate=page.locator('#pdfImportForm [name="vatRate"]');
    const net=page.locator('#pdfImportForm [name="net"]');
    const vat=page.locator('#pdfImportForm [name="vatAmount"]');
    const panel=page.locator('#financialCorrectionPanel');

    assert.equal(await net.getAttribute('inputmode'),'decimal');
    assert.equal(await vat.getAttribute('inputmode'),'decimal');
    assert.equal(await gross.getAttribute('inputmode'),'decimal');
    assert.equal(await panel.getAttribute('aria-live'),'polite');
    const initialPanel=String(await panel.textContent());
    assert.match(initialPanel,/Btw verdient controle|Bevestig wat je op het document ziet|Nog te weinig betrouwbare gegevens/,'Recognition may explain the deterministic mismatch before confirmation, but must not make it applicable');
    assert.equal(await page.getByRole('button',{name:'Gebruik deze bedragen'}).count(),0,'Recognition alone must not silently offer an applicable correction');

    // Dutch decimal input must be accepted and normalized without changing value.
    await gross.fill('128,66');
    await gross.blur();
    assert.equal(await gross.inputValue(),'128.66');
    assert.equal(String(await page.locator('[data-financial-badge="gross"]').textContent()).trim(),'Bevestigd');

    // Confirming the recognized scalar rate makes USER + USER the authoritative anchors.
    assert.equal(await rate.inputValue(),'21');
    await page.locator('[data-financial-confirm="vatRate"]').click();
    await page.getByRole('button',{name:'Gebruik deze bedragen'}).waitFor();
    assert.match(String(await panel.textContent()),/€\s*106,33/);
    assert.match(String(await panel.textContent()),/€\s*22,33/);
    assert.match(String(await panel.textContent()),/€\s*128,66/);

    // "Zelf aanpassen" must not silently mutate any amount.
    const beforeDismiss=await page.evaluate(()=>({
      net:document.querySelector('#pdfImportForm [name="net"]')?.value,
      vat:document.querySelector('#pdfImportForm [name="vatAmount"]')?.value,
      gross:document.querySelector('#pdfImportForm [name="gross"]')?.value
    }));
    await page.getByRole('button',{name:'Zelf aanpassen'}).click();
    const afterDismiss=await page.evaluate(()=>({
      net:document.querySelector('#pdfImportForm [name="net"]')?.value,
      vat:document.querySelector('#pdfImportForm [name="vatAmount"]')?.value,
      gross:document.querySelector('#pdfImportForm [name="gross"]')?.value
    }));
    assert.deepEqual(afterDismiss,beforeDismiss,'Dismiss must never rewrite recognized/user values');

    await page.getByRole('button',{name:'Gebruik deze bedragen'}).click();
    assert.equal(await net.inputValue(),'106.33');
    assert.equal(await vat.inputValue(),'22.33');
    assert.equal(await gross.inputValue(),'128.66');
    assert.equal(String(await page.locator('[data-financial-badge="net"]').textContent()).trim(),'Berekend');
    assert.equal(String(await page.locator('[data-financial-badge="vatAmount"]').textContent()).trim(),'Berekend');
    assert.equal(String(await page.locator('[data-financial-badge="gross"]').textContent()).trim(),'Bevestigd');
    assert.equal(String(await page.locator('[data-financial-badge="vatRate"]').textContent()).trim(),'Bevestigd');
    assert.match(String(await panel.textContent()),/Bedragen kloppen/);

    // Mobile-first responsive and overflow checks on the actual review UI.
    for(const width of [320,360,375,390,393,430,768]){
      await page.setViewportSize({width,height:844});
      const layout=await page.evaluate(()=>({
        overflow:document.documentElement.scrollWidth-window.innerWidth,
        panelWidth:document.getElementById('financialCorrectionPanel')?.getBoundingClientRect().width||0,
        viewport:window.innerWidth
      }));
      assert.ok(layout.overflow<=2,'Financial review must not overflow at '+width+'px');
      assert.ok(layout.panelWidth<=layout.viewport,'Correction panel must fit at '+width+'px');
    }
    await page.setViewportSize({width:1440,height:1000});

    await page.evaluate(()=>savePdfInvoiceImport());
    const saved=await page.evaluate(()=>{
      const e=state.expenses.find(x=>x.invoiceNumber==='QA-CORRECTION-12866');
      const doc=state.documents.find(x=>x.linkedId===e?.id);
      const raw=JSON.parse(localStorage.getItem(userDataKey())||'{}');
      const persisted=raw.expenses?.find(x=>x.invoiceNumber==='QA-CORRECTION-12866');
      return {
        memory:e?{net:e.exVat,vat:e.vatAmount,gross:e.gross,rate:e.vatRate,prov:e.fieldProvenance,events:e.financialCorrectionEvents}:null,
        document:doc?{prov:doc.fieldProvenance,events:doc.financialCorrectionEvents}:null,
        persisted:persisted?{net:persisted.exVat,vat:persisted.vatAmount,gross:persisted.gross,rate:persisted.vatRate,prov:persisted.fieldProvenance}:null
      };
    });
    assert.equal(saved.memory?.net,106.33);
    assert.equal(saved.memory?.vat,22.33);
    assert.equal(saved.memory?.gross,128.66);
    assert.equal(saved.memory?.rate,21);
    assert.equal(saved.memory?.prov?.gross?.source,'user');
    assert.equal(saved.memory?.prov?.vatRate?.source,'user');
    assert.equal(saved.memory?.prov?.net?.source,'calculated');
    assert.equal(saved.memory?.prov?.vatAmount?.source,'calculated');
    assert.ok(saved.memory?.events?.some(x=>x.type==='financial_recalculation_applied'));
    assert.deepEqual(saved.persisted?.prov,saved.memory?.prov,'Provenance must survive local persistence');
    assert.deepEqual(saved.document?.prov,saved.memory?.prov,'Document record must carry the same financial provenance');

    const reopened=await page.evaluate(()=>{
      state=normalizeState(JSON.parse(localStorage.getItem(userDataKey())||'{}'));
      const e=state.expenses.find(x=>x.invoiceNumber==='QA-CORRECTION-12866');
      return {net:e?.exVat,vat:e?.vatAmount,gross:e?.gross,rate:e?.vatRate,prov:e?.fieldProvenance};
    });
    assert.equal(reopened.net,106.33);
    assert.equal(reopened.vat,22.33);
    assert.equal(reopened.gross,128.66);
    assert.equal(reopened.rate,21);
    assert.equal(reopened.prov?.gross?.source,'user');
    assert.equal(reopened.prov?.net?.source,'calculated');
    assert.deepEqual(errors,[],'Smart financial correction browser errors: '+errors.join(' | '));
    await page.close();
  }

  // ISSUE-30: the original mixed-VAT fixture must save even when the processor
  // returns its intentionally non-bankable fictitious supplier IBAN. The IBAN
  // is not trusted as a definitive value, stays editable/optional in review,
  // and the already-correct mixed VAT semantics must remain untouched.
  {
    processorMode='success';
    processorResponse=issue30ProcessorPayload;
    processorMethods=[];
    processorOrigins=[];
    const page=await newAppPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('dialog',dialog=>dialog.accept());

    await page.locator('#invoicePdfFile').setInputFiles({
      name:'02_gemengde_btw_9_en_21.pdf',
      mimeType:'application/pdf',
      buffer:originalMixedVatFixture
    });

    await page.getByRole('heading',{name:'Document controleren'}).waitFor({timeout:15000});
    const review=await page.evaluate(()=>({
      invoiceNumber:pendingPdfImport?.parsed?.invoiceNumber,
      net:pendingPdfImport?.parsed?.net,
      vatAmount:pendingPdfImport?.parsed?.vatAmount,
      gross:pendingPdfImport?.parsed?.gross,
      iban:pendingPdfImport?.parsed?.iban,
      ibanErrors:validateCandidateSchema(pendingPdfImport?.parsed||{}).filter(x=>/IBAN/i.test(x)),
      vatRate:pendingPdfImport?.parsed?.vatRate,
      mixedRates:pendingPdfImport?.parsed?.mixedRates,
      vatLines:pendingPdfImport?.parsed?.vatLines
    }));
    assert.equal(review.invoiceNumber,'KKG/26/09/7741');
    assert.equal(review.net,429.95);
    assert.equal(review.vatAmount,52.49);
    assert.equal(review.gross,482.44);
    assert.equal(review.iban,'','Invalid processor IBAN must be cleared before it can become a hidden save blocker');
    assert.deepEqual(review.ibanErrors,[],'Untrusted extracted IBAN must not block review/save');
    assert.equal(review.vatRate,null,'Issue #30 fix must not reintroduce a scalar VAT rate');
    assert.equal(review.mixedRates,true);
    assert.deepEqual(review.vatLines,[
      {rate:9,taxableAmount:315,vatAmount:28.35},
      {rate:21,taxableAmount:114.95,vatAmount:24.14}
    ]);

    const ibanInput=page.locator('#pdfImportForm [name="iban"]');
    assert.equal(await ibanInput.count(),1,'Supplier IBAN must be exposed in review so it can be corrected or removed');
    assert.equal(await ibanInput.inputValue(),'','Untrusted fixture IBAN must start empty');
    await page.evaluate(()=>setDocumentReviewStep(3));
    await page.locator('.review-step[data-review-step="3"] details.review-details').evaluate(el=>{el.open=true});
    await ibanInput.fill('NL91ABNA0417164300');
    await ibanInput.fill('');
    await page.evaluate(()=>savePdfInvoiceImport());

    const saved=await page.evaluate(()=>{
      const e=state.expenses[0];
      const supplier=state.contacts.find(c=>c.id===e?.supplierId)||state.contacts.find(c=>c.name===e?.vendor);
      return {
        documents:state.documents.length,
        expenses:state.expenses.length,
        invoiceNumber:e?.invoiceNumber,
        net:e?.exVat,
        vatAmount:e?.vatAmount,
        gross:e?.gross,
        vatRate:e?.vatRate,
        mixedRates:e?.mixedRates,
        vatLines:e?.vatLines,
        supplierIban:supplier?.iban||''
      }
    });
    assert.equal(saved.documents,1);
    assert.equal(saved.expenses,1);
    assert.equal(saved.invoiceNumber,'KKG/26/09/7741');
    assert.equal(saved.net,429.95);
    assert.equal(saved.vatAmount,52.49);
    assert.equal(saved.gross,482.44);
    assert.equal(saved.vatRate,null);
    assert.equal(saved.mixedRates,true);
    assert.deepEqual(saved.vatLines,[
      {rate:9,taxableAmount:315,vatAmount:28.35},
      {rate:21,taxableAmount:114.95,vatAmount:24.14}
    ]);
    assert.equal(saved.supplierIban,'','Invalid fictitious supplier IBAN must not be persisted');
    assert.deepEqual(errors,[],'Issue #30 browser errors: '+errors.join(' | '));
    await page.close();
  }

  // QA-DOC-SELF-001: explicit processor self-billing must survive the
  // processor mapper, review candidate, save, persistence and reopen.
  {
    processorMode='success';
    processorResponse=selfBillingProcessorPayload;
    processorMethods=[];
    processorOrigins=[];
    const page=await newAppPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('dialog',dialog=>dialog.accept());

    await page.locator('#invoicePdfFile').setInputFiles({
      name:'self-billing-23003.pdf',
      mimeType:'application/pdf',
      buffer:Buffer.from('%PDF-1.7\n% Boekuna self-billing browser QA\n')
    });

    await page.getByRole('heading',{name:'Document controleren'}).waitFor({timeout:15000});
    const review=await page.evaluate(()=>({
      type:pendingPdfImport?.parsed?.type,
      documentType:pendingPdfImport?.parsed?.documentType,
      party:pendingPdfImport?.parsed?.party,
      invoiceNumber:pendingPdfImport?.parsed?.invoiceNumber,
      selfBilling:pendingPdfImport?.parsed?.selfBilling,
      gross:pendingPdfImport?.parsed?.gross,
      payout:pendingPdfImport?.parsed?.payout
    }));
    assert.equal(review.type,'sale');
    assert.equal(review.documentType,'sale_invoice');
    assert.equal(review.party,'Restaurant Company Europe');
    assert.equal(review.invoiceNumber,'Y41829623003');
    assert.equal(review.selfBilling,true,'Processor selfBilling=true must reach the review candidate');
    assert.equal(review.gross,187.55);
    assert.equal(review.payout,180.97);

    await page.evaluate(()=>savePdfInvoiceImport());
    const saved=await page.evaluate(()=>{
      const invoice=state.invoices.find(i=>i.number==='Y41829623003');
      const persisted=JSON.parse(localStorage.getItem(userDataKey())||'{}').invoices?.find(i=>i.number==='Y41829623003');
      return {
        memory:invoice?{selfBilling:invoice.selfBilling,gross:invoiceGross(invoice),payout:invoice.payout,kind:invoice.kind}:null,
        persisted:persisted?{selfBilling:persisted.selfBilling,payout:persisted.payout,kind:persisted.kind}:null
      }
    });
    assert.equal(saved.memory?.selfBilling,true,'Saved invoice must retain selfBilling=true');
    assert.equal(saved.persisted?.selfBilling,true,'Persisted invoice JSON must retain selfBilling=true');
    assert.equal(saved.memory?.gross,187.55);
    assert.equal(saved.memory?.payout,180.97);

    const reopened=await page.evaluate(()=>{
      const persisted=JSON.parse(localStorage.getItem(userDataKey())||'{}');
      state=normalizeState(persisted);
      navigate('invoices');
      const invoice=state.invoices.find(i=>i.number==='Y41829623003');
      return {selfBilling:invoice?.selfBilling,gross:invoice?invoiceGross(invoice):null,payout:invoice?.payout}
    });
    assert.equal(reopened.selfBilling,true,'Reopen must preserve explicit selfBilling=true');
    assert.equal(reopened.gross,187.55);
    assert.equal(reopened.payout,180.97);

    const mapperSafety=await page.evaluate(()=>{
      const normal=processorAnalysisToCandidate({
        documentType:'sales_invoice',selfBilling:false,
        supplier:{name:'QA PDF BV'},customer:{name:'Normale Klant B.V.'},
        invoice:{invoiceNumber:'NORMAL-SALE-1',invoiceDate:'2026-09-28'},
        amounts:{subtotal:100,vatTotal:21,total:121,vatLines:[{rate:21,taxableAmount:100,vatAmount:21}],currency:'EUR'},
        processing:{fastPath:'deterministic',selfBilling:false},confidence:{}
      },'Normale verkoopfactuur','auto');
      return {selfBilling:normal.selfBilling,type:normal.type,party:normal.party}
    });
    assert.deepEqual(mapperSafety,{selfBilling:false,type:'sale',party:'Normale Klant B.V.'},
      'Normal sales direction must not imply self-billing');
    assert.deepEqual(errors,[],'Self-billing browser errors: '+errors.join(' | '));
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

  console.log('PDF browser regressions: PASS (QA-PDF-02 single-rate upload/save; QA-DOC-REL-001 mixed 9%+21% merge/review/save/reopen/UI/CSV; issue #30 original mixed-VAT invalid-IBAN save regression; QA-DOC-SELF-001 processor self-billing review/save/reopen; single 0/9/21 VAT regressions; QA-PDF-03 processor-outage fallback)');
}finally{
  await browser.close();
  await new Promise(resolve=>appServer.close(resolve));
  await new Promise(resolve=>processorServer.close(resolve));
}
