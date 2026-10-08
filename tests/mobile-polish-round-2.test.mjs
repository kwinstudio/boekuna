
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
const polish=fs.readFileSync(new URL('../public/assets/mobile-polish-round-2.js',import.meta.url),'utf8');
const polishCss=fs.readFileSync(new URL('../public/assets/mobile-polish-round-2.css',import.meta.url),'utf8');
const build=fs.readFileSync(new URL('../scripts/build-app.mjs',import.meta.url),'utf8');
fs.mkdirSync('tests/artifacts/mobile-polish-round-2',{recursive:true});

assert.match(original,/mobile-polish-round-2\.css/,'App source must load round-2 CSS');
assert.match(original,/mobile-polish-round-2\.js/,'App source must load round-2 JS');
assert.ok(original.lastIndexOf('<script src="/assets/mobile-polish-round-2.js"></script>')>original.lastIndexOf('boekuna-upload-bootstrap'),'Round-2 JS must load after the upload/bootstrap scripts');
assert.match(build,/mobile-polish-round-2\.css/,'App build must copy round-2 CSS');
assert.match(build,/mobile-polish-round-2\.js/,'App build must copy round-2 JS');
assert.doesNotMatch(original,/Maak foto<\/button><button class="btn" type="button" onclick="chooseUploadSource/,'Mobile upload may not render the old Boekuna source picker');
assert.doesNotMatch(original,/'Documenten '\+done\+'\/'\+total/,'Header may not render Documenten x/y');
assert.match(original,/aria-label="Documenten worden verwerkt"/,'Processing spinner must have an accessible name');
assert.ok(original.indexOf('id="documentProcessingGlobal"')<original.indexOf('id="quickNew"'),'Processing spinner must be before the plus/New action');
assert.match(polish,/\.eq\('user_id',currentUser\.id\)\.eq\('client_ref',d\.fileId\)/,'Document rename must remain tenant-bound');
assert.match(polish,/Bestandsnaam bewerken/);
assert.match(polish,/Wil je dit verwijderen\?/);
assert.match(polish,/Bevestig verwijderen/);
assert.match(polish,/history\.pushState\(Object\.assign\(\{\},history\.state/,'Document preview must use restorable browser history');
assert.match(polish,/boekuna-a4-page/,'Invoice preview must use explicit A4 pages');
assert.match(polishCss,/width:210mm!important/);
assert.match(polishCss,/height:297mm!important/);
assert.match(original,/@page\{size:A4/,'Existing invoice PDF/print path must remain A4');
assert.match(original,/WIS ADMINISTRATIE/,'Strong administration reset confirmation must remain');
assert.match(original,/Typ VERWIJDER/,'Strong account deletion confirmation must remain');
assert.match(original,/signInWithPassword/,'Account deletion re-authentication must remain');

function replaceLast(source,needle,replacement){
  const index=source.lastIndexOf(needle);
  if(index<0)throw new Error('Missing bootstrap marker: '+needle);
  return source.slice(0,index)+replacement+source.slice(index+needle.length);
}

const seedLines=[];
for(let i=0;i<18;i++){
  seedLines.push({
    desc:(i===2?'Zeer lange omschrijving voor mobiele A4-controle met meerdere woorden zodat de regel veilig binnen de vaste documentkolom blijft':'Dienstregel '+String(i+1).padStart(2,'0')),
    qty:1,
    unit:25+i,
    unitLabel:'uur',
    vat:i%3===0?9:21
  });
}
const seedDocuments=[];
for(let i=0;i<36;i++){
  seedDocuments.push({id:'d'+i,fileId:i===0?'file-d0':'',name:'Document '+String(i).padStart(2,'0')+'.pdf',type:'Upload',date:'2026-10-01'});
}

const fixture=[
  "currentUser={...TEST_USER,id:'round2-test',email:'round2@example.test',supabaseUser:{user_metadata:{first_name:'Kwin'}}};",
  "var persisted=localStorage.getItem(DATA_KEY_PREFIX+currentUser.id);",
  "if(persisted){state=normalizeState(JSON.parse(persisted));}else{",
  "state=structuredClone(DEFAULT);",
  "state.company={...state.company,name:'BOEKUNA QA Testonderneming met een lange bedrijfsnaam',tradeName:'Boekuna QA',contactName:'Kwin',email:'qa@example.test',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',bankAccountName:'Boekuna QA',kor:false};",
  "state.contacts=[{id:'c1',type:'customer',name:'QA Klant BV',email:'klant@example.test',address:'Klantstraat 2',postal:'3012BB',city:'Rotterdam'},{id:'c2',type:'supplier',name:'Vrije relatie',email:'vrij@example.test',city:'Delft'}];",
  "state.services=[{id:'s1',name:'Consultancy',description:'Strategisch advies',price:125,unitLabel:'uur',vat:21,active:true}];",
  "state.invoices=[{id:'i1',number:'2026-0042',customerId:'c1',status:'sent',kind:'invoice',issueDate:'2026-10-01',supplyDate:'2026-10-01',dueDate:'2026-10-15',taxTreatment:'standard',payments:[],lines:"+JSON.stringify(seedLines)+",notes:'Bedankt voor de opdracht.',paymentReference:'20260042'}];",
  "state.transactions=[];state.expenses=[];state.hours=[];state.mileage=[];state.bookings=[];",
  "state.documents="+JSON.stringify(seedDocuments)+";",
  "state.plannedCash=[{id:'pc1',type:'out',date:'2026-10-12',description:'Software abonnement',amount:99,repeating:'monthly'}];",
  "save();",
  "}",
  "documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingSession=null;",
  "enterApp();"
].join('\n');

let appHtml=original.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
appHtml=replaceLast(appHtml,'initAuth();',fixture);

const mime={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const publicRoot=new URL('../public/',import.meta.url);
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(pathname.startsWith('/assets/')){
    const file=new URL(pathname.replace(/^\//,''),publicRoot);
    if(fs.existsSync(file)){
      const ext=path.extname(file.pathname);
      res.writeHead(200,{'content-type':mime[ext]||'application/octet-stream','cache-control':'no-store'});
      return fs.createReadStream(file).pipe(res);
    }
  }
  if(pathname==='/manifest.webmanifest'){res.writeHead(200,{'content-type':'application/manifest+json'});return res.end('{}')}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(appHtml);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;

const browserName=(process.env.BOOKUNA_BROWSER||'chromium')==='webkit'?'webkit':'chromium';
const browserType=browserName==='webkit'?webkit:chromium;
const browser=await browserType.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];
page.on('pageerror',error=>errors.push(String(error)));

async function nav(route){
  await page.evaluate(r=>navigate(r),route);
  await page.waitForFunction(r=>typeof page!=='undefined'&&page===r,route);
}

async function shot(name,width=390,height=844,fullPage=true){
  const targetHeight=height||(width<700?844:960);
  const current=page.viewportSize();
  if(!current||current.width!==width||current.height!==targetHeight){
    await page.setViewportSize({width,height:targetHeight});
    await page.waitForTimeout(80);
  }
  await page.screenshot({path:'tests/artifacts/mobile-polish-round-2/'+browserName+'-'+width+'-'+name+'.png',fullPage});
}

async function openRowFor(text){
  const row=page.locator('tbody tr',{hasText:text}).first();
  await row.locator('.row-action-trigger').click();
  await page.locator('.row-action-menu').waitFor();
  return row;
}

try{
  await page.goto(base+'/app',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof window.openDocumentPreview==='function'&&typeof window.runNormalDelete==='function');
  await page.locator('#pageTitle').filter({hasText:'Overzicht'}).waitFor();
  assert.deepEqual(errors,[],'Round-2 app must load without JavaScript errors');

  // Header processing indicator: spinner only, left of plus, hidden again when idle.
  await page.evaluate(()=>{
    documentProcessingSession={persistent:true,items:[{id:'local-1',clientRef:'local-1',state:'uploading'}]};
    renderGlobalDocumentIndicator();
  });
  const processing=page.locator('#documentProcessingGlobal');
  assert.equal(await processing.isVisible(),true);
  assert.equal((await page.locator('#documentProcessingGlobalText').innerText()).trim(),'');
  assert.equal(await processing.getAttribute('aria-label'),'Documenten worden verwerkt');
  const positions=await page.evaluate(()=>({
    spinner:document.getElementById('documentProcessingGlobal').getBoundingClientRect().left,
    plus:document.getElementById('quickNew').getBoundingClientRect().left
  }));
  assert.ok(positions.spinner<positions.plus,'Processing spinner must be left of plus/New');
  await page.evaluate(()=>{documentProcessingSession=null;documentProcessingJobs=[];renderGlobalDocumentIndicator()});
  assert.equal(await processing.isHidden(),true);

  // Mobile reference nav keeps scanning under Documents; upload still opens the native picker directly.
  await shot('documents-before-native-picker');
  await page.evaluate(()=>navigate('documents'));
  await page.locator('#pageTitle').filter({hasText:'Bonnetjes'}).waitFor();
  const upload=page.getByRole('button',{name:'Document uploaden',exact:true});
  assert.equal(await upload.getAttribute('onclick'),'openDocumentUpload()');
  assert.ok(await page.locator('#invoicePdfFile').getAttribute('multiple')!==null);
  assert.equal(await page.locator('#invoicePdfFile').getAttribute('capture'),null);
  assert.equal(await page.locator('#modalRoot .source-picker').count(),0);
  assert.equal(await page.locator('#modalRoot').getByText('Maak foto',{exact:true}).count(),0);

  // Documents: one fixed action anchor, no useless dash, rename persists through reload.
  await nav('documents');
  await page.locator('#pageTitle').filter({hasText:'Bonnetjes'}).waitFor();
  assert.equal(await page.locator('table.mobile-documents .row-action-trigger').count(),36);
  const firstDocRow=page.locator('tbody tr',{hasText:'Document 00.pdf'}).first();
  assert.equal((await firstDocRow.locator('td').nth(3).innerText()).trim(),'');
  await shot('documents-idle');
  await openRowFor('Document 00.pdf');
  for(const label of ['Bekijken','Bestandsnaam bewerken','Verwijderen'])assert.equal(await page.locator('.row-action-menu').getByRole('menuitem',{name:label,exact:true}).count(),1);
  await shot('document-menu',390,844,false);
  await page.locator('.row-action-menu').getByRole('menuitem',{name:'Bestandsnaam bewerken',exact:true}).click();
  await page.locator('#documentDisplayName').fill('Nieuw document');
  await page.getByRole('button',{name:'Opslaan',exact:true}).click();
  await page.locator('#modalRoot [role=dialog]').waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>state.documents.find(d=>d.id==='d0').name),'Nieuw document.pdf');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof window.openDocumentPreview==='function');
  await nav('documents');
  assert.equal(await page.evaluate(()=>state.documents.find(d=>d.id==='d0').name),'Nieuw document.pdf','Renamed display name must persist after reload');

  // Document preview must restore exact list state and browser Back must close it.
  await page.evaluate(()=>{
    listPageState('documents').query='pdf';
    listPageState('documents').sort='name-asc';
    persistListState();
    render();
    getStoredFile=async()=>({id:'file-d0',name:'Nieuw document.pdf',type:'application/pdf',blob:new Blob(['%PDF-1.4 round2'],{type:'application/pdf'})});
  });
  await page.locator('[data-list-search]').waitFor();
  const contentScroll=await page.evaluate(()=>{
    const content=document.getElementById('content');
    content.scrollTop=Math.min(460,Math.max(0,content.scrollHeight-content.clientHeight));
    return content.scrollTop;
  });
  await openRowFor('Nieuw document.pdf');
  await page.locator('.row-action-menu').getByRole('menuitem',{name:'Bekijken',exact:true}).click();
  await page.locator('.document-preview-frame').waitFor();
  await page.goBack();
  await page.locator('.document-preview-frame').waitFor({state:'detached'});
  assert.equal(await page.locator('#pageTitle').innerText(),'Bonnetjes');
  assert.equal(await page.locator('[data-list-search]').inputValue(),'pdf');
  assert.equal(await page.evaluate(()=>listPageState('documents').sort),'name-asc');
  const afterScroll=await page.evaluate(()=>document.getElementById('content').scrollTop);
  assert.ok(Math.abs(afterScroll-contentScroll)<=3,'Document preview must restore content scroll position');

  // Normal delete: first action removes nothing; cancel preserves; confirm removes.
  await openRowFor('Document 01.pdf');
  await page.locator('.row-action-menu').getByRole('menuitem',{name:'Verwijderen',exact:true}).click();
  await page.getByRole('heading',{name:'Wil je dit verwijderen?',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>state.documents.some(d=>d.id==='d1')),true);
  await page.getByRole('button',{name:'Annuleren',exact:true}).click();
  assert.equal(await page.evaluate(()=>state.documents.some(d=>d.id==='d1')),true);
  await openRowFor('Document 01.pdf');
  await page.locator('.row-action-menu').getByRole('menuitem',{name:'Verwijderen',exact:true}).click();
  await page.getByRole('button',{name:'Bevestig verwijderen',exact:true}).click();
  await page.waitForFunction(()=>!state.documents.some(d=>d.id==='d1'));
  assert.equal(await page.evaluate(()=>state.documents.some(d=>d.id==='d1')),false);

  // Processing screenshot uses the compact global indicator.
  await page.evaluate(()=>{documentProcessingSession={persistent:true,items:[{id:'local-2',clientRef:'local-2',state:'processing'}]};renderGlobalDocumentIndicator()});
  await shot('documents-processing');
  await page.evaluate(()=>{documentProcessingSession=null;renderGlobalDocumentIndicator()});

  // Cashflow actions are compact buttons and deletion is confirmed.
  await nav('cashflow');
  const plannedRow=page.locator('table.mobile-cashflow tbody tr',{hasText:'Software abonnement'});
  assert.equal(await plannedRow.getByRole('button',{name:'Bewerken',exact:true}).count(),1);
  assert.equal(await plannedRow.getByRole('button',{name:'Verwijderen',exact:true}).count(),1);
  await shot('cashflow-planned');
  await plannedRow.getByRole('button',{name:'Verwijderen',exact:true}).click();
  assert.equal(await page.evaluate(()=>state.plannedCash.length),1);
  await page.getByRole('button',{name:'Annuleren',exact:true}).click();
  assert.equal(await page.evaluate(()=>state.plannedCash.length),1);

  // Relations and services use the same three-dot menu pattern.
  await nav('contacts');
  assert.equal(await page.locator('table.mobile-contacts button.link-btn',{hasText:'Bewerk'}).count(),0);
  await openRowFor('Vrije relatie');
  assert.equal(await page.locator('.row-action-menu').getByRole('menuitem',{name:'Bewerken',exact:true}).count(),1);
  assert.equal(await page.locator('.row-action-menu').getByRole('menuitem',{name:'Verwijderen',exact:true}).count(),1);
  await shot('relations-menu',390,844,false);
  await page.keyboard.press('Escape');

  await nav('services');
  assert.equal(await page.locator('table.mobile-services button.link-btn',{hasText:'Bewerk'}).count(),0);
  await openRowFor('Consultancy');
  assert.equal(await page.locator('.row-action-menu').getByRole('menuitem',{name:'Bewerken',exact:true}).count(),1);
  assert.equal(await page.locator('.row-action-menu').getByRole('menuitem',{name:'Inactief zetten',exact:true}).count(),1);
  assert.equal(await page.locator('.row-action-menu').getByRole('menuitem',{name:'Verwijderen',exact:true}).count(),1);
  await shot('services-menu',390,844,false);
  await page.keyboard.press('Escape');

  // Report period: quick choice on the page; Van/Tot only in the Filters dialog, which must not overflow.
  await nav('reports');
  assert.equal(await page.locator('#content input[type="date"]').count(),0,'No date fields on the page itself');
  await page.locator('.page-filter-btn').click();
  await page.locator('#reportFilterPeriod').selectOption('custom');
  assert.ok(await page.locator('#reportFilterFrom').isVisible(),'Date editing appears for a custom period');
  for(const width of [320,390,430]){
    await page.setViewportSize({width,height:844});
    await page.waitForTimeout(60);
    const dateLayout=await page.evaluate(()=>({
      overflow:document.documentElement.scrollWidth-window.innerWidth,
      parent:document.querySelector('#modalRoot .report-custom-range').getBoundingClientRect(),
      from:document.getElementById('reportFilterFrom').getBoundingClientRect(),
      to:document.getElementById('reportFilterTo').getBoundingClientRect()
    }));
    assert.ok(dateLayout.overflow<=1,'No horizontal overflow at '+width);
    assert.ok(dateLayout.from.left>=dateLayout.parent.left-1&&dateLayout.from.right<=dateLayout.parent.right+1,'From date must stay inside grid at '+width);
    assert.ok(dateLayout.to.left>=dateLayout.parent.left-1&&dateLayout.to.right<=dateLayout.parent.right+1,'To date must stay inside grid at '+width);
    await shot('reports-date-fields',width);
  }
  await page.evaluate(()=>closeModal());

  // Invoice spacing and fixed A4 preview, including mixed VAT and multipage long invoice.
  await page.setViewportSize({width:390,height:844});
  await nav('invoices');
  const gap=await page.evaluate(()=>{
    const stats=document.querySelector('.compact-metrics');
    const next=stats&&stats.nextElementSibling;
    if(!stats||!next)return 999;
    return next.getBoundingClientRect().top-stats.getBoundingClientRect().bottom;
  });
  assert.ok(gap>=12,'Invoice summary and first result section need visible vertical spacing');
  await shot('invoices-spacing');
  await page.evaluate(()=>viewInvoice('i1'));
  await page.locator('.boekuna-a4-page').first().waitFor();
  assert.ok(await page.locator('.boekuna-a4-page').count()>=2,'Long invoice must preview as multiple A4 pages');
  const ratio=await page.locator('.boekuna-a4-page').first().evaluate(el=>el.offsetWidth/el.offsetHeight);
  assert.ok(Math.abs(ratio-(210/297))<0.01,'Invoice preview page must retain 210/297 A4 ratio');
  assert.ok(await page.locator('.boekuna-a4-table').first().getByText('9%',{exact:true}).count()>0,'Mixed VAT 9% line must remain visible');
  assert.ok(await page.locator('.boekuna-a4-table').first().getByText('21%',{exact:true}).count()>0,'Mixed VAT 21% line must remain visible');
  const scaled=await page.evaluate(()=>{
    const preview=document.querySelector('.boekuna-a4-preview').getBoundingClientRect();
    const shell=document.querySelector('.boekuna-a4-shell').getBoundingClientRect();
    return {previewWidth:preview.width,shellWidth:shell.width,overflow:document.documentElement.scrollWidth-window.innerWidth};
  });
  assert.ok(scaled.shellWidth<=scaled.previewWidth+1,'A4 preview must scale to available mobile width');
  assert.ok(scaled.overflow<=1,'A4 preview must not create horizontal page overflow');
  await shot('invoice-a4-preview',390);
  await shot('invoice-a4-preview',320);
  await shot('invoice-a4-preview',1440,960);
  await page.getByRole('button',{name:'Sluiten'}).click().catch(async()=>{await page.keyboard.press('Escape')});
  if(await page.locator('#modalRoot [role=dialog]').count())await page.keyboard.press('Escape');

  // Settings information architecture and separate danger zone.
  await page.setViewportSize({width:390,height:844});
  await nav('settings');
  const groups=(await page.locator('.settings-group>.settings-group-label').allTextContents()).map(v=>v.trim());
  assert.deepEqual(groups,['Bedrijf','Weergave','Facturen','Boekhouding','Beveiliging & privacy','Data','Account','Gevaarzone']);
  assert.equal(await page.locator('.settings-danger-group').getByRole('button',{name:'Administratie wissen',exact:true}).count(),1);
  assert.equal(await page.locator('.settings-danger-group').getByRole('button',{name:'Account verwijderen',exact:true}).count(),1);
  await shot('settings',390);
  await shot('settings',1440,960);

  // Strong destructive flows remain stronger than the normal delete modal.
  await page.setViewportSize({width:390,height:844});
  await page.locator('.settings-danger-group').getByRole('button',{name:'Administratie wissen',exact:true}).click();
  await page.locator('#resetAdministrationConfirmation').waitFor();
  assert.equal(await page.locator('#confirmResetAdministration').isDisabled(),true);
  await page.getByRole('button',{name:'Annuleren',exact:true}).click();

  // 1440 evidence for the row/action surfaces requested in the review.
  await page.setViewportSize({width:1440,height:960});
  for(const entry of [
    ['documents','documents-desktop'],
    ['cashflow','cashflow-desktop'],
    ['reports','reports-desktop'],
    ['contacts','relations-desktop'],
    ['services','services-desktop']
  ]){
    await nav(entry[0]);
    await shot(entry[1],1440,960);
  }

  assert.deepEqual(errors,[],'Round-2 interactions must not emit page errors');
  console.log('Mobile polish round 2: PASS '+browserName+' (native scan trigger, confirmations, A4, state restore, menus, settings, responsive widths)');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
