import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {chromium,webkit} from 'playwright';

const root=process.cwd();
const require=createRequire(import.meta.url);
const axeSource=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const source=fs.readFileSync(path.join(root,'kwinest','index.html'),'utf8');
const styleMatch=source.match(/<style id="boekuna-product-ui-reference-20261003">([\s\S]*?)<\/style>/);
assert.ok(styleMatch,'Master-reference product UI layer missing');
const ui=styleMatch[1];

for(const [token,value] of Object.entries({
  '--app-charcoal':'#1B1F23',
  '--app-green':'#63D471',
  '--app-surface':'#F6F7F8',
  '--app-muted':'#8A949C',
  '--app-white':'#FFFFFF'
}))assert.ok(ui.includes(token+':'+value),'Product design token mismatch: '+token);
assert.ok(ui.includes('font-family:"Boekuna Space"'),'Space Grotesk display role missing');
assert.ok(ui.includes('font-family:"Boekuna Inter"'),'Inter UI role missing');
assert.equal(/(?:linear|radial)-gradient\(/i.test(ui),false,'Master-reference layer must not use gradients');
assert.equal(/backdrop-filter:(?!none)/i.test(ui),false,'Master-reference layer must not introduce glassmorphism');
assert.ok(ui.includes('@media(prefers-reduced-motion:reduce)'),'Reduced-motion handling missing');
for(const label of ['Overzicht','Facturen','Kosten','Bank','Btw','Rapporten','Instellingen'])assert.ok(source.includes('>'+label+'</button>')||source.includes('>'+label+'</span>'),'Primary product navigation missing '+label);
for(const label of ['Overzicht','Facturen','Kosten','Btw','Meer'])assert.ok(source.includes('<span>'+label+'</span>'),'Mobile reference navigation missing '+label);
assert.equal((source.match(/class="mobile-bottom-nav-item/g)||[]).length,5,'Mobile navigation must expose exactly five primary destinations');
assert.ok(source.includes("function mobilePrimarySection(p=page){return ['dashboard','invoices','expenses','vat'].includes(p)?p:'more'}"),'Secondary mobile destinations must map to More');
assert.ok(source.includes("openUploadSourcePicker('purchase')"),'Bon toevoegen must preserve the existing native upload path');
assert.ok(source.includes('prepareEmailHandoffFromComposer'),'Invoice email handoff must remain present');
assert.equal(/accounts\.google\.com|Sign in with Google|Doorgaan met Google/.test(source),false,'Google account login must stay off');
assert.ok(source.includes('function dashboardPeriodRange('),'Dashboard period helper missing');
assert.ok(source.includes('function setDashboardPeriod('),'Dashboard period switch missing');
for(const label of ['Winst','Omzet','Kosten','Btw apartzetten'])assert.ok(source.includes('dashboard-kpi-label">'+label+'</span>'),'Dashboard KPI missing '+label);
for(const label of ['Administratie','Nog te ontvangen','Nieuwe factuur'])assert.ok(source.includes('dashboard-summary-title">'+label+'</span>'),'Dashboard bottom summary missing '+label);
assert.ok(source.includes('>7 dagen</option>')&&source.includes('>Maand</option>')&&source.includes('>Kwartaal</option>')&&source.includes('>Jaar</option>'),'Dashboard period options incomplete');

const build=spawnSync(process.execPath,['scripts/build-app.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,'App build failed: '+(build.stderr||build.stdout));
const dist=path.join(root,'dist','app');
for(const file of ['index.html','manifest.webmanifest','assets/app-InterVariable.woff2','assets/app-SpaceGrotesk-Variable.ttf'])assert.ok(fs.existsSync(path.join(dist,file)),'Built app asset missing '+file);
let appHtml=fs.readFileSync(path.join(dist,'index.html'),'utf8');
assert.ok(appHtml.includes('boekuna-product-ui-reference-20261003'),'Built artifact must contain the new product UI layer');
assert.equal(appHtml.includes('function showMarketingPage'),false,'App artifact must remain free of marketing runtime');

function replaceLast(sourceText,needle,replacement){
  const i=sourceText.lastIndexOf(needle);
  if(i<0)throw new Error('Missing fixture bootstrap marker: '+needle);
  return sourceText.slice(0,i)+replacement+sourceText.slice(i+needle.length);
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
const base='http://127.0.0.1:'+server.address().port;
const evidence=path.join(root,'tests','artifacts','product-ui-reference');
fs.mkdirSync(evidence,{recursive:true});

async function noOverflow(page,label){
  const result=await page.evaluate(()=>({vw:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert.ok(result.html<=result.vw+2&&result.body<=result.vw+2,label+' horizontal overflow: '+JSON.stringify(result));
}
async function axe(page,label){
  await page.addScriptTag({content:axeSource});
  const result=await page.evaluate(async()=>await axe.run(document.getElementById('mainApp'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
  assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.length})),[],label+' Axe violations');
}
async function openReviewFixture(page){
  await page.evaluate(()=>{
    pendingPdfImport={
      file:new File(['qa'],'qa-bon.jpg',{type:'image/jpeg'}),
      previewUrl:null,
      sha256:'',
      sourceClientRef:'',
      sourceDocumentId:'',
      processingJobId:''
    };
    showPdfImportReview({
      confidenceScore:82,sourceQuality:'processor-v2',documentType:'purchase_invoice',
      party:'QA Leverancier',invoiceNumber:'INK-1',issueDate:'2026-10-01',
      net:100,vatAmount:21,gross:121,vatRate:21,mixedRates:false,
      vatLines:[],lineItems:[],adjustments:[],recognitionChecks:[
        {code:'party',level:'good',title:'Leverancier herkend',detail:'Controleer naam en factuurnummer.'},
        {code:'gross',level:'warn',title:'Controleer het totaal',detail:'Vergelijk het bedrag met het document.'}
      ]
    });
  });
  await page.getByRole('heading',{name:'Document controleren'}).waitFor();
}

try{
  for(const [browserName,browserType] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await browserType.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
      const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));
      await page.goto(base+'/app',{waitUntil:'networkidle'});
      await page.locator('#pageTitle').filter({hasText:'Overzicht'}).waitFor();
      await page.evaluate(async()=>document.fonts.ready);
      assert.equal(await page.evaluate(()=>document.fonts.check('16px "Boekuna Inter"')),true,browserName+' Inter must load locally');
      assert.equal(await page.evaluate(()=>document.fonts.check('32px "Boekuna Space"')),true,browserName+' Space Grotesk must load locally');
      assert.match(await page.locator('#mainApp').evaluate(el=>getComputedStyle(el).fontFamily),/Boekuna Inter/);
      assert.match(await page.locator('.dashboard-page-head h1').evaluate(el=>getComputedStyle(el).fontFamily),/Boekuna Space/);
      assert.equal(await page.locator('#sidebar').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
      assert.equal(await page.locator('.nav-item.active').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(236, 250, 238)');
      assert.deepEqual(await page.locator('.dashboard-kpi-label').allTextContents(),['Winst','Omzet','Kosten','Btw apartzetten']);
      assert.equal(await page.locator('#dashboardPeriod').inputValue(),'month');
      assert.deepEqual((await page.locator('.dashboard-chart-card .chart-legend span').allTextContents()).map(v=>v.trim()),['Omzet','Kosten','Winst']);
      assert.deepEqual(await page.locator('.dashboard-summary-title').allTextContents(),['Administratie','Nog te ontvangen','Nieuwe factuur']);
      await noOverflow(page,browserName+' desktop dashboard');
      await axe(page,browserName+' desktop dashboard');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2),browserName+' 1440x900 dashboard must fit one screen');
      await page.screenshot({path:path.join(evidence,'dashboard-1440-'+browserName+'.png'),fullPage:true});

      await page.setViewportSize({width:1366,height:768});
      await page.evaluate(()=>navigate('dashboard'));
      await noOverflow(page,browserName+' desktop dashboard 1366x768');
      await axe(page,browserName+' desktop dashboard 1366x768');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2),browserName+' 1366x768 dashboard must fit one screen');
      await page.screenshot({path:path.join(evidence,'dashboard-1366-'+browserName+'.png'),fullPage:true});
      await page.setViewportSize({width:1440,height:900});

      await page.evaluate(()=>navigate('invoices'));
      await page.getByRole('heading',{name:'Facturen'}).waitFor();
      const invoicePrimary=page.getByRole('button',{name:/Factuur maken/});
      assert.ok(await invoicePrimary.isVisible());
      assert.equal(await invoicePrimary.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(99, 212, 113)');
      assert.equal(await invoicePrimary.evaluate(el=>getComputedStyle(el).color),'rgb(27, 31, 35)');
      await noOverflow(page,browserName+' desktop invoices');
      await page.screenshot({path:path.join(evidence,'invoices-1440-'+browserName+'.png'),fullPage:true});

      await page.evaluate(()=>navigate('vat'));
      await page.getByRole('heading',{name:'Btw'}).waitFor();
      assert.match(await page.locator('#content').innerText(),/Indicatief/i);
      await noOverflow(page,browserName+' desktop VAT');
      await page.screenshot({path:path.join(evidence,'vat-1440-'+browserName+'.png'),fullPage:true});

      await page.setViewportSize({width:390,height:844});
      await page.evaluate(()=>navigate('dashboard'));
      await page.getByRole('heading',{name:'Overzicht'}).waitFor();
      assert.deepEqual((await page.locator('#mobileBottomNav .mobile-bottom-nav-item').allTextContents()).map(v=>v.trim()),['Overzicht','Facturen','Kosten','Btw','Meer']);
      assert.equal(await page.locator('.dashboard-kpis').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length),1,'390px KPIs must be a single-column flow');
      const targets=await page.locator('#mobileBottomNav .mobile-bottom-nav-item').evaluateAll(nodes=>nodes.map(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height})));
      assert.ok(targets.every(x=>x.h>=44),'Mobile bottom-nav touch targets must be at least 44px high');
      await noOverflow(page,browserName+' mobile dashboard');
      await axe(page,browserName+' mobile dashboard');
      await page.screenshot({path:path.join(evidence,'dashboard-390-'+browserName+'.png'),fullPage:true});

      await openReviewFixture(page);
      await noOverflow(page,browserName+' mobile document review');
      await page.screenshot({path:path.join(evidence,'document-review-390-'+browserName+'.png'),fullPage:true});
      await page.evaluate(()=>closeModal());

      for(const width of [320,360,375,390,393,430,768,1024,1280,1440]){
        await page.setViewportSize({width,height:width<820?844:1000});
        for(const route of ['dashboard','invoices','expenses','bank','vat','reports','settings']){
          await page.evaluate(route=>navigate(route),route);
          await noOverflow(page,browserName+' '+route+' '+width);
        }
      }
      assert.deepEqual(pageErrors,[],browserName+' product UI must have no JavaScript errors');
      await page.close();
    }finally{await browser.close()}
  }
  console.log('BOEKUNA master product UI reference QA: PASS');
}finally{
  await new Promise(resolve=>server.close(resolve));
}
