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
const colorPolish=fs.readFileSync(path.join(root,'kwinest','app-assets','product-color-polish.css'),'utf8');
const uxPolish=fs.readFileSync(path.join(root,'kwinest','app-assets','product-ux-polish-round-3.css'),'utf8');
assert.ok(uxPolish.includes('--boekuna-system-font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif'),'Round 3 must use the native platform system-font stack');
assert.equal(/Boekuna (?:Inter|Space)/.test(uxPolish),false,'Round 3 must not depend on app-only Inter or Space Grotesk as primary UI fonts');
assert.ok(uxPolish.includes('#mobileBottomNav{display:none!important}'),'Pre-auth mobile navigation gate missing');
assert.ok(uxPolish.includes('.quick-action-backdrop'),'Central mobile quick-create presentation missing');
assert.ok(uxPolish.includes('#modalRoot .report-preview-modal #reportPreviewFrame{'),'A4 report iframe must have a dedicated geometry selector');
assert.ok(uxPolish.includes('width:794px!important')&&uxPolish.includes('min-width:794px!important')&&uxPolish.includes('max-width:none!important'),'A4 report iframe fixed-width cascade contract missing');
assert.ok(uxPolish.includes('transform-origin:top left;'),'A4 report iframe must keep the top-left transform-origin source contract');
assert.ok(source.includes('id="appBootstrap"')&&source.includes('role="status"')&&source.includes('aria-live="polite"'),'Accessible auth bootstrap state missing');
assert.ok(source.includes("setBootstrapVisible(true);setProductUiAuthenticated(false);document.getElementById('authRoot').innerHTML='';"),'Auth initialization must show bootstrap before session resolution');
assert.ok(source.includes("setProductUiAuthenticated(false);document.getElementById('mainApp').style.display='none';cleanupDocumentBackgroundProcessing();"),'Logout must hide authenticated navigation immediately');
assert.ok(source.includes('const today=()=>localDateOnly(new Date());'),'today() must use the local calendar date');
assert.equal(source.includes("const today=()=>new Date().toISOString().slice(0,10);"),false,'Date-only today() must not round-trip through UTC');
const reportSource=source.slice(source.indexOf('function buildReportPreview(){'),source.indexOf('async function deleteStoredFile'));
assert.ok(reportSource.includes('body{width:210mm;min-height:297mm;padding:16mm;background:#fff}'),'Report screen preview must preserve A4 paper geometry');
assert.equal(reportSource.includes('.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}'),false,'Report preview must not switch to a mobile KPI layout');
assert.ok(reportSource.includes('page-break-before:always'),'Report must preserve explicit multi-page breaks');
for(const token of ['#1B1F23','#63D471','#F6F7F8','#8A949C','#FFFFFF'])assert.ok(colorPolish.includes(token),'Product colour polish missing canonical token '+token);
for(const semantic of ['--status-success:#177A31','--status-warning:#B45309','--status-error:#C2362B','--status-info:#2563EB'])assert.ok(colorPolish.includes(semantic),'Semantic colour mapping missing '+semantic);
assert.equal(/(?:linear|radial)-gradient\(/i.test(colorPolish),false,'Product colour polish must not introduce gradients');
assert.equal(/(?:\.marketing\b|body:not\(|\.site-header\b|\.marketing-nav\b)/.test(colorPolish),false,'Product colour polish must remain isolated from public marketing selectors');
assert.ok(colorPolish.includes('#mainApp')&&colorPolish.includes('#modalRoot'),'Product colour polish must stay scoped to app roots');
assert.equal(colorPolish.includes('#mainApp,#modalRoot,#authRoot{'),false,'Auth tokens must not leak through the shared authRoot/marketing container');
assert.ok(colorPolish.includes('#authRoot .auth-root{'),'Auth palette must be scoped to the authentication shell only');
assert.ok(colorPolish.includes('--app-support:var(--app-brand)'),'Non-semantic supporting accent must resolve to BOEKUNA green, not info blue');
assert.ok(colorPolish.includes('.mobile-bottom-nav{'),'Mobile bottom navigation colour polish must target the real app-only nav outside #mainApp');
assert.equal(colorPolish.includes('#mainApp .mobile-bottom-nav{'),false,'Mobile bottom navigation must not be incorrectly scoped beneath #mainApp');
for(const selector of ['.soft-panel','.processing-shell','.processing-review-skeleton div::after']){
  assert.ok(colorPolish.includes(selector),'Product colour polish must normalize legacy gradient surface '+selector);
}
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
assert.ok(uxPolish.includes('font-family:var(--boekuna-system-font)!important'),'System UI font override missing');
assert.equal(/(?:linear|radial)-gradient\(/i.test(ui),false,'Master-reference layer must not use gradients');
assert.equal(/backdrop-filter:(?!none)/i.test(ui),false,'Master-reference layer must not introduce glassmorphism');
assert.ok(ui.includes('@media(prefers-reduced-motion:reduce)'),'Reduced-motion handling missing');
for(const label of ['Overzicht','Inkomsten','Kosten','Bank','Btw','Rapportages','Bonnetjes','Instellingen'])assert.ok(source.includes('>'+label+'</button>')||source.includes('>'+label+'</span>'),'Primary product navigation missing '+label);
for(const label of ['Overzicht','Inkomsten','Kosten','Btw','Bonnen'])assert.ok(source.includes('<span>'+label+'</span>'),'Mobile reference navigation missing '+label);
assert.equal((source.match(/class="mobile-bottom-nav-item/g)||[]).length,5,'Mobile navigation must expose exactly five primary destinations');
assert.ok(source.includes("function mobilePrimarySection(p=page){return ['dashboard','invoices','expenses','vat','documents'].includes(p)?p:'more'}"),'Bonnen is a primary mobile destination; the rest lives in the menu');
assert.ok(source.includes("invoices:'Inkomsten'"),'The user-facing invoices route title must be Inkomsten while the internal route stays invoices');
assert.ok(source.includes("income:'Ontvangsten'"),'The bank income drill-down must be distinguished from the primary Inkomsten route');
assert.ok(source.includes('data-page="invoices"'),'The internal invoices route must remain intact');
assert.ok(source.includes('data-mobile-page="invoices"'),'The mobile deep-link destination must remain invoices');
assert.ok(source.includes("'1300':'Debiteuren'"),'Internal journal account contract must keep the established Debiteuren label');
assert.ok(source.includes("'1600':'Crediteuren'"),'Internal journal account contract must keep the established Crediteuren label');
assert.ok(source.includes("'1300':'Nog te ontvangen van klanten'"),'Ledger presentation map must expose the customer receivables label in plain language');
assert.ok(source.includes("'1600':'Nog te betalen aan leveranciers'"),'Ledger presentation map must expose the supplier payables label in plain language');
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
for(const option of ["['week','Deze week']","['month','Deze maand']","['quarter','Dit kwartaal']","['year','Dit jaar']","['all','Alles']","['custom','Aangepaste periode']"])assert.ok(source.includes(option),'Shared financial period option missing '+option);
for(const marker of ['product-page-shell','page-period-slot','product-page-actions'])assert.ok(source.includes(marker),'Shared product header pattern missing '+marker);
assert.ok(source.includes('function fitFinancialCardValues('),'Adaptive financial-card value fitting helper missing');
assert.ok(source.includes('#mainApp .kpi-tone-primary .metric-value{color:var(--app-charcoal)}'),'Primary KPI emphasis must stay neutral, not success-green');
assert.ok(source.includes('#mainApp .kpi-tone-success .metric-value{color:var(--status-success)}'),'Success KPI values must keep explicit success color');

const build=spawnSync(process.execPath,['scripts/build-app.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,'App build failed: '+(build.stderr||build.stdout));
const dist=path.join(root,'dist','app');
for(const file of ['index.html','manifest.webmanifest','assets/app-InterVariable.woff2','assets/app-SpaceGrotesk-Variable.ttf','assets/product-color-polish.css','assets/product-ux-polish-round-3.css'])assert.ok(fs.existsSync(path.join(dist,file)),'Built app asset missing '+file);
let appHtml=fs.readFileSync(path.join(dist,'index.html'),'utf8');
assert.ok(appHtml.includes('boekuna-product-ui-reference-20261003'),'Built artifact must contain the new product UI layer');
assert.ok(appHtml.includes('/assets/product-color-polish.css?v=20261006a'),'Built artifact must load the app-only colour polish layer');
assert.ok(appHtml.includes('/assets/product-ux-polish-round-3.css?v=20261007a'),'Built artifact must load Round 3 after the established colour baseline');
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
async function noDecorativeShadows(page,label){
  const shadows=await page.evaluate(()=>{
    const roots=[document.getElementById('mainApp'),document.getElementById('mobileBottomNav'),document.getElementById('modalRoot'),document.querySelector('#authRoot .auth-root')].filter(Boolean);
    const nodes=roots.flatMap(root=>[root,...root.querySelectorAll('*')]);
    return nodes.filter((el,index)=>nodes.indexOf(el)===index).filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&!el.matches(':focus,:focus-visible')}).map(el=>({tag:el.tagName,className:String(el.className||''),shadow:getComputedStyle(el).boxShadow}));
  });
  const offenders=shadows.filter(item=>item.shadow!=='none');
  assert.deepEqual(offenders,[],label+' decorative shadows: '+JSON.stringify(offenders));
}
async function reportA4State(page,label){
  await page.evaluate(()=>printReport());
  await page.locator('#reportPreviewFrame').waitFor();
  await page.waitForFunction(()=>{const f=document.getElementById('reportPreviewFrame');return f?.contentDocument?.body&&f.style.transform});
  const state=await page.evaluate(()=>{
    const frame=document.getElementById('reportPreviewFrame'),doc=frame.contentDocument,body=doc.body,kpis=doc.querySelector('.kpis'),canvas=document.getElementById('reportPreviewCanvas');
    const bodyStyle=frame.contentWindow.getComputedStyle(body),kpiStyle=frame.contentWindow.getComputedStyle(kpis),canvasRect=canvas.getBoundingClientRect();
    const frameStyle=getComputedStyle(frame);
    return {innerWidth:frame.contentWindow.innerWidth,inlineWidth:frame.style.width,frameCssWidth:parseFloat(frameStyle.width),frameCssHeight:parseFloat(frameStyle.height),bodyWidth:body.getBoundingClientRect().width,bodyCssWidth:bodyStyle.width,kpiColumns:kpiStyle.gridTemplateColumns.split(' ').filter(Boolean).length,transform:frame.style.transform,transformOrigin:frameStyle.transformOrigin,canvasWidth:canvasRect.width,canvasHeight:canvasRect.height,scrollHeight:doc.documentElement.scrollHeight};
  });
  assert.equal(state.inlineWidth,'794px',label+' JS A4 geometry must request a 794px iframe');
  assert.ok(Math.abs(state.frameCssWidth-794)<=2,label+' preview frame CSS width must remain A4-width before scaling: '+JSON.stringify(state));
  assert.ok(Math.abs(state.frameCssHeight-1123)<=2,label+' preview frame CSS height must remain A4-height before scaling: '+JSON.stringify(state));
  assert.ok(Math.abs(state.bodyWidth-794)<=3,label+' paper must remain 210mm/A4-width: '+JSON.stringify(state));
  assert.equal(state.kpiColumns,4,label+' PDF KPI composition must stay desktop/document layout');
  assert.match(state.transform,/scale\(/,label+' preview must scale the fixed paper rather than reflow it');
  const scaleMatch=state.transform.match(/scale\(([^)]+)\)/),scale=scaleMatch?Number(scaleMatch[1]):NaN;
  if(Number.isFinite(scale)&&scale<0.999)assert.match(state.transformOrigin,/^0px 0px/,label+' scaled A4 preview must scale from the top-left origin');
  return state;
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
      const appFont=await page.locator('#mainApp').evaluate(el=>getComputedStyle(el).fontFamily);
      const headingFont=await page.locator('.dashboard-page-head h1').evaluate(el=>getComputedStyle(el).fontFamily);
      assert.match(appFont,/-apple-system|Segoe UI|Roboto/,browserName+' app must use the platform system-font stack');
      assert.doesNotMatch(appFont,/Boekuna Inter|Boekuna Space/,browserName+' app must not use legacy webfonts as its primary UI font');
      assert.match(headingFont,/-apple-system|Segoe UI|Roboto/,browserName+' headings must use the same native system stack');
      assert.equal(await page.locator('#sidebar').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
      assert.equal(await page.locator('.nav-item.active').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(236, 250, 238)');
      const semanticColours=await page.evaluate(()=>{
        const probe=document.createElement('div');
        probe.id='semanticColourProbe';
        probe.innerHTML='<span class="badge good">Betaald</span><span class="badge warn">Controle nodig</span><span class="badge bad">Fout</span><span class="badge info">Info</span><button class="btn primary">Opslaan</button>';
        document.getElementById('mainApp').appendChild(probe);
        const read=selector=>{const s=getComputedStyle(probe.querySelector(selector));return {color:s.color,background:s.backgroundColor,border:s.borderColor,fontWeight:s.fontWeight}};
        const result={success:read('.good'),warning:read('.warn'),error:read('.bad'),info:read('.info'),primary:read('.primary')};
        probe.remove();
        return result;
      });
      assert.equal(semanticColours.success.color,'rgb(23, 122, 49)',browserName+' success must use semantic green');
      assert.equal(semanticColours.warning.color,'rgb(180, 83, 9)',browserName+' warning must use amber');
      assert.equal(semanticColours.error.color,'rgb(194, 54, 43)',browserName+' error must use red');
      assert.equal(semanticColours.info.color,'rgb(37, 99, 235)',browserName+' info must use blue');
      assert.equal(semanticColours.primary.background,'rgb(99, 212, 113)',browserName+' primary action must use BOEKUNA green');
      assert.equal(semanticColours.primary.color,'rgb(27, 31, 35)',browserName+' green primary action must use accessible anthracite text');
      assert.deepEqual(await page.locator('.dashboard-kpi-label').allTextContents(),['Winst','Omzet','Kosten','Btw apartzetten','Nog te ontvangen']);
      assert.equal(await page.locator('#dashboardPeriod').inputValue(),'month');
      assert.equal(await page.locator('.dashboard-kpi-profit .metric-sub').count(),0,'Compact dashboard must hide repeated profit explanation by default');
      assert.equal(await page.locator('.dashboard-kpi-secondary .metric-sub').count(),0,'Compact dashboard must hide repeated KPI helper copy when no warning exists');
      assert.notEqual(await page.locator('.dashboard-kpi .metric-icon').first().evaluate(el=>getComputedStyle(el).display),'none','Desktop dashboard KPI icons must remain visible');
      assert.deepEqual((await page.locator('.dashboard-chart-card .chart-legend span').allTextContents()).map(v=>v.trim()),['Omzet','Kosten','Winst']);
      const dashboardChartColours=await page.evaluate(()=>({
        sales:getComputedStyle(document.querySelector('.dashboard-result-chart .bar.sales')).backgroundColor,
        costs:getComputedStyle(document.querySelector('.dashboard-result-chart .bar.costs')).backgroundColor,
        profit:getComputedStyle(document.querySelector('.dashboard-result-chart .bar.profit')).backgroundColor,
        salesLegend:getComputedStyle(document.querySelector('.dashboard-chart-card .chart-legend .legend-dot')).backgroundColor,
        costsLegend:getComputedStyle(document.querySelector('.dashboard-chart-card .chart-legend .legend-dot.cost')).backgroundColor,
        profitLegend:getComputedStyle(document.querySelector('.dashboard-chart-card .chart-legend .legend-dot.profit')).backgroundColor
      }));
      assert.deepEqual(dashboardChartColours,{
        sales:'rgb(99, 212, 113)',costs:'rgb(229, 83, 75)',profit:'rgb(59, 130, 246)',
        salesLegend:'rgb(99, 212, 113)',costsLegend:'rgb(229, 83, 75)',profitLegend:'rgb(59, 130, 246)'
      },browserName+' dashboard chart must use green for omzet, red for kosten and blue for winst');
      assert.deepEqual(await page.locator('.dashboard-summary-title').allTextContents(),['Administratie','Vraag Boekuna','Nieuwe factuur']);
      await noOverflow(page,browserName+' desktop dashboard');
      await axe(page,browserName+' desktop dashboard');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2),browserName+' 1440x900 dashboard must fit one screen');
      await page.screenshot({path:path.join(evidence,'dashboard-1440-'+browserName+'.png'),fullPage:true});
      await noDecorativeShadows(page,browserName+' desktop dashboard');
      const dateSafety=await page.evaluate(()=>({
        roundtrip:localDateOnly(parseDateOnly('2026-10-07')),
        plusDst:addDateOnlyDays('2026-10-24',2),
        plusInvoice:addDateOnlyDays('2026-10-07',14),
        display:dateNL('2026-10-07')
      }));
      assert.deepEqual(dateSafety,{roundtrip:'2026-10-07',plusDst:'2026-10-26',plusInvoice:'2026-10-21',display:dateSafety.display},browserName+' date-only helpers must preserve calendar dates');
      assert.match(dateSafety.display,/2026/,browserName+' date-only display must preserve the intended year');

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
      assert.equal(await page.getByRole('button',{name:'Factuur maken',exact:true}).count(),1,browserName+' Inkomsten primary action');
      assert.equal(await page.getByRole('button',{name:'Factuur uploaden',exact:true}).count(),1,browserName+' Inkomsten secondary action');
      const incomeToneClasses=await page.locator('.product-kpi').evaluateAll(cards=>cards.map(card=>card.className));
      assert.ok(incomeToneClasses[2].includes('kpi-tone-neutral'),browserName+' ordinary Openstaand must remain neutral, not info-coloured');
      assert.ok(incomeToneClasses[3].includes('kpi-tone-neutral'),browserName+' zero overdue must remain neutral instead of error-red');
      const openBadge=page.locator('.financial-table .badge').filter({hasText:'Openstaand'}).first();
      if(await openBadge.count()){
        assert.notEqual(await openBadge.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(234, 241, 254)',browserName+' ordinary Openstaand status must not use info blue');
      }
      const incomeHeader=await page.evaluate(()=>{
        const head=document.querySelector('.product-page-head'),title=head?.querySelector('h1'),period=head?.querySelector('.page-period-slot'),actions=document.querySelector('.product-page-actions');
        const box=el=>{const r=el?.getBoundingClientRect();return r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}:null};
        return {head:box(head),title:box(title),period:box(period),actions:box(actions)};
      });
      assert.ok(incomeHeader.period&&incomeHeader.actions,browserName+' Inkomsten must use shared title/filter/action pattern');
      assert.ok(incomeHeader.period.left>incomeHeader.title.left,browserName+' Inkomsten period must sit to the right of title');
      assert.ok(incomeHeader.actions.left>=incomeHeader.title.right&&incomeHeader.period.left>=incomeHeader.actions.right,browserName+' Inkomsten desktop head: title, then actions, then period on the right');
      assert.ok(incomeHeader.actions.top<incomeHeader.title.bottom&&incomeHeader.actions.bottom>incomeHeader.title.top,browserName+' Inkomsten actions must share the title row on desktop');
      const iconGeometry=await page.locator('.product-kpi').first().evaluate(card=>{
        const label=card.querySelector('.product-kpi-label'),icon=card.querySelector('.product-kpi-icon'),a=label.getBoundingClientRect(),b=icon.getBoundingClientRect();
        return {labelLeft:a.left,labelRight:a.right,iconLeft:b.left,iconRight:b.right};
      });
      assert.ok(iconGeometry.iconLeft>=iconGeometry.labelRight-1,browserName+' KPI icon must be positioned at the top-right, after the label');
      const invoiceCardHeights=await page.locator('.product-kpi').evaluateAll(cards=>cards.map(card=>Math.round(card.getBoundingClientRect().height)));
      assert.ok(Math.max(...invoiceCardHeights)-Math.min(...invoiceCardHeights)<=1,browserName+' KPI cards in one group must keep equal heights');
      await page.evaluate(()=>{
        state.invoices[0].importedTotals={net:987654321098.76,vat:20740740743.74,gross:100839506184.5};
        render();
      });
      const largeValueFit=await page.locator('.product-kpi .metric-value').evaluateAll(values=>values.map(value=>({text:value.textContent,client:value.clientWidth,scroll:value.scrollWidth,font:getComputedStyle(value).fontSize})));
      assert.ok(largeValueFit.every(item=>item.scroll<=item.client+1),browserName+' long KPI amounts must fit without clipping or horizontal overflow: '+JSON.stringify(largeValueFit));
      const largeCardHeights=await page.locator('.product-kpi').evaluateAll(cards=>cards.map(card=>Math.round(card.getBoundingClientRect().height)));
      assert.ok(Math.max(...largeCardHeights)-Math.min(...largeCardHeights)<=1,browserName+' long amounts must not change KPI card height');
      await page.evaluate(()=>navigate('dashboard'));
      const dashboardLargeFit=await page.locator('.dashboard-kpi .metric-value').evaluateAll(values=>values.map(value=>({text:value.textContent,client:value.clientWidth,scroll:value.scrollWidth,font:getComputedStyle(value).fontSize})));
      assert.ok(dashboardLargeFit.every(item=>item.scroll<=item.client+1),browserName+' dashboard long amounts must fit without clipping: '+JSON.stringify(dashboardLargeFit));
      await noOverflow(page,browserName+' dashboard extreme amounts');
      await page.screenshot({path:path.join(evidence,'large-values-1440-'+browserName+'.png'),fullPage:true});
      await page.evaluate(()=>navigate('invoices'));
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
      await page.screenshot({path:path.join(evidence,'form-invoice-1440-'+browserName+'.png'),fullPage:true});
      await page.evaluate(()=>closeModal());
      await noOverflow(page,browserName+' desktop invoices');
      await page.screenshot({path:path.join(evidence,'invoices-1440-'+browserName+'.png'),fullPage:true});
      await page.evaluate(()=>{state.invoices[0].status='paid';render()});
      await page.screenshot({path:path.join(evidence,'success-paid-invoice-1440-'+browserName+'.png'),fullPage:true});
      await page.evaluate(()=>{state.invoices[0].status='sent';render()});

      await page.evaluate(()=>navigate('vat'));
      await page.getByRole('heading',{name:'Btw'}).waitFor();
      const vatHeader=await page.evaluate(()=>{
        const head=document.querySelector('.product-page-head'),title=head?.querySelector('h1'),period=head?.querySelector('.page-period-slot');
        const box=el=>{const r=el?.getBoundingClientRect();return r?{left:r.left,top:r.top,bottom:r.bottom}:null};
        return {title:box(title),period:box(period)};
      });
      assert.ok(vatHeader.period&&vatHeader.period.left>vatHeader.title.left,browserName+' VAT period must be right of title');
      assert.match(await page.locator('#content').innerText(),/indicati(?:e|ef)/i);
      await noOverflow(page,browserName+' desktop VAT');
      assert.equal(await page.locator('.mobile-vat-attention').count(),0,browserName+' VAT must not expose the removed document-review CTA');
      assert.doesNotMatch(await page.locator('#content').innerText(),/^Documenten controleren$/m,browserName+' VAT must remain informational');
      await page.screenshot({path:path.join(evidence,'vat-1440-'+browserName+'.png'),fullPage:true});

      const coreKpis={
        invoices:['Omzet','Betaald','Openstaand','Te laat'],
        expenses:['Kosten','Btw die je terugkrijgt'],
        documents:['Te verwerken','Controle nodig','Verwerkt deze maand','Totaal documenten'],
        vat:['Te betalen btw','Ontvangen btw','Btw die je kunt terugvragen','Controle nodig'],
        reports:['Omzet','Kosten','Winst','Winstmarge'],
        income:['Omzet deze maand','Bijgeschreven','Nog te ontvangen','Groei'],
        outgoings:['Deze maand uitgegeven','Nog niet gekoppeld','Terugkerende uitgaven','Te controleren']
      };
      for(const [route,labels] of Object.entries(coreKpis)){
        await page.evaluate(route=>navigate(route),route);
        await page.locator('.product-kpis').waitFor();
        if(route==='expenses'){
          assert.ok(!(await page.locator('.product-kpi').first().getAttribute('class')).includes('kpi-tone-warning'),browserName+' Costs must remain neutral, not warning-coloured');
        }
        if(route==='outgoings'){
          assert.ok(!(await page.locator('.product-kpi').first().getAttribute('class')).includes('kpi-tone-warning'),browserName+' ordinary outgoings must remain neutral');
        }
        if(route==='reports'){
          const reportChartColours=await page.evaluate(()=>({
            sales:getComputedStyle(document.querySelector('.report-result-chart .bar.sales')).backgroundColor,
            costs:getComputedStyle(document.querySelector('.report-result-chart .bar.costs')).backgroundColor,
            profit:getComputedStyle(document.querySelector('.report-result-chart .bar.profit')).backgroundColor,
            salesLegend:getComputedStyle(document.querySelector('.report-result-card .chart-legend .legend-dot')).backgroundColor,
            costsLegend:getComputedStyle(document.querySelector('.report-result-card .chart-legend .legend-dot.cost')).backgroundColor,
            profitLegend:getComputedStyle(document.querySelector('.report-result-card .chart-legend .legend-dot.profit')).backgroundColor
          }));
          assert.deepEqual(reportChartColours,{
            sales:'rgb(99, 212, 113)',costs:'rgb(229, 83, 75)',profit:'rgb(59, 130, 246)',
            salesLegend:'rgb(99, 212, 113)',costsLegend:'rgb(229, 83, 75)',profitLegend:'rgb(59, 130, 246)'
          },browserName+' reports chart must use green for omzet, red for kosten and blue for winst');
          const categoryCostColours=await page.locator('.category-row .progress span').evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).backgroundColor));
          assert.ok(categoryCostColours.length>0,browserName+' reports category costs must render a progress bar');
          for(const colour of categoryCostColours){
            assert.equal(colour,'rgb(229, 83, 75)',browserName+' reports category cost progress must use the kosten colour');
            assert.ok(!['rgb(99, 212, 113)','rgb(37, 99, 235)','rgb(180, 83, 9)','rgb(194, 54, 43)'].includes(colour),browserName+' reports category cost progress must not use brand or semantic status colours');
          }
        }
        const supportIcons=page.locator('.kpi-tone-support .product-kpi-icon');
        if(await supportIcons.count()){
          const colours=await supportIcons.evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).color));
          assert.ok(colours.every(colour=>colour!=='rgb(37, 99, 235)'),browserName+' supporting KPIs must not use informational blue decoratively');
        }
        const cardMetrics=await page.locator('.product-kpi').evaluateAll(cards=>cards.map(card=>{
          const r=card.getBoundingClientRect(),value=card.querySelector('.metric-value'),icon=card.querySelector('.product-kpi-icon');
          return {height:Math.round(r.height),valueFits:!value||value.scrollWidth<=value.clientWidth+1,iconVisible:!!icon&&getComputedStyle(icon).display!=='none'};
        }));
        assert.ok(Math.max(...cardMetrics.map(x=>x.height))-Math.min(...cardMetrics.map(x=>x.height))<=1,browserName+' '+route+' KPI cards must have equal height');
        assert.ok(cardMetrics.every(x=>x.valueFits),browserName+' '+route+' KPI values must fit');
        assert.ok(cardMetrics.every(x=>x.iconVisible),browserName+' '+route+' KPI icons must be visible');
        assert.deepEqual((await page.locator('.product-kpi-label').allTextContents()).map(v=>v.trim()),labels,browserName+' '+route+' KPI labels');
        assert.equal(await page.locator('.product-kpi').count(),labels.length,browserName+' '+route+' must expose one coherent KPI card per label');
        await noOverflow(page,browserName+' desktop '+route);
        await noDecorativeShadows(page,browserName+' desktop '+route);
        await axe(page,browserName+' desktop '+route);
      }
      await page.evaluate(()=>navigate('reports'));
      const reportDesktop=await reportA4State(page,browserName+' desktop A4');
      assert.ok(reportDesktop.canvasWidth>=790,browserName+' desktop A4 preview should render at natural paper size when space allows');
      await page.screenshot({path:path.join(evidence,'report-a4-1440-'+browserName+'.png'),fullPage:true});
      await page.evaluate(()=>{reportPreviewHistory=null;closeModal();window.__round3Invoices=structuredClone(state.invoices);const base=structuredClone(state.invoices[0]);for(let n=2;n<=64;n++)state.invoices.push({...base,id:'round3-'+n,number:'2026-'+String(n).padStart(4,'0')})});
      const multipage=await reportA4State(page,browserName+' desktop multipage A4');
      assert.ok(multipage.scrollHeight>1123,browserName+' desktop multipage report must exceed one A4 preview page');
      await page.evaluate(()=>{reportPreviewHistory=null;closeModal()});
      await page.setViewportSize({width:390,height:844});
      await page.evaluate(()=>navigate('reports'));
      const multipageMobile=await reportA4State(page,browserName+' mobile multipage A4');
      assert.ok(multipageMobile.scrollHeight>1123,browserName+' mobile multipage report must preserve all report pages');
      assert.ok(multipageMobile.canvasWidth<794,browserName+' mobile multipage report must scale the complete A4 paper');
      await noOverflow(page,browserName+' mobile multipage A4');
      await page.evaluate(()=>{reportPreviewHistory=null;closeModal();state.invoices=window.__round3Invoices;delete window.__round3Invoices;render()});

      const a4ViewportEvidence=[];
      for(const [width,height] of [[320,844],[360,844],[375,844],[390,844],[393,852],[430,900],[768,900],[1024,900],[1440,900]]){
        await page.setViewportSize({width,height});
        await page.evaluate(()=>navigate('reports'));
        const a4=await reportA4State(page,browserName+' A4 '+width+'px');
        if(width<794)assert.ok(a4.canvasWidth<794,browserName+' '+width+'px A4 preview canvas must scale below natural paper width');
        else assert.ok(a4.canvasWidth>=790,browserName+' '+width+'px A4 preview should keep natural paper width when space allows');
        await noOverflow(page,browserName+' A4 '+width+'px');
        a4ViewportEvidence.push({width,frameCssWidth:a4.frameCssWidth,bodyWidth:a4.bodyWidth,kpiColumns:a4.kpiColumns,transform:a4.transform,canvasWidth:a4.canvasWidth});
        await page.evaluate(()=>{reportPreviewHistory=null;closeModal()});
      }
      console.log('Round 3 A4 viewport evidence '+browserName+': '+JSON.stringify(a4ViewportEvidence));

      const polishVisualRoutes=['expenses','documents','bank','vat','reports','settings','profile'];
      await page.setViewportSize({width:1440,height:900});
      for(const route of polishVisualRoutes){
        await page.evaluate(route=>navigate(route),route);
        await noOverflow(page,browserName+' visual '+route);
        await page.screenshot({path:path.join(evidence,'polish-'+route+'-1440-'+browserName+'.png'),fullPage:true});
      }

      for(const route of ['bank','documents','contacts','income','outgoings']){
        await page.evaluate(route=>navigate(route),route);
        const hierarchy=await page.evaluate(()=>{
          const shell=document.querySelector('.product-page-shell'),head=shell?.querySelector('.product-page-head'),actions=shell?.querySelector('.product-page-actions');
          if(!shell||!head||!actions)return null;
          const t=head.querySelector('h1').getBoundingClientRect(),a=actions.getBoundingClientRect();
          return {titleTop:t.top,titleBottom:t.bottom,titleRight:t.right,actionsTop:a.top,actionsBottom:a.bottom,actionsLeft:a.left};
        });
        assert.ok(hierarchy,browserName+' '+route+' must use shared title/action hierarchy');
        assert.ok(hierarchy.actionsLeft>=hierarchy.titleRight&&hierarchy.actionsTop<hierarchy.titleBottom&&hierarchy.actionsBottom>hierarchy.titleTop,browserName+' '+route+' actions must sit on the title row, to the right, on desktop');
        await noOverflow(page,browserName+' desktop '+route+' actions');
      }

      for(const [width,height] of [[1366,768],[1440,900],[1920,1080]]){
        await page.setViewportSize({width,height});
        for(const route of ['dashboard',...Object.keys(coreKpis)]){
          await page.evaluate(route=>navigate(route),route);
          await noOverflow(page,browserName+' '+route+' '+width+'x'+height);
          if(route!=='dashboard'){
            const columns=await page.locator('.product-kpis').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length);
            assert.equal(columns,coreKpis[route].length,browserName+' '+route+' must give each KPI its own desktop column at '+width+'x'+height);
          }
        }
        await page.evaluate(()=>navigate('dashboard'));
        if(width>=1440)assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2),browserName+' '+width+'x'+height+' dashboard must fit one screen');
      }

      await page.setViewportSize({width:390,height:844});
      await page.evaluate(()=>{setProductUiAuthenticated(false);setBootstrapVisible(true);document.getElementById('mainApp').style.display='none';document.getElementById('authRoot').innerHTML=''});
      assert.equal(await page.locator('#appBootstrap').isVisible(),true,browserName+' bootstrap must cover unresolved auth state');
      assert.equal(await page.locator('#mobileBottomNav').evaluate(el=>getComputedStyle(el).display),'none',browserName+' navigation must stay hidden during bootstrap');
      await page.screenshot({path:path.join(evidence,'loading-390-'+browserName+'.png'),fullPage:true});
      await page.evaluate(()=>enterApp());
      await page.getByRole('heading',{name:'Overzicht'}).waitFor();
      for(const route of ['invoices','expenses','vat','reports']){
        await page.evaluate(route=>navigate(route),route);
        const header=await page.locator('.product-page-head').evaluate(head=>{
          const title=head.querySelector('h1'),period=head.querySelector('.page-period-slot'),a=title?.getBoundingClientRect(),b=period?.getBoundingClientRect();
          return {title:a?{left:a.left,top:a.top,bottom:a.bottom}:null,period:b?{left:b.left,top:b.top,bottom:b.bottom}:null};
        });
        assert.ok(header.period&&header.period.left>header.title.left,browserName+' mobile '+route+' period must remain right of title');
        assert.ok(Math.abs(header.period.top-header.title.top)<36,browserName+' mobile '+route+' title and period must remain on one row');
        await noOverflow(page,browserName+' mobile '+route+' header');
      }
      await page.evaluate(()=>navigate('reports'));
      const reportMobile=await reportA4State(page,browserName+' mobile A4');
      assert.ok(reportMobile.canvasWidth<794,browserName+' mobile preview must scale down the A4 paper');
      assert.equal(reportMobile.kpiColumns,4,browserName+' mobile viewport must not reflow the PDF itself');
      await page.screenshot({path:path.join(evidence,'report-a4-390-'+browserName+'.png'),fullPage:true});
      await page.evaluate(()=>{reportPreviewHistory=null;closeModal()});
      await page.evaluate(()=>navigate('invoices'));
      for(const width of [390,320]){
        await page.setViewportSize({width,height:844});
        await page.evaluate(()=>render());
        const mobileValues=await page.locator('.product-kpi .metric-value').evaluateAll(values=>values.map(value=>({text:value.textContent,client:value.clientWidth,scroll:value.scrollWidth,font:getComputedStyle(value).fontSize})));
        assert.ok(mobileValues.every(item=>item.scroll<=item.client+1),browserName+' mobile '+width+' long KPI amounts must fit: '+JSON.stringify(mobileValues));
        const mobileHeights=await page.locator('.product-kpi').evaluateAll(cards=>cards.map(card=>Math.round(card.getBoundingClientRect().height)));
        assert.ok(Math.max(...mobileHeights)-Math.min(...mobileHeights)<=1,browserName+' mobile '+width+' KPI cards must keep equal heights');
        await noOverflow(page,browserName+' mobile invoices long amounts '+width);
        await page.evaluate(()=>newInvoice());
        const dateInputs=await page.locator('#invoiceForm input[type="date"]').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,client:el.clientWidth,scroll:el.scrollWidth,value:el.value}}));
        assert.ok(dateInputs.every(item=>item.left>=-1&&item.right<=width+1&&item.scroll<=item.client+1),browserName+' '+width+' date inputs must fit without clipping: '+JSON.stringify(dateInputs));
        await page.screenshot({path:path.join(evidence,'date-input-'+width+'-'+browserName+'.png'),fullPage:true});
        await page.evaluate(()=>closeModal());
      }
      for(const width of [320,375,390,430]){
        await page.setViewportSize({width,height:844});
        await page.evaluate(()=>navigate('dashboard'));
        await page.getByRole('heading',{name:'Overzicht'}).waitFor();
        assert.deepEqual((await page.locator('#mobileBottomNav .mobile-bottom-nav-item').allTextContents()).map(v=>v.trim()),['Overzicht','Inkomsten','Kosten','Btw','Bonnen']);
        const activeMobileNav=page.locator('#mobileBottomNav .mobile-bottom-nav-item.active[aria-current="page"]');
        await page.waitForFunction(()=>getComputedStyle(document.querySelector('#mobileBottomNav .mobile-bottom-nav-item.active[aria-current="page"]')).backgroundColor==='rgb(236, 250, 238)');
        const activeMobileStyle=await activeMobileNav.evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,color:s.color,boxShadow:s.boxShadow,borderTopColor:s.borderTopColor,borderTopWidth:s.borderTopWidth,fontWeight:s.fontWeight}});
        assert.equal(activeMobileStyle.background,'rgb(236, 250, 238)',browserName+' mobile '+width+' active destination must use the soft BOEKUNA-green selected state');
        assert.equal(activeMobileStyle.color,'rgb(27, 31, 35)',browserName+' mobile '+width+' active destination label must remain anthracite');
        assert.equal(activeMobileStyle.boxShadow,'none',browserName+' mobile '+width+' active destination must not use a decorative shadow');
        assert.equal(activeMobileStyle.borderTopColor,'rgb(99, 212, 113)',browserName+' mobile '+width+' active destination must use a border cue');
        assert.equal(activeMobileStyle.borderTopWidth,'2px',browserName+' mobile '+width+' active destination border cue must remain visible');
        assert.ok(Number.parseInt(activeMobileStyle.fontWeight,10)>=700,browserName+' mobile '+width+' active destination must retain a font-weight selection cue');
        await noOverflow(page,browserName+' mobile dashboard active nav '+width);
      }
      await page.setViewportSize({width:390,height:844});
      await page.evaluate(()=>navigate('dashboard'));
      await page.getByRole('heading',{name:'Overzicht'}).waitFor();
      assert.ok((await page.locator('.dashboard-kpi .metric-icon').count())>0,'Dashboard KPI icon nodes should remain available');
      assert.ok(await page.locator('.dashboard-kpi .metric-icon').evaluateAll(nodes=>nodes.every(el=>getComputedStyle(el).display!=='none')),'Mobile dashboard KPI icons must stay visible at the card top-right');
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
      assert.ok(await page.locator('.product-kpi-icon').evaluateAll(nodes=>nodes.every(el=>getComputedStyle(el).display!=='none')),'Mobile product KPI icons must stay visible at the card top-right');
      const incomeMobileGeometry=await page.evaluate(()=>{
        const box=selector=>{const el=document.querySelector(selector),r=el?.getBoundingClientRect();return r?{top:Math.round(r.top),bottom:Math.round(r.bottom),height:Math.round(r.height)}:null};
        return {shell:box('.product-page-shell'),kpis:box('.product-kpis'),toolbar:box('.list-toolbar'),list:box('.workspace-table')};
      });
      const firstContentTop=incomeMobileGeometry.list?.top??Infinity;
      assert.ok(firstContentTop<844,browserName+' mobile Inkomsten main list should begin inside the first viewport: '+JSON.stringify(incomeMobileGeometry));
      await page.evaluate(()=>navigate('vat'));
      await page.getByRole('heading',{name:'Btw'}).waitFor();
      const vatStatus=page.locator('.product-page-head .page-status').first();
      assert.ok(await vatStatus.isVisible(),browserName+' mobile VAT financial context must remain visible');
      assert.match(await vatStatus.innerText(),/indicatie|indicatief|ingediend/i,browserName+' mobile VAT status must preserve filing context');

      await openReviewFixture(page);
      await noOverflow(page,browserName+' mobile document review');
      await page.screenshot({path:path.join(evidence,'document-review-390-'+browserName+'.png'),fullPage:true});
      await page.evaluate(()=>closeModal());

      await page.setViewportSize({width:1440,height:900});
      await page.evaluate(()=>navigate('settings'));
      await page.evaluate(()=>deleteAccountDialog());
      await page.getByRole('heading',{name:/Account.*verwijderen/i}).waitFor();
      await page.screenshot({path:path.join(evidence,'danger-account-delete-1440-'+browserName+'.png'),fullPage:true});
      await page.evaluate(()=>closeModal());

      for(const width of [320,360,375,390,393,430,768,1024,1280,1440]){
        await page.setViewportSize({width,height:width<820?844:1000});
        for(const route of ['dashboard','invoices','expenses','bank','income','outgoings','documents','vat','reports','settings']){
          await page.evaluate(route=>navigate(route),route);
          await noOverflow(page,browserName+' '+route+' '+width);
        }
      }
      await page.setViewportSize({width:1440,height:900});
      await page.evaluate(()=>showAuth('login'));
      await page.locator('#authRoot .auth-root').waitFor();
      const authPalette=await page.evaluate(()=>{
        const root=document.querySelector('#authRoot .auth-root'),side=document.querySelector('#authRoot .auth-side'),primary=document.querySelector('#authRoot .btn.primary');
        const style=el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,image:s.backgroundImage,color:s.color}};
        return {root:style(root),side:style(side),primary:style(primary)};
      });
      assert.equal(authPalette.root.background,'rgb(246, 247, 248)',browserName+' auth canvas must use product neutral background');
      assert.equal(authPalette.root.image,'none',browserName+' auth canvas must not use a gradient');
      assert.equal(authPalette.side.background,'rgb(236, 250, 238)',browserName+' auth side must use soft BOEKUNA green');
      assert.equal(authPalette.side.image,'none',browserName+' auth side must not use a gradient');
      assert.equal(authPalette.primary.background,'rgb(99, 212, 113)',browserName+' auth primary action must use BOEKUNA green');
      assert.equal(authPalette.primary.color,'rgb(27, 31, 35)',browserName+' auth primary action must use anthracite text');
      await axe(page,browserName+' auth login');
      await page.screenshot({path:path.join(evidence,'auth-login-1440-'+browserName+'.png'),fullPage:true});
      await page.evaluate(()=>showAuth('register'));
      await page.locator('#authRoot #registerEmail').waitFor();
      await axe(page,browserName+' auth register');
      await noOverflow(page,browserName+' auth register desktop');
      await page.setViewportSize({width:390,height:844});
      await page.evaluate(()=>showAuth('login'));
      await page.locator('#authRoot .auth-root').waitFor();
      assert.equal(await page.locator('#mobileBottomNav').evaluate(el=>getComputedStyle(el).display),'none',browserName+' logged-out mobile login must not show product navigation');
      assert.equal(await page.locator('#mobileBottomNav').getAttribute('aria-hidden'),'true',browserName+' logged-out nav must be hidden from assistive technology');
      await noOverflow(page,browserName+' auth login mobile');
      await page.screenshot({path:path.join(evidence,'auth-login-390-'+browserName+'.png'),fullPage:true});
      await page.evaluate(()=>showAuth('register'));
      await page.locator('#authRoot #registerEmail').waitFor();
      await noOverflow(page,browserName+' auth register mobile');
      await page.screenshot({path:path.join(evidence,'auth-register-390-'+browserName+'.png'),fullPage:true});

      assert.deepEqual(pageErrors,[],browserName+' product UI must have no JavaScript errors');
      await page.close();
    }finally{await browser.close()}
  }
  console.log('BOEKUNA master product UI reference QA: PASS');
}finally{
  await new Promise(resolve=>server.close(resolve));
}
