// Desktop in de stijl van de telefoon (Kwin 2026-10-28, keuze A): the deep green band runs behind the top bar and the
// page title down to the middle of the first row of numbers; title white, Nieuw and the period white pills, blocks white
// with 24px corners. Phone widths keep their own look (no band variable set there).
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
state.invoices=[{id:'i1',number:'2026-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:'${iso(10)}',dueDate:'${iso(-4)}',lines:[{desc:'Fictieve dienst',qty:10,unit:100,unitLabel:'uur',vat:21}],payments:[]}];
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

async function openApp(width,theme){
  const context=await browser.newContext({viewport:{width,height:900},locale:'nl-NL'});
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.fulfill({status:404,body:''}));
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.setDefaultTimeout(5000);
  await page.goto(url+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#mainApp').waitFor();
  if(theme)await page.evaluate(t=>{document.documentElement.dataset.theme=t},theme);
  await page.waitForTimeout(300);
  return {context,page};
}
const look=page=>page.evaluate(()=>{
  const main=document.getElementById('appMain'),band=getComputedStyle(main,'::before'),kpis=document.querySelector('#content :is(.dashboard-kpis,.product-kpis)');
  const top=main.getBoundingClientRect().top,k=kpis?.getBoundingClientRect(),cs=s=>getComputedStyle(document.querySelector(s));
  return {bandH:parseFloat(band.height),bandImg:band.backgroundImage,kTop:k?k.top-top:null,kBottom:k?k.bottom-top:null,
    h1:cs('#content .page-head h1').color,nieuw:cs('#quickNew').backgroundColor,topbar:cs('.topbar').backgroundColor,
    card:cs('#content :is(.dashboard-kpi,.product-kpi)').borderTopLeftRadius,content:cs('#content').backgroundColor}
});

try{
  for(const theme of [null,'dark']){
    const {context,page}=await openApp(1440,theme);
    for(const p of ['dashboard','invoices','expenses','vat']){
      await page.evaluate(p=>navigate(p),p);await page.waitForTimeout(250);
      const l=await look(page);
      const label=p+' '+(theme||'light')+' '+JSON.stringify(l);
      assert.match(l.bandImg,/linear-gradient/,'Band painted: '+label);
      assert.ok(l.kTop!=null&&l.bandH>l.kTop+20&&l.bandH<l.kBottom-20,'Band ends inside the first row of numbers: '+label);
      assert.equal(l.h1,'rgb(255, 255, 255)','Title white on the band: '+label);
      assert.equal(l.nieuw,theme?'rgba(255, 255, 255, 0.24)':'rgb(255, 255, 255)','Nieuw is a white pill (bright glass in Donker): '+label);
      assert.equal(l.topbar,'rgba(0, 0, 0, 0)','Top bar sits on the band: '+label);
      assert.equal(l.card,'24px','Blocks have 24px corners: '+label);
      assert.equal(l.content,'rgba(0, 0, 0, 0)','Content lets the band show: '+label);
    }
    // Settings has no numbers: the band ends under the title and the menu starts below it.
    await page.evaluate(()=>navigate('settings'));await page.waitForTimeout(250);
    const s=await page.evaluate(()=>{const main=document.getElementById('appMain'),top=main.getBoundingClientRect().top;return {bandH:parseFloat(getComputedStyle(main,'::before').height),h1:document.querySelector('#content .page-head h1').getBoundingClientRect().bottom-top,layout:document.querySelector('#content .settings-center-layout').getBoundingClientRect().top-top}});
    assert.ok(s.bandH>s.h1&&s.bandH<=s.layout,'Settings band between title and menu: '+JSON.stringify(s));
    await context.close();
  }
  // Phone: no desktop band, the phone keeps its own look.
  {
    const {context,page}=await openApp(390,null);
    const phone=await page.evaluate(()=>({prop:document.getElementById('appMain').style.getPropertyValue('--d-band-h'),before:getComputedStyle(document.getElementById('appMain'),'::before').content}));
    assert.deepEqual(phone,{prop:'',before:'none'},'Phone has no desktop band: '+JSON.stringify(phone));
    await context.close();
  }
  assert.deepEqual(errors,[],'No page errors');
  console.log(browserName+' desktop band: PASS');
}finally{await browser.close();server.close()}
