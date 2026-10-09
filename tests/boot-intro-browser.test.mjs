// Boekuna intro (app-assets/boot-intro.*): plays only on a real start, leaves the moment the app is
// ready (no minimum time), never stays longer than 2.5 s as an intro, and turns into a quiet loading
// state when the app is slow. Automated browsers get a still intro; ?intro=1 turns the intro on here.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';

execFileSync(process.execPath,['scripts/build-app.mjs']);
const generated=fs.readFileSync('dist/app/index.html','utf8');
const browserName=process.env.BOOKUNA_BROWSER||'chromium';
const evidence=process.env.BOOT_INTRO_EVIDENCE||'';
if(evidence)fs.mkdirSync(evidence,{recursive:true});

// The intro markup is the first thing in <body>, inlined with its CSS and JS.
const bodyStart=generated.indexOf('<body>\n');
assert.ok(generated.indexOf('id="appBootstrap"')-bodyStart<40,'Intro must be the first element in <body>');
assert.ok(generated.includes('<style id="boekuna-boot-intro-style">'),'Intro CSS is inlined in <head>');
assert.ok(/<script id="boekuna-boot-intro">\S/.test(generated),'Intro JS is inlined right after the markup');
assert.ok(!/BOOTSTRAP_MIN_VISIBLE_MS/.test(generated),'No minimum display time');

const appBoot=`currentUser={...TEST_USER,email:'qa@example.test'};state=structuredClone(DEFAULT);
for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
state.company={...state.company,name:'Fictieve QA BV',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',kvk:'12345678',vat:'NL123456789B01',email:'qa@example.test',iban:'NL91ABNA0417164300'};
documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;`;
// ?ready=<ms> simulates how long session restore takes; ?auth=login opens the login screen instead.
const boot=`setBootstrapVisible(true);(function(){const q=new URL(location.href).searchParams,ms=Number(q.get('ready')||0);
setTimeout(()=>{if(q.get('auth')==='login'){showAuth('login');return}${appBoot}enterApp()},ms)})();`;
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

async function open({width=390,height=844,query='intro=1',reducedMotion='no-preference',colorScheme='light',assetDelay=0}={}){
  const context=await browser.newContext({viewport:{width,height},locale:'nl-NL',reducedMotion,colorScheme});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  if(assetDelay)await page.route('**/assets/**',async route=>{await new Promise(r=>setTimeout(r,assetDelay));await route.continue()});
  await page.goto(url+'/?'+query,{waitUntil:'commit'});
  await page.locator('#appBootstrap').waitFor({state:'attached'});
  return {context,page};
}
const intro=page=>page.evaluate(()=>({...window.BoekunaIntro,hidden:document.getElementById('appBootstrap').hidden,classes:document.getElementById('appBootstrap').className}));
const markBox=page=>page.locator('.boot-intro-mark').boundingBox();
const shot=async(page,name)=>{if(evidence)await page.screenshot({path:path.join(evidence,name+'-'+browserName+'.png')})};

