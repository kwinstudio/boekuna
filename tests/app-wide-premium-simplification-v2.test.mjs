import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
assert.ok(original.includes('class="invoice-advanced-options '),'Invoice editor needs progressive disclosure');
assert.ok(original.includes('settings-disclosure'),'RED: settings needs progressive disclosure');
assert.ok(original.includes('quick-action-group'),'RED: quick actions need grouping');
assert.ok(original.includes('<div class="nav-group">Administratie</div>'),'Sidebar needs a clear administration grouping');
assert.ok(original.includes('<div class="nav-group">Meer</div>'),'Sidebar needs a secondary More grouping');
assert.ok(!original.includes('<div class="demo-pill">'),'RED: sidebar must not carry permanent technical status copy');
assert.ok(original.includes('class="profile-section"'),'RED: company profile needs flatter sections');
assert.ok(original.includes('class="settings-group"'),'RED: settings needs human task grouping');
fs.mkdirSync('tests/artifacts',{recursive:true});

function replaceLast(source,needle,replacement){
  const i=source.lastIndexOf(needle);
  if(i<0)throw new Error('Missing bootstrap marker: '+needle);
  return source.slice(0,i)+replacement+source.slice(i+needle.length);
}

const fixtureBootstrap=[
  "currentUser={...TEST_USER,email:'kwin@example.test',supabaseUser:{user_metadata:{first_name:'Kwin'}}};",
  "state=structuredClone(DEFAULT);",
  "state.company={...state.company,name:'QA Test BV',tradeName:'Boekuna QA',contactName:'Kwin',email:'qa@example.test',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',kor:false};",
  "state.contacts=[{id:'c1',type:'customer',name:'QA Klant BV',contactPerson:'Lange Contactpersoon',email:'klant@example.test',phone:'0101234567',address:'Klantstraat 2',postal:'3012BB',city:'Rotterdam',vat:'NL100000002B01'}];",
  "state.services=[{id:'s1',name:'Advies',description:'Zakelijk advies',unitLabel:'uur',price:100,vat:21,active:true}];",
  "state.invoices=[{id:'i1',number:'2026-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:'2026-08-01',supplyDate:'2026-08-01',dueDate:'2026-08-15',taxTreatment:'standard',payments:[],lines:[{desc:'Advies',qty:1,unitLabel:'uur',unit:100,vat:21}],importedTotals:{net:100,vat:21,gross:121}}];",
  "state.expenses=[];state.transactions=[];state.documents=[];state.bookings=[];",
  "documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;",
  "enterApp();"
].join('\n');

let appHtml=original.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
appHtml=replaceLast(appHtml,'initAuth();',fixtureBootstrap);

