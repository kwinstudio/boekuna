import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {PDFDocument} from 'pdf-lib';
import {serveKvkAsset} from './lib/kvk-browser-assets.mjs';

const original=fs.readFileSync(process.env.INVOICE_APP_SOURCE||new URL('../kwinest/index.html',import.meta.url),'utf8');
let appHtml=original.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
const bootstrap=appHtml.lastIndexOf('initAuth();');
appHtml=appHtml.slice(0,bootstrap)+String.raw`
currentUser=TEST_USER;
const stored=localStorage.getItem(userDataKey());
if(stored)state=normalizeState(JSON.parse(stored));
else{
 state=structuredClone(DEFAULT);
 for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
 state.company={...state.company,name:'Invoice QA BV',tradeName:'Invoice QA',email:'qa@example.test',phone:'0101234567',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',invoicePrefix:'2026-',paymentDays:14,kor:false};
 state.contacts=[{id:'c1',type:'customer',name:'QA Klant',email:'customer@example.test',address:'Klantstraat 2',postal:'3012BB',city:'Rotterdam'}];
 state.invoices=[{id:'final',number:'2026-0001',numberManaged:true,numberFinalized:true,status:'sent',customerId:'c1',issueDate:'2026-10-01',supplyDate:'2026-10-01',dueDate:'2026-10-15',taxTreatment:'standard',paymentDays:14,paymentReference:'2026-0001',lines:[{desc:'Werk',qty:1,unit:100,vat:21}],payments:[]}];
 state.meta.nextInvoice=2;save();
}
enterApp();
`+appHtml.slice(bootstrap+'initAuth();'.length);
const server=http.createServer((req,res)=>{
 if(serveKvkAsset(req,res))return;
 if(req.url?.startsWith('/assets/financial-correction.js')){res.writeHead(200,{'content-type':'text/javascript'});return res.end(fs.readFileSync(new URL('../public/assets/financial-correction.js',import.meta.url)))}
 if(req.url?.startsWith('/manifest.webmanifest')){res.writeHead(200,{'content-type':'application/json'});return res.end('{}')}
 res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(appHtml);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const pdf=await PDFDocument.create();pdf.addPage();const pdfBytes=await pdf.save();
const engine=(process.env.BOOKUNA_BROWSER||process.env.BROWSER)==='webkit'?webkit:chromium;
const browser=await engine.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
let pdfCalls=0,providerCalls=0,failPdf=true;
await page.route('**/functions/v1/send-invoice',async route=>{
 const body=route.request().postDataJSON();
 if(body.action!=='render_pdf'){providerCalls++;return route.fulfill({status:410,contentType:'application/json',body:'{"code":"MAILBOX_SEND_DISABLED"}'})}
 pdfCalls++;
 if(failPdf)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Temporary PDF failure"}'});
 return route.fulfill({status:200,contentType:'application/pdf',body:Buffer.from(pdfBytes)});
});
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/app`,{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{
  window.__nativeShares=[];
  Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
  Object.defineProperty(navigator,'share',{configurable:true,value:async data=>window.__nativeShares.push({title:data.title,text:data.text,files:data.files.map(f=>({name:f.name,type:f.type,size:f.size}))})});
 });
 // PDF failure replaces the form: retry must reuse validated composer values.
 await page.evaluate(()=>openSendInvoice('final'));
 await page.locator('#emailHandoffForm').waitFor();
 await page.evaluate(()=>prepareEmailHandoffFromComposer());
 await page.getByRole('heading',{name:'E-mail kon niet worden voorbereid'}).waitFor();
 assert.equal(pdfCalls,1);
 failPdf=false;
 await page.getByRole('button',{name:'Opnieuw proberen'}).click();
 await page.getByRole('heading',{name:'Hoe wilt u versturen?'}).waitFor({timeout:2500});
 assert.equal(pdfCalls,2,'Retry must generate the authoritative PDF again');
 const nativeBefore=await page.evaluate(()=>__boekunaEmailHandoffTestState());
 assert.equal(nativeBefore.file.type,'application/pdf');assert.equal(nativeBefore.file.size,pdfBytes.length);
 const mailto=await page.evaluate(()=>emailHandoffMailtoUrl());
 assert.match(mailto,/^mailto:customer%40example\.test\?subject=/);
 assert.equal(await page.evaluate(()=>state.invoices[0].lastSentAt),undefined);
 await page.evaluate(()=>shareEmailHandoffPdf());
 await page.getByRole('heading',{name:'Hebt u de e-mail verzonden?'}).waitFor();
 assert.equal(await page.evaluate(()=>state.invoices[0].lastSentAt),undefined,'Native share return must await explicit confirmation');
 await page.evaluate(()=>{confirmEmailHandoff('native_share');confirmEmailHandoff('native_share')});
 const delivered=await page.evaluate(()=>structuredClone(state.invoices[0]));
 assert.equal(delivered.sendHistory.length,1);assert.equal(delivered.status,'sent');assert.ok(delivered.lastSentAt);
 await page.reload({waitUntil:'domcontentloaded'});
 assert.deepEqual(await page.evaluate(()=>structuredClone(state.invoices[0])),delivered,'Reload must retain identity, amounts and confirmed delivery');
 // Missing customer email has a concrete relation edit and PDF alternative, no mutation.
 const noEmailBefore=await page.evaluate(()=>{state.contacts[0].email='';save();return JSON.stringify(state.invoices)});
 if(process.env.INVOICE_SCREENSHOTS){fs.mkdirSync('tests/artifacts',{recursive:true})}
 await page.evaluate(()=>openSendInvoice('final'));
 await page.getByRole('button',{name:'Klantgegevens openen'}).waitFor();
 await page.getByRole('button',{name:'PDF / print gebruiken'}).waitFor();
 if(process.env.INVOICE_SCREENSHOTS)await page.screenshot({path:'tests/artifacts/invoice-missing-email-390.png',fullPage:true});
 assert.equal(await page.evaluate(()=>JSON.stringify(state.invoices)),noEmailBefore);
 await page.getByRole('button',{name:'Klantgegevens openen'}).click();
 await page.locator('#contactForm').waitFor();
 await page.evaluate(()=>{closeModal();state.invoices.unshift({...structuredClone(state.invoices[0]),id:'missing-email-draft',number:'CONCEPT-NOEMAIL',numberFinalized:false,status:'draft',lastSentAt:null,sendHistory:[]});save()});
 const noEmailDraftBefore=await page.evaluate(()=>JSON.stringify({invoices:state.invoices,next:state.meta.nextInvoice}));
 await page.evaluate(()=>finalizeDraftAndSend('missing-email-draft'));
 await page.getByRole('button',{name:'Klantgegevens openen'}).waitFor();
 await page.getByRole('button',{name:'PDF / print gebruiken'}).waitFor();
 assert.equal(await page.evaluate(()=>JSON.stringify({invoices:state.invoices,next:state.meta.nextInvoice})),noEmailDraftBefore,'Missing email must not finalize or mark a draft sent');
 await page.evaluate(()=>{closeModal();state.contacts[0].email='customer@example.test';save()});
 // Finalization failure must not expose mail/PDF flow; retry syncs the same record.
 const retryId=await page.evaluate(()=>{
  const source=state.invoices[0];const i={...structuredClone(source),id:'sync-retry',number:'CONCEPT-RETRY',numberFinalized:false,status:'draft',paymentReference:'CONCEPT-RETRY'};
  delete i.lastSentAt;delete i.sendHistory;state.invoices.unshift(i);save();
  window.__realSync=syncCloudStateNow;syncCloudStateNow=async()=>{throw Error('Temporary network failure')};return i.id;
 });
 const beforeSequence=await page.evaluate(()=>state.meta.nextInvoice);
 await page.evaluate(id=>Promise.all([finalizeDraftAndSend(id),finalizeDraftAndSend(id)]),retryId);
 await page.getByRole('heading',{name:'Factuur kon niet definitief worden gemaakt'}).waitFor();
 assert.equal(await page.locator('#emailHandoffForm').count(),0);
 const saved=await page.evaluate(id=>structuredClone(state.invoices.find(x=>x.id===id)),retryId);
 assert.equal(saved.status,'sent');assert.equal(saved.lastSentAt,undefined);
 assert.equal(await page.evaluate(()=>state.meta.nextInvoice),beforeSequence+1);
 await page.evaluate(()=>{syncCloudStateNow=window.__realSync});
 await page.getByRole('button',{name:'Opnieuw proberen'}).click();
 await page.locator('#emailHandoffForm').waitFor();
 assert.equal(await page.evaluate(()=>state.meta.nextInvoice),beforeSequence+1);
 assert.equal(await page.evaluate(id=>state.invoices.filter(x=>x.id===id).length,retryId),1);
 assert.equal(await page.evaluate(id=>state.invoices.find(x=>x.id===id).number,retryId),saved.number);
 await page.evaluate(()=>closeModal());
 await page.reload({waitUntil:'domcontentloaded'});
 assert.deepEqual(await page.evaluate(id=>structuredClone(state.invoices.find(x=>x.id===id)),retryId),saved);
 // Legacy numbered draft is finalized under the same number, never duplicated.
 await page.evaluate(()=>{
  state.invoices.unshift({...structuredClone(state.invoices[0]),id:'numbered-draft',number:'2026-0099',numberFinalized:false,status:'draft',paymentReference:'2026-0099'});save();
 });
 const seq=await page.evaluate(()=>state.meta.nextInvoice);
 await page.evaluate(()=>finalizeDraftAndSend('numbered-draft'));
 await page.locator('#emailHandoffForm').waitFor();
 assert.equal(await page.evaluate(()=>state.invoices.find(x=>x.id==='numbered-draft').number),'2026-0099');
 assert.equal(await page.evaluate(()=>state.meta.nextInvoice),seq);
 assert.equal(providerCalls,0,'Invoice delivery must never invoke provider send');
 assert.deepEqual(errors,[]);
 console.log(`Invoice native retry (${process.env.BOOKUNA_BROWSER||process.env.BROWSER||'chromium'}): PASS (PDF retry, valid PDF, native/mailto, explicit confirmation, missing email, sync failure/double-click/retry, numbered draft, reload)`);
}finally{await browser.close();await new Promise(r=>server.close(r))}
