// Psychologische trucjes (gevoel.js/.css, Kwin 2026-11-01): the scan shows its steps with a bar that speeds up, how long
// things take, one calm line on the phone overview (good news first, quarter bar, fresh start, bonnenmoment), what a bon or a
// trip is worth in the save toast, a calm end after sending an invoice. In the app itself: the start list begins with a
// done step (5), money/num use one formatter each (4) and an IBAN shows in blocks of 4 (12).
// Like motion, press and handig, gevoel.js is off for automated browsers; ?gevoel=1 turns it on here. Chromium and WebKit.
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
state.company={...state.company,name:'Fictieve QA BV',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',kvk:'12345678',vat:'NL123456789B01',email:'qa@example.test',iban:'NL91ABNA0417164300'};
state.contacts=[{id:'c1',type:'customer',name:'Fictieve Schilders',email:'klant@example.test',address:'Klantstraat 2',postal:'3011AB',city:'Rotterdam'},{id:'c2',type:'customer',name:'Albert Voorbeeld',email:'av@example.test',address:'Laan 3',postal:'3011AC',city:'Delft'}];
const day=new Date().toISOString().slice(0,10),before=new Date(Date.now()-5*864e5).toISOString().slice(0,10);
state.invoices=[{id:'i1',number:'2026-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:before,dueDate:day,lines:[{desc:'Fictieve dienst',qty:12,unit:100,unitLabel:'uur',vat:21}],payments:[]},{id:'i2',number:'2026-0002',customerId:'c2',status:'sent',kind:'invoice',issueDate:day,dueDate:day,lines:[{desc:'Advies',qty:2,unit:90,unitLabel:'uur',vat:21}],payments:[]}];
state.expenses=[{id:'e1',date:day,vendor:'Fictieve Telecom',category:'Telefoon en internet',exVat:30,vatRate:9},{id:'e2',date:day,vendor:'Kantoorwinkel',category:'office',exVat:50,vatRate:21}];
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

async function openApp({phone=true,gevoel=true}={}){
  const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1280,height:900},hasTouch:phone,isMobile:phone&&browserName==='chromium',locale:'nl-NL'});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.setDefaultTimeout(5000);
  await page.goto(url+(gevoel?'/?gevoel=1':'/'),{waitUntil:'domcontentloaded'});
  await page.locator('#mainApp').waitFor();
  return {context,page};
}

