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
for(const label of ['Overzicht','Inkomsten','Kosten','Bank','Btw','Rapportages','Bonnetjes','Instellingen'])assert.ok(source.includes('>'+label+'</button>')||source.includes('>'+label+'</span>'),'Primary product navigation missing '+label);
for(const label of ['Overzicht','Inkomsten','Kosten','Btw','Meer'])assert.ok(source.includes('<span>'+label+'</span>'),'Mobile reference navigation missing '+label);
assert.equal((source.match(/class="mobile-bottom-nav-item/g)||[]).length,5,'Mobile navigation must expose exactly five primary destinations');
assert.ok(source.includes("function mobilePrimarySection(p=page){return ['dashboard','invoices','expenses','vat'].includes(p)?p:'more'}"),'Secondary mobile destinations must map to More');
assert.ok(source.includes("invoices:'Inkomsten'"),'The user-facing invoices route title must be Inkomsten while the internal route stays invoices');
assert.ok(source.includes("income:'Ontvangsten'"),'The bank income drill-down must be distinguished from the primary Inkomsten route');
assert.ok(source.includes('data-page="invoices"'),'The internal invoices route must remain intact');
assert.ok(source.includes('data-mobile-page="invoices"'),'The mobile deep-link destination must remain invoices');
assert.ok(source.includes("'1300':'Nog te ontvangen van klanten'"),'General-ledger customer receivables label must use plain language');
assert.ok(source.includes("'1600':'Nog te betalen aan leveranciers'"),'General-ledger supplier payables label must use plain language');
assert.ok(source.includes('<strong>Factuur</strong></button>'),'Quick-create invoice action must avoid the Verkoopfactuur jargon label');
assert.ok(source.includes("openUploadSourcePicker('purchase')"),'Bon toevoegen must preserve the existing native upload path');
assert.ok(source.includes('prepareEmailHandoffFromComposer'),'Invoice email handoff must remain present');
assert.equal(/accounts\.google\.com|Sign in with Google|Doorgaan met Google/.test(source),false,'Google account login must stay off');
assert.ok(source.includes('function dashboardPeriodRange('),'Dashboard period helper missing');
assert.ok(source.includes('function setDashboardPeriod('),'Dashboard period switch missing');
assert.ok(source.includes('--app-support:var(--status-info)'),'Supporting accent must reuse the existing info role');
assert.ok(source.includes('function productKpi(')&&source.includes('function productKpiGrid('),'Shared KPI component helpers missing');
assert.ok(source.includes('function renderIncome()')&&source.includes('function renderOutgoings()'),'Income and outgoings subpages missing');
for(const label of ['Winst','Omzet','Kosten','Btw apartzetten','Nog te ontvangen'])assert.ok(source.includes('dashboard-kpi-label">'+label+'</span>'),'Dashboard KPI missing '+label);
for(const label of ['Administratie','Vraag Boekuna','Nieuwe factuur'])assert.ok(source.includes('dashboard-summary-title">'+label+'</span>'),'Dashboard bottom summary missing '+label);
for(const option of ["['7d','7 dagen']","['month','Maand']","['quarter','Kwartaal']","['year','Jaar']"])assert.ok(source.includes(option),'Dashboard period option missing '+option);

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
      assert.deepEqual(await page.locator('.dashboard-kpi-label').allTextContents(),['Winst','Omzet','Kosten','Btw apartzetten','Nog te ontvangen']);
      assert.equal(await page.locator('#dashboardPeriod').inputValue(),'month');
      const dashboardKpiHelpers=(await page.locator('.dashboard-kpis .metric-sub').allTextContents()).map(v=>v.trim());
      assert.deepEqual(dashboardKpiHelpers.slice(0,3),['Omzet minus kosten','Excl. btw','Excl. btw'],'Dashboard KPI helpers must not repeat the selected period');
      assert.notEqual(await page.locator('.dashboard-kpi .metric-icon').first().evaluate(el=>getComputedStyle(el).display),'none','Desktop dashboard KPI icons must remain visible');
      assert.deepEqual((await page.locator('.dashboard-chart-card .chart-legend span').allTextContents()).map(v=>v.trim()),['Omzet','Kosten','Winst']);
      assert.deepEqual(await page.locator('.dashboard-summary-title').allTextContents(),['Administratie','Vraag Boekuna','Nieuwe factuur']);
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
      await page.getByRole('heading',{name:'Inkomsten'}).waitFor();
      const invoicePrimary=page.getByRole('button',{name:/Nieuwe factuur|Factuur maken/});
      assert.ok(await invoicePrimary.isVisible());
      assert.equal(await invoicePrimary.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(99, 212, 113)');
      assert.equal(await invoicePrimary.evaluate(el=>getComputedStyle(el).color),'rgb(27, 31, 35)');
      assert.notEqual(await page.locator('.product-kpi-icon').first().evaluate(el=>getComputedStyle(el).display),'none','Desktop product KPI icons must remain visible');
      await page.evaluate(()=>newInvoice());
      const fieldMetrics=await page.evaluate(()=>{
        const date=document.querySelector('#invoiceForm input[name="issueDate"]');
        const number=document.querySelector('#invoiceForm input[name="paymentDays"]');
        const select=document.querySelector('#invoiceForm select[name="status"]');
        const metric=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {height:Math.round(r.height),radius:s.borderRadius,paddingTop:s.paddingTop,paddingBottom:s.paddingBottom}};
        return {date:metric(date),number:metric(number),select:metric(select)};
      });
      assert.equal(fieldMetrics.date.height,fieldMetrics.number.height,browserName+' date and number input heights must align');
      assert.equal(fieldMetrics.date.height,fieldMetrics.select.height,browserName+' date and select heights must align');
      assert.equal(fieldMetrics.date.radius,fieldMetrics.number.radius,browserName+' date input radius must align');
      assert.equal(fieldMetrics.date.paddingTop,fieldMetrics.number.paddingTop,browserName+' date input vertical padding must align');
      assert.equal(fieldMetrics.date.paddingBottom,fieldMetrics.number.paddingBottom,browserName+' date input vertical padding must align');
      await page.evaluate(()=>closeModal());
      await noOverflow(page,browserName+' desktop invoices');
      await page.screenshot({path:path.join(evidence,'invoices-1440-'+browserName+'.png'),fullPage:true});

      await page.evaluate(()=>navigate('vat'));
      await page.getByRole('heading',{name:'Btw'}).waitFor();
      assert.match(await page.locator('#content').innerText(),/Indicatief/i);
      await noOverflow(page,browserName+' desktop VAT');
      await page.screenshot({path:path.join(evidence,'vat-1440-'+browserName+'.png'),fullPage:true});

      const coreKpis={
        invoices:['Openstaand','Te laat','Betaald deze maand','Concepten'],
        expenses:['Kosten deze maand','Btw die je kunt terugvragen','Grootste categorie','Te controleren'],
        documents:['Te verwerken','Controle nodig','Verwerkt deze maand','Totaal documenten'],
        vat:['Te betalen btw','Ontvangen btw','Btw die je kunt terugvragen','Controle nodig'],
        reports:['Omzet','Kosten','Winst','Winstmarge'],
        income:['Omzet deze maand','Bijgeschreven','Nog te ontvangen','Groei'],
        outgoings:['Deze maand uitgegeven','Nog niet gekoppeld','Terugkerende uitgaven','Te controleren']
      };
      for(const [route,labels] of Object.entries(coreKpis)){
        await page.evaluate(route=>navigate(route),route);
        await page.locator('.product-kpis').waitFor();
        assert.deepEqual((await page.locator('.product-kpi-label').allTextContents()).map(v=>v.trim()),labels,browserName+' '+route+' KPI labels');
        assert.equal(await page.locator('.product-kpi').count(),4,browserName+' '+route+' must expose four coherent KPI cards');
        await noOverflow(page,browserName+' desktop '+route);
        await axe(page,browserName+' desktop '+route);
      }

      for(const [width,height] of [[1366,768],[1440,900],[1920,1080]]){
        await page.setViewportSize({width,height});
        for(const route of ['dashboard',...Object.keys(coreKpis)]){
          await page.evaluate(route=>navigate(route),route);
          await noOverflow(page,browserName+' '+route+' '+width+'x'+height);
          if(route!=='dashboard'){
            const columns=await page.locator('.product-kpis').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length);
            assert.equal(columns,4,browserName+' '+route+' must retain four desktop KPI columns at '+width+'x'+height);
          }
        }
        await page.evaluate(()=>navigate('dashboard'));
        if(width>=1440)assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2),browserName+' '+width+'x'+height+' dashboard must fit one screen');
      }

      await page.setViewportSize({width:390,height:844});
      await page.evaluate(()=>navigate('dashboard'));
      await page.getByRole('heading',{name:'Overzicht'}).waitFor();
      assert.deepEqual((await page.locator('#mobileBottomNav .mobile-bottom-nav-item').allTextContents()).map(v=>v.trim()),['Overzicht','Inkomsten','Kosten','Btw','Meer']);
      assert.ok((await page.locator('.dashboard-kpi .metric-icon').count())>0,'Dashboard KPI icon nodes should remain available to desktop');
      assert.ok(await page.locator('.dashboard-kpi .metric-icon').evaluateAll(nodes=>nodes.every(el=>getComputedStyle(el).display==='none')),'Mobile dashboard KPI icons must be hidden');
      assert.equal(await page.locator('.dashboard-kpis').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length),2,'390px mobile dashboard must pair Omzet and Kosten');
      assert.equal(await page.locator('#content').evaluate(el=>getComputedStyle(el).paddingTop),'14px','390px mobile content padding must use the compact app-only contract');
      assert.equal(await page.locator('.dashboard-chart-card').isVisible(),false,'Large chart belongs on mobile Reports');
      const targets=await page.locator('#mobileBottomNav .mobile-bottom-nav-item').evaluateAll(nodes=>nodes.map(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height})));
      assert.ok(targets.every(x=>x.h>=44),'Mobile bottom-nav touch targets must be at least 44px high');
      await noOverflow(page,browserName+' mobile dashboard');
      await axe(page,browserName+' mobile dashboard');
      await page.screenshot({path:path.join(evidence,'dashboard-390-'+browserName+'.png'),fullPage:true});
      await page.evaluate(()=>navigate('invoices'));
      await page.getByRole('heading',{name:'Inkomsten'}).waitFor();
      assert.ok((await page.locator('.product-kpi-icon').count())>0,'Product KPI icon nodes should remain available to desktop');
      assert.ok(await page.locator('.product-kpi-icon').evaluateAll(nodes=>nodes.every(el=>getComputedStyle(el).display==='none')),'Mobile product KPI icons must be hidden');
      const firstContentTop=await page.locator('.workspace-table').evaluate(el=>Math.round(el.getBoundingClientRect().top));
      assert.ok(firstContentTop<844,browserName+' mobile Inkomsten main list should begin inside the first viewport');
      await page.evaluate(()=>navigate('vat'));
      await page.getByRole('heading',{name:'Btw'}).waitFor();
      const vatStatus=page.locator('.product-page-head .page-status').first();
      assert.ok(await vatStatus.isVisible(),browserName+' mobile VAT financial context must remain visible');
      assert.match(await vatStatus.innerText(),/indicatief|ingediend/i,browserName+' mobile VAT status must preserve filing context');

      await openReviewFixture(page);
      await noOverflow(page,browserName+' mobile document review');
      await page.screenshot({path:path.join(evidence,'document-review-390-'+browserName+'.png'),fullPage:true});
      await page.evaluate(()=>closeModal());

      for(const width of [320,360,375,390,393,430,768,1024,1280,1440]){
        await page.setViewportSize({width,height:width<820?844:1000});
        for(const route of ['dashboard','invoices','expenses','bank','income','outgoings','documents','vat','reports','settings']){
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
