// UI-trucs (Kwin 2026-11-04, "bewezen trucs van de concurrenten, Revolut en Apple", picks 1-9, 11, 12, 14, 15).
// In the app itself: 1 "helemaal bij" only when nothing needs you (gevoel.js), 2 Vrij te besteden never below € 0, 3 no red
// block in the Kosten tile, 4 a late invoice says how late, 6 one name and icon per action, 8 one Filter button, 12 tab icons,
// 15 history with a supplier or customer. In klopt.js (off for automated browsers, ?klopt=1 on): 5 the ask sheet, 7 small
// cents in sheets, 9 links without underline, 11 the title that stays when you scroll. In motion.js: 14 pull a whole sheet down.
// Chromium and WebKit (BOOKUNA_BROWSER=webkit).
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
state.contacts=[{id:'c1',type:'customer',name:'Fictieve Schilders'},{id:'c2',type:'customer',name:'Bakkerij Jansen'}];
const d=n=>{const x=new Date();x.setDate(x.getDate()-n);return localDateOnly(x)};
state.invoices=[
 {id:'i1',number:'2026-0001',status:'sent',kind:'invoice',customerId:'c1',issueDate:d(45),dueDate:d(31),lines:[{desc:'Werk',qty:1,unit:1000,vat:21}],payments:[]},
 {id:'i2',number:'2026-0002',status:'paid',kind:'invoice',customerId:'c1',issueDate:d(80),dueDate:d(66),lines:[{desc:'Werk',qty:1,unit:500,vat:21}],payments:[{date:d(70),amount:605}]},
 {id:'i3',number:'2026-0003',status:'sent',kind:'invoice',customerId:'c2',issueDate:d(2),dueDate:d(-12),lines:[{desc:'Werk',qty:1,unit:200,vat:21}],payments:[]}];
state.expenses=[
 {id:'e1',date:d(0),vendor:'Albert Heijn',invoiceNumber:'A1',category:'Kantoor',paymentMethod:'bank',exVat:20,vatRate:21},
 {id:'e2',date:d(1),vendor:'Albert Heijn',invoiceNumber:'A2',category:'Kantoor',paymentMethod:'bank',exVat:10,vatRate:21},
 {id:'e3',date:d(1),vendor:'Shell',invoiceNumber:'S1',category:'Auto',paymentMethod:'bank',exVat:40,vatRate:21}];
