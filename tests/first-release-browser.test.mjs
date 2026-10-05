import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const run=spawnSync(process.execPath,['scripts/build-app.mjs'],{
  cwd:root,
  encoding:'utf8',
  env:{...process.env,BOEKUNA_RELEASE_PROFILE:'first-release',BOEKUNA_ASSISTANT_ENABLED:'true'}
});
assert.equal(run.status,0,'First-release browser build must succeed:\n'+run.stdout+'\n'+run.stderr);

const dist=path.join(root,'dist','app');
let original=fs.readFileSync(path.join(dist,'index.html'),'utf8');
function replaceLast(source,needle,replacement){
  const i=source.lastIndexOf(needle);
  if(i<0)throw new Error('Missing bootstrap marker: '+needle);
  return source.slice(0,i)+replacement+source.slice(i+needle.length);
}

let appHtml=original.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
appHtml=replaceLast(appHtml,'initAuth();',[
  "currentUser={...TEST_USER,email:'release@example.test'};",
  "state=structuredClone(DEFAULT);",
  "for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];",
  "state.company={...state.company,name:'Release Test BV',tradeName:'Release Test',email:'release@example.test',address:'Teststraat 1',postal:'2511AA',city:'Den Haag',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',invoicePrefix:'2026-',paymentDays:14,kor:false,peppolId:'legacy-company-peppol'};",
  "state.contacts=[{id:'c1',type:'customer',name:'Bestaande klant BV',email:'klant@example.test',address:'Klantstraat 2',postal:'2512BB',city:'Den Haag',kvk:'87654321',vat:'NL987654321B01',peppolId:'legacy-contact-peppol'}];",
  "state.bookings=[{id:'b1',customerId:'c1',status:'planned',date:today(),time:'10:00',service:'Verborgen afspraak',reminderSent:false}];",
  "state.hours=[{id:'h1',date:today(),hours:2,project:'Bewaard project',desc:'Bestaande data'}];",
  "state.mileage=[{id:'m1',date:today(),km:12,from:'A',to:'B',purpose:'Bestaande data'}];",
  "state.services=[{id:'svc1',name:'Bestaande dienst',description:'Bewaarde dienst',price:100,vat:21,active:true}];",
  "state.plannedCash=[{id:'pc1',type:'out',date:today(),description:'Bestaande planning',amount:50,repeating:'monthly'}];",
  "loadBillingSummary=async()=>{};handleBillingReturnAndPlan=async()=>{};handleMailboxReturn=()=>{};initDocumentBackgroundProcessing=async()=>{};resumePendingDocumentVerifications=async()=>{};",
  "documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;",
  "enterApp();"
].join('\n'));

