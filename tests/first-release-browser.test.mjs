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
const evidence=path.join(root,'tests','artifacts','product-ui-reference');fs.mkdirSync(evidence,{recursive:true});
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
  for(const core of ['Overzicht','Inkomsten','Kosten','Bank','Btw','Rapportages','Bonnetjes','Relaties','Diensten','Instellingen'])assert.ok(desktopNav.includes(core),'Core desktop navigation missing '+core);
  for(const disabled of ['Voor jou','Controlecentrum','Cashflow','Grootboek','Boekingen','Uren & ritten'])assert.equal(desktopNav.includes(disabled),false,'Disabled desktop navigation leaked '+disabled);

  // Beginner-first empty states and one obvious task per core screen.
  await page.evaluate(()=>navigate('invoices'));
  assert.match(await page.locator('#content').innerText(),/Maak je eerste factuur\. Boekuna houdt daarna bij wat nog openstaat\./);
  assert.equal(await page.getByRole('button',{name:'Eerste factuur maken'}).count(),1);

  await page.evaluate(()=>navigate('expenses'));
  assert.match(await page.locator('#content').innerText(),/Upload een bon of inkoopfactuur\./);
  assert.equal(await page.getByRole('button',{name:'Bon of factuur toevoegen'}).count(),1);

  await page.evaluate(()=>navigate('documents'));
  assert.match(await page.locator('#content').innerText(),/Boekuna leest hem uit en laat zien wat je moet controleren\./);
  assert.equal(await page.getByRole('button',{name:'Document uploaden'}).count(),1,'Empty documents should expose one upload action');
  assert.equal(await page.locator('.dropzone').count(),0,'Empty documents should not duplicate the upload action with a dropzone');

  await page.evaluate(()=>navigate('bank'));
  const bankText=await page.locator('#content').innerText();
  assert.match(bankText,/Importeer een CSV-bankbestand om transacties te bekijken en te koppelen\./);
  assert.equal(await page.getByRole('button',{name:/Bankbestand importeren/}).count(),1,'Empty Bank should expose one obvious import action');
  assert.equal(await page.locator('.beginner-empty-state .btn.primary').filter({hasText:'Bankbestand importeren'}).count(),1,'Bank import must be the empty-state primary action');

  await page.evaluate(()=>navigate('vat'));
  const vatText=await page.locator('#content').innerText();
  assert.match(vatText,/Indicatie · geen aangifte/,'Compact VAT view must retain clear indicative/not-filed meaning');
  assert.match(vatText,/Waarschijnlijk te betalen|Waarschijnlijk terug te vragen/);
  assert.match(vatText,/Boekuna verstuurt deze aangifte niet naar de Belastingdienst\./);

  await page.evaluate(()=>navigate('settings'));
  const settingsText=await page.locator('#content').innerText();
  for(const label of ['Mijn bedrijf','Boekhouding','Beveiliging & privacy','Data & export','Abonnement & account'])assert.match(settingsText,new RegExp(label.replace(/[&]/g,'\\&'),'i'));
  assert.doesNotMatch(settingsText,/Belastingpot/,'Hidden cashflow must not leave a dead Release 1 settings shortcut');
  assert.equal(await page.locator('details.settings-advanced-exports').count(),1,'Specialist exports should use progressive disclosure');

  for(const [route,title] of [['bookings','Overzicht'],['hours','Overzicht'],['control','Overzicht'],['cashflow','Rapportages'],['ledger','Rapportages'],['insights','Overzicht']]){
    await page.evaluate(route=>navigate(route),route);
    await page.locator('#pageTitle').filter({hasText:title}).waitFor();
  }

  const directRender=await page.evaluate(()=>{page='bookings';render();return {page,title:document.getElementById('pageTitle').textContent,content:document.getElementById('content').innerText}});
  assert.equal(directRender.page,'dashboard','Direct page-state mutation must fail closed to the release fallback');
  assert.equal(directRender.title,'Overzicht','Direct render fallback must restore the safe page title');
  assert.doesNotMatch(directRender.content,/Nieuwe boeking|Boekingen/,'Disabled page renderer must not be reachable through direct render state');

  await page.evaluate(()=>navigate('dashboard'));
  const before=await page.evaluate(()=>({bookings:state.bookings.length,hours:state.hours.length,mileage:state.mileage.length,settlements:state.settlements.length,services:state.services.length,plannedCash:state.plannedCash.length,reminderSent:state.bookings[0].reminderSent}));
  await page.evaluate(async()=>{newBooking();newHour();newMileage();newSettlement();deletePlannedCash('pc1');markBookingReminder('b1');await confirmBookingReminder('b1')});
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
  await page.locator('#profileForm details.profile-more summary').click();
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
  await page.evaluate(()=>closeModal());

  // Services are set up once on their own Diensten page and picked with one tap on any invoice.
  await page.evaluate(()=>navigate('services'));
  await page.locator('#pageTitle').filter({hasText:'Diensten'}).waitFor();
  await page.evaluate(()=>newService());
  await page.locator('#serviceForm [name="name"]').fill('Maandelijks onderhoud');
  await page.locator('#serviceForm [name="price"]').fill('75');
  await page.evaluate(()=>saveService(''));
  await page.locator('#content').getByText('Maandelijks onderhoud').first().waitFor();
  await page.evaluate(()=>newInvoice());
  await page.locator('.invoice-service-picker .service-chip').filter({hasText:'Maandelijks onderhoud'}).click();
  assert.equal(await page.locator('#invoiceLines .line-item').count(),1,'Picking a service fills the empty first line instead of adding a second');
  assert.equal(await page.locator('#invoiceLines [data-k="unit"]').inputValue(),'75');
  await page.evaluate(()=>addInvoiceLine());
  const typed=page.locator('#invoiceLines .line-item').last();
  await typed.locator('[data-k="desc"]').fill('Extra uur support');
  await typed.locator('[data-k="unit"]').fill('60');
  await typed.locator('.line-save-service').click();
  assert.equal(await page.evaluate(()=>state.services.find(s=>s.name==='Extra uur support')?.price),60,'A typed line can be kept as a service');
  await page.locator('.invoice-service-picker .service-chip').filter({hasText:'Extra uur support'}).waitFor();
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
  await page.evaluate(()=>navigate('vat'));
  assert.equal(await page.locator('.mobile-vat-attention').count(),0,'Release 1 Btw must not expose a Documenten controleren CTA');
  assert.doesNotMatch(await page.locator('#content').innerText(),/^Documenten controleren$/m,'Release 1 Btw must stay an information screen');
  await page.evaluate(()=>navigate('dashboard'));
  const quickTrigger=page.locator('#quickNew');await quickTrigger.focus();await quickTrigger.click();
  await page.locator('#modalRoot .quick-action-modal').waitFor();
  assert.equal(await page.locator('#modalRoot .quick-action').count(),5,'Mobile quick-create must expose exactly five Release 1 actions');
  const quickLabels=(await page.locator('#modalRoot .quick-action').allTextContents()).map(v=>v.trim().replace(/\s+/g,' '));
  for(const core of ['Scannen','Factuur','Kosten boeken','Banktransactie','Relatie'])assert.ok(quickLabels.some(v=>v.includes(core)),'Mobile quick-create missing '+core);
  const quickGeometry=await page.locator('#modalRoot .quick-action-modal').evaluate(el=>{const r=el.getBoundingClientRect(),b=getComputedStyle(el.closest('.modal-backdrop'));return {top:r.top,bottom:r.bottom,height:r.height,align:b.alignItems,radius:getComputedStyle(el).borderRadius}});
  assert.equal(quickGeometry.align,'center','Mobile quick-create backdrop must center the dialog');
  assert.ok(quickGeometry.top>24&&quickGeometry.bottom<820,'Mobile quick-create must float centrally instead of attaching to the bottom edge: '+JSON.stringify(quickGeometry));
  await page.screenshot({path:path.join(evidence,'quick-popup-390-first-release-'+browserName+'.png'),fullPage:true});
  await page.keyboard.press('Escape');await page.locator('#modalRoot .modal').waitFor({state:'detached'});
  // closeModal() restores focus in a setTimeout(0) after removing the modal, so wait for it instead of reading it in the same tick.
  const focusRestored=await page.waitForFunction(()=>document.activeElement===document.getElementById('quickNew'),null,{timeout:2000}).then(()=>true,()=>false);
  assert.equal(focusRestored,true,'Closing quick-create must restore focus to the + button');
  const mobileNav=(await page.locator('#mobileBottomNav .mobile-bottom-nav-item').allTextContents()).map(v=>v.trim());
  assert.deepEqual(mobileNav,['Overzicht','Inkomsten','Kosten','Btw','Meer']);
  await page.locator('#mobileMenu').click();
  const drawer=(await page.locator('#sidebar .nav-item').allTextContents()).map(v=>v.trim());
  for(const disabled of ['Voor jou','Controlecentrum','Cashflow','Grootboek','Boekingen','Uren & ritten'])assert.equal(drawer.includes(disabled),false,'Disabled mobile drawer item leaked '+disabled);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'Release 1 mobile app must not overflow horizontally');

  assert.equal(errors.length,0,'Release 1 browser must have no JavaScript page errors: '+errors.join(' | '));
  console.log('First release browser '+browserName+': PASS');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
