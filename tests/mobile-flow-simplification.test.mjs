import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {chromium,webkit} from 'playwright';

const root=process.cwd();
const evidenceDir=path.join(root,'tests','artifacts','mobile-flow-simplification');
fs.mkdirSync(evidenceDir,{recursive:true});
const require=createRequire(import.meta.url);
const axeSource=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const jsPath=path.join(root,'kwinest','app-assets','mobile-flow-simplification.js');
const cssPath=path.join(root,'kwinest','app-assets','mobile-flow-simplification.css');
assert.ok(fs.existsSync(jsPath),'mobile flow simplification JS asset missing');
assert.ok(fs.existsSync(cssPath),'mobile flow simplification CSS asset missing');

const js=fs.readFileSync(jsPath,'utf8');
const css=fs.readFileSync(cssPath,'utf8');
const buildSource=fs.readFileSync(path.join(root,'scripts','build-app.mjs'),'utf8');
assert.match(js,/max-width:820px/,'runtime must use the established mobile breakpoint');
assert.match(css,/@media\s*\(max-width:820px\)/,'all visual changes must stay mobile-only');
for(const marker of ['saveContact','finalSaveInvoice','finalizeDraftAndSend','savePdfInvoiceImport','confirmDuplicateOverride','deleteDocumentNow','printInvoice']){
  assert.ok(js.includes(marker),'mobile flow must reuse existing authoritative action: '+marker);
}
assert.doesNotMatch(js,/state\.invoices\s*=|state\.expenses\s*=|vatRate\s*=\s*21|reserveFinalInvoiceNumber\(/,'mobile presentation layer must not reimplement accounting/state semantics');
assert.doesNotMatch(js,/duplicateInvoiceAsDraft\(/,'same-as-previous mobile choice must not persist a duplicate before the user saves');
assert.ok(buildSource.includes("'mobile-flow-simplification.js'")&&buildSource.includes("'mobile-flow-simplification.css'"),'app build must copy mobile flow assets');
assert.ok(buildSource.includes('/assets/mobile-flow-simplification.js')&&buildSource.includes('/assets/mobile-flow-simplification.css'),'app build must load mobile flow assets');

const build=spawnSync(process.execPath,['scripts/build-app.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,'App build failed: '+(build.stderr||build.stdout));
const dist=path.join(root,'dist','app');
let appHtml=fs.readFileSync(path.join(dist,'index.html'),'utf8');
assert.ok(appHtml.includes('mobile-flow-simplification.css'),'built app missing mobile simplification CSS');
assert.ok(appHtml.includes('mobile-flow-simplification.js'),'built app missing mobile simplification JS');

function replaceLast(source,needle,replacement){
  const i=source.lastIndexOf(needle);if(i<0)throw new Error('Missing marker '+needle);
  return source.slice(0,i)+replacement+source.slice(i+needle.length);
}
const fixture=[
  "currentUser={...TEST_USER,email:'qa@example.test',supabaseUser:{user_metadata:{first_name:'Kwin'}}};",
  "state=structuredClone(DEFAULT);",
  "state.company={...state.company,name:'QA Test BV',tradeName:'Boekuna QA',contactName:'Kwin',email:'qa@example.test',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',kor:false,paymentDays:14};",
  "state.contacts=[{id:'c1',type:'customer',name:'Studio Noord',email:'facturen@studionoord.test',address:'Klantstraat 2',postal:'3012BB',city:'Rotterdam'},{id:'c2',type:'customer',name:'Bakkerij Jansen B.V.',email:'boekhouding@jansen.test',address:'Dorpsstraat 12',postal:'1135AB',city:'Edam',kvk:'12345678'}];",
  "state.invoices=[{id:'i1',number:'2026-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:'2026-10-01',supplyDate:'2026-10-01',dueDate:'2026-10-15',paymentDays:14,taxTreatment:'standard',payments:[],lines:[{desc:'Websiteonderhoud',qty:1,unitLabel:'stuk',unit:450,vat:21}]}];",
  "state.expenses=[];state.transactions=[];",
  "state.documents=[{id:'d-ok-1',fileId:'f-ok-1',name:'Albert-Heijn.pdf',type:'Bon',date:'2026-10-03',processingState:'ready'},{id:'d-q-1',fileId:'f-q-1',name:'Jumbo.pdf',type:'Bon',date:'2026-10-04',processingState:'review_required'},{id:'d-usd-1',fileId:'f-usd-1',name:'USD.pdf',type:'Factuur',date:'2026-10-04',processingState:'ready'},{id:'d-dup-source',fileId:'f-dup-source',name:'Gamma-nieuw.pdf',type:'Bon',date:'2026-09-12',processingState:'review_required'},{id:'existing-doc',fileId:'f-existing',name:'Gamma.pdf',type:'Bon',date:'2026-09-12',processingState:'ready',linkedType:'expense',linkedId:'e-existing',reviewSnapshot:{party:'Gamma',issueDate:'2026-09-12',gross:36.99}}];",
  "state.services=[];state.bookings=[];state.plannedCash=[];",
  "documentProcessingJobs=[{id:'j-ok-1',client_ref:'f-ok-1',file_name:'Albert-Heijn.pdf',state:'ready',review_fields:[],requested_kind:'purchase',result:{analysis:{documentType:'receipt',party:'Albert Heijn',issueDate:'2026-10-03',currency:'EUR',gross:18.40,net:16.88,vatAmount:1.52,vatRate:9,amounts:{total:18.40}}}},{id:'j-q-1',client_ref:'f-q-1',file_name:'Jumbo.pdf',state:'review_required',review_fields:['gross'],review_message:'Controleer het totaal',requested_kind:'purchase',result:{analysis:{documentType:'receipt',party:'Jumbo',issueDate:'2026-10-04',currency:'EUR',gross:15.93,net:14.61,vatAmount:1.32,vatRate:9,amounts:{total:15.93}}}},{id:'j-usd-1',client_ref:'f-usd-1',file_name:'USD.pdf',state:'ready',review_fields:[],requested_kind:'purchase',result:{analysis:{documentType:'purchase_invoice',party:'US Vendor',invoiceNumber:'USD-1',issueDate:'2026-10-04',currency:'USD',gross:121,net:100,vatAmount:21,vatRate:21,amounts:{total:121}}}}];",
  "documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;",
  "enterApp();"
].join('\n');
appHtml=appHtml.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
appHtml=replaceLast(appHtml,'initAuth();',fixture);

const mime={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(pathname.startsWith('/assets/')){
    const file=path.join(dist,pathname);
    if(fs.existsSync(file)){res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});return fs.createReadStream(file).pipe(res)}
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(appHtml);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;

async function noOverflow(page,label){
  // Resize and navigation schedule mobile presentation updates. Measure after
  // the browser has painted those updates, retaining the same strict limit.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const x=await page.evaluate(()=>({vw:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  if(x.html>x.vw+2||x.body>x.vw+2) console.error('OVERFLOW_NODES',label,await page.locator('body *').evaluateAll(nodes=>nodes.map(n=>({tag:n.tagName,id:n.id,classes:n.className,rect:n.getBoundingClientRect().toJSON(),text:(n.textContent||'').trim().slice(0,100)})).filter(n=>n.rect.width&&n.rect.right>innerWidth+2).slice(-20)));
  assert.ok(x.html<=x.vw+2&&x.body<=x.vw+2,label+' overflow '+JSON.stringify(x));
}
async function axe(page,label){
  await page.addScriptTag({content:axeSource});
  const result=await page.evaluate(async()=>axe.run(document.getElementById('mainApp'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
  assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.length})),[],label+' Axe violations');
}

const browserName=process.env.BOOKUNA_BROWSER||'chromium';
const browserType=browserName==='webkit'?webkit:chromium;
const browser=await browserType.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try{
  await page.goto(base+'/app',{waitUntil:'networkidle'});
  await page.evaluate(async()=>document.fonts.ready);

  await page.evaluate(()=>navigate('documents'));
  await page.locator('.mobile-document-groups').waitFor();
  assert.match(await page.locator('.mobile-document-groups').innerText(),/1 bon klopt/);
  assert.match(await page.locator('.mobile-document-groups').innerText(),/2 hebben een vraag/);
  assert.match(await page.locator('.mobile-document-questions').innerText(),/Klopt het totaal\?/);
  assert.match(await page.locator('.mobile-document-questions').innerText(),/Controleer de valuta/);
  assert.equal(await page.locator('.mobile-document-good .mobile-document-compact-row').count(),1,'only zero-unresolved receipts may enter the green bulk group');
  await page.locator('.mobile-document-good').screenshot({path:path.join(evidenceDir,'01-bonnen-kloppen-'+browserName+'.png')});
  await page.locator('.mobile-document-questions').screenshot({path:path.join(evidenceDir,'02-bonnen-vragen-'+browserName+'.png')});

  await page.evaluate(()=>newContact());
  await page.locator('#contactForm[data-mobile-customer-flow]').waitFor({state:'attached'});
  assert.equal(await page.locator('#modalTitle').innerText(),'Nieuwe klant');
  // KVK search stays hidden while there is no KVK API key: the customer is filled in by hand straight away.
  assert.equal(await page.locator('#kvkQuery').count(),0,'KVK search is hidden without a KVK key');
  assert.equal(await page.getByRole('button',{name:/Particulier of buitenland/}).count(),0);
  assert.ok(await page.locator('#contactForm [name="name"]').isVisible(),'customer name is directly editable');
  assert.ok(await page.locator('#contactForm [name="email"]').isVisible(),'invoice email is directly editable');
  assert.equal(await page.locator('#contactForm [name="kvk"]').isVisible(),false,'KVK number is optional and collapsed');
  await page.locator('#modalRoot .modal').screenshot({path:path.join(evidenceDir,'05-klant-invullen-'+browserName+'.png')});
  assert.equal(await page.locator('#contactForm [name="contactPerson"]').isVisible(),false,'optional customer fields stay collapsed');
  await page.locator('.mobile-contact-more summary').click();
  assert.ok(await page.locator('#contactForm [name="contactPerson"]').isVisible(),'Meer gegevens reveals optional fields');
  await page.evaluate(()=>closeModal());


  await page.evaluate(()=>newInvoice());
  await page.locator('#invoiceForm[data-mobile-invoice-flow]').waitFor();
  assert.deepEqual(await page.locator('.mobile-invoice-progress span').allTextContents(),['1 van 3','2 van 3','3 van 3']);
  assert.match(await page.locator('.mobile-invoice-step[data-step="1"]').innerText(),/Voor wie is de factuur\?/);
  assert.match(await page.locator('.mobile-invoice-quick').innerText(),/Zelfde als vorige factuur/);
  await page.locator('#modalRoot .modal').screenshot({path:path.join(evidenceDir,'07-factuur-stap-1-'+browserName+'.png')});
  const invoiceCountBeforeQuick=await page.evaluate(()=>state.invoices.length);
  await page.locator('.mobile-invoice-quick .mobile-invoice-choice').click();
  assert.equal(await page.evaluate(()=>state.invoices.length),invoiceCountBeforeQuick,'same-as-previous must only prefill UI, not persist a new draft');
  assert.equal(await page.locator('#invoiceForm').getAttribute('data-mobile-invoice-step'),'2');
  await page.getByRole('button',{name:'Vorige',exact:true}).click();
  await page.locator('#invoiceCustomer').selectOption('c1');
  await page.getByRole('button',{name:'Volgende',exact:true}).click();
  assert.match(await page.locator('.mobile-invoice-step[data-step="2"]').innerText(),/Wat heb je gedaan\?/);
  assert.equal(await page.locator('.mobile-invoice-step[data-step="2"] details.invoice-advanced-options').count(),0,'advanced invoice options belong to step 3, not step 2');
  assert.deepEqual((await page.locator('.mobile-vat-choice button').allTextContents()).map(x=>x.trim()),['21%','9%','Geen']);
  await page.locator('#modalRoot .modal').screenshot({path:path.join(evidenceDir,'08-factuur-stap-2-'+browserName+'.png')});
  await page.locator('[data-k="desc"]').fill('Websiteonderhoud oktober');
  await page.locator('[data-k="unit"]').fill('450');
  await page.locator('[data-k="unit"]').dispatchEvent('input');
  await page.getByRole('button',{name:'Volgende',exact:true}).click();
  assert.match(await page.locator('.mobile-invoice-step[data-step="3"]').innerText(),/Klaar om te versturen/);
  assert.match(await page.locator('.mobile-invoice-summary').innerText(),/Studio Noord/);
  assert.match(await page.locator('.mobile-invoice-summary').innerText(),/Websiteonderhoud oktober/);
  assert.match(await page.locator('.mobile-invoice-summary').innerText(),/Factuurnummer/);
  assert.match(await page.locator('.mobile-invoice-summary').innerText(),/Betalen binnen/);
  assert.equal(await page.locator('.mobile-invoice-step[data-step="3"] details.invoice-advanced-options').count(),1,'step 3 must contain the optional invoice edits');
  assert.match(await page.locator('.mobile-invoice-step[data-step="3"] details.invoice-advanced-options summary').innerText(),/Wijzig of voeg korting, referentie of notitie toe/);
  assert.equal(await page.getByRole('button',{name:'Bekijk PDF',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Versturen',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Bewaar als concept',exact:true}).count(),1);
  await page.locator('#modalRoot .modal').screenshot({path:path.join(evidenceDir,'09-factuur-stap-3-'+browserName+'.png')});
  await page.evaluate(()=>closeModal());

  await page.evaluate(()=>{
    pendingPdfImport={file:new File(['qa'],'vraag.pdf',{type:'application/pdf'}),previewUrl:null,sha256:'qa',sourceClientRef:'f-q-1',sourceDocumentId:'d-q-1',processingJobId:'j-q-1',parsed:null};
    const parsed={confidenceScore:75,sourceQuality:'processor-v2',documentType:'receipt',party:'Jumbo',invoiceNumber:'',issueDate:'2026-10-04',net:14.61,vatAmount:1.32,gross:15.94,vatRate:9,mixedRates:false,vatLines:[],lineItems:[],adjustments:[],fieldProvenance:{gross:{source:'recognition',confidence:40}}};
    pendingPdfImport.parsed=parsed;showPdfImportReview(parsed);
  });
  await page.locator('.mobile-single-issue-review').waitFor();
  assert.equal(await page.locator('.mobile-single-issue-question').count(),1,'one issue question per mobile screen');
  assert.equal(await page.getByRole('button',{name:'Alle gegevens bekijken',exact:true}).count(),1);
  assert.equal(await page.locator('.mobile-single-issue-review .beginner-provenance:visible').count(),0,'simple review hides provenance labels only');
  await page.locator('#modalRoot .modal').screenshot({path:path.join(evidenceDir,'03-bon-enkele-vraag-'+browserName+'.png')});
  await page.evaluate(()=>closeModal());

  await page.evaluate(()=>{
    pendingPdfImport={file:new File(['qa'],'dubbel.pdf',{type:'application/pdf'}),previewUrl:null,sha256:'qa-dup',sourceClientRef:'f-dup-source',sourceDocumentId:'d-dup-source',processingJobId:'j-dup',parsed:null};
    const parsed={confidenceScore:95,sourceQuality:'processor-v2',documentType:'receipt',party:'Gamma',invoiceNumber:'',issueDate:'2026-09-12',net:33.94,vatAmount:3.05,gross:36.99,vatRate:9,mixedRates:false,vatLines:[],lineItems:[],adjustments:[],duplicateCandidate:{id:'existing-doc',label:'Gamma · 12 sep · € 36,99'}};
    pendingPdfImport.parsed=parsed;showPdfImportReview(parsed);
  });
  await page.locator('.mobile-single-issue-review').waitFor();
  assert.equal(await page.locator('.mobile-single-issue-question').innerText(),'Deze bon heb je al');
  assert.equal(await page.getByRole('button',{name:'Weggooien, is dubbel',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Nee, dit is een andere bon',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Ja, klopt',exact:true}).count(),0,'duplicate flow must not use an ambiguous approval label');
  assert.equal(await page.locator('.mobile-duplicate-card').count(),2,'duplicate review must compare new and existing document side by side');
  assert.match(await page.locator('.mobile-duplicate-cards').innerText(),/NIEUW/);
  assert.match(await page.locator('.mobile-duplicate-cards').innerText(),/AL IN BOEKUNA/);
  await page.locator('#modalRoot .modal').screenshot({path:path.join(evidenceDir,'04-bon-duplicaat-'+browserName+'.png')});
  await page.evaluate(()=>closeModal());

  for(const width of [320,360,375,390,393,430]){
    await page.setViewportSize({width,height:844});
    await page.evaluate(()=>navigate('documents'));await noOverflow(page,browserName+' documents '+width);
    await page.evaluate(()=>newInvoice());await page.locator('#invoiceForm[data-mobile-invoice-flow]').waitFor();await noOverflow(page,browserName+' invoice '+width);await page.evaluate(()=>closeModal());
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>newInvoice());await page.locator('#invoiceForm[data-mobile-invoice-flow]').waitFor();
  const targets=await page.locator('.mobile-flow-action, .mobile-vat-choice button, .mobile-invoice-nav button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length>0).map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height,text:n.textContent.trim()})));
  // Buttons in invoice steps that are not shown yet (display:none) have no box; they are measured once their step is visible.
  assert.ok(targets.length>0,'mobile invoice must render touch targets');
  assert.ok(targets.every(t=>t.w>=44&&t.h>=44),'mobile touch target smaller than 44px: '+JSON.stringify(targets.filter(t=>t.w<44||t.h<44)));
  await axe(page,browserName+' mobile invoice');
  await page.locator('[data-k="desc"]').focus();
  await page.setViewportSize({width:390,height:620});
  await noOverflow(page,browserName+' invoice keyboard viewport');
  assert.ok(await page.getByRole('button',{name:'Volgende',exact:true}).count()===1,'invoice CTA remains present with soft-keyboard sized viewport');
  await page.evaluate(()=>closeModal());

  await page.setViewportSize({width:1024,height:900});
  await page.evaluate(()=>navigate('documents'));await page.waitForTimeout(50);
  assert.equal(await page.locator('.mobile-document-groups').count(),0,'desktop documents must remain original');
  await page.evaluate(()=>newContact());await page.waitForTimeout(50);
  assert.equal(await page.locator('#contactForm[data-mobile-customer-flow]').count(),0,'desktop customer form must remain original');
  assert.match(await page.locator('#contactForm').textContent(),/Naam \(bedrijf of persoon\)/,'desktop customer form keeps the full set of fields');
  await page.evaluate(()=>closeModal());
  await page.evaluate(()=>newInvoice());await page.waitForTimeout(50);
  assert.equal(await page.locator('#invoiceForm[data-mobile-invoice-flow]').count(),0,'desktop invoice must remain original');
  assert.equal(await page.locator('.mobile-invoice-progress').count(),0,'desktop must not get mobile flow UI');
  assert.match(await page.locator('#invoiceForm').innerText(),/Datum & betaling/);
  await page.evaluate(()=>closeModal());

  assert.deepEqual(errors,[],'page errors: '+errors.join('\n'));
  console.log('BOEKUNA mobile flow simplification '+browserName+': PASS');
}finally{
  await browser.close();server.close();
}
