// Supplier → domain → logo chain (10 October 2026 audit, P1).
// A web address printed on a scanned receipt reaches the relation only when it plausibly
// matches the supplier name, is stored with its provenance, and the existing own-site icon
// lookup then shows a logo in the cost list. Negative cases stay on initials or the category
// icon: a free-mail domain, a platform domain that does not match the name, two relations
// with the same name, and a site without a usable icon. No logo service is ever contacted.
// This covers text evidence (printed address) only; a logo drawn in the pixels is never
// "recognised".
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';

const root=process.cwd();
const build=spawnSync(process.execPath,['scripts/build-app.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,'app build failed: '+(build.stderr||build.stdout));
const dist=path.join(root,'dist','app');
const browserName=process.env.BOOKUNA_BROWSER||'chromium';

function replaceLast(text,needle,replacement){
  const i=text.lastIndexOf(needle);
  if(i<0)throw new Error('Missing fixture bootstrap marker: '+needle);
  return text.slice(0,i)+replacement+text.slice(i+needle.length);
}
let appHtml=fs.readFileSync(path.join(dist,'index.html'),'utf8').replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
appHtml=replaceLast(appHtml,'initAuth();',[
  "currentUser={...TEST_USER,email:'logo-qa@example.test'};",
  "sessionStorage.setItem(FINANCIAL_PERIOD_KEY,'all');",
  "state=structuredClone(DEFAULT);",
  "for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];",
  "state.company={...state.company,name:'Logo QA BV',kvk:'12345678',vat:'NL123456789B01',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',email:'logo-qa@example.test'};",
  // Two relations with the same name but different sites: never a guess, so never a logo.
  "state.contacts=[{id:'g1',type:'supplier',name:'Gamma',website:'gamma-one.test'},{id:'g2',type:'supplier',name:'Gamma B.V.',website:'gamma-two.test'},{id:'p1',type:'supplier',name:'Praxis',website:'praxis-nologo.test'},{id:'s1',type:'supplier',name:'Studio Noord',email:'studio@gmail.com'}];",
  "const d0=new Date().toISOString().slice(0,10);",
  "state.expenses=[{id:'e-gamma',date:d0,vendor:'Gamma',category:'Inkoop',exVat:10,vatRate:21},{id:'e-praxis',date:d0,vendor:'Praxis',category:'Inkoop',exVat:10,vatRate:21},{id:'e-studio',date:d0,vendor:'Studio Noord',category:'Inkoop',exVat:10,vatRate:21}];",
  "documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;window.confirm=()=>true;",
  "enterApp();"
].join('\n'));

const mime={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(pathname.startsWith('/assets/')){
    const file=path.join(dist,pathname);
    if(fs.existsSync(file)){res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});return fs.createReadStream(file).pipe(res)}
  }
  if(pathname==='/manifest.webmanifest'){res.writeHead(200,{'content-type':mime['.webmanifest']});return fs.createReadStream(path.join(dist,'manifest.webmanifest')).pipe(res)}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(appHtml);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
const browser=await (browserName==='webkit'?webkit:chromium).launch();
const context=await browser.newContext({viewport:{width:1280,height:900},locale:'nl-NL'});
const outside=[];
const logoPng=fs.readFileSync(path.join(root,'public','assets','boekuna-app-icon-180.png'));
await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>{
  const u=new URL(route.request().url());outside.push(u.host+u.pathname);
  if(u.host==='hema-logo.test'&&u.pathname==='/apple-touch-icon.png')return route.fulfill({status:200,contentType:'image/png',body:logoPng});
  return route.fulfill({status:404,body:''});
});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
page.setDefaultTimeout(8000);
await page.goto(url+'/',{waitUntil:'domcontentloaded'});
await page.locator('#mainApp').waitFor();

