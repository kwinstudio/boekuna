import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {chromium,webkit} from 'playwright';

const root=process.cwd();
const require=createRequire(import.meta.url);
const axeSource=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
execFileSync(process.execPath,['scripts/build-app.mjs'],{cwd:root,stdio:'pipe'});

const dist=path.join(root,'dist','app');
let html=fs.readFileSync(path.join(dist,'index.html'),'utf8').replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
const qnaAsset='assets/personal-assistant-qna.js';
assert.ok(fs.existsSync(path.join(dist,qnaAsset)),'Generated app must ship '+qnaAsset);
assert.ok(html.includes('/'+qnaAsset),'Generated app must load the deterministic Q&A module');

const fixture=`
currentUser={...TEST_USER,email:'v12-qa@example.test',supabaseUser:{user_metadata:{first_name:'Kwin'}}};
state=structuredClone(DEFAULT);
state.company={...state.company,name:'V1.2 QA BV',tradeName:'V1.2 QA',contactName:'Kwin',email:'v12-qa@example.test',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',kor:false};
state.contacts=[{id:'c1',type:'customer',name:'Klant Een BV',email:'klant@example.test'}];
state.invoices=[
 {id:'i1',number:'2026-1001',customerId:'c1',status:'sent',kind:'invoice',issueDate:'2026-10-01',dueDate:'2026-09-20',taxTreatment:'standard',payments:[{id:'p1',amount:300,date:'2026-10-02'}],importedTotals:{net:1000,vat:210,gross:1210}},
 {id:'i-cancelled',number:'2026-X',customerId:'c1',status:'cancelled',kind:'invoice',issueDate:'2026-10-02',dueDate:'2026-10-03',taxTreatment:'standard',payments:[],importedTotals:{net:9999,vat:2099.79,gross:12098.79}}
];
state.expenses=[
 {id:'e1',date:'2026-07-05',vendor:'Adobe',invoiceNumber:'JUL',category:'Software',paymentMethod:'bank',exVat:300,vatRate:21,vatAmount:63,gross:363},
 {id:'e2',date:'2026-07-06',vendor:'Apparaat BV',invoiceNumber:'JULA',category:'Apparatuur',paymentMethod:'bank',exVat:300,vatRate:21,vatAmount:63,gross:363},
 {id:'e3',date:'2026-07-07',vendor:'Reis BV',invoiceNumber:'JULR',category:'Reiskosten',paymentMethod:'bank',exVat:400,vatRate:21,vatAmount:84,gross:484},
 {id:'e4',date:'2026-08-05',vendor:'Adobe',invoiceNumber:'AUG',category:'Software',paymentMethod:'bank',exVat:300,vatRate:21,vatAmount:63,gross:363},
 {id:'e5',date:'2026-08-06',vendor:'Apparaat BV',invoiceNumber:'AUGA',category:'Apparatuur',paymentMethod:'bank',exVat:300,vatRate:21,vatAmount:63,gross:363},
 {id:'e6',date:'2026-08-07',vendor:'Reis BV',invoiceNumber:'AUGR',category:'Reiskosten',paymentMethod:'bank',exVat:400,vatRate:21,vatAmount:84,gross:484},
 {id:'e7',date:'2026-09-05',vendor:'Adobe',invoiceNumber:'SEP',category:'Software',paymentMethod:'bank',exVat:300,vatRate:21,vatAmount:63,gross:363},
 {id:'e8',date:'2026-09-06',vendor:'Apparaat BV',invoiceNumber:'SEPA',category:'Apparatuur',paymentMethod:'bank',exVat:300,vatRate:21,vatAmount:63,gross:363},
 {id:'e9',date:'2026-09-07',vendor:'Reis BV',invoiceNumber:'SEPR',category:'Reiskosten',paymentMethod:'bank',exVat:400,vatRate:21,vatAmount:84,gross:484},
 {id:'e10',date:'2026-10-01',vendor:'Adobe',invoiceNumber:'OCT',category:'Software',paymentMethod:'bank',exVat:300,vatRate:21,vatAmount:63,gross:363},
 {id:'e11',date:'2026-10-02',vendor:'Apparaat BV',invoiceNumber:'OCTA',category:'Apparatuur',paymentMethod:'bank',exVat:760,vatRate:21,vatAmount:159.6,gross:919.6},
 {id:'e12',date:'2026-10-03',vendor:'Reis BV',invoiceNumber:'OCTR',category:'Reiskosten',paymentMethod:'bank',exVat:400,vatRate:21,vatAmount:84,gross:484}
];
state.transactions=[
 {id:'t1',date:'2026-10-02',description:'Betaling',amount:100,status:'unmatched'},
 {id:'t2',date:'2026-10-03',description:'Betaling 2',amount:-50,status:'unmatched'}
];
state.documents=[
 {id:'d1',fileId:'doc-review',name:'Controle.pdf',type:'Factuur',date:'2026-10-01',processingState:'ready',verification:{status:'needs_review',method:'manual-review',sourceText:'RAW OCR SECRET MUST NOT LEAK',financialIssues:['VAT_MISMATCH'],differences:[{field:'vatAmount',current:21,alternative:20}]}}
];
state.services=[];state.bookings=[];state.plannedCash=[];
documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;
enterApp();`;
const marker=html.lastIndexOf('initAuth();');
assert.ok(marker>0,'startup marker missing');
html=html.slice(0,marker)+fixture+html.slice(marker+'initAuth();'.length);