state.documents=[{id:'doc1',fileId:'f1',name:'bon.jpg',type:'Bon',date:d(0),processingState:'ready'}];
state.hours=[{id:'h1',date:d(0),hours:2,description:'Werk',customerId:'c1'}];
state.quotes=[{id:'q1',number:'OFF-0001',status:'sent',customerId:'c1',issueDate:d(3),validUntil:d(-27),lines:[{desc:'Werk',qty:1,unit:300,vat:21}]}];
documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;enterApp();`;
const html=generated.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;').replace(/initAuth\(\);(?![\s\S]*initAuth\(\);)/,boot);
const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  const p=new URL(req.url,'http://localhost').pathname;
  if(p.startsWith('/assets/')){const f=path.resolve('dist/app'+p);if(fs.existsSync(f)){res.setHeader('Content-Type',types[path.extname(f)]||'image/png');return res.end(fs.readFileSync(f))}res.writeHead(404);return res.end()}
  res.setHeader('Content-Type','text/html');res.end(html);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
const browser=await (browserName==='webkit'?webkit:chromium).launch();
const errors=[];

async function openApp(query=''){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:browserName==='chromium',locale:'nl-NL'});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.setDefaultTimeout(5000);
  // One fixed day, so "31 dagen te laat", this year's history and the quarter never depend on when the test runs.
  await page.clock.setFixedTime(new Date('2026-11-12T10:00:00'));
  await page.goto(url+'/'+query,{waitUntil:'domcontentloaded'});
  await page.locator('#mainApp').waitFor();
  return {context,page};
}
const texts=async loc=>(await loc.allInnerTexts()).map(s=>s.replace(/\s+/g,' ').trim());

try{
  // The plain app (tests, screenshots): klopt.js stays off, the app's own fixes are there.
  {
    const {context,page}=await openApp();
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('boekuna-klopt')),false,'klopt.js is off for automated browsers');
    assert.equal(await page.evaluate(()=>typeof window.boekunaAsk),'undefined');

    // 6. One name and one icon per action.
    assert.deepEqual(await texts(page.locator('#content .r1d-actions .r1d-action')),['Factuur','Bon scannen','Bank']);
    assert.equal(await page.locator('#content .r1d-actions .r1d-action').nth(1).locator('use').getAttribute('href'),'#i-camera');
    assert.equal(await page.locator('#content .r1d-actions .r1d-action').nth(0).locator('use').getAttribute('href'),'#i-file');
    await page.evaluate(()=>navigate('expenses'));
    assert.equal((await texts(page.locator('#content .r1d-action')))[0],'Bon scannen');
    await page.evaluate(()=>navigate('documents'));
    assert.equal((await texts(page.locator('#content .r1d-action')))[0],'Bon scannen');
    await page.evaluate(()=>navigate('invoices'));
    assert.equal(await page.locator('#content .r1d-action',{hasText:'Offerte'}).locator('use').getAttribute('href'),'#i-quote','Offerte has its own icon');
    await page.locator('#quickNew').click();
    assert.equal(await page.locator('#modalRoot .quick-action',{hasText:'Uploaden'}).locator('use').getAttribute('href'),'#i-upload');
    await page.evaluate(()=>closeModal());

    // 12. Inkomsten and Kosten have their own tab icon.
    assert.equal(await page.locator('#mobileBottomNav [data-mobile-page="invoices"] use').getAttribute('href'),'#i-in');
    assert.equal(await page.locator('#mobileBottomNav [data-mobile-page="expenses"] use').getAttribute('href'),'#i-out');

    // 8. The status chips stay, everything else sits behind one Filter button.
    const row=page.locator('#content .list-chip-row');
    assert.deepEqual((await texts(row.locator('.filter-btn'))).slice(0,2),['Alle','Open']);
    assert.equal(await row.locator(':scope > *').first().getAttribute('data-list-open-filters'),'','Filter comes first, so the chips after it are never cut off by it');
    const rowBox=await row.boundingBox(),lastChip=await row.locator('.filter-btn').last().boundingBox();
    assert.ok(lastChip.x+lastChip.width<=rowBox.x+rowBox.width+1,'Filter and the four status chips fit on a 390 px phone');
    assert.equal(await row.locator('select').count(),0,'No picker chips in the row');
    assert.equal(await row.locator('[data-list-open-filters]').count(),1);
    assert.equal((await texts(row.locator('[data-list-open-filters]')))[0],'Filter');
    await row.locator('[data-list-open-filters]').click();
    await page.locator('#listFilterForm').waitFor();
    assert.ok((await page.locator('#listFilterForm select').evaluateAll(n=>n.map(el=>el.name))).includes('customer'),'Klant is in the Filter sheet');
    await page.evaluate(()=>closeModal());
    await page.evaluate(()=>{const c=state.contacts[0];listPageState('invoices').filters={...listPageState('invoices').filters,customer:c.id};render()});
    assert.equal(await row.locator('.list-chip-on').count(),1,'A filter that is on is a green chip with ×');
    assert.match((await texts(row.locator('[data-list-open-filters]')))[0],/^Filter\s*1$/);
    await page.evaluate(()=>{listPageState('invoices').filters={...listPageState('invoices').filters,customer:'all'};render()});
    for(const p of ['expenses','documents','trips']){
      await page.evaluate(p=>navigate(p),p);
      if(!await page.locator('#content .list-chip-row').count())continue;
      assert.equal(await page.locator('#content .list-chip-row select').count(),0,'One Filter button on '+p);
      assert.equal(await page.locator('#content .list-chip-row [data-list-open-filters]').count(),1,'Filter on '+p);
    }

    // 4. A late invoice says how late it is, a fresh one when it is due.
    await page.evaluate(()=>viewInvoice('i1'));
    assert.match(await page.locator('#modalRoot .invoice-view-due').innerText(),/^31 dagen te laat · vervaldatum \d+ \w+ \d{4}$/);
    await page.evaluate(()=>{closeModal();viewInvoice('i3')});
    assert.match(await page.locator('#modalRoot .invoice-view-due').innerText(),/^vervalt \d+ \w+ \d{4}$/);
    // 15. And what you have with that customer this year.
    await page.evaluate(()=>{closeModal();viewInvoice('i1')});
    const ch=page.locator('#modalRoot .party-history');
    assert.match((await texts(ch))[0],/Fictieve Schilders in \d{4} 2 facturen · €\s1\.500,00 excl\. btw · betaalt gemiddeld in 10 dagen/);
    await page.evaluate(()=>{closeModal();viewInvoice('i3')});
    assert.equal(await ch.count(),0,'No history with one invoice');
    await page.evaluate(()=>{closeModal();expenseActions('e1')});
    assert.match((await texts(ch))[0],/Bij Albert Heijn in \d{4} 2 keer · €\s36,30/);
    await ch.click();
    await page.waitForFunction(()=>page==='expenses');
    assert.equal(await page.evaluate(()=>listPageState('expenses').filters.vendor),'Albert Heijn');
    assert.equal(await page.evaluate(()=>getListRows('expenses').length),2,'The list shows the two Albert Heijn costs');
    await page.evaluate(()=>{closeModal();expenseActions('e3')});
    assert.equal(await ch.count(),0,'No history with one cost');
    await page.evaluate(()=>{closeModal();listPageState('expenses').filters.vendor='all';storeFinancialPeriod('month');navigate('dashboard')});

    // 2. Vrij te besteden is never below € 0; it says what to put aside.
    await page.evaluate(()=>{state.meta.overviewWidgets=['omzet','kosten','open','vrij','recent'];render()});
    const free=await page.evaluate(()=>freeToSpend());
    assert.ok(free&&free.free<0,'Fixture: more btw over open invoices than came in');
    const vrij=page.locator('#content .r1d-free');
    assert.match(await vrij.locator('.calm-value').innerText(),/^€\s?0,00$/);
    assert.match(await vrij.innerText(),/Zet nog €\s[\d.]+,\d{2} apart/);
    assert.equal(await page.evaluate(()=>freeToSpendShortText(freeToSpendShort(freeToSpend()))),'Zet nog '+(await page.evaluate(()=>money(-freeToSpend().free)))+' apart. Komt vrij als je klanten betalen.');

    // 3. No red block: one bucket is a count, two or more are low bars.
    assert.equal(await page.evaluate(()=>dashboardCostBars([{from:today(),to:today(),costs:20}])),'<span class="r1d-note r1d-cost-count">1 kostenpost<i>Albert Heijn</i></span>');
    assert.match(await page.evaluate(()=>dashboardCostBars([{from:'2026-01-01',to:'2026-01-05',costs:0},{from:'2026-01-06',to:'2026-01-10',costs:20}])),/^<span class="r1d-bars"/);
    assert.equal(await page.evaluate(()=>dashboardCostBars([{from:'2020-01-01',to:'2020-01-02',costs:0}])),'','Nothing in the period: nothing extra');

    // 5 without klopt.js: the plain confirm still decides (automated dialog handlers keep working).
    const asked=[];page.on('dialog',dg=>{asked.push(dg.message());dg.dismiss()});
    await page.evaluate(()=>deleteQuote('q1'));
    assert.deepEqual(asked,['Offerte OFF-0001 verwijderen?']);
    assert.equal(await page.evaluate(()=>state.quotes.length),1,'Dismissed: the quote stays');
    await context.close();
  }

  // 1. "Helemaal bij" only when nothing needs you (gevoel.js).
  {
    const {context,page}=await openApp('?gevoel=1');
    await page.evaluate(()=>{window.__gevoelNow='2026-11-12T10:00:00';state.documents=[];render()});
    const line=page.locator('.r1d-hero + .gv-calm');
    await line.waitFor();
    assert.match(await line.innerText(),/Je bonnen zijn bij/,'A late invoice under it: only the bonnen are done');
    assert.doesNotMatch(await line.innerText(),/helemaal bij/);
    assert.ok(await page.locator('#content .r1d-alert').count()>=1,'The late invoice alert stays');
    await page.evaluate(()=>{state.invoices=state.invoices.filter(i=>i.id!=='i1');state.invoices.forEach(i=>{i.status='paid';i.payments=[{date:today(),amount:invoiceGross(i)}]});render()});
    assert.match(await line.innerText(),/Je bent helemaal bij/,'Nothing open: helemaal bij');
    await context.close();
  }

  // klopt.js: 5 ask sheet, 7 cents in sheets, 9 links, 11 compact title.
  {
    const {context,page}=await openApp('?klopt=1');
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('boekuna-klopt')),true);
    let native=0;page.on('dialog',dg=>{native++;dg.dismiss()});

    // 5. A Boekuna sheet; Annuleren keeps it, the red button removes it.
    await page.evaluate(()=>deleteQuote('q1'));
    const ask=page.locator('.bk-confirm:not(.is-leaving) [role=alertdialog]');
    await ask.waitFor();
    assert.equal(await ask.locator('h2').innerText(),'Offerte OFF-0001 verwijderen?');
    assert.deepEqual(await texts(ask.locator('button')),['Verwijderen','Annuleren']);
    assert.equal(await page.evaluate(()=>document.activeElement?.className),'bk-confirm-no','The safe choice has the focus');
    assert.equal(await ask.locator('.bk-confirm-yes').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(217, 58, 48)','A red button');
    await ask.locator('.bk-confirm-no').click();
    await page.locator('.bk-confirm').first().waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>state.quotes.length),1,'Annuleren keeps it');
    await page.evaluate(()=>deleteQuote('q1'));
    await ask.waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.bk-confirm').first().waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>state.quotes.length),1,'Escape keeps it');
    await page.evaluate(()=>deleteQuote('q1'));
    await ask.locator('.bk-confirm-yes').click();
    assert.equal(await page.evaluate(()=>state.quotes.length),0,'Verwijderen removes it');
    assert.equal(await page.evaluate(()=>{let yes=0;askConfirm('x',{title:'Weg?'},()=>{yes++});document.querySelector('.bk-confirm:not(.is-leaving) .bk-confirm-yes').click();return yes}),1,'The red button goes ahead');
    assert.equal(native,0,'No browser pop-up');
    // Uren go at once, with Ongedaan maken.
    await page.evaluate(()=>deleteHour('h1'));
    assert.equal(await page.evaluate(()=>state.hours.length),0);
    await page.locator('#toastRoot .toast-undo .toast-action').click();
    assert.equal(await page.evaluate(()=>state.hours.length),1,'Ongedaan maken puts the hours back');

    // 7. Small cents in the sheets too.
    await page.evaluate(()=>expenseActions('e1'));
    assert.match(await page.locator('#modalRoot .expense-detail-amount .amount-cents').innerText(),/^,\d{2}$/);
    await page.evaluate(()=>{closeModal();viewInvoice('i1')});
    assert.equal(await page.locator('#modalRoot .invoice-view-amount .amount-cents').innerText(),',00');
    // 9. Links are green text, not underlined.
    const deco=await page.locator('#modalRoot .party-history').count();assert.equal(deco,1);
    await page.evaluate(()=>{closeModal();expenseActions('e3')});
    assert.equal(await page.locator('#modalRoot .expense-receipt-link').evaluate(el=>getComputedStyle(el).textDecorationLine),'none');
    await page.evaluate(()=>closeModal());
    await page.evaluate(()=>navigate('reports'));
    await page.waitForFunction(()=>!!document.querySelector('#content .report-story-amount .amount-cents'));
    for(const p of ['dashboard','invoices','expenses','documents','vat','trips','settings']){
      await page.evaluate(p=>navigate(p),p);
      const underlined=await page.evaluate(()=>[...document.querySelectorAll('#content *')].filter(el=>el.offsetParent&&el.textContent.trim()&&getComputedStyle(el).textDecorationLine.includes('underline')).map(el=>el.className));
      assert.deepEqual(underlined,[],'No underlined links on '+p);
    }

    // 11. The big title scrolls away; a thin bar with the small title stays at the top.
    await page.evaluate(()=>{navigate('invoices');window.scrollTo(0,0)});
    await page.waitForFunction(()=>!document.documentElement.classList.contains('bk-compact'));
    assert.equal(await page.locator('#pageTitle').evaluate(el=>getComputedStyle(el).opacity),'0');
    await page.evaluate(()=>{state.invoices=state.invoices.concat(Array.from({length:12},(_,n)=>({id:'x'+n,number:'2026-01'+n,status:'paid',kind:'invoice',customerId:'c2',issueDate:today(),dueDate:today(),lines:[{desc:'Werk',qty:1,unit:10,vat:21}],payments:[{date:today(),amount:12.1}]})));render();window.scrollTo(0,420)});
    await page.waitForFunction(()=>document.documentElement.classList.contains('bk-compact'));
    const bar=await page.locator('#mainApp .topbar').boundingBox();
    assert.ok(Math.abs(bar.y)<1,'The bar stays at the top');
    assert.equal(await page.locator('#pageTitle').innerText(),'Inkomsten');
    await page.waitForFunction(()=>getComputedStyle(document.getElementById('pageTitle')).opacity==='1');
    assert.ok(await page.locator('#globalSearchButton').isVisible(),'Search stays in reach');
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.waitForFunction(()=>!document.documentElement.classList.contains('bk-compact'));

    // 12. The chosen tab has a filled icon.
    assert.equal(await page.locator('#mobileBottomNav [data-mobile-page="invoices"] .icon').evaluate(el=>getComputedStyle(el).fillOpacity),'0.22');
    await context.close();
  }

  // 14. Pull a sheet down anywhere (not only on its head) when it is scrolled to the top (motion.js). Chromium has Touch().
  if(browserName==='chromium'){
    const {context,page}=await openApp('?motion=1');
    await page.evaluate(()=>expenseActions('e1'));
    await page.locator('#modalRoot .modal').waitFor();
    await page.waitForTimeout(450);
    const pull=(sel,dy)=>page.evaluate(([sel,dy])=>{
      const el=document.querySelector(sel),r=el.getBoundingClientRect(),x=r.left+20,y=r.top+10;
      const t=yy=>new Touch({identifier:1,target:el,clientX:x,clientY:yy});
      el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches:[t(y)],targetTouches:[t(y)],changedTouches:[t(y)]}));
      for(let i=1;i<=8;i++){const yy=y+dy*i/8;el.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[t(yy)],targetTouches:[t(yy)],changedTouches:[t(yy)]}))}
      el.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,touches:[],targetTouches:[],changedTouches:[t(y+dy)]}));
    },[sel,dy]);
    // A short pull springs back.
    await pull('#modalRoot .expense-detail-list',40);
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#modalRoot .modal .expense-detail').count(),1,'A short pull lets the sheet spring back');
    // A long pull closes it.
    await pull('#modalRoot .expense-detail-list',220);
    await page.waitForFunction(()=>!document.querySelector('#modalRoot .modal:not(.motion-sheet-ghost .modal) .expense-detail')||!!document.querySelector('#modalRoot .motion-sheet-ghost'));
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(()=>document.querySelectorAll('#modalRoot .modal-backdrop:not(.motion-sheet-ghost)').length),0,'A long pull closes the sheet');
    await context.close();
  }

  assert.deepEqual(errors,[],'No page errors');
  console.log('UI-trucs ok ('+browserName+')');
}finally{
  await browser.close();server.close();
}
