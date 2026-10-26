// Netjes en snel (Kwin 2026-10-26), phone only: pages and buttons move fast, a sheet's body is painted whole while it slides in
// (iPhone left its bottom empty until touched), and small details keep the one look.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';

execFileSync(process.execPath,['scripts/build-app.mjs']);
const generated=fs.readFileSync('dist/app/index.html','utf8');
const browserName=process.env.BOOKUNA_BROWSER||'chromium';
const iso=n=>{const d=new Date();d.setDate(d.getDate()-n);return d.toISOString().slice(0,10)};
const boot=`currentUser={...TEST_USER,email:'qa@example.test',supabaseUser:{user_metadata:{first_name:'Kwin'}}};state=structuredClone(DEFAULT);
for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
state.company={...state.company,name:'Fictieve QA BV',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',kvk:'12345678',vat:'NL123456789B01',email:'qa@example.test',iban:'NL91ABNA0417164300'};
state.contacts=[{id:'c1',type:'customer',name:'Bakkerij de Vries',email:'info@bakkerij.test',address:'Klantstraat 2',postal:'3011AB',city:'Rotterdam'}];
state.hours=[{id:'h1',date:'${iso(2)}',hours:6,description:'Ontwerp',customerId:'c1'}];
state.invoices=[{id:'i1',number:'2026-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:'${iso(45)}',dueDate:'${iso(15)}',lines:[{desc:'Fictieve dienst',qty:10,unit:100,unitLabel:'uur',vat:21}],payments:[]}];
documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;window.confirm=()=>true;enterApp();`;
const html=generated.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;').replace(/initAuth\(\);(?![\s\S]*initAuth\(\);)/,boot);
const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  const p=new URL(req.url,'http://localhost').pathname;
  if(p.startsWith('/assets/')){const f=path.resolve('dist/app'+p);if(fs.existsSync(f)){res.setHeader('Content-Type',types[path.extname(f)]||'image/png');return res.end(fs.readFileSync(f))}res.writeHead(404);return res.end()}
  res.setHeader('Content-Type','text/html');res.end(html);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
const browser=await (browserName==='webkit'?webkit:chromium).launch();
const errors=[];
const text=async loc=>(await loc.innerText()).replace(/\s+/g,' ').trim();

async function openApp(query=''){
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'nl-NL'});
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.fulfill({status:404,body:''}));
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.setDefaultTimeout(5000);
  await page.goto(url+'/'+query,{waitUntil:'domcontentloaded'});
  await page.locator('#mainApp').waitFor();
  return {context,page};
}

const seconds=v=>Math.max(...String(v).split(',').map(s=>s.trim().endsWith('ms')?parseFloat(s)/1000:parseFloat(s)));
try{
  {
    const {context,page}=await openApp('?motion=1');
    // Fast: a new page is there in under 0.2 s, rows come with it (no stagger), the press springs back quickly.
    await page.evaluate(()=>navigate('invoices'));
    await page.locator('#content.motion-enter').waitFor({state:'attached'});
    const enter=await page.evaluate(()=>{const c=getComputedStyle(document.getElementById('content'));const row=document.querySelector('#content .mobile-card-row');return {d:c.animationDuration,rowDelay:row?getComputedStyle(row).animationDelay:'0s',rowAnim:row?getComputedStyle(row).animationName:'none'}});
    assert.ok(seconds(enter.d)<=0.2,'Page enter '+enter.d);
    assert.equal(enter.rowAnim,'none','Rows have no own entrance: '+JSON.stringify(enter));
    // Sheets slide up in 0.3 s; while sliding, the body is not a scroll area yet, after that it scrolls again.
    await page.evaluate(()=>navigate('dashboard'));await page.waitForTimeout(300);
    await page.evaluate(()=>newExpense());
    const during=await page.evaluate(()=>{const m=document.querySelector('#modalRoot .modal');return {cls:m.classList.contains('sheet-entering'),ov:getComputedStyle(m.querySelector('.modal-body')).overflowY,d:getComputedStyle(m).animationDuration}});
    assert.deepEqual({cls:during.cls,ov:during.ov},{cls:true,ov:'hidden'},'Entering sheet: '+JSON.stringify(during));
    assert.ok(seconds(during.d)<=0.3,'Sheet slide '+during.d);
    await page.waitForFunction(()=>!document.querySelector('#modalRoot .modal.sheet-entering'),null,{timeout:2000});
    assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#modalRoot .modal-body')).overflowY),'auto','The sheet scrolls once it is in place');
    // Btw chips: round, no white square behind them.
    const chip=await page.evaluate(()=>{const l=document.querySelector('#modalRoot .expense-form label.choice-chip'),m=document.querySelector('#modalRoot .expense-form .choice-chip-more');return [getComputedStyle(l).backgroundColor,m?getComputedStyle(m).backgroundColor:'rgba(0, 0, 0, 0)']});
    assert.deepEqual(chip,['rgba(0, 0, 0, 0)','rgba(0, 0, 0, 0)']);
    await page.evaluate(()=>closeModal());
    await context.close();
  }
  {
    const {context,page}=await openApp();
    // Kosten: the band says what the number is instead of "Kosten" twice.
    await page.evaluate(()=>navigate('expenses'));await page.waitForTimeout(200);
    assert.equal(await text(page.locator('#content .kpi-hero .product-kpi-label')),'Uitgegeven excl. btw');
    // Filter chips that run off the screen fade out.
    assert.notEqual(await page.evaluate(()=>{const c=getComputedStyle(document.querySelector('#content .list-chip-row'));return c.maskImage||c.webkitMaskImage}),'none');
    // Overview: the hours pill has a clock, keeps its text and sits centred like Widgets and Thema.
    await page.evaluate(()=>navigate('dashboard'));await page.waitForTimeout(200);
    assert.equal(await text(page.locator('#content .r1d-hours')),'6 / 1.225 uur');
    assert.equal(await page.locator('#content .r1d-hours .icon').count(),1);
    const centred=await page.evaluate(()=>{const r=document.querySelector('#content .r1d-hours').getBoundingClientRect();return Math.abs((r.left+r.right)/2-innerWidth/2)});
    assert.ok(centred<=2,'Hours pill centred, off by '+centred);
    // Menu: Donkere modus has an icon and the same letters as the rows above it.
    await page.locator('#mobileMenu').click();await page.waitForTimeout(300);
    const menu=await page.evaluate(()=>{const n=getComputedStyle(document.querySelector('#sidebar .nav-item[data-page="bank"]')),t=document.querySelector('#sidebar .drawer-theme');if(!t)return null;const c=getComputedStyle(t);return {icon:!!t.querySelector('svg.icon'),same:c.fontSize===n.fontSize&&c.fontWeight===n.fontWeight,label:t.querySelector('.drawer-theme-label').textContent.trim()}});
    if(menu)assert.deepEqual(menu,{icon:true,same:true,label:'Donkere modus'});
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('netjes en snel phone ('+browserName+') ok');
}finally{
  await browser.close();server.close();
}
