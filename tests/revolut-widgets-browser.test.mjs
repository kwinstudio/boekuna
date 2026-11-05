// Premium zoals Revolut (Kwin 2026-10-23), phone only: the overview blocks are widgets you switch on or off and
// reorder in a sheet. Since 2026-11-02 there is one fixed theme (Diep groen): no Thema sheet. Desktop stays as it was.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';

execFileSync(process.execPath,['scripts/build-app.mjs']);
const generated=fs.readFileSync('dist/app/index.html','utf8');
const browserName=process.env.BOOKUNA_BROWSER||'chromium';
const day=new Date().toISOString().slice(0,10);
const boot=`currentUser={...TEST_USER,email:'qa@example.test',supabaseUser:{user_metadata:{first_name:'Kwin'}}};state=structuredClone(DEFAULT);
for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
state.company={...state.company,name:'Fictieve QA BV',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',kvk:'12345678',vat:'NL123456789B01',email:'qa@example.test',iban:'NL91ABNA0417164300'};
state.contacts=[{id:'c1',type:'customer',name:'Bakkerij de Vries',email:'info@bakkerij.test',address:'Klantstraat 2',postal:'3011AB',city:'Rotterdam'}];
state.invoices=[{id:'i1',number:'2026-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:'${day}',dueDate:'${day}',lines:[{desc:'Fictieve dienst',qty:10,unit:100,unitLabel:'uur',vat:21}],payments:[]}];
state.expenses=[{id:'e1',date:'${day}',vendor:'Tankstation',category:'Reiskosten',exVat:50,vatRate:21}];
state.hours=[{id:'h1',date:'${day}',hours:6,desc:'QA'}];
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
const errors=[];
// WebKit's innerText keeps line breaks between flex children; compare words only.
const text=async loc=>(await loc.innerText()).replace(/\s+/g,' ').trim();

async function openApp(width,height,colorScheme='light'){
  const context=await browser.newContext({viewport:{width,height},locale:'nl-NL',colorScheme});
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.fulfill({status:404,body:''}));
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.setDefaultTimeout(5000);
  await page.goto(url+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#mainApp').waitFor();
  return {context,page};
}

try{
  const {context,page}=await openApp(390,844);
  // 1. The overview opens exactly as before: the five default widgets, in the R1D order.
  assert.deepEqual(await page.locator('#content .r1d-bento .r1d-w').evaluateAll(els=>els.map(e=>e.dataset.widget)),['omzet','kosten','open','vrij','recent']);
  assert.equal(await page.locator('#content .r1d-custom-btn').count(),1,'only the Widgets pill under the blocks (one fixed theme since 2026-11-02)');
  assert.equal(await text(page.locator('#content .r1d-custom')),'Widgets');
  // The hours pill stays while Uren is not a widget.
  assert.equal(await text(page.locator('#content .r1d-hours')),'6 / 1.225 uur');

  // 2. Widgets sheet: every widget as a live preview, the five defaults on, the rest off; the drag library is there.
  await page.locator('#content .r1d-custom-btn',{hasText:'Widgets'}).click();
  const sheet=page.locator('#modalRoot .modal.widget-sheet');
  await sheet.waitFor();
  assert.equal(await text(sheet.locator('#modalTitle')),'Widgets');
  assert.equal(await sheet.locator('.r1d-wcard').count(),11);
  assert.equal(await sheet.locator('.r1d-wcard.is-on').count(),5);
  assert.match(await text(sheet.locator('.r1d-wcard[data-widget="omzet"] .calm-value')),/^€\s?1\.000,00$/);
  assert.equal(await text(sheet.locator('.r1d-wcard[data-widget="uren"] .r1d-text')),'6');
  assert.ok(await page.evaluate(()=>typeof Sortable==='function'),'SortableJS loaded for drag ordering');
  // No focus ring on the close button after a tap.
  // The sheet moves focus off the close button two frames after opening; WebKit can be a frame late.
  await page.waitForFunction(()=>(document.activeElement?.className||'')!=='modal-close');
  // 3. A tap switches a widget on; the choice is saved on the account; the overview follows after Klaar.
  await sheet.locator('.r1d-wcard[data-widget="uren"] .r1d-wtoggle').click();
  assert.match(await sheet.locator('.r1d-wcard[data-widget="uren"]').getAttribute('class'),/\bis-on\b/);
  assert.equal(await sheet.locator('.r1d-wcard[data-widget="uren"] .r1d-wtoggle').getAttribute('aria-pressed'),'true');
  await sheet.locator('.r1d-wcard[data-widget="kosten"] .r1d-wtoggle').click();
  assert.deepEqual(await page.evaluate(()=>state.meta.overviewWidgets),['omzet','open','vrij','recent','uren']);
  await sheet.locator('.r1d-wdone').click();
  await page.locator('#modalRoot .modal').waitFor({state:'detached'});
  assert.deepEqual(await page.locator('#content .r1d-bento .r1d-w').evaluateAll(els=>els.map(e=>e.dataset.widget)),['omzet','open','vrij','recent','uren']);
  assert.equal(await text(page.locator('#content .r1d-w[data-widget="uren"] .r1d-text')),'6');
  assert.equal(await page.locator('#content .r1d-hours').count(),0,'The hours pill is gone once Uren is a widget');
  assert.equal(await page.locator('#content .r1d-w[data-widget="kosten"]').count(),0);
  // The grid never leaves a widget half hidden: a wide widget spans both columns.
  const omzetBox=await page.locator('#content .r1d-w[data-widget="omzet"]').boundingBox();
  const bentoBox=await page.locator('#content .r1d-bento').boundingBox();
  assert.ok(Math.abs(omzetBox.width-bentoBox.width)<2,'Omzet is as wide as the grid');
  // Reordering through the drag library is committed the same way.
  await page.locator('#content .r1d-custom-btn',{hasText:'Widgets'}).click();
  await sheet.waitFor();
  await page.evaluate(()=>{const g=document.getElementById('widgetGrid');g.insertBefore(g.querySelector('[data-widget="uren"]'),g.firstChild);commitWidgetSheet()});
  assert.deepEqual(await page.evaluate(()=>state.meta.overviewWidgets),['uren','omzet','open','vrij','recent']);
  await page.evaluate(()=>closeWidgetSheet());
  assert.equal(await page.locator('#content .r1d-bento .r1d-w').first().getAttribute('data-widget'),'uren');
  // Kwin 2026-10-24 ("slepen klopt niet"): what you see follows the chosen order exactly; no block jumps forward into a gap.
  await page.evaluate(()=>{setPhoneWidgets(['open','omzet','vrij','kosten','recent']);render()});
  const seen=await page.locator('#content .r1d-bento .r1d-w').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {id:e.dataset.widget,y:Math.round(r.top),x:Math.round(r.left)}}).sort((a,b)=>a.y-b.y||a.x-b.x).map(o=>o.id));
  assert.deepEqual(seen,['open','omzet','vrij','kosten','recent'],'reading order on screen = chosen order');
  assert.ok(await page.locator('#content .r1d-w[data-widget="open"]').evaluate(el=>el.classList.contains('r1d-w-wide')),'a small block alone on its row fills the row');
  await page.evaluate(()=>{setPhoneWidgets(['uren','omzet','open','vrij','recent']);render()});

  // 4. One theme (Kwin 2026-11-02, "kies gewoon één thema"): no Thema pill or sheet, no band colours, no Sfeer photos.
  assert.equal(await page.evaluate(()=>typeof openThemeSheet+'|'+typeof setPhoneBand+'|'+typeof setPhoneSfeer),'undefined|undefined|undefined');
  assert.equal(await page.evaluate(()=>'band' in document.documentElement.dataset||'sfeer' in document.documentElement.dataset),false);
  // An old choice on the account or this device paints nothing any more.
  await page.evaluate(()=>{localStorage.setItem('boekuna-band','oceaan');state.meta.band='oceaan';state.meta.sfeer='marmer';render()});
  assert.equal(await page.evaluate(()=>'band' in document.documentElement.dataset||'sfeer' in document.documentElement.dataset),false);
  assert.equal(await page.locator('#content .r1d-hero').evaluate(el=>getComputedStyle(el).getPropertyValue('--r1d-top').trim()),'#121614','One colour everywhere (kleur C, Kwin 2026-11-05)');
  // Instellingen > App keeps only Weergave (Automatisch, Licht, Donker): no colour or photo choice.
  await page.evaluate(()=>navigate('settings'));
  await page.locator('.settings-nav-item[data-settings-open="app"]').click();
  await page.locator('#settings-panel-app .settings-theme').waitFor();
  assert.equal(await page.locator('.settings-band,.settings-sfeer,.settings-band-option,.settings-sfeer-option').count(),0);
  assert.equal(await text(page.locator('#settings-panel-app .settings-theme legend')),'Weergave');
  // 7. Round 2 (Kwin 2026-10-23 'fix'): one logic on every band page, no second button with the same name.
  assert.ok(generated.includes('fallbackOnBody:true')&&generated.includes('touchStartThreshold:8'),'drag follows the finger from <body> and tolerates a wobble while holding');
  await page.evaluate(()=>navigate('vat'));
  assert.equal(await text(page.locator('#content .r1d-hero .r1d-pill-btn')),await text(page.locator('#content .r1d-hero .r1d-pill-btn .vat-period-label')),'Btw band shows the period as a pill');
  assert.ok((await text(page.locator('#content .r1d-hero .r1d-pill-btn'))).length>0,'period pill has text');
  assert.equal(await page.locator('#content .r1d-hero .page-period-stack .page-filter-btn').count(),0,'no lone filter icon in the Btw band');
  assert.ok((await page.locator('#content .r1d-hero .r1d-pill-btn.page-filter-btn').count())===1,'the period pill is the Btw filter button');
  await page.evaluate(()=>navigate('documents'));
  assert.equal(await text(page.locator('#content .r1d-hero h1')),'Bonnen','phone title matches the tab bar');
  await page.evaluate(()=>navigate('contacts'));
  assert.equal(await text(page.locator('#content .r1d-hero .r1d-action')),'Relatie');
  await page.evaluate(()=>navigate('services'));
  assert.equal(await text(page.locator('#content .r1d-hero .r1d-action')),'Dienst');
  await page.evaluate(()=>navigate('reports'));
  assert.match(await text(page.locator('#content .r1d-hero .r1d-story-hero .report-story-amount')),/^€/,'Rapportages total sits in the band');
  assert.equal(await page.locator('#content .report-story .report-story-amount').count(),0);

  // 8. The one theme (kleur C, Kwin 2026-11-05): the green accent on every button, the open tab ink on the white bar, a light page.
  const rgb=h=>'rgb('+[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)).join(', ')+')';
  await page.evaluate(()=>navigate('documents'));
  const primary=page.locator('#content .btn.primary').first();
  // The pointer rests where the last tap was; keep it off the button so its hover colour does not count.
  await page.mouse.move(1,1);
  // Buttons animate their colour, so each check waits for the transition to land.
  const settles=async(loc,prop,value,msg)=>{const el=await loc.elementHandle();try{await page.waitForFunction(([e,p,v])=>getComputedStyle(e)[p]===v,[el,prop,value],{timeout:4000})}catch(e){}assert.equal(await loc.evaluate((e,p)=>getComputedStyle(e)[p],prop),value,msg)};
  await settles(primary,'backgroundColor',rgb('#63D471'),'the green primary button');
  await settles(page.locator('#mobileBottomNav .mobile-bottom-nav-item.active span').first(),'color',rgb('#121614'),'the active tab is ink on the white bar');
  const canvas=()=>page.evaluate(()=>getComputedStyle(document.body,'::before').backgroundImage);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),rgb('#F4F4F2'),'the page is light');
  assert.doesNotMatch(await canvas(),/sfeer-/,'no photo');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body,'::before').position),'fixed','the colour stays put while the page scrolls');
  assert.ok(!generated.includes("localStorage.getItem('boekuna-sfeer')")&&!generated.includes("localStorage.getItem('boekuna-band')"),'the boot script no longer paints a band or photo');
  assert.ok(!fs.existsSync('dist/app/assets/sfeer-marmer.webp'),'the Sfeer photos are no longer shipped');
  await context.close();

  // 6. Desktop is untouched: no widgets grid, no pills, no band attribute effect on the dashboard.
  const desktop=await openApp(1280,900);
  assert.equal(await desktop.page.locator('#content .r1d-bento').count(),0);
  assert.equal(await desktop.page.locator('#content .r1d-custom').count(),0);
  assert.equal(await desktop.page.locator('#content .r1d-hero').count(),0);
  await desktop.context.close();

  assert.deepEqual(errors,[],'No page errors');
  console.log('Revolut widgets and one-theme browser test passed ('+browserName+')');
}finally{
  await browser.close();
  server.close();
}
