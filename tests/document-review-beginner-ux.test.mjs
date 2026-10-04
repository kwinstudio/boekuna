import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';
import axeCore from 'axe-core';

const root=process.cwd();
const reviewJs=fs.readFileSync(path.join(root,'public','assets','document-review-v2.js'),'utf8');
const reviewCss=fs.readFileSync(path.join(root,'public','assets','document-review-v2.css'),'utf8');
const buildSource=fs.readFileSync(path.join(root,'scripts','build-app.mjs'),'utf8');

for(const phrase of ['Meer gegevens']){
  assert.ok(reviewJs.includes(phrase),'beginner review copy missing: '+phrase);
}
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
      parsed:{...base,...overrides},previewUrl:null,sha256:'review-qa',
      sourceClientRef:'',sourceDocumentId:'',processingJobId:''
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
  assert.ok(matrix.receipt.attention.includes('category'),'receipt category should remain reviewable attention');
  assert.ok(matrix.invoice.optional.includes('iban'),'IBAN should stay optional');

  // HAPPY RECEIPT — one screen, read-only result first, one primary save action.
  await openReview({
    documentType:'receipt',invoiceNumber:'',party:'Shell Nederland',category:'Reiskosten',
    issueDate:'2026-10-04',net:100,vatAmount:21,gross:121,vatRate:21,
    reviewRouting:{mode:'AUTO_ACCEPT_CANDIDATE',fields:[],count:0,autoBook:false},
    fieldConfidence:{party:98,issueDate:99,net:99,vatAmount:99,gross:99,vatRate:99,vatLines:99,category:96}
  });
  assert.equal(await page.locator('#mobileReviewStepLabel').count(),0,'simple review must not render step 1/2/3 progress');
  assert.match(await page.locator('#modalRoot').innerText(),/Shell Nederland/);
  assert.match(await page.locator('#modalRoot').innerText(),/€\s*121[,.]00/);
  assert.match(await page.locator('#modalRoot').innerText(),/Btw/);
  assert.match(await page.locator('#modalRoot').innerText(),/Reiskosten/);
  assert.match(await page.locator('#modalRoot').innerText(),/Alles ziet er goed uit/);
  assert.equal(await page.locator('#pdfImportForm [name="net"]:visible').count(),0,'simple review must not show money inputs');
  assert.equal(await page.locator('#pdfImportForm [name="vatAmount"]:visible').count(),0,'simple review must not show VAT input');
  assert.equal(await page.locator('#pdfImportForm [name="gross"]:visible').count(),0,'simple review must not show gross input');
  assert.equal(await page.getByRole('button',{name:'Dit klopt zo',exact:true}).count(),0,'simple review must not require per-field confirmations');
  assert.equal(await page.locator('[data-review-save]:visible').count(),1,'simple review must expose one visible primary save action');
  assert.equal(await page.locator('[data-review-save]:visible').first().isDisabled(),false,'happy receipt save must be enabled');
  assert.equal(await page.getByRole('button',{name:'Gegevens aanpassen',exact:true}).count(),1,'edit remains reachable');
  assert.equal(await page.getByRole('button',{name:'Bekijk origineel',exact:true}).count(),1,'original remains reachable');
  assert.equal(await page.locator('details.review-details').first().getAttribute('open'),null,'optional details must be collapsed');
  assert.doesNotMatch(await page.locator('#modalRoot').innerText(),/OCR\s*\d+%|confidence\s*\d+%/i,'beginner UI must not show confidence percentages');

  await page.getByRole('button',{name:'Gegevens aanpassen',exact:true}).click();
  assert.equal(await page.locator('[data-review-edit-panel] [name="party"]:visible').count(),1,'edit mode must expose supplier');
  assert.equal(await page.locator('[data-review-edit-panel] [name="gross"]:visible').count(),1,'edit mode must expose total');
  await page.getByRole('button',{name:'Gegevens aanpassen',exact:true}).click();
  await page.screenshot({path:'tests/artifacts/document-review-simple-desktop-'+browserName+'.png',fullPage:true});
  await page.evaluate(()=>closeModal());

  // QUICK REVIEW — only the uncertain category is interactive.
  await openReview({
    documentType:'receipt',invoiceNumber:'',party:'Shell Nederland',category:'Overig',
    reviewRouting:{mode:'QUICK_REVIEW',fields:['category'],count:1,autoBook:false},
    fieldConfidence:{party:98,issueDate:99,net:99,vatAmount:99,gross:99,vatRate:99,vatLines:99,category:45}
  });
  assert.match(await page.locator('#modalRoot').innerText(),/Controleer 1 ding/);
  assert.equal(await page.locator('[data-review-issue="category"] select:visible').count(),1,'uncertain category must be directly editable');
  assert.equal(await page.locator('#pdfImportForm [name="net"]:visible').count(),0,'quick category review must keep money controls hidden');
  assert.equal(await page.locator('#pdfImportForm [name="gross"]:visible').count(),0,'quick category review must keep gross hidden');
  await page.locator('[data-review-issue="category"] select').selectOption({label:'Reiskosten'});
  assert.equal(await page.locator('[data-review-save]:visible').first().isDisabled(),false,'resolved quick issue must allow save');
  await page.screenshot({path:'tests/artifacts/document-review-quick-desktop-'+browserName+'.png',fullPage:true});
  await page.evaluate(()=>closeModal());

  // FINANCIAL MISMATCH — direct inputs, exact cents, existing financial engine stays authoritative.
  await openReview({
    documentType:'receipt',invoiceNumber:'',party:'Rekenwinkel',category:'Kantoor',
    net:100,vatAmount:20,gross:121,vatRate:21,
    reviewRouting:{mode:'FULL_REVIEW',fields:['vatAmount'],count:1,autoBook:false},
    fieldConfidence:{party:98,issueDate:99,net:98,vatAmount:45,gross:99,vatRate:99,vatLines:45,category:90}
  });
  assert.match(await page.locator('#modalRoot').innerText(),/Controleer de btw|bedragen kloppen nog niet/i);
  assert.equal(await page.locator('[data-review-issue="vatAmount"] input:visible').count(),1,'financial mismatch must be fixable where it is shown');
  assert.equal(await page.locator('[data-review-save]:visible').first().isDisabled(),true,'financial mismatch must block save');
  await page.locator('[data-review-issue="vatAmount"] input').fill('21,00');
  await page.locator('#reviewBlockingState').filter({hasText:/Alles ziet er goed uit|Bedragen kloppen/}).waitFor();
  assert.equal(await page.locator('[data-review-save]:visible').first().isDisabled(),false,'cent-exact correction must unlock save');
  await page.screenshot({path:'tests/artifacts/document-review-financial-'+browserName+'.png',fullPage:true});
  await page.evaluate(()=>closeModal());

  // MIXED VAT — compact summary first, editor only after explicit edit or a mismatch.
  await openReview({
    documentType:'receipt',invoiceNumber:'',party:'Gemengde winkel',category:'Inkoop',
    mixedRates:true,vatRate:null,net:429.95,vatAmount:52.49,gross:482.44,
    vatLines:[{rate:9,taxableAmount:315,vatAmount:28.35},{rate:21,taxableAmount:114.95,vatAmount:24.14}],
    reviewRouting:{mode:'AUTO_ACCEPT_CANDIDATE',fields:[],count:0,autoBook:false},
    fieldConfidence:{party:98,issueDate:99,net:99,vatAmount:99,gross:99,vatLines:98,category:90}
  });
  assert.match(await page.locator('#modalRoot').innerText(),/2 btw-tarieven|meerdere btw-tarieven/i);
  assert.match(await page.locator('#modalRoot').innerText(),/9%/);
  assert.match(await page.locator('#modalRoot').innerText(),/21%/);
  assert.equal(await page.locator('.mixed-vat-row:visible').count(),0,'valid mixed VAT must not open row editor by default');
  await page.getByRole('button',{name:'Verdeling aanpassen',exact:true}).click();
  assert.equal(await page.locator('.mixed-vat-row:visible').count(),2,'mixed VAT edit must reveal rows on demand');
  await page.locator('.mixed-vat-row').first().locator('[data-vat-line-vat]').fill('28,34');
  await page.locator('#mixedVatStatus').filter({hasText:/telt nog niet op|Controleer/i}).waitFor();
  assert.equal(await page.locator('[data-review-save]:visible').first().isDisabled(),true,'invalid mixed VAT must block save');
  await page.locator('.mixed-vat-row').first().locator('[data-vat-line-vat]').fill('28,35');
  await page.locator('#mixedVatStatus').filter({hasText:/Btw-verdeling klopt/}).waitFor();
  await page.screenshot({path:'tests/artifacts/document-review-mixed-vat-'+browserName+'.png',fullPage:true});
  await page.evaluate(()=>closeModal());

  // 0% VAT stays simple when authoritative values are consistent.
  await openReview({
    documentType:'receipt',invoiceNumber:'',party:'Nul Btw Winkel',category:'Overig',
    net:100,vatAmount:0,gross:100,vatRate:0,
    reviewRouting:{mode:'AUTO_ACCEPT_CANDIDATE',fields:[],count:0,autoBook:false},
    fieldConfidence:{party:98,issueDate:99,net:99,vatAmount:99,gross:99,vatRate:99,vatLines:99,category:90}
  });
  assert.match(await page.locator('#modalRoot').innerText(),/Geen btw op dit document|0%/);
  assert.equal(await page.locator('[data-review-save]:visible').first().isDisabled(),false);
  await page.evaluate(()=>closeModal());

  // Foreign VAT stays foreign and requires an explicit existing treatment choice.
  await openReview({
    invoiceNumber:'FOREIGN-20',party:'Foreign Test Supplier',net:1350,vatAmount:270,gross:1620,vatRate:20,
    detectedVatRates:[20],accountingVatTreatment:'review_required',advancePayment:300,outstandingAmount:1320,
    reviewRouting:{mode:'FULL_REVIEW',fields:['vatTreatmentChoice'],count:1,autoBook:false}
  });
  assert.match(await page.locator('#modalRoot').innerText(),/buitenlandse btw/i);
  assert.match(await page.locator('#modalRoot').innerText(),/Al betaald|Voorschot|Nog te betalen/i);
  assert.equal(await page.locator('#pdfImportForm [name="vatRate"]').inputValue(),'20','foreign 20% must never normalize to 21%');
  assert.equal(await page.locator('[data-review-save]:visible').first().isDisabled(),true);
  await page.locator('[name="vatTreatmentChoice"][value="foreign"]').check();
  await page.evaluate(()=>updateBeginnerReviewState());
  assert.equal(await page.locator('[data-review-save]:visible').first().isDisabled(),false);
  await page.evaluate(()=>closeModal());

  // Historical VAT is preserved exactly.
  await openReview({
    invoiceNumber:'HISTORIC-6',party:'Dutch Historic Supplier',issueDate:'2018-12-31',
    net:100,vatAmount:6,gross:106,vatRate:6,detectedVatRates:[6],accountingVatTreatment:'review_required',
    reviewRouting:{mode:'FULL_REVIEW',fields:['vatTreatmentChoice'],count:1,autoBook:false}
  });
  assert.equal(await page.locator('#pdfImportForm [name="vatRate"]').inputValue(),'6','historic 6% must remain 6%');
  assert.doesNotMatch(await page.locator('#modalRoot').innerText(),/6%.*wordt.*9%|6%.*wordt.*21%/i);
  await page.evaluate(()=>closeModal());

  // Duplicate remains blocking with explicit override.
  await openReview({
    documentType:'receipt',invoiceNumber:'',party:'Dubbele Winkel',category:'Kantoor',
    duplicateCandidate:{id:'existing-doc',label:'Dubbele Winkel · € 12,10 · 4 oktober 2026'},
    reviewRouting:{mode:'FULL_REVIEW',fields:[],count:0,autoBook:false}
  });
  assert.match(await page.locator('#modalRoot').innerText(),/lijkt al verwerkt/i);
  assert.equal(await page.locator('[data-review-save]:visible').first().isDisabled(),true);
  await page.getByRole('button',{name:'Dit is toch een nieuwe bon',exact:true}).click();
  assert.equal(await page.locator('[data-review-save]:visible').first().isDisabled(),false,'explicit duplicate override must unlock save');
  await page.screenshot({path:'tests/artifacts/document-review-duplicate-'+browserName+'.png',fullPage:true});
  await page.evaluate(()=>closeModal());

  // Non-bookable document has a safe document-only exit, never an accounting form.
  const beforeNonBookable=await page.evaluate(()=>({documents:state.documents.length,expenses:state.expenses.length,invoices:state.invoices.length}));
  await openReview({
    documentType:'other',bookingAllowed:false,party:'Voorbeeld',gross:25,net:25,vatAmount:0,vatRate:0,
    reviewRouting:{mode:'FULL_REVIEW',fields:[],count:0,autoBook:false}
  });
  assert.match(await page.locator('#modalRoot').innerText(),/geen definitieve bon of factuur/i);
  assert.equal(await page.locator('#pdfImportForm [name="net"]:visible').count(),0,'non-bookable must not show accounting inputs');
  await page.getByRole('button',{name:'Document bewaren',exact:true}).click();
  await page.waitForFunction(n=>state.documents.length===n+1,beforeNonBookable.documents);
  const afterNonBookable=await page.evaluate(()=>({documents:state.documents.length,expenses:state.expenses.length,invoices:state.invoices.length,last:state.documents[0]}));
  assert.equal(afterNonBookable.expenses,beforeNonBookable.expenses,'document-only save must not create expense');
  assert.equal(afterNonBookable.invoices,beforeNonBookable.invoices,'document-only save must not create invoice');
  assert.ok(afterNonBookable.last&&!afterNonBookable.last.linkedId,'document-only save must remain unbooked');

  // Saved snapshot and reopen remain intact.
  await openReview({
    invoiceNumber:'REOPEN-2026-001',party:'Snapshot Leverancier',category:'Software',
    reviewRouting:{mode:'AUTO_ACCEPT_CANDIDATE',fields:[],count:0,autoBook:false},
    fieldConfidence:{party:99,invoiceNumber:99,issueDate:99,net:99,vatAmount:99,gross:99,vatRate:99,vatLines:99,category:99}
  });
  await page.locator('[data-review-save]:visible').first().click();
  await page.waitForFunction(()=>state.documents.some(d=>d.reviewSnapshot?.invoiceNumber==='REOPEN-2026-001'));
  const savedId=await page.evaluate(()=>state.documents.find(d=>d.reviewSnapshot?.invoiceNumber==='REOPEN-2026-001')?.id);
  assert.ok(savedId);
  await page.evaluate(id=>openSavedDocumentReview(id),savedId);
  assert.match(await page.locator('#modalRoot').innerText(),/REOPEN-2026-001/);
  assert.match(await page.locator('#modalRoot').innerText(),/Snapshot Leverancier/);
  await page.evaluate(()=>closeModal());

  // Credit signs stay negative in review presentation.
  await openReview({
    invoiceNumber:'CREDIT-NEG',documentType:'credit_invoice',isCredit:true,status:'credit',
    party:'Credit Leverancier',net:-100,vatAmount:-21,gross:-121,vatRate:21,
    reviewRouting:{mode:'AUTO_ACCEPT_CANDIDATE',fields:[],count:0,autoBook:false},
    fieldConfidence:{party:99,invoiceNumber:99,issueDate:99,net:99,vatAmount:99,gross:99,vatRate:99,vatLines:99,category:99}
  });
  assert.match(await page.locator('#modalRoot').innerText(),/-\s*€|€\s*-\s*121|−\s*€/,'credit review must preserve negative sign');
  await page.evaluate(()=>closeModal());

  // Mobile acceptance: single screen, no horizontal overflow, safe touch sizes.
  for(const width of [320,360,375,390,393,412,430]){
    await page.setViewportSize({width,height:844});
    await openReview({
      documentType:'receipt',invoiceNumber:'',party:'Mobiele Winkel',category:'Kantoor',
      reviewRouting:{mode:'AUTO_ACCEPT_CANDIDATE',fields:[],count:0,autoBook:false},
      fieldConfidence:{party:99,issueDate:99,net:99,vatAmount:99,gross:99,vatRate:99,vatLines:99,category:99}
    });
    await noOverflow(browserName+' '+width+'px simple review');
    assert.equal(await page.locator('#mobileReviewStepLabel').count(),0,width+'px must remain one screen without progress steps');
    const touch=await page.locator('.mobile-review-actions button:visible').evaluateAll(nodes=>nodes.map(el=>el.getBoundingClientRect().height));
    assert.ok(touch.length&&touch.every(h=>h>=44),width+'px review touch targets must be >=44px');
    if(width===390)await page.screenshot({path:'tests/artifacts/document-review-simple-mobile-'+browserName+'.png',fullPage:true});
    await page.evaluate(()=>closeModal());
  }

  // Axe on representative simple + quick states.
  await page.setViewportSize({width:390,height:844});
  await openReview({
    documentType:'receipt',invoiceNumber:'',party:'A11y Winkel',category:'Kantoor',
    reviewRouting:{mode:'AUTO_ACCEPT_CANDIDATE',fields:[],count:0,autoBook:false},
    fieldConfidence:{party:99,issueDate:99,net:99,vatAmount:99,gross:99,vatRate:99,vatLines:99,category:99}
  });
  const axeSimple=await page.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}}));
  assert.deepEqual(axeSimple.violations.map(v=>v.id),[],'simple review axe violations: '+JSON.stringify(axeSimple.violations.map(v=>({id:v.id,impact:v.impact}))));
  await page.evaluate(()=>closeModal());

  assert.deepEqual(errors,[],browserName+' beginner review JavaScript errors');
  console.log('BOEKUNA document review exception-first UX '+browserName+': PASS');

}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
