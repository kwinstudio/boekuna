import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';

// Removing a cost and crediting an invoice must lower every total where that cost or invoice counted:
// the cost in its own month and quarter, the credit note as soon as it is made. Run on desktop and iPhone size.
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
  "currentUser={...TEST_USER,email:'totals@example.test'};",
  "sessionStorage.setItem(FINANCIAL_PERIOD_KEY,'all');",
  "const savedLedger=localStorage.getItem(userDataKey());",
  "if(savedLedger)state=normalizeState(JSON.parse(savedLedger));else{state=structuredClone(DEFAULT);for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];",
  "state.company={...state.company,name:'Totalen QA BV',kvk:'12345678',vat:'NL123456789B01',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',email:'totals@example.test',kor:false}}",
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
  await page.waitForFunction(()=>typeof correctExpense==='function'&&typeof finalizeCreditNote==='function');
  // An invoice and a cost this month, and a cost from an earlier quarter.
  const days=await page.evaluate(()=>{const t=today(),d=new Date(t+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-4);d.setUTCDate(15);return {today:t,earlier:d.toISOString().slice(0,10)}});
  await page.evaluate(({today,earlier})=>{
    state.contacts=[{id:'c1',type:'customer',name:'Klant BV',email:'klant@example.test',address:'Weg 1',postal:'1000AA',city:'Amsterdam'}];
    state.invoices=[{id:'f1',number:'2026-001',numberManaged:true,numberFinalized:true,kind:'invoice',customerId:'c1',issueDate:today,supplyDate:today,dueDate:today,status:'sent',taxTreatment:'standard',lines:[{desc:'Advies',qty:10,unit:100,vat:21}]}];
    state.expenses=[{id:'e1',vendor:'Bouwmarkt',date:today,category:'Inkoop',paymentMethod:'Bank',exVat:100,vatAmount:21,gross:121,vatRate:21,taxTreatment:'standard'},
      {id:'e2',vendor:'Oud BV',date:earlier,category:'Inkoop',paymentMethod:'Bank',exVat:200,vatAmount:42,gross:242,vatRate:21,taxTreatment:'standard'}];
    save();render();
  },days);
  let t=await totals();
  assert.deepEqual([cents(t.qRevenue),cents(t.qCosts),cents(t.vat),cents(t.receivables)],[100000,10000,18900,121000],label+': starting totals');

  // 1. Kosten > open > Weghalen, through the real buttons.
  await page.evaluate(()=>{closeModal();navigate('expenses');expenseActions('e1')});
  await page.locator('#modalRoot button',{hasText:'Weghalen'}).click();await waitIdle();
  t=await totals();
  assert.deepEqual([cents(t.qCosts),cents(t.mCosts),cents(t.qProfit),cents(t.vat)],[0,0,100000,21000],label+': removing a cost lowers costs and raises the VAT to pay by its VAT');
  const correction=await page.evaluate(()=>state.expenses.find(e=>e.correctionFor==='e1'));
  assert.equal(correction.date,days.today,label+': the reversal is on the date of the cost');

  // 2. A cost from an earlier quarter: asks about the VAT return, and the reversal lands in that quarter.
  dialogs.length=0;
  await page.evaluate(()=>{closeModal();expenseActions('e2')});
  await page.locator('#modalRoot button',{hasText:'Weghalen'}).click();await waitIdle();
  assert.ok(dialogs.some(m=>m.includes('btw-periode is al voorbij')),label+': warns that the VAT period has ended');
  const earlierCosts=await page.evaluate(d=>state.expenses.filter(e=>String(e.date).slice(0,7)===d.slice(0,7)).reduce((s,e)=>s+expenseAccountingCost(e),0),days.earlier);
  assert.equal(cents(earlierCosts),0,label+': the earlier month drops to zero');
  t=await totals();
  assert.deepEqual([cents(t.qCosts),cents(t.mCosts)],[0,0],label+': this quarter is not pushed below zero');
  const kosten=await pageText('expenses');
  assert.ok(!kosten.includes('Bouwmarkt')&&!kosten.includes('Oud BV'),label+': removed costs are gone from the Kosten list');
  assert.equal(await page.evaluate(()=>state.expenses.length),4,label+': originals and reversals are kept for the records');

  // 3. Creditfactuur maken: final straight away, so revenue, VAT and receivables drop.
  await page.evaluate(()=>{closeModal();invoiceActions('f1')});await waitIdle();
  await page.locator('#modalRoot .invoice-action-more summary').click();
  await page.locator('#modalRoot button',{hasText:'Deel crediteren'}).click();
  await page.locator('#modalRoot button',{hasText:'Creditfactuur maken'}).click();
  await page.waitForFunction(()=>state.invoices.some(i=>i.kind==='credit'&&i.status!=='draft'));
  const credit=await page.evaluate(()=>{const c=state.invoices.find(i=>i.kind==='credit');return {status:c.status,number:c.number,final:c.numberFinalized,gross:invoiceGross(c)}});
  assert.equal(credit.status,'sent',label+': credit note is final');
  assert.ok(credit.final&&!/^CONCEPT/.test(credit.number),label+': credit note has a real number '+credit.number);
  t=await totals();
  assert.deepEqual([cents(t.qRevenue),cents(t.vat),cents(t.receivables)],[0,0,0],label+': credit note lowers revenue, VAT and receivables');
  assert.equal(await page.evaluate(()=>invoiceEffectiveStatus(state.invoices.find(i=>i.id==='f1'))),'credited',label+': invoice shows as credited');
  const income=await pageText('income');
  assert.match(income,/Omzet deze maand\s*€\s*0,00/,label+': Ontvangsten shows the lower revenue');
  const vat=await page.evaluate(()=>vatReturnBoxes(state.invoices,state.expenses));
  assert.deepEqual([cents(vat.output),cents(vat.input)],[0,0],label+': VAT return boxes follow');

  // 4. A credit concept made before this fix can be made final from the invoice menu.
  await page.evaluate(({today})=>{state.invoices.push({id:'f2',number:'2026-090',numberManaged:true,numberFinalized:true,kind:'invoice',customerId:'c1',issueDate:today,supplyDate:today,dueDate:today,status:'sent',taxTreatment:'standard',lines:[{desc:'Werk',qty:1,unit:500,vat:21}]},
    {id:'cr-old',number:'CONCEPT-CR-OLD',numberManaged:true,numberFinalized:false,kind:'credit',creditFor:'f2',customerId:'c1',issueDate:today,supplyDate:today,dueDate:today,status:'draft',payments:[],taxTreatment:'standard',lines:[{desc:'Werk',qty:1,unit:500,vat:21,sourceLineIndex:0}]});save();render()},days);
  t=await totals();
  assert.equal(cents(t.qRevenue),50000,label+': a credit concept does not count yet');
  await page.evaluate(()=>{closeModal();invoiceActions('cr-old')});
  await page.locator('#modalRoot button',{hasText:'Definitief maken'}).click();
  await page.waitForFunction(()=>state.invoices.find(i=>i.id==='cr-old').status==='sent');
  t=await totals();
  assert.deepEqual([cents(t.qRevenue),cents(t.receivables)],[0,0],label+': after Definitief maken it counts');

  // 4b. Factuur aanpassen: a final credit note plus a new concept; until the new one is sent, nothing counts.
  await page.evaluate(({today})=>{state.invoices.push({id:'f3',number:'2026-091',numberManaged:true,numberFinalized:true,kind:'invoice',customerId:'c1',issueDate:today,supplyDate:today,dueDate:today,status:'sent',taxTreatment:'standard',lines:[{desc:'Ontwerp',qty:2,unit:150,vat:21}]});save();render()},days);
  await page.evaluate(()=>{closeModal();invoiceActions('f3')});
  await page.locator('#modalRoot button',{hasText:'Factuur aanpassen'}).click();
  await page.locator('#modalRoot button',{hasText:'Doorgaan'}).click();
  await page.waitForFunction(()=>state.invoices.some(i=>i.kind==='credit'&&i.creditFor==='f3'&&i.status==='sent'));
  await page.evaluate(()=>{pendingInvoiceDraft=null;editingInvoiceId=null;closeModal()});
  t=await totals();
  assert.deepEqual([cents(t.qRevenue),cents(t.receivables)],[0,0],label+': Factuur aanpassen reverses the old invoice at once');
  assert.equal(await page.evaluate(()=>state.invoices.filter(i=>i.status==='draft'&&i.kind!=='credit').length),1,label+': the new version waits as a concept');

  // 6. Removing a cost paid by bank frees the bank line; a split-VAT cost reverses its VAT; no matching to removed costs.
  await page.evaluate(({today})=>{state.expenses.push({id:'e3',vendor:'Bakker Jansen',date:today,category:'Inkoop',paymentMethod:'Bank',exVat:110,vatAmount:null,gross:127.1,vatRate:null,mixedRates:true,taxTreatment:'standard',vatLines:[{rate:9,taxableAmount:50,vatAmount:4.5},{rate:21,taxableAmount:60,vatAmount:12.6}]});
    state.transactions.push({id:'t3',date:today,description:'Bakker Jansen pin',amount:-127.1,status:'matched',matchType:'expense',matchId:'e3',matchConfidence:'manual'});save();render()},days);
  const vatBefore=(await totals()).vat;
  dialogs.length=0;
  await page.evaluate(()=>{closeModal();expenseActions('e3')});
  await page.locator('#modalRoot button',{hasText:'Weghalen'}).click();await waitIdle();
  assert.ok(dialogs.some(m=>m.includes('bankbetaling wordt losgemaakt')),label+': says the bank link is removed');
  assert.equal(cents((await totals()).vat-vatBefore),1710,label+': removing a split-VAT cost raises VAT to pay by exactly its VAT');
  assert.equal(await page.evaluate(()=>state.transactions.find(t=>t.id==='t3').status),'unmatched',label+': the bank line waits to be matched again');
  await page.evaluate(()=>{autoMatch();closeModal()});
  assert.equal(await page.evaluate(()=>state.transactions.find(t=>t.id==='t3').status),'unmatched',label+': never matched automatically to a removed cost');
  assert.equal(await page.evaluate(()=>state.expenses.filter(e=>e.vendor==='Bakker Jansen').length),2,label+': original and reversal kept');

  // 7. A paid invoice that is credited keeps no invented payment after a reload, and a credit note is never late.
  await page.evaluate(({today})=>{state.invoices.push({id:'f4',number:'2026-092',numberManaged:true,numberFinalized:true,kind:'invoice',customerId:'c1',issueDate:today,supplyDate:today,dueDate:today,status:'sent',taxTreatment:'standard',payments:[{id:'p4',date:today,amount:121,method:'bank'}],lines:[{desc:'Uur',qty:1,unit:100,vat:21}]},
    {id:'cr4',number:'2026-093',numberManaged:true,numberFinalized:true,kind:'credit',creditFor:'f4',customerId:'c1',issueDate:'2020-01-01',supplyDate:'2020-01-01',dueDate:'2020-01-01',status:'sent',payments:[],taxTreatment:'standard',lines:[{desc:'Uur',qty:1,unit:100,vat:21,sourceLineIndex:0}]});
    const f=state.invoices.find(i=>i.id==='f4');syncInvoiceStatus(f);save();render()},days);
  assert.equal(await page.evaluate(()=>invoiceEffectiveStatus(state.invoices.find(i=>i.id==='cr4'))),'sent',label+': a credit note with a refund owed is never overdue');
  await page.evaluate(()=>{const f=state.invoices.find(i=>i.id==='f4');f.payments=[];syncInvoiceStatus(f);save()});
  const implied=await page.evaluate(()=>{const s=normalizeState(JSON.parse(JSON.stringify(state)));return invoicePayments(s.invoices.find(i=>i.id==='f4')).length});
  assert.equal(implied,0,label+': no payment is invented for a credited invoice');
  await page.evaluate(()=>{state.invoices=state.invoices.filter(i=>!['f4','cr4'].includes(i.id));save()});

  // 5. Everything survives a reload.
  const before=await totals();
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof dashboardKpiViewModel==='function'&&state.invoices.length===7);
  assert.deepEqual(await totals(),before,label+': same totals after reload');

  const overflow=await page.evaluate(()=>({vw:innerWidth,doc:document.documentElement.scrollWidth}));
  assert.ok(overflow.doc<=overflow.vw+2,label+': no horizontal overflow '+JSON.stringify(overflow));
  assert.deepEqual(errors,[],label+': page errors');
  console.log('delete and credit totals ('+label+'): ok');
}finally{
  await browser.close();server.close();
}
