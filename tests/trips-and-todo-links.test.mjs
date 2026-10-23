// Kwin 2026-10-12: Bonnen in the phone tab bar instead of Btw, "Nog te doen" rows open the matching list,
// and a Ritten page where two postcodes give the kilometres automatically (PDOK + OSRM, stubbed here).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const original=fs.readFileSync(path.join(root,'kwinest','index.html'),'utf8');
fs.mkdirSync('tests/artifacts',{recursive:true});

assert.match(original,/data-mobile-page="documents" aria-label="Bonnen"/,'Bonnen sits in the bottom bar');
assert.doesNotMatch(original,/data-mobile-page="vat"/,'Btw left the bottom bar (still in the menu)');
assert.match(original,/<button class="nav-item" data-page="vat">/,'Btw stays reachable from the menu');
assert.match(original,/<button class="nav-item" data-page="trips">[^<]*<svg class="icon"><use href="#i-car"\/><\/svg>Ritten<\/button>/,'Ritten sits in the menu');
assert.match(original,/api\.pdok\.nl\/bzk\/locatieserver/,'Postcodes are looked up at PDOK Locatieserver (free, no key)');
assert.match(original,/router\.project-osrm\.org\/route\/v1\/driving/,'Road distance comes from OSRM');

function replaceLast(source,needle,replacement){
  const i=source.lastIndexOf(needle);
  if(i<0)throw new Error('Missing bootstrap marker: '+needle);
  return source.slice(0,i)+replacement+source.slice(i+needle.length);
}

const bootstrap=[
  "currentUser={...TEST_USER,email:'kwin@example.test',supabaseUser:{user_metadata:{first_name:'Kwin'}}};",
  "state=structuredClone(DEFAULT);",
  "for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];",
  "state.company={...state.company,name:'QA Test BV',contactName:'Kwin',email:'qa@example.test',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',kor:false};",
  "state.contacts=[{id:'c1',type:'customer',name:'Compleet BV',email:'a@example.test',address:'Straat 1',postal:'3011AA',city:'Rotterdam'},{id:'c2',type:'customer',name:'Zonder Adres',email:'b@example.test'},{id:'c3',type:'customer',name:'Zonder Mail',address:'Straat 3',postal:'3013AA',city:'Rotterdam'},{id:'c4',type:'supplier',name:'Leverancier'}];",
  "state.expenses=[{id:'e1',date:today(),vendor:'Met bon',category:'software',exVat:10,vat:2.1,vatRate:21,paymentMethod:'bank',documentId:'d1'},{id:'e2',date:today(),vendor:'Zonder bon A',category:'software',exVat:20,vat:4.2,vatRate:21,paymentMethod:'bank'},{id:'e3',date:'2024-01-05',vendor:'Oud zonder bon',category:'software',exVat:30,vat:6.3,vatRate:21,paymentMethod:'bank'}];",
  "state.documents=[{id:'d1',fileId:'f1',name:'bon.jpg',type:'Bon',date:today(),linkedType:'expense',linkedId:'e1'}];",
  "documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;",
  "window.__geo=[];",
  "window.fetch=async(url)=>{url=String(url);window.__geo.push(url);",
  " if(url.includes('api.pdok.nl')){const pc=decodeURIComponent(url.split('postcode:')[1]);const known={'3011AA':['Rotterdam','Coolsingel','POINT(4.47917 51.92250)'],'1012AB':['Amsterdam','Damrak','POINT(4.89500 52.37500)']}[pc];return {ok:true,json:async()=>({response:{docs:known?[{woonplaatsnaam:known[0],straatnaam:known[1],centroide_ll:known[2]}]:[]}})}}",
  " if(url.includes('router.project-osrm.org'))return {ok:true,json:async()=>({routes:[{distance:76400}]})};",
  " throw new Error('unexpected fetch '+url)};",
  "enterApp();"
].join('\n');

