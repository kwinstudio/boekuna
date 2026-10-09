// Calm look (look.js/.css + app markup): greeting, smaller cents, initials/logo and cost icons,
// status dots, the all-done moment and friendly empty lists, plus round 2 (period buttons, tiles,
// round Nieuw button, day headers, partly paid bar). Runs in Chromium and WebKit.
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

  // Round 2 on a phone: period buttons (8), overview tiles in style C with the VAT deadline (12),
  // the round Nieuw button (14), day headers (9), partly paid bar (10) and "+ €" for money coming in (63).
  {
    const {context,page}=await openApp(390,844);
    const seg=page.locator('.dashboard-page-head .period-seg');
    assert.deepEqual((await seg.locator('.period-seg-btn').allTextContents()).map(s=>s.trim()),['Week','Maand','Kwartaal','Jaar','Alles']);
    await seg.getByRole('button',{name:'Jaar',exact:true}).click();
    await page.locator('.dashboard-page-head .period-seg-btn.on',{hasText:'Jaar'}).waitFor();
    assert.equal(await page.locator('.dashboard-page-head .period-seg-btn',{hasText:'Jaar'}).getAttribute('aria-pressed'),'true');
    const head=await page.locator('.dashboard-page-head').evaluate(el=>({title:el.querySelector('h1').getBoundingClientRect().bottom,seg:el.querySelector('.period-seg').getBoundingClientRect()}));
    assert.ok(head.seg.top>=head.title-2,'Period buttons sit under the greeting on a phone');
    assert.equal(await page.locator('.dashboard-kpi .kpi-bars rect').count(),6,'Omzet shows six small month bars');
    assert.equal(await page.locator('.dashboard-kpi .kpi-ring').count(),1,'Kosten shows a small ring');
    assert.match(await page.locator('.dashboard-kpi .kpi-ring-legend').innerText(),/Reiskosten/);
    assert.equal(await page.locator('.dashboard-kpi .kpi-share').count(),1,'Nog te ontvangen shows a thin bar');
    assert.match(await page.locator('.dashboard-kpi .kpi-deadline').innerText(),/^Aangifte Q[1-4] vóór \d{1,2} [a-z]+ · (vandaag|nog 1 dag|nog \d+ dagen)$/);
    const fab=await page.locator('#quickNew').evaluate(el=>{const r=el.getBoundingClientRect(),c=getComputedStyle(el);return {right:innerWidth-r.right,bottom:innerHeight-r.bottom,w:r.width,h:r.height,position:c.position}});
    assert.equal(fab.position,'fixed');
    assert.ok(fab.w===56&&fab.h===56&&Math.abs(fab.right-16)<=1&&fab.bottom>=80,'Nieuw is a round button bottom-right: '+JSON.stringify(fab));
    await page.evaluate(()=>{state.invoices[0].payments=[{id:'p1',date:state.invoices[0].issueDate,amount:300,method:'bank'}];navigate('invoices')});
    await page.locator('.mobile-card-list .mobile-card-group').first().waitFor();
    assert.deepEqual(await page.locator('.mobile-card-list .mobile-card-group').allTextContents(),['Vandaag']);
    const partly=page.locator('.mobile-card-row',{hasText:'Bakkerij de Vries'});
    assert.match(await partly.innerText(),/€\s?300,00 van €\s?1\.452,00 binnen/);
    assert.equal(await partly.locator('.mobile-paid-bar i').count(),1);
    assert.match(await partly.locator('.mobile-card-value').textContent(),/^\+ €\s?1\.452,00$/);
    assert.ok(await partly.locator('.mobile-card-value.money-positive').count()===1);
    await page.evaluate(()=>navigate('settings'));
    assert.notEqual(await page.locator('#quickNew').evaluate(el=>getComputedStyle(el).position),'fixed','No floating button over the settings switches');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
    await context.close();
  }

  // Buttons on a phone: quick buttons (45), delete with undo (42), busy button (41), Alles / Een deel (48),
  // copy (49), send channels (50), round back button (51) and the error under the field itself (61).
  {
    const {context,page}=await openApp(390,844);
    assert.deepEqual((await page.locator('.dashboard-quick-btn').allTextContents()).map(s=>s.trim()),['Scan','Factuur','Rit','Vraag']);
    await page.evaluate(()=>{const day=new Date().toISOString().slice(0,10);state.invoices.push({id:'dq',number:'CONCEPT-1',customerId:'c1',status:'draft',kind:'invoice',issueDate:day,dueDate:day,lines:[{desc:'Fictief',qty:1,unit:10,vat:21}],payments:[]});deleteInvoice('dq')});
    assert.equal(await page.evaluate(()=>state.invoices.some(i=>i.id==='dq')),false,'A draft is deleted at once');
    await page.locator('#toastRoot .toast-undo .toast-action',{hasText:'Ongedaan maken'}).click();
    assert.equal(await page.evaluate(()=>state.invoices.some(i=>i.id==='dq')),true,'Ongedaan maken brings it back');
    await page.evaluate(()=>{window.__calls=0;window.syncOfflineDrafts=function(){window.__calls++;return new Promise(r=>setTimeout(r,900))};boekunaBusy.wrap('syncOfflineDrafts');modal('Test','<p>Test</p>','<button class="btn primary" id="slowBtn" onclick="syncOfflineDrafts()">Opslaan</button>')});
    await page.locator('#slowBtn').dblclick();
    await page.locator('#slowBtn.is-busy').waitFor();
    assert.equal(await page.locator('#slowBtn').getAttribute('aria-busy'),'true');
    assert.equal(await page.evaluate(()=>window.__calls),1,'A second tap while busy does nothing');
    await page.locator('#slowBtn:not(.is-busy)').waitFor();
    assert.equal(await page.locator('#slowBtn').isEnabled(),true);
    await page.evaluate(()=>{closeModal();registerPayment('i1')});
    await page.locator('.payment-share-btn',{hasText:'Een deel'}).click();
    assert.equal(await page.locator('#paymentAmount').inputValue(),'');
    await page.locator('#paymentAmount').fill('20');
    await page.locator('.payment-share-btn',{hasText:'Alles'}).click();
    assert.equal(await page.locator('#paymentAmount').inputValue(),'1452.00');
    assert.equal(await page.locator('.payment-share-btn.on').innerText(),'Alles');
    await page.evaluate(()=>{closeModal();viewInvoice('i1')});
    assert.deepEqual(await page.locator('.invoice-copy-strip .copy-chip-label').allTextContents(),['Factuurnummer','IBAN']);
    if(browserName==='chromium'){
      await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:url});
      await page.locator('.copy-chip-btn').last().click();
      await page.locator('.copy-chip-btn.is-copied',{hasText:'Gekopieerd'}).waitFor();
      assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'NL91ABNA0417164300');
    }
    await page.evaluate(()=>{closeModal();const i=state.invoices.find(x=>x.id==='i1');i.supplyDate=i.issueDate;openInvoiceEmailShare('i1')});
    await page.locator('.send-channels').waitFor();
    assert.deepEqual((await page.locator('.send-channel').allTextContents()).map(s=>s.trim()),['Mail','WhatsApp','Kopiëren']);
    await page.evaluate(()=>{closeModal();navigate('settings')});
    await page.locator('.settings-center-row[data-settings-open="app"]').click();
    const back=await page.locator('#settings-panel-app .settings-center-back').evaluate(el=>{const r=el.getBoundingClientRect();return {w:r.width,h:r.height,radius:getComputedStyle(el).borderRadius}});
    assert.ok(back.w===44&&back.h===44&&back.radius==='50%','Back is a round 44px button: '+JSON.stringify(back));
    await page.evaluate(()=>newContact());
    await page.locator('#modalRoot .modal-foot .btn.primary').click();
    await page.locator('#modalRoot .field.has-error .field-error-text',{hasText:'Vul dit in.'}).first().waitFor();
    const invalid=page.locator('#modalRoot [aria-invalid="true"]').first();
    await invalid.fill('Nieuwe klant BV');
    assert.equal(await page.locator('#modalRoot .field.has-error').count(),0,'The error goes away once it is filled in');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
    await context.close();
  }

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
