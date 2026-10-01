import {serveKvkAsset} from './lib/kvk-browser-assets.mjs';
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
const financialCorrectionSource=fs.readFileSync(new URL('../public/assets/financial-correction.js',import.meta.url),'utf8');

function replaceLast(source,needle,replacement){
  const i=source.lastIndexOf(needle);
  if(i<0)throw new Error('Missing bootstrap marker: '+needle);
  return source.slice(0,i)+replacement+source.slice(i+needle.length);
}

let appHtml=original.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
appHtml=replaceLast(appHtml,'initAuth();',String.raw`
currentUser=TEST_USER;
sessionStorage.removeItem(LIST_STATE_KEY);
listState=loadListState();
state=structuredClone(DEFAULT);
for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
state.company={...state.company,name:'List QA BV',tradeName:'List QA',contactName:'QA',email:'qa@example.test',phone:'0101234567',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',invoicePrefix:(new Date().getFullYear()+'-'),paymentDays:14,kor:false};

const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const now=new Date(),past=new Date(now),future=new Date(now),older=new Date(now),y=now.getFullYear();
past.setDate(past.getDate()-45);
future.setDate(future.getDate()+45);
older.setDate(older.getDate()-5);
const issuePast=new Date(now);issuePast.setDate(issuePast.getDate()-60);
const issueRecent=new Date(now);issueRecent.setDate(issueRecent.getDate()-3);
const issueOlder=new Date(now);issueOlder.setDate(issueOlder.getDate()-10);

state.contacts=[
 {id:'c-supplier',type:'supplier',name:'Alpha Supply',contactPerson:'Anna',email:'alpha@example.test',city:'Delft',vat:'NL100000001B01',address:'A 1',postal:'2611AA'},
 {id:'c-jansen',type:'customer',name:'Jansen BV',contactPerson:'Jan Jansen',email:'jan@jansen.test',city:'Rotterdam',vat:'NL100000002B01',address:'J 1',postal:'3011AA'},
 {id:'c-zeta',type:'customer',name:'Zeta Studio',contactPerson:'Zoe',email:'zoe@zeta.test',city:'Utrecht',vat:'NL100000003B01',address:'Z 1',postal:'3511AA'}
];
state.services=[
 {id:'svc-b',name:'Webdesign',description:'Website bouw',unitLabel:'project',price:900,vat:21,active:true},
 {id:'svc-a',name:'Advies',description:'Strategisch advies',unitLabel:'uur',price:120,vat:21,active:true},
 {id:'svc-z',name:'Zomeractie',description:'Inactief pakket',unitLabel:'pakket',price:50,vat:9,active:false}
];
state.invoices=[
 {id:'i-overdue',number:String(y)+'-0001',kind:'invoice',customerId:'c-jansen',issueDate:iso(issuePast),supplyDate:iso(issuePast),dueDate:iso(past),status:'sent',paymentReference:'PAY-JANSEN',taxTreatment:'standard',payments:[],lines:[{desc:'Advies',qty:1,unit:100,vat:21,unitLabel:'uur'}]},
 {id:'i-open',number:String(y)+'-0002',kind:'invoice',customerId:'c-zeta',issueDate:iso(issueRecent),supplyDate:iso(issueRecent),dueDate:iso(future),status:'sent',paymentReference:'PAY-ZETA',taxTreatment:'standard',payments:[],lines:[{desc:'Webdesign',qty:1,unit:200,vat:21,unitLabel:'project'}]},
 {id:'i-paid',number:String(y)+'-0003',kind:'invoice',customerId:'c-jansen',issueDate:iso(issueOlder),supplyDate:iso(issueOlder),dueDate:iso(future),status:'paid',paymentReference:'PAY-PAID',taxTreatment:'standard',payments:[{id:'p1',date:iso(issueRecent),amount:60.5}],lines:[{desc:'Kleine klus',qty:1,unit:50,vat:21,unitLabel:'stuk'}]},
 {id:'i-draft',number:'CONCEPT-QA',kind:'invoice',customerId:'c-zeta',issueDate:iso(now),supplyDate:iso(now),dueDate:iso(future),status:'draft',paymentReference:'CONCEPT-QA',taxTreatment:'standard',payments:[],lines:[{desc:'Concept',qty:1,unit:300,vat:21,unitLabel:'stuk'}]},
 {id:'i-old',number:String(y-1)+'-0099',kind:'invoice',customerId:'c-zeta',issueDate:String(y-1)+'-12-15',supplyDate:String(y-1)+'-12-15',dueDate:iso(future),status:'sent',paymentReference:'OLD',taxTreatment:'standard',payments:[],lines:[{desc:'Oud project',qty:1,unit:400,vat:21,unitLabel:'project'}]}
];
state.expenses=[
 {id:'e-adobe',vendor:'Adobe Nederland',date:iso(issueRecent),category:'Software',paymentMethod:'Bank',exVat:100,vatRate:21,invoiceNumber:'AD-100',notes:'Creative Cloud',source:'document-import',documentType:'purchase_invoice'},
 {id:'e-lunch',vendor:'Lunchbar',date:iso(issueOlder),category:'Representatie',paymentMethod:'Privé voorgeschoten',exVat:20,vatRate:9,invoiceNumber:'',notes:'Team lunch',source:'manual'}
];
state.transactions=[
 {id:'t-new',date:iso(now),description:'Stripe payout september',amount:300,status:'unmatched'},
 {id:'t-jansen',date:iso(issueRecent),description:'Deelbetaling open factuur',amount:121,status:'matched',matchType:'invoice',matchId:'i-open'},
 {id:'t-adobe',date:iso(older),description:'Adobe Creative Cloud',amount:-25,status:'matched',matchType:'expense',matchId:'e-adobe'}
];
state.documents=[
 {id:'d-invoice',name:'factuur-jansen.pdf',type:'Inkoopfactuur',date:iso(issueRecent),linkedType:'invoice',linkedId:'i-overdue',fileId:'f1',verification:{status:'verified'}},
 {id:'d-receipt',name:'bon-lunch.jpg',type:'Bon',date:iso(issueOlder),linkedType:'expense',linkedId:'e-lunch',fileId:'f2',verification:{status:'needs_review'}},
 {id:'d-loose',name:'los-document.pdf',type:'Upload',date:iso(older),verification:{status:'technical_error'}}
];
state.bookings=[
 {id:'b-future',date:iso(future),time:'10:00',customerId:'c-jansen',service:'Advies',status:'confirmed',duration:60,price:100,vat:21,deposit:0},
 {id:'b-past',date:iso(past),time:'12:00',customerId:'c-zeta',service:'Webdesign',status:'completed',duration:60,price:200,vat:21,deposit:50}
];
state.hours=[{id:'h-new',date:iso(now),hours:2,project:'Nieuw',desc:'Vandaag'},{id:'h-old',date:iso(older),hours:1,project:'Oud',desc:'Eerder'}];
state.mileage=[{id:'m-new',date:iso(now),km:10,from:'A',to:'B',purpose:'Nieuw'},{id:'m-old',date:iso(older),km:5,from:'C',to:'D',purpose:'Oud'}];

enterApp();
`);

