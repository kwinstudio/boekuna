import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
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
  "state.contacts=[{id:'c1',type:'customer',name:'QA Klant BV',email:'klant@example.test',address:'Klantstraat 2',postal:'3012BB',city:'Rotterdam'}];",
  "state.invoices=[{id:'i1',number:'2026-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:'2026-08-01',dueDate:'2026-08-15',taxTreatment:'standard',payments:[],importedTotals:{net:100,vat:21,gross:121}}];",
  "state.expenses=[{id:'e1',date:'2026-09-01',vendor:'QA Leverancier',invoiceNumber:'INK-1',category:'Kantoor',paymentMethod:'bank',exVat:50,vatRate:21,notes:''}];",
  "state.transactions=[{id:'t1',date:'2026-09-01',description:'QA bankregel',amount:-10,status:'unmatched'}];",
  "state.documents=[];state.bookings=[];",
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
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(appHtml);
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

async function navigateTo(name){
  await page.evaluate(async target=>{await navigate(target)},name);
  await page.waitForTimeout(30);
}
async function assertNoGlobalOverflow(width){
  await page.setViewportSize({width,height:Math.max(700,Math.round(width*1.8))});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'No global horizontal overflow at '+width+'px');
}

try{
  await page.goto(base+'/app',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor();

  const dashboard=await page.locator('#content').innerText();
  assert.doesNotMatch(dashboard,/Jouw administratie/,'Dashboard should not repeat its context as an eyebrow');
  assert.doesNotMatch(dashboard,/Werk op uitzonderingen, niet op alles/,'Dashboard should not contain marketing-like smart-card copy');
  assert.match(dashboard,/Omzet/);
  assert.match(dashboard,/Kosten/);
  assert.match(dashboard,/Resultaat/);
  assert.match(dashboard,/Btw/);
  const mobileChartHeight=await page.locator('.dashboard-chart-card .chart').evaluate(el=>parseFloat(getComputedStyle(el).height));
  assert.ok(mobileChartHeight<=190,'Mobile dashboard chart should stay compact (<=190px), got '+mobileChartHeight+'px');
  await page.screenshot({path:`tests/artifacts/premium-dashboard-${browserName}-390.png`,fullPage:true});
  await page.setViewportSize({width:430,height:900});
  await page.screenshot({path:`tests/artifacts/premium-dashboard-${browserName}-430.png`,fullPage:true});
  await page.setViewportSize({width:390,height:844});

  await navigateTo('invoices');
  const invoices=await page.locator('#content').innerText();
  assert.doesNotMatch(invoices,/Maak facturen, bewaar ze als concept/,'Invoice page should not carry a permanent instructional paragraph');
  assert.doesNotMatch(invoices,/Factuurcheck actief\./,'Invoice page should not carry a permanent invoice-check notice');
  assert.ok(await page.getByRole('button',{name:/Nieuwe factuur/}).isVisible());
  assert.ok(await page.getByRole('button',{name:/Upload PDF/}).isVisible());
  await page.screenshot({path:`tests/artifacts/premium-invoices-${browserName}-390.png`,fullPage:true});

  await navigateTo('expenses');
  assert.ok(await page.getByRole('button',{name:/Kosten boeken/}).isVisible());
  assert.ok(await page.getByRole('button',{name:'Upload',exact:true}).isVisible(),'Purchase invoice upload must remain available');
  assert.ok(await page.getByRole('button',{name:'Foto',exact:true}).isVisible(),'Receipt photo import must remain available');
  assert.ok(await page.getByRole('button',{name:/Camera/}).isVisible());

  await navigateTo('bank');
  const bank=await page.locator('#content').innerText();
  assert.doesNotMatch(bank,/Bankkoppeling nog niet live\./,'Bank page should not carry permanent PSD2/open-banking explanation');
  assert.ok(await page.getByRole('button',{name:/Bank CSV/}).isVisible());
  assert.ok(await page.getByRole('button',{name:/Transactie/}).isVisible());
  await page.screenshot({path:`tests/artifacts/premium-bank-${browserName}-390.png`,fullPage:true});

  await navigateTo('documents');
  const documents=await page.locator('#content').innerText();
  assert.doesNotMatch(documents,/Upload compleet is niet hetzelfde als verwerking compleet\./,'Documents page should not repeat background-processing explanation');
  assert.doesNotMatch(documents,/tekstextractie, tabellen en OCR/,'Documents page should not expose technical OCR explanation in the primary flow');
  assert.ok(await page.getByRole('button',{name:'Upload',exact:true}).isVisible(),'Document upload must remain available');
  assert.ok(await page.getByRole('button',{name:'Foto',exact:true}).isVisible(),'Document photo import must remain available');
  assert.ok(await page.getByRole('button',{name:/Camera/}).isVisible());
  await page.screenshot({path:`tests/artifacts/premium-documents-${browserName}-390.png`,fullPage:true});

  await navigateTo('vat');
  const vat=await page.locator('#content').innerText();
  assert.match(vat,/geen officiële indiening|niet naar de Belastingdienst/i,'VAT must retain not-submitted meaning');
  assert.match(vat,/Indicatief/i,'VAT must retain indicative meaning');

  await navigateTo('control');
  const control=await page.locator('#content').innerText();
  assert.doesNotMatch(control,/Eén werklijst voor uitzonderingen/,'Control center should present the worklist without explanatory marketing copy');
  assert.match(control,/Debiteuren|Bank|Boekingen|Uitzonderingen/,'Control center must keep actionable exception categories');
  await page.screenshot({path:`tests/artifacts/premium-control-${browserName}-390.png`,fullPage:true});

  for(const width of [320,390,430,820])await assertNoGlobalOverflow(width);

  for(const width of [1024,1280,1440]){
    await page.setViewportSize({width,height:900});
    assert.equal(await page.locator('#mobileBottomNav').evaluate(el=>getComputedStyle(el).display),'none','Desktop bottom nav must remain hidden at '+width+'px');
    assert.notEqual(await page.locator('#sidebar').evaluate(el=>getComputedStyle(el).display),'none','Desktop sidebar must remain visible at '+width+'px');
    await assertNoGlobalOverflow(width);
  }

  await page.setViewportSize({width:1280,height:900});
  for(const target of [
    ['dashboard','dashboard'],
    ['invoices','invoices'],
    ['documents','documents'],
    ['bank','bank'],
    ['control','control']
  ]){
    await navigateTo(target[0]);
    await page.screenshot({path:`tests/artifacts/premium-${target[1]}-${browserName}-1280.png`,fullPage:true});
  }

  assert.equal(pageErrors.length,0,'Premium simplification browser flow must not produce JS errors: '+pageErrors.join(' | '));
  console.log('premium app simplification regression passed');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