async function reviewAndSave(parsed){
  await page.evaluate(parsed=>{
    const base={type:'purchase',documentType:'receipt',confidenceScore:96,sourceQuality:'processor-v2',invoiceNumber:'',issueDate:new Date().toISOString().slice(0,10),dueDate:'',
      description:'',category:'Inkoop',currency:'EUR',status:'paid',net:9.5,vatAmount:1.99,gross:11.49,vatRate:21,mixedRates:false,
      vatLines:[{rate:21,taxableAmount:9.5,vatAmount:1.99}],lineItems:[],adjustments:[],
      fieldConfidence:{party:99,invoiceNumber:99,issueDate:99,net:99,vatAmount:99,gross:99,vatRate:99,vatLines:99,category:90}};
    pendingPdfImport={file:new File(['qa'],'bon.jpg',{type:'image/jpeg'}),parsed:{...base,...parsed},previewUrl:null,sha256:'logo-qa-'+Math.random(),sourceClientRef:'',sourceDocumentId:'',processingJobId:''};
    showPdfImportReview(pendingPdfImport.parsed);
  },parsed);
  await page.getByRole('heading',{name:'Document controleren'}).waitFor();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve())));
  const next=page.getByRole('button',{name:'Volgende',exact:true});
  if(await next.count())await next.click();
  await page.locator('[data-review-save]:visible').first().click();
  await page.waitForFunction(name=>state.expenses.some(e=>e.vendor===name),parsed.party);
}

try{
  // 1. Printed address that matches the supplier name: stored with provenance, logo shown.
  await reviewAndSave({party:'HEMA',website:'www.hema-logo.test',email:''});
  const hema=await page.evaluate(()=>state.contacts.find(c=>c.name==='HEMA'));
  assert.equal(hema?.website,'hema-logo.test','matching printed address is stored on the relation');
  assert.equal(hema?.websiteSource,'document','provenance of the address is kept');
  assert.ok(hema?.websiteSeenAt,'moment of the evidence is kept');

  // 2. Platform address that does not match the supplier name: left out, user may fill it in.
  await reviewAndSave({party:'Bakker Jansen',website:'www.marktplaats-platform.test',email:''});
  const bakker=await page.evaluate(()=>state.contacts.find(c=>c.name==='Bakker Jansen'));
  assert.equal(bakker?.website||'','','a non-matching address is not attached to the relation');
  assert.ok(!outside.some(r=>r.startsWith('marktplaats-platform.test')),'no request to a non-matching domain');

  // 3. The cost list: logo for HEMA, initials/category icon for every negative case.
  await page.evaluate(()=>navigate('expenses'));
  const rowFor=name=>page.locator('table.mobile-expenses tbody tr').filter({hasText:name}).first();
  await rowFor('HEMA').locator('.party-avatar.has-logo').waitFor();
  assert.equal(await rowFor('HEMA').locator('.party-avatar img').getAttribute('referrerpolicy'),'no-referrer');
  await page.waitForTimeout(500);
  assert.equal(await rowFor('Gamma').locator('.party-avatar.has-logo').count(),0,'two relations with the same name give no logo');
  assert.equal(await rowFor('Praxis').locator('.party-avatar.has-logo').count(),0,'a site without a usable icon falls back');
  assert.equal(await rowFor('Praxis').locator('.party-avatar .party-initials').count(),1,'initials stay visible without a logo');
  assert.equal(await rowFor('Studio Noord').locator('.party-avatar.has-logo').count(),0,'a free-mail domain never becomes a logo');
  assert.equal(await rowFor('Bakker Jansen').locator('.party-avatar.has-logo').count(),0);
  assert.ok(!outside.some(r=>/gamma-(one|two)\.test/.test(r)),'ambiguous same-name relations are not looked up: '+outside.join(', '));
  assert.ok(!outside.some(r=>r.startsWith('gmail.com')),'free-mail domains are not looked up');
  assert.ok(outside.every(r=>/^(www\.)?(hema-logo|praxis-nologo)\.test\//.test(r)),'only the relations\' own sites are contacted, never a logo service: '+outside.join(', '));
  assert.ok(outside.filter(r=>r.startsWith('praxis-nologo.test')||r.startsWith('www.praxis-nologo.test')).length<=3,'a missing icon is tried at most three times');

  // 4. The outcome is remembered per domain, so a reload does not retry the missing icon.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#mainApp').waitFor();
  const before=outside.length;
  await page.evaluate(()=>navigate('expenses'));
  await page.waitForTimeout(800);
  assert.ok(!outside.slice(before).some(r=>r.includes('praxis-nologo.test')),'negative outcome is cached across loads');

  assert.deepEqual(errors,[],'no page errors');
  console.log('supplier logo evidence ('+browserName+'): ok');
}finally{
  await browser.close();
  server.close();
}
