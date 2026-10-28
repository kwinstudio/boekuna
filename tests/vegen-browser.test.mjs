// Swipe between the phone tabs (vegen.js, Kwin 2026-10-28): left for the next of Overzicht/Inkomsten/Kosten/Bonnen,
// right for the one before. A list row's own swipe (handig.js), sheets, menu pages and the screen edges keep theirs.
// Like handig.js, vegen.js is off for automated browsers; ?vegen=1 turns it on here. Runs in Chromium and WebKit.
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
state.contacts=[{id:'c1',type:'customer',name:'Fictieve Schilders',email:'klant@example.test',address:'Klantstraat 2',postal:'3011AB',city:'Rotterdam'}];
const day=new Date().toISOString().slice(0,10);
state.invoices=[{id:'i1',number:'2026-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:day,dueDate:day,lines:[{desc:'Fictieve dienst',qty:2,unit:100,unitLabel:'uur',vat:21}],payments:[]}];
state.expenses=[{id:'e1',date:day,vendor:'Fictieve Telecom',category:'Telefoon en internet',exVat:30,vatRate:9}];
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

async function openApp(query='?vegen=1&handig=1'){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:browserName==='chromium',locale:'nl-NL'});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.setDefaultTimeout(5000);
  await page.goto(url+'/'+query,{waitUntil:'domcontentloaded'});
  await page.locator('#mainApp').waitFor();
  return {context,page};
}
// A finger: pointer events first, then touch events, the way a phone sends them. Moves in steps of 12 px, 16 ms apart.
async function swipe(page,sel,fromX,dx,{y=null,steps=8,stepMs=16}={}){
  await page.evaluate(async ([sel,fromX,dx,y,steps,stepMs])=>{
    const el=document.querySelector(sel);if(!el)throw new Error('no '+sel);
    const r=el.getBoundingClientRect(),cy=y??r.top+Math.min(r.height/2,40);
    const fire=(type,x)=>{
      const pt={pointerover:0};void pt;
      el.dispatchEvent(new PointerEvent('pointer'+type,{bubbles:true,cancelable:true,pointerType:'touch',pointerId:5,isPrimary:true,clientX:x,clientY:cy}));
      const touch=new Touch({identifier:5,target:el,clientX:x,clientY:cy});
      const tt=type==='down'?'touchstart':type==='move'?'touchmove':'touchend';
      el.dispatchEvent(new TouchEvent(tt,{bubbles:true,cancelable:true,touches:tt==='touchend'?[]:[touch],targetTouches:tt==='touchend'?[]:[touch],changedTouches:[touch]}));
    };
    fire('down',fromX);
    for(let i=1;i<=steps;i++){await new Promise(r=>setTimeout(r,stepMs));fire('move',fromX+dx*i/steps)}
    fire('up',fromX+dx);
  },[sel,fromX,dx,y,steps,stepMs]);
  await page.waitForTimeout(400);
}
const now=page=>page.evaluate(()=>page);

try{
  // Tests and screenshots see the plain app.
  {
    const {context,page}=await openApp('?handig=1');
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('boekuna-vegen')),false,'Off for automated browsers');
    await context.close();
  }
  const canTouch=await (async()=>{const {context,page}=await openApp();const ok=await page.evaluate(()=>{try{new TouchEvent('touchstart',{touches:[new Touch({identifier:1,target:document.body,clientX:1,clientY:1})]});return true}catch(e){return false}});await context.close();return ok})();
  if(!canTouch){
    console.log('Schermen vegen: this '+browserName+' build cannot make touch events; only the build check ran.');
  }else{
    const {context,page}=await openApp();
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('boekuna-vegen')),true);
    assert.equal(await now(page),'dashboard');
    // Right on the first tab: nothing before it, the screen springs back.
    await swipe(page,'#content',200,160);
    assert.equal(await now(page),'dashboard');
    assert.equal(await page.evaluate(()=>document.getElementById('content').style.transform),'','Springs back');
    // Left: the next tabs, one by one.
    await swipe(page,'#content',300,-160);
    assert.equal(await now(page),'invoices');
    assert.equal(await page.locator('#mobileBottomNav [data-mobile-page="invoices"]').getAttribute('aria-current'),'page');
    // A small slow move is not a swipe.
    await swipe(page,'#content .page-head, #content',300,-40,{steps:8,stepMs:40});
    assert.equal(await now(page),'invoices');
    // A swipe that starts at the screen edge is the iPhone's own back gesture.
    await swipe(page,'#content',385,-160);
    assert.equal(await now(page),'invoices');
    // Left on an open invoice row is that row's "Meer", not a new screen.
    const invRow='#content .mobile-card-row[data-bk-invoice="i1"]';
    assert.equal(await page.locator(invRow).count(),1,'The invoice row is on the phone list');
    {
      await swipe(page,invRow,300,-160);
      assert.equal(await now(page),'invoices','The row keeps its own swipe');
      await page.locator('#modalRoot [role=dialog]').waitFor();
      // While a sheet is open the screen behind it does not move.
      await swipe(page,'#content',300,-160);
      assert.equal(await now(page),'invoices');
      await page.evaluate(()=>closeModal());
      await page.waitForFunction(()=>!document.querySelector('#modalRoot [role=dialog]'));
    }
    await swipe(page,'#content',300,-160);
    assert.equal(await now(page),'expenses');
    // Right on a cost row: the row has no action that way, so it goes back a screen.
    const expRow='#content .mobile-card-row[data-bk-expense="e1"]';
    assert.equal(await page.locator(expRow).count(),1,'The cost row is on the phone list');
    await swipe(page,expRow,120,160);
    assert.equal(await now(page),'invoices');
    await swipe(page,'#content',300,-160);
    await swipe(page,'#content',300,-160);
    assert.equal(await now(page),'documents');
    // Bonnen is the last tab.
    await swipe(page,'#content',300,-160);
    assert.equal(await now(page),'documents');
    // A quick flick is enough.
    await swipe(page,'#content',200,50,{steps:3,stepMs:16});
    assert.equal(await now(page),'expenses');
    // Pages from the menu stay put.
    await page.evaluate(()=>navigate('trips'));
    await swipe(page,'#content',300,-160);
    assert.equal(await now(page),'trips');
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('Schermen vegen: OK ('+browserName+')');
}finally{
  await browser.close();server.close();
}