try{
  // Fast start with an existing session: the intro leaves as soon as the app is ready.
  {
    const {context,page}=await open({query:'intro=1&ready=150'});
    const themeColor=()=>page.evaluate(()=>document.querySelector('meta[name="theme-color"]').getAttribute('content'));
    assert.equal(await themeColor(),'#F6F7F8','Browser bar / status strip matches the intro');
    await page.locator('#mainApp').waitFor();
    await page.waitForFunction(()=>document.getElementById('appBootstrap').hidden,null,{timeout:3000});
    const s=await intro(page);
    assert.equal(s.mode,'playing');
    assert.ok(s.hiddenMs-s.readyMs<=360,'No extra wait after ready: '+JSON.stringify(s));
    assert.ok(s.hiddenMs<2500,'Fast start leaves well within 2.5 s: '+s.hiddenMs);
    assert.equal(await themeColor(),'#FFFFFF','App colour is back after the intro');
    await context.close();
  }

  // Normal start (~1.9 s session restore): full choreography, gone before 2.5 s.
  for(const [label,width,height] of [['iphone-se',320,568],['iphone',390,844],['android',412,915],['desktop',1440,900]]){
    const {context,page}=await open({width,height,query:'intro=1&ready=1900'});
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.boot-intro-word').evaluate(e=>Number(getComputedStyle(e).opacity)),0,'Calm background first');
    await page.waitForTimeout(1050);
    await shot(page,'intro-'+label+'-1200ms');
    const box=await markBox(page);
    const cx=box.x+box.width/2,cy=box.y+box.height/2;
    assert.ok(Math.abs(cx-width/2)<=1.5&&Math.abs(cy-height/2)<=1.5,label+' wordmark centred: '+JSON.stringify(box));
    assert.ok(box.width>=160&&box.width<=220,label+' wordmark width '+box.width);
    assert.ok(box.x>=16,label+' wordmark keeps a margin');
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.boot-intro-word').evaluate(e=>getComputedStyle(e).opacity),'1');
    assert.equal(await page.locator('.boot-intro-dot').evaluate(e=>getComputedStyle(e).opacity),'1');
    await shot(page,'intro-'+label+'-rest');
    await page.locator('#mainApp').waitFor();
    await page.waitForFunction(()=>document.getElementById('appBootstrap').hidden,null,{timeout:3000});
    const s=await intro(page);
    assert.ok(s.hiddenMs<=2500,label+' intro gone by 2.5 s: '+JSON.stringify(s));
    assert.ok(!s.classes.includes('is-waiting'),label+' never reached the waiting state');
    await context.close();
  }

  // Slow start: after 2.5 s the intro becomes a quiet loading state; the logo does not move.
  {
    const {context,page}=await open({query:'intro=1&ready=4200'});
    await page.waitForTimeout(1900);
    const before=await markBox(page);
    assert.equal(await page.locator('.boot-intro-status').isVisible(),false,'No loading text during the intro');
    await page.waitForFunction(()=>document.getElementById('appBootstrap').classList.contains('is-waiting'),null,{timeout:1500});
    const at=await page.evaluate(()=>performance.now()-window.BoekunaIntro.startedAt);
    assert.ok(at>=2450&&at<=2700,'Waiting state at 2.5 s: '+at);
    await page.waitForTimeout(450);
    assert.equal(await page.locator('.boot-intro-status').isVisible(),true);
    assert.match(await page.locator('.boot-intro-status').innerText(),/Je administratie wordt geladen/);
    assert.deepEqual(await markBox(page),before,'No layout shift when the loading text appears');
    assert.equal(await page.locator('.boot-intro-retry').isVisible(),false,'Retry only when it is really slow');
    await shot(page,'intro-slow-waiting');
    await page.locator('#mainApp').waitFor({timeout:4000});
    await page.waitForFunction(()=>document.getElementById('appBootstrap').hidden,null,{timeout:2000});
    await context.close();
  }

  // Very slow: after 10 s a retry button appears.
  {
    const {context,page}=await open({query:'intro=1&ready=60000'});
    await page.waitForFunction(()=>document.getElementById('appBootstrap').classList.contains('is-slow'),null,{timeout:11000});
    assert.equal(await page.getByRole('button',{name:'Opnieuw laden'}).isVisible(),true);
    await shot(page,'intro-very-slow');
    await context.close();
  }

  // No session: the login screen takes over, without a white or empty frame in between.
  {
    const {context,page}=await open({query:'intro=1&ready=900&auth=login'});
    await page.locator('#authForm').waitFor();
    await page.waitForFunction(()=>document.getElementById('appBootstrap').hidden,null,{timeout:2000});
    assert.equal(await page.locator('#loginEmail').isVisible(),true);
    await context.close();
  }

  // Slow network: assets arrive late, the intro still shows and the app still opens.
  {
    const {context,page}=await open({query:'intro=1&ready=0',assetDelay:900});
    await page.locator('#mainApp').waitFor({timeout:15000});
    await page.waitForFunction(()=>document.getElementById('appBootstrap').hidden,null,{timeout:4000});
    await context.close();
  }

  // Reduced motion: a still wordmark, no animations, instant hand-over.
  {
    const {context,page}=await open({query:'intro=1&ready=800',reducedMotion:'reduce'});
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.boot-intro-word').evaluate(e=>getComputedStyle(e).opacity),'1');
    assert.equal(await page.evaluate(()=>document.getElementById('appBootstrap').getAnimations({subtree:true}).length),0);
    await shot(page,'intro-reduced-motion');
    await page.locator('#mainApp').waitFor();
    await page.waitForFunction(()=>document.getElementById('appBootstrap').hidden,null,{timeout:500});
    await context.close();
  }

  // Dark mode follows the app theme, so there is no white flash for dark users.
  {
    const {context,page}=await open({query:'intro=1&ready=1500',colorScheme:'dark'});
    assert.equal(await page.locator('#appBootstrap').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(21, 25, 28)');
    await page.waitForTimeout(1300);
    await shot(page,'intro-dark');
    await context.close();
  }

  // A reload in the same tab is not a new app start: still wordmark, no choreography.
  {
    const {context,page}=await open({query:'intro=1&ready=200'});
    await page.locator('#mainApp').waitFor();
    await page.reload({waitUntil:'commit'});
    await page.locator('#appBootstrap').waitFor({state:'attached'});
    const s=await intro(page);
    assert.equal(s.mode,'repeat','Reload shows the still wordmark');
    assert.equal(await page.locator('.boot-intro-word').evaluate(e=>getComputedStyle(e).opacity),'1');
    await context.close();
  }

  // Automated browsers (all other tests): still intro that disappears instantly.
  {
    const {context,page}=await open({query:'ready=100'});
    await page.locator('#mainApp').waitFor();
    const s=await intro(page);
    assert.equal(s.mode,'still');
    assert.equal(s.hidden,true);
    assert.equal(s.hiddenMs,s.readyMs);
    // Signing out and in again re-uses the same screen without a new intro.
    await page.evaluate(()=>setBootstrapVisible(true));
    assert.equal(await page.locator('#appBootstrap').isVisible(),true);
    await page.evaluate(()=>setBootstrapVisible(false));
    assert.equal(await page.locator('#appBootstrap').isVisible(),false);
    await context.close();
  }

  assert.deepEqual(errors,[],'No page errors');
  console.log('boot intro '+browserName+': ok');
}finally{
  await browser.close();
  server.close();
}
