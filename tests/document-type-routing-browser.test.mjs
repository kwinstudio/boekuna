import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';

// The document decides where it lands, not the upload button: a sales invoice uploaded via "Bon toevoegen" is income.
// The user can always set the Soort (Kosten / Inkoop / Verkoopfactuur) in the check, also later via Bewerken.
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
appHtml=replaceLast(appHtml,'initAuth();',[
  "currentUser={...TEST_USER,email:'doc-type@example.test'};",
  "sessionStorage.setItem(FINANCIAL_PERIOD_KEY,'all');",
  "state=structuredClone(DEFAULT);for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];",
  "state.company={...state.company,name:'Studio Kwin BV',kvk:'87654321',vat:'NL987654321B01',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',email:'doc-type@example.test',kor:false};",
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
const errors=[],dialogs=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('dialog',d=>{dialogs.push(d.message());return d.accept()});
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
async function waitIdle(){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))}
async function showAll(){
  // On a phone the check can open as one question; "Alle gegevens" shows every field, as a user would tap.
  const all=page.locator('#modalRoot button:visible',{hasText:/^Alle gegevens( bekijken)?$/});
  if(await all.count()){await all.first().click();await waitIdle()}
}
async function setKind(value){
  await showAll();
  await page.locator('#pdfImportKind').selectOption(value);
  await waitIdle();
}
async function nextStep(){await page.locator('#modalRoot [data-review-next]:visible').first().click();await waitIdle()}
async function save(){await page.locator('#modalRoot [data-review-save]:visible').first().click();await waitIdle()}
async function openReview(parsed,name){
  await page.evaluate(({png,parsed,name})=>{
    const bytes=Uint8Array.from(atob(png),c=>c.charCodeAt(0)),file=new File([bytes],name,{type:'image/png'});
    const fc={party:99,invoiceNumber:99,issueDate:99,net:99,vatAmount:99,gross:99,vatRate:99,vatLines:99,category:99};
    pendingPdfImport={file,previewUrl:URL.createObjectURL(file),sha256:name,sourceClientRef:'',sourceDocumentId:'',processingJobId:'',
      parsed:{currency:'EUR',status:'sent',mixedRates:false,lineItems:[],adjustments:[],recognitionBad:0,confidenceScore:96,fieldConfidence:fc,issueDate:today(),...parsed}};
    showPdfImportReview(pendingPdfImport.parsed);
  },{png,parsed,name});
  await page.locator('#pdfImportForm').waitFor();
  await waitIdle();
}
async function openEdit(docName){
  await page.evaluate(name=>{closeModal();const d=state.documents.find(x=>x.name===name);return editScannedDocument(d.id)},docName);
  await page.locator('#pdfImportForm').waitFor();await waitIdle();
}
const ledger=()=>page.evaluate(()=>({
  expenses:state.expenses.map(e=>({vendor:e.vendor,gross:Math.round(expenseGross(e)*100),category:e.category,corrected:!!e.correctedAt,correctionFor:!!e.correctionFor})),
  invoices:state.invoices.map(i=>({number:i.number,status:i.status,gross:Math.round(invoiceGross(i)*100),customer:getContact(i.customerId)?.name})),
  documents:state.documents.map(d=>({name:d.name,linkedType:d.linkedType,history:(d.editHistory||[]).map(h=>h.changes.map(c=>c.field+':'+c.from+'>'+c.to).join(','))})),
  costs:Math.round(state.expenses.reduce((s,e)=>s+expenseGross(e),0)*100)
}));

