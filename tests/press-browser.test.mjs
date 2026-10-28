// Press feel (press.js/.css, Kwin 2026-10-26): a button sinks under a finger, springs back, and a real finger tap gives one
// light tick (iPhone app bridge, else navigator.vibrate). Also: the app fonts are the small Latin subsets.
// Like motion, the press is off for automated browsers; ?motion=1 turns it on here. Runs in Chromium and WebKit.
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
const pressDay=new Date().toISOString().slice(0,10);
state.invoices=[{id:'i1',number:'2026-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:pressDay,dueDate:pressDay,lines:[{desc:'Fictieve dienst',qty:12,unit:100,unitLabel:'uur',vat:21}],payments:[]}];
state.expenses=[{id:'e1',date:pressDay,vendor:'Kantoorwinkel',category:'office',exVat:50,vatRate:21}];
documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;window.confirm=()=>true;enterApp();`;
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

// Small fonts: Latin subsets with only the weight axis.
assert.ok(fs.statSync('dist/app/assets/app-inter-var.woff2').size<100_000,'Inter stays a small subset');
assert.ok(fs.statSync('dist/app/assets/app-space-grotesk-var.woff2').size<40_000,'Space Grotesk stays a small subset');
assert.ok(!fs.existsSync('dist/app/assets/app-InterVariable.woff2')&&!fs.existsSync('dist/app/assets/app-SpaceGrotesk-Variable.ttf'),'The big font files are gone');

async function openApp({motion=true,reducedMotion='no-preference',bridge=false}={}){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,locale:'nl-NL',reducedMotion});
  await context.addInitScript(bridge=>{
    window.__ticks=[];
    if(bridge)window.webkit={messageHandlers:{boekunaHaptic:{postMessage:m=>window.__ticks.push('native:'+m)}}};
    navigator.vibrate=ms=>{window.__ticks.push('vibrate:'+ms);return true};
  },bridge);
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.setDefaultTimeout(5000);
  await page.goto(url+(motion?'/?motion=1':'/'),{waitUntil:'domcontentloaded'});
  await page.locator('#mainApp').waitFor();
  return {context,page};
}
const scaleOf=el=>el.evaluate(e=>getComputedStyle(e).scale);
const pointer=(el,type)=>el.evaluate((e,type)=>e.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'touch',isPrimary:true})),type);
const ticks=page=>page.evaluate(()=>window.__ticks);

try{
  // Tests and screenshots see the still app.
  const still=await openApp({motion:false});
  assert.equal(await still.page.evaluate(()=>document.documentElement.classList.contains('boekuna-press')),false,'No press feel for automated browsers');
  const fonts=await still.page.evaluate(async()=>{await document.fonts.ready;await Promise.all([document.fonts.load('400 16px "Boekuna Inter"'),document.fonts.load('600 16px "Boekuna Space"')]);return [document.fonts.check('400 16px "Boekuna Inter"'),document.fonts.check('600 16px "Boekuna Space"')]});
  assert.deepEqual(fonts,[true,true],'Both app fonts load');
  await still.context.close();

  const {context,page}=await openApp();
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('boekuna-press')),true);
  const button=page.locator('#content .r1d-action').first();
  await button.waitFor();
  // Finger down: the button sinks and darkens a little; finger up: it springs back to its own size.
  await pointer(button,'pointerdown');
  await page.waitForTimeout(160);
  assert.equal(await button.evaluate(e=>e.classList.contains('is-pressed')),true);
  const down=Number(await scaleOf(button));
  assert.ok(down>0.9&&down<1,'Pressed button sinks a little: '+down);
  assert.match(await button.evaluate(e=>getComputedStyle(e).filter),/brightness/);
  await pointer(button,'pointerup');
  await page.waitForFunction(e=>!e.classList.contains('is-pressed')&&!e.classList.contains('is-released'),await button.elementHandle(),{timeout:2000});
  assert.ok(['none','1'].includes(await scaleOf(button)),'Back to its own size');
  // A touch that turns into a scroll (pointercancel) never leaves a row pressed.
  await pointer(button,'pointerdown');
  await pointer(button,'pointercancel');
  await page.waitForFunction(e=>!e.classList.contains('is-pressed'),await button.elementHandle(),{timeout:2000});
  // A pointerdown/up without a click (no real tap) gives no tick.
  assert.deepEqual(await ticks(page),[]);

  // A real finger tap ticks once; a mouse click does not.
  await page.evaluate(()=>{window.__ticks=[]});
  const box=await button.boundingBox();
  await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
  await page.waitForTimeout(150);
  assert.deepEqual(await ticks(page),['vibrate:8'],'One light tick on a finger tap');
  await page.evaluate(()=>{if(typeof closeModal==='function')closeModal();window.__ticks=[]});
  await page.evaluate(()=>navigate('invoices'));
  await page.mouse.click(5,5);
  const tab=page.locator('.mobile-bottom-nav-item').first();
  await tab.click();
  assert.deepEqual(await ticks(page),[],'No tick for a mouse click');
  await context.close();

  // In the iPhone app the native bridge gives the tick instead of vibrate.
  const app=await openApp({bridge:true});
  const action=app.page.locator('#content .r1d-action').first();
  await action.waitFor();
  const abox=await action.boundingBox();
  await app.page.touchscreen.tap(abox.x+abox.width/2,abox.y+abox.height/2);
  await app.page.waitForTimeout(150);
  assert.deepEqual(await ticks(app.page),['native:tap']);
  await app.context.close();

  // Reduced motion: no sinking or springing, the tick stays.
  const calm=await openApp({reducedMotion:'reduce'});
  const calmButton=calm.page.locator('#content .r1d-action').first();
  await calmButton.waitFor();
  await pointer(calmButton,'pointerdown');
  await calm.page.waitForTimeout(160);
  assert.ok(['none','1'].includes(await scaleOf(calmButton)),'No sinking with reduced motion');
  await calm.context.close();

  assert.deepEqual(errors,[]);
  console.log('Press feel ('+browserName+'): sink, spring back, one tick per finger tap, native bridge, reduced motion, small fonts.');
}finally{
  await browser.close();
  server.close();
}
