import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';
import axeCore from 'axe-core';

const root=process.cwd();
const reviewJs=fs.readFileSync(path.join(root,'kwinest','app-assets','document-review-v2.js'),'utf8');
const reviewCss=fs.readFileSync(path.join(root,'kwinest','app-assets','document-review-v2.css'),'utf8');
const buildSource=fs.readFileSync(path.join(root,'scripts','build-app.mjs'),'utf8');

assert.equal(reviewJs.includes('<summary>Meer gegevens</summary>'),false,'secondary bookkeeping fields must stay out of the primary review flow');
assert.ok(reviewJs.includes('Stap 1 van 2')&&reviewJs.includes('Stap 2 van 2'),'two-step review labels missing');
assert.ok(reviewJs.includes('reviewWizardStep'),'two-step wizard controller missing');
assert.equal(/>\s*Negeren\s*</i.test(reviewJs),false,'generic Negeren action is forbidden');
assert.ok(reviewJs.includes('requirementsFor'),'contextual requirement matrix missing');
assert.ok(reviewJs.includes('reviewAttentionFields'),'deferred attention persistence missing');
assert.ok(reviewJs.includes('reviewSnapshot'),'saved review snapshot missing');
assert.ok(reviewJs.includes('mixedVatValidation'),'mixed VAT validation missing');
assert.ok(reviewJs.includes('netC+vatC!==grossC'),'financial core must compare cents exactly');
assert.ok(reviewCss.includes('min-height:44px'),'mobile review actions must keep 44px touch targets');
assert.ok(buildSource.includes("'document-review-v2.js'")&&buildSource.includes("'document-review-v2.css'"),'app build must copy review assets');
assert.ok(buildSource.includes('/assets/document-review-v2.js')&&buildSource.includes('/assets/document-review-v2.css'),'app build must inject review assets');

const build=spawnSync(process.execPath,['scripts/build-app.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,'app build failed: '+(build.stderr||build.stdout));
const dist=path.join(root,'dist','app');
for(const file of ['assets/document-review-v2.js','assets/document-review-v2.css'])assert.ok(fs.existsSync(path.join(dist,file)),'built review asset missing: '+file);

let appHtml=fs.readFileSync(path.join(dist,'index.html'),'utf8');
assert.ok(appHtml.includes('/assets/document-review-v2.js'),'built app must load review runtime');
assert.ok(appHtml.includes('/assets/document-review-v2.css'),'built app must load review styles');
const inlineScripts=[...appHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
assert.ok(inlineScripts.length>=1,'built app must contain inline runtime');
for(const [index,script] of inlineScripts.entries())assert.doesNotThrow(()=>new Function(script),'built inline script '+(index+1)+' must parse');

function replaceLast(text,needle,replacement){
  const i=text.lastIndexOf(needle);
  if(i<0)throw new Error('Missing fixture bootstrap marker: '+needle);
  return text.slice(0,i)+replacement+text.slice(i+needle.length);
}
appHtml=appHtml.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
appHtml=replaceLast(appHtml,'initAuth();',[
  "currentUser={...TEST_USER,email:'review-qa@example.test'};",
  "state=structuredClone(DEFAULT);",
  "state.company={...state.company,name:'Review QA BV',kvk:'12345678',vat:'NL123456789B01',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',email:'review-qa@example.test'};",
  "state.contacts=[];state.expenses=[];state.invoices=[];state.documents=[];",
  "documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;",
  "enterApp();"
].join('\n'));

const mime={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(pathname.startsWith('/assets/')){
    const file=path.join(dist,pathname);
    if(fs.existsSync(file)){res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});return fs.createReadStream(file).pipe(res)}
  }
  if(pathname==='/manifest.webmanifest'){res.writeHead(200,{'content-type':mime['.webmanifest']});return fs.createReadStream(path.join(dist,'manifest.webmanifest')).pipe(res)}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(appHtml);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browserType=process.env.BOOKUNA_BROWSER==='webkit'?webkit:chromium;
const browserName=process.env.BOOKUNA_BROWSER==='webkit'?'webkit':'chromium';
const browser=await browserType.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));

