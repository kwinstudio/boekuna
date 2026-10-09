// App motion (motion.js/.css): page entrance, counting totals, success check, "Betaald" pop.
// Motion is off for automated browsers; ?motion=1 turns it on here. Runs in Chromium and WebKit.
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
state.contacts=[{id:'c1',type:'customer',name:'Fictieve klant',email:'klant@example.test',address:'Klantstraat 2',postal:'3011AB',city:'Rotterdam'}];
const motionDay=new Date().toISOString().slice(0,10);
state.invoices=[{id:'i1',number:'2026-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:motionDay,dueDate:motionDay,lines:[{desc:'Fictieve dienst',qty:12,unit:100,unitLabel:'uur',vat:21}],payments:[]}];
state.expenses=[{id:'e1',date:motionDay,vendor:'Kantoorwinkel',category:'office',exVat:50,vatRate:21}];
documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;window.confirm=()=>true;enterApp();`;
const html=generated.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;').replace(/initAuth\(\);(?![\s\S]*initAuth\(\);)/,boot);
const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
const server=http.createServer((req,res)=>{
  const p=new URL(req.url,'http://localhost').pathname;
  if(p.startsWith('/assets/')){const f=path.resolve('dist/app'+p);if(fs.existsSync(f)){res.setHeader('Content-Type',types[path.extname(f)]||'image/png');return res.end(fs.readFileSync(f))}res.writeHead(404);return res.end()}
  res.setHeader('Content-Type','text/html');res.end(html);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
const browser=await (browserName==='webkit'?webkit:chromium).launch();
const errors=[];

async function openApp({width=1440,height=900,motion=true,reducedMotion='no-preference'}={}){
  const context=await browser.newContext({viewport:{width,height},locale:'nl-NL',reducedMotion});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.setDefaultTimeout(5000);
  await page.goto(url+(motion?'/?motion=1':'/'),{waitUntil:'domcontentloaded'});
  await page.locator('#mainApp').waitFor();
  return {context,page};
}
const kpis=page=>page.evaluate(()=>[...document.querySelectorAll('#content .metric-value')].map(e=>e.textContent));

try{
  // Tests and screenshots see the still app.
  const still=await openApp({motion:false});
  assert.equal(await still.page.evaluate(()=>document.documentElement.classList.contains('boekuna-motion')),false,'No motion for automated browsers');
  const finalValues=await kpis(still.page);
  assert.ok(finalValues.some(v=>/1\.200,00/.test(v)),'Fixture shows a real total: '+finalValues.join(' | '));
  await still.context.close();

  // Desktop: totals count up and end on exactly the same text; a new page eases in once.
  const {context,page}=await openApp();
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('boekuna-motion')),true);
  await page.waitForFunction(values=>JSON.stringify([...document.querySelectorAll('#content .metric-value')].map(e=>e.textContent))===JSON.stringify(values),finalValues,{timeout:3000});
  await page.evaluate(()=>navigate('invoices'));
  assert.equal(await page.locator('#content.motion-enter').count(),1,'New page eases in');
  await page.waitForFunction(()=>!document.getElementById('content').classList.contains('motion-enter'),null,{timeout:3000});
  await page.evaluate(()=>render());
  assert.equal(await page.locator('#content.motion-enter').count(),0,'Re-rendering the same page stays still');

  // Registering a payment pops the status that just became "Betaald"; the toast gets a check mark.
  await page.evaluate(()=>{const i=state.invoices[0];i.payments=[{id:'p1',date:i.issueDate,amount:1452,method:'bank'}];i.status='paid';render();toast('Betaling opgeslagen')});
  assert.ok(await page.locator('#content .badge.motion-paid',{hasText:'Betaald'}).count()>=1,'Paid status pops');
  assert.equal(await page.locator('#toastRoot .toast.motion-success .motion-check').count(),1,'Success toast has a check');
  await page.evaluate(()=>toast('Kon niet opslaan'));
  assert.equal(await page.locator('#toastRoot .toast.motion-success').count(),1,'Error toasts get no check');
  await context.close();

  // Phone: the Nieuw menu stays the centred pop-up it was; motion must not move it to the bottom.
  const phone=await openApp({width:390,height:844});
  await phone.page.locator('#quickNew').click();
  await phone.page.locator('#modalRoot .quick-action-modal').waitFor();
  await phone.page.waitForTimeout(450);
  const box=await phone.page.locator('#modalRoot .quick-action-modal').boundingBox();
  assert.ok(box.y>40&&box.y+box.height<804,'Nieuw pop-up stays in the middle: '+JSON.stringify(box));
  assert.equal(await phone.page.evaluate(()=>getComputedStyle(document.querySelector('#modalRoot .quick-action-modal')).animationName.includes('boekuna-motion')),false,'No motion animation on the pop-up');
  assert.equal(await phone.page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
  await phone.context.close();

  // Reduced motion: no counting, values are final straight away.
  const calm=await openApp({reducedMotion:'reduce'});
  assert.deepEqual(await kpis(calm.page),finalValues,'Reduced motion shows final totals at once');
  assert.equal(await calm.page.evaluate(()=>getComputedStyle(document.getElementById('content')).animationName),'none');
  await calm.context.close();

  assert.deepEqual(errors,[]);
  console.log('Motion browser test passed ('+browserName+')');
}finally{
  await browser.close();
  server.close();
}