const mime={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(pathname==='/'||pathname==='/app'){
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    return res.end(appHtml);
  }
  const relative=pathname.replace(/^\//,'');
  const file=path.join(dist,relative);
  if(file.startsWith(dist)&&fs.existsSync(file)&&fs.statSync(file).isFile()){
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
    return fs.createReadStream(file).pipe(res);
  }
  res.writeHead(404);res.end('not found');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browserName=(process.env.BOOKUNA_BROWSER||'chromium')==='webkit'?'webkit':'chromium';
const browserType=browserName==='webkit'?webkit:chromium;
const browser=await browserType.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',error=>errors.push(String(error)));

try{
  await page.goto(base+'/app',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Overzicht'}).waitFor();

  const desktopNav=(await page.locator('#sidebar .nav-item').allTextContents()).map(v=>v.trim());
  for(const core of ['Overzicht','Inkomsten','Kosten','Bank','Btw','Rapportages','Bonnetjes','Relaties','Instellingen'])assert.ok(desktopNav.includes(core),'Core desktop navigation missing '+core);
  for(const disabled of ['Voor jou','Controlecentrum','Cashflow','Grootboek','Boekingen','Uren & ritten','Diensten'])assert.equal(desktopNav.includes(disabled),false,'Disabled desktop navigation leaked '+disabled);

  for(const [route,title] of [['bookings','Overzicht'],['hours','Overzicht'],['control','Overzicht'],['cashflow','Rapportages'],['ledger','Rapportages'],['services','Inkomsten'],['insights','Overzicht']]){
    await page.evaluate(route=>navigate(route),route);
    await page.locator('#pageTitle').filter({hasText:title}).waitFor();
  }

  const directRender=await page.evaluate(()=>{page='bookings';render();return {page,title:document.getElementById('pageTitle').textContent,content:document.getElementById('content').innerText}});
  assert.equal(directRender.page,'dashboard','Direct page-state mutation must fail closed to the release fallback');
  assert.equal(directRender.title,'Overzicht','Direct render fallback must restore the safe page title');
  assert.doesNotMatch(directRender.content,/Nieuwe boeking|Boekingen/,'Disabled page renderer must not be reachable through direct render state');

  await page.evaluate(()=>navigate('dashboard'));
  const before=await page.evaluate(()=>({bookings:state.bookings.length,hours:state.hours.length,mileage:state.mileage.length,settlements:state.settlements.length,services:state.services.length,plannedCash:state.plannedCash.length,reminderSent:state.bookings[0].reminderSent}));
  await page.evaluate(async()=>{newBooking();newHour();newMileage();newSettlement();newService();deleteService('svc1');deletePlannedCash('pc1');markBookingReminder('b1');await confirmBookingReminder('b1')});
  assert.equal(await page.locator('#modalRoot .modal').count(),0,'Direct calls to disabled create flows must fail closed');
  const after=await page.evaluate(()=>({bookings:state.bookings.length,hours:state.hours.length,mileage:state.mileage.length,settlements:state.settlements.length,services:state.services.length,plannedCash:state.plannedCash.length,reminderSent:state.bookings[0].reminderSent}));
  assert.deepEqual(after,before,'Disabled direct calls must preserve existing data and create nothing');

  await page.evaluate(()=>quickMenu());
  const quick=await page.locator('#modalRoot').innerText();
  for(const core of ['Scannen','Factuur','Kosten boeken','Banktransactie','Relatie'])assert.match(quick,new RegExp(core));
  for(const disabled of ['Boeking','Gemengde afrekening','Dienst'])assert.doesNotMatch(quick,new RegExp(disabled));
  await page.evaluate(()=>closeModal());

  await page.evaluate(()=>navigate('profile'));
  assert.equal(await page.locator('#profileForm [name="peppolId"]').count(),0,'Company Peppol control must be absent');
  await page.locator('#profileForm [name="tradeName"]').fill('Release Test gewijzigd');
  await page.locator('#profileForm').evaluate(form=>form.requestSubmit());
  assert.equal(await page.evaluate(()=>state.company.peppolId),'legacy-company-peppol','Saving visible company fields must preserve hidden Peppol data');

  await page.evaluate(()=>navigate('contacts'));
  await page.evaluate(()=>editContact('c1'));
  assert.equal(await page.locator('#contactForm [name="peppolId"]').count(),0,'Contact Peppol control must be absent');
  await page.locator('#contactForm [name="contactPerson"]').fill('Nieuwe contactpersoon');
  await page.evaluate(()=>saveContact('c1'));
  assert.equal(await page.evaluate(()=>state.contacts.find(c=>c.id==='c1').peppolId),'legacy-contact-peppol','Saving visible contact fields must preserve hidden Peppol data');

  await page.evaluate(()=>newInvoice());
  assert.equal(await page.getByText('Btw-behandeling',{exact:false}).count(),0,'Advanced VAT selector must not be shown in Release 1');
  assert.equal(await page.locator('#invoiceForm [name="taxTreatment"]').getAttribute('type'),'hidden','VAT treatment must remain deterministic internally');
  assert.equal(await page.locator('.invoice-service-picker').count(),0,'Hidden service catalog must not leave a dead invoice shortcut');
  await page.evaluate(()=>closeModal());

  const dashboardText=await page.evaluate(()=>{navigate('dashboard');return document.getElementById('content').innerText});
  assert.doesNotMatch(dashboardText,/Verborgen afspraak|afspraken vragen een reminder/i,'Booking reminders must not leak onto the dashboard');

  await page.evaluate(()=>{
    state.contacts.push(
      {id:'c2',type:'customer',name:'Onvolledig 1'},
      {id:'c3',type:'customer',name:'Onvolledig 2'},
      {id:'c4',type:'customer',name:'Onvolledig 3'},
      {id:'c5',type:'customer',name:'Onvolledig 4'}
    );
    navigate('dashboard');
  });
  assert.equal(await page.getByRole('button',{name:/Alle aandachtspunten/}).count(),0,'Release dashboard must not link to hidden Control Center');
  await page.evaluate(()=>openAttentionCategory('contacts'));
  await page.locator('#modalTitle').filter({hasText:'Relatie bewerken'}).waitFor();
  assert.equal(await page.locator('#pageTitle').innerText(),'Overzicht','Multiple attention items must stay actionable without navigating to hidden Control Center');
  await page.evaluate(()=>closeModal());

  await page.setViewportSize({width:390,height:844});
  const mobileNav=(await page.locator('#mobileBottomNav .mobile-bottom-nav-item').allTextContents()).map(v=>v.trim());
  assert.deepEqual(mobileNav,['Overzicht','Inkomsten','Kosten','Btw','Meer']);
  await page.locator('#mobileMenu').click();
  const drawer=(await page.locator('#sidebar .nav-item').allTextContents()).map(v=>v.trim());
  for(const disabled of ['Voor jou','Controlecentrum','Cashflow','Grootboek','Boekingen','Uren & ritten','Diensten'])assert.equal(drawer.includes(disabled),false,'Disabled mobile drawer item leaked '+disabled);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'Release 1 mobile app must not overflow horizontally');

  assert.equal(errors.length,0,'Release 1 browser must have no JavaScript page errors: '+errors.join(' | '));
  console.log('First release browser '+browserName+': PASS');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
