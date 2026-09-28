import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');

function replaceLast(source,needle,replacement){
  const i=source.lastIndexOf(needle);
  if(i<0)throw new Error('Missing bootstrap marker: '+needle);
  return source.slice(0,i)+replacement+source.slice(i+needle.length);
}

const authHtml=replaceLast(
  original,
  'initAuth();',
  "showAuth(new URL(location.href).searchParams.get('register')==='1'?'register':'login');"
);

let appHtml=original.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
appHtml=replaceLast(appHtml,'initAuth();',`
currentUser=TEST_USER;
state=structuredClone(DEFAULT);
for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
state.company={...state.company,name:'QA Test BV',tradeName:'Boekuna QA',contactName:'QA',email:'qa@example.test',phone:'0101234567',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',invoicePrefix:'2026-',paymentDays:14,kor:false};
enterApp();
`);

const server=http.createServer((req,res)=>{
  if(req.url?.startsWith('/manifest.webmanifest')){res.writeHead(200,{'content-type':'application/manifest+json'});return res.end('{}')}
  const body=req.url?.startsWith('/auth')?authHtml:appHtml;
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(body);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {port}=server.address();
const base=`http://127.0.0.1:${port}`;

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(String(e)));

try{
  // Registration + login rendering without touching real Auth.
  await page.goto(base+'/auth?register=1',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Maak je gratis account'}).waitFor();
  assert.equal(await page.locator('#authForm input[name="password"]').getAttribute('minlength'),'12');
  assert.equal(await page.locator('#authForm input[name="confirm"]').count(),0,'Registration must not ask for password confirmation');
  assert.equal(await page.locator('#authForm input[name="companyName"]').count(),0,'Registration must not collect company data');
  assert.equal(await page.locator('#authForm input').count(),2,'Registration must contain only email and password inputs');

  await page.goto(base+'/auth?login=1',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Inloggen'}).waitFor();
  assert.equal(await page.locator('#loginPassword').getAttribute('minlength'),null,'Login must not block legacy short passwords');
  assert.ok(await page.getByText('Nog geen account? Gratis starten').count(),'Login must expose registration');

  // Daily-use browser flow on the exact production UI source, with auth/network isolated.
  await page.goto(base+'/app',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor();
  assert.equal(await page.locator('.mobile-menu').evaluate(el=>getComputedStyle(el).display),'none');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'Desktop page must not create global horizontal overflow');

  await page.evaluate(()=>newContact());
  await page.locator('#contactForm [name="name"]').fill('QA Klant BV');
  await page.locator('#contactForm [name="email"]').fill('klant@example.test');
  await page.locator('#contactForm [name="address"]').fill('Klantstraat 2');
  await page.locator('#contactForm [name="postal"]').fill('3012BB');
  await page.locator('#contactForm [name="city"]').fill('Rotterdam');
  await page.evaluate(()=>saveContact(''));
  assert.equal(await page.evaluate(()=>state.contacts.length),1);

  await page.evaluate(()=>newService());
  await page.locator('#serviceForm [name="name"]').fill('QA Consultancy');
  await page.locator('#serviceForm [name="price"]').fill('10');
  await page.locator('#serviceForm [name="vat"]').selectOption('21');
  await page.evaluate(()=>saveService(''));
  assert.equal(await page.evaluate(()=>state.services.length),1);

  await page.evaluate(()=>newInvoice());
  await page.evaluate(()=>reviewInvoice());
  await page.locator('.toast').filter({hasText:'punt(en) controleren'}).waitFor();

  const customerId=await page.evaluate(()=>state.contacts[0].id);
  await page.locator('#invoiceForm [name="customerId"]').selectOption(customerId);
  await page.locator('#invoiceForm [name="status"]').selectOption('sent');
  await page.locator('#invoiceLines [data-k="desc"]').fill('QA werkzaamheden');
  await page.locator('#invoiceLines [data-k="qty"]').fill('3');
  await page.locator('#invoiceLines [data-k="unit"]').fill('10');
  await page.locator('#invoiceLines [data-k="vat"]').selectOption('21');
  await page.evaluate(()=>{updateInvoiceCustomer();calcInvoiceForm();updateInvoiceCheck()});
  const totals=await page.locator('#formTotals').innerText();
  assert.match(totals,/30,00/,'Invoice net total must be €30.00');
  assert.match(totals,/6,30/,'Invoice VAT must be €6.30');
  assert.match(totals,/36,30/,'Invoice gross total must be €36.30');

  await page.evaluate(()=>reviewInvoice());
  await page.getByRole('heading',{name:'Laatste controle vóór opslaan'}).waitFor();
  await page.evaluate(()=>finalSaveInvoice());
  assert.equal(await page.evaluate(()=>state.invoices.length),1);
  assert.equal(await page.evaluate(()=>invoiceNet(state.invoices[0])),30);
  assert.equal(await page.evaluate(()=>invoiceVat(state.invoices[0])),6.3);
  assert.equal(await page.evaluate(()=>invoiceGross(state.invoices[0])),36.3);
  assert.ok(await page.evaluate(()=>!String(state.invoices[0].number).startsWith('CONCEPT-')),'Final invoice must receive a final number');

  const downloadPromise=page.waitForEvent('download');
  await page.evaluate(()=>exportInvoicesCSV());
  const csv=await downloadPromise;
  assert.match(csv.suggestedFilename(),/^verkoopfacturen-\d{4}\.csv$/);

  const invoiceId=await page.evaluate(()=>state.invoices[0].id);
  const popupPromise=page.waitForEvent('popup');
  await page.evaluate(id=>printInvoice(id),invoiceId);
  const popup=await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  assert.match(await popup.locator('body').innerText(),/36,30/,'Printable invoice must show the same gross total');
  await popup.close();

  await page.evaluate(()=>setImportProgress('Document verwerken','Document analyseren…','qa.pdf',48,3));
  assert.match(await page.locator('.modal').innerText(),/48%/);
  await page.evaluate(()=>showUploadError(createUploadError('413','Bestand groter dan limiet',413)));
  const uploadError=await page.locator('.modal').innerText();
  assert.match(uploadError,/Bestand te groot/);
  assert.match(uploadError,/Verklein of comprimeer/);
  assert.equal(await page.locator('.modal a[href="mailto:support@boekuna.nl"]').count(),1,'Upload error must offer the official support email');
  await page.evaluate(()=>{closeModal();navigate('settings')});
  await page.getByRole('heading',{name:'Instellingen'}).waitFor();
  assert.equal(await page.locator('a[href="mailto:support@boekuna.nl"]').count(),1,'Settings must expose the official support email');

  // Mobile viewport: navigation, modal sizing and no page-level horizontal overflow.
  await page.setViewportSize({width:390,height:844});
  await page.goto(base+'/app',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor();
  assert.notEqual(await page.locator('.mobile-menu').evaluate(el=>getComputedStyle(el).display),'none');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'Mobile page must not create global horizontal overflow');
  await page.locator('#mobileMenu').click();
  assert.ok(await page.locator('#sidebar').evaluate(el=>el.classList.contains('open')),'Mobile menu must set the sidebar open state');
  await page.waitForTimeout(260);
  const sidebarLeft=await page.locator('#sidebar').evaluate(el=>Math.round(el.getBoundingClientRect().left));
  assert.ok(Math.abs(sidebarLeft)<=1,'Mobile menu must finish opening the sidebar');
  await page.evaluate(()=>newContact());
  const modalBox=await page.locator('.modal').boundingBox();
  assert.ok(modalBox && modalBox.width<=390.5,'Mobile modal must fit viewport width');

  // Live pre-launch availability smoke test.
  const live=await browser.newPage({viewport:{width:1280,height:800}});
  const response=await live.goto('https://boekuna-boekhouding.onrender.com/?login=1',{waitUntil:'domcontentloaded',timeout:45000});
  assert.ok(response && response.ok(),'Live Render build must answer successfully');
  await live.getByRole('heading',{name:'Inloggen'}).waitFor({timeout:15000});
  assert.match(await live.title(),/Boekuna/);
  await live.close();

  assert.deepEqual(pageErrors,[],'Browser page errors: '+pageErrors.join(' | '));
  console.log('Boekuna browser smoke: PASS (registration, login, desktop CRUD, invoice validation/calculation/numbering/export/print, loading/errors, mobile layout, live availability)');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
