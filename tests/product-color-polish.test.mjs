import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';

const root=process.cwd();
const cssPath=path.join(root,'kwinest','app-assets','product-color-polish.css');
assert.ok(fs.existsSync(cssPath),'App-only colour polish asset missing');
assert.equal(fs.existsSync(path.join(root,'public','assets','product-color-polish.css')),false,'Colour polish must not leak into public marketing assets');

const css=fs.readFileSync(cssPath,'utf8');
for(const token of [
  '--app-ink:#1B1F23','--app-bg:#F6F7F8','--app-surface:#FFFFFF','--app-muted:#8A949C','--app-brand:#63D471'
])assert.ok(css.includes(token),'Canonical product token missing: '+token);
assert.equal(/(?:linear|radial)-gradient\(/i.test(css),false,'Colour polish must not introduce gradients');
assert.equal(/#123B3A|#2B736C|#F8F7F3|#F3F0E8/i.test(css),false,'Legacy decorative palette leaked into app colour layer');
assert.match(css,/#mainApp \.chart \.bar\.sales[^}]*var\(--app-brand\)/,'Revenue chart role must use brand green, not info blue');
assert.match(css,/#mainApp \.chart \.bar\.costs[^}]*#C9D0D4/i,'Costs chart role must remain neutral');
assert.match(css,/#mainApp \.btn\.danger[^}]*var\(--status-error\)/,'Danger action must use semantic error colour');
assert.match(css,/#mainApp \.notice\.warn[^}]*var\(--status-warning-soft\)/,'Warning presentation must use semantic warning colour');

const build=spawnSync(process.execPath,['scripts/build-app.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,'App build failed: '+(build.stderr||build.stdout));
const dist=path.join(root,'dist','app');
assert.ok(fs.existsSync(path.join(dist,'assets','product-color-polish.css')),'Built app colour asset missing');

let appHtml=fs.readFileSync(path.join(dist,'index.html'),'utf8');
assert.match(appHtml,/product-color-polish\.css\?v=20261006a/,'Built product must load app-only colour layer');

function replaceLast(source,needle,replacement){
  const i=source.lastIndexOf(needle);
  if(i<0)throw new Error('Missing bootstrap marker: '+needle);
  return source.slice(0,i)+replacement+source.slice(i+needle.length);
}
const fixture=[
  "currentUser={...TEST_USER,email:'qa@example.test',supabaseUser:{user_metadata:{first_name:'Kwin'}}};",
  "state=structuredClone(DEFAULT);",
  "state.company={...state.company,name:'QA Test BV',tradeName:'Boekuna QA',contactName:'Kwin',email:'qa@example.test',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',kor:false};",
  "state.contacts=[{id:'c1',type:'customer',name:'QA Klant BV',email:'klant@example.test',address:'Klantstraat 2',postal:'3012BB',city:'Rotterdam'}];",
  "state.invoices=[{id:'i1',number:'2026-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:'2026-10-01',dueDate:'2026-10-15',taxTreatment:'standard',payments:[],importedTotals:{net:100,vat:21,gross:121}}];",
  "state.expenses=[{id:'e1',date:'2026-10-01',vendor:'QA Leverancier',invoiceNumber:'INK-1',category:'Kantoor',paymentMethod:'bank',exVat:50,vatRate:21,vatAmount:10.5,gross:60.5,notes:''}];",
  "state.transactions=[{id:'t1',date:'2026-10-02',description:'QA bankregel',amount:-10,status:'unmatched'}];",
  "state.documents=[{id:'d1',name:'qa-bon.jpg',type:'Inkoopfactuur',date:'2026-10-01',processingState:'ready',verification:{status:'needs_review',method:'manual-review',differences:[]}}];",
  "state.services=[];state.bookings=[];state.plannedCash=[];",
  "documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;",
  "enterApp();"
].join('\n');
appHtml=appHtml.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
appHtml=replaceLast(appHtml,'initAuth();',fixture);

const mime={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  const pathname=decodeURIComponent(url.pathname);
  if(pathname.startsWith('/assets/')){
    const file=path.join(dist,pathname);
    if(fs.existsSync(file)){res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});return fs.createReadStream(file).pipe(res)}
  }
  if(pathname==='/manifest.webmanifest'){res.writeHead(200,{'content-type':mime['.webmanifest']});return fs.createReadStream(path.join(dist,'manifest.webmanifest')).pipe(res)}
  let html=appHtml;
  if(url.searchParams.get('baseline')==='1')html=html.replace(/<link rel="stylesheet" href="\/assets\/product-color-polish\.css\?v=20261006a">\n?/,'');
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(html);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browserName=(process.env.BOEKUNA_BROWSER||'chromium').toLowerCase();
const browserType=browserName==='webkit'?webkit:chromium;
const evidence=path.join(root,'tests','artifacts','product-color-polish',browserName);
fs.mkdirSync(evidence,{recursive:true});

async function noOverflow(page,label){
  const r=await page.evaluate(()=>({vw:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert.ok(r.html<=r.vw+2&&r.body<=r.vw+2,label+' horizontal overflow '+JSON.stringify(r));
}
async function shot(page,name){await page.screenshot({path:path.join(evidence,name+'.png'),fullPage:true})}
async function openReviewFixture(page){
  await page.evaluate(()=>{
    pendingPdfImport={file:new File(['qa'],'qa-bon.jpg',{type:'image/jpeg'}),previewUrl:null,sha256:'',sourceClientRef:'',sourceDocumentId:'',processingJobId:''};
    showPdfImportReview({
      confidenceScore:82,sourceQuality:'processor-v2',documentType:'purchase_invoice',
      party:'QA Leverancier',invoiceNumber:'INK-1',issueDate:'2026-10-01',
      net:100,vatAmount:21,gross:121,vatRate:21,mixedRates:false,vatLines:[],lineItems:[],adjustments:[],
      recognitionChecks:[
        {code:'party',level:'good',title:'Leverancier herkend',detail:'Controleer naam en factuurnummer.'},
        {code:'gross',level:'warn',title:'Controleer het totaal',detail:'Vergelijk het bedrag met het document.'}
      ]
    });
  });
  await page.getByRole('heading',{name:'Document controleren'}).waitFor();
}

const browser=await browserType.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+'/app',{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'Overzicht'}).waitFor();

  const canonical=await page.evaluate(()=>({
    ink:getComputedStyle(document.documentElement).getPropertyValue('--app-ink').trim(),
    bg:getComputedStyle(document.documentElement).getPropertyValue('--app-bg').trim(),
    brand:getComputedStyle(document.documentElement).getPropertyValue('--app-brand').trim()
  }));
  assert.deepEqual(canonical,{ink:'#1B1F23',bg:'#F6F7F8',brand:'#63D471'});
  assert.equal(await page.locator('#sidebar').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
  const activeNav=page.locator('#sidebar .nav-item.active');
  assert.equal(await activeNav.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(236, 250, 238)');
  assert.match(await activeNav.evaluate(el=>getComputedStyle(el).boxShadow),/99, 212, 113/);

  // Non-status financial concepts stay neutral; actual attention/error states keep semantics.
  const dashboardTones=await page.locator('.dashboard-kpi').evaluateAll(cards=>cards.map(card=>({label:card.querySelector('.dashboard-kpi-label')?.textContent?.trim(),classes:card.className})));
  assert.match(dashboardTones.find(x=>x.label==='Kosten')?.classes||'',/kpi-tone-neutral/,'Dashboard Kosten must not look like a warning');

  await page.evaluate(()=>navigate('invoices'));
  const invoiceTones=await page.locator('.product-kpi').evaluateAll(cards=>cards.map(card=>({label:card.querySelector('.product-kpi-label')?.textContent?.trim(),classes:card.className})));
  assert.match(invoiceTones.find(x=>x.label==='Omzet')?.classes||'',/kpi-tone-support/);
  assert.match(invoiceTones.find(x=>x.label==='Te laat')?.classes||'',/kpi-tone-error/);

  await page.evaluate(()=>navigate('expenses'));
  const expenseTones=await page.locator('.product-kpi').evaluateAll(cards=>cards.map(card=>({label:card.querySelector('.product-kpi-label')?.textContent?.trim(),classes:card.className})));
  assert.match(expenseTones.find(x=>x.label==='Kosten')?.classes||'',/kpi-tone-neutral/,'Kosten must remain neutral');
  assert.match(expenseTones.find(x=>x.label==='Te controleren')?.classes||'',/kpi-tone-warning/,'Real review attention must remain warning');

  await page.evaluate(()=>navigate('bank'));
  const bankTones=await page.locator('.product-kpi').evaluateAll(cards=>cards.map(card=>({label:card.querySelector('.product-kpi-label')?.textContent?.trim(),classes:card.className})));
  assert.match(bankTones.find(x=>x.label==='Uitgaven')?.classes||'',/kpi-tone-neutral/,'Normal bank outgoings must remain neutral');
  assert.match(bankTones.find(x=>x.label==='Te verwerken')?.classes||'',/kpi-tone-warning/,'Unmatched bank work must remain warning');

  await page.evaluate(()=>navigate('reports'));
  const reportTones=await page.locator('.product-kpi').evaluateAll(cards=>cards.map(card=>({label:card.querySelector('.product-kpi-label')?.textContent?.trim(),classes:card.className})));
  assert.match(reportTones.find(x=>x.label==='Kosten')?.classes||'',/kpi-tone-neutral/,'Report costs must remain neutral');

  await page.evaluate(()=>navigate('dashboard'));

  const routes=[
    ['dashboard','overzicht-desktop'],
    ['invoices','inkomsten'],
    ['expenses','kosten'],
    ['documents','bonnetjes'],
    ['bank','bank'],
    ['vat','btw'],
    ['reports','rapportages'],
    ['settings','instellingen']
  ];
  for(const [route,name] of routes){
    await page.evaluate(r=>navigate(r),route);
    await noOverflow(page,browserName+' '+route);
    await shot(page,name+'-after');
  }

  await page.evaluate(()=>navigate('invoices'));
  const primary=page.getByRole('button',{name:/Nieuwe factuur|Factuur maken/}).first();
  assert.equal(await primary.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(99, 212, 113)');
  assert.equal(await primary.evaluate(el=>getComputedStyle(el).color),'rgb(27, 31, 35)');
  await page.evaluate(()=>newInvoice());
  await page.locator('#invoiceForm').waitFor();
  await shot(page,'form-factuur-after');
  await page.evaluate(()=>closeModal());

  await openReviewFixture(page);
  const warning=page.locator('#modalRoot .notice.warn').first();
  if(await warning.count()){
    assert.equal(await warning.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 247, 232)');
  }
  await shot(page,'warning-document-review-after');
  await page.evaluate(()=>closeModal());

  await page.evaluate(()=>navigate('settings'));
  const danger=page.locator('.btn.danger').first();
  assert.ok(await danger.count()>0,'Settings must expose a destructive action');
  assert.equal(await danger.evaluate(el=>getComputedStyle(el).color),'rgb(180, 35, 24)');
  await shot(page,'danger-settings-after');

  await page.evaluate(()=>navigate('dashboard'));
  const success=page.locator('#cloudSyncBadge.badge.good');
  assert.ok(await success.count()>0,'Success state must remain visible');
  assert.equal(await success.evaluate(el=>getComputedStyle(el).color),'rgb(22, 115, 58)');
  await shot(page,'success-dashboard-after');

  const chart=await page.evaluate(()=>({
    sales:getComputedStyle(document.querySelector('.chart .bar.sales')).backgroundColor,
    costs:getComputedStyle(document.querySelector('.chart .bar.costs')).backgroundColor,
    profit:getComputedStyle(document.querySelector('.chart .bar.profit')).backgroundColor
  }));
  assert.deepEqual(chart,{sales:'rgb(99, 212, 113)',costs:'rgb(201, 208, 212)',profit:'rgb(27, 31, 35)'});

  for(const [width,height] of [[320,844],[375,844],[390,844],[430,932],[768,1024],[1024,900],[1280,900],[1440,900]]){
    await page.setViewportSize({width,height});
    for(const route of ['dashboard','invoices','expenses','documents','bank','vat','reports','settings']){
      await page.evaluate(r=>navigate(r),route);
      await noOverflow(page,browserName+' '+route+' '+width);
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>navigate('dashboard'));
  assert.equal(await page.locator('#mobileBottomNav .mobile-bottom-nav-item.active').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(236, 250, 238)');
  await shot(page,'overzicht-mobile-after');

  // Baseline captures prove the change visually without mutating the historical source.
  const before=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await before.goto(base+'/app?baseline=1',{waitUntil:'networkidle'});
  await before.getByRole('heading',{name:'Overzicht'}).waitFor();
  for(const [route,name] of routes){
    await before.evaluate(r=>navigate(r),route);
    await shot(before,name+'-before');
  }
  await before.setViewportSize({width:390,height:844});
  await before.evaluate(()=>navigate('dashboard'));
  await shot(before,'overzicht-mobile-before');
  await before.close();

  assert.deepEqual(errors,[],browserName+' colour polish must have no page errors');
  console.log('BOEKUNA product colour & warmth polish: PASS ('+browserName+')');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
