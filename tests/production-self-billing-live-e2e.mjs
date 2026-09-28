import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { chromium } from 'playwright';

const ORIGIN='https://boekuna-boekhouding.onrender.com';
const PROCESSOR='https://kwinest-docprocessor.onrender.com';
const EMAIL=process.env.BOOKUNA_MARKETING_CAPTURE_EMAIL||'';
const PASSWORD=process.env.BOOKUNA_MARKETING_CAPTURE_PASSWORD||'';
assert.ok(EMAIL&&PASSWORD,'Dedicated QA/demo credentials are required');

function replaceLast(source,needle,replacement){
  const i=source.lastIndexOf(needle);
  if(i<0)throw new Error('Missing bootstrap marker: '+needle);
  return source.slice(0,i)+replacement+source.slice(i+needle.length);
}
function cents(v){return Math.round(Number(v)*100)}

async function makeSelfBillingPdf(){
  const pdf=await PDFDocument.create();
  const page=pdf.addPage([595,842]);
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const lines=[
    ['FACTUUR',bold,18],
    ['Van:',bold,11],
    ['KWINSTUDIO',font,11],
    ['Teststraat 1',font,10],
    ['3011 AA Rotterdam',font,10],
    ['Factuur uitgereikt door afnemer',bold,11],
    ['',font,10],
    ['Aan:',bold,11],
    ['QA Client B.V.',font,11],
    ['Klantstraat 10',font,10],
    ['3012 BB Rotterdam',font,10],
    ['',font,10],
    ['Factuurnummer: QA-SELF-20260928-001',font,11],
    ['Factuurdatum: 28-09-2026',font,11],
    ['Omschrijving: Consultancy september',font,11],
    ['',font,10],
    ['Subtotaal: EUR 100,00',font,11],
    ['BTW 21%: EUR 21,00',font,11],
    ['Totaal te betalen: EUR 121,00',bold,12]
  ];
  let y=790;
  for(const [line,f,size] of lines){
    page.drawText(line,{x:54,y,size,font:f});
    y-=line?24:12;
  }
  return Buffer.from(await pdf.save());
}

const pdfBytes=await makeSelfBillingPdf();

// Pull the actual currently deployed application HTML. This makes the client
// half of the test production-source based rather than branch-source based.
const liveAppRes=await fetch(ORIGIN+'/app?qa-self='+Date.now(),{redirect:'follow'});
assert.equal(liveAppRes.status,200,'Production /app must return HTTP 200');
const liveSource=await liveAppRes.text();
assert.ok(liveSource.includes("selfBilling:!!a.selfBilling||!!proc.selfBilling"),
  'Production client must include processor -> candidate selfBilling mapping');

const supabaseUrl=(liveSource.match(/const SUPABASE_URL='([^']+)'/)||[])[1];
const supabaseKey=(liveSource.match(/const SUPABASE_PUBLISHABLE_KEY='([^']+)'/)||[])[1];
assert.ok(supabaseUrl&&supabaseKey,'Supabase public auth config missing from production source');
const auth=await fetch(supabaseUrl+'/auth/v1/token?grant_type=password',{
  method:'POST',
  headers:{apikey:supabaseKey,'content-type':'application/json'},
  body:JSON.stringify({email:EMAIL,password:PASSWORD})
});
const authJson=await auth.json().catch(()=>({}));
assert.ok(auth.ok&&authJson.access_token,'Dedicated QA/demo account could not authenticate');
const token=authJson.access_token;

let liveProcessorJson;
{
  const form=new FormData();
  form.append('file',new Blob([pdfBytes],{type:'application/pdf'}),'qa-self-billing.pdf');
  form.append('company_json',JSON.stringify({
    name:'KWINSTUDIO',tradeName:'KWINSTUDIO',country:'Nederland',
    address:'Teststraat 1',postal:'3011AA',city:'Rotterdam'
  }));
  form.append('existing_json','[]');
  const res=await fetch(PROCESSOR+'/analyze',{
    method:'POST',
    headers:{Authorization:'Bearer '+token,Origin:ORIGIN},
    body:form
  });
  liveProcessorJson=await res.json().catch(()=>({}));
  assert.ok(res.ok&&liveProcessorJson.ok,
    'Production /analyze failed: '+JSON.stringify({status:res.status,error:liveProcessorJson?.error}));
  const d=liveProcessorJson.data||{};
  assert.equal(d.selfBilling,true,'Production processor top-level selfBilling must be true');
  assert.equal(d.processing?.selfBilling,true,'Production processor processing.selfBilling must be true');
  assert.equal(d.processing?.selfBillingEvidence,'explicit-source-text',
    'Production processor must attribute self-billing to explicit source text');
  assert.equal(d.documentType,'sales_invoice','Explicit self-billing with own company as supplier must be a sales invoice');
  assert.equal(d.invoice?.invoiceNumber,'QA-SELF-20260928-001');
  assert.equal(cents(d.amounts?.subtotal),10000);
  assert.equal(cents(d.amounts?.vatTotal),2100);
  assert.equal(cents(d.amounts?.total),12100);
  console.log('03C_LIVE_SELF_BILLING_PROCESSOR='+JSON.stringify({
    selfBilling:d.selfBilling,
    evidence:d.processing?.selfBillingEvidence,
    documentType:d.documentType,
    invoiceNumber:d.invoice?.invoiceNumber,
    subtotal:d.amounts?.subtotal,
    vatTotal:d.amounts?.vatTotal,
    total:d.amounts?.total
  }));
}

