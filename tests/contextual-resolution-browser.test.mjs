import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';
import {PDFDocument} from 'pdf-lib';

execFileSync(process.execPath,['scripts/build-app.mjs']);
const boot=`currentUser={...TEST_USER};
if(localStorage.getItem(userDataKey()))state=load();else{
state=structuredClone(DEFAULT);
state.company={...state.company,name:'Context BV',email:'context@example.test',address:'Straat 1',postal:'1234AA',city:'Utrecht',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300'};
state.contacts=[{id:'customer',type:'customer',name:'Context klant',email:'customer@example.test',address:'Straat 2',postal:'1234AB',city:'Utrecht'}];
state.invoices=[{id:'invoice',number:'2026-0042',customerId:'customer',status:'sent',issueDate:'2026-09-01',dueDate:'2026-09-30',taxTreatment:'standard',lines:[{desc:'Advies',qty:1,unit:100,vat:21}],payments:[]}];
state.expenses=[{id:'expense',vendor:'Context leverancier',date:'2026-09-01',exVat:50,vatRate:21,category:'Inkoop',paymentMethod:'Bank'}];
state.transactions=[{id:'bank',description:'Exacte banktransactie',date:'2026-09-02',amount:121,status:'unmatched',matchSuggestion:{type:'invoice',id:'invoice',score:60,reasons:['Referentie komt overeen']}}];
state.documents=[{id:'upload',name:'Exact brondocument.pdf',type:'Upload',date:'2026-09-01',fileId:'original'},{id:'review',name:'Exact controle.pdf',type:'Document',date:'2026-09-01',fileId:'review-original',verification:{status:'needs_review',method:'manual-review'}}];
state.bookings=[{id:'booking',customerId:'customer',service:'Exacte afspraak',status:'confirmed',date:today(),time:'10:00',price:100,vat:21,reminderSent:false}];save();}
documentProcessingJobs=[];documentProcessingInitialized=true;enterApp();`;
const html=fs.readFileSync('dist/app/index.html','utf8').replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;').replace(/initAuth\(\);(?![\s\S]*initAuth\(\);)/,boot);
const server=http.createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname;if(path.startsWith('/assets/')){const f='dist/app'+path;if(fs.existsSync(f)){res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'image/svg+xml');return res.end(fs.readFileSync(f))}res.writeHead(404);return res.end()}res.setHeader('Content-Type','text/html');res.end(html)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const name=process.env.BOOKUNA_BROWSER==='webkit'?'webkit':'chromium',browser=await (name==='webkit'?webkit:chromium).launch(),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(3000);
const url='http://127.0.0.1:'+server.address().port;
async function close(){await page.locator('#modalRoot .modal-close').click();await page.locator('[role=dialog]').waitFor({state:'detached'})}
async function control(key){await page.evaluate(()=>navigate('control'));await page.locator('[data-control-key='+JSON.stringify(key)+'] button').click()}
try{
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor();
 const financialBefore=await page.evaluate(()=>({net:invoiceNet(state.invoices[0]),vat:invoiceVat(state.invoices[0]),gross:invoiceGross(state.invoices[0]),expense:expenseGross(state.expenses[0])}));
 const countBefore=await page.evaluate(()=>attentionRows().length);
 await control('document-upload');assert.match(await page.locator('[role=dialog]').innerText(),/Exact brondocument.pdf/);
 assert.equal(await page.evaluate(()=>page),'control');await close();assert.equal(await page.evaluate(()=>attentionRows().length),countBefore,'Opening or cancelling cannot resolve a problem');
 await control('document-upload');await page.selectOption('#contextDocumentTarget','invoice:invoice');await page.getByRole('button',{name:'Koppeling opslaan',exact:true}).click();await page.locator('[role=dialog]').waitFor({state:'detached'});
 assert.equal(await page.locator('[data-control-key="document-upload"]').count(),0);assert.equal(await page.evaluate(()=>attentionRows().length),countBefore-1);
 await page.reload({waitUntil:'domcontentloaded'});assert.deepEqual(await page.evaluate(()=>({d:state.documents.find(d=>d.id==='upload').linkedId,i:state.invoices[0].documentId})),{d:'invoice',i:'upload'});
 assert.deepEqual(await page.evaluate(()=>({net:invoiceNet(state.invoices[0]),vat:invoiceVat(state.invoices[0]),gross:invoiceGross(state.invoices[0]),expense:expenseGross(state.expenses[0])})),financialBefore,'Document linking cannot change financial values');
 await page.evaluate(()=>{window.__rollbackState=structuredClone(state);state.documents.push({id:'fail-upload',name:'Mislukt.pdf',type:'Upload',fileId:'fail-file'});window.__originalSync=syncCloudStateNow;syncCloudStateNow=async()=>{state.services.push({id:'concurrent',name:'Andere wijziging'});throw new Error('Sync test failure')};navigate('control')});
 await control('document-fail-upload');await page.selectOption('#contextDocumentTarget','expense:expense');await page.getByRole('button',{name:'Koppeling opslaan',exact:true}).click();await page.waitForFunction(()=>state.documents.find(d=>d.id==='fail-upload')?.linkedId===undefined);
 assert.equal(await page.evaluate(()=>state.expenses[0].documentId),undefined);assert.equal(await page.evaluate(()=>state.services.some(s=>s.id==='concurrent')),true,'Failure rollback preserves unrelated edits');await close();await page.evaluate(()=>{syncCloudStateNow=window.__originalSync;state=window.__rollbackState;save()});
 const originalPdf=await PDFDocument.create();originalPdf.addPage();const bytes=Buffer.from(await originalPdf.save());
 await page.evaluate(()=>{state.documents.push({id:'metadata',name:'Origineel ontbreekt.pdf',type:'Upload',date:today()});save()});
 await control('document-metadata');await page.selectOption('#contextDocumentTarget','expense:expense');await page.getByRole('button',{name:'Koppeling opslaan',exact:true}).click();assert.equal(await page.locator('[role=dialog]').count(),1);assert.equal(await page.evaluate(()=>state.documents.find(d=>d.id==='metadata').linkedId),undefined);
 if(name==='chromium'){
  await page.locator('#contextDocumentFile').setInputFiles({name:'Origineel.pdf',mimeType:'application/pdf',buffer:bytes});await page.getByRole('button',{name:'Koppeling opslaan',exact:true}).click();await page.locator('[role=dialog]').waitFor({state:'detached'});await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.evaluate(()=>state.expenses[0].documentId),'metadata');assert.equal(await page.evaluate(async()=>!!(await getLegacyStoredFile(state.documents.find(d=>d.id==='metadata').fileId))?.blob),true,'Context upload persists the actual original file');
 }else{await close();await page.evaluate(()=>{state.documents=state.documents.filter(d=>d.id!=='metadata');save()})}
 await control('document-review');assert.match(await page.locator('[role=dialog]').innerText(),/Exact controle.pdf/);await close();assert.ok(await page.evaluate(()=>attentionRows().some(r=>r.key==='document-review')),'Document review stays open until actual resolution');
 await page.evaluate(()=>{documentProcessingJobs=[{id:'failed-job',client_ref:'failed-file',file_name:'Exact mislukt.pdf',state:'failed',attempt:1,max_attempts:3,last_error_code:'PROCESSOR_UNAVAILABLE'}];render()});
 await control('job-failed-job');assert.match(await page.locator('[role=dialog]').innerText(),/Exact mislukt.pdf/);assert.ok(await page.getByRole('button',{name:'Opnieuw proberen',exact:true}).isVisible());await close();await page.evaluate(()=>documentProcessingJobs=[]);
 // Pending review jobs and failed jobs route by source ID, not a broad documents page.
 const route=await page.evaluate(()=>{documentProcessingJobs=[{id:'review-job',client_ref:'r',file_name:'Bron.pdf',state:'review_required'}];let exact='';const old=openPersistentDocumentReview;openPersistentDocumentReview=id=>exact=id;openControlItem('job-review-job');openPersistentDocumentReview=old;documentProcessingJobs=[];return exact});assert.equal(route,'review-job');
 await control('bank-bank');assert.match(await page.locator('[role=dialog]').innerText(),/Exacte banktransactie/);assert.match(await page.locator('[role=dialog]').innerText(),/Mogelijke match/);assert.equal(await page.locator('#matchSelect').inputValue(),'invoice:invoice');
 await page.getByRole('button',{name:'Voorstel weigeren',exact:true}).click();await page.locator('[role=dialog]').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>state.transactions[0].status),'unmatched');
 await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.evaluate(()=>state.transactions[0].matchSuggestion),undefined);await control('bank-bank');await page.selectOption('#matchSelect','invoice:invoice');await page.locator('[role=dialog]').getByRole('button',{name:'Koppelen',exact:true}).click();assert.equal(await page.evaluate(()=>state.transactions[0].matchId),'invoice');
 await control('booking-booking');assert.match(await page.locator('[role=dialog]').innerText(),/Exacte afspraak/);await close();assert.equal(await page.evaluate(()=>state.bookings[0].reminderSent),false);
 await control('booking-booking');await page.getByRole('button',{name:'Herinnering verstuurd',exact:true}).click();await page.locator('[role=dialog]').waitFor({state:'detached'});await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.evaluate(()=>state.bookings[0].reminderSent),true);
 // Every health source has stable IDs, including grouped duplicates and customer addresses.
 const health=await page.evaluate(()=>{state.invoices.push({...structuredClone(state.invoices[0]),id:'duplicate'});state.invoices[0].dueDate='2026-08-01';state.expenses[0].exVat=-50;state.contacts[0].address='';return dataHealthIssues().map(h=>({key:h.key,type:h.sourceType,ids:h.sourceIds}))});
 assert.ok(health.some(h=>h.key==='dates-invoice'&&h.ids[0]==='invoice'));assert.ok(health.some(h=>h.key==='duplicate-2026-0042'&&h.ids.join(',')==='invoice,duplicate'));assert.ok(health.some(h=>h.key==='negative-expense'&&h.ids[0]==='expense'));assert.ok(health.some(h=>h.key==='contact-addresses'&&h.ids[0]==='customer'));
 const extraHealth=await page.evaluate(()=>{state.invoices.push({...structuredClone(state.invoices[0]),id:'zero',number:'ZERO',lines:[],payments:[]},{...structuredClone(state.invoices[0]),id:'overpaid',number:'OVERPAID',payments:[{id:'payment',amount:500,date:today()}]});return dataHealthIssues().map(h=>({key:h.key,ids:h.sourceIds}))});assert.ok(extraHealth.some(h=>h.key==='zero-zero'&&h.ids[0]==='zero'));assert.ok(extraHealth.some(h=>h.key==='overpayment-overpaid'&&h.ids[0]==='overpaid'));
 await control('health-dates-invoice');assert.match(await page.locator('[role=dialog]').innerText(),/onlogische datums/);await page.getByRole('button',{name:/2026-0042.*factuur bekijken/}).click();assert.match(await page.locator('#modalTitle').innerText(),/2026-0042/);await close();
 await control('health-duplicate-2026-0042');assert.equal(await page.getByRole('button',{name:/2026-0042.*factuur bekijken/}).count(),2);await close();
 await control('health-contact-addresses');await page.getByRole('button',{name:'Context klant',exact:true}).click();assert.equal(await page.locator('#contactName').inputValue(),'Context klant');await close();
 await page.evaluate(()=>{state=load();render();openDashboardAttention('documents')});assert.match(await page.locator('[role=dialog]').innerText(),/Exact controle.pdf/);await close();
 const stale=await page.evaluate(()=>{state.documents=state.documents.filter(d=>d.id!=='review');openControlItem('document-review');return document.querySelector('[role=dialog]')===null});assert.equal(stale,true);
 // Report preview exits and restores focus on desktop and mobile layouts.
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:844});await page.evaluate(()=>navigate('reports'));const trigger=page.getByRole('button',{name:/PDF/}).first();await trigger.focus();await trigger.click();await page.locator('#reportPreviewFrame').waitFor();
  assert.equal(await page.getByRole('button',{name:'Sluiten',exact:true}).evaluate(el=>el===document.activeElement),true);
  const exit=page.getByRole('button',{name:'Terug naar rapportages',exact:true});const box=await exit.boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=width+1&&box.y+box.height<=844,'Report exit remains visible at '+width);
  const report=page.frameLocator('#reportPreviewFrame');assert.match(await report.locator('body').innerText(),/Boekhoudrapport/);
  await page.locator('#reportPreviewFrame').evaluate(frame=>{frame.contentWindow.__printed=0;frame.contentWindow.print=()=>frame.contentWindow.__printed++});await page.getByRole('button',{name:'Print / bewaar als PDF',exact:true}).click();assert.equal(await page.locator('#reportPreviewFrame').evaluate(frame=>frame.contentWindow.__printed),1);
  await page.getByRole('button',{name:'Sluiten',exact:true}).focus();
  if([320,390,1440].includes(width)){await page.waitForFunction(()=>!document.querySelector('.toast'));fs.mkdirSync('tests/artifacts/contextual-resolution',{recursive:true});await page.screenshot({path:'tests/artifacts/contextual-resolution/report-'+name+'-'+width+'.png'})}
  await page.keyboard.press('Escape');await page.locator('[role=dialog]').waitFor({state:'detached'});await page.waitForFunction(()=>document.activeElement?.textContent?.includes('PDF'));
  await trigger.click();await page.locator('#reportPreviewFrame').waitFor();await exit.click();await page.locator('[role=dialog]').waitFor({state:'detached'});await page.waitForFunction(()=>!history.state?.boekunaReportPreview);
  await trigger.click();await page.locator('#reportPreviewFrame').waitFor();await page.goBack();await page.locator('[role=dialog]').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>page),'reports');await page.waitForFunction(()=>document.activeElement?.textContent?.includes('PDF'));
  await trigger.click();await page.locator('#reportPreviewFrame').waitFor();await report.getByRole('heading',{name:'Boekhoudrapport',exact:true}).waitFor();await report.locator('body').click();await page.keyboard.press('Escape');await page.locator('[role=dialog]').waitFor({state:'detached'});await page.waitForFunction(()=>!history.state?.boekunaReportPreview);
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>navigate('settings'));
 const zone=page.locator('.settings-danger-group');assert.ok(await zone.getByRole('button',{name:'Administratie wissen',exact:true}).isVisible());assert.ok(await zone.getByRole('button',{name:'Account verwijderen',exact:true}).isVisible());const logout=page.getByRole('button',{name:'Uitloggen',exact:true});assert.ok(await logout.isVisible());assert.equal(await logout.evaluate(el=>el.classList.contains('danger')),false);assert.equal(await zone.getByRole('button',{name:'Uitloggen',exact:true}).count(),0);
 await zone.getByRole('button',{name:'Administratie wissen',exact:true}).click();const destructive=page.getByRole('button',{name:'Administratie definitief wissen',exact:true});assert.equal(await destructive.isDisabled(),true);
 for(const value of ['wis administratie','WIS ADMINISTRATIE ','WIS']){await page.fill('#resetAdministrationConfirmation',value);assert.equal(await destructive.isDisabled(),true)}
 await page.evaluate(()=>confirmResetDemo());assert.ok(await page.evaluate(()=>state.invoices.length)>0,'Calling handler cannot bypass typed confirmation');await page.keyboard.press('Escape');assert.ok(await page.evaluate(()=>state.invoices.length)>0,'Cancelling leaves data intact');
 await zone.getByRole('button',{name:'Account verwijderen',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Definitief verwijderen',exact:true}).isDisabled(),true);await page.locator('[name=confirm]').fill('VERWIJDER');assert.equal(await page.getByRole('button',{name:'Definitief verwijderen',exact:true}).isDisabled(),false);await close();
 await zone.getByRole('button',{name:'Administratie wissen',exact:true}).click();await page.fill('#resetAdministrationConfirmation','WIS ADMINISTRATIE');assert.equal(await destructive.isDisabled(),false);await page.evaluate(()=>{window.__beforeReset=JSON.stringify(state);window.__sync=syncCloudStateNow;syncCloudStateNow=async()=>{throw new Error('Reset persistence failure')}});await destructive.click();await page.waitForFunction(()=>JSON.stringify(state)===window.__beforeReset);assert.ok(await page.evaluate(()=>state.invoices.length)>0);await close();await page.evaluate(()=>syncCloudStateNow=window.__sync);
 await zone.getByRole('button',{name:'Administratie wissen',exact:true}).click();await page.fill('#resetAdministrationConfirmation','WIS ADMINISTRATIE');await destructive.click();await page.locator('[role=dialog]').waitFor({state:'detached'});await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.evaluate(()=>state.invoices.length),0);assert.equal(await page.evaluate(()=>state.company.name),'Context BV');
 assert.deepEqual(errors,[]);console.log('Contextual resolution / report preview / typed reset: PASS '+name+' (production build, source IDs, persisted reload, failure rollback, four widths, iframe Escape and browser Back)');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
