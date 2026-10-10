import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';

// A confirmed scan (bon) can be corrected later through the same check screen, without a new scan:
// the original file stays, the linked cost changes, overviews follow and every change is in the history.
const root=process.cwd();
const build=spawnSync(process.execPath,['scripts/build-app.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,'app build failed: '+(build.stderr||build.stdout));
const dist=path.join(root,'dist','app');

function replaceLast(text,needle,replacement){
  const i=text.lastIndexOf(needle);
  if(i<0)throw new Error('Missing fixture bootstrap marker: '+needle);
  return text.slice(0,i)+replacement+text.slice(i+needle.length);
}
let appHtml=fs.readFileSync(path.join(dist,'index.html'),'utf8').replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
// The ledger survives a reload (like the real app), so the test can check that corrections persist.
appHtml=replaceLast(appHtml,'initAuth();',[
  "currentUser={...TEST_USER,email:'scan-edit@example.test'};",
  "sessionStorage.setItem(FINANCIAL_PERIOD_KEY,'all');",
  "const savedLedger=localStorage.getItem(userDataKey());",
  "if(savedLedger)state=normalizeState(JSON.parse(savedLedger));else{state=structuredClone(DEFAULT);for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];",
  "state.company={...state.company,name:'Scan QA BV',kvk:'12345678',vat:'NL123456789B01',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',email:'scan-edit@example.test',kor:false}}",
  "documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;",
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
const base='http://127.0.0.1:'+server.address().port;
const isWebkit=process.env.BOOKUNA_BROWSER==='webkit';
const browser=await (isWebkit?webkit:chromium).launch({headless:true});
const context=await browser.newContext(isWebkit?{...devices['iPhone 13'],reducedMotion:'reduce'}:{viewport:{width:1440,height:900},reducedMotion:'reduce'});
const page=await context.newPage();
const label=isWebkit?'webkit iPhone':'chromium desktop';
const errors=[],dialogs=[];let dialogAnswer=true;
page.on('pageerror',e=>errors.push(String(e)));
page.on('dialog',d=>{dialogs.push(d.message());return dialogAnswer?d.accept():d.dismiss()});
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const cents=v=>Math.round(Number(v)*100);
const ledger=()=>page.evaluate(()=>{
  const e=state.expenses.find(x=>!x.correctionFor),d=state.documents[0];
  return {expenses:state.expenses.length,documents:state.documents.length,
    e:e&&{id:e.id,vendor:e.vendor,date:e.date,exVat:e.exVat,vat:expenseVat(e),gross:expenseGross(e),rate:e.vatRate,mixed:!!e.mixedRates,lines:e.vatLines,deductible:expenseDeductibleVat(e)},
    d:d&&{id:d.id,fileId:d.fileId,party:d.reviewSnapshot?.party,gross:d.reviewSnapshot?.gross,history:(d.editHistory||[]).map(h=>({fields:h.changes.map(c=>c.field),previous:h.previousSnapshot?.party,actor:h.actorId,period:h.vatPeriod,unlinked:h.bankTransactionUnlinked}))},
    audit:state.audit.filter(a=>a.action==='Gescande bon aangepast').map(a=>({actor:a.actorId,entity:a.entityId,changes:(a.newValue?.changes||[]).map(c=>c.field)}))}
});
async function waitIdle(){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))}
async function openEditFromDocuments(){
  await page.evaluate(()=>{closeModal();navigate('documents')});
  // Bonnetjes row menu: Bekijken (original) stays, Bewerken opens the saved check filled in.
  await page.locator('#content .row-action-trigger').first().click();
  const menu=page.locator('[role="menu"]').last();
  assert.ok(await menu.getByRole('menuitem',{name:'Bekijken'}).count()||await menu.locator('button',{hasText:'Bekijken'}).count(),label+': Bekijken stays in the row menu');
  await menu.locator('button',{hasText:/^Bewerken$/}).click();
  await page.locator('#modalTitle',{hasText:'Bon aanpassen'}).waitFor();
  await waitIdle();
}
async function nextStep(){await page.locator('#modalRoot [data-review-next]:visible').first().click();await waitIdle()}
async function saveEdit(){await page.locator('#modalRoot [data-review-save]:visible').first().click();await waitIdle()}
async function typeAmount(value){
  const input=page.locator('#pdfImportAmount');
  await input.click();await input.fill('');await input.type(value);await input.blur?.();
  await page.evaluate(()=>document.getElementById('pdfImportAmount')?.dispatchEvent(new Event('change',{bubbles:true})));
  await waitIdle();
}

try{
  await page.goto(base+'/app',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.BookunaDocumentReviewV2&&typeof editScannedDocument==='function');
  // Headless WebKit cannot keep a File in IndexedDB (the test-mode file store); the real app stores files in
  // Supabase Storage. Keep the original in memory there so the same checks run on iPhone size.
  if(isWebkit)await page.evaluate(()=>{const files=new Map();window.__scanFiles=files;putStoredFile=async(id,file)=>{files.set(id,{id,name:file.name,type:file.type,size:file.size,blob:file})};getStoredFile=async id=>files.get(id)||null});
  const day=await page.evaluate(()=>today());
  // Another account on this device must never change.
  await page.evaluate(()=>localStorage.setItem(DATA_KEY_PREFIX+'other-user',JSON.stringify({expenses:[{id:'x',vendor:'Ander account',exVat:10,vatAmount:2.1,gross:12.1}]})));
  const otherBefore=await page.evaluate(()=>localStorage.getItem(DATA_KEY_PREFIX+'other-user'));

  // 1. Scan, check and confirm a receipt with the existing flow.
  await page.evaluate(({png,day})=>{
    const bytes=Uint8Array.from(atob(png),c=>c.charCodeAt(0)),file=new File([bytes],'bon-abc.png',{type:'image/png'});
    const fc={party:99,invoiceNumber:99,issueDate:99,net:99,vatAmount:99,gross:99,vatRate:99,vatLines:99,category:99};
    pendingPdfImport={file,previewUrl:URL.createObjectURL(file),sha256:'scan-edit-1',sourceClientRef:'',sourceDocumentId:'',processingJobId:'',
      parsed:{type:'purchase',documentType:'receipt',confidenceScore:96,party:'ABC Bouwmarkt',invoiceNumber:'',issueDate:day,category:'Inkoop',currency:'EUR',status:'sent',
        net:100,vatAmount:21,gross:121,vatRate:21,mixedRates:false,vatLines:[{rate:21,taxableAmount:100,vatAmount:21}],lineItems:[],adjustments:[],recognitionBad:0,fieldConfidence:fc}};
    showPdfImportReview(pendingPdfImport.parsed);
  },{png,day});
  await page.locator('#modalTitle',{hasText:'Document controleren'}).waitFor();
  await nextStep();await saveEdit();
  await page.waitForFunction(()=>state.documents.length===1&&state.expenses.length===1);
  let s=await ledger();
  assert.deepEqual([s.e.vendor,cents(s.e.gross),cents(s.e.exVat),cents(s.e.vat)],['ABC Bouwmarkt',12100,10000,2100],label+': confirmed scan booked as 121 incl. 21% btw');
  const fileId=s.d.fileId;assert.ok(fileId,label+': original file stored');
  const originalSize=await page.evaluate(async id=>(await getStoredFile(id))?.blob?.size,fileId);
  assert.ok(originalSize>0,label+': original file readable');

  // 2. Bekijken -> Bewerken: change the supplier and the amount, no new scan.
  await openEditFromDocuments();
  assert.equal(await page.locator('#pdfImportForm [name=party]').inputValue(),'ABC Bouwmarkt',label+': edit opens with the saved supplier');
  await page.locator('#pdfImportForm [name=party]').fill('XYZ Bouwmarkt');
  await nextStep();
  assert.equal((await page.locator('#pdfImportAmount').inputValue()).replace(',','.'),'121.00',label+': edit opens with the saved total');
  await typeAmount('133,10');
  assert.ok(await page.locator('#modalRoot [data-review-save]:visible',{hasText:'Wijzigingen opslaan'}).count(),label+': save says Wijzigingen opslaan');
  await saveEdit();
  await page.waitForFunction(()=>state.expenses[0]?.vendor==='XYZ Bouwmarkt');
  s=await ledger();
  assert.deepEqual([s.expenses,s.documents],[1,1],label+': no duplicate cost or document after a correction');
  assert.deepEqual([cents(s.e.gross),cents(s.e.exVat),cents(s.e.vat),s.e.rate],[13310,11000,2310,21],label+': amounts recalculated in cents');
  assert.equal(s.d.fileId,fileId,label+': same original file');
  assert.equal(await page.evaluate(async id=>(await getStoredFile(id))?.blob?.size,fileId),originalSize,label+': original file untouched');
  assert.deepEqual(s.d.history.map(h=>h.fields.sort()),[['gross','net','party','vatAmount']],label+': history lists changed fields');
  assert.equal(s.d.history[0].previous,'ABC Bouwmarkt',label+': history keeps the previous confirmed values');
  assert.ok(s.d.history[0].actor,label+': history records who changed it');
  assert.equal(s.audit.length,1,label+': audit log entry');
  assert.ok(await page.evaluate(()=>state.contacts.some(c=>c.type==='supplier'&&c.name==='XYZ Bouwmarkt')),label+': new supplier relation');
  // Overviews follow the corrected booking.
  const overview=await page.evaluate(()=>{const strip=h=>h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');const q=currentQuarter(),y=currentBookYear(),exps=state.expenses.filter(e=>inQuarter(e.date,q,y));return {quarter:quarterVatPosition(),boxes:vatReturnBoxes([],exps).input,expenses:strip(renderExpenses())}});
  assert.equal(cents(overview.quarter),-2310,label+': VAT position of this quarter uses the corrected VAT');
  assert.equal(cents(overview.boxes),2310,label+': VAT return box 5b uses the corrected VAT');
  assert.ok(overview.expenses.includes('XYZ Bouwmarkt')&&!overview.expenses.includes('ABC Bouwmarkt'),label+': Kosten shows the corrected supplier');

  // 3. Reload: the correction is kept.
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof editScannedDocument==='function'&&state.expenses.length===1);
  if(isWebkit)await page.evaluate(({png,fileId})=>{const bytes=Uint8Array.from(atob(png),c=>c.charCodeAt(0)),file=new File([bytes],'bon-abc.png',{type:'image/png'}),files=new Map([[fileId,{id:fileId,name:file.name,type:file.type,size:file.size,blob:file}]]);putStoredFile=async(id,f)=>{files.set(id,{id,name:f.name,type:f.type,size:f.size,blob:f})};getStoredFile=async id=>files.get(id)||null},{png,fileId});
  s=await ledger();
  assert.deepEqual([s.e.vendor,cents(s.e.gross),s.d.history.length],['XYZ Bouwmarkt',13310,1],label+': correction survives a reload');

  // 4. Nothing changed: no history entry.
  await openEditFromDocuments();await nextStep();await saveEdit();
  assert.equal((await ledger()).d.history.length,1,label+': saving without changes adds no history');

  // 5. Mixed VAT via the booking (Kosten > Aanpassen goes to the same check).
  await page.evaluate(id=>{closeModal();expenseActions(id)},s.e.id);
  await page.locator('#modalRoot button',{hasText:'Aanpassen'}).click();
  await page.locator('#modalTitle',{hasText:'Bon aanpassen'}).waitFor();
  await nextStep();
  await page.locator('#modalRoot [data-review-vat-mode]').click();
  await page.locator('.mixed-vat-row').nth(1).waitFor();
  const rows=page.locator('.mixed-vat-row');
  await rows.nth(0).locator('[data-vat-line-rate]').selectOption('21');
  await rows.nth(0).locator('[data-vat-line-net]').fill('60.00');await rows.nth(0).locator('[data-vat-line-vat]').fill('12.60');
  await rows.nth(1).locator('[data-vat-line-rate]').selectOption('9');
  await rows.nth(1).locator('[data-vat-line-net]').fill('50.00');await rows.nth(1).locator('[data-vat-line-vat]').fill('4.50');
  await page.locator('#modalRoot button',{hasText:'Gebruik deze totalen'}).click();await waitIdle();
  await saveEdit();
  await page.waitForFunction(()=>!!state.expenses[0]?.mixedRates);
  s=await ledger();
  assert.deepEqual([cents(s.e.gross),cents(s.e.exVat),cents(s.e.vat),s.e.rate,s.e.lines.length],[12710,11000,1710,null,2],label+': mixed VAT stored as separate lines');
  assert.deepEqual(s.e.lines.map(v=>[v.rate,cents(v.taxableAmount),cents(v.vatAmount)]).sort((a,b)=>a[0]-b[0]),[[9,5000,450],[21,6000,1260]],label+': VAT lines kept, never all 21%');
  assert.equal(s.d.history.length,2,label+': second correction in history');

  // 6. Linked bank payment: the payment stays, the link is only removed after confirmation.
  await page.evaluate(id=>{state.transactions.push({id:'tx-scan',date:today(),description:'XYZ Bouwmarkt pin',amount:-127.10,status:'matched',matchType:'expense',matchId:id,matchConfidence:'manual'});save()},s.e.id);
  await openEditFromDocuments();await nextStep();
  await page.locator('#modalRoot [data-review-vat-mode]').click();await waitIdle();
  const rateSelect=page.locator('#pdfImportVatRate');if(await rateSelect.isEnabled())await rateSelect.selectOption('21');
  await typeAmount('130,00');
  dialogs.length=0;dialogAnswer=false;await saveEdit();
  assert.ok(dialogs.some(m=>m.includes('gekoppeld aan een betaling')),label+': warns about the linked payment');
  assert.equal(cents((await ledger()).e.gross),12710,label+': cancelling the warning keeps everything as it was');
  dialogs.length=0;dialogAnswer=true;await saveEdit();
  await page.waitForFunction(()=>Math.round(expenseGross(state.expenses[0])*100)===13000);
  const tx=await page.evaluate(()=>state.transactions.find(t=>t.id==='tx-scan'));
  assert.deepEqual([tx.status,tx.amount,tx.matchId??null],['unmatched',-127.1,null],label+': bank transaction kept unchanged, link removed');
  s=await ledger();
  assert.deepEqual([cents(s.e.gross),cents(s.e.vat),s.e.mixed],[13000,2256,false],label+': back to one rate');
  assert.equal(s.d.history.at(-1).unlinked,'tx-scan',label+': history notes the removed link');

  // 7. A date in an earlier VAT quarter asks first; saying no changes nothing.
  const earlier=await page.evaluate(()=>{const d=new Date(today()+'T12:00:00');d.setMonth(d.getMonth()-3);return d.toISOString().slice(0,10)});
  await openEditFromDocuments();
  await page.locator('#pdfImportForm [name=issueDate]').fill(earlier);
  await nextStep();
  dialogs.length=0;dialogAnswer=false;await saveEdit();
  assert.ok(dialogs.some(m=>m.includes('btw-periode is al voorbij')),label+': warns about an earlier VAT period');
  assert.notEqual((await ledger()).e.date,earlier,label+': no silent change of an earlier VAT period');
  dialogAnswer=true;await saveEdit();
  await page.waitForFunction(d=>state.expenses[0]?.date===d,earlier);
  assert.ok((await ledger()).d.history.at(-1).period,label+': history marks the earlier VAT period');

  // 8. Invalid amount is refused with a clear reason.
  await openEditFromDocuments();await nextStep();
  await typeAmount('0');
  const beforeInvalid=await ledger();
  assert.ok(await page.locator('#modalRoot [data-review-save]:visible').first().isDisabled(),label+': save stays off for an invalid amount');
  assert.ok((await page.locator('#reviewBlockingState').innerText()).trim().length>0,label+': the check says what is wrong');
  await page.evaluate(()=>savePdfInvoiceImport());await waitIdle();
  assert.deepEqual(await ledger(),beforeInvalid,label+': invalid amount saves nothing');
  assert.ok(await page.locator('#modalTitle',{hasText:'Bon aanpassen'}).isVisible(),label+': check stays open after refusal');

  assert.equal(await page.evaluate(()=>localStorage.getItem(DATA_KEY_PREFIX+'other-user')),otherBefore,label+': other account untouched');
  const overflow=await page.evaluate(()=>({vw:innerWidth,doc:document.documentElement.scrollWidth}));
  assert.ok(overflow.doc<=overflow.vw+2,label+': no horizontal overflow '+JSON.stringify(overflow));
  assert.deepEqual(errors,[],label+': page errors');
  fs.mkdirSync(path.join(root,'tests','artifacts'),{recursive:true});
  await page.screenshot({path:path.join(root,'tests','artifacts','scan-edit-'+(isWebkit?'iphone':'desktop')+'.png')});
  console.log('scan edit after confirmation ('+label+'): ok');
}finally{
  await browser.close();server.close();
}
