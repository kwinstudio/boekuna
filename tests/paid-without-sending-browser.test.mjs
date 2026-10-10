import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';

// A concept invoice can be marked paid without sending it: it becomes final with a fixed number,
// the payment is booked and every total counts it. Run on desktop and iPhone size.
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
  "currentUser={...TEST_USER,email:'paid@example.test'};",
  "sessionStorage.setItem(FINANCIAL_PERIOD_KEY,'all');",
  "const savedLedger=localStorage.getItem(userDataKey());",
  "if(savedLedger)state=normalizeState(JSON.parse(savedLedger));else{state=structuredClone(DEFAULT);for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];",
  "state.company={...state.company,name:'Betaald QA BV',kvk:'12345678',vat:'NL123456789B01',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',email:'paid@example.test',iban:'NL91ABNA0417164300',kor:false}}",
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
// Totals straight from the screens' own view models.
const totals=()=>page.evaluate(()=>{const k=dashboardKpiViewModel('quarter'),m=dashboardKpiViewModel('month');return {qRevenue:k.revenue,qCosts:k.costs,qProfit:k.profit,mCosts:m.costs,vat:quarterVatPosition(),receivables:k.receivables}});
const pageText=async name=>{await page.evaluate(n=>{closeModal();navigate(n)},name);await waitIdle();return page.locator('#content').innerText()};

try{
  await page.goto(base+'/app',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof registerPayment==='function'&&typeof finalizeDraftAsPaid==='function');
  const day=await page.evaluate(()=>today());
  // Three concepts for a customer without an e-mail address; nothing has been sent.
  await page.evaluate(day=>{
    state.contacts=[{id:'c1',type:'customer',name:'Contant BV',email:'',address:'Weg 1',postal:'1000AA',city:'Amsterdam'}];
    const concept=(id,unit)=>({id,number:'CONCEPT-'+id,numberManaged:true,numberFinalized:false,kind:'invoice',customerId:'c1',issueDate:day,supplyDate:day,dueDate:day,paymentDays:14,status:'draft',taxTreatment:'standard',lines:[{desc:'Werk',qty:1,unit,vat:21}]});
    state.invoices=[concept('d1',100),concept('d2',200),concept('d3',300)];
    save();render();
  },day);
  t0:{
    const t=await totals();
    assert.deepEqual([cents(t.qRevenue),cents(t.receivables)],[0,0],label+': concepts do not count yet');
  }

  // 1. Open the concept and tap Betaald (no sending, no e-mail address).
  await page.evaluate(()=>{navigate('invoices');viewInvoice('d1')});await waitIdle();
  await page.locator('#modalRoot button',{hasText:/^Betaald$/}).click();await waitIdle();
  assert.match(await page.locator('#modalRoot').innerText(),/krijgt een vast factuurnummer/,label+': the dialog says the concept gets a fixed number');
  await page.locator('#modalRoot button',{hasText:'Opslaan als betaald'}).click();

  await page.waitForFunction(()=>state.invoices.find(i=>i.id==='d1').status!=='draft');await waitIdle();
  let d1=await page.evaluate(()=>{const i=state.invoices.find(x=>x.id==='d1');return {number:i.number,final:i.numberFinalized,status:invoiceEffectiveStatus(i),paid:invoicePaidAmount(i),open:invoiceOutstanding(i),sent:!!i.lastSentAt,modal:!!document.querySelector('#modalRoot .modal')}});
  assert.ok(d1.final&&!/^CONCEPT-/.test(d1.number),label+': the invoice got a fixed number ('+d1.number+')');
  assert.deepEqual([d1.status,cents(d1.paid),cents(d1.open),d1.sent],['paid',12100,0,false],label+': paid in full, not marked as sent');
  let t=await totals();
  assert.deepEqual([cents(t.qRevenue),cents(t.receivables)],[10000,0],label+': revenue counts it, nothing left to receive');

  // 2. Actions > Betaald? > Een deel: a partial payment on a concept.
  await page.evaluate(()=>{closeModal();invoiceActions('d2')});await waitIdle();
  await page.locator('#modalRoot .action-row',{hasText:'Betaald?'}).click();await waitIdle();
  await page.locator('#modalRoot .payment-part-link:visible, #modalRoot .payment-share-btn[data-share="part"]:visible').first().click();
  await page.locator('#paymentAmount').fill('50');
  await page.locator('#modalRoot button',{hasText:'Opslaan als betaald'}).click();
  await page.waitForFunction(()=>state.invoices.find(i=>i.id==='d2').status!=='draft');await waitIdle();
  const d2=await page.evaluate(()=>{const i=state.invoices.find(x=>x.id==='d2');return {status:invoiceEffectiveStatus(i),open:invoiceOutstanding(i),numbers:state.invoices.filter(x=>x.status!=='draft').map(x=>x.number)}});
  assert.deepEqual([d2.status,cents(d2.open)],['partial',19200],label+': partial payment leaves the rest open');
  assert.equal(new Set(d2.numbers).size,2,label+': each invoice has its own number');
  t=await totals();
  assert.deepEqual([cents(t.qRevenue),cents(t.receivables)],[30000,19200],label+': totals follow');

  // 3. Annuleren keeps the concept a concept.
  await page.evaluate(()=>{closeModal();registerPayment('d3')});await waitIdle();
  await page.locator('#modalRoot button',{hasText:'Annuleren'}).click();await waitIdle();
  assert.equal(await page.evaluate(()=>state.invoices.find(i=>i.id==='d3').status),'draft',label+': cancelling changes nothing');

  // 4. Missing company details: nothing is made final and no payment is booked.
  await page.evaluate(()=>{state.company.kvk='';save();registerPayment('d3')});await waitIdle();
  await page.locator('#modalRoot button',{hasText:'Opslaan als betaald'}).click();await waitIdle();
  const d3=await page.evaluate(()=>{const i=state.invoices.find(x=>x.id==='d3');return {status:i.status,payments:invoicePayments(i).length}});
  assert.deepEqual(d3,{status:'draft',payments:0},label+': blocked when company details are missing');
  await page.evaluate(()=>{closeModal();state.company.kvk='12345678';save()});

  // 5. A paid invoice no longer offers Betaald; everything survives a reload.
  await page.evaluate(()=>invoiceActions('d1'));await waitIdle();
  assert.equal(await page.locator('#modalRoot .action-row',{hasText:'Betaald?'}).count(),0,label+': a paid invoice has no Betaald action');
  await page.evaluate(()=>closeModal());
  const before=await totals();
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof dashboardKpiViewModel==='function'&&state.invoices.length===3);
  assert.deepEqual(await totals(),before,label+': same totals after reload');
  assert.equal(await page.evaluate(()=>invoiceEffectiveStatus(state.invoices.find(i=>i.id==='d1'))),'paid',label+': still paid after reload');

  const overflow=await page.evaluate(()=>({vw:innerWidth,doc:document.documentElement.scrollWidth}));
  assert.ok(overflow.doc<=overflow.vw+2,label+': no horizontal overflow '+JSON.stringify(overflow));
  assert.deepEqual(errors,[],label+': page errors');
  console.log('paid without sending ('+label+'): ok');
}finally{
  await browser.close();server.close();
}
