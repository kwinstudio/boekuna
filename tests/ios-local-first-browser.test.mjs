// iPhone local-first adapter on the real app build, with a fake native bridge in place of
// the Swift code (WKScriptMessageHandlerWithReply). Fictional data only; no backend is contacted.
// Proves: offline drafts instead of failed uploads, resend through the existing upload flow with
// a stable client reference, removal only after the server has the file, backoff on failure,
// scanner hand-off, and that nothing changes without the native bridge.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {buildApp,startAppServer} from './lib/app-fixture.mjs';

buildApp();
const FAKE_BRIDGE=`
window.__native={calls:[],drafts:[],scanner:true,scanResult:null,failNext:''};
window.__online=true;
Object.defineProperty(Navigator.prototype,'onLine',{configurable:true,get(){return window.__online}});
const b64=s=>btoa(s);
window.BoekunaNativeLocalFirst=Object.freeze({version:1});
window.webkit={messageHandlers:{boekunaNative:{postMessage:async function(m){
 const n=window.__native;n.calls.push({...m,base64:m.base64?String(m.base64).length:undefined});
 if(n.failNext){const c=n.failNext;n.failNext='';throw new Error(c)}
 if(m.action==='capabilities')return {version:1,scanner:n.scanner,ocr:true,pdf:true,drafts:true};
 if(m.action==='scan')return n.scanResult;
 if(m.action==='draftSave'){const dup=n.drafts.find(d=>d.userId===m.userId&&d.base64===m.base64);if(dup)return dup.meta;const id='00000000-0000-4000-8000-'+String(n.drafts.length+1).padStart(12,'0');const meta={id,clientRef:m.clientRef||('ios-draft-'+id),name:m.name,mimeType:m.mimeType,size:atob(m.base64).length,kind:m.kind,attempts:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),ocrCharacters:12,pageCount:1};n.drafts.push({userId:m.userId,base64:m.base64,meta});return meta}
 const mine=n.drafts.filter(d=>d.userId===m.userId);
 if(m.action==='draftList')return mine.map(d=>d.meta);
 const d=mine.find(x=>x.meta.id===m.id);
 if(m.action==='draftRead'){if(!d)throw new Error('DRAFT_NOT_FOUND');return {meta:d.meta,base64:d.base64}}
 if(m.action==='draftText')return {text:'Totaal 121,00'};
 if(m.action==='draftAttempt'){d.meta.attempts++;d.meta.updatedAt=new Date().toISOString();d.meta.lastError=m.error;return d.meta}
 if(m.action==='draftDelete'){n.drafts=n.drafts.filter(x=>x!==d);return {deleted:true}}
 if(m.action==='draftClear'){n.drafts=n.drafts.filter(x=>x.userId!==m.userId);return {deleted:true}}
 throw new Error('UNKNOWN_ACTION')
}}}};`;

// Replaces only the network edges of the existing upload flow; persistSelectedDocument itself runs.
const FAKE_BACKEND=`
window.__backend={uploads:[],enqueued:[],rows:new Map(),uploadError:''};
uploadPersistentDocumentBlob=async(file,path,item)=>{const b=window.__backend;b.uploads.push({path,draft:item.offlineDraftId||''});if(b.uploadError){const c=b.uploadError;throw createUploadError(c,'',c==='DUPLICATE_UPLOAD'?409:0,{state:'not_saved'})}return true};
getSupabase=async()=>{const b=window.__backend;let ref='';const q={select(){return q},eq(k,v){if(k==='client_ref')ref=v;return q},maybeSingle:async()=>({data:b.rows.get(ref)||null}),insert(row){b.rows.set(row.client_ref,{id:'doc-'+row.client_ref,client_ref:row.client_ref,storage_path:row.storage_path});return {select(){return {single:async()=>({data:b.rows.get(row.client_ref)})}}}}};return {from:()=>q,storage:{from:()=>({remove:async()=>({})})}}};
invokeDocumentProcessing=async(action,payload)=>{if(action==='enqueue'){window.__backend.enqueued.push(payload.client_ref);return {job:{id:'job-'+payload.client_ref,state:'queued'}}}return {}};
fetchDocumentProcessingJobs=async()=>[];
`;

