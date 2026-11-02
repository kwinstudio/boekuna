// Volledige test (Kwin 2026-11-01): 24 fixes so the app reads clear from start to finish. This covers the logic that lives in
// the app itself (concept invoices, the desktop invoice form, hours on Ritten & uren, the start list, plain errors, km in
// the income tax estimate, names) and the small helder.js layer (one search per list, fewer controls on short lists).
// Like motion, press, handig and gevoel, helder.js is off for automated browsers; ?helder=1 turns it on here. Chromium and WebKit.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';

execFileSync(process.execPath,['scripts/build-app.mjs']);
const generated=fs.readFileSync('dist/app/index.html','utf8');
const browserName=process.env.BOOKUNA_BROWSER||'chromium';
const boot=`currentUser={...TEST_USER,email:'qa@example.test'};state=structuredClone(DEFAULT);
for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
state.company={...state.company,name:'Fictieve QA BV',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',kvk:'12345678',vat:'NL123456789B01',email:'',iban:'NL91ABNA0417164300'};
state.contacts=[{id:'c1',type:'customer',name:'Fictieve Schilders',email:'klant@example.test',address:'Klantstraat 2',postal:'3011AB',city:'Rotterdam'}];
documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;enterApp();`;
const html=generated.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;').replace(/initAuth\(\);(?![\s\S]*initAuth\(\);)/,boot);
const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  const p=new URL(req.url,'http://localhost').pathname;
  if(p.startsWith('/assets/')){const f=path.resolve('dist/app'+p);if(fs.existsSync(f)){res.setHeader('Content-Type',types[path.extname(f)]||'image/png');return res.end(fs.readFileSync(f))}res.writeHead(404);return res.end()}
  res.setHeader('Content-Type','text/html');res.end(html);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
const browser=await (browserName==='webkit'?webkit:chromium).launch();
const errors=[];

async function openApp({phone=true,helder=true}={}){
  const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1280,height:900},hasTouch:phone,isMobile:phone&&browserName==='chromium',locale:'nl-NL'});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.setDefaultTimeout(5000);
  await page.goto(url+(helder?'/?helder=1':'/'),{waitUntil:'domcontentloaded'});
  await page.locator('#mainApp').waitFor();
  return {context,page};
}

