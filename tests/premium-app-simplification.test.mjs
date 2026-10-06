import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
assert.match(original,/from\('documents'\)\.delete\(\)\.eq\('user_id',currentUser\.id\)\.eq\('client_ref',id\)/,'Document deletion must stay tenant-scoped');
fs.mkdirSync('tests/artifacts',{recursive:true});

function replaceLast(source,needle,replacement){
  const i=source.lastIndexOf(needle);
  if(i<0)throw new Error('Missing bootstrap marker: '+needle);
  return source.slice(0,i)+replacement+source.slice(i+needle.length);
}

const fixtureBootstrap=[
  "currentUser={...TEST_USER,email:'kwin@example.test',supabaseUser:{user_metadata:{first_name:'Kwin'}}};",
  "sessionStorage.setItem(FINANCIAL_PERIOD_KEY,'all');",
  "state=structuredClone(DEFAULT);",
  "state.company={...state.company,name:'QA Test BV',tradeName:'Boekuna QA',contactName:'Kwin',email:'qa@example.test',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',kor:false};",
  "state.contacts=[{id:'c1',type:'customer',name:'QA Klant BV',email:'klant@example.test',address:'Klantstraat 2',postal:'3012BB',city:'Rotterdam'}];",
  "state.invoices=[{id:'i1',number:'2026-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:'2026-08-01',dueDate:'2026-08-15',taxTreatment:'standard',payments:[],importedTotals:{net:100,vat:21,gross:121}}];",
  "state.expenses=[{id:'e1',date:'2026-09-01',vendor:'QA Leverancier',invoiceNumber:'INK-1',category:'Kantoor',paymentMethod:'bank',exVat:50,vatRate:21,notes:''}];",
  "state.transactions=[{id:'t1',date:'2026-09-01',description:'QA bankregel',amount:-10,status:'unmatched'}];",
  "state.services=[{id:'s1',name:'Consultancy',description:'',price:100,unitLabel:'uur',vat:21,active:true}];",
  "state.plannedCash=[{id:'pc1',date:'2026-10-15',description:'QA geplande uitgave',type:'out',amount:25}];",
  "state.documents=[{id:'d1',name:'qa-document.pdf',type:'Upload',date:'2026-09-05',processingState:'ready'}];state.bookings=[];",
  "documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;",
  "sessionStorage.setItem(FINANCIAL_PERIOD_KEY,'all');",
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
async function assertNoGlobalOverflow(width,label=''){
  await page.setViewportSize({width,height:Math.max(700,Math.round(width*1.8))});
  const layout=await page.evaluate(()=>({
    scrollWidth:document.documentElement.scrollWidth,
    innerWidth:window.innerWidth,
    offenders:[...document.querySelectorAll('body *')].map(el=>{
      const r=el.getBoundingClientRect();
      return {tag:el.tagName,id:el.id||'',className:typeof el.className==='string'?el.className:'',left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width)}
    }).filter(x=>x.right>window.innerWidth+2).sort((a,b)=>b.right-a.right).slice(0,12)
  }));
  assert.ok(layout.scrollWidth<=layout.innerWidth+2,'No global horizontal overflow at '+width+'px'+(label?' on '+label:'')+'; '+JSON.stringify(layout));
}