const {server,url}=await startAppServer({headBoot:FAKE_BRIDGE,extraBoot:FAKE_BACKEND});
const plainApp=await startAppServer();
const name=process.env.BOOKUNA_BROWSER==='webkit'?'webkit':'chromium';
const browser=await (name==='webkit'?webkit:chromium).launch();
const errors=[];
try{
 const page=await (await browser.newContext({viewport:{width:390,height:844}})).newPage();
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(url);
 await page.waitForFunction(()=>document.getElementById('mainApp')?.style.display!=='none');
 assert.equal(await page.evaluate(()=>window.BoekunaLocalFirst.available()&&localFirstReady()),true,'bridge detected for the signed-in user');

 await page.evaluate(async()=>{await initLocalFirstForUser();await navigate('documents')});
 assert.equal(await page.locator('.local-first-panel button',{hasText:'Scannen'}).count(),1,'scanner offered when the iPhone supports it');

 // Offline: the file becomes a draft on the iPhone; nothing is uploaded.
 await page.evaluate(async()=>{window.__online=false;const f=new File(['%PDF-1.4 bon'],'bon.pdf',{type:'application/pdf'});await startPersistentDocumentProcessingQueue([f],'purchase',{smart:true})});
 let state=await page.evaluate(()=>({drafts:window.__native.drafts.map(d=>({...d.meta,userId:d.userId})),uploads:window.__backend.uploads.length,user:currentUser.id,panel:document.querySelector('.local-first-panel')?.innerText||''}));
 assert.equal(state.drafts.length,1);assert.equal(state.drafts[0].userId,state.user,'draft belongs to the signed-in account');
 assert.equal(state.drafts[0].kind,'purchase');assert.equal(state.uploads,0,'no upload attempt while offline');
 assert.match(state.panel,/1 document offline bewaard/);

 // The same file twice stays one draft.
 await page.evaluate(async()=>{const f=new File(['%PDF-1.4 bon'],'bon.pdf',{type:'application/pdf'});await startPersistentDocumentProcessingQueue([f],'purchase',{smart:true})});
 assert.equal(await page.evaluate(()=>window.__native.drafts.length),1,'duplicate draft prevented');

 // Back online, upload fails: draft kept, attempt recorded, no retry before the backoff.
 await page.evaluate(async()=>{window.__online=true;window.__backend.uploadError='NETWORK_ERROR';await syncOfflineDrafts()});
 state=await page.evaluate(()=>({meta:window.__native.drafts[0]?.meta,due:window.BoekunaLocalFirst.retryDue(window.__native.drafts[0]?.meta),page}));
 assert.equal(state.meta.attempts,1,'failed send recorded');assert.equal(state.due,false,'backoff before next try');
 assert.equal(state.page,'documents');
 const uploadsBefore=await page.evaluate(()=>window.__backend.uploads.length);
 await page.evaluate(()=>syncOfflineDrafts());
 assert.equal(await page.evaluate(()=>window.__backend.uploads.length),uploadsBefore,'no resend inside the backoff window');

 // Resend: the interrupted attempt left the file in storage (409); the draft's client reference is reused,
 // the existing flow creates the job, and only then is the draft removed. No navigation away from the current page.
 await page.evaluate(async()=>{await navigate('dashboard');window.__backend.uploadError='DUPLICATE_UPLOAD';await syncOfflineDrafts(true)});
 state=await page.evaluate(()=>({drafts:window.__native.drafts.length,enqueued:window.__backend.enqueued,clientRef:window.__backend.uploads.at(-1),page,deleted:window.__native.calls.filter(c=>c.action==='draftDelete').length}));
 assert.deepEqual(state.enqueued,[state.clientRef.path.split('/')[1].replace(/-bon\.pdf$/,'')],'job created for the draft client reference');
 assert.match(state.enqueued[0],/^ios-draft-/);
 assert.equal(state.drafts,0,'draft removed after the server received it');assert.equal(state.deleted,1);
 assert.equal(state.page,'dashboard','background resend does not navigate');

 // Online upload that breaks off on the network: kept offline instead of failing, with the same client reference.
 await page.evaluate(async()=>{window.__backend.uploadError='NETWORK_ERROR';const f=new File(['%PDF-1.4 tweede'],'tweede.pdf',{type:'application/pdf'});await startPersistentDocumentProcessingQueue([f],'auto',{smart:true})});
 state=await page.evaluate(()=>({drafts:window.__native.drafts.map(d=>d.meta),item:documentProcessingSession.items[0]}));
 assert.equal(state.drafts.length,1,'interrupted upload kept as draft');assert.equal(state.item.offlineSaved,true);
 assert.equal(state.item.message,'Offline bewaard');assert.notEqual(state.item.state,'failed');

 // Gelezen tekst is shown as unconfirmed.
 await page.evaluate(async()=>{await navigate('documents');await openOfflineDrafts()});
 await page.getByRole('button',{name:'Gelezen tekst'}).click();
 await page.waitForSelector('text=Nog niet gecontroleerd');
 await page.evaluate(()=>closeModal());

 // Scanner hand-off: the scanned PDF goes into the normal document queue.
 await page.evaluate(async()=>{
  window.__queued=[];startDocumentProcessingQueue=async(files,kind,opts)=>{window.__queued.push({name:files[0].name,type:files[0].type,size:files[0].size,kind,smart:opts.smart})};
  window.__native.scanResult={name:'Scan 2026-10-08 21.30.pdf',mimeType:'application/pdf',pages:2,base64:btoa('%PDF-1.4 scan')};
  await scanDocumentWithIPhone();
  window.__native.scanResult={cancelled:true};await scanDocumentWithIPhone();
 });
 assert.deepEqual(await page.evaluate(()=>window.__queued),[{name:'Scan 2026-10-08 21.30.pdf',type:'application/pdf',size:13,kind:'auto',smart:true}],'one scan queued, cancel queues nothing');
 await page.evaluate(async()=>{window.__native.failNext='CAMERA_PERMISSION_DENIED';await scanDocumentWithIPhone()});
 await page.waitForSelector('text=Instellingen › Boekuna › Camera');

 // Account deletion clears this account's drafts only.
 await page.evaluate(async()=>{window.__native.drafts.push({userId:'other-account-123',base64:'eA==',meta:{id:'x'}});await window.BoekunaLocalFirst.clearDrafts(currentUser.id)});
 assert.deepEqual(await page.evaluate(()=>window.__native.drafts.map(d=>d.userId)),['other-account-123']);

 // Without the native bridge (web, Android, iOS build with the flag off): nothing changes.
 const plain=await (await browser.newContext({viewport:{width:390,height:844}})).newPage();
 plain.on('pageerror',e=>errors.push(String(e)));
 await plain.goto(plainApp.url);
 await plain.waitForFunction(()=>document.getElementById('mainApp')?.style.display!=='none');
 assert.equal(await plain.evaluate(()=>window.BoekunaLocalFirst.available()||localFirstReady()),false);
 await plain.evaluate(()=>navigate('documents'));
 assert.equal(await plain.locator('.local-first-panel').count(),0,'no iPhone panel on the web');
 assert.equal(await plain.evaluate(async()=>{await initLocalFirstForUser();await syncOfflineDrafts();return offlineDraftList.length}),0);

 assert.deepEqual(errors,[],'no page errors');
 console.log('PASS iOS local-first adapter ('+name+'): offline drafts, resend, backoff, duplicates, scanner, no-bridge no-op');
}finally{await browser.close();server.close();plainApp.server.close()}