const server=http.createServer((req,res)=>{
  if(serveKvkAsset(req,res))return;
  if(req.url?.startsWith('/assets/financial-correction.js')){res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});return res.end(financialCorrectionSource)}
  if(req.url?.startsWith('/manifest.webmanifest')){res.writeHead(200,{'content-type':'application/manifest+json'});return res.end('{}')}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(appHtml);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {port}=server.address();
const base=`http://127.0.0.1:${port}`;

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(String(e)));

async function go(name){
  await page.evaluate(name=>navigate(name),name);
  await page.locator('[data-list-page="'+name+'"]').waitFor();
}
async function search(value){
  const input=page.locator('[data-list-search]');
  await input.fill(value);
  await page.waitForTimeout(240);
}
async function clearSearch(){
  const btn=page.locator('[data-list-clear-search]').first();
  if(await btn.isVisible())await btn.click();
}
async function openFilters(){
  await page.locator('[data-list-open-filters]').click();
  await page.locator('#listFilterForm').waitFor();
}
async function applyFilters(values){
  await openFilters();
  for(const [k,v] of Object.entries(values)){
    const el=page.locator('#listFilterForm [name="'+k+'"]');
    if(await el.getAttribute('type')==='date')await el.fill(v); else await el.selectOption(v);
  }
  await page.getByRole('button',{name:'Toepassen'}).click();
}
async function setSort(value){
  await page.locator('[data-list-open-sort]').click();
  await page.locator('#listSortForm input[value="'+value+'"]').check();
  await page.getByRole('button',{name:'Toepassen'}).click();
}
async function visibleRowTexts(){
  return page.locator('.table tbody tr').allInnerTexts();
}

