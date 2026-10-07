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
const build=spawnSync(process.execPath,['scripts/build-app.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,'App build failed: '+(build.stderr||build.stdout));
const dist=path.join(root,'dist','app');
for(const file of ['index.html','manifest.webmanifest','assets/app-InterVariable.woff2','assets/app-SpaceGrotesk-Variable.ttf'])assert.ok(fs.existsSync(path.join(dist,file)),'Built app asset missing '+file);
let appHtml=fs.readFileSync(path.join(dist,'index.html'),'utf8');
assert.ok(appHtml.includes('mobile-product.js'),'Mobile app asset missing');
assert.equal(appHtml.includes('function showMarketingPage'),false,'App artifact must remain free of marketing runtime');

function replaceLast(sourceText,needle,replacement){
  const i=sourceText.lastIndexOf(needle);
  if(i<0)throw new Error('Missing fixture bootstrap marker: '+needle);
  return sourceText.slice(0,i)+replacement+sourceText.slice(i+needle.length);
}
const fixture=[
  "currentUser={...TEST_USER,email:'qa@example.test',supabaseUser:{user_metadata:{first_name:'Kwin'}}};",
  "state=structuredClone(DEFAULT);",
  "state.company={...state.company,name:'QA Test BV',tradeName:'Boekuna QA',contactName:'Kwin',email:'qa@example.test',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',kor:false};",
  "state.contacts=[{id:'c1',type:'customer',name:'QA Klant BV',email:'klant@example.test',address:'Klantstraat 2',postal:'3012BB',city:'Rotterdam'}];",
  "state.invoices=[{id:'i1',number:'2026-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:'2026-10-01',dueDate:'2026-10-15',taxTreatment:'standard',payments:[],importedTotals:{net:100,vat:21,gross:121}}];",
  "state.expenses=[{id:'e1',date:'2026-10-01',vendor:'QA Leverancier',invoiceNumber:'INK-1',category:'Kantoor',paymentMethod:'bank',exVat:50,vatRate:21,vatAmount:10.5,gross:60.5,notes:''}];",
  "state.transactions=[{id:'t1',date:'2026-10-02',description:'QA bankregel',amount:-10,status:'unmatched'}];",
  "state.documents=[{id:'d1',name:'qa-bon.jpg',type:'Inkoopfactuur',date:'2026-10-01',processingState:'ready',verification:{status:'needs_review',method:'manual-review',differences:[]}}];",
  "state.services=[];state.bookings=[];state.plannedCash=[];",
  "documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;",
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
  if(pathname==='/manifest.webmanifest'){res.writeHead(200,{'content-type':mime['.webmanifest']});return fs.createReadStream(path.join(dist,'manifest.webmanifest')).pipe(res)}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(appHtml);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const evidence=path.join(root,'tests','artifacts','complete-mobile');
fs.mkdirSync(evidence,{recursive:true});

async function noOverflow(page,label){
  const result=await page.evaluate(()=>({vw:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert.ok(result.html<=result.vw+2&&result.body<=result.vw+2,label+' horizontal overflow: '+JSON.stringify(result));
}
async function axe(page,label){
  await page.addScriptTag({content:axeSource});
  const result=await page.evaluate(async()=>await axe.run(document.getElementById('mainApp'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
  assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.length})),[],label+' Axe violations');
}
async function openReviewFixture(page){
  await page.evaluate(()=>{
    pendingPdfImport={
      file:new File(['qa'],'qa-bon.jpg',{type:'image/jpeg'}),
      previewUrl:null,
      sha256:'',
      sourceClientRef:'',
      sourceDocumentId:'',
      processingJobId:''
    };
    showPdfImportReview({
      confidenceScore:82,sourceQuality:'processor-v2',documentType:'purchase_invoice',
      party:'QA Leverancier',invoiceNumber:'INK-1',issueDate:'2026-10-01',
      net:100,vatAmount:21,gross:121,vatRate:21,mixedRates:false,
      vatLines:[],lineItems:[],adjustments:[],recognitionChecks:[
        {code:'party',level:'good',title:'Leverancier herkend',detail:'Controleer naam en factuurnummer.'},
        {code:'gross',level:'warn',title:'Controleer het totaal',detail:'Vergelijk het bedrag met het document.'}
      ]
    });
  });
  await page.getByRole('heading',{name:'Document controleren'}).waitFor();
}

const browserName=process.env.BOOKUNA_BROWSER||'chromium';
const browserType=browserName==='webkit'?webkit:chromium;
const browser=await browserType.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
async function nav(route){await page.evaluate(r=>navigate(r),route);await page.waitForTimeout(50)}
async function inspect(label){
 await noOverflow(page,label);
 await axe(page,label);
}
try {
 await page.goto(base+'/app',{waitUntil:'networkidle'});
 await page.evaluate(async()=>document.fonts.ready);
 assert.equal(await page.locator('head link[href*="mobile-product.css"]').count(),1,'Mobile CSS must be in the real head, never a print template');
 for(const [width,height] of [[320,568],[360,800],[375,812],[390,844],[393,852],[412,915],[430,932],[768,1024],[844,390]]){
  await page.setViewportSize({width,height});
  for(const route of ['dashboard','insights','invoices','expenses','documents','bank','income','outgoings','vat','reports','settings','profile','contacts','services','hours','bookings','ledger']){
   await nav(route);await noOverflow(page,browserName+' '+route+' '+width);
   if(width===390)await axe(page,browserName+' '+route);
   if([320,390,430].includes(width))await page.screenshot({path:path.join(evidence,browserName+'-'+route+'-'+width+'.png'),fullPage:true,animations:'disabled'});
   if(width<=820&&['invoices','expenses','documents','bank','income','outgoings'].includes(route)){
    const list=page.locator('.mobile-card-list');
    const hasRows=await page.locator('.mobile-stack-table tbody tr').filter({has:page.locator('td:not([colspan])')}).count();
    if(hasRows){
     const groupedDocuments=route==='documents'&&await page.locator('.mobile-document-groups:visible').count();
     if(groupedDocuments)assert.equal(await page.locator('.mobile-document-groups').isVisible(),true,'documents grouped mobile flow');
     else assert.equal(await list.isVisible(),true,route+' card list');
     assert.equal(await page.locator('.mobile-stack-wrap').first().isVisible(),false,route+' desktop table hidden');
    }
   }
  }
  if(width<=820){
   await nav('dashboard');
   assert.equal(await page.locator('.dashboard-chart-card').isVisible(),false);
   assert.equal(await page.locator('.dashboard-kpi-profit').evaluate(e=>getComputedStyle(e).gridColumnStart),'1');
   const columns=await page.locator('.dashboard-kpis').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);
   assert.equal(columns,width<360?1:2);
   await page.evaluate(()=>newInvoice());await page.waitForTimeout(50);
   await inspect(browserName+' invoice editor '+width);
   const fields=page.locator('#invoiceForm .line-item [data-k]');
   assert.equal(await fields.count(),5,'Original invoice inputs must survive mobile disclosure');
   assert.equal(await page.locator('#invoiceForm .mobile-disclosure').count()>=2,true);
   await page.locator('[data-k="desc"]').fill('Mobiele factuurregel');
   await page.locator('[data-k="unit"]').fill('125');
   await page.locator('[data-k="unit"]').dispatchEvent('input');
   assert.match(await page.locator('#formTotals').innerText(),/151,25/,'Existing VAT/totals must remain authoritative');
   if(width===390)await page.screenshot({path:path.join(evidence,browserName+'-editor-390.png'),fullPage:true});
   await page.evaluate(()=>closeModal());
   await page.evaluate(()=>newExpense());await page.waitForTimeout(50);
   assert.equal(await page.locator('#expenseForm [name="paymentMethod"]').count(),1);
   assert.equal(await page.locator('#expenseForm [name="paymentMethod"]').isVisible(),false);
   await page.locator('#expenseForm summary').click();
   assert.equal(await page.locator('#expenseForm [name="paymentMethod"]').isVisible(),true);
   await inspect(browserName+' expense form '+width);await page.evaluate(()=>closeModal());
   await openReviewFixture(page);await inspect(browserName+' document review '+width);await page.evaluate(()=>closeModal());
  }
 }
 await page.setViewportSize({width:390,height:844});
 // Document processing/review state always outranks the existence of a stored file.
 const documents=await page.evaluate(()=>structuredClone(state.documents));
 const documentCases=[['received','', 'Verwerken'],['validating','','Verwerken'],['review_required','','Controleer dit even'],['ready','pending','Controle loopt'],['ready','running','Controle loopt'],['ready','needs_review','Controleer dit even'],['failed','','Mislukt'],['ready','verified','Klaar']];
 await page.evaluate(cases=>{state.documents=cases.map((c,i)=>({id:'status-'+i,name:'Status '+i+'.pdf',fileId:'stored-'+i,date:'2026-10-01',processingState:c[0],verificationStatus:c[1]}))},documentCases);
 await nav('documents');
 for(let i=0;i<documentCases.length;i++)assert.match(await page.locator('.mobile-card-row').filter({hasText:'Status '+i+'.pdf'}).innerText(),new RegExp(documentCases[i][2]));
 await page.evaluate(data=>{state.documents=data},documents);
 // Unlink requires deliberate confirmation; cancelling leaves the match intact.
 await page.evaluate(()=>{state.transactions[0].status='matched';state.transactions[0].matchId='i1';state.transactions[0].matchType='invoice'});
 await nav('bank');await page.locator('.mobile-card-list').getByRole('button',{name:'Ontkoppelen',exact:true}).click();
 assert.equal(await page.evaluate(()=>state.transactions[0].status),'matched');
 await page.getByRole('dialog').getByRole('button',{name:'Annuleren',exact:true}).click();
 assert.equal(await page.evaluate(()=>state.transactions[0].status),'matched');
 await page.locator('.mobile-card-list').getByRole('button',{name:'Ontkoppelen',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Ontkoppelen',exact:true}).click();
 assert.equal(await page.evaluate(()=>state.transactions[0].status),'unmatched');
 await nav('invoices');
 await page.locator('.mobile-card-main').click();await page.getByRole('dialog').waitFor();
 assert.match(await page.getByRole('dialog').innerText(),/2026-0001/);
 await page.evaluate(()=>closeModal());
 await nav('dashboard');await page.locator('.dashboard-summary-card').nth(1).click();
 assert.equal(await page.evaluate(()=>listPageState('invoices').filters.status),'open');
 await nav('settings');
 assert.equal(await page.locator('.mobile-settings-index .settings-nav-item').count(),9);assert.equal(await page.locator('.mobile-settings-index').getByText('Weergave',{exact:true}).count(),1);assert.equal(await page.locator('.mobile-settings-index').getByText('Assistent & inzichten',{exact:true}).count(),1);
 assert.equal(await page.locator('.settings-group').first().isVisible(),false);
 await page.locator('.mobile-settings-index .settings-nav-item').filter({hasText:/^Weergave/}).click();
 const extraHelpToggle=page.getByRole('switch',{name:'Extra uitleg tonen'});
 assert.ok(await extraHelpToggle.isVisible(),'Instellingen → Weergave must expose Extra uitleg tonen');
 assert.equal(await extraHelpToggle.isChecked(),false,'Extra uitleg tonen must default off');
 await extraHelpToggle.check();
 assert.equal(await page.evaluate(()=>state.meta.extraHelpEnabled),true,'Extra uitleg tonen must update account state');
 await extraHelpToggle.uncheck();
 assert.equal(await page.evaluate(()=>state.meta.extraHelpEnabled),false,'Turning extra explanation off must restore compact mode');
 await page.getByRole('button',{name:'Terug naar Instellingen',exact:true}).click();
 assert.equal(await page.locator('.mobile-settings-index').isVisible(),true);
 await page.locator('.mobile-settings-index .settings-nav-item').filter({hasText:/^Facturen/}).click();
 assert.equal(await page.locator('.mobile-settings-active').count(),1);
 await page.getByRole('button',{name:'Terug naar Instellingen',exact:true}).click();
 assert.equal(await page.locator('.mobile-settings-index').isVisible(),true);
 // Rotate/resize while editing: every moved field and action must return exactly once.
 await page.evaluate(()=>newInvoice());await page.waitForTimeout(50);
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(100);
 assert.equal(await page.locator('#invoiceForm .mobile-disclosure').count(),0);
 assert.equal(await page.locator('#invoiceForm .line-item [data-k]').count(),5);
 assert.equal(await page.locator('#invoiceForm [name="issueDate"]').count(),1);
 await page.evaluate(()=>closeModal());
 // Empty states and loading/error attention must never become fabricated financial values.
 await page.evaluate(()=>{state.invoices=[];state.expenses=[];state.transactions=[];state.documents=[]});
 await page.setViewportSize({width:390,height:844});
 for(const route of ['invoices','expenses','bank','documents','vat','reports']){
  await nav(route);await inspect(browserName+' empty '+route);
 }
 await nav('dashboard');
 await page.evaluate(()=>{documentProcessingFetchError=true;render()});await page.waitForTimeout(50);
 assert.equal(await page.locator('.dashboard-attention').getByRole('button',{name:'Opnieuw proberen',exact:true}).isVisible(),true);
 assert.deepEqual(errors,[]);
 console.log(browserName+' complete mobile app matrix, forms, actions, resize, empty/error states and Axe: PASS');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