async function openReview(overrides={}){
  await page.evaluate(overrides=>{
    const {__sourceClientRef='',...parsedOverrides}=overrides;
    const base={
      type:'purchase',documentType:'purchase_invoice',confidenceScore:82,sourceQuality:'processor-v2',
      party:'Voorbeeld Leverancier BV',invoiceNumber:'INK-2026-001',issueDate:'2026-10-03',dueDate:'',
      description:'Software',category:'Software',currency:'EUR',status:'sent',
      net:100,vatAmount:21,gross:121,vatRate:21,mixedRates:false,
      vatLines:[{rate:21,taxableAmount:100,vatAmount:21}],lineItems:[],adjustments:[],
      fieldConfidence:{party:95,invoiceNumber:95,issueDate:95,net:98,vatAmount:98,gross:98,vatRate:98,vatLines:98,category:80}
    };
    pendingPdfImport={
      file:new File(['qa'],'review.pdf',{type:'application/pdf'}),
      parsed:{...base,...parsedOverrides},previewUrl:null,sha256:'review-qa',
      sourceClientRef:__sourceClientRef,sourceDocumentId:'',processingJobId:''
    };
    showPdfImportReview(pendingPdfImport.parsed);
  },overrides);
  await page.getByRole('heading',{name:'Document controleren'}).waitFor();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve())));
}
async function noOverflow(label){
  const x=await page.evaluate(()=>({vw:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert.ok(x.html<=x.vw+2&&x.body<=x.vw+2,label+' horizontal overflow '+JSON.stringify(x));
}

try{
  fs.mkdirSync(path.join(root,'tests','artifacts'),{recursive:true});
  await page.goto(base+'/app',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.BookunaDocumentReviewV2);
  await page.addScriptTag({content:axeCore.source});

  const matrix=await page.evaluate(()=>({
    receipt:BookunaDocumentReviewV2.requirementsFor('receipt'),
    invoice:BookunaDocumentReviewV2.requirementsFor('purchase_invoice')
  }));
  assert.ok(matrix.receipt.optional.includes('invoiceNumber'),'receipt number should not be universally required');
  assert.ok(matrix.invoice.blocking.includes('invoiceNumber'),'purchase invoice number should be blocking');
  assert.ok(matrix.receipt.attention.includes('category'),'receipt category remains useful but must not add another page');
  assert.ok(matrix.invoice.optional.includes('iban'),'IBAN must stay optional');

  // HAPPY RECEIPT — exactly two compact screens. No long form and no optional bookkeeping.
  await openReview({
    documentType:'receipt',invoiceNumber:'',party:'Shell Nederland',category:'Reiskosten',
    issueDate:'2026-10-04',net:100,vatAmount:21,gross:121,vatRate:21,
    address:'Weena 1',postal:'3013AA',city:'Rotterdam',email:'bon@example.test',iban:'NL91ABNA0417164300',
    reviewRouting:{mode:'AUTO_ACCEPT_CANDIDATE',fields:[],count:0,autoBook:false},
    fieldConfidence:{party:98,issueDate:99,net:99,vatAmount:99,gross:99,vatRate:99,vatLines:99,category:96}
  });
  assert.match(await page.locator('#documentReviewStepLabel').innerText(),/Stap 1 van 2/i);
  assert.equal(await page.locator('[data-review-page="1"]:visible').count(),1);
  assert.equal(await page.locator('[data-review-page="2"]:visible').count(),0);
  assert.equal(await page.locator('[data-review-page="1"] [name="party"]:visible').count(),1);
  assert.equal(await page.locator('[data-review-page="1"] [name="issueDate"]:visible').count(),1);
  assert.equal(await page.locator('[data-review-page="1"] [name="category"]:visible').count(),1);
  assert.equal(await page.locator('[name="address"]:visible').count(),0,'address must not be in primary review');
  assert.equal(await page.locator('[name="postal"]:visible').count(),0,'postal code must not be in primary review');
  assert.equal(await page.locator('[name="city"]:visible').count(),0,'city must not be in primary review');
  assert.equal(await page.locator('[name="email"]:visible').count(),0,'email must not be in primary review');
  assert.equal(await page.locator('[name="iban"]:visible').count(),0,'IBAN must not be in primary review');
  assert.doesNotMatch(await page.locator('#modalRoot').innerText(),/Meer gegevens|Herkenning verbeteren|Technische details/);
  assert.equal(await page.getByRole('button',{name:'Volgende',exact:true}).count(),1);
  assert.equal(await page.locator('[data-review-save]:visible').count(),0,'save must not compete with Next on step 1');
  await page.getByRole('button',{name:'Volgende',exact:true}).click();

  assert.match(await page.locator('#documentReviewStepLabel').innerText(),/Stap 2 van 2/i);
  assert.equal(await page.locator('[data-review-page="1"]:visible').count(),0);
  assert.equal(await page.locator('[data-review-page="2"]:visible').count(),1);
  assert.equal(await page.locator('[data-review-page="2"] [name="gross"]:visible').count(),1,'total is the primary amount');
  assert.equal(await page.locator('[data-review-page="2"] [name="vatAmount"]:visible').count(),1);
  assert.equal(await page.locator('[data-review-page="2"] [name="vatRate"]:visible').count(),1);
  assert.equal(await page.locator('[data-review-page="2"] [name="net"]:visible').count(),0,'ex-VAT stays derived/hidden when consistent');
  assert.equal(await page.getByRole('button',{name:'Vorige',exact:true}).count(),1);
  assert.equal(await page.locator('[data-review-save]:visible').count(),1);
  assert.equal(await page.locator('[data-review-save]:visible').first().isDisabled(),false);
  await page.screenshot({path:'tests/artifacts/document-review-two-step-desktop-'+browserName+'.png',fullPage:true});
  await page.evaluate(()=>closeModal());

  // PURCHASE INVOICE — page 1 has only supplier/date/invoice number; category is not forced here.
  await openReview({
    documentType:'purchase_invoice',party:'Cloud BV',invoiceNumber:'CLOUD-001',category:'Software',
    issueDate:'2026-10-04',net:200,vatAmount:42,gross:242,vatRate:21,
    reviewRouting:{mode:'AUTO_ACCEPT_CANDIDATE',fields:[],count:0,autoBook:false}
  });
  assert.equal(await page.locator('[data-review-page="1"] [name="party"]:visible').count(),1);
  assert.equal(await page.locator('[data-review-page="1"] [name="issueDate"]:visible').count(),1);
  assert.equal(await page.locator('[data-review-page="1"] [name="invoiceNumber"]:visible').count(),1);
  assert.equal(await page.locator('[data-review-page="1"] [name="category"]:visible').count(),0,'invoice category may be completed later');
  await page.evaluate(()=>closeModal());

  // Low-confidence suggestions do not create confirmation chores; seeing/editing the field is enough.
  await openReview({
    documentType:'receipt',invoiceNumber:'',party:'Shell Nederland',category:'Overig',
    reviewRouting:{mode:'QUICK_REVIEW',fields:['category'],count:1,autoBook:false},
    fieldConfidence:{party:98,issueDate:99,net:99,vatAmount:99,gross:99,vatRate:99,vatLines:99,category:45}
  });
  assert.equal(await page.locator('[data-review-page="1"] [name="category"]:visible').count(),1);
  assert.equal(await page.getByRole('button',{name:'Volgende',exact:true}).isDisabled(),false,'low confidence alone must not block the simple flow');
  await page.locator('[data-review-page="1"] [name="category"]').selectOption({label:'Reiskosten'});
  await page.getByRole('button',{name:'Volgende',exact:true}).click();
  assert.equal(await page.locator('[data-review-save]:visible').first().isDisabled(),false);
  await page.evaluate(()=>closeModal());

  // FINANCIAL MISMATCH — step 1 remains simple; step 2 contains the fix at the amount.
  await openReview({
    documentType:'receipt',invoiceNumber:'',party:'Rekenwinkel',category:'Kantoor',
    net:100,vatAmount:20,gross:121,vatRate:21,
    reviewRouting:{mode:'FULL_REVIEW',fields:['vatAmount'],count:1,autoBook:false},
    fieldConfidence:{party:98,issueDate:99,net:98,vatAmount:45,gross:99,vatRate:99,vatLines:45,category:90}
  });
  assert.equal(await page.getByRole('button',{name:'Volgende',exact:true}).isDisabled(),false,'financial issue belongs to step 2, not step 1');
  await page.getByRole('button',{name:'Volgende',exact:true}).click();
  assert.match(await page.locator('[data-review-page="2"]').innerText(),/kloppen nog niet|Controleer de btw/i);
  assert.equal(await page.locator('[data-review-net-editor]:visible').count(),1,'ex-VAT editor must appear only when an amount mismatch needs correction');
  assert.equal(await page.locator('[data-review-page="2"] [name="vatAmount"]:visible').count(),1);
  assert.equal(await page.locator('[data-review-save]:visible').first().isDisabled(),true);
  await page.locator('[data-review-page="2"] [name="vatAmount"]').fill('21,00');
  await page.locator('#reviewBlockingState').filter({hasText:/Alles ziet er goed uit|klaar om op te slaan/i}).waitFor();
  assert.equal(await page.locator('[data-review-save]:visible').first().isDisabled(),false);
  await page.evaluate(()=>closeModal());

  // MIXED VAT — only shown on the amounts screen, compact summary first.
  await openReview({
    documentType:'receipt',invoiceNumber:'',party:'Gemengde winkel',category:'Inkoop',
    mixedRates:true,vatRate:null,net:429.95,vatAmount:52.49,gross:482.44,
    vatLines:[{rate:9,taxableAmount:315,vatAmount:28.35},{rate:21,taxableAmount:114.95,vatAmount:24.14}],
    reviewRouting:{mode:'AUTO_ACCEPT_CANDIDATE',fields:[],count:0,autoBook:false},
    fieldConfidence:{party:98,issueDate:99,net:99,vatAmount:99,gross:99,vatLines:98,category:90}
  });
  assert.doesNotMatch(await page.locator('[data-review-page="1"]').innerText(),/2 btw-tarieven|21%|9%/i);
  await page.getByRole('button',{name:'Volgende',exact:true}).click();
  assert.match(await page.locator('[data-review-page="2"]').innerText(),/2 btw-tarieven|meerdere btw-tarieven/i);
  assert.match(await page.locator('[data-review-page="2"]').innerText(),/9%/);
  assert.match(await page.locator('[data-review-page="2"]').innerText(),/21%/);
  assert.equal(await page.locator('.mixed-vat-row:visible').count(),0);
  await page.getByRole('button',{name:'Verdeling aanpassen',exact:true}).click();
  assert.equal(await page.locator('.mixed-vat-row:visible').count(),2);
  await page.locator('.mixed-vat-row').first().locator('[data-vat-line-vat]').fill('28,34');
  await page.locator('#mixedVatStatus').filter({hasText:/telt nog niet op|Controleer/i}).waitFor();
  assert.equal(await page.locator('[data-review-save]:visible').first().isDisabled(),true);
  await page.locator('.mixed-vat-row').first().locator('[data-vat-line-vat]').fill('28,35');
  await page.locator('#mixedVatStatus').filter({hasText:/Btw-verdeling klopt/}).waitFor();
  await page.evaluate(()=>closeModal());

  // 0% VAT stays simple on the amounts screen.
  await openReview({
    documentType:'receipt',invoiceNumber:'',party:'Nul Btw Winkel',category:'Overig',
    net:100,vatAmount:0,gross:100,vatRate:0,
    reviewRouting:{mode:'AUTO_ACCEPT_CANDIDATE',fields:[],count:0,autoBook:false}
  });
  await page.getByRole('button',{name:'Volgende',exact:true}).click();
  assert.match(await page.locator('[data-review-page="2"]').innerText(),/Geen btw|0%/);
  assert.equal(await page.locator('[data-review-save]:visible').first().isDisabled(),false);
  await page.evaluate(()=>closeModal());

  // Foreign VAT stays exact and asks only for the treatment on step 2.
  await openReview({
    invoiceNumber:'FOREIGN-20',party:'Foreign Test Supplier',net:1350,vatAmount:270,gross:1620,vatRate:20,
    detectedVatRates:[20],accountingVatTreatment:'review_required',advancePayment:300,outstandingAmount:1320,
    reviewRouting:{mode:'FULL_REVIEW',fields:['vatTreatmentChoice'],count:1,autoBook:false}
  });
  await page.getByRole('button',{name:'Volgende',exact:true}).click();
  assert.match(await page.locator('[data-review-page="2"]').innerText(),/buitenlandse btw/i);
  assert.match(await page.locator('[data-review-page="2"]').innerText(),/Al betaald|Voorschot|Nog te betalen/i);
  assert.equal(await page.locator('[name="vatRate"]').inputValue(),'20');
  assert.equal(await page.locator('[data-review-save]:visible').first().isDisabled(),true);
  await page.locator('[name="vatTreatmentChoice"][value="foreign"]').check();
  await page.evaluate(()=>updateBeginnerReviewState());
  assert.equal(await page.locator('[data-review-save]:visible').first().isDisabled(),false);
  await page.evaluate(()=>closeModal());

  // Historical VAT remains exact.
  await openReview({
    invoiceNumber:'HISTORIC-6',party:'Dutch Historic Supplier',issueDate:'2018-12-31',
    net:100,vatAmount:6,gross:106,vatRate:6,detectedVatRates:[6],accountingVatTreatment:'review_required',
    reviewRouting:{mode:'FULL_REVIEW',fields:['vatTreatmentChoice'],count:1,autoBook:false}
  });
  await page.getByRole('button',{name:'Volgende',exact:true}).click();
  assert.equal(await page.locator('[name="vatRate"]').inputValue(),'6');
  assert.doesNotMatch(await page.locator('[data-review-page="2"]').innerText(),/6%.*wordt.*9%|6%.*wordt.*21%/i);
  await page.evaluate(()=>closeModal());

  // Duplicate/anomaly stay explicit on step 1, but no unrelated fields are added.
  await openReview({
    documentType:'receipt',invoiceNumber:'',party:'Dubbele Winkel',category:'Kantoor',
    duplicateCandidate:{id:'existing-doc',label:'Dubbele Winkel · € 12,10 · 4 oktober 2026'},
    reviewRouting:{mode:'FULL_REVIEW',fields:[],count:0,autoBook:false}
  });
  assert.match(await page.locator('[data-review-page="1"]').innerText(),/lijkt al verwerkt/i);
  assert.equal(await page.getByRole('button',{name:'Volgende',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Dit is toch een nieuwe bon',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Volgende',exact:true}).isDisabled(),false);
  await page.evaluate(()=>closeModal());

  await openReview({
    documentType:'receipt',invoiceNumber:'',party:'Controle Winkel',category:'Kantoor',
    anomalyCodes:['PRINTED_SUBTOTAL_CONFLICT'],
    reviewRouting:{mode:'FULL_REVIEW',fields:[],count:0,autoBook:false},
    fieldConfidence:{party:99,issueDate:99,net:99,vatAmount:99,gross:99,vatRate:99,vatLines:99,category:99}
  });
  assert.match(await page.locator('[data-review-page="1"]').innerText(),/extra controle nodig|origineel/i);
  assert.equal(await page.getByRole('button',{name:'Volgende',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Ik heb het origineel gecontroleerd',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Volgende',exact:true}).isDisabled(),false);
  await page.evaluate(()=>closeModal());

  // Non-bookable stays a document-only exit.
  const nonBookableSource='nonbookable-source';
  const beforeNonBookable=await page.evaluate(source=>{
    state.documents.unshift({id:'nonbookable-document',fileId:source,name:'nonbookable.pdf',type:'processing',date:'2026-10-04',processingState:'review_required'});
    return {documents:state.documents.length,expenses:state.expenses.length,invoices:state.invoices.length};
  },nonBookableSource);
  await openReview({
    __sourceClientRef:nonBookableSource,
    documentType:'other',bookingAllowed:false,party:'Voorbeeld',gross:25,net:25,vatAmount:0,vatRate:0,
    reviewRouting:{mode:'FULL_REVIEW',fields:[],count:0,autoBook:false}
  });
  assert.match(await page.locator('#modalRoot').innerText(),/geen definitieve bon of factuur/i);
  await page.getByRole('button',{name:'Document bewaren',exact:true}).click();
  await page.waitForFunction(source=>state.documents.some(d=>d.fileId===source&&d.nonBookable===true),nonBookableSource);
  const afterNonBookable=await page.evaluate(source=>{
    const saved=state.documents.find(d=>d.fileId===source);
    return {documents:state.documents.length,expenses:state.expenses.length,invoices:state.invoices.length,saved};
  },nonBookableSource);
  assert.equal(afterNonBookable.documents,beforeNonBookable.documents);
  assert.equal(afterNonBookable.expenses,beforeNonBookable.expenses);
  assert.equal(afterNonBookable.invoices,beforeNonBookable.invoices);
  assert.ok(afterNonBookable.saved&&!afterNonBookable.saved.linkedId);

  // Saving preserves recognized optional values even though the user never has to fill them here.
  await openReview({
    invoiceNumber:'REOPEN-2026-001',party:'Snapshot Leverancier',category:'Software',
    address:'Herengracht 1',postal:'1015AA',city:'Amsterdam',email:'finance@example.test',
    paymentReference:'RF-2026-001',orderNumber:'PO-88',
    reviewRouting:{mode:'AUTO_ACCEPT_CANDIDATE',fields:[],count:0,autoBook:false}
  });
  await page.getByRole('button',{name:'Volgende',exact:true}).click();
  await page.locator('[data-review-save]:visible').first().click();
  await page.waitForFunction(()=>state.documents.some(d=>d.reviewSnapshot?.invoiceNumber==='REOPEN-2026-001'));
  const savedOptional=await page.evaluate(()=>{
    const d=state.documents.find(x=>x.reviewSnapshot?.invoiceNumber==='REOPEN-2026-001');
    const expense=state.expenses.find(x=>x.id===d?.linkedId);
    const supplier=state.contacts.find(x=>x.name==='Snapshot Leverancier');
    return {snapshot:d?.reviewSnapshot,expense,supplier};
  });
  assert.equal(savedOptional.snapshot.paymentReference,'RF-2026-001');
  assert.equal(savedOptional.snapshot.orderNumber,'PO-88');
  assert.equal(savedOptional.supplier.address,'Herengracht 1');
  assert.equal(savedOptional.supplier.postal,'1015AA');
  assert.equal(savedOptional.supplier.city,'Amsterdam');

  // Credit signs stay negative in the compact amounts screen.
  await openReview({
    invoiceNumber:'CREDIT-NEG',documentType:'credit_invoice',isCredit:true,status:'credit',
    party:'Credit Leverancier',net:-100,vatAmount:-21,gross:-121,vatRate:21,
    reviewRouting:{mode:'AUTO_ACCEPT_CANDIDATE',fields:[],count:0,autoBook:false}
  });
  await page.getByRole('button',{name:'Volgende',exact:true}).click();
  assert.match(await page.locator('[data-review-page="2"]').innerText(),/-\s*€|€\s*-\s*121|−\s*€/);
  await page.evaluate(()=>closeModal());

  // Mobile acceptance — both normal screens fit without vertical scrolling to reach the action.
  for(const width of [320,360,375,390,393,412,430]){
    await page.setViewportSize({width,height:844});
    await openReview({
      documentType:'receipt',invoiceNumber:'',party:'Mobiele Winkel',category:'Kantoor',
      reviewRouting:{mode:'AUTO_ACCEPT_CANDIDATE',fields:[],count:0,autoBook:false},
      fieldConfidence:{party:99,issueDate:99,net:99,vatAmount:99,gross:99,vatRate:99,vatLines:99,category:99}
    });
    await noOverflow(browserName+' '+width+'px step 1');
    const step1=await page.locator('[data-review-page="1"]:visible').boundingBox();
    const next=await page.getByRole('button',{name:'Volgende',exact:true}).boundingBox();
    assert.ok(step1&&step1.height<610,width+'px step 1 must remain compact');
    assert.ok(next&&next.y+next.height<=844,width+'px Next must be reachable without scrolling');
    await page.getByRole('button',{name:'Volgende',exact:true}).click();
    await noOverflow(browserName+' '+width+'px step 2');
    const step2=await page.locator('[data-review-page="2"]:visible').boundingBox();
    const saveBox=await page.locator('[data-review-save]:visible').boundingBox();
    assert.ok(step2&&step2.height<610,width+'px step 2 must remain compact');
    assert.ok(saveBox&&saveBox.y+saveBox.height<=844,width+'px Save must be reachable without scrolling');
    const touch=await page.locator('.mobile-review-actions button:visible').evaluateAll(nodes=>nodes.map(el=>el.getBoundingClientRect().height));
    assert.ok(touch.length&&touch.every(h=>h>=44),width+'px touch targets must be >=44px');
    if(width===390)await page.screenshot({path:'tests/artifacts/document-review-two-step-mobile-'+browserName+'.png',fullPage:true});
    await page.evaluate(()=>closeModal());
  }

  // Axe on both wizard screens.
  await page.setViewportSize({width:390,height:844});
  await openReview({
    documentType:'receipt',invoiceNumber:'',party:'A11y Winkel',category:'Kantoor',
    reviewRouting:{mode:'AUTO_ACCEPT_CANDIDATE',fields:[],count:0,autoBook:false}
  });
  let axeResult=await page.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}}));
  assert.deepEqual(axeResult.violations.map(v=>v.id),[],'step 1 axe violations: '+JSON.stringify(axeResult.violations.map(v=>({id:v.id,impact:v.impact}))));
  await page.getByRole('button',{name:'Volgende',exact:true}).click();
  axeResult=await page.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}}));
  assert.deepEqual(axeResult.violations.map(v=>v.id),[],'step 2 axe violations: '+JSON.stringify(axeResult.violations.map(v=>({id:v.id,impact:v.impact}))));
  await page.evaluate(()=>closeModal());

  assert.deepEqual(errors,[],browserName+' two-step review JavaScript errors');
  console.log('BOEKUNA document review two-step UX '+browserName+': PASS');

}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
