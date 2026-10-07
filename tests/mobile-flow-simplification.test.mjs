import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {chromium,webkit} from 'playwright';

const root=process.cwd();
const require=createRequire(import.meta.url);
const axeSource=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const jsPath=path.join(root,'public','assets','mobile-flow-simplification.js');
const cssPath=path.join(root,'public','assets','mobile-flow-simplification.css');
assert.ok(fs.existsSync(jsPath),'mobile flow simplification JS asset missing');
assert.ok(fs.existsSync(cssPath),'mobile flow simplification CSS asset missing');

const js=fs.readFileSync(jsPath,'utf8');
const css=fs.readFileSync(cssPath,'utf8');
const buildSource=fs.readFileSync(path.join(root,'scripts','build-app.mjs'),'utf8');
assert.match(js,/max-width:820px/,'runtime must use the established mobile breakpoint');
assert.match(css,/@media\s*\(max-width:820px\)/,'all visual changes must stay mobile-only');
for(const marker of ['saveContact','duplicateInvoiceAsDraft','finalSaveInvoice','finalizeDraftAndSend','savePdfInvoiceImport','confirmDuplicateOverride']){
  assert.ok(js.includes(marker),'mobile flow must reuse existing authoritative action: '+marker);
}
assert.doesNotMatch(js,/state\.invoices\s*=|state\.expenses\s*=|vatRate\s*=\s*21|reserveFinalInvoiceNumber\(/,'mobile presentation layer must not reimplement accounting/state semantics');
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
  "state.documents=[{id:'d-ok-1',fileId:'f-ok-1',name:'Albert-Heijn.pdf',type:'Bon',date:'2026-10-03',processingState:'ready'},{id:'d-q-1',fileId:'f-q-1',name:'Jumbo.pdf',type:'Bon',date:'2026-10-04',processingState:'review_required'}];",
  "state.services=[];state.bookings=[];state.plannedCash=[];",
  "documentProcessingJobs=[{id:'j-ok-1',client_ref:'f-ok-1',file_name:'Albert-Heijn.pdf',state:'ready',review_fields:[],requested_kind:'purchase',result:{analysis:{documentType:'receipt',party:'Albert Heijn',issueDate:'2026-10-03',gross:18.40,net:16.88,vatAmount:1.52,vatRate:9,amounts:{total:18.40}}}},{id:'j-q-1',client_ref:'f-q-1',file_name:'Jumbo.pdf',state:'review_required',review_fields:['gross'],review_message:'Controleer het totaal',requested_kind:'purchase',result:{analysis:{documentType:'receipt',party:'Jumbo',issueDate:'2026-10-04',gross:15.93,net:14.61,vatAmount:1.32,vatRate:9,amounts:{total:15.93}}}}];",
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
  const x=await page.evaluate(()=>({vw:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
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
  assert.match(await page.locator('.mobile-document-groups').innerText(),/1 heeft een vraag/);
  assert.match(await page.locator('.mobile-document-questions').innerText(),/Klopt het totaal\?/);

  await page.evaluate(()=>newContact());
  await page.locator('#contactForm[data-mobile-customer-flow]').waitFor();
  assert.equal(await page.locator('#modalTitle').innerText(),'Nieuwe klant');
  assert.ok(await page.locator('#kvkQuery').isVisible(),'KVK query is primary');
  assert.equal(await page.getByRole('button',{name:/Particulier of buitenland/}).count(),1);
  assert.equal(await page.locator('#contactEmail').isVisible(),false,'email appears after KVK selection or manual mode');
  await page.getByRole('button',{name:/Particulier of buitenland/}).click();
  assert.ok(await page.locator('#contactName').isVisible(),'manual fallback exposes existing full form');
  await page.evaluate(()=>closeModal());

  await page.evaluate(()=>newInvoice());
  await page.locator('#invoiceForm[data-mobile-invoice-flow]').waitFor();
  assert.deepEqual(await page.locator('.mobile-invoice-progress span').allTextContents(),['1 van 3','2 van 3','3 van 3']);
  assert.match(await page.locator('.mobile-invoice-step[data-step="1"]').innerText(),/Voor wie is de factuur\?/);
  assert.match(await page.locator('.mobile-invoice-quick').innerText(),/Zelfde als vorige factuur/);
  await page.locator('#invoiceCustomer').selectOption('c1');
  await page.getByRole('button',{name:'Volgende',exact:true}).click();
  assert.match(await page.locator('.mobile-invoice-step[data-step="2"]').innerText(),/Wat heb je gedaan\?/);
  assert.deepEqual((await page.locator('.mobile-vat-choice button').allTextContents()).map(x=>x.trim()),['21%','9%','Geen']);
  await page.locator('[data-k="desc"]').fill('Websiteonderhoud oktober');
  await page.locator('[data-k="unit"]').fill('450');
  await page.locator('[data-k="unit"]').dispatchEvent('input');
  await page.getByRole('button',{name:'Volgende',exact:true}).click();
  assert.match(await page.locator('.mobile-invoice-step[data-step="3"]').innerText(),/Klaar om te versturen/);
  assert.equal(await page.getByRole('button',{name:'Versturen',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Bewaar als concept',exact:true}).count(),1);
  await page.evaluate(()=>closeModal());

  await page.evaluate(()=>{
    pendingPdfImport={file:new File(['qa'],'vraag.pdf',{type:'application/pdf'}),previewUrl:null,sha256:'qa',sourceClientRef:'',sourceDocumentId:'',processingJobId:'',parsed:null};
    const parsed={confidenceScore:75,sourceQuality:'processor-v2',documentType:'receipt',party:'Jumbo',invoiceNumber:'',issueDate:'2026-10-04',net:14.61,vatAmount:1.32,gross:15.94,vatRate:9,mixedRates:false,vatLines:[],lineItems:[],adjustments:[],fieldProvenance:{gross:{source:'recognition',confidence:40}}};
    pendingPdfImport.parsed=parsed;showPdfImportReview(parsed);
  });
  await page.locator('.mobile-single-issue-review').waitFor();
  assert.equal(await page.locator('.mobile-single-issue-question').count(),1,'one issue question per mobile screen');
  assert.equal(await page.getByRole('button',{name:'Alle gegevens bekijken',exact:true}).count(),1);
  assert.equal(await page.locator('.mobile-single-issue-review .beginner-provenance:visible').count(),0,'simple review hides provenance labels only');
  await page.evaluate(()=>closeModal());

  for(const width of [320,360,375,390,393,430]){
    await page.setViewportSize({width,height:844});
    await page.evaluate(()=>navigate('documents'));await noOverflow(page,browserName+' documents '+width);
    await page.evaluate(()=>newInvoice());await page.locator('#invoiceForm[data-mobile-invoice-flow]').waitFor();await noOverflow(page,browserName+' invoice '+width);await page.evaluate(()=>closeModal());
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>newInvoice());await page.locator('#invoiceForm[data-mobile-invoice-flow]').waitFor();
  const targets=await page.locator('.mobile-flow-action, .mobile-vat-choice button, .mobile-invoice-nav button').evaluateAll(nodes=>nodes.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height,text:n.textContent.trim()})));
  assert.ok(targets.every(t=>t.w>=44&&t.h>=44),'mobile touch target smaller than 44px: '+JSON.stringify(targets.filter(t=>t.w<44||t.h<44)));
  await axe(page,browserName+' mobile invoice');await page.evaluate(()=>closeModal());

  await page.setViewportSize({width:1024,height:900});
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