const mime={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
const publicRoot=new URL('../public/',import.meta.url);
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(pathname.startsWith('/assets/')||pathname==='/favicon.ico'){
    const file=new URL(pathname.replace(/^\//,''),publicRoot);
    try{
      if(fs.existsSync(file)){
        res.writeHead(200,{'content-type':mime[path.extname(file.pathname)]||'application/octet-stream','cache-control':'no-store'});
        return fs.createReadStream(file).pipe(res);
      }
    }catch{}
  }
  if(pathname==='/manifest.webmanifest'){res.writeHead(200,{'content-type':'application/manifest+json'});return res.end('{}')}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(appHtml);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;

const browserName=(process.env.BOOKUNA_BROWSER||'chromium')==='webkit'?'webkit':'chromium';
const browser=await (browserName==='webkit'?webkit:chromium).launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));

async function openApp(){
  await page.goto(base+'/app',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Overzicht'}).waitFor();
}
async function nav(name){await page.evaluate(async name=>navigate(name),name);await page.waitForTimeout(20)}

try{
  await openApp();

  // Global quick-create stays discoverable but must not compete with each page's primary action.
  const globalQuick=page.locator('#quickNew');
  assert.ok(await globalQuick.isVisible(),'Global quick-create must remain reachable');
  assert.equal(await globalQuick.evaluate(el=>el.classList.contains('primary')),false,'Global quick-create must not compete as a second primary CTA');

  // Invoice editor: task-first, advanced details available but not permanently dominant.
  await page.evaluate(()=>newInvoice());
  await page.getByRole('heading',{name:'Nieuwe factuur'}).waitFor();
  const invoiceModal=page.locator('#modalRoot');
  assert.equal(await invoiceModal.getByText('Factuurcontrole actief.',{exact:true}).count(),0,'Permanent invoice-control prose must be removed');
  assert.ok(await invoiceModal.getByText('Factuurregels',{exact:true}).count(),'Invoice lines must remain immediately discoverable');
  const advanced=invoiceModal.locator('details.invoice-advanced-options');
  assert.equal(await advanced.count(),1,'Invoice editor must expose one advanced-options disclosure');
  assert.equal(await advanced.getAttribute('open'),null,'Advanced invoice options must be collapsed by default');
  assert.match(await advanced.locator('summary').innerText(),/Meer factuuropties/i);
  await advanced.locator('summary').click();
  for(const label of ['Btw-behandeling','Leverdatum / prestatiedatum','Klantreferentie / PO','Betalingskenmerk']){
    assert.ok(await invoiceModal.getByText(label,{exact:false}).count(),label+' must remain reachable');
  }
  await page.screenshot({path:`tests/artifacts/premium-v2-invoice-editor-${browserName}-390.png`,fullPage:true});
  await page.evaluate(()=>closeModal());

  // Invoice actions must stay complete without long instructional paragraphs.
  await page.evaluate(()=>invoiceActions('i1'));
  const actionText=await page.locator('#modalRoot').innerText();
  assert.match(actionText,/Bekijken \/ PDF/);
  assert.match(actionText,/Versturen via e-mail/);
  assert.doesNotMatch(actionText,/Gebruik deze factuur als basis zonder de originele administratie te overschrijven/);
  assert.doesNotMatch(actionText,/Maak een nette opvolgmail met factuurdetails/);
  await page.evaluate(()=>closeModal());

  // Quick actions: retain all capabilities but group daily vs secondary actions.
  await page.evaluate(()=>quickMenu());
  const quick=page.locator('#modalRoot');
  assert.ok(await quick.getByText('Dagelijks',{exact:true}).count(),'Quick actions need a Daily group');
  assert.ok(await quick.getByText('Meer',{exact:true}).count(),'Quick actions need a secondary group');
  for(const label of ['Scannen','Factuur','Kosten boeken','Relatie','Dienst','Boeking']){
    assert.ok(await quick.getByText(label,{exact:false}).count(),label+' must remain reachable');
  }
  await page.evaluate(()=>closeModal());

  // Settings: large configuration forms should be progressively disclosed.
  await nav('settings');
  const settings=page.locator('#content');
  const settingsText=await settings.innerText();
  for(const label of ['Bedrijfsgegevens','Abonnement','Facturen versturen','Data & back-up'])assert.match(settingsText,new RegExp(label));
  const configDetails=settings.locator('details.settings-disclosure');
  assert.ok(await configDetails.count()>=2,'Email template and invoice layout should be secondary disclosures');
  assert.ok(await settings.getByText('E-mailsjabloon',{exact:true}).count());
  assert.ok(await settings.getByText('Factuurlayout',{exact:true}).count());
  await page.screenshot({path:`tests/artifacts/premium-v2-settings-${browserName}-390.png`,fullPage:true});

  assert.ok(await settings.locator('.settings-group').count()>=3,'Settings should be grouped by human task');
  await nav('profile');
  assert.equal(await page.locator('#content .profile-section-essentials').count(),1,'Company details start with only what invoices need');
  assert.equal(await page.locator('#content details.profile-more').count(),1,'Optional company details stay folded away');
  assert.equal(await page.locator('#content .profile-section.card').count(),0,'Profile sections should not all be cards');
  await page.screenshot({path:`tests/artifacts/premium-v2-profile-${browserName}-390.png`,fullPage:true});

  // Mobile relationship list: prioritize name/type/contact and hide bookkeeping-only columns.
  await nav('contacts');
  await page.setViewportSize({width:390,height:844});
  const table=page.locator('#content table');
  assert.equal(await table.locator('tbody tr td:nth-child(6)').first().evaluate(el=>getComputedStyle(el).display),'none','VAT data should not dominate mobile relationship list');
  assert.notEqual(await table.locator('th').filter({hasText:'Btw-id'}).evaluate(el=>getComputedStyle(el).display),'none','VAT header must remain programmatically available for table semantics');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'No global overflow at 390px');

  for(const width of [320,360,375,390,393,430,768,820]){
    await page.setViewportSize({width,height:Math.max(700,Math.round(width*1.6))});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'No global overflow at '+width+'px');
  }

  for(const width of [1024,1280,1440]){
    await page.setViewportSize({width,height:900});
    assert.notEqual(await page.locator('#sidebar').evaluate(el=>getComputedStyle(el).display),'none');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'No desktop overflow at '+width+'px');
  }

  assert.deepEqual(pageErrors,[],'No browser JS errors: '+pageErrors.join(' | '));
  console.log('app-wide premium simplification v2 regression: PASS');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