async function assertMobileStackAccessibility(route,selector){
  await page.setViewportSize({width:390,height:844});
  await navigateTo(route);
  const table=page.locator(selector).first();
  await table.waitFor();
  const details=await table.evaluate(el=>{
    const thead=el.querySelector('thead');
    const visible=element=>{const style=getComputedStyle(element);return style.display!=='none'&&style.visibility!=='hidden'};
    const headers=[...el.querySelectorAll('thead th')].map(th=>({id:th.id,scope:th.getAttribute('scope')||'',text:th.textContent.trim(),visible:visible(th)}));
    const cells=[...el.querySelectorAll('tbody tr td:not([colspan])')].map(td=>({headers:td.getAttribute('headers')||'',visible:visible(td)}));
    return {theadDisplay:thead?getComputedStyle(thead).display:'missing',theadAriaHidden:thead?.getAttribute('aria-hidden')||'',headers,cells};
  });
  assert.notEqual(details.theadDisplay,'none',route+' mobile table headers must remain in the accessibility tree');
  assert.notEqual(details.theadAriaHidden,'true',route+' mobile table header group must not be aria-hidden');
  assert.ok(details.headers.length>0,route+' mobile table must keep column headers');
  assert.ok(details.headers.every(header=>header.id&&header.scope==='col'),route+' mobile headers need stable ids and scope=col');
  assert.ok(details.cells.length>0,route+' accessibility fixture must include at least one data row');
  const headerById=new Map(details.headers.map(header=>[header.id,header]));
  assert.ok(details.cells.every(cell=>headerById.has(cell.headers)),route+' data cells must explicitly reference their column header');
  const visibleCells=details.cells.filter(cell=>cell.visible);
  assert.ok(visibleCells.length>0,route+' accessibility fixture must include at least one visible data cell');
  assert.ok(visibleCells.every(cell=>headerById.get(cell.headers)?.visible),route+' every visible data cell must reference a non-hidden column header');
  const exposedHeaderCount=details.headers.filter(header=>header.visible).length;
  assert.equal(await table.getByRole('columnheader').count(),exposedHeaderCount,route+' non-hidden column headers must remain exposed as accessibility roles');
}