// The built app (look.css etc.) so the phone rows look as they do live; the live profile (first-release, no assistant) shows "Nog te doen".
const build=spawnSync(process.execPath,['scripts/build-app.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,BOEKUNA_RELEASE_PROFILE:'first-release',BOEKUNA_ASSISTANT_ENABLED:'false'}});
assert.equal(build.status,0,'App build failed: '+(build.stderr||build.stdout));
const dist=path.join(root,'dist','app');
let appHtml=fs.readFileSync(path.join(dist,'index.html'),'utf8').replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
appHtml=replaceLast(appHtml,'initAuth();',bootstrap);

const mime={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.ttf':'font/ttf','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(pathname.startsWith('/assets/')||pathname==='/manifest.webmanifest'){
    const file=path.join(dist,pathname);
    if(fs.existsSync(file)){res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});return fs.createReadStream(file).pipe(res)}
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(appHtml);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;

const browserName=(process.env.BOOKUNA_BROWSER||'chromium')==='webkit'?'webkit':'chromium';
const browser=await (browserName==='webkit'?webkit:chromium).launch({headless:true});
const pageErrors=[];

async function open(viewport){
  const page=await browser.newPage({viewport});
  page.on('pageerror',error=>pageErrors.push(String(error)));
  await page.goto(base+'/app',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Overzicht'}).waitFor();
  return page;
}

try{
  // Phone
  const phone=await open({width:390,height:844});
  assert.deepEqual((await phone.locator('#mobileBottomNav .mobile-bottom-nav-item').allTextContents()).map(s=>s.trim()),['Overzicht','Inkomsten','Kosten','Bonnen']);
  await phone.locator('[data-mobile-page="documents"]').click();
  await phone.locator('#pageTitle').filter({hasText:'Bonnetjes'}).waitFor();
  assert.equal(await phone.locator('[data-mobile-page="documents"]').getAttribute('aria-current'),'page','Bonnen highlights in the bar');
  await phone.locator('#mobileMenu').click();
  assert.ok(await phone.locator('.nav-item[data-page="vat"]').isVisible(),'Btw is in the menu');
  assert.ok(await phone.locator('.nav-item[data-page="trips"]').isVisible(),'Ritten is in the menu');
  await phone.locator('.nav-item[data-page="dashboard"]').click();
  await phone.locator('#pageTitle').filter({hasText:'Overzicht'}).waitFor();

  // "x betalingen zonder bon" opens the Kosten list filtered on missing receipts, not the camera.
  await phone.evaluate(()=>{phoneOverviewTodo=true;render()}); // the pill is off the overview for now (Kwin 2026-10-23); the links still work
  await phone.locator('#content .calm-todo summary').click(); // to-dos sit behind "N te doen" (Kwin 2026-10-22)
  const receipts=phone.locator('.dashboard-attention-item[data-attention-key="receipts"]');
  assert.match(await receipts.innerText(),/1 betaling zonder bon/);
  await receipts.click();
  await phone.locator('#pageTitle').filter({hasText:'Kosten'}).waitFor();
  assert.equal(await phone.locator('#invoicePdfFile').evaluate(el=>el.files.length),0);
  assert.equal(await phone.locator('.source-picker, #modalRoot .modal').count(),0,'No picker or modal opens');
  await phone.locator('.list-filter-chip').filter({hasText:'Zonder bon'}).waitFor();
  const vendors=await phone.locator('#content tbody tr strong').allTextContents();
  assert.deepEqual(vendors.map(v=>v.trim()).sort(),['Oud zonder bon','Zonder bon A'],'Only costs without a receipt, from every period');
  await phone.screenshot({path:`tests/artifacts/todo-zonder-bon-${browserName}.png`,fullPage:true});

  // "x klanten missen gegevens" opens Relaties filtered on customers that miss something.
  await phone.locator('[data-mobile-page="dashboard"]').click();
  await phone.locator('#content .calm-todo summary').click();
  const contacts=phone.locator('.dashboard-attention-item[data-attention-key="contacts"]');
  assert.match(await contacts.innerText(),/2 klanten missen gegevens/);
  await contacts.click();
  await phone.locator('#pageTitle').filter({hasText:'Relaties'}).waitFor();
  assert.equal(await phone.locator('#modalRoot .modal').count(),0,'No edit modal; the list shows who misses what');
  await phone.locator('.list-filter-chip').filter({hasText:'Mist gegevens'}).waitFor();
  const names=await phone.locator('#content tbody .phone-row-link strong').allTextContents();
  assert.deepEqual(names.map(v=>v.trim()).sort(),['Zonder Adres','Zonder Mail']);
  await phone.screenshot({path:`tests/artifacts/todo-klanten-${browserName}.png`,fullPage:true});

  // Ritten on the phone: Nieuw > Rit (Kwin 2026-10-21: no Meer fold), two postcodes, km filled in automatically.
  await phone.evaluate(()=>quickMenu());
  await phone.locator('#modalRoot .quick-action').filter({hasText:'Rit'}).first().click();
  await phone.locator('#tripForm').waitFor();
  await phone.locator('#tripForm [name="fromPostal"]').fill('3011aa');
  await phone.locator('#tripForm [name="toPostal"]').fill('1012 AB');
  await phone.waitForFunction(()=>document.querySelector('#tripForm [name="km"]').value==='76.4');
  assert.equal(await phone.locator('#tripForm [name="fromPostal"]').inputValue(),'3011 AA','Postcode is tidied');
  assert.match(await phone.locator('#tripForm [data-trip-place="from"]').innerText(),/Rotterdam/);
  assert.match(await phone.locator('#tripForm [data-trip-place="to"]').innerText(),/Amsterdam/);
  assert.match(await phone.locator('#tripForm [data-trip-km-note]').innerText(),/76,4 km via de weg/);
  const sent=await phone.evaluate(()=>window.__geo.join('\n'));
  assert.doesNotMatch(sent,/Coolsingel|QA Test|example\.test/,'Only postcodes and coordinates leave the app');
  await phone.locator('#tripForm [name="retour"]').check();
  assert.equal(await phone.locator('#tripForm [name="km"]').inputValue(),'152.8','Heen en terug doubles the distance');
  await phone.locator('#tripForm [name="purpose"]').fill('Klantbezoek');
  await phone.locator('#modalRoot .btn.primary').filter({hasText:'Opslaan'}).click();
  await phone.locator('#pageTitle').filter({hasText:'Ritten'}).waitFor();
  const row=await phone.locator('#content tbody .phone-row-link').first().innerText();
  assert.match(row,/Rotterdam → Amsterdam/);assert.match(row,/152,8 km/);assert.match(row,/Klantbezoek/);
  // Kwin 2026-10-21 (voorstel A): kilometers and aftrekbaar side by side in one block.
  assert.match(await phone.locator('.trip-duo').innerText(),/152,8/);
  assert.match(await phone.locator('.trip-duo').innerText(),/35,14/,'€ 0,23 per km');
  await phone.screenshot({path:`tests/artifacts/ritten-phone-${browserName}.png`,fullPage:true});

  // A corrected km value is kept when the user types it; saving keeps the manual value.
  await phone.locator('#content tbody .phone-row-link').first().click();
  await phone.locator('#tripForm').waitFor();
  await phone.locator('#tripForm [name="km"]').fill('150');
  await phone.locator('#modalRoot .btn.primary').filter({hasText:'Opslaan'}).click();
  await phone.locator('#content tbody .phone-row-link').filter({hasText:'150 km'}).waitFor();
  const saved=await phone.evaluate(()=>state.mileage[0]);
  assert.equal(saved.km,150);assert.equal(saved.kmSource,'manual');assert.equal(saved.fromPostal,'3011 AA');assert.equal(saved.retour,true);

  // Unknown postcode: the user fills the km in by hand.
  await phone.evaluate(()=>newTrip());
  await phone.locator('#tripForm [name="fromPostal"]').fill('9999ZZ');
  await phone.locator('#tripForm [name="toPostal"]').fill('1012AB');
  await phone.locator('#tripForm [data-trip-km-note]').filter({hasText:'Postcode niet gevonden'}).waitFor();
  await phone.locator('#modalRoot .btn').filter({hasText:'Annuleren'}).click();
  await phone.close();

  // Desktop: menu item, page, same auto distance; the hours page stays as it was.
  const desktop=await open({width:1280,height:900});
  await desktop.locator('.nav-item[data-page="trips"]').click();
  await desktop.locator('#pageTitle').filter({hasText:'Ritten'}).waitFor();
  assert.match(await desktop.locator('#content').innerText(),/Kilometervergoeding/);
  await desktop.locator('#content .btn.primary').filter({hasText:'Rit toevoegen'}).click();
  await desktop.locator('#tripForm [name="fromPostal"]').fill('1012AB');
  await desktop.locator('#tripForm [name="toPostal"]').fill('3011AA');
  await desktop.waitForFunction(()=>document.querySelector('#tripForm [name="km"]').value==='76.4');
  await desktop.locator('#modalRoot .btn.primary').filter({hasText:'Opslaan'}).click();
  await desktop.locator('#content tbody tr').filter({hasText:'Amsterdam → Rotterdam'}).waitFor();
  await desktop.screenshot({path:`tests/artifacts/ritten-desktop-${browserName}.png`,fullPage:true});
  assert.equal(await desktop.locator('[data-mobile-page="documents"]').count(),1);

  assert.equal(pageErrors.length,0,'No JavaScript errors: '+pageErrors.join(' | '));
  console.log('trips-and-todo-links ok ('+browserName+')');
}finally{
  await browser.close();
  server.close();
}