try{
  // Off for automated browsers; the app-side fixes still apply.
  {
    const {context,page}=await openApp({phone:false,helder:false});
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('boekuna-helder')),false,'Off for automated browsers');
    // 1: the login e-mail fills an empty company e-mail.
    assert.equal(await page.evaluate(()=>state.company.email),'qa@example.test');
    // 8: plain Dutch instead of browser errors.
    assert.equal(await page.evaluate(()=>friendlyErrorText('TypeError: Failed to fetch')),'Geen verbinding. Probeer het zo nog eens.');
    assert.equal(await page.evaluate(()=>friendlyErrorText('Load failed')),'Geen verbinding. Probeer het zo nog eens.');
    assert.equal(await page.evaluate(()=>friendlyErrorText('Kosten opgeslagen')),'Kosten opgeslagen');
    // 6/21/24: desktop shows the same numbered start list as the phone.
    await page.evaluate(()=>navigate('dashboard'));
    const start=page.locator('.dashboard-start').first();await start.waitFor();
    assert.match(await start.innerText(),/Nog \d stap/);
    await context.close();
  }

  // 3 + 4: a concept is called Concept, not CONCEPT-xxxx, and its foot offers Aanpassen and Versturen.
  {
    const {context,page}=await openApp({phone:false});
    await page.evaluate(()=>{state.invoices.push({id:'d1',number:'CONCEPT-AB12-CD34',status:'draft',kind:'invoice',customerId:'c1',issueDate:today(),dueDate:today(),lines:[{desc:'Schilderwerk',qty:1,unit:100,vat:21}],payments:[]});viewInvoice('d1')});
    const modal=page.locator('#modalRoot');await modal.getByText('Conceptfactuur').first().waitFor();
    const text=await modal.innerText();
    assert.doesNotMatch(text,/CONCEPT-AB12/,'No technical concept number on screen');
    assert.match(text,/Concept · wordt 2026-0001|Concept · wordt \d{4}-0001/);
    assert.match(text,/Betalingskenmerk: volgt bij versturen/);
    assert.ok(await modal.getByRole('button',{name:'Aanpassen'}).isVisible());
    assert.ok(await modal.getByRole('button',{name:'Versturen'}).isVisible());
    await page.evaluate(()=>{closeModal();invoiceActions('d1')});
    assert.match(await page.locator('#modalRoot').innerText(),/^Concept\n[\s\S]*Betaald\?/,'Actions are titled Concept and still offer Betaald?');
    await page.evaluate(()=>closeModal());
    // 5: the desktop invoice form has no status dropdown; it saves as concept or sends.
    await page.evaluate(()=>newInvoice());
    const form=page.locator('#invoiceForm');await form.waitFor();
    assert.equal(await page.locator('.invoice-status-field').isVisible(),false,'No status dropdown');
    assert.ok(await page.getByRole('button',{name:'Bewaar als concept'}).isVisible());
    assert.ok(await page.getByRole('button',{name:'Versturen',exact:true}).isVisible());
    await page.evaluate(()=>closeModal());
    await context.close();
  }

  // 2: booked hours show on Ritten & uren and go on an invoice in one tap. 22: km lower the income tax estimate.
  {
    const {context,page}=await openApp({phone:false});
    await page.evaluate(()=>{state.hours=[{id:'h1',date:today(),hours:3,project:'Fictieve Schilders',desc:'Advies'}];state.mileage=[{id:'m1',date:today(),km:100,retour:true}];save();navigate('trips')});
    const hours=page.locator('.trip-hours');await hours.waitFor();
    assert.match(await hours.innerText(),/Advies[\s\S]*3 uur/);
    assert.equal(await page.locator('.nav-item[data-page="hours"]').isVisible(),false,'One place for hours');
    await page.locator('.trip-hours-bill').first().click();
    await page.locator('#invoiceForm').waitFor();await page.waitForTimeout(200);
    const line=await page.evaluate(()=>{const r=document.querySelector('#invoiceLines .line-item:last-child');return {desc:r.querySelector('[data-k=desc]').value,qty:r.querySelector('[data-k=qty]').value,unit:r.querySelector('[data-k=unitLabel]')?.value,hour:r.dataset.hourId,customer:document.getElementById('invoiceForm').elements.customerId.value}});
    assert.match(line.desc,/Advies/);assert.equal(line.qty,'3');assert.equal(line.hour,'h1');assert.equal(line.customer,'c1');
    await page.evaluate(()=>closeModal());
    assert.equal(await page.evaluate(()=>tripsDeductionForYear(new Date().getFullYear())),23,'Heen en terug is already in km: 100 km × € 0,23');
    await context.close();
  }

  // 14 + 16: one name for things, and Kosten shows what you paid.
  {
    const {context,page}=await openApp();
    assert.equal(await page.evaluate(()=>PAGE_TITLES.documents),'Bonnen');
    await page.evaluate(()=>{state.expenses=[{id:'e1',date:today(),vendor:'Kantoorwinkel',category:'office',exVat:100,vatRate:21}];save();navigate('expenses')});
    await page.waitForTimeout(300);
    const body=await page.locator('#content').innerText();
    assert.match(body,/Uitgegeven/);
    assert.match(body,/waarvan €\s21,00 btw terug/);
    // 22: the income tax estimate on the phone Rapportages takes the km off the profit.
    await page.evaluate(()=>{state.mileage=[{id:'m1',date:today(),km:100,retour:true}];save();navigate('reports')});
    await page.getByText('Kilometers eigen auto').first().waitFor({state:'attached'});
    await context.close();
  }

  // 9 + 18 (helder.js): one search per list, and a short list keeps only what it needs.
  {
    const {context,page}=await openApp({phone:false});
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('boekuna-helder')),true);
    await page.evaluate(()=>navigate('invoices'));
    await page.locator('.list-toolbar').first().waitFor();
    assert.equal(await page.locator('#globalSearchButton').isVisible(),true,'One search: the magnifier top right');
    assert.equal(await page.locator('#content input[type="search"]').count(),0,'No search field in the page itself');
    assert.equal(await page.locator('.list-toolbar[data-few]').count(),1,'Few rows marked');
    await context.close();
  }

  assert.deepEqual(errors,[],'No page errors');
  console.log('helder ok ('+browserName+')');
}finally{
  await browser.close();server.close();
}
