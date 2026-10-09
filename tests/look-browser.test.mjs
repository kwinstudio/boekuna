// Calm look (look.js/.css + app markup): greeting, smaller cents, initials/logo and cost icons,
// status dots, the all-done moment and friendly empty lists. Runs in Chromium and WebKit.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';

execFileSync(process.execPath,['scripts/build-app.mjs']);
const generated=fs.readFileSync('dist/app/index.html','utf8');
const browserName=process.env.BOOKUNA_BROWSER||'chromium';
const boot=`currentUser={...TEST_USER,email:'qa@example.test',supabaseUser:{user_metadata:{first_name:'Kwin'}}};state=structuredClone(DEFAULT);
for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
state.company={...state.company,name:'Fictieve QA BV',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',kvk:'12345678',vat:'NL123456789B01',email:'qa@example.test',iban:'NL91ABNA0417164300'};
state.contacts=[{id:'c1',type:'customer',name:'Bakkerij de Vries',email:'info@bakkerij-logo.test',address:'Klantstraat 2',postal:'3011AB',city:'Rotterdam'},{id:'c2',type:'customer',name:'Studio Noord',email:'studio@gmail.com',address:'Klantstraat 3',postal:'3011AB',city:'Rotterdam'}];
const lookDay=new Date().toISOString().slice(0,10);
state.invoices=[{id:'i1',number:'2026-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:lookDay,dueDate:lookDay,lines:[{desc:'Fictieve dienst',qty:12,unit:100,unitLabel:'uur',vat:21}],payments:[]},{id:'i2',number:'2026-0002',customerId:'c2',status:'sent',kind:'invoice',issueDate:lookDay,dueDate:lookDay,lines:[{desc:'Fictieve dienst',qty:1,unit:50,unitLabel:'uur',vat:21}],payments:[]}];
state.expenses=[{id:'e1',date:lookDay,vendor:'Tankstation',category:'Reiskosten',exVat:50,vatRate:21}];
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
const errors=[],logoRequests=[];
const logoPng=fs.readFileSync('public/assets/boekuna-app-icon-180.png');

async function openApp(width,height){
  const context=await browser.newContext({viewport:{width,height},locale:'nl-NL'});
  // The only outside requests are to the relation's own website; nothing goes to a logo service.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>{
    const u=new URL(route.request().url());logoRequests.push(u.host+u.pathname);
    if(u.host==='bakkerij-logo.test'&&u.pathname==='/apple-touch-icon.png')return route.fulfill({status:200,contentType:'image/png',body:logoPng});
    return route.fulfill({status:404,body:''});
  });
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.setDefaultTimeout(5000);
  await page.goto(url+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#mainApp').waitFor();
  return {context,page};
}

try{
  const {context,page}=await openApp(390,844);
  // 1. Greeting with one calm line, visible on a phone.
  assert.match(await page.locator('.dashboard-page-head h1').innerText(),/^(Goedemorgen|Goedemiddag|Goedenavond), Kwin$/);
  assert.match(await page.locator('.dashboard-page-head .page-status').innerText(),/^2 facturen (zijn te laat|wachten nog op betaling)\.$/);
  await page.getByRole('heading',{name:'Overzicht'}).waitFor();
  assert.ok(await page.locator('.dashboard-page-head .page-status').isVisible(),'Status line shows on a phone');
  // 2. Cents are smaller, the text itself is unchanged.
  const profit=page.locator('.dashboard-kpi-profit .metric-value');
  assert.equal(await profit.locator('.amount-cents').innerText(),',00');
  assert.match(await profit.textContent(),/^€\s?[\d.]+,00$/);
  // 3 + 5. Initials, a logo from the relation's own site, status as a dot.
  await page.evaluate(()=>navigate('invoices'));
  await page.locator('.mobile-card-row .party-avatar').first().waitFor();
  assert.deepEqual(await page.locator('.mobile-card-row .party-initials').allTextContents(),['BV','SN']);
  await page.locator('.mobile-card-row .party-avatar.has-logo').first().waitFor();
  assert.equal(await page.locator('.mobile-card-row .party-avatar.has-logo').count(),1,'Only the relation with a business domain gets a logo');
  assert.equal(await page.locator('.mobile-card-row .party-avatar img').first().getAttribute('referrerpolicy'),'no-referrer');
  assert.ok(logoRequests.every(r=>r.startsWith('bakkerij-logo.test/')||r.startsWith('www.bakkerij-logo.test/')),'No request to a logo service or a free mail domain: '+logoRequests.join(', '));
  const badge=page.locator('.mobile-card-row .badge').first();
  assert.equal(await badge.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)','Status is a dot with text, not a block');
  assert.equal(await badge.evaluate(el=>getComputedStyle(el,'::before').width),'7px');
  // 4. A line icon per kind of cost.
  await page.evaluate(()=>navigate('expenses'));
  await page.locator('.mobile-card-row .party-avatar.category-icon svg').first().waitFor();
  // 7. A friendly empty list with one button.
  await page.evaluate(()=>{state.expenses=[{id:'old',date:'2020-01-01',vendor:'Oud',category:'Kantoor',exVat:5,vatRate:21}];render()});
  const empty=page.locator('#content .empty').first();
  assert.match(await empty.innerText(),/Nog geen kosten in deze periode/);
  assert.equal(await empty.locator('.empty-icon').count(),1);
  assert.equal(await empty.locator('.btn.primary',{hasText:'Bonnetje scannen'}).count(),1);
  // 6. All done.
  await page.evaluate(()=>{state.expenses=[];state.invoices=[];navigate('dashboard')});
  await page.locator('.assistant-dashboard .assistant-empty').waitFor().catch(async()=>{throw new Error('Dashboard: '+await page.evaluate(()=>[...document.querySelectorAll('#content section')].map(s=>s.className+' => '+s.innerText.slice(0,160).replace(/\s+/g,' ')).join(' || ')))});
  assert.match(await page.locator('.assistant-dashboard .assistant-empty').innerText(),/Alles bijgewerkt\s+Je bent helemaal bij/);
  assert.equal(await page.locator('.dashboard-page-head .page-status').innerText(),'Alles loopt.');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
  await context.close();

  // Desktop table: avatar next to the customer, cents in the amount cells.
  {
    const {context,page}=await openApp(1280,860);
    await page.evaluate(()=>navigate('invoices'));
    await page.locator('.financial-table .cell-with-avatar .party-avatar').first().waitFor();
    assert.ok(await page.locator('.financial-table td.money .amount-cents').count()>=2);
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('Look browser test passed ('+browserName+')');
}finally{
  await browser.close();
  server.close();
}
