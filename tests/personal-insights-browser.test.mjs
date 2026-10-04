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
for(const file of ['assets/personal-insights.js','assets/personal-insights-ui.js','assets/personal-insights.css']){
 assert.ok(fs.existsSync(path.join(dist,file)),'Built assistant asset missing: '+file);
 assert.ok(html.includes('/'+file),'Built app must reference '+file);
}

const fixture=`
currentUser={...TEST_USER,email:'assistant-qa@example.test',supabaseUser:{user_metadata:{first_name:'Kwin'}}};
state=structuredClone(DEFAULT);
state.company={...state.company,name:'Assistant QA BV',tradeName:'Assistant QA',contactName:'Kwin',email:'assistant-qa@example.test',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',kor:false};
state.contacts=[{id:'c1',type:'customer',name:'Klant Een BV',email:'klant@example.test'}];
state.invoices=[
 {id:'i1',number:'2026-1001',customerId:'c1',status:'sent',kind:'invoice',issueDate:'2026-08-20',dueDate:'2026-09-20',taxTreatment:'standard',payments:[{id:'p1',amount:1000,date:'2026-09-21'}],importedTotals:{net:1000,vat:210,gross:1210}},
 {id:'i2',number:'2026-1002',customerId:'c1',status:'sent',kind:'invoice',issueDate:'2026-09-01',dueDate:'2026-09-22',taxTreatment:'standard',payments:[],importedTotals:{net:500,vat:105,gross:605}}
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
 {id:'e11',date:'2026-10-02',vendor:'Apparaat BV',invoiceNumber:'OCTA',category:'Apparatuur',paymentMethod:'bank',exVat:700,vatRate:21,vatAmount:147,gross:847},
 {id:'e12',date:'2026-10-03',vendor:'Reis BV',invoiceNumber:'OCTR',category:'Reiskosten',paymentMethod:'bank',exVat:400,vatRate:21,vatAmount:84,gross:484}
];
state.transactions=[{id:'t1',date:'2026-10-02',description:'Betaling 2026-1002',amount:605,status:'unmatched',matchSuggestion:{type:'invoice',id:'i2',label:'Factuur 2026-1002'}}];
state.documents=[
 {id:'d1',fileId:'doc-review',name:'Controle.pdf',type:'Factuur',date:'2026-10-01',processingState:'ready',verification:{status:'needs_review',method:'manual-review',sourceText:'RAW OCR SECRET MUST NOT LEAK',differences:[{field:'vatAmount',current:21,alternative:20}]}},
 {id:'d2',fileId:'doc-fail',name:'Mislukt.pdf',type:'Document',date:'2026-10-02',processingState:'failed'}
];
state.services=[];state.bookings=[];state.plannedCash=[];
documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;
window.__assistantFinancialBefore=JSON.stringify({invoices:state.invoices,expenses:state.expenses,transactions:state.transactions,documents:state.documents});
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
const evidence=path.join(root,'tests','artifacts','personal-insights');fs.mkdirSync(evidence,{recursive:true});

async function noOverflow(label){
 const x=await page.evaluate(()=>({vw:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
 assert.ok(x.html<=x.vw+2&&x.body<=x.vw+2,label+' horizontal overflow '+JSON.stringify(x));
}
async function axe(label){
 await page.addScriptTag({content:axeSource});
 const result=await page.evaluate(async()=>await axe.run(document.getElementById('mainApp'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
 assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.length})),[],label+' Axe violations');
}
async function nav(route){await page.evaluate(r=>navigate(r),route);await page.waitForTimeout(50)}

try{
 await page.goto(base,{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'Overzicht'}).waitFor();
 assert.equal(await page.locator('.assistant-dashboard').count(),1,'Dashboard must expose Voor jou');
 assert.ok(await page.locator('.assistant-dashboard .assistant-insight-card').count()<=3,'Dashboard must cap insights at three');
 assert.equal((await page.locator('.assistant-dashboard').innerText()).includes('RAW OCR SECRET'),false,'Raw OCR must never render');
 const safeContext=await page.evaluate(()=>JSON.stringify(window.__boekunaAssistantTest.context()));
 assert.equal(safeContext.includes('RAW OCR SECRET'),false,'Raw OCR must never enter assistant context');
 assert.equal(await page.evaluate(()=>Object.prototype.hasOwnProperty.call(window.__boekunaAssistantTest.context(),'expenses')),false,'Unused raw expense rows must not enter assistant context');
 const minimizedFacts=await page.evaluate(()=>{const x=window.__boekunaAssistantTest.context();return {invoice:Object.keys(x.invoices[0]||{}).sort(),transaction:Object.keys(x.transactions[0]||{}).sort()}});
 assert.equal(minimizedFacts.invoice.includes('gross')||minimizedFacts.invoice.includes('paid')||minimizedFacts.invoice.includes('issueDate'),false,'Unused invoice values must stay outside assistant facts');
 assert.equal(minimizedFacts.transaction.includes('amount')||minimizedFacts.transaction.includes('date'),false,'Unused bank values must stay outside assistant facts');
 const facts=await page.evaluate(()=>window.__boekunaAssistantTest.snapshot().insights.map(x=>({type:x.type,priority:x.priority,sourceFacts:x.sourceFacts})));
 assert.ok(facts.some(x=>x.type==='OVERDUE_INVOICE'&&x.sourceFacts.totalOutstanding===815),'Outstanding must use existing paid/outstanding truth');
 assert.ok(facts.some(x=>x.type==='VAT_UNRESOLVED_DOCUMENTS'&&x.priority==='P0'),'VAT-affecting review must be blocking');
 assert.ok(facts.some(x=>x.type==='COST_SPIKE'&&x.sourceFacts.absoluteDelta===400),'Personal baseline cost spike must use three complete months');
 assert.ok(facts.some(x=>x.type==='BANK_MATCH_AVAILABLE'),'Only existing bank match suggestion may surface');

 for(const [width,height] of [[320,568],[360,800],[375,812],[390,844],[393,852],[412,915],[430,932],[1024,768],[1280,800],[1366,768],[1440,900],[1920,1080]]){
  await page.setViewportSize({width,height});await nav('insights');await noOverflow(browserName+' insights '+width);
  if(width===390||width===1440)await axe(browserName+' insights '+width);
  if([320,390,430,1440].includes(width))await page.screenshot({path:path.join(evidence,browserName+'-insights-'+width+'.png'),fullPage:true,animations:'disabled'});
 }
 await page.setViewportSize({width:390,height:844});await nav('insights');
 assert.equal(await page.getByRole('heading',{name:'Voor jou'}).count(),1);
 assert.equal(await page.getByText('Je week in Boekuna',{exact:true}).count(),1);
 const cards=page.locator('.assistant-insight-card');assert.ok(await cards.count()>=4,'Full insights page should expose relevant grouped insights');
 await cards.first().click();await page.getByRole('dialog').waitFor();
 const detail=await page.getByRole('dialog').innerText();assert.match(detail,/Wat zien we\?/);assert.match(detail,/Waarom zie je dit\?/);assert.match(detail,/Wat kun je doen\?/);
 assert.equal(detail.includes('RAW OCR SECRET'),false);
 const blocking=await page.evaluate(()=>window.__boekunaAssistantTest.snapshot().insights.find(x=>x.priority==='P0')?.id||'');
 await page.evaluate(id=>{closeModal();openAssistantInsight(id)},blocking);await page.getByRole('dialog').waitFor();
 assert.equal(await page.getByRole('dialog').getByRole('button',{name:'Niet meer tonen',exact:true}).count(),0,'P0 cannot be dismissed');
 await page.evaluate(()=>closeModal());

 const p2=await page.evaluate(()=>window.__boekunaAssistantTest.snapshot().insights.find(x=>x.priority==='P2')?.id||'');
 assert.ok(p2,'Fixture needs a dismissible P2 insight');
 const p2Type=await page.evaluate(id=>window.__boekunaAssistantTest.snapshot().insights.find(x=>x.id===id)?.type||'',p2);
 await page.evaluate(id=>openAssistantInsight(id),p2);await page.getByRole('dialog').getByRole('button',{name:'Niet meer tonen',exact:true}).click();
 assert.ok(await page.evaluate(type=>state.assistant.hiddenTypes.includes(type),p2Type),'P2 hide-type preference must persist in tenant state');
 const metricState=await page.evaluate(()=>structuredClone(state.assistant.metrics));
 const sessionMetric=await page.evaluate(()=>window.__boekunaAssistantTest.sessionMetrics());
 assert.ok(sessionMetric.insight_shown>=1,'Shown metric must be tracked without mutating ledger state on render');
 assert.ok(metricState.counts.insight_opened>=1&&metricState.counts.dismissed>=1,'Explicit interaction counters must be recorded');
 assert.deepEqual(Object.keys(metricState).sort(),['counts','lastEventAt'],'Assistant metrics must contain counts/timestamp only');
 assert.ok(Object.values(metricState.counts).every(Number.isFinite),'Assistant metric values must be aggregate counts only');

 const overdueBefore=await page.evaluate(()=>window.__boekunaAssistantTest.snapshot().insights.some(x=>x.type==='OVERDUE_INVOICE'));assert.equal(overdueBefore,true);
 await page.evaluate(()=>{for(const i of state.invoices){i.status='paid';i.payments=[{id:'paid-'+i.id,amount:invoiceGross(i),date:today()}]}render()});
 assert.equal(await page.evaluate(()=>window.__boekunaAssistantTest.snapshot().insights.some(x=>x.type==='OVERDUE_INVOICE')),false,'Resolved source state must remove overdue insight');

 await page.setViewportSize({width:1440,height:900});await nav('settings');
 assert.equal(await page.getByText('Assistent & inzichten',{exact:true}).count(),1);
 assert.equal(await page.getByText('Zonder externe AI',{exact:true}).count(),1);
 await page.getByRole('checkbox',{name:'Kosten begrijpen'}).check();
 assert.ok(await page.evaluate(()=>state.assistant.goals.includes('Kosten begrijpen')),'Goal preference must persist');
 const tipToggle=page.getByRole('switch',{name:'Persoonlijke tips'});assert.equal(await tipToggle.getAttribute('aria-checked'),'true');await tipToggle.click();assert.equal(await page.getByRole('switch',{name:'Persoonlijke tips'}).getAttribute('aria-checked'),'false');
 await axe(browserName+' assistant settings');

 const financialAfter=await page.evaluate(()=>JSON.stringify({invoices:state.invoices.map(i=>({...i,payments:[]})),expenses:state.expenses,transactions:state.transactions,documents:state.documents}));
 const original=await page.evaluate(()=>JSON.parse(window.__assistantFinancialBefore));
 assert.equal(JSON.stringify(original.expenses),JSON.stringify(JSON.parse(financialAfter).expenses),'Assistant UI must not mutate expenses');
 assert.equal(JSON.stringify(original.transactions),JSON.stringify(JSON.parse(financialAfter).transactions),'Assistant UI must not mutate bank transactions');
 assert.equal(JSON.stringify(original.documents),JSON.stringify(JSON.parse(financialAfter).documents),'Assistant UI must not mutate documents');
 assert.deepEqual(errors,[]);
 console.log('BOEKUNA personal assistant production-build browser QA: PASS '+browserName);
}finally{
 await browser.close();await new Promise(resolve=>server.close(resolve));
}
