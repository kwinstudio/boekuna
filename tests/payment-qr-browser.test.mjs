import fs from 'node:fs';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {loadEdge} from './production-code.mjs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';

// f1 Betaal-QR + eigen betaallink: the invoice (print view and shared PDF) carries a SEPA payment QR with the open amount,
// and the user's own payment link shows on the invoice and in the e-mail. Credit notes and paid invoices get neither.
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
  "currentUser={...TEST_USER,email:'qr@example.test'};",
  "sessionStorage.setItem(FINANCIAL_PERIOD_KEY,'all');",
  "const savedLedger=localStorage.getItem(userDataKey());",
  "if(savedLedger)state=normalizeState(JSON.parse(savedLedger));else{state=structuredClone(DEFAULT);for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];",
  "state.company={...state.company,name:'Betaal QA BV',kvk:'12345678',vat:'NL123456789B01',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',email:'qr@example.test',iban:'NL91ABNA0417164300',kor:false}}",
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
const cents=v=>Math.round(Number(v)*100);
async function waitIdle(){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))}


try{
  await page.goto(base+'/app',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof invoicePaymentQr==='function'&&typeof qrcode==='function');
  await page.evaluate(()=>{
    state.contacts=[{id:'c1',type:'customer',name:'Klant BV',email:'klant@example.test',address:'Weg 1',postal:'1000AA',city:'Amsterdam'}];
    const inv=(id,extra)=>({id,number:'2026-00'+id,kind:'invoice',customerId:'c1',issueDate:'2026-10-01',supplyDate:'2026-10-01',dueDate:'2026-10-15',paymentDays:14,status:'sent',taxTreatment:'standard',paymentReference:'RF18 2026 0001',lines:[{desc:'Werk',qty:1,unit:100,vat:21}],...extra});
    state.invoices=[inv('01',{}),inv('02',{payments:[{id:'p1',date:'2026-10-02',amount:50,method:'bank'}]}),inv('03',{payments:[{id:'p2',date:'2026-10-02',amount:121,method:'bank'}]}),inv('04',{kind:'credit',lines:[{desc:'Credit',qty:1,unit:-100,vat:21}]})];
    state.company={...state.company,bankAccountName:'Betaal QA BV',iban:'NL91 ABNA 0417 1643 00'};
    save();render();
  });
  const payload=id=>page.evaluate(id=>epcPaymentPayload(state.invoices.find(i=>i.id===id)),id);
  assert.equal(await payload('01'),'BCD\n002\n1\nSCT\n\nBetaal QA BV\nNL91ABNA0417164300\nEUR121.00\n\n\nRF18 2026 0001',label+': EPC payload for the full amount');
  assert.equal((await payload('02')).split('\n')[7],'EUR71.00',label+': QR asks only the open amount');
  assert.equal(await payload('03'),'',label+': paid invoice has no QR');
  assert.equal(await payload('04'),'',label+': credit note has no QR');
  const qr=await page.evaluate(()=>invoicePaymentQr(state.invoices[0]));
  assert.ok(qr&&qr.size>=25&&qr.bits.length===qr.size*qr.size,label+': QR matrix');

  // Print view: QR in the payment block; link only once set.
  const doc=id=>page.evaluate(id=>{const i=state.invoices.find(x=>x.id===id);return invoiceDocumentHtml(i,getContact(i.customerId),{...DEFAULT_INVOICE_DESIGN,...(state.company.invoiceDesign||{})})},id);
  let html=await doc('01');
  assert.ok(html.includes('class="pay-qr"')&&html.includes('aria-label="Betaal-QR"'),label+': QR on the invoice');
  assert.ok(!html.includes('class="pay-link"'),label+': no link without a link');
  assert.ok(!(await doc('04')).includes('class="pay-qr"'),label+': no QR on a credit note');

  // Settings: own link + QR switch.
  await page.evaluate(()=>{closeModal();navigate('settings')});await waitIdle();
  await page.evaluate(()=>openSettingsSection?openSettingsSection('invoices'):null).catch(()=>{});
  const linkInput=page.locator('[name="company.paymentLink"]');
  await linkInput.waitFor({state:'attached'});
  await page.evaluate(()=>{const f=document.querySelector('[name="company.paymentLink"]').form;f.querySelector('[name="company.paymentLink"]').value='https://tikkie.me/pay/boekuna/abc';f.requestSubmit?f.requestSubmit():f.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}))});
  await page.waitForFunction(()=>state.company.paymentLink==='https://tikkie.me/pay/boekuna/abc');
  html=await doc('01');
  assert.ok(html.includes('href="https://tikkie.me/pay/boekuna/abc"'),label+': link on the invoice');
  assert.ok(!(await doc('03')).includes('class="pay-link"'),label+': no link on a paid invoice');
  await page.evaluate(()=>{state.company.paymentLink='javascript:alert(1)'});
  assert.equal(await page.evaluate(()=>invoicePaymentLink()),'',label+': only https links');
  await page.evaluate(()=>{state.company.paymentLink='https://tikkie.me/pay/boekuna/abc';state.company.showPaymentQr=false});
  assert.ok(!(await doc('01')).includes('class="pay-qr"'),label+': QR can be switched off');
  await page.evaluate(()=>{delete state.company.showPaymentQr});

  // Mail text (default and own template) gets the link before the greeting.
  const mail=await page.evaluate(()=>applyTemplate('Zie {{betaallink}}',state.invoices[0],getContact('c1')));
  assert.equal(mail,'Zie https://tikkie.me/pay/boekuna/abc',label+': {{betaallink}} variable');

  // Shared PDF (send-invoice edge function) draws the same QR and the link.
  const drawn=[];let squares=0;
  const {edge}=loadEdge({StandardFonts,rgb,PDFDocument:{async create(){const pdf=await PDFDocument.create(),addPage=pdf.addPage.bind(pdf);pdf.addPage=(...a)=>{const p=addPage(...a.map(x=>Array.isArray(x)?Array.from(x):x)),dt=p.drawText.bind(p),dr=p.drawRectangle.bind(p);p.drawText=(t,o)=>{drawn.push(t);return dt(t,o)};p.drawRectangle=o=>{if(o.width<5)squares++;return dr(o)};return p};return pdf}}});
  const data=await page.evaluate(()=>{const i=state.invoices[0];return {company:state.company,customer:getContact(i.customerId),invoice:i,paymentQr:invoicePaymentQr(i),paymentLink:invoicePaymentLink()}});
  const bytes=await edge.pdfBytes(data);
  assert.ok(bytes.length>1000,label+': PDF rendered');
  assert.equal(squares,data.paymentQr.bits.split('').filter(b=>b==='1').length,label+': every dark QR module drawn in the PDF');
  assert.ok(drawn.some(t=>t.includes('Scan met je bank-app')),label+': QR caption in the PDF');
  assert.ok(drawn.some(t=>t.includes('https://tikkie.me/pay/boekuna/abc')),label+': link in the PDF');
  drawn.length=0;squares=0;
  await edge.pdfBytes({...data,paymentQr:{size:21,bits:'2'.repeat(441)},paymentLink:'http://evil'});
  assert.equal(squares,0,label+': invalid QR ignored');
  assert.ok(!drawn.some(t=>t.includes('evil')),label+': non-https link ignored');
  assert.deepEqual(errors,[],label+': page errors');
  console.log('payment qr ('+label+'): ok');
}finally{
  await browser.close();server.close();
}
