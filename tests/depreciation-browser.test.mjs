import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';

// k2 Afschrijven: a purchase above € 450 can count as costs over 5+ years. Profit, reports and the ledger spread it;
// VAT stays in the purchase quarter, and taking it away (Weghalen) nets out in every period.
const root=process.cwd();
const build=spawnSync(process.execPath,['scripts/build-app.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,'app build failed: '+(build.stderr||build.stdout));
const dist=path.join(root,'dist','app');

function replaceLast(text,needle,replacement){
  const i=text.lastIndexOf(needle);
  if(i<0)throw new Error('Missing fixture bootstrap marker: '+needle);
  return text.slice(0,i)+replacement+text.slice(i+needle.length);
}
let appHtml=fs.readFileSync(path.join(dist,'index.html'),'utf8').replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
// The ledger survives a reload (like the real app), so the test can check that corrections persist.
appHtml=replaceLast(appHtml,'initAuth();',[
  "currentUser={...TEST_USER,email:'asset@example.test'};",
  "sessionStorage.setItem(FINANCIAL_PERIOD_KEY,'all');",
  "const savedLedger=localStorage.getItem(userDataKey());",
  "if(savedLedger)state=normalizeState(JSON.parse(savedLedger));else{state=structuredClone(DEFAULT);for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];",
  "state.company={...state.company,name:'Afschrijf QA BV',kvk:'12345678',vat:'NL123456789B01',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',email:'asset@example.test',iban:'NL91ABNA0417164300',kor:false}}",
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
const isWebkit=process.env.BOOKUNA_BROWSER==='webkit';
const browser=await (isWebkit?webkit:chromium).launch({headless:true});
const context=await browser.newContext(isWebkit?{...devices['iPhone 13'],reducedMotion:'reduce'}:{viewport:{width:1440,height:900},reducedMotion:'reduce'});
const page=await context.newPage();
const label=isWebkit?'webkit iPhone':'chromium desktop';
const errors=[],dialogs=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('dialog',d=>{dialogs.push(d.message());return d.accept()});
const cents=v=>Math.round(Number(v)*100);
async function waitIdle(){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))}

try{
  await page.goto(base+'/app',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof expenseCostsBetween==='function'&&typeof askDepreciation==='function');
  // A laptop of € 1.200 excl. btw bought 15 March 2025, written off over 5 years (60 months, € 20 per month).
  await page.evaluate(()=>{
    state.expenses=[
      {id:'lap',vendor:'Coolblue',date:'2025-03-15',category:'Kantoor',paymentMethod:'Bank',exVat:1200,vatAmount:252,gross:1452,vatRate:21,taxTreatment:'standard'},
      {id:'pen',vendor:'Hema',date:'2025-03-20',category:'Kantoor',paymentMethod:'Bank',exVat:10,vatAmount:2.1,gross:12.1,vatRate:21,taxTreatment:'standard'}];
    save();render();
  });
  const cost=(f,t)=>page.evaluate(([f,t])=>expenseCostsBetween(f,t),[f,t]);
  assert.equal(await cost('2025-01-01','2025-12-31'),1210,label+': without depreciation the laptop counts fully in 2025');

  // Desktop: choose it in the expense sheet; phone: same function.
  await page.evaluate(()=>expenseActions('lap'));
  await page.locator('#modalRoot').getByRole('button',{name:'Wijzigen',exact:true}).click();
  await page.locator('#depreciationYears').selectOption('5');
  await page.locator('#modalRoot').getByRole('button',{name:'Opslaan',exact:true}).click();
  assert.equal(await page.evaluate(()=>state.expenses.find(e=>e.id==='lap').depreciationYears),5,label+': 5 years saved');
  assert.equal(await page.evaluate(()=>state.expenses.find(e=>e.id==='pen').depreciationYears),undefined,label+': small costs untouched');
  // 2025: March to December = 10 months × € 20 = € 200, plus the pen.
  assert.equal(await cost('2025-01-01','2025-12-31'),210,label+': 2025 counts 10 months');
  assert.equal(await cost('2026-01-01','2026-12-31'),240,label+': a full year counts € 240');
  assert.equal(await cost('2030-01-01','2030-12-31'),40,label+': last 2 months in 2030');
  assert.equal(await cost('2031-01-01','2031-12-31'),0,label+': nothing after 5 years');
  assert.equal(await cost('',''),1210,label+': all periods together add up to the purchase');
  assert.equal(await cost('2025-03-01','2025-03-31'),30,label+': purchase month counts');
  // VAT is still deducted in the purchase quarter.
  assert.equal(await page.evaluate(()=>Math.round(100*expenseDeductibleVat(state.expenses.find(e=>e.id==='lap')))),25200,label+': full VAT stays deductible');
  // Ledger: purchase on Inventaris, yearly depreciation on Afschrijvingen; every entry balanced.
  const ledger=await page.evaluate(()=>{const j=generatedJournal(),rows=journalFlatRows(j),sum=(acc,y)=>rows.filter(r=>r.account===acc&&String(r.date).startsWith(y)).reduce((s,r)=>s+r.debit-r.credit,0);return {issues:journalIntegrityIssues.length,inv:sum('0200','2025'),dep25:sum('4950','2025'),dep26:sum('4950','2026'),acc:sum('0210','2026'),kantoor:sum('4500','2025')}});
  assert.equal(ledger.issues,0,label+': no unbalanced entries');
  assert.equal(ledger.inv,1200,label+': laptop on Inventaris');
  assert.equal(ledger.dep25,200,label+': 2025 depreciation in the ledger');
  assert.equal(ledger.dep26,240,label+': 2026 depreciation in the ledger');
  assert.equal(ledger.acc,-240,label+': cumulative depreciation credited');
  assert.equal(ledger.kantoor,10,label+': only the pen on office costs');
  // Reports: category shows Afschrijvingen.
  const cats=await page.evaluate(()=>dashboardCostCategories({preset:'custom',from:'2026-01-01',to:'2026-12-31'}));
  assert.ok(JSON.stringify(cats).includes('Afschrijvingen'),label+': report groups it as Afschrijvingen '+JSON.stringify(cats));
  // Weghalen nets out in every year.
  await page.evaluate(()=>{reverseExpenseBooking(state.expenses.find(e=>e.id==='lap'));save();render()});
  assert.equal(await cost('2026-01-01','2026-12-31'),0,label+': withdrawn laptop no longer counts in 2026');
  assert.equal(await cost('2025-01-01','2025-12-31'),10,label+': withdrawn laptop no longer counts in 2025');
  // A new manual expense above € 450 asks once.
  await page.evaluate(()=>{closeModal();newExpense()});await waitIdle();
  await page.evaluate(()=>{const f=document.getElementById('expenseForm');f.querySelector('[name=vendor]').value='Camerazaak';f.querySelector('[name=date]').value=today()});
  await page.evaluate(()=>{const f=document.getElementById('expenseForm');for(const el of f.elements)if(el.required&&!el.value&&el.tagName==='SELECT'&&el.options.length>1)el.value=el.options[1].value});
  await page.evaluate(()=>{const f=document.getElementById('expenseForm'),g=f.querySelector('[name=gross]');g.value='1210';g.dispatchEvent(new Event('input',{bubbles:true}));const r=f.querySelector('[name=vatRate][value="21"]');if(r){r.checked=true;r.dispatchEvent(new Event('change',{bubbles:true}))}else{const h=f.querySelector('[name=vatRate]');h.value='21'}});
  await page.evaluate(()=>saveExpense());await waitIdle();
  assert.equal(await page.locator('#modalRoot h2,#modalRoot h3,#modalRoot .modal-title').filter({hasText:'Afschrijven?'}).count()>0,true,label+': asks to write off a new purchase above € 450');
  await page.locator('#modalRoot').getByRole('button',{name:'Later',exact:true}).click();
  assert.deepEqual(errors,[],label+': page errors');
  console.log('depreciation ('+label+'): ok');
}finally{
  await browser.close();server.close();
}
