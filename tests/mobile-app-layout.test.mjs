import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
fs.mkdirSync('tests/artifacts',{recursive:true});

assert.match(original,/--mobile-viewport-height/,'Mobile modal CSS must follow the visual viewport height');
assert.match(original,/--mobile-viewport-offset-top/,'Mobile modal CSS must follow the visual viewport offset');
assert.match(original,/\.field input,\.field select,\.field textarea\{font-size:16px\}/,'Mobile inputs need 16px to prevent iOS focus zoom');
assert.match(original,/visualViewport\.offsetTop/,'App-only viewport sync includes iOS offset');
assert.match(original,/keepFocusedModalFieldVisible/,'Focused modal fields stay visible over keyboard');
assert.match(original,/visualViewport\.addEventListener\('scroll',syncKeyboardOffset\)/,'App handles visual viewport panning');

function replaceLast(source,needle,replacement){
  const i=source.lastIndexOf(needle);
  if(i<0)throw new Error('Missing bootstrap marker: '+needle);
  return source.slice(0,i)+replacement+source.slice(i+needle.length);
}

assert.equal((original.match(/class="mobile-bottom-nav-item/g)||[]).length,5,'Mobile bottom navigation must contain exactly five destinations');
for(const label of ['Overzicht','Inkomsten','Kosten','Btw','Bonnen'])assert.match(original,new RegExp('<span>'+label+'</span>'),'Missing mobile nav label '+label);

const logoutSource=original.slice(original.indexOf('async function logoutUser'),original.indexOf('async function requireMfaForUser'));
assert.match(logoutSource,/try\{await syncCloudStateNow\(\)\}catch/,'Final sync must be isolated from logout');
assert.match(logoutSource,/try\{const sb=await getSupabase\(\);await sb\.auth\.signOut\(\)\}catch/,'Supabase signOut must be attempted independently');
assert.match(original,/function dashboardGreeting\(\)/,'Dashboard greeting helper must exist');
assert.match(original,/function dashboardAttentionItems\(\)/,'Attention Center must use a dedicated source builder');
assert.match(original,/documentProcessingFetchError=false/,'Document attention must track explicit fetch failures');
assert.match(original,/async function retryDocumentAttentionFetch\(\)/,'Document attention must expose a safe retry path');

const fixtureBootstrap=[
  "currentUser={...TEST_USER,email:'kwin@example.test',supabaseUser:{user_metadata:{first_name:'Kwin'}}};",
  "state=structuredClone(DEFAULT);",
  "state.company={...state.company,name:'QA Test BV',tradeName:'Boekuna QA',contactName:'Kwin',email:'qa@example.test',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',kor:false};",
  "state.contacts=[{id:'c1',type:'customer',name:'QA Klant BV',email:'klant@example.test',address:'Klantstraat 2',postal:'3012BB',city:'Rotterdam'}];",
  "state.invoices=[{id:'i1',number:'2026-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:'2026-08-01',dueDate:'2026-08-15',taxTreatment:'standard',payments:[],importedTotals:{net:100,vat:21,gross:121}}];",
  "state.transactions=[{id:'t1',date:'2026-09-01',description:'QA bankregel',amount:-10,status:'unmatched'}];",
  "documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;",
  "enterApp();"
].join('\n');

let appHtml=original.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
appHtml=replaceLast(appHtml,'initAuth();',fixtureBootstrap);

const logoutBootstrap=[
  "currentUser={id:'logout-test',email:'logout@example.test',supabaseUser:{user_metadata:{first_name:'Kwin'}}};",
  "state=structuredClone(DEFAULT);state.company={...state.company,name:'QA Test BV',contactName:'Kwin'};",
  "window.__signOutCalled=0;",
  "syncCloudStateNow=async()=>{throw new Error('simulated sync failure')};",
  "getSupabase=async()=>({auth:{signOut:async()=>{window.__signOutCalled++;return {error:null}}}});",
  "initDocumentBackgroundProcessing=async()=>{};loadBillingSummary=async()=>{};handleBillingReturnAndPlan=async()=>{};handleMailboxReturn=()=>{};resumePendingDocumentVerifications=async()=>{};",
  "enterApp();"
].join('\n');
const logoutHtml=replaceLast(original,'initAuth();',logoutBootstrap);

const fetchFailureBootstrap=[
  "currentUser={id:'fetch-test',email:'fetch@example.test',supabaseUser:{user_metadata:{first_name:'Kwin'}}};",
  "state=structuredClone(DEFAULT);state.company={...state.company,name:'QA Test BV',contactName:'Kwin'};",
  "window.__docFetchAttempts=0;",
  "initDocumentBackgroundProcessing=async()=>{};loadBillingSummary=async()=>{};handleBillingReturnAndPlan=async()=>{};handleMailboxReturn=()=>{};resumePendingDocumentVerifications=async()=>{};",
  "getSupabase=async()=>{const chain={select(){return chain},eq(){return chain},order(){return chain},limit:async()=>{window.__docFetchAttempts++;return window.__docFetchAttempts===1?{data:null,error:new Error('simulated initial document fetch failure')}:{data:[],error:null}}};return {from:()=>chain}};",
  "enterApp();",
  "fetchDocumentProcessingJobs().catch(()=>{});"
].join('\n');
const fetchFailureHtml=replaceLast(original,'initAuth();',fetchFailureBootstrap);

const mime={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
const publicRoot=new URL('../public/',import.meta.url);
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(pathname.startsWith('/assets/')||pathname==='/favicon.ico'){
    const relative=pathname.replace(/^\//,'');
    const file=new URL(relative,publicRoot);
    try{
      if(fs.existsSync(file)){
        const ext=path.extname(file.pathname);
        res.writeHead(200,{'content-type':mime[ext]||'application/octet-stream','cache-control':'no-store'});
        return fs.createReadStream(file).pipe(res);
      }
    }catch{}
  }
  if(pathname==='/manifest.webmanifest'){res.writeHead(200,{'content-type':'application/manifest+json'});return res.end('{}')}
  const body=pathname==='/logout'?logoutHtml:(pathname==='/fetch-failure'?fetchFailureHtml:appHtml);
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(body);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {port}=server.address();
const base='http://127.0.0.1:'+port;

const browserName=(process.env.BOOKUNA_BROWSER||'chromium')==='webkit'?'webkit':'chromium';
const browserType=browserName==='webkit'?webkit:chromium;
const browser=await browserType.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
const pageErrors=[];
page.on('pageerror',error=>pageErrors.push(String(error)));

try{
  await page.goto(base+'/app',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Overzicht'}).waitFor();
  assert.equal(pageErrors.length,0,'Mobile dashboard must load without JavaScript errors: '+pageErrors.join(' | '));

  const navLabels=await page.locator('#mobileBottomNav .mobile-bottom-nav-item').allTextContents();
  assert.deepEqual(navLabels.map(v=>v.trim()),['Overzicht','Inkomsten','Kosten','Btw','Bonnen']);
  assert.notEqual(await page.locator('#mobileBottomNav').evaluate(el=>getComputedStyle(el).display),'none','Bottom navigation must be visible on mobile');
  assert.equal(await page.locator('[data-mobile-page="dashboard"]').getAttribute('aria-current'),'page');

  const greeting=await page.locator('.dashboard-page-head .page-status').innerText();
  assert.match(greeting,/^(Goedemorgen|Goedemiddag|Goedenavond), Kwin$/,'Dashboard context must use local daypart and first name');

  await page.locator('.dashboard-attention h2').filter({hasText:'Nog te doen'}).waitFor();
  const attentionText=await page.locator('.dashboard-attention').innerText();
  assert.match(attentionText,/Factuur 2026-0001 is nog niet betaald/);
  assert.match(attentionText,/1 bankregel koppelen/);
  assert.doesNotMatch(attentionText,/Btw Q\d+ controleren/,'Generic VAT action must not appear');

  assert.equal(await page.locator('.dashboard-kpis').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length),1,'390px dashboard KPI layout must use the single-column mobile reference flow');
  await page.screenshot({path:`tests/artifacts/mobile-dashboard-${browserName}-390.png`,fullPage:true});

  await page.locator('[data-mobile-page="invoices"]').click();
  await page.locator('#pageTitle').filter({hasText:'Inkomsten'}).waitFor();
  assert.equal(await page.locator('[data-mobile-page="invoices"]').getAttribute('aria-current'),'page');

  await page.locator('#mobileMenu').click();
  assert.ok(await page.locator('#sidebar').evaluate(el=>el.classList.contains('open')),'Menu must open the full mobile drawer');
  assert.equal(await page.locator('#mobileMenu').getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('#mobileLogoutButton').count(),0,'Logout must not remain in the work/navigation drawer');
  assert.ok(await page.locator('.nav-item[data-page="settings"]').isVisible(),'Settings must remain directly available from the drawer');

  await page.locator('#mobileDrawerBackdrop').click({position:{x:380,y:200}});
  assert.equal(await page.locator('#pageTitle').innerText(),'Inkomsten','Backdrop close must preserve current route');
  assert.ok(!(await page.locator('#sidebar').evaluate(el=>el.classList.contains('open'))),'Backdrop must close drawer');

  await page.locator('#mobileMenu').click();
  await page.keyboard.press('Escape');
  assert.ok(!(await page.locator('#sidebar').evaluate(el=>el.classList.contains('open'))),'Escape must close drawer');

  await page.locator('#mobileMenu').click();
  await page.locator('.nav-item[data-page="documents"]').click();
  await page.locator('#pageTitle').filter({hasText:'Bonnetjes'}).waitFor();
  const scanChooserEvent=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Document uploaden',exact:true}).click();
  const scanChooser=await scanChooserEvent;
  assert.equal(scanChooser.isMultiple(),true,'Document upload supports multiple documents');
  assert.equal(await page.locator('.source-picker').count(),0,'Document upload opens the native chooser directly');
  assert.equal(await page.locator('#invoicePdfFile').getAttribute('capture'),null,'Document upload preserves camera, library and files');
  await page.evaluate(()=>{documentProcessingJobs=[{id:'job-1',client_ref:'doc-1',file_name:'bon.jpg',state:'review_required'}];documentProcessingInitialized=true;renderGlobalDocumentIndicator()});
  assert.equal(await page.locator('#documentAttentionBadge').innerText(),'1','Document badge must reuse persistent document attention count');

  await page.locator('[data-mobile-page="expenses"]').click();
  await page.locator('#pageTitle').filter({hasText:'Kosten'}).waitFor();
  await page.locator('[data-mobile-page="vat"]').click();
  await page.locator('#pageTitle').filter({hasText:'Btw'}).waitFor();

  await page.locator('[data-mobile-page="dashboard"]').click();
  await page.locator('#pageTitle').filter({hasText:'Overzicht'}).waitFor();

  // Simulate a 410px iOS visual viewport above the keyboard, including viewport panning.
  await page.evaluate(()=>newInvoice());
  await page.locator('#modalRoot .modal').waitFor();
  await page.evaluate(()=>{
    document.documentElement.style.setProperty('--mobile-viewport-height','410px');
    document.documentElement.style.setProperty('--mobile-viewport-offset-top','100px');
  });
  await page.locator('#modalRoot .modal').evaluate(async el=>{
    await Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{})));
  });
  const keyboardBackdrop=await page.locator('#modalRoot .modal-backdrop').boundingBox();
  const keyboardSheet=await page.locator('#modalRoot .modal').boundingBox();
  assert.ok(keyboardBackdrop&&Math.abs(keyboardBackdrop.y-100)<3,'Keyboard modal backdrop must follow the visual viewport top');
  assert.ok(Math.abs(keyboardBackdrop.height-410)<3,'Keyboard modal backdrop must fit the visible viewport height');
  assert.ok(keyboardSheet&&keyboardSheet.height<=404,'Invoice modal must not exceed the visible keyboard viewport');
  assert.ok(keyboardSheet.y>=keyboardBackdrop.y-2,'Invoice sheet must remain within the visible keyboard viewport');
  assert.ok(keyboardSheet.y+keyboardSheet.height<=keyboardBackdrop.y+keyboardBackdrop.height+2,'Invoice sheet must stay above the simulated keyboard');
  assert.equal(await page.locator('#modalRoot .field input').first().evaluate(el=>getComputedStyle(el).fontSize),'16px','Mobile invoice fields must prevent iOS input focus zoom');
  await page.evaluate(()=>{
    document.documentElement.style.removeProperty('--mobile-viewport-height');
    document.documentElement.style.removeProperty('--mobile-viewport-offset-top');
    closeModal();
  });

  // COMPACT UX — opt-in help is account-scoped, default off; warnings remain visible.
  await page.evaluate(()=>navigate('settings'));
  // This source-artifact test does not load the generated mobile settings index.
  // Generated-app coverage below verifies that Weergave is reachable through that index.
  const extraHelp=page.locator('#extraHelpToggle');
  assert.ok(await extraHelp.isVisible(),'Compact guidance switch must be in Settings');
  assert.equal(await extraHelp.isChecked(),false,'Extra explanation must default off');
  await extraHelp.check();
  assert.equal(await page.evaluate(()=>state.meta.extraHelpEnabled),true,'Extra explanation preference must be saved in account state');
  await page.evaluate(()=>navigate('dashboard'));
  assert.equal((await page.locator('.dashboard-kpi-profit .metric-sub').innerText()).trim(),'Omzet minus kosten','Enabled extra explanation must show the profit hint');
  await page.evaluate(()=>navigate('settings'));
  await page.locator('#extraHelpToggle').uncheck();
  await page.evaluate(()=>navigate('dashboard'));
  assert.equal(await page.locator('.dashboard-kpi-profit .metric-sub').count(),0,'Compact mode must remove repeated profit copy');

  // REPORTING — week/month/quarter/year/all + compact date chooser, multi-year annual bars.
  await page.evaluate(()=>{
    state.invoices.push({id:'compact-older',number:'2023-QA',kind:'invoice',status:'paid',customerId:'c1',issueDate:'2023-01-10',dueDate:'2023-01-24',importedTotals:{net:300,vat:63,gross:363},payments:[{date:'2023-01-15',amount:363}]});
  });
  await page.evaluate(()=>navigate('reports'));
  const reportPeriod=page.locator('#reportPeriodPreset');
  assert.deepEqual(await reportPeriod.locator('option').allTextContents(),['Deze week','Deze maand','Dit kwartaal','Dit jaar','Alles'],'Reports show the shared quick period choices');
  await reportPeriod.selectOption('all');
  assert.ok((await page.locator('.report-result-chart .bar-label').allTextContents()).includes('2023'),'Multi-year result graph must include historical book years');
  // A custom period lives under Filters.
  await page.locator('.page-filter-btn').click();
  await page.locator('#reportFilterPeriod').selectOption('custom');
  assert.ok(await page.locator('#reportFilterFrom').isVisible(),'Van/Tot appear for a custom period');
  await page.locator('#reportFilterFrom').fill('2024-01-01');
  await page.locator('button[form="reportFilterForm"]').click();
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('reportPreset')),'custom','Filters set a custom period');
  assert.equal(await page.locator('.page-filter-row .list-filter-chip').count(),1,'The custom period shows as a removable chip');
  await page.evaluate(()=>{state.invoices=state.invoices.filter(i=>i.id!=='compact-older');sessionStorage.removeItem('reportPreset');sessionStorage.removeItem('reportFrom');sessionStorage.removeItem('reportTo');navigate('dashboard')});

  // Independent QA additions: focus containment/return, non-primary active state,
  // breakpoint cleanup, long-name overflow, and desktop width coverage.
  await page.locator('#mobileMenu').click();
  await page.waitForFunction(()=>document.activeElement===document.querySelector('#sidebar button:not([disabled])'));
  assert.ok(await page.evaluate(()=>document.getElementById('sidebar').contains(document.activeElement)),'Drawer must move focus inside itself');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset?.page),'settings','Shift+Tab from first drawer control must wrap to the last drawer control');
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.activeElement?.id==='mobileMenu');
  assert.equal(await page.locator('#mobileMenu').getAttribute('aria-expanded'),'false','Escape close must restore trigger state');

  // Bonnen sits in the bottom bar; everything else is reachable from the menu at the top left.
  await page.locator('#mobileBottomNav [data-mobile-page="documents"]').click();
  assert.equal(await page.locator('#mobileBottomNav [data-mobile-page="documents"]').getAttribute('aria-current'),'page','Bonnen is a direct bottom nav destination');
  await page.evaluate(async()=>{await navigate('settings')});
  assert.equal(await page.locator('#mobileBottomNav [aria-current="page"]').count(),0,'Secondary screens highlight no bottom nav item');
  await page.evaluate(async()=>{await navigate('dashboard')});

  await page.setViewportSize({width:820,height:900});
  await page.locator('#mobileMenu').click();
  assert.ok(await page.locator('#sidebar').evaluate(el=>el.classList.contains('open')),'Drawer must open at 820px');
  await page.setViewportSize({width:821,height:900});
  await page.waitForFunction(()=>!document.getElementById('sidebar').classList.contains('open'));
  assert.equal(await page.locator('#mobileDrawerBackdrop').evaluate(el=>el.classList.contains('open')),false,'Breakpoint transition must clear backdrop');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('mobile-drawer-open')),false,'Breakpoint transition must restore body scrolling');
  assert.equal(await page.locator('#appMain').evaluate(el=>el.inert),false,'Breakpoint transition must clear main inert state');
  assert.equal(await page.locator('#mobileBottomNav').evaluate(el=>el.inert),false,'Breakpoint transition must clear bottom-nav inert state');

  await page.setViewportSize({width:320,height:700});
  await page.evaluate(()=>{
    currentUser.supabaseUser.user_metadata.first_name='AlexandertheGreatSupercalifragilisticLongfirstnameWithoutAnyBreaks';
    page='dashboard';render();
  });
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'Long first name must not create horizontal overflow at 320px');
  await page.evaluate(()=>{currentUser.supabaseUser.user_metadata.first_name='Kwin';render()});

  for(const width of [1024,1280]){
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'No global horizontal overflow at '+width+'px');
    assert.equal(await page.locator('#mobileBottomNav').evaluate(el=>getComputedStyle(el).display),'none','Desktop bottom nav must be hidden at '+width+'px');
  }
  await page.setViewportSize({width:390,height:844});

  await page.evaluate(()=>{state.invoices=[];state.transactions=[];state.documents=[];state.contacts=[];state.bookings=[];documentProcessingJobs=[];documentProcessingConnectivityLost=false;documentProcessingInitialized=true;render()});
  await page.getByRole('heading',{name:'Aandachtspunten',exact:true}).waitFor();
  await page.getByText('Alles bijgewerkt',{exact:true}).waitFor();

  await page.evaluate(()=>{documentProcessingConnectivityLost=true;render()});
  await page.getByText('Aandachtspunten niet bijgewerkt').waitFor();
  assert.equal(await page.getByText('Alles bijgewerkt',{exact:true}).count(),0);

  await page.evaluate(()=>{state.invoices=[];documentProcessingConnectivityLost=false;render();openDashboardAttention('overdue','stale')});
  await page.getByText('Dit aandachtspunt is inmiddels bijgewerkt.').waitFor();

  for(const width of [320,360,375,390,393,430,768,820]){
    await page.setViewportSize({width,height:Math.max(700,Math.round(width*1.9))});
    await page.evaluate(()=>{if(page!=='dashboard'){page='dashboard';render()}});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'No global horizontal overflow at '+width+'px');
  }
  await page.setViewportSize({width:320,height:700});
  assert.equal(await page.locator('.dashboard-kpis').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length),1,'Very narrow phones may fall back to one KPI column');

  await page.setViewportSize({width:1024,height:800});
  assert.equal(await page.locator('#mobileBottomNav').evaluate(el=>getComputedStyle(el).display),'none','Desktop must keep the existing sidebar without bottom nav');
  assert.notEqual(await page.locator('#sidebar').evaluate(el=>getComputedStyle(el).display),'none');

  await page.setViewportSize({width:390,height:844});
  await page.goto(base+'/fetch-failure',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Overzicht'}).waitFor();
  await page.getByText('Aandachtspunten niet bijgewerkt').waitFor();
  assert.equal(await page.getByText('Alles bijgewerkt',{exact:true}).count(),0,'Initial fetch failure must not look like a clean empty state');
  assert.equal(await page.evaluate(()=>documentProcessingFetchError),true,'Initial document fetch failure must set explicit error state');
  await page.getByRole('button',{name:'Opnieuw proberen'}).click();
  await page.getByRole('heading',{name:'Aandachtspunten',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__docFetchAttempts),2,'Retry must perform a second document fetch');
  assert.equal(await page.evaluate(()=>documentProcessingFetchError),false,'Successful retry must clear explicit fetch error');
  assert.equal(await page.evaluate(()=>documentProcessingInitialized),true,'Successful retry must restore initialized document state');

  await page.goto(base+'/logout',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Overzicht'}).waitFor();
  await page.locator('#mobileMenu').click();
  await page.locator('.nav-item[data-page="settings"]').click();
  await page.locator('#settingsLogoutButton').waitFor();
  await page.locator('#settingsLogoutButton').click();
  await page.waitForFunction(()=>window.__signOutCalled===1);
  assert.equal(await page.evaluate(()=>window.__signOutCalled),1,'signOut must run despite sync failure');
  assert.equal(await page.locator('#mainApp').evaluate(el=>getComputedStyle(el).display),'none','Protected app UI must be hidden after logout');

  assert.equal(pageErrors.length,0,'Mobile flow must finish without JavaScript errors: '+pageErrors.join(' | '));
  console.log('mobile app layout regression passed');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
