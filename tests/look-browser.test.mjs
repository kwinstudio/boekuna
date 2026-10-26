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
  // 1. Kwin 2026-10-22 ("rustiger" A): the phone overview is titled Overzicht, without a greeting or status line.
  assert.equal(await page.locator('.dashboard-page-head h1').innerText(),'Overzicht');
  assert.match(await page.locator('.dashboard-page-head h1').getAttribute('aria-label'),/^Overzicht, (Goedemorgen|Goedemiddag|Goedenavond), Kwin$/);
  assert.equal(await page.locator('.dashboard-page-head .page-status').count(),0,'No status line under the title on a phone');
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
  assert.equal(await badge.evaluate(el=>getComputedStyle(el,'::before').width),'8px');
  assert.equal(await badge.evaluate(el=>getComputedStyle(el).fontSize),'0px','On a phone the status is only the dot');
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
  await page.locator('.calm-list').waitFor();
  assert.equal(await page.locator('.calm-todo:not(.is-clear)').count(),0,'Nothing to do: no "te doen" button on a phone');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
  await context.close();

  // Round 2 on a phone: period buttons (8), overview tiles in style C with the VAT deadline (12),
  // the round Nieuw button (14), day headers (9), partly paid bar (10) and "+ €" for money coming in (63).
  {
    const {context,page}=await openApp(390,844);
    // Kwin 2026-10-10: on a phone the period is one quiet "Deze maand ⌄" button next to the greeting that opens the phone's own picker;
    // the five buttons stay for wider screens.
    const seg=page.locator('.dashboard-period-control .period-seg'); // R1D (Kwin 2026-10-23): the period sits under Winst in the green band
    assert.deepEqual((await seg.locator('.period-seg-btn').allTextContents()).map(s=>s.trim()),['Week','Maand','Kwartaal','Jaar','Alles']);
    assert.equal(await seg.locator('.period-seg-btn').first().isVisible(),false,'The five period buttons are folded into one on a phone');
    const pick=page.getByRole('combobox',{name:'Periode'});
    assert.equal(await pick.isVisible(),true,'The period picker is visible and named on a phone');
    assert.equal(await pick.getAttribute('tabindex'),null,'The period picker can be reached with the keyboard');
    assert.deepEqual(await pick.locator('option').allTextContents(),['Deze week','Deze maand','Dit kwartaal','Dit jaar','Alles']);
    await pick.selectOption('year');
    await page.locator('.dashboard-period-control .period-seg-btn.on',{hasText:'Jaar'}).waitFor({state:'attached'});
    assert.equal(await page.locator('#dashboardPeriod').inputValue(),'year');
    // Kwin 2026-10-23 (own sketch, "R1D Diep groen"): Winst large on a deep green band with the period right under it and four
    // round shortcuts; then blocks: Omzet wide, Kosten tall, Te ontvangen and Btw (Vrij once money came in) beside it.
    const hero=await page.locator('.r1d-hero').evaluate(el=>{const r=el.getBoundingClientRect(),w=el.querySelector('.dashboard-kpi-profit').getBoundingClientRect(),p=el.querySelector('.period-seg-select').getBoundingClientRect(),bar=document.querySelector('.topbar');return {left:r.left,right:r.right,top:r.top,barBottom:bar.getBoundingClientRect().bottom,winstBottom:w.bottom,pickTop:p.top,pickRight:p.right,bg:getComputedStyle(el).backgroundImage,barBg:getComputedStyle(bar).backgroundColor}});
    assert.ok(hero.left===0&&hero.right===390&&Math.abs(hero.top-hero.barBottom)<=1,'The green band runs edge to edge, right under the top bar: '+JSON.stringify(hero));
    // Kwin 2026-10-24 ("de achtergrond over heel de scherm"): the green gradient is the whole screen, behind a see-through band and top bar.
    assert.match(await page.evaluate(()=>getComputedStyle(document.body,'::before').backgroundImage),/linear-gradient/,'The screen is a green gradient');
    assert.equal(hero.bg,'none','The band lets the screen colour through');
    assert.equal(hero.barBg,'rgba(0, 0, 0, 0)','The top bar lets the screen colour through');
    assert.ok(hero.pickTop>=hero.winstBottom&&hero.pickRight<=390,'The period button sits under Winst: '+JSON.stringify(hero));
    assert.deepEqual((await page.locator('.r1d-action').allInnerTexts()).map(s=>s.trim()),['Factuur','Bon','Bank','Meer']);
    assert.equal(await page.locator('.dashboard-kpis-calm .dashboard-kpi').count(),1,'Only the Winst block');
    assert.deepEqual((await page.locator('.r1d-bento .calm-label').allTextContents()).map(s=>s.trim()).slice(0,3),['Omzet','Kosten','Te ontvangen']);
    assert.match(await page.locator('.r1d-bento .calm-label').nth(3).innerText(),/^(Vrij te besteden|Btw Q[1-4])$/,'The fourth block is Vrij, or the btw of the quarter that is due');
    const tiles=await page.locator('.r1d-bento .r1d-tile').evaluateAll(list=>list.map(el=>{const r=el.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),left:Math.round(r.left)}}));
    assert.ok(tiles[0].w>tiles[1].w*1.8,'Omzet is wide: '+JSON.stringify(tiles));
    assert.ok(tiles[1].h>tiles[2].h*1.6&&tiles[2].left>tiles[1].left,'Kosten is tall, Te ontvangen sits beside it: '+JSON.stringify(tiles));
    const fab=await page.locator('#quickNew').evaluate(el=>{const r=el.getBoundingClientRect(),c=getComputedStyle(el);return {right:innerWidth-r.right,bottom:innerHeight-r.bottom,w:r.width,h:r.height,position:c.position}});
    assert.equal(fab.position,'fixed');
    assert.ok(fab.w===48&&fab.h===48&&Math.abs(fab.right-(390-48)/2)<=1&&fab.bottom>=6&&fab.bottom<=12,'Nieuw is a round button inside the middle of the bottom bar: '+JSON.stringify(fab));
    await page.evaluate(()=>{state.invoices[0].payments=[{id:'p1',date:state.invoices[0].issueDate,amount:300,method:'bank'}];navigate('invoices')});
    await page.locator('.mobile-card-list .mobile-card-group').first().waitFor();
    assert.deepEqual(await page.locator('.mobile-card-list .mobile-card-group').allTextContents(),['Vandaag']);
    const partly=page.locator('.mobile-card-row',{hasText:'Bakkerij de Vries'});
    // Kwin 2026-10-22: rows show name, amount and a status dot only; the part paid shows inside the invoice.
    assert.equal(await partly.locator('.mobile-paid-bar').isVisible(),false);
    assert.doesNotMatch(await partly.innerText(),/binnen/);
    assert.match(await partly.locator('.mobile-card-value').textContent(),/^€\s?1\.452,00$/,'No "+" before the amount (Kwin 2026-10-10)');
    assert.ok(await partly.locator('.mobile-card-value.money-positive').count()===1);
    await page.evaluate(()=>navigate('settings'));
    const bar=await page.locator('#mobileBottomNav').boundingBox(),plusBox=await page.locator('#quickNew').boundingBox();
    assert.ok(plusBox.y+plusBox.height>bar.y+20,'On settings Nieuw sits in the bottom bar, not over the switches');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
    await context.close();
  }

  // Round 3 on a phone (Kwin's picks, 2026-10-09): one block and tile style on every page, calm rows without a ⋯,
  // Gevaarzone under Account, a profile card on Instellingen, day chips for a cost and a folded A4 invoice.
  {
    const {context,page}=await openApp(390,844);
    for(const route of ['invoices','expenses','bank','vat','reports']){
      await page.evaluate(r=>navigate(r),route);
      const tiles=await page.locator('.product-kpis .product-kpi').evaluateAll(list=>list.map(el=>({dot:el.dataset.kpiDot||'',hero:el.classList.contains('kpi-hero'),band:!!el.closest('.r1d-hero'),radius:getComputedStyle(el).borderTopLeftRadius,icon:getComputedStyle(el.querySelector('.product-kpi-icon')).display})));
      assert.ok(tiles.length&&tiles.every(t=>t.dot&&(t.hero?t.band&&t.radius==='0px':t.radius==='16px')&&t.icon==='none'),route+' tiles share one style with a coloured dot (the hero number sits in the green band): '+JSON.stringify(tiles));
      if(['bank','vat'].includes(route))assert.equal(tiles.filter(t=>t.hero).length,1,route+' has one light-blue block on top');
      // Kwin 2026-10-21 (Rapportages B): the winst is the big number with a line over the year above the tiles.
      if(route==='reports')assert.equal(await page.locator('#content :is(.report-story,.r1d-story-hero) .report-story-amount').count(),1,'reports opens with the winst story (the total sits in the band on a phone)');
    }
    await page.evaluate(()=>navigate('invoices'));
    await page.locator('.mobile-card-list .mobile-card-row').first().waitFor();
    assert.equal(await page.locator('.mobile-card-list .mobile-card-side .icon-btn').first().isVisible(),false,'No ⋯ on an invoice row; the actions sit in the invoice');
    await page.evaluate(()=>navigate('contacts'));
    assert.equal(await page.locator('.mobile-contacts .row-action-trigger').first().isVisible(),false,'No ⋯ on a relation row');
    await page.locator('.mobile-contacts .phone-row-link',{hasText:'Studio Noord'}).click();
    await page.getByRole('dialog').waitFor();
    await page.evaluate(()=>closeModal());
    await page.evaluate(()=>navigate('settings'));
    assert.equal(await page.locator('.settings-profile-card').isVisible(),true,'Profile card on top of Instellingen');
    assert.equal(await page.locator('.settings-center-row[data-settings-open="danger"]').isVisible(),false,'No separate Gevaarzone row on a phone');
    await page.locator('.settings-center-row[data-settings-open="account"]').click();
    await page.locator('#settings-panel-account [data-settings-open="danger"]').click();
    assert.equal(await page.locator('.settings-danger-group').getByRole('button',{name:'Account verwijderen',exact:true}).isVisible(),true,'Account deletion stays reachable under Account');
    await page.evaluate(()=>newExpense());
    assert.equal(await page.locator('.expense-day-chip.active').innerText(),'Vandaag');
    assert.equal(await page.locator('#expenseDate').isVisible(),false,'The date field waits until you pick "Andere dag"');
    await page.locator('.expense-day-chip',{hasText:'Andere dag'}).click();
    assert.equal(await page.locator('#expenseDate').isVisible(),true);
    await page.evaluate(()=>{closeModal();viewInvoice('i1')});
    const expand=page.locator('#modalRoot .a4-expand');
    assert.equal(await expand.innerText(),'Hele factuur bekijken');
    assert.ok(await page.locator('#modalRoot .boekuna-a4-preview.is-collapsed').count()===1,'The A4 page starts folded on a phone');
    await expand.click();
    assert.equal(await page.locator('#modalRoot .boekuna-a4-preview.is-collapsed').count(),0);
    assert.equal(await expand.getAttribute('aria-expanded'),'true');
    await context.close();
  }

  // Calmer on white (Kwin 2026-10-10): the same look with fewer boxes, lines and capitals; the tiles keep their small charts; dark mode stays dark.
  {
    const {context,page}=await openApp(390,844);
    const bg=sel=>page.locator(sel).first().evaluate(el=>getComputedStyle(el).backgroundColor);
    // Kwin 2026-10-23 (R1D as picked): the overview is light grey with white cards; menu and search are round buttons on the green.
    // Kwin 2026-10-24: the band colour is now the whole screen, so the page itself is see-through over it.
    assert.equal(await bg('#content'),'rgba(0, 0, 0, 0)','The overview lets the screen colour through on a phone');
    assert.equal(await page.locator('#mobileMenu').evaluate(el=>getComputedStyle(el).borderTopWidth+'|'+getComputedStyle(el).backgroundColor),'0px|rgba(255, 255, 255, 0.12)','Menu is a round button on the green band');
    assert.equal(await page.locator('.calm-list').isVisible(),true,'One calm list under the Winst block');
    const todo=page.locator('#content .dashboard-attention-item').first();
    if(await todo.count()){
      assert.equal(await todo.locator('.dashboard-attention-cta').evaluate(el=>getComputedStyle(el).fontSize),'0px','Nog te doen is one row with an arrow');
      assert.ok((await todo.getAttribute('aria-label')||await todo.innerText()).length>0);
    }
    await page.evaluate(()=>navigate('invoices'));
    await page.locator('.mobile-card-list .mobile-card-row').first().waitFor();
    assert.equal(await page.locator('#content .workspace-table').evaluate(el=>getComputedStyle(el).borderTopWidth),'0px','No frame around the list');
    assert.equal(await page.locator('.mobile-card-list .mobile-card-group').first().evaluate(el=>getComputedStyle(el).textTransform),'none','Day headers in normal letters');
    await page.evaluate(()=>navigate('documents'));
    const mains=await page.locator('#content :is(.product-page-actions,.page-head) .btn.primary').evaluateAll(nodes=>nodes.filter(el=>el.getBoundingClientRect().height>0).length);
    assert.equal(mains,0,'Bonnetjes has no own upload button on a phone; Scannen and Factuur uploaden sit under Nieuw');
    await page.evaluate(()=>{window.BoekunaTheme&&BoekunaTheme.set('dark');navigate('dashboard')});
    assert.notEqual(await bg('#content'),'rgb(255, 255, 255)','Dark mode stays dark');
    assert.notEqual(await bg('.calm-list'),'rgb(255, 255, 255)','The dark list stays dark');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
    await context.close();
  }

  // Buttons on a phone: no round quick-button row on the overview (45 removed at Kwin's request), delete with undo (42), busy button (41), Alles / Een deel (48),
  // copy (49), send channels (50), round back button (51) and the error under the field itself (61).
  {
    const {context,page}=await openApp(390,844);
    assert.equal(await page.locator('.dashboard-quick').count(),0,'The overview has no row of round quick buttons; Nieuw in the bottom bar does this');
    // Kwin 2026-10-09: on a phone the pages have no own main button; Nieuw offers everything they did.
    for(const route of ['invoices','expenses','bank','contacts','services']){
      await page.evaluate(r=>navigate(r),route);
      const mains=await page.locator('#content :is(.product-page-actions,.page-head)>.btn.primary').evaluateAll(nodes=>nodes.filter(el=>el.getBoundingClientRect().height>0).length);
      assert.equal(mains,0,route+' has no own main button on a phone');
    }
    await page.locator('#quickNew').click();
    const nieuw=(await page.locator('#modalRoot .quick-action strong').allTextContents()).map(v=>v.trim());
    // Kwin 2026-10-21 (voorstel A): three big tiles, camera first; the rest are plain rows under them (no Meer fold).
    assert.deepEqual((await page.locator('#modalRoot .quick-tiles .quick-tile').allTextContents()).map(v=>v.trim()),['Bon scannen','Factuur','Kosten']);
    assert.equal(await page.locator('#modalRoot details.quick-more').count(),0,'No Meer fold');
    // Kwin 2026-10-17 (fewer choices): Factuur uploaden + Document uploaden are one Uploaden, Banktransactie + Bankbestand one Bank.
    for(const label of ['Factuur','Bon scannen','Kosten','Uploaden','Bank','Relatie','Dienst'])assert.ok(nieuw.includes(label),'Nieuw offers '+label+' on a phone: '+nieuw.join(', '));
    for(const label of ['Factuur uploaden','Document uploaden','Banktransactie','Bankbestand'])assert.ok(!nieuw.includes(label),'Merged on a phone: '+label);
    await page.evaluate(()=>closeModal());
    // Kwin 2026-10-21 (Filters A): an active filter is a green chip with ×, and Wissen clears everything at once.
    await page.evaluate(()=>{navigate('invoices');const c=state.contacts.find(x=>x.type==='customer');listPageState('invoices').filters={status:'overdue',customer:c.id};render()});
    assert.equal(await page.locator('#content .list-chip-row .list-chip-on').count(),1,'The customer filter is one green chip');
    assert.equal(await page.locator('#content .list-chip-row [data-list-clear-filters]').count(),1,'Wissen sits in the same row');
    assert.equal(await page.locator('#content .list-chip-row .list-chip-on').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(227, 244, 230)');
    await page.evaluate(()=>{listPageState('invoices').filters={};render()});
    // Less text: no explaining sentences under "Nog te doen" or under the VAT table; the VAT legal line stays.
    await page.evaluate(()=>navigate('vat'));
    assert.equal(await page.locator('#content .vat-return-card>.help').isVisible(),false,'VAT rounding explanation is gone on a phone');
    assert.match(await page.locator('#content').innerText(),/niet naar de Belastingdienst/,'The VAT legal line stays');
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
    // Kwin 2026-10-10: the amount shows as text ("€ 1.452,00 · alles"); "Een deel betaald?" opens the field.
    assert.match(await page.locator('#paymentForm .payment-amount-text').innerText(),/€\s?1\.452,00 · alles/);
    assert.equal(await page.locator('#paymentAmount').isVisible(),false);
    await page.locator('#paymentForm .payment-part-link').click();
    await page.locator('.payment-share-btn',{hasText:'Een deel'}).click();
    assert.equal(await page.locator('#paymentAmount').inputValue(),'');
    await page.locator('#paymentAmount').fill('20');
    await page.locator('.payment-share-btn',{hasText:'Alles'}).click();
    assert.equal(await page.locator('#paymentAmount').inputValue(),'1452.00');
    assert.equal(await page.locator('.payment-share-btn.on').textContent(),'Alles');
    assert.equal(await page.locator('#paymentForm .payment-amount-text').isVisible(),true,'Alles folds back to the amount as text');
    await page.evaluate(()=>{closeModal();viewInvoice('i1')});
    // Kwin 2026-10-10: the Factuurnummer/IBAN copy chips are gone on the phone (they stay on wider screens).
    assert.equal(await page.locator('.invoice-copy-strip').count(),0,'No copy chips on the phone');
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
    // The copy chips (Factuurnummer, IBAN) still work on wider screens.
    await page.evaluate(()=>viewInvoice('i1'));
    assert.deepEqual(await page.locator('.invoice-copy-strip .copy-chip-label').allTextContents(),['Factuurnummer','IBAN']);
    if(browserName==='chromium'){
      await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:url});
      await page.locator('.copy-chip-btn').last().click();
      await page.locator('.copy-chip-btn.is-copied',{hasText:'Gekopieerd'}).waitFor();
      assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'NL91ABNA0417164300');
    }
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('Look browser test passed ('+browserName+')');
}finally{
  await browser.close();
  server.close();
}
