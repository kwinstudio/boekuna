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

let appHtml=original.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
appHtml=replaceLast(appHtml,'initAuth();',`
currentUser=TEST_USER;
state=structuredClone(DEFAULT);
for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
state.company={...state.company,name:'QA PDF BV',tradeName:'Boekuna PDF QA',contactName:'QA',email:'qa-pdf@example.test',phone:'0100000000',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',invoicePrefix:'2026-',paymentDays:14,kor:false};
enterApp();
`);

const server=http.createServer((req,res)=>{
  if(req.url?.startsWith('/manifest.webmanifest')){res.writeHead(200,{'content-type':'application/manifest+json'});return res.end('{}')}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(appHtml);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {port}=server.address();
const base=`http://127.0.0.1:${port}`;
const origin=new URL(base).origin;

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

function corsHeaders(extra={}){
  return {'access-control-allow-origin':origin,'access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'*',...extra};
}

async function routePdfJs(page){
  await page.route('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs',route=>route.fulfill({
    status:200,
    contentType:'text/javascript; charset=utf-8',
    headers:{'access-control-allow-origin':'*'},
    body:pdfModule
  }));
}

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

const browser=await chromium.launch({headless:true});

async function newAppPage(){
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await routePdfJs(page);
  await page.goto(base+'/app',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor();
  return page;
}

try{
  // QA-PDF-02: real browser upload path must survive CORS preflight -> processor POST -> review -> save.
  {
    const page=await newAppPage();
    const errors=[];
    const methods=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.route('https://kwinest-docprocessor.onrender.com/analyze',async route=>{
      const method=route.request().method();
      methods.push(method);
      if(method==='OPTIONS')return route.fulfill({status:204,headers:corsHeaders()});
      return route.fulfill({status:200,contentType:'application/json',headers:corsHeaders(),body:JSON.stringify(processorPayload)});
    });

    await page.locator('#invoicePdfFile').setInputFiles({
      name:'qa-pdf-02.pdf',
      mimeType:'application/pdf',
      buffer:Buffer.from('%PDF-1.7\n% Boekuna browser QA\n')
    });

    await page.getByRole('heading',{name:'Document controleren'}).waitFor({timeout:15000});
    assert.equal(await page.locator('#pdfImportForm [name="party"]').inputValue(),'Voorbeeld Leverancier BV');
    assert.equal(await page.locator('#pdfImportForm [name="invoiceNumber"]').inputValue(),'QA-PDF-02-001');
    assert.equal(await page.locator('#pdfImportForm [name="gross"]').inputValue(),'121.00');
    assert.ok(methods.includes('OPTIONS'),'QA-PDF-02 must exercise browser CORS preflight');
    assert.ok(methods.includes('POST'),'QA-PDF-02 must reach POST /analyze after preflight');

    await page.getByRole('button',{name:'Gecontroleerd & opslaan'}).click();
    await page.waitForFunction(()=>state.documents.length===1&&state.expenses.length===1);
    const saved=await page.evaluate(()=>({documents:state.documents.length,expenses:state.expenses.length,invoiceNumber:state.expenses[0]?.invoiceNumber,gross:expenseGross(state.expenses[0])}));
    assert.deepEqual(saved,{documents:1,expenses:1,invoiceNumber:'QA-PDF-02-001',gross:121});
    assert.deepEqual(errors,[],'QA-PDF-02 browser errors: '+errors.join(' | '));
    await page.close();
  }

  // QA-PDF-03: processor outage must use the browser PDF parser without the historical
  // "Can't find variable: pdfLibPromise" crash and still reach the real review UI.
  {
    const page=await newAppPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(String(e)));

    assert.equal(await page.evaluate(()=>typeof pdfLibPromise),'object','pdfLibPromise must be initialized before loadPdfLib runs');

    await page.route('https://kwinest-docprocessor.onrender.com/analyze',async route=>{
      const method=route.request().method();
      if(method==='OPTIONS')return route.fulfill({status:204,headers:corsHeaders()});
      return route.fulfill({
        status:503,
        contentType:'application/json',
        headers:corsHeaders(),
        body:JSON.stringify({ok:false,error:{code:'PROCESSOR_UNAVAILABLE',category:'temporary',retryable:true,state:'no_changes',reference_id:'BK-QAPDF'}})
      });
    });
    await page.route('https://vuwfyhtejsxhdfyvkkeq.supabase.co/functions/v1/analyze-invoice',async route=>{
      const method=route.request().method();
      if(method==='OPTIONS')return route.fulfill({status:204,headers:corsHeaders()});
      return route.fulfill({
        status:503,
        contentType:'application/json',
        headers:corsHeaders(),
        body:JSON.stringify({ok:false,error:{code:'PROCESSOR_UNAVAILABLE',category:'temporary',retryable:true,state:'no_changes'}})
      });
    });

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
    assert.ok(!errors.some(x=>/pdfLibPromise/i.test(x)),'QA-PDF-03 must never throw pdfLibPromise ReferenceError');
    assert.ok(!errors.some(x=>/ReferenceError/i.test(x)),'QA-PDF-03 fallback must not throw a browser ReferenceError');
    await page.close();
  }

  console.log('PDF browser regressions: PASS (QA-PDF-02 preflight/upload/review/save; QA-PDF-03 PDF.js fallback/no ReferenceError)');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