const mime={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
 if(pathname.startsWith('/assets/')){
  const file=path.join(dist,pathname);
  if(fs.existsSync(file)){res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});return fs.createReadStream(file).pipe(res)}
 }
 res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browserName=process.env.BOOKUNA_BROWSER==='webkit'?'webkit':'chromium';
const browser=await (browserName==='webkit'?webkit:chromium).launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(5000);
const evidence=path.join(root,'tests','artifacts','personal-assistant-v1-2');fs.mkdirSync(evidence,{recursive:true});

async function noOverflow(label){
 const x=await page.evaluate(()=>({vw:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
 assert.ok(x.html<=x.vw+2&&x.body<=x.vw+2,label+' horizontal overflow '+JSON.stringify(x));
}
async function axe(label){
 await page.addScriptTag({content:axeSource});
 const result=await page.evaluate(async()=>await axe.run(document.getElementById('mainApp'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
 assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.length})),[],label+' Axe violations');
}
async function ask(question){
 await page.getByRole('button',{name:/Vraag Boekuna/i}).first().click();
 await page.getByRole('dialog').waitFor();
 const input=page.locator('#assistantQuestion');
 await input.fill(question);
 await page.locator('#assistantQuestionForm').getByRole('button',{name:'Vraag',exact:true}).click();
 await page.locator('#assistantAnswer[aria-live="polite"]').waitFor();
 return page.locator('#assistantAnswer');
}
async function closeDialog(){if(await page.getByRole('dialog').count())await page.getByRole('dialog').getByRole('button',{name:'Sluiten'}).click()}

try{
 await page.goto(base,{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Overzicht'}).waitFor();

 assert.equal(await page.locator('.dashboard-kpis-v12 .dashboard-kpi').count(),5,'Dashboard must expose exactly five core KPI cards');
 const kpiLabels=await page.locator('.dashboard-kpis-v12 .dashboard-kpi-label').allTextContents();
 assert.deepEqual(kpiLabels.map(x=>x.trim()),['Winst','Omzet','Kosten','Btw apartzetten','Nog te ontvangen'],'Core KPI labels must be unique and ordered');
 const receivables=await page.locator('.dashboard-kpi-receivables').innerText();
 assert.match(receivables,/910/,'Partial payment must leave €910 receivable');
 const revenue=await page.locator('.dashboard-kpis-v12 .dashboard-kpi').filter({has:page.locator('.dashboard-kpi-label',{hasText:/^Omzet$/})}).innerText();
 assert.match(revenue,/1\.000|1,000|1000/,'Revenue KPI must use active invoice revenue');
 assert.doesNotMatch(revenue,/10\.999|10999/,'Cancelled invoice must not inflate revenue KPI');
 assert.equal(await page.locator('.dashboard-summary-title').filter({hasText:'Nog te ontvangen'}).count(),0,'Receivables must not be duplicated as a summary card');
 assert.equal(await page.getByRole('button',{name:/Vraag Boekuna/i}).count()>=1,true,'Ask Boekuna entry must be visible');

 let answer=await ask('Hoe sta ik ervoor?');
 assert.match(await answer.innerText(),/winst/i);
 assert.match(await answer.innerText(),/Nog te ontvangen|ontvangen/i);
 await page.screenshot({path:path.join(evidence,browserName+'-ask-personal-390.png'),fullPage:true,animations:'disabled'});
 await closeDialog();

 await page.getByRole('button',{name:/Vraag Boekuna/i}).first().click();
 await page.getByRole('dialog').waitFor();
 assert.equal(await page.getByRole('dialog').getByRole('button',{name:'Waarom kan mijn btw nog veranderen?',exact:true}).count(),1,'VAT attention must create a dynamic suggested question');
 assert.equal(await page.getByRole('dialog').getByRole('button',{name:'Welke facturen zijn te laat?',exact:true}).count(),1,'Overdue state must create a dynamic suggested question');
 await page.getByRole('dialog').getByRole('button',{name:'Waarom kan mijn btw nog veranderen?',exact:true}).click();
 await page.locator('#assistantAnswer').waitFor();
 assert.match(await page.locator('#assistantAnswer').innerText(),/1 document/i);
 const docAction=page.locator('#assistantAnswer').getByRole('button',{name:'Controleer documenten',exact:true});
 assert.equal(await docAction.count(),1);
 await docAction.click();
 await page.locator('#pageTitle').filter({hasText:'Documenten'}).waitFor();
 assert.equal(await page.locator('[data-list-page="documents"]').count(),1,'Assistant document action must use the existing Documents route');
 await page.evaluate(()=>navigate('dashboard'));
 await page.getByRole('heading',{name:'Overzicht'}).waitFor();

 answer=await ask('Wat is voorbelasting?');
 assert.match(await answer.innerText(),/btw/i);
 assert.match(await answer.innerText(),/zakelijke kosten/i);
 await page.screenshot({path:path.join(evidence,browserName+'-ask-educational-390.png'),fullPage:true,animations:'disabled'});
 await closeDialog();

 answer=await ask('Kun je mijn cryptoportefeuille voorspellen?');
 assert.match(await answer.innerText(),/geen betrouwbaar antwoord/i);
 assert.doesNotMatch(await answer.innerText(),/cryptoportefeuille/i);
 await closeDialog();

 await page.evaluate(()=>{window.__v12Xss=0});
 answer=await ask('<img src=x onerror="window.__v12Xss=1">');
 assert.equal(await page.evaluate(()=>window.__v12Xss),0,'Question content must never execute as HTML');
 await closeDialog();

 await page.evaluate(()=>{
  state.expenses=state.expenses.filter(e=>String(e.date||'').startsWith('2026-10'));
  render();
 });
 answer=await ask('Waarom zijn mijn kosten hoger?');
 assert.match(await answer.innerText(),/niet genoeg vergelijkbare historie/i);
 await page.screenshot({path:path.join(evidence,browserName+'-ask-insufficient-390.png'),fullPage:true,animations:'disabled'});
 await closeDialog();

 for(const [width,height] of [[320,568],[360,800],[375,812],[390,844],[393,852],[412,915],[430,932],[1024,768],[1280,800],[1366,768],[1440,900],[1920,1080]]){
  await page.setViewportSize({width,height});
  await page.evaluate(()=>navigate('dashboard'));
  await page.waitForTimeout(40);
  await noOverflow(browserName+' dashboard '+width);
  if(width===390||width===1440){
   await axe(browserName+' dashboard '+width);
   await page.screenshot({path:path.join(evidence,browserName+'-dashboard-attention-'+width+'.png'),fullPage:true,animations:'disabled'});
  }
 }
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:/Vraag Boekuna/i}).first().click();
 const suggestion=page.getByRole('dialog').locator('.assistant-question-suggestion').first();
 assert.ok((await suggestion.evaluate(el=>el.getBoundingClientRect().height))>=44,'Mobile suggested questions must be at least 44px high');
 await axe(browserName+' Ask Boekuna mobile');

 assert.deepEqual(errors,[]);
 console.log('BOEKUNA Personal Assistant V1.2 browser QA: PASS '+browserName);
}finally{
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