try{
  await page.goto(base+'/app',{waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('#globalSearch').count(),0,'Global cross-app search must not render');

  // FACTUREN — number/customer/amount search + status/period/customer filters + sort + clear behavior.
  await go('invoices');
  assert.equal(await page.locator('[data-list-search]').getAttribute('placeholder'),'Zoek op factuurnummer, klant of bedrag');
  await search(String(new Date().getFullYear())+'-0001');
  assert.deepEqual((await visibleRowTexts()).map(x=>x.includes('0001')), [true],'Invoice number search must find the invoice');
  await clearSearch();

  await search('Jansen');
  let rows=await visibleRowTexts();
  assert.ok(rows.length>=2 && rows.every(x=>x.includes('Jansen')),'Customer search must match linked customer name');
  await clearSearch();

  await search('121');
  rows=await visibleRowTexts();
  assert.ok(rows.some(x=>x.includes('0001')),'Amount search must find formatted €121 invoice');
  await clearSearch();

  await page.getByRole('button',{name:'Verlopen'}).click();
  rows=await visibleRowTexts();
  assert.equal(rows.length,1,'Overdue quick filter must return exactly the overdue invoice');
  assert.match(rows[0],/0001/);
  assert.equal(await page.evaluate(()=>listPageState('invoices').filters.status),'overdue');

  await applyFilters({customer:'c-jansen'});
  rows=await visibleRowTexts();
  assert.equal(rows.length,1,'Customer + overdue must combine with AND');
  assert.match(rows[0],/Jansen/);

  await applyFilters({status:'open',customer:'all',period:'year'});
  rows=await visibleRowTexts();
  assert.ok(rows.some(x=>x.includes('0002')),'Open + current year must include current open invoice');
  assert.ok(rows.every(x=>!x.includes(String(new Date().getFullYear()-1)+'-0099')),'Period + status must exclude previous year');

  await page.locator('[data-list-clear-filters]').click();
  await page.getByRole('button',{name:'Betaald'}).click();
  rows=await visibleRowTexts();
  assert.equal(rows.length,1,'Paid quick filter must return fully paid invoices');
  assert.match(rows[0],/0003/);
  await page.locator('[data-list-clear-filters]').click();
  await setSort('amount-desc');
  rows=await visibleRowTexts();
  assert.match(rows[0],/0099/,'Amount high→low must put largest invoice first');
  await setSort('amount-asc');
  rows=await visibleRowTexts();
  assert.match(rows[0],/0003/,'Amount low→high must put smallest invoice first');

  await search('Jansen');
  await page.getByRole('button',{name:'Verlopen'}).click();
  await setSort('amount-desc');
  const beforeClear=await page.evaluate(()=>structuredClone(listPageState('invoices')));
  await page.locator('[data-list-clear-filters]').click();
  const afterClear=await page.evaluate(()=>structuredClone(listPageState('invoices')));
  assert.equal(afterClear.query,'Jansen','Filters wissen must preserve query');
  assert.equal(afterClear.sort,'amount-desc','Filters wissen must preserve sort');
  assert.equal(afterClear.filters.status,'all','Filters wissen must reset filters');
  assert.equal(beforeClear.query,afterClear.query);
  await clearSearch();
  assert.equal(await page.evaluate(()=>listPageState('invoices').query),'','Search clear button must only clear query');

  // Distinct combined empty state.
  await search('niemand-bestaat');
  await page.getByRole('button',{name:'Verlopen'}).click();
  assert.match(await page.locator('.empty').innerText(),/binnen deze filters/);
  await clearSearch();
  await page.locator('[data-list-clear-filters]').click();

  // RELATIES — search/type filters/default A-Z.
  await go('contacts');
  rows=await visibleRowTexts();
  assert.match(rows[0],/Alpha Supply/,'Contacts default sort must be A–Z');
  await search('Jan Jansen');
  rows=await visibleRowTexts();
  assert.equal(rows.length,1);
  assert.match(rows[0],/Jansen BV/);
  await clearSearch();
  await search('Alpha Supply');
  rows=await visibleRowTexts();
  assert.equal(rows.length,1,'Supplier search must search supplier names');
  assert.match(rows[0],/Alpha Supply/);
  await clearSearch();
  await page.getByRole('button',{name:'Klanten'}).click();
  rows=await visibleRowTexts();
  assert.ok(rows.length===2 && rows.every(x=>x.includes('Klant')),'Customer filter must exclude suppliers');
  await page.getByRole('button',{name:'Leveranciers'}).click();
  rows=await visibleRowTexts();
  assert.equal(rows.length,1);
  assert.match(rows[0],/Alpha Supply/);
  await page.getByRole('button',{name:'Alle'}).click();
  await setSort('name-desc');
  rows=await visibleRowTexts();
  assert.match(rows[0],/Zeta Studio/,'Contacts Z–A sort must put Zeta first');

  // BANK — search, matching status, direction, newest first.
  await go('bank');
  rows=await visibleRowTexts();
  assert.match(rows[0],/Stripe payout/,'Bank default sort must be newest first');
  await search('Adobe');
  rows=await visibleRowTexts();
  assert.equal(rows.length,1);
  assert.match(rows[0],/Adobe/);
  await clearSearch();
  await page.getByRole('button',{name:'Te verwerken'}).click();
  rows=await visibleRowTexts();
  assert.equal(rows.length,1);
  assert.match(rows[0],/Stripe payout/);
  await page.getByRole('button',{name:'Gekoppeld'}).click();
  rows=await visibleRowTexts();
  assert.equal(rows.length,2);
  await applyFilters({status:'all',direction:'expense'});
  rows=await visibleRowTexts();
  assert.equal(rows.length,1);
  assert.match(rows[0],/Adobe/);
  await page.locator('[data-list-clear-filters]').click();

  // DOCUMENTEN — file search, linked/unlinked, type, newest first.
  await go('documents');
  rows=await visibleRowTexts();
  assert.match(rows[0],/factuur-jansen\.pdf/,'Documents default sort must be newest first');
  await search('los-document');
  rows=await visibleRowTexts();
  assert.equal(rows.length,1);
  assert.match(rows[0],/los-document/);
  await clearSearch();
  await applyFilters({linked:'linked'});
  rows=await visibleRowTexts();
  assert.equal(rows.length,2);
  assert.ok(rows.every(x=>!x.includes('los-document')));
  await applyFilters({linked:'unlinked'});
  rows=await visibleRowTexts();
  assert.equal(rows.length,1);
  assert.match(rows[0],/los-document/);
  await applyFilters({linked:'all',type:'Bon'});
  rows=await visibleRowTexts();
  assert.equal(rows.length,1);
  assert.match(rows[0],/bon-lunch/);
  await page.locator('[data-list-clear-filters]').click();
  await applyFilters({status:'needs_review'});
  rows=await visibleRowTexts();
  assert.equal(rows.length,1,'Document control status filter must isolate review-needed documents');
  assert.match(rows[0],/bon-lunch/);
  await page.locator('[data-list-clear-filters]').click();
  await setSort('name-desc');
  rows=await visibleRowTexts();
  assert.match(rows[0],/los-document/,'Documents Z–A sort must put los-document first');

  // EXPENSES — vendor/invoice/amount search and sort.
  await go('expenses');
  await search('AD-100');
  rows=await visibleRowTexts();
  assert.equal(rows.length,1);
  assert.match(rows[0],/Adobe/);
  await clearSearch();
  await search('121');
  rows=await visibleRowTexts();
  assert.equal(rows.length,1,'Expense gross amount must be searchable');
  assert.match(rows[0],/Adobe/);
  await clearSearch();
  await applyFilters({vendor:'Adobe Nederland'});
  rows=await visibleRowTexts();
  assert.equal(rows.length,1,'Supplier filter must isolate one expense vendor');
  assert.match(rows[0],/Adobe/);
  await page.locator('[data-list-clear-filters]').click();
  await setSort('vendor-desc');
  rows=await visibleRowTexts();
  assert.match(rows[0],/Lunchbar/,'Supplier Z–A sort must put Lunchbar first');
  await setSort('amount-desc');
  rows=await visibleRowTexts();
  assert.match(rows[0],/Adobe/);

  // SERVICES/BOOKINGS P2 smoke and hours/rits launch default.
  await go('services');
  rows=await visibleRowTexts();
  assert.match(rows[0],/Advies/,'Services default sort must be A–Z');
  await page.getByRole('button',{name:'Inactief'}).click();
  rows=await visibleRowTexts();
  assert.equal(rows.length,1);
  assert.match(rows[0],/Zomeractie/);
  await page.evaluate(()=>{state.services=[];render()});
  assert.match(await page.locator('.empty').innerText(),/Je hebt nog geen diensten toegevoegd/,'True empty state must differ from no-results state');

  await go('bookings');
  const bookingCards=await page.locator('.booking-card').allInnerTexts();
  assert.match(bookingCards[0],/Advies/,'Bookings default must put future appointment before history');

  await page.evaluate(()=>navigate('hours'));
  const hourDates=await page.locator('.grid.grid-2 .card.table-card').first().locator('tbody tr').allInnerTexts();
  assert.match(hourDates[0],/Vandaag/,'Hours must default to newest date first');
  const mileageDates=await page.locator('.grid.grid-2 .card.table-card').nth(1).locator('tbody tr').allInnerTexts();
  assert.match(mileageDates[0],/Nieuw/,'Mileage must default to newest date first');

  // Responsive: 375, 768, 1440. Toolbar itself may not add global overflow.
  for(const width of [375,768,1440]){
    await page.setViewportSize({width,height:width===375?812:900});
    await page.evaluate(()=>navigate('invoices'));
    const toolbar=page.locator('[data-list-page="invoices"]');
    const box=await toolbar.boundingBox();
    assert.ok(box && box.x>=-1 && box.x+box.width<=width+1,`Toolbar must fit viewport at ${width}px`);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),`List controls must not add page overflow at ${width}px`);
    const buttons=toolbar.locator('.list-toolbar-actions .btn');
    for(let i=0;i<await buttons.count();i++){
      if(!(await buttons.nth(i).isVisible()))continue;
      const b=await buttons.nth(i).boundingBox();
      assert.ok(b && b.x>=-1 && b.x+b.width<=width+1,`Toolbar button ${i} must stay on-screen at ${width}px`);
    }
  }

  // Mobile dialog + filter count + keyboard focus restoration.
  await page.setViewportSize({width:375,height:812});
  await page.evaluate(()=>navigate('invoices'));
  const filterTrigger=page.locator('[data-list-open-filters]');
  await filterTrigger.click();
  const modal=page.locator('.modal');
  const modalBox=await modal.boundingBox();
  assert.ok(modalBox && modalBox.width<=375.5,'Mobile filter dialog must fit viewport');
  assert.equal(await modal.evaluate(el=>getComputedStyle(el).overflowY),'auto','Mobile filter dialog must be scrollable');
  await page.locator('#listFilterForm [name="status"]').selectOption('overdue');
  await page.getByRole('button',{name:'Toepassen'}).click();
  assert.match(await filterTrigger.innerText(),/Filters \(1\)/,'Active filter count must be visible');
  await filterTrigger.click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(20);
  assert.ok(await filterTrigger.evaluate(el=>document.activeElement===el),'Focus must return to filter trigger after dialog closes');

  assert.deepEqual(pageErrors,[],'Browser page errors: '+pageErrors.join(' | '));
  console.log('Boekuna contextual lists: PASS (P1/P2 search, filters, sorting, empty states, session behavior, responsive and accessibility)');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