// Run the production client source with only auth/bootstrap replaced for an
// isolated QA state. The upload itself still goes to the real production processor.
let appHtml=liveSource.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
const parallelPdfInspection="const browserStructurePromise=ext==='pdf'&&file.size<9*1024*1024?readPdfStructure(file).catch(err=>{console.warn('Parallel PDF inspection',err);return null}):null;";
assert.ok(appHtml.includes(parallelPdfInspection),'Production client parallel PDF inspection hook missing');
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
await context.route(PROCESSOR+'/**',async route=>{
  const req=route.request();
  const headers={...req.headers()};
  if(req.method()!=='OPTIONS')headers.authorization='Bearer '+token;
  await route.continue({headers});
});
const page=await context.newPage();
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(String(e)));
page.on('dialog',d=>d.accept());

try{
  await page.goto(ORIGIN+'/app',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor();
  await page.evaluate(()=>navigate('documents'));
  await page.evaluate(()=>{pendingUploadKind='auto'});

  const processorPromise=page.waitForResponse(
    r=>r.url().includes('kwinest-docprocessor.onrender.com/analyze')&&r.request().method()==='POST',
    {timeout:150000}
  );
  await page.locator('#docFile').setInputFiles({
    name:'qa-self-billing.pdf',mimeType:'application/pdf',buffer:pdfBytes
  });
  const processorResponse=await processorPromise;
  const processorJson=await processorResponse.json().catch(()=>({}));
  assert.ok(processorResponse.ok()&&processorJson.ok,'Browser upload must receive successful live processor response');
  assert.equal(processorJson.data?.selfBilling,true,'Browser live processor response must expose selfBilling=true');

  await page.getByRole('heading',{name:'Document controleren'}).waitFor({timeout:30000});
  const review=await page.evaluate((processorData)=>({
    parsed:{
      type:pendingPdfImport?.parsed?.type,
      documentType:pendingPdfImport?.parsed?.documentType,
      party:pendingPdfImport?.parsed?.party,
      invoiceNumber:pendingPdfImport?.parsed?.invoiceNumber,
      selfBilling:pendingPdfImport?.parsed?.selfBilling,
      net:pendingPdfImport?.parsed?.net,
      vatAmount:pendingPdfImport?.parsed?.vatAmount,
      gross:pendingPdfImport?.parsed?.gross,
      sourceQuality:pendingPdfImport?.parsed?.sourceQuality
    },
    directMapped:processorAnalysisToCandidate(processorData,'','auto').selfBilling
  }),processorJson.data);

  assert.equal(review.directMapped,true,'Production processorAnalysisToCandidate must map top-level selfBilling=true');
  assert.equal(review.parsed.selfBilling,true,'Production review candidate must retain selfBilling=true');
  assert.equal(review.parsed.type,'sale');
  assert.equal(review.parsed.documentType,'sales_invoice');
  assert.equal(review.parsed.invoiceNumber,'QA-SELF-20260928-001');
  assert.equal(cents(review.parsed.net),10000);
  assert.equal(cents(review.parsed.vatAmount),2100);
  assert.equal(cents(review.parsed.gross),12100);
  assert.match(review.parsed.sourceQuality||'',/^processor-v2(?:-ai)?$/);

  assert.equal(await page.evaluate(()=>document.getElementById('pdfImportForm')?.checkValidity()||false),true,
    'Production self-billing review form must be savable');
  await page.evaluate(()=>savePdfInvoiceImport());
  await page.waitForFunction(()=>state?.invoices?.some(i=>i.number==='QA-SELF-20260928-001'));

  const saved=await page.evaluate(()=>{
    const memory=state.invoices.find(i=>i.number==='QA-SELF-20260928-001');
    const persistedState=JSON.parse(localStorage.getItem(userDataKey())||'{}');
    const persisted=persistedState.invoices?.find(i=>i.number==='QA-SELF-20260928-001');
    return {
      memory:memory?{selfBilling:memory.selfBilling,gross:invoiceGross(memory)}:null,
      persisted:persisted?{selfBilling:persisted.selfBilling,importedTotals:persisted.importedTotals}:null
    };
  });
  assert.equal(saved.memory?.selfBilling,true,'Saved production-client invoice must retain selfBilling=true');
  assert.equal(saved.persisted?.selfBilling,true,'Persisted production-client JSON must retain selfBilling=true');
  assert.equal(cents(saved.memory?.gross),12100);

  const reopened=await page.evaluate(()=>{
    const persisted=JSON.parse(localStorage.getItem(userDataKey())||'{}');
    state=normalizeState(persisted);
    const invoice=state.invoices.find(i=>i.number==='QA-SELF-20260928-001');
    return {selfBilling:invoice?.selfBilling,gross:invoice?invoiceGross(invoice):null};
  });
  assert.equal(reopened.selfBilling,true,'Reopen/normalize must preserve production selfBilling=true');
  assert.equal(cents(reopened.gross),12100);

  const normalSafety=await page.evaluate(()=>processorAnalysisToCandidate({
    documentType:'sales_invoice',selfBilling:false,
    supplier:{name:'KWINSTUDIO'},customer:{name:'Normale Klant B.V.'},
    invoice:{invoiceNumber:'NORMAL-SALE-QA',invoiceDate:'2026-09-28'},
    amounts:{subtotal:100,vatTotal:21,total:121,vatLines:[{rate:21,taxableAmount:100,vatAmount:21}],currency:'EUR'},
    processing:{fastPath:'deterministic',selfBilling:false},confidence:{}
  },'Normale verkoopfactuur','auto'));
  assert.equal(normalSafety.selfBilling,false,'Normal production sales direction must not imply self-billing');

  assert.deepEqual(pageErrors,[],'No browser page errors expected: '+pageErrors.join(' | '));
  console.log('03C production self-billing E2E: PASS (live processor -> live client review -> save -> persistence -> reopen; normal sales=false)');
}finally{
  await browser.close();
}
