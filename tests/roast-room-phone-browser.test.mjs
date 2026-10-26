// Roast room top 5 (Kwin 2026-10-26, "bouw"), phone only: sheets slide in and out and close with a swipe, the profit % is the
// same as on the computer, a late invoice shows under the band, Nieuw has fewer choices, and the bottom bar is a glass pill.
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

try{
  const {context,page}=await openApp();
  // U2: the late invoice is one line under the band, with its one action.
  const alert=page.locator('#content .r1d-alert');
  assert.equal(await alert.count(),1);
  assert.match(await text(alert),/^1 factuur te laat Bakkerij de Vries · € ?1\.210,00 Herinnering sturen$/);
  assert.ok(await page.evaluate(()=>{const a=document.querySelector('#content .r1d-alert').getBoundingClientRect(),h=document.querySelector('#content .r1d-actions').getBoundingClientRect(),w=document.querySelector('#content .r1d-bento').getBoundingClientRect();return a.top>=h.bottom&&a.bottom<=w.top}),'The line sits between the band buttons and the widgets');
  // Paid: the line is gone.
  await page.evaluate(()=>{state.invoices[0].status='paid';state.invoices[0].payments=[{id:'p1',date:state.invoices[0].dueDate,amount:1210}];render()});
  assert.equal(await page.locator('#content .r1d-alert').count(),0,'Nothing urgent, no line');

  // U1: the % next to the period compares with the same dates last month, like the computer.
  const pct=await page.evaluate(()=>{
    const p=dashboardPeriodRange('month'),shift=d=>{const x=new Date(d+'T12:00:00'),day=x.getDate();x.setDate(1);x.setMonth(x.getMonth()-1);x.setDate(Math.min(day,new Date(x.getFullYear(),x.getMonth()+1,0).getDate()));return dashboardIsoDate(x)};
    state.invoices.push({id:'i2',number:'2026-0002',customerId:'c1',status:'sent',kind:'invoice',issueDate:p.from,dueDate:p.to,lines:[{desc:'Nu',qty:1,unit:300,unitLabel:'stuk',vat:21}],payments:[]});
    state.invoices.push({id:'i3',number:'2026-0003',customerId:'c1',status:'sent',kind:'invoice',issueDate:shift(p.from),dueDate:shift(p.to),lines:[{desc:'Toen',qty:1,unit:200,unitLabel:'stuk',vat:21}],payments:[]});
    state.invoices[0].issueDate='2020-01-01';
    return dashboardProfitTrend(dashboardKpiViewModel());
  });
  assert.equal(pct,50,'€ 300 now against € 200 on the same dates last month');

  // U3: three round buttons on the overview; Nieuw has three tiles and three rows.
  assert.deepEqual((await page.locator('#content .r1d-action').allInnerTexts()).map(s=>s.trim()),['Factuur','Bon','Bank']);
  await page.locator('#quickNew').click();
  const rows=(await page.locator('#modalRoot .quick-rows .quick-action strong').allTextContents()).map(s=>s.trim());
  assert.deepEqual(rows.slice(0,3),['Uploaden','Rit','Uren'],'Rows: '+rows.join(', '));
  for(const gone of ['Bank','Relatie','Offerte','Dienst'])assert.ok(!rows.includes(gone),gone+' is made on its own page');
  await page.evaluate(()=>closeModal());

  // V1: the bottom bar floats as a rounded glass pill above the screen edge; the + is white.
  const bar=await page.evaluate(()=>{const n=document.getElementById('mobileBottomNav'),r=n.getBoundingClientRect(),cs=getComputedStyle(n),fab=getComputedStyle(document.getElementById('quickNew'));return {left:r.left,right:r.right,bottom:r.bottom,radius:parseFloat(cs.borderTopLeftRadius),fab:fab.backgroundColor}});
  assert.ok(bar.left>=8&&bar.right<=382&&bar.bottom<=838&&bar.radius>=24,'Glass pill: '+JSON.stringify(bar));
  assert.equal(bar.fab,'rgb(255, 255, 255)');
  await context.close();

  // M1: with motion on, a closing sheet slides down as a copy, and a swipe down on its top closes it.
  {
    const {context,page}=await openApp('?motion=1');
    await page.locator('#quickNew').click();
    await page.locator('#modalRoot .modal').waitFor();
    assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#modalRoot .modal')).animationName),'boekuna-sheet-up');
    await page.waitForTimeout(500);
    const seen=await page.evaluate(()=>new Promise(res=>{closeModal();const empty=!document.querySelector('#modalRoot .modal');requestAnimationFrame(()=>requestAnimationFrame(()=>{const g=document.querySelector('#modalRoot .motion-sheet-ghost .modal');res({empty,ghost:!!g,anim:g?getComputedStyle(g).animationName:''})}))}));
    assert.deepEqual(seen,{empty:true,ghost:true,anim:'boekuna-sheet-down'},'closeModal empties at once; the copy slides down');
    await page.locator('#modalRoot .motion-sheet-ghost').waitFor({state:'detached'});
    await page.locator('#quickNew').click();
    await page.waitForTimeout(500);
    const head=await page.locator('#modalRoot .modal-head').boundingBox();
    await page.mouse.move(head.x+40,head.y+20);await page.mouse.down();
    await page.mouse.move(head.x+40,head.y+90,{steps:4});await page.mouse.move(head.x+40,head.y+220,{steps:4});await page.mouse.up();
    await page.locator('#modalRoot .modal:not(.motion-sheet-ghost .modal)').waitFor({state:'detached'});
    // A short drag puts the sheet back.
    await page.locator('#quickNew').click();
    await page.waitForTimeout(500);
    const h2=await page.locator('#modalRoot .modal-head').boundingBox();
    await page.mouse.move(h2.x+40,h2.y+20);await page.mouse.down();await page.mouse.move(h2.x+40,h2.y+50,{steps:6});await page.mouse.up();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#modalRoot .modal').count(),1,'Still open after a short drag');
    assert.equal(await page.evaluate(()=>document.querySelector('#modalRoot .modal').style.transform),'');
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('roast room phone ('+browserName+') ok');
}finally{
  await browser.close();server.close();
}