try{
  // Tests and screenshots see the plain app.
  {
    const {context,page}=await openApp({gevoel:false});
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('boekuna-gevoel')),false,'Off for automated browsers');
    assert.equal(await page.locator('.gv-calm').count(),0);
    // 4 + 12 live in the app itself: one formatter, IBAN in blocks.
    assert.equal(await page.evaluate(()=>money(-60.5)),'− € 60,50');
    assert.equal(await page.evaluate(()=>num(1234.5)),'1.234,5');
    assert.equal(await page.evaluate(()=>ibanBlocks('nl91abna0417164300')),'NL91 ABNA 0417 1643 00');
    assert.equal(await page.evaluate(()=>ibanBlocks('geen iban')),'geen iban');
    await context.close();
  }

  // 5: the start list begins with a step that is already done, and a bar that is never empty.
  {
    const {context,page}=await openApp({gevoel:false});
    await page.evaluate(()=>{for(const k of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements'])state[k]=[];render()});
    await page.locator('.dashboard-start').waitFor();
    assert.equal(await page.locator('.dashboard-start-step.is-given').count(),1);
    assert.match(await page.locator('.dashboard-start-step.is-given').innerText(),/Account gemaakt/);
    assert.match(await page.locator('.dashboard-start-count').innerText(),/2 van 4 klaar/);
    assert.equal(await page.locator('.dashboard-start-step.is-done').count(),1,'Step 1 (company details) is still the only is-done step');
    await context.close();
  }

  // 11 + 6 + 3: one calm line in the band. Nothing open: good news. Open bank lines: the quarter bar and a time.
  {
    const {context,page}=await openApp();
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('boekuna-gevoel')),true);
    await page.evaluate(()=>{window.__gevoelNow='2026-11-12T10:00:00';render()});
    const clear=page.locator('.r1d-hero + .gv-calm');
    await clear.waitFor();
    assert.match(await clear.innerText(),/Je bent helemaal bij/);
    assert.equal(await page.locator('.gv-calm-plan').count(),1,'Offers a fixed moment when nothing needs you');
    await page.evaluate(()=>{state.transactions=[{id:'t1',date:'2026-11-10',amount:-20,description:'Shell',status:'unmatched'},{id:'t2',date:'2026-11-10',amount:-12,description:'NS',status:'unmatched'}];render()});
    const text=await page.locator('.gv-calm').innerText();
    assert.match(text,/Q4 · 2 van 4 geregeld/);
    assert.match(text,/Nog 2 bankregels, ongeveer 1 minuut/);
    assert.equal(await page.locator('.gv-calm-meter i').getAttribute('style'),'width:50%');
    // 8: first days of a month, a clean slate.
    await page.evaluate(()=>{window.__gevoelNow='2026-12-02T09:00:00';render()});
    assert.match(await page.locator('.gv-calm').innerText(),/Nieuwe maand, schone lei[\s\S]*November even afronden\?/);
    await page.evaluate(()=>{window.__gevoelNow='2027-01-05T09:00:00';render()});
    assert.match(await page.locator('.gv-calm').innerText(),/Nieuw kwartaal, schone lei[\s\S]*Q4 even afronden\?/);
    await context.close();
  }

  // 9: pick a fixed moment; on that day it heads the overview, and the calendar file repeats weekly.
  {
    const {context,page}=await openApp();
    await page.evaluate(()=>{window.__gevoelNow='2026-11-12T10:00:00';render()});
    await page.locator('.gv-calm-plan').click();
    await page.locator('#gvMomentForm').waitFor();
    await page.locator('.gv-day[data-day="5"]').click();
    await page.locator('#gvMomentForm [name=time]').fill('16:00');
    await page.getByRole('button',{name:'Opslaan'}).click();
    assert.deepEqual(await page.evaluate(()=>state.meta.bonnenmoment),{day:5,time:'16:00'});
    await page.evaluate(()=>{window.__gevoelNow='2026-11-13T16:30:00';render()});
    assert.match(await page.locator('.gv-calm').innerText(),/Het is je bonnenmoment/);
    await page.evaluate(()=>{window.__gevoelNow='2026-11-13T15:30:00';render()});
    assert.doesNotMatch(await page.locator('.gv-calm').innerText(),/bonnenmoment/,'Not before the chosen time');
    await context.close();
  }

  // 1 + 2 + 3: a bon being read shows its steps, a moving bar and how long it takes; when done, a toast with what was found.
  {
    const {context,page}=await openApp();
    await page.evaluate(()=>{documentProcessingJobs=[{id:'j1',client_ref:'r1',batch_id:'b1',state:'processing',phase:'read',file_name:'bon.jpg',created_at:new Date(Date.now()-500).toISOString(),attempt:1,max_attempts:3}];navigate('documents')});
    await page.locator('.gv-scan').waitFor();
    assert.match(await page.locator('.document-processing-board-head p').innerText(),/Bezig met lezen, meestal binnen 5 seconden/);
    assert.match(await page.locator('.gv-steps').innerText(),/Foto ontvangen[\s\S]*Tekst lezen[\s\S]*Leverancier zoeken[\s\S]*Bedragen en btw narekenen/);
    assert.equal(await page.locator('.gv-steps li.is-done').count(),1);
    const w1=await page.locator('.gv-bar').getAttribute('aria-valuenow');
    await page.waitForTimeout(1800);
    const w2=await page.locator('.gv-bar').getAttribute('aria-valuenow');
    assert.ok(Number(w2)>Number(w1)&&Number(w2)<=92,'The bar moves on but never claims done: '+w1+' → '+w2);
    assert.ok(await page.locator('.gv-steps li.is-done').count()>=2,'Reading moves on to the next step');
    await page.evaluate(()=>{documentProcessingJobs=[{id:'j1',client_ref:'r1',batch_id:'b1',state:'ready',file_name:'bon.jpg',created_at:new Date().toISOString(),result:{analysis:{documentType:'receipt',supplier:{name:'Albert Heijn'},invoice:{date:'2026-11-01'},amounts:{total:24.2}}}}];render()});
    await page.locator('#toastRoot .gv-found').waitFor({timeout:3000});
    assert.match(await page.locator('#toastRoot').innerText(),/Bon gelezen[\s\S]*Albert Heijn ✓ · Datum ✓ · €\s24,20/);
    await context.close();
  }

  // 7: saving a cost shows the btw you get back; a trip shows what it is worth; not under the KOR.
  {
    const {context,page}=await openApp();
    const add=(gross,kor)=>page.evaluate(([gross,kor])=>{state.company.kor=kor;const id='new'+Math.random();state.expenses.unshift({id,vendor:'Albert Heijn',date:'2026-11-01',category:'office',exVat:gross/1.21,vatAmount:Math.round(gross/1.21*0.21*100)/100,gross,vatRate:21,taxTreatment:kor?'kor':'standard'});toast('Kosten opgeslagen');return document.querySelector('#toastRoot .toast:last-child .gv-reward')?.textContent||''},[gross,kor]);
    assert.equal(await add(24.2,false),'+ € 4,20 btw terug');
    assert.equal(await add(24.2,true),'','No btw back under the KOR');
    const trip=await page.evaluate(()=>{state.mileage.unshift({id:'m9',date:'2026-11-01',km:40});toast('Rit opgeslagen');return document.querySelector('#toastRoot .toast:last-child .gv-reward')?.textContent||''});
    assert.equal(trip,'€ 9,20 aftrekbaar');
    const other=await page.evaluate(()=>{toast('Gekopieerd');return document.querySelector('#toastRoot .toast:last-child .gv-reward')?.textContent||''});
    assert.equal(other,'');
    await context.close();
  }

  // 10: sending an invoice ends calmly: who, how much, how this customer usually pays. The first one says so.
  {
    const {context,page}=await openApp();
    await page.evaluate(()=>{state.invoices.forEach(i=>delete i.lastSentAt);confirmInvoiceShareSent(state.invoices[0].id,'mail')});
    const end=page.locator('#gvEnd');await end.waitFor();
    assert.match(await end.innerText(),/Je eerste factuur is de deur uit/);
    await end.click();await end.waitFor({state:'detached'});
    await page.evaluate(()=>{const c=state.invoices[0].customerId;state.invoices.push({id:'p1',number:'2026-0101',customerId:c,status:'paid',kind:'invoice',issueDate:'2026-09-01',dueDate:'2026-09-15',lines:[{desc:'x',qty:1,unit:100,vat:21}],payments:[{id:'a',date:'2026-09-08',amount:121}]},{id:'p2',number:'2026-0102',customerId:c,status:'paid',kind:'invoice',issueDate:'2026-10-01',dueDate:'2026-10-15',lines:[{desc:'x',qty:1,unit:100,vat:21}],payments:[{id:'b',date:'2026-10-10',amount:121}]});confirmInvoiceShareSent(state.invoices[0].id,'mail')});
    await end.waitFor();
    assert.match(await end.innerText(),/Verstuurd naar Fictieve Schilders[\s\S]*Fictieve Schilders betaalt meestal binnen 9 dagen/);
    await context.close();
  }

  assert.deepEqual(errors,[],'No page errors');
  console.log('gevoel ok ('+browserName+')');
}finally{
  await browser.close();server.close();
}