try{
  await page.goto(base+'/app',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Overzicht'}).waitFor();

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
  const newInvoiceButton=page.getByRole('button',{name:/Nieuwe factuur|Factuur maken/});
  assert.ok(await newInvoiceButton.isVisible());
  assert.ok(await page.getByRole('button',{name:/Upload PDF/}).isVisible());
  await newInvoiceButton.click();
  await page.locator('#invoiceCheck').waitFor();
  const invoiceCheckText=await page.locator('#invoiceCheck').innerText();
  assert.doesNotMatch(invoiceCheckText,/In orde/i,'invoice check must only show unresolved items');
  assert.doesNotMatch(invoiceCheckText,/Conceptcheck|Factuurcheck/i,'technical check labels should not compete with the unresolved tasks');
  await page.evaluate(()=>closeModal());
  await page.screenshot({path:`tests/artifacts/premium-invoices-${browserName}-390.png`,fullPage:true});

  await navigateTo('expenses');
  assert.ok(await page.getByRole('button',{name:/Kosten boeken/}).isVisible());
  assert.ok(await page.getByRole('button',{name:'Bon toevoegen',exact:true}).isVisible(),'Purchase invoice upload must remain available');
  assert.equal(await page.locator('#content').getByRole('button',{name:'Foto',exact:true}).count(),0,'Receipt photo must not be a separate primary action');
  assert.equal(await page.locator('#content').getByRole('button',{name:/Camera/}).count(),0,'Camera must not be a separate primary action');

  await navigateTo('bank');
  const bank=await page.locator('#content').innerText();
  assert.doesNotMatch(bank,/Bankkoppeling nog niet live\./,'Bank page should not carry permanent PSD2/open-banking explanation');
  assert.ok(await page.getByRole('button',{name:/Bankbestand importeren/}).isVisible());
  assert.ok(await page.getByRole('button',{name:/Transactie/}).isVisible());
  await page.screenshot({path:`tests/artifacts/premium-bank-${browserName}-390.png`,fullPage:true});

  await navigateTo('documents');
  const documents=await page.locator('#content').innerText();
  assert.doesNotMatch(documents,/Upload compleet is niet hetzelfde als verwerking compleet\./,'Documents page should not repeat background-processing explanation');
  assert.doesNotMatch(documents,/tekstextractie, tabellen en OCR/,'Documents page should not expose technical OCR explanation in the primary flow');
  assert.ok(await page.getByRole('button',{name:'Document uploaden',exact:true}).isVisible(),'Document upload must remain available');
  assert.equal(await page.locator('#content').getByRole('button',{name:'Foto',exact:true}).count(),0,'Documents must expose one upload entry, not a separate photo action');
  assert.equal(await page.locator('#content').getByRole('button',{name:/Camera/}).count(),0,'Documents must expose one upload entry, not a separate camera action');
  assert.equal(await page.locator('.documents-secondary-menu > summary').count(),0,'Technical archive action should not appear in normal document controls');
  assert.equal(await page.locator('#archiveFile').count(),1,'Existing archive upload integration remains available internally');
  await page.screenshot({path:`tests/artifacts/premium-documents-${browserName}-390.png`,fullPage:true});

  // Safe document deletion: terminal attention states may be removed, active/linked records must not.
  await page.evaluate(()=>{
    state.documents=[
      {id:'d-failed',fileId:'f-failed',name:'failed.pdf',type:'Document',date:'2026-09-10',processingState:'failed'},
      {id:'d-review',fileId:'f-review',name:'review.pdf',type:'Document',date:'2026-09-11',processingState:'review_required'},
      {id:'d-processing',fileId:'f-processing',name:'processing.pdf',type:'Document',date:'2026-09-12',processingState:'processing'},
      {id:'d-linked',fileId:'f-linked',name:'linked.pdf',type:'Document',date:'2026-09-13',processingState:'ready',linkedType:'expense',linkedId:'e1'}
    ];
    documentProcessingJobs=[
      {id:'j-failed',client_ref:'f-failed',state:'failed',attempt:3,max_attempts:3},
      {id:'j-review',client_ref:'f-review',state:'review_required',attempt:1,max_attempts:3},
      {id:'j-processing',client_ref:'f-processing',state:'processing',attempt:1,max_attempts:3}
    ];
    render();
  });
  assert.equal(await page.evaluate(()=>persistentDocumentAttentionCount()),2,'Failed/review documents must count as attention');
  assert.equal(await page.evaluate(()=>deleteDocumentNow('d-failed')),true,'Failed unlinked document must be deletable');
  assert.equal(await page.evaluate(()=>state.documents.some(d=>d.id==='d-failed')),false);
  assert.equal(await page.evaluate(()=>documentProcessingJobs.some(j=>j.client_ref==='f-failed')),false,'Deleting must immediately clear local attention job state');
  assert.equal(await page.evaluate(()=>deleteDocumentNow('d-review')),true,'Review-required unlinked document must be deletable');
  assert.equal(await page.evaluate(()=>deleteDocumentNow('d-processing')),false,'Actively processing document must be protected from deletion');
  assert.equal(await page.evaluate(()=>state.documents.some(d=>d.id==='d-processing')),true);
  assert.equal(await page.evaluate(()=>deleteDocumentNow('d-linked')),false,'Document linked to definitive bookkeeping must be protected from deletion');
  assert.equal(await page.evaluate(()=>state.documents.some(d=>d.id==='d-linked')),true);

  await navigateTo('dashboard');
  assert.equal(await page.locator('.dashboard-summary-card').count(),3,'Dashboard must replace the old recent-invoices table with three summary actions');
  assert.deepEqual(await page.locator('.dashboard-summary-title').allTextContents(),['Administratie','Vraag Boekuna','Nieuwe factuur']);
  assert.ok(await page.locator('.dashboard-summary-card').evaluateAll(nodes=>nodes.every(node=>node.tagName==='BUTTON')),'Dashboard summary actions must remain keyboard-native buttons');

  for(const [route,selector] of [
    ['expenses','.mobile-expenses'],
    ['cashflow','.mobile-cashflow'],
    ['ledger','.mobile-trial'],
    ['contacts','.mobile-contacts'],
    ['services','.mobile-services'],
    ['documents','.mobile-documents']
  ])await assertMobileStackAccessibility(route,selector);

  await navigateTo('vat');
  const vat=await page.locator('#content').innerText();
  assert.match(vat,/geen officiële indiening|niet naar de Belastingdienst/i,'VAT must retain not-submitted meaning');
  assert.match(vat,/indicati(?:e|ef)/i,'VAT must retain indicative meaning');
  const vatPeriod=page.locator('#vatFinancialPeriod');
  assert.ok(await vatPeriod.isVisible(),'VAT shared period selector must be visible');
  assert.deepEqual(await vatPeriod.locator('option').allTextContents(),['Week','Maand','Kwartaal','Jaar','Altijd']);
  await vatPeriod.selectOption('year');
  assert.equal((await page.locator('.premium-split .section-meta').first().innerText()).trim(),String(new Date().getFullYear()),'VAT year view must clearly identify the selected year');

  // Compact copy is the default. Help is an account-level setting, never a financial calculation toggle.
  await navigateTo('dashboard');
  assert.equal(await page.evaluate(()=>extraHelpVisible()),false,'Account should start in compact mode');
  const compactDashboard=await page.locator('#content').innerText();
  assert.doesNotMatch(compactDashboard,/Omzet minus kosten/,'Compact dashboard should not repeat the profit formula');
  assert.doesNotMatch(compactDashboard,/Op basis van je huidige administratie/,'Compact dashboard should not repeat the VAT calculation context');
  await navigateTo('settings');
  await page.locator('.settings-nav-item').filter({hasText:'Weergave'}).click();
  const helpSwitch=page.getByRole('switch',{name:'Extra uitleg tonen'});
  assert.equal(await helpSwitch.isChecked(),false,'Extra explanation must be disabled by default');
  await helpSwitch.check();
  assert.equal(await page.evaluate(()=>extraHelpVisible()),true,'Switch turns help on for the current account');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(userDataKey())).meta.extraHelpEnabled),true,'Extra help setting must be saved with the account');
  await navigateTo('dashboard');
  assert.match(await page.locator('#content').innerText(),/Omzet minus kosten/,'Explanation should be visible when enabled');
  await navigateTo('settings');
  await page.locator('.settings-nav-item').filter({hasText:'Weergave'}).click();
  await page.getByRole('switch',{name:'Extra uitleg tonen'}).uncheck();
  assert.equal(await page.evaluate(()=>extraHelpVisible()),false,'Compact mode is restored');
  await navigateTo('vat');
  const compactVat=await page.locator('#content').innerText();
  assert.match(compactVat,/Indicatie/i,'Critical VAT uncertainty information is never hidden');
  assert.match(compactVat,/geen officiële indiening|niet naar de Belastingdienst/i,'Legal VAT handoff remains visible');

  await navigateTo('reports');
  const reportPeriod=page.locator('#reportPeriodPreset');
  assert.ok(await reportPeriod.isVisible(),'Compact report period picker must be visible');
  assert.deepEqual(await reportPeriod.locator('option').allTextContents(),['Week','Maand','Kwartaal','Jaar','Altijd']);
  assert.equal(await page.locator('.report-period-details').evaluate(el=>el.open),false,'Custom dates must stay collapsed initially');
  await reportPeriod.selectOption('month');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('reportPreset')),'month','Report period should update from compact selector');
  const monthRange=await page.evaluate(()=>reportRange());
  assert.ok(monthRange.from<=monthRange.to,'Report month period must return an inclusive ordered range');
  await page.locator('#reportPeriodPreset').selectOption('all');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('reportPreset')),'all');
  assert.match(await page.locator('.report-period-dates').innerText(),/Alle boekjaren/);
  assert.ok((await page.locator('.report-result-chart .bar-group').count())<=12,'All-time chart should avoid 48 tiny monthly bars');
  await page.locator('.report-period-details > summary').click();
  assert.equal(await page.locator('.report-period-details').evaluate(el=>el.open),true,'Custom date fields open on demand');
  await page.locator('#reportFrom').fill('2024-01-01');
  await page.locator('#reportFrom').dispatchEvent('change');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('reportPreset')),'custom','Manual dates must switch the report to a custom range');
  assert.equal(await page.evaluate(()=>reportRange().from),'2024-01-01','Manually chosen start date must be retained');
  assert.equal(await page.locator('.report-period-details').evaluate(el=>el.open),true,'Manual dates remain expanded after render');

  await navigateTo('control');
  const control=await page.locator('#content').innerText();
  assert.doesNotMatch(control,/Eén werklijst voor uitzonderingen/,'Control center should present the worklist without explanatory marketing copy');
  assert.match(control,/Debiteuren|Bank|Boekingen|Uitzonderingen/,'Control center must keep actionable exception categories');
  await page.screenshot({path:`tests/artifacts/premium-control-${browserName}-390.png`,fullPage:true});

  for(const target of ['dashboard','cashflow','ledger','contacts','services','reports','documents','expenses']){
    await navigateTo(target);
    for(const width of [320,360,375,390,393,430,768,820])await assertNoGlobalOverflow(width,target);
  }

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