try{
  await page.goto(base+'/app',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.BookunaDocumentReviewV2&&typeof processorAnalysisToCandidate==='function'&&typeof changeReviewBookingKind==='function');
  if(isWebkit)await page.evaluate(()=>{const files=new Map();putStoredFile=async(id,file)=>{files.set(id,{id,name:file.name,type:file.type,size:file.size,blob:file})};getStoredFile=async id=>files.get(id)||null});

  // 1. Recognition: the document wins over the upload button.
  const routing=await page.evaluate(()=>{
    const own={name:'Studio Kwin BV',vatNumber:'NL987654321B01'},client={name:'Bakkerij Jansen'},shop={name:'Gamma'};
    const pick=(analysis,forced)=>{const c=processorAnalysisToCandidate(analysis,'',forced);return [c.type,c.documentType,c.party]};
    const merged=mergeAIParsed({type:'purchase',party:'Studio Kwin BV'},processorAnalysisToCandidate({documentType:'sales_invoice',supplier:own,customer:client},'','purchase'),'purchase');
    return {
      salesViaBon:pick({documentType:'sales_invoice',supplier:own,customer:client},'purchase'),
      ownSenderViaBon:pick({documentType:'purchase_invoice',supplier:own,customer:client},'purchase'),
      receiptViaInvoice:pick({documentType:'receipt',supplier:shop,customer:{}},'sale'),
      ownCustomerViaInvoice:pick({documentType:'purchase_invoice',supplier:shop,customer:own},'sale'),
      unclearFollowsButton:pick({documentType:'purchase_invoice',supplier:shop,customer:client},'sale'),
      unclearAuto:pick({documentType:'purchase_invoice',supplier:shop,customer:client},'auto'),
      creditOwnSender:pick({documentType:'credit_invoice',supplier:own,customer:client},'purchase'),
      merged:[merged.type,merged.party]
    };
  });
  assert.deepEqual(routing.salesViaBon,['sale','sale_invoice','Bakkerij Jansen'],label+': a sales invoice uploaded via Bon toevoegen becomes income');
  assert.deepEqual(routing.ownSenderViaBon,['sale','sale_invoice','Bakkerij Jansen'],label+': own company as sender means income');
  assert.deepEqual(routing.receiptViaInvoice,['purchase','receipt','Gamma'],label+': a till receipt is always a cost');
  assert.deepEqual(routing.ownCustomerViaInvoice,['purchase','purchase_invoice','Gamma'],label+': own company as customer means a cost');
  assert.deepEqual(routing.unclearFollowsButton,['sale','sale_invoice','Bakkerij Jansen'],label+': without evidence the button still decides');
  assert.deepEqual(routing.unclearAuto,['purchase','purchase_invoice','Gamma'],label+': auto stays a cost by default');
  assert.equal(routing.creditOwnSender[0],'sale',label+': own credit note is income-side even via Bon toevoegen');
  assert.deepEqual(routing.merged,['sale','Bakkerij Jansen'],label+': the browser guess does not push the processor result back to costs');

  // 2. New document: shown as Inkoop, switched to Kosten (category only) and saved as a cost.
  await openReview({type:'purchase',documentType:'receipt',party:'Gamma',invoiceNumber:'',category:'Inkoop',net:100,vatAmount:21,gross:121,vatRate:21,vatLines:[{rate:21,taxableAmount:100,vatAmount:21}]},'bon-gamma.png');
  await showAll();
  assert.equal(await page.locator('#pdfImportKind').inputValue(),'purchase',label+': default category Inkoop shows Soort Inkoop');
  await setKind('cost');
  assert.notEqual(await page.locator('#pdfImportForm [name=category]').inputValue(),'Inkoop',label+': Kosten moves the category away from Inkoop');
  await nextStep();await save();
  await page.waitForFunction(()=>state.expenses.length===1);
  let s=await ledger();
  assert.equal(s.expenses[0].category,'Overig',label+': saved as Kosten (Overig)');

  // 3. New document recognised as a cost, but it is the user's own sales invoice: Soort Verkoopfactuur books income.
  await openReview({type:'purchase',documentType:'purchase_invoice',party:'Bakkerij Jansen',invoiceNumber:'2026-014',category:'Inkoop',net:500,vatAmount:105,gross:605,vatRate:21,vatLines:[{rate:21,taxableAmount:500,vatAmount:105}]},'factuur-2026-014.png');
  await setKind('sale');
  await page.waitForFunction(()=>pendingPdfImport?.parsed?.type==='sale');
  await showAll();
  assert.equal(await page.locator('#pdfImportForm [name=party]').inputValue(),'Bakkerij Jansen',label+': typed values stay after switching');
  assert.equal(await page.locator('#pdfImportForm input[name=type]').inputValue(),'sale',label+': form now books income');
  await nextStep();await save();
  await page.waitForFunction(()=>state.invoices.length===1);
  s=await ledger();
  assert.deepEqual([s.invoices[0].number,s.invoices[0].gross,s.invoices[0].customer],['2026-014',60500,'Bakkerij Jansen'],label+': saved as a sales invoice');
  assert.equal(s.expenses.length,1,label+': no extra cost booked');

  // 4. Later: the saved cost (bon-gamma) turns out to be a sales invoice. Bewerken -> Soort Verkoopfactuur.
  await openEdit('bon-gamma.png');
  await setKind('sale');
  await page.waitForFunction(()=>pendingPdfImport?.parsed?.type==='sale');
  await showAll();
  await page.locator('#pdfImportForm [name=invoiceNumber]').fill('2026-015');
  await nextStep();await save();
  await page.waitForFunction(()=>state.invoices.length===2);
  s=await ledger();
  assert.equal(s.costs,0,label+': the cost no longer counts (reversed)');
  assert.ok(s.expenses.some(e=>e.corrected)&&s.expenses.some(e=>e.correctionFor),label+': the old cost stays visible as reversed');
  const gammaDoc=s.documents.find(d=>d.name==='bon-gamma.png');
  assert.equal(gammaDoc.linkedType,'invoice',label+': the same document now points to the invoice');
  assert.deepEqual(gammaDoc.history,['type:Kosten>Verkoopfactuur'],label+': the change is in the document history');
  assert.equal(s.documents.length,2,label+': no second document row');
  assert.ok(await page.evaluate(()=>state.audit.some(a=>a.action==='Soort document gewijzigd')),label+': audit log entry');

  // 5. And back: Bewerken the invoice -> Soort Inkoop. The invoice is cancelled, a cost is booked again.
  await openEdit('bon-gamma.png');
  assert.equal(await page.locator('#pdfImportKind').inputValue(),'sale',label+': edit opens with the current Soort');
  await setKind('purchase');
  await page.waitForFunction(()=>pendingPdfImport?.parsed?.type==='purchase');
  await nextStep();await save();
  await page.waitForFunction(()=>state.invoices.find(i=>i.number==='2026-015')?.status==='cancelled');
  s=await ledger();
  assert.equal(s.costs,12100,label+': counted as a cost again');
  assert.equal(s.expenses.filter(e=>!e.corrected&&!e.correctionFor)[0].category,'Inkoop',label+': booked as Inkoop');
  assert.deepEqual(s.documents.find(d=>d.name==='bon-gamma.png').history,['type:Kosten>Verkoopfactuur','type:Verkoopfactuur>Inkoop'],label+': both changes in the history');

  // 6. A paid invoice cannot change side: the check says why and nothing changes.
  await page.evaluate(()=>{const i=state.invoices.find(x=>x.number==='2026-014');state.transactions.push({id:'tx-paid',date:today(),description:'Bakkerij Jansen',amount:605,status:'matched',matchType:'invoice',matchId:i.id});save()});
  const beforePaid=await ledger();
  await openEdit('factuur-2026-014.png');
  await setKind('cost');
  await page.waitForFunction(()=>pendingPdfImport?.parsed?.type==='purchase');
  await nextStep();
  await page.evaluate(()=>savePdfInvoiceImport());await waitIdle();
  assert.match(await page.locator('#reviewBlockingState').innerText(),/soort/i,label+': refusal names the Soort');
  assert.deepEqual(await ledger(),beforePaid,label+': refused change saves nothing');
  await page.evaluate(()=>closeModal());

  const overflow=await page.evaluate(()=>({vw:innerWidth,doc:document.documentElement.scrollWidth}));
  assert.ok(overflow.doc<=overflow.vw+2,label+': no horizontal overflow '+JSON.stringify(overflow));
  assert.deepEqual(errors,[],label+': page errors');
  console.log('document type routing ('+label+'): ok');
}finally{
  await browser.close();server.close();
}
