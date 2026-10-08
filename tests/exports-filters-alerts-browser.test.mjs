// Exports in Data & export, A4 invoice preview, Van/Tot periods, resolvable alerts and Btw copy.
// Runs the generated app with fictive data, in Chromium and WebKit, at desktop and iPhone widths.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';

execFileSync(process.execPath,['scripts/build-app.mjs']);
const generated=fs.readFileSync('dist/app/index.html','utf8');
const browserName=process.env.BOOKUNA_BROWSER||'chromium';
const shotDir=process.env.EXPORTS_SHOT_DIR||'tests/artifacts/exports-filters-alerts';
fs.mkdirSync(shotDir,{recursive:true});
const boot=`currentUser={...TEST_USER,email:'qa@example.test'};state=structuredClone(DEFAULT);
for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
state.company={...state.company,name:'Fictieve QA BV',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',kvk:'12345678',vat:'NL123456789B01',email:'qa@example.test',iban:'NL91ABNA0417164300'};
state.contacts=[{id:'c1',type:'customer',name:'Fictieve klant',email:'klant@example.test',address:'Klantstraat 2',postal:'3011AB',city:'Rotterdam'}];
state.invoices=[{id:'i1',number:'2026-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:'2026-02-01',dueDate:'2026-02-15',lines:[{desc:'Fictieve dienst',qty:1,unit:100,unitLabel:'uur',vat:21}],payments:[]}];
state.expenses=[{id:'e1',date:'2026-01-15',vendor:'Kantoorwinkel',category:'office',exVat:50,vatRate:21},{id:'e2',date:'2026-03-20',vendor:'Marketing diensten',category:'marketing',exVat:120,vatRate:21},{id:'e3',date:'2026-04-02',vendor:'Software BV',category:'software',exVat:30,vatRate:21}];
documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;window.confirm=()=>true;enterApp();`;
const html=generated.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;').replace(/initAuth\(\);(?![\s\S]*initAuth\(\);)/,boot);
const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
const server=http.createServer((req,res)=>{
  const p=new URL(req.url,'http://localhost').pathname;
  if(p.startsWith('/assets/')){const f=path.resolve('dist/app'+p);if(fs.existsSync(f)){res.setHeader('Content-Type',types[path.extname(f)]||'image/png');return res.end(fs.readFileSync(f))}res.writeHead(404);return res.end()}
  res.setHeader('Content-Type','text/html');res.end(html);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
const browser=await (browserName==='webkit'?webkit:chromium).launch();
const errors=[];

async function openApp(width,height){
  const context=await browser.newContext({viewport:{width,height},locale:'nl-NL'});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.setDefaultTimeout(5000);
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#mainApp').waitFor();
  await page.waitForFunction(()=>typeof window.openSettingsSection==='function');
  return {context,page};
}
const overflow=page=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
const setDate=async(locator,value)=>{await locator.fill(value);await locator.dispatchEvent('change')};

try{
  for(const [width,height,tag] of [[1440,900,'desktop'],[390,844,'iphone']]){
    const {context,page}=await openApp(width,height);

    // Flow 1: Rapportages has no separate PDF action; Data & export opens the same report PDF.
    await page.evaluate(()=>navigate('reports'));
    assert.equal(await page.locator('#content button',{hasText:'PDF'}).count(),0,'Rapportages has no PDF download action');
    await page.evaluate(()=>openSettingsSection('data'));
    const data=page.locator('#settings-panel-data');
    for(const name of ['Rapportage','Facturen','Kosten','Volledige back-up'])assert.equal(await data.locator('.settings-center-line strong',{hasText:name}).count()>0,true,name+' export listed');
    assert.equal(await data.locator('.settings-advanced-exports').count(),1,'Advanced exports live inside the same Exporteren block');
    assert.equal(await page.locator('#settings-panel-data .settings-center-block').first().locator('.settings-advanced-exports').count(),1);
    await data.locator('.settings-advanced-exports>summary').click();
    for(const name of ['Journaal','Auditlog'])assert.equal(await data.locator('.settings-advanced-exports .settings-center-line strong',{hasText:name}).count(),1,name+' export kept');
    const download=page.waitForEvent('download');
    await data.locator('.settings-center-line',{hasText:'Kosten'}).getByRole('button',{name:'Downloaden'}).click();
    assert.match((await download).suggestedFilename(),/\.csv$/);
    await page.screenshot({path:`${shotDir}/${browserName}-${tag}-data-export.png`,fullPage:true});
    await data.getByRole('button',{name:'PDF bekijken'}).click();
    await page.locator('#reportPreviewFrame').waitFor();
    assert.match(await page.frameLocator('#reportPreviewFrame').locator('body').innerText(),/Boekhoudrapport/);
    await page.locator('#reportPreviewFrame').evaluate(frame=>{frame.contentWindow.__printed=0;frame.contentWindow.print=()=>frame.contentWindow.__printed++});
    await page.getByRole('button',{name:'Print / bewaar als PDF',exact:true}).click();
    assert.equal(await page.locator('#reportPreviewFrame').evaluate(frame=>frame.contentWindow.__printed),1,'Report PDF can be printed or saved');
    await page.getByRole('button',{name:'Terug',exact:true}).click();
    await page.locator('[role=dialog]').waitFor({state:'detached'});
    // A custom export period uses the same Van/Tot as everywhere else.
    await page.locator('#exportPeriodPreset').selectOption('custom');
    await setDate(page.locator('#exportFrom'),'2026-01-01');
    await setDate(page.locator('#exportTo'),'2026-03-31');
    assert.deepEqual(await page.evaluate(()=>reportRange()),{from:'2026-01-01',to:'2026-03-31'});

    // Flow 2: Facturen > Voorbeeld bekijken shows the real invoice template on an A4 page.
    await page.evaluate(()=>openSettingsSection('invoices'));
    const thumb=page.locator('#settings-panel-invoices .settings-center-paper');
    const ratio=await thumb.evaluate(el=>el.getBoundingClientRect().height/el.getBoundingClientRect().width);
    assert.ok(Math.abs(ratio-297/210)<0.02,'Thumbnail keeps the A4 ratio');
    await page.locator('#settings-panel-invoices select[name="invoiceDesign.layout"]').selectOption('classic');
    await page.locator('#settings-panel-invoices').getByRole('button',{name:'Voorbeeld bekijken'}).click();
    const frame=page.locator('#reportPreviewFrame');await frame.waitFor();
    const paper=await frame.evaluate(el=>({w:el.offsetWidth,h:el.offsetHeight}));
    assert.deepEqual(paper,{w:794,h:1123},'Preview page is A4 at 96 dpi');
    const doc=page.frameLocator('#reportPreviewFrame');
    assert.match(await doc.locator('body').innerText(),/FACTUUR[\s\S]*Voorbeeldklant B\.V\.[\s\S]*Totaal/);
    assert.match(await doc.locator('body').evaluate(b=>getComputedStyle(b).fontFamily),/Georgia/,'Unsaved layout choice is shown');
    assert.equal(await page.evaluate(()=>typeof invoiceDocumentHtml==='function'&&invoicePreviewDocumentHtml().includes('class="sheet"')),true,'Preview uses the same document template as the PDF');
    const box=await page.locator('#reportPreviewCanvas').boundingBox();
    assert.ok(Math.abs(box.height/box.width-1123/794)<0.02,'Scaled page keeps the A4 ratio');
    assert.ok(box.x>=0&&box.x+box.width<=width+1,'Page fits the screen');
    if(tag==='iphone'){
      const zoom=page.locator('#a4PreviewZoom');
      assert.equal(await zoom.isVisible(),true,'Phones can zoom in to read');
      await zoom.click();
      assert.equal(await zoom.getAttribute('aria-pressed'),'true');
      assert.equal(Math.round((await page.locator('#reportPreviewCanvas').boundingBox()).width),794,'Zoomed in shows real size');
      assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('app-zoom-allowed')),true,'Pinch zoom is allowed on the document');
      const close=await page.getByRole('button',{name:'Sluiten',exact:true}).last().boundingBox();
      assert.ok(close&&close.y+close.height<=height,'Close button stays on screen');
    }
    await page.screenshot({path:`${shotDir}/${browserName}-${tag}-factuur-a4.png`});
    await page.keyboard.press('Escape');
    await page.locator('[role=dialog]').waitFor({state:'detached'});
    assert.equal(await overflow(page),0,'No horizontal page scroll');

    // Flow 3: Kosten: quick period at the top, Aangepaste periode (Van/Tot) only under Filters.
    await page.evaluate(()=>navigate('expenses'));
    assert.deepEqual(await page.locator('#expensePeriod button').allTextContents(),['Week','Maand','Kwartaal','Jaar','Alles']);
    assert.equal(await page.locator('#content input[type="date"]').count(),0,'No Van/Tot on the page itself');
    await page.locator('[data-list-open-filters]').click();
    await page.locator('#listFilter-period').selectOption('year');
    assert.equal(await page.locator('#modalRoot .period-range-fields').isHidden(),true,'Van/Tot only for Aangepaste periode');
    await page.locator('#listFilter-period').selectOption('custom');
    await setDate(page.locator('#listFilterFrom'),'2026-01-01');
    await setDate(page.locator('#listFilterTo'),'2026-03-31');
    const [from,to]=await Promise.all([page.locator('#listFilterFrom').boundingBox(),page.locator('#listFilterTo').boundingBox()]);
    assert.equal(Math.round(from.height),Math.round(to.height),'Van and Tot same height');
    await page.getByRole('button',{name:'Toepassen'}).click();
    assert.deepEqual(await page.evaluate(()=>getListRows('expenses').map(e=>e.id).sort()),['e1','e2']);
    assert.match(await page.locator('.product-kpis').innerText(),/170,00/,'Totals follow the custom period');
    assert.match(await page.locator('.list-filter-chip').innerText(),/1 jan – 31 mrt 2026/);
    assert.equal(await page.locator('#expensePeriod .filter-btn.active').count(),0,'No quick choice is active for a custom period');
    await page.locator('[data-list-open-filters]').click();
    assert.equal(await page.locator('#listFilterFrom').inputValue(),'2026-01-01','Filter dialog shows the same Van/Tot');
    await setDate(page.locator('#listFilterFrom'),'2026-03-01');
    await setDate(page.locator('#listFilterTo'),'2026-04-30');
    await page.getByRole('button',{name:'Toepassen'}).click();
    assert.deepEqual(await page.evaluate(()=>getListRows('expenses').map(e=>e.id).sort()),['e2','e3']);
    await page.screenshot({path:`${shotDir}/${browserName}-${tag}-kosten-periode.png`,fullPage:true});
    assert.equal(await overflow(page),0);

    // Flow 4: "Weghalen" no longer leaves an unsolvable alert; a real credit can be confirmed and re-checks on change.
    await page.evaluate(()=>{setFinancialPeriod('all');correctExpense('e2');navigate('dashboard')});
    assert.equal(await page.evaluate(()=>dataHealthIssues().filter(i=>i.key.startsWith('negative-')).length),0,'A complete correction pair is not flagged');
    await page.evaluate(()=>{state.expenses.push({id:'credit',date:'2026-05-02',vendor:'Drukkerij',category:'marketing',exVat:-40,vatRate:21});render()});
    // The basic dashboard lists the alert itself; the full release shows insights there and the alert under "Alle aandachtspunten".
    const healthAlert=page.locator('[data-attention-key="health"]'),healthRows=()=>page.evaluate(()=>attentionRows().filter(r=>r.category==='health').length);
    if(await healthAlert.count())await healthAlert.click();
    else{await page.evaluate(()=>navigate('control'));await page.locator('[onclick*="health-negative-credit"]').first().click()}
    const dialog=page.locator('[role=dialog]');
    assert.match(await dialog.innerText(),/Drukkerij[\s\S]*Waarom zie je dit\?[\s\S]*Wat moet je doen\?/);
    assert.equal(await dialog.getByRole('button',{name:'Kosten aanpassen'}).count(),1,'The fix is one tap away');
    await page.screenshot({path:`${shotDir}/${browserName}-${tag}-melding.png`});
    await dialog.getByRole('button',{name:'Klopt, het is een creditnota'}).click();
    await dialog.waitFor({state:'detached'});
    assert.equal(await healthRows(),0,'The alert disappears after confirming');
    assert.equal(await healthAlert.count(),0);
    assert.equal(await page.evaluate(()=>state.audit[0].action),'Negatieve kosten gecontroleerd');
    await page.evaluate(()=>{state.expenses.find(e=>e.id==='credit').exVat=-55;render()});
    assert.equal(await healthRows(),1,'A changed amount is checked again');

    // Flow 5: Btw says "Te betalen" and the yearly overview sits inside its card.
    await page.evaluate(()=>{setVatPeriod('all');navigate('vat')});
    assert.match(await page.locator('.product-kpis').innerText(),/Te betalen btw|Terug te vragen btw/);
    assert.doesNotMatch(await page.locator('#content').innerText(),/Waarschijnlijk/);
    assert.match(await page.locator('.page-status').innerText(),/Indicatie/,'The page still says it is an indication');
    const card=await page.locator('.vat-history-table').boundingBox(),title=await page.locator('.vat-history-table h2').boundingBox();
    assert.ok(title.x-card.x>=14&&title.y-card.y>=14,'Per jaar title has room inside its card');
    await page.screenshot({path:`${shotDir}/${browserName}-${tag}-btw.png`,fullPage:true});
    assert.equal(await overflow(page),0);
    await context.close();
  }
  assert.deepEqual(errors,[],'No page errors');
  console.log('Exports, filters and alerts: PASS',browserName);
}finally{
  await browser.close();server.close();
}
