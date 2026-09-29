(function(){
'use strict';
if(typeof startDocumentProcessingQueue!=='function'||typeof getSupabase!=='function')return;

var State=globalThis.BookunaDocumentProcessingState;
if(!State)return;
var S=State.STATES;
var TERMINAL=new Set(State.TERMINAL);
var ACTIVE_SERVER=new Set([S.QUEUED,S.PROCESSING,S.VALIDATING]);
var FINANCIAL_TYPES=new Set(['purchase_invoice','sales_invoice','sale_invoice','credit_invoice','receipt','invoice']);
var backgroundJobs=[];
var backgroundUploads=new Map();
var backgroundExpected=new Map();
var backgroundWatched=new Set();
var backgroundNotified=new Set();
var backgroundChannel=null;
var backgroundPollTimer=null;
var backgroundPollDelay=6000;
var backgroundUserId='';
var tusModulePromise=null;
var initialJobsLoaded=false;

var foregroundStartDocumentProcessingQueue=startDocumentProcessingQueue;
var foregroundRenderDocuments=renderDocuments;
var foregroundRender=render;
var foregroundEnterApp=enterApp;
var foregroundLogoutUser=logoutUser;
var foregroundSavePdfInvoiceImport=savePdfInvoiceImport;

function nowIso(){return new Date().toISOString()}
function isTerminalState(x){return TERMINAL.has(String(x||''))}
function isActiveState(x){return ACTIVE_SERVER.has(String(x||''))}
function isFinancialAnalysis(a){return FINANCIAL_TYPES.has(String(a&&a.documentType||''))}
function shortFileName(v){return String(v||'document').slice(0,260)}
function processingStatusText(item){
  var st=String(item&&item.state||'');
  if(st===S.SELECTED)return 'Wacht';
  if(st===S.UPLOADING)return item.uploadPercent==null?'Uploaden…':'Uploaden '+item.uploadPercent+'%';
  if(st===S.RECEIVED)return 'Bestand ontvangen';
  if(st===S.QUEUED)return 'Wacht';
  if(st===S.PROCESSING)return 'Wordt verwerkt';
  if(st===S.VALIDATING)return 'Bedragen controleren';
  if(st===S.READY)return 'Klaar';
  if(st===S.REVIEW_REQUIRED)return 'Controle nodig';
  if(st===S.FAILED)return 'Kon niet verwerkt worden';
  return 'Wacht';
}
function processingIcon(item){
  var st=String(item&&item.state||'');
  if(st===S.READY)return '✓';
  if(st===S.REVIEW_REQUIRED)return '!';
  if(st===S.FAILED)return '×';
  if(st===S.PROCESSING||st===S.VALIDATING||st===S.UPLOADING)return '';
  return '○';
}
function processingErrorText(item){
  var code=String(item&&item.error_code||item&&item.errorCode||item&&item.error&&item.error.publicCode||item&&item.error&&item.error.code||'');
  if(code==='DOCUMENT_IMAGE_UNREADABLE')return 'Deze afbeelding is onvoldoende leesbaar.';
  if(code==='DOCUMENT_PDF_UNREADABLE')return 'Deze PDF kon niet betrouwbaar worden gelezen.';
  if(code==='DOCUMENT_TOO_LARGE')return 'Dit bestand is te groot om te verwerken.';
  if(code==='DOCUMENT_UNSUPPORTED_TYPE')return 'Dit bestandstype wordt niet ondersteund.';
  if(code==='RATE_LIMITED')return 'De verwerking is tijdelijk druk. Probeer dit document opnieuw.';
  if(code==='PROCESSING_TIMEOUT')return 'De verwerking duurde te lang. Probeer dit document opnieuw.';
  if(code==='DOCUMENT_NOT_FOUND')return 'Het ontvangen bronbestand kon niet worden gevonden.';
  if(code==='NETWORK_ERROR')return 'De verbinding werd onderbroken.';
  return 'Dit document kon technisch niet worden verwerkt.';
}
function combinedItems(){
  var rows=backgroundJobs.slice();
  backgroundUploads.forEach(function(upload){
    if(!rows.some(function(job){return job.client_ref===upload.clientRef}))rows.push({
      id:'local:'+upload.clientRef,
      client_ref:upload.clientRef,
      batch_id:upload.batchId,
      file_name:upload.fileName,
      mime_type:upload.mimeType,
      size_bytes:upload.size,
      requested_kind:upload.kind,
      state:upload.state,
      uploadPercent:upload.uploadPercent,
      uploadLoaded:upload.uploadLoaded,
      uploadTotal:upload.uploadTotal,
      error:upload.error,
      local:true,
      created_at:upload.createdAt,
      updated_at:upload.updatedAt
    });
  });
  return rows;
}
function batchItems(batchId){
  return combinedItems().filter(function(x){return x.batch_id===batchId}).sort(function(a,b){
    return String(a.created_at||'').localeCompare(String(b.created_at||''));
  });
}
function latestBatchIds(){
  var map=new Map();
  combinedItems().forEach(function(x){
    var key=String(x.batch_id||'');if(!key)return;
    var ts=Date.parse(x.updated_at||x.created_at||0)||0;
    map.set(key,Math.max(map.get(key)||0,ts));
  });
  return Array.from(map.entries()).sort(function(a,b){return b[1]-a[1]}).map(function(x){return x[0]});
}
function batchCounts(rows){return State.batchCounts(rows)}
function batchAllReceived(rows){
  return rows.length>0&&rows.every(function(x){return ![S.SELECTED,S.UPLOADING].includes(String(x.state||''))});
}
function batchSummary(rows){
  var c=batchCounts(rows);
  if(!c.total)return '';
  if(c.terminal<c.total)return c.terminal+' van '+c.total+' verwerkt';
  var s=c.total+' documenten verwerkt';
  if(c.reviewRequired)s+=' · '+c.reviewRequired+' '+(c.reviewRequired===1?'heeft':'hebben')+' controle nodig';
  if(c.failed)s+=' · '+c.failed+' '+(c.failed===1?'kon':'konden')+' niet worden verwerkt';
  return s;
}
function activeUploadCount(){
  var n=0;backgroundUploads.forEach(function(x){if(x.state===S.UPLOADING)n++});return n;
}
function unresolvedCount(){
  var n=backgroundJobs.filter(function(x){return x.state===S.REVIEW_REQUIRED||x.state===S.FAILED}).length;
  backgroundUploads.forEach(function(x){if(x.state===S.FAILED)n++});
  return n;
}
function activeCount(){
  var n=backgroundJobs.filter(function(x){return isActiveState(x.state)}).length;
  backgroundUploads.forEach(function(x){if([S.SELECTED,S.UPLOADING,S.RECEIVED].includes(x.state))n++});
  return n;
}
function ensureGlobalUi(){
  var actions=document.querySelector('#mainApp .top-actions');
  if(actions&&!document.getElementById('documentProcessingGlobal')){
    var btn=document.createElement('button');
    btn.type='button';btn.id='documentProcessingGlobal';btn.className='document-processing-global';
    btn.setAttribute('aria-label','Documentverwerking bekijken');
    btn.onclick=openDocumentProcessingStatusPanel;
    var cloud=document.getElementById('cloudSyncBadge');
    actions.insertBefore(btn,cloud||actions.firstChild);
  }
  var nav=document.querySelector('.nav-item[data-page="documents"]');
  if(nav&&!document.getElementById('documentAttentionBadge')){
    var badge=document.createElement('span');badge.id='documentAttentionBadge';badge.className='document-attention-badge';
    badge.setAttribute('aria-label','Documenten die aandacht nodig hebben');nav.appendChild(badge);
  }
}
function indicatorBatch(){
  var ids=latestBatchIds();
  for(var i=0;i<ids.length;i++){
    var rows=batchItems(ids[i]);
    if(rows.some(function(x){return !isTerminalState(x.state)}))return rows;
  }
  return [];
}
function updateGlobalUi(){
  ensureGlobalUi();
  var btn=document.getElementById('documentProcessingGlobal');
  var badge=document.getElementById('documentAttentionBadge');
  var active=activeCount(),attention=unresolvedCount();
  if(btn){
    if(active){
      var rows=indicatorBatch(),c=batchCounts(rows);
      btn.classList.add('is-visible');
      btn.innerHTML='<span class="document-processing-spinner" aria-hidden="true"></span><span class="document-processing-global-label">Documenten</span><span>'+esc(c.terminal+'/'+c.total)+'</span>';
      btn.setAttribute('aria-label','Documenten verwerken: '+c.terminal+' van '+c.total+' verwerkt');
    }else{
      btn.classList.remove('is-visible');btn.innerHTML='';
    }
  }
  if(badge){
    badge.textContent=attention?String(attention):'';
    badge.classList.toggle('is-visible',attention>0);
  }
}
function schedulePageRefresh(){
  updateGlobalUi();
  if(page==='documents')render();
}
function statusRowHtml(item,compact){
  var st=String(item.state||''),icon=processingIcon(item),cls=st;
  var sub='';
  if(st===S.REVIEW_REQUIRED)sub=String(item.review_message||'Controleer de gemarkeerde gegevens.');
  else if(st===S.FAILED)sub=processingErrorText(item);
  else if(st===S.RECEIVED)sub='Het originele bestand staat veilig bij Boekuna.';
  else if(st===S.QUEUED)sub='Dit document wacht op verwerking.';
  else if(st===S.PROCESSING)sub='Het document wordt gelezen.';
  else if(st===S.VALIDATING)sub='Bedragen en btw worden gecontroleerd.';
  else if(st===S.READY)sub='De verwerking is afgerond.';
  var progress='';
  if(st===S.UPLOADING){
    var pct=item.uploadPercent==null?null:Number(item.uploadPercent);
    var val=pct==null?0:Math.max(0,Math.min(100,pct));
    progress='<div class="document-job-upload-progress"><progress max="100" value="'+val+'" aria-label="Uploadvoortgang '+esc(item.file_name||'document')+'"></progress><small>'+(pct==null?'Uploaden…':pct+'%')+'</small></div>';
  }
  var actions='';
  if(!compact){
    if(st===S.READY)actions='<button class="btn small document-job-action" onclick="openBackgroundDocumentJob(\''+esc(item.id)+'\')">Bekijken</button>';
    if(st===S.REVIEW_REQUIRED)actions='<button class="btn small primary document-job-action" onclick="openBackgroundDocumentJob(\''+esc(item.id)+'\')">Controleren</button>';
    if(st===S.FAILED){
      if(item.local){
        actions='<button class="btn small primary document-job-action" onclick="retryBackgroundUpload(\''+esc(item.client_ref)+'\')">Opnieuw proberen</button><button class="btn small document-job-action" onclick="chooseBackgroundReplacement(\''+esc(item.id)+'\')">Nieuwe foto kiezen</button>';
      }else{
        actions=(item.error_retryable!==false?'<button class="btn small primary document-job-action" onclick="retryBackgroundDocumentJob(\''+esc(item.id)+'\')">Opnieuw proberen</button>':'')+
          '<button class="btn small document-job-action" onclick="chooseBackgroundReplacement(\''+esc(item.id)+'\')">Nieuwe foto kiezen</button>'+
          '<button class="btn small document-job-action" onclick="closeModal();newExpense()">Handmatig invoeren</button>';
      }
    }
  }
  var iconHtml=(st===S.UPLOADING||st===S.PROCESSING||st===S.VALIDATING)?'<span class="document-processing-spinner" aria-hidden="true"></span>':esc(icon);
  return '<div class="document-job-row" data-state="'+esc(st)+'"><span class="document-job-icon '+esc(cls)+'" aria-hidden="true">'+iconHtml+'</span><div class="document-job-copy"><strong title="'+esc(item.file_name||'document')+'">'+esc(item.file_name||'document')+'</strong><span class="document-job-status">'+esc(processingStatusText(item))+'</span><span>'+esc(sub)+'</span>'+progress+'</div><div class="document-job-actions">'+actions+'</div></div>';
}
function batchHtml(batchId){
  var rows=batchItems(batchId),c=batchCounts(rows);if(!rows.length)return '';
  var received=batchAllReceived(rows);
  var progress=Math.round((c.terminal/Math.max(1,c.total))*100);
  var notice=received?'<div class="document-background-received"><strong>Je documenten zijn ontvangen.</strong> Je kunt ondertussen verder werken.</div>':'';
  if(!navigator.onLine&&received)notice+='<div class="document-background-offline"><strong>Verbinding onderbroken.</strong> Je documenten zijn ontvangen. We halen de status opnieuw op zodra de verbinding terug is.</div>';
  return '<section class="document-background-batch" data-background-batch="'+esc(batchId)+'" aria-busy="'+(c.active?'true':'false')+'">'+
    '<div class="document-background-batch-head"><div><h2>'+c.total+' '+(c.total===1?'document':'documenten')+'</h2><p aria-live="polite">'+esc(batchSummary(rows))+'</p></div><div class="document-background-progress">'+c.terminal+' / '+c.total+'</div></div>'+
    '<div class="document-background-progressbar" aria-hidden="true"><span style="width:'+progress+'%"></span></div>'+notice+
    '<div class="document-job-list">'+rows.map(function(x){return statusRowHtml(x,false)}).join('')+'</div></section>';
}
function backgroundPageHtml(){
  var ids=latestBatchIds();
  if(!ids.length)return '';
  var chosen=ids.filter(function(id){
    var rows=batchItems(id);
    return rows.some(function(x){return !isTerminalState(x.state)||x.state===S.REVIEW_REQUIRED||x.state===S.FAILED})||backgroundWatched.has(id);
  }).slice(0,3);
  if(!chosen.length)chosen=ids.slice(0,1);
  return '<div class="document-background-view" aria-label="Documentverwerking">'+chosen.map(batchHtml).join('')+'</div>';
}
function statusPanelHtml(){
  var rows=indicatorBatch();
  if(!rows.length)rows=combinedItems().filter(function(x){return x.state===S.REVIEW_REQUIRED||x.state===S.FAILED}).slice(0,8);
  var c=batchCounts(rows);
  return '<div class="document-status-panel"><div class="document-status-panel-summary"><strong>Documenten verwerken</strong><span>'+esc(rows.length?batchSummary(rows):'Geen actieve verwerking')+'</span></div>'+
    rows.slice(0,8).map(function(x){return statusRowHtml(x,true)}).join('')+
    '<div class="document-status-panel-footer"><button class="btn primary" onclick="closeModal();navigate(\'documents\')">Alles bekijken</button></div></div>';
}
function openDocumentProcessingStatusPanel(){modal('Documenten',statusPanelHtml(),'<button class="btn" onclick="closeModal()">Sluiten</button>')}
globalThis.openDocumentProcessingStatusPanel=openDocumentProcessingStatusPanel;

function renderBatchIfVisible(){schedulePageRefresh()}
function markUploadState(upload,next){
  if(upload.state!==next)upload.state=State.transition(upload.state,next);
  upload.updatedAt=nowIso();renderBatchIfVisible();
}
function failUpload(upload,error){
  upload.error=error||{};
  if(upload.state!==S.FAILED){
    if(State.canTransition(upload.state,S.FAILED))upload.state=State.transition(upload.state,S.FAILED);
    else upload.state=S.FAILED;
  }
  upload.updatedAt=nowIso();renderBatchIfVisible();checkBatchNotifications();
}
async function loadTus(){
  if(!tusModulePromise)tusModulePromise=import('https://cdn.jsdelivr.net/npm/tus-js-client@4.3.1/+esm');
  return tusModulePromise;
}
async function uploadOriginal(upload){
  var sb=await getSupabase();
  var existing=await sb.from('documents').select('id,client_ref,storage_path,name,mime_type,metadata').eq('user_id',currentUser.id).eq('client_ref',upload.clientRef).maybeSingle();
  if(existing.error)throw existing.error;
  if(existing.data){markUploadState(upload,S.UPLOADING);upload.uploadLoaded=upload.uploadTotal;upload.uploadPercent=100;markUploadState(upload,S.RECEIVED);return existing.data}
  markUploadState(upload,S.UPLOADING);
  upload.uploadPercent=0;upload.uploadLoaded=0;upload.uploadTotal=Number(upload.file.size||0);
  activeDocumentTransfers++;upload.transferActive=true;
  var projectId=(new URL(SUPABASE_URL)).hostname.split('.')[0];
  var path=currentUser.id+'/'+upload.clientRef+'-'+safeStorageName(upload.file.name);
  var token=await getApiAccessToken();
  var tus=await loadTus();
  try{
    await new Promise(function(resolve,reject){
      var task=new tus.Upload(upload.file,{
        endpoint:'https://'+projectId+'.storage.supabase.co/storage/v1/upload/resumable',
        retryDelays:[0,3000,5000,10000,20000],
        headers:{authorization:'Bearer '+token,apikey:SUPABASE_PUBLISHABLE_KEY,'x-upsert':'false'},
        uploadDataDuringCreation:true,
        removeFingerprintOnSuccess:true,
        chunkSize:6*1024*1024,
        metadata:{bucketName:'kwinest-documents',objectName:path,contentType:upload.file.type||'application/octet-stream',cacheControl:'3600'},
        onError:function(error){reject(error)},
        onProgress:function(bytesUploaded,bytesTotal){
          upload.uploadLoaded=Number(bytesUploaded||0);upload.uploadTotal=Number(bytesTotal||upload.file.size||0);
          upload.uploadPercent=upload.uploadTotal>0?Math.min(100,Math.round(upload.uploadLoaded/upload.uploadTotal*100)):null;
          upload.updatedAt=nowIso();renderBatchIfVisible();
        },
        onSuccess:function(){resolve()}
      });
      upload.tusTask=task;task.start();
    });
    var metadata={size:upload.file.size,batch_id:upload.batchId,requested_kind:upload.kind,background_processing:true,received_at:nowIso()};
    var inserted=await sb.from('documents').insert({user_id:currentUser.id,client_ref:upload.clientRef,name:upload.file.name,kind:'processing',mime_type:upload.file.type||'application/octet-stream',storage_path:path,metadata:metadata}).select('id,client_ref,storage_path,name,mime_type,metadata').single();
    if(inserted.error){
      var found=await sb.from('documents').select('id,client_ref,storage_path,name,mime_type,metadata').eq('user_id',currentUser.id).eq('client_ref',upload.clientRef).maybeSingle();
      if(found.data)return found.data;
      await sb.storage.from('kwinest-documents').remove([path]).catch(function(){});
      throw inserted.error;
    }
    upload.uploadLoaded=upload.uploadTotal;upload.uploadPercent=100;markUploadState(upload,S.RECEIVED);
    return inserted.data;
  }finally{
    if(upload.transferActive){upload.transferActive=false;activeDocumentTransfers=Math.max(0,activeDocumentTransfers-1)}
  }
}
async function backgroundAction(action,payload){
  var body=Object.assign({action:action},payload||{});
  var res=await fetchWithAuthRetry(EDGE_BASE+'/document-processing',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  var json=await res.json().catch(function(){return {}});
  if(!res.ok||!json.ok){
    var err=new Error(String(json&&json.error&&json.error.code||'DOCUMENT_PROCESSING_REQUEST_FAILED'));
    err.code=String(json&&json.error&&json.error.code||'DOCUMENT_PROCESSING_REQUEST_FAILED');err.status=res.status;throw err;
  }
  return json;
}
function upsertJob(job){
  if(!job||!job.id)return;
  var i=backgroundJobs.findIndex(function(x){return x.id===job.id});
  if(i>=0)backgroundJobs[i]=job;else backgroundJobs.push(job);
  backgroundJobs.sort(function(a,b){return String(b.updated_at||'').localeCompare(String(a.updated_at||''))});
  backgroundUploads.delete(job.client_ref);
  archiveReadyNonFinancial(job);
}
async function enqueueReceived(upload){
  try{
    var json=await backgroundAction('enqueue',{client_ref:upload.clientRef,batch_id:upload.batchId,kind:upload.kind,company:{name:state.company&&state.company.name||'',tradeName:state.company&&state.company.tradeName||'',kvk:state.company&&state.company.kvk||'',vat:state.company&&state.company.vat||''}});
    if(json.job)upsertJob(json.job);
    renderBatchIfVisible();schedulePoll();checkBatchNotifications();
  }catch(error){
    upload.enqueueError=error;upload.updatedAt=nowIso();
    if(!navigator.onLine)upload.connectionMessage='Verbinding onderbroken. Je document is ontvangen.';
    renderBatchIfVisible();schedulePoll();
  }
}
async function processUpload(upload){
  try{
    await uploadOriginal(upload);
    await enqueueReceived(upload);
  }catch(error){
    if(upload.state===S.RECEIVED){upload.enqueueError=error;renderBatchIfVisible();return}
    failUpload(upload,error);
  }
}
async function runUploads(list){
  var work=list.slice();
  async function worker(){while(work.length){var upload=work.shift();if(upload)await processUpload(upload)}}
  await Promise.all(Array.from({length:Math.min(2,list.length)},worker));
}
startDocumentProcessingQueue=async function(files,kind,options){
  if(TEST_MODE_NO_AUTH)return foregroundStartDocumentProcessingQueue(files,kind,options);
  var list=Array.from(files||[]).filter(Boolean);
  kind=kind||'auto';options=options||{};
  if(!list.length){toast('Geen bestand geselecteerd');return}
  if(list.length>DOCUMENT_PROCESSING_MAX_FILES){toast('Kies maximaal '+DOCUMENT_PROCESSING_MAX_FILES+' documenten tegelijk.');return}
  var batchId=uid('batch');
  var uploads=list.map(function(file){
    var clientRef=uid('file');
    var row={clientRef:clientRef,batchId:batchId,file:file,fileName:shortFileName(file.name),mimeType:file.type||'application/octet-stream',size:Number(file.size||0),kind:kind||'auto',smart:!!options.smart,state:S.SELECTED,uploadPercent:null,uploadLoaded:0,uploadTotal:Number(file.size||0),createdAt:nowIso(),updatedAt:nowIso(),sourceInputId:String(options.sourceInputId||'')};
    backgroundUploads.set(clientRef,row);return row;
  });
  backgroundExpected.set(batchId,uploads.length);backgroundWatched.add(batchId);
  if(page!=='documents')await navigate('documents');else render();
  updateGlobalUi();
  await runUploads(uploads);
  checkBatchNotifications();
};
globalThis.startDocumentProcessingQueue=startDocumentProcessingQueue;

async function retryBackgroundUpload(clientRef){
  var upload=backgroundUploads.get(clientRef);if(!upload||!upload.file)return;
  upload.error=null;upload.enqueueError=null;upload.uploadPercent=0;upload.uploadLoaded=0;
  upload.state=S.SELECTED;upload.updatedAt=nowIso();renderBatchIfVisible();
  await processUpload(upload);checkBatchNotifications();
}
globalThis.retryBackgroundUpload=retryBackgroundUpload;

async function retryPendingEnqueues(){
  var pending=[];
  backgroundUploads.forEach(function(x){if(x.state===S.RECEIVED&&x.enqueueError)pending.push(x)});
  for(var i=0;i<pending.length;i++)await enqueueReceived(pending[i]);
}
async function retryBackgroundDocumentJob(jobId){
  try{var json=await backgroundAction('retry',{job_id:jobId});if(json.job)upsertJob(json.job);renderBatchIfVisible();schedulePoll()}
  catch(error){toast(error&&error.code==='RETRY_LIMIT_REACHED'?'Dit document kan niet nogmaals automatisch worden verwerkt.':'Opnieuw proberen is nu niet gelukt.')}
}
globalThis.retryBackgroundDocumentJob=retryBackgroundDocumentJob;

function findAnyItem(id){
  if(String(id).startsWith('local:'))return backgroundUploads.get(String(id).slice(6))||null;
  return backgroundJobs.find(function(x){return x.id===id})||null;
}
function chooseBackgroundReplacement(id){
  var item=findAnyItem(id);if(!item)return;
  var input=document.createElement('input');input.type='file';input.accept='application/pdf,image/*,.heic,.heif,.tif,.tiff,.bmp,.docx,.xlsx,.csv,text/csv';input.style.display='none';
  input.onchange=async function(){
    var file=input.files&&input.files[0];input.remove();if(!file)return;
    try{
      var batchId=item.batch_id||item.batchId,clientRef=item.client_ref||item.clientRef,kind=item.requested_kind||item.kind||'auto';
      if(!item.local&&item.client_ref){await deleteStoredFile(item.client_ref);backgroundJobs=backgroundJobs.filter(function(x){return x.id!==item.id})}
      var old=backgroundUploads.get(clientRef);if(old)backgroundUploads.delete(clientRef);
      var upload={clientRef:clientRef,batchId:batchId,file:file,fileName:shortFileName(file.name),mimeType:file.type||'application/octet-stream',size:Number(file.size||0),kind:kind,state:S.SELECTED,uploadPercent:null,uploadLoaded:0,uploadTotal:Number(file.size||0),createdAt:nowIso(),updatedAt:nowIso()};
      backgroundUploads.set(clientRef,upload);renderBatchIfVisible();await processUpload(upload);checkBatchNotifications();
    }catch(error){toast('De nieuwe foto kon niet worden opgeslagen.')}
  };
  document.body.appendChild(input);input.click();
}
globalThis.chooseBackgroundReplacement=chooseBackgroundReplacement;

function parsedFromJob(job,file){
  var analysis=job&&job.result&&job.result.analysis||{};
  var parsed=processorAnalysisToCandidate(analysis,'',job.requested_kind||'auto');
  var proc=analysis.processing||{};
  parsed.processor={kind:proc.sourceKind||String(job.mime_type||'').split('/').pop()||'document',pageCount:Number(analysis.pageCount||proc.pages||1),ocrUsed:Array.isArray(proc.ocrPages)&&proc.ocrPages.length>0,ocrPages:Array.isArray(proc.ocrPages)?proc.ocrPages:[],ocrConfidence:null,tables:Number(proc.tablesFound||0),warnings:Array.isArray(analysis.warnings)?analysis.warnings:[]};
  parsed.pageCount=parsed.processor.pageCount;
  parsed.sourceQuality=proc.ai?'processor-v2-ai':'processor-v2';
  parsed.documentType=classifyDocumentType(parsed,analysis.documentType||'');
  parsed.isCredit=parsed.documentType==='credit_invoice'||!!parsed.isCredit;
  parsed=applyRecognitionQuality(parsed);
  var fields=Array.isArray(job.review_fields)?job.review_fields:[];
  var prov=ensureFinancialReviewProvenance(parsed);
  fields.forEach(function(key){
    if(['net','vatAmount','gross','vatRate'].includes(key)){
      prov[key]=Object.assign({},prov[key]||{},{source:'uncertain',confirmed:false,confidence:Number(parsed.fieldConfidence&&parsed.fieldConfidence[key]||0)});
    }
  });
  parsed.backgroundReviewFields=fields.slice();
  parsed.backgroundReviewMessage=job.review_message||'';
  return parsed;
}
async function openBackgroundDocumentJob(jobId){
  var job=backgroundJobs.find(function(x){return x.id===jobId});if(!job)return;
  var analysis=job.result&&job.result.analysis||{};
  if(!isFinancialAnalysis(analysis)){return openStoredDocument(job.client_ref)}
  try{
    var stored=await getStoredFile(job.client_ref);if(!stored||!stored.blob)return toast('Bestand niet gevonden in de cloud');
    var file=new File([stored.blob],stored.name||job.file_name||'document',{type:stored.type||job.mime_type||'application/octet-stream'});
    var parsed=parsedFromJob(job,file),sha=await fileSha256(file);
    var dup=duplicateInvoiceCandidate(parsed,sha);if(dup)parsed.duplicateCandidate=dup;
    var ext=(file.name.split('.').pop()||'').toLowerCase();
    var previewable=file.type==='application/pdf'||DOCUMENT_IMAGE_MIME_TYPES.includes(String(file.type||'').toLowerCase())||DOCUMENT_IMAGE_EXTENSIONS.includes(ext);
    pendingPdfImport={file:file,parsed:parsed,previewUrl:previewable?URL.createObjectURL(file):null,sha256:sha,persistedFileId:job.client_ref,persistedDocumentId:job.document_id,backgroundJobId:job.id};
    showPdfImportReview(parsed);
    setTimeout(function(){
      var fields=Array.isArray(job.review_fields)?job.review_fields:[];
      if(fields.length){
        var map={gross:'gross',vatAmount:'vatAmount',vatRate:'vatRate',vatLines:'vatRate',issueDate:'issueDate',party:'party'};
        fields.forEach(function(key){
          var el=document.querySelector('#pdfImportForm [name="'+(map[key]||key)+'"]');
          if(el)el.classList.add('document-background-field-attention');
        });
        var first=document.querySelector('#pdfImportForm [name="'+(map[fields[0]]||fields[0])+'"]');
        if(first){var step=Number(first.closest('[data-review-step]')&&first.closest('[data-review-step]').dataset.reviewStep||2);setDocumentReviewStep(step);first.focus()}
      }
    },80);
  }catch(error){console.warn('Background review',error);toast('Document kon niet worden geopend voor controle.')}
}
globalThis.openBackgroundDocumentJob=openBackgroundDocumentJob;

function archiveReadyNonFinancial(job){
  if(!job||job.state!==S.READY||!job.result||!job.result.analysis)return;
  if(isFinancialAnalysis(job.result.analysis))return;
  if(state.documents.some(function(d){return d.fileId===job.client_ref}))return;
  var dt=String(job.result.analysis.documentType||'other');
  state.documents.unshift({id:uid('d'),fileId:job.client_ref,name:job.file_name||'Document',type:dt==='bank_document'?'Bankdocument':'Document',date:today(),size:Number(job.size_bytes||0),source:'background-processing',pageCount:Number(job.result.analysis.pageCount||job.result.analysis.processing&&job.result.analysis.processing.pages||1),ocrUsed:Array.isArray(job.result.analysis.processing&&job.result.analysis.processing.ocrPages)&&job.result.analysis.processing.ocrPages.length>0,analyzed:true,backgroundJobId:job.id});
  logEvent('Document verwerkt',job.file_name||'Document','document',job.client_ref);save();
}
async function resolveBackgroundReview(jobId){
  try{var json=await backgroundAction('resolve_review',{job_id:jobId});if(json.job)upsertJob(json.job);renderBatchIfVisible()}
  catch(error){console.warn('Review resolve',error)}
}
savePdfInvoiceImport=async function(){
  var jobId=pendingPdfImport&&pendingPdfImport.backgroundJobId||'';
  await foregroundSavePdfInvoiceImport.apply(this,arguments);
  if(jobId&&!pendingPdfImport)await resolveBackgroundReview(jobId);
};
globalThis.savePdfInvoiceImport=savePdfInvoiceImport;

function applyRealtime(payload){
  if(!payload)return;
  if(payload.eventType==='DELETE'){
    var oldId=payload.old&&payload.old.id;backgroundJobs=backgroundJobs.filter(function(x){return x.id!==oldId});
  }else if(payload.new)upsertJob(payload.new);
  renderBatchIfVisible();schedulePoll();checkBatchNotifications();
}
async function loadJobs(silent){
  if(TEST_MODE_NO_AUTH||!currentUser)return;
  var sb=await getSupabase();
  var res=await sb.from('document_processing_jobs').select('*').eq('user_id',currentUser.id).order('updated_at',{ascending:false}).limit(80);
  if(res.error)throw res.error;
  backgroundJobs=Array.isArray(res.data)?res.data:[];
  backgroundJobs.forEach(archiveReadyNonFinancial);
  if(!initialJobsLoaded){initialJobsLoaded=true}
  renderBatchIfVisible();schedulePoll();if(!silent)checkBatchNotifications();
}
function schedulePoll(){
  if(backgroundPollTimer){clearTimeout(backgroundPollTimer);backgroundPollTimer=null}
  if(!currentUser||TEST_MODE_NO_AUTH)return;
  var should=activeCount()>0||Array.from(backgroundUploads.values()).some(function(x){return x.state===S.RECEIVED&&x.enqueueError});
  if(!should)return;
  backgroundPollTimer=setTimeout(async function(){
    try{await loadJobs(false);backgroundPollDelay=6000;await retryPendingEnqueues()}
    catch(error){backgroundPollDelay=Math.min(30000,Math.max(9000,backgroundPollDelay*1.7))}
    schedulePoll();
  },backgroundPollDelay);
}
async function subscribeJobs(){
  var sb=await getSupabase();
  if(backgroundChannel){try{await sb.removeChannel(backgroundChannel)}catch(_){}} 
  backgroundChannel=sb.channel('document-processing-'+currentUser.id).on('postgres_changes',{event:'*',schema:'public',table:'document_processing_jobs',filter:'user_id=eq.'+currentUser.id},applyRealtime).subscribe();
}
async function resumeJobs(){
  try{await backgroundAction('resume',{})}catch(error){if(navigator.onLine)console.warn('Background resume',error)}
}
async function initBackgroundProcessing(){
  if(TEST_MODE_NO_AUTH||!currentUser)return;
  if(backgroundUserId&&backgroundUserId!==currentUser.id)stopBackgroundProcessing();
  backgroundUserId=currentUser.id;
  try{await subscribeJobs();await loadJobs(true);await resumeJobs();await loadJobs(false)}catch(error){console.warn('Document background init',error);schedulePoll()}
}
function stopBackgroundProcessing(){
  if(backgroundPollTimer){clearTimeout(backgroundPollTimer);backgroundPollTimer=null}
  if(backgroundChannel&&supabaseClient){try{supabaseClient.removeChannel(backgroundChannel)}catch(_){}}backgroundChannel=null;
  backgroundJobs=[];backgroundUploads.clear();backgroundExpected.clear();backgroundWatched.clear();backgroundNotified.clear();backgroundUserId='';initialJobsLoaded=false;updateGlobalUi();
}
function checkBatchNotifications(){
  backgroundWatched.forEach(function(batchId){
    if(backgroundNotified.has(batchId))return;
    var rows=batchItems(batchId),expected=Number(backgroundExpected.get(batchId)||0);
    if(!expected||rows.length<expected)return;
    var c=batchCounts(rows);
    if(c.terminal<expected)return;
    backgroundNotified.add(batchId);
    var msg=expected+' documenten verwerkt';
    if(c.reviewRequired)msg+=' · '+c.reviewRequired+' controle nodig';
    if(c.failed)msg+=' · '+c.failed+' niet verwerkt';
    toast(msg);
  });
}
function openBackgroundPanelAfterNetwork(){updateGlobalUi();if(page==='documents')render()}

renderDocuments=function(){return backgroundPageHtml()+foregroundRenderDocuments.apply(this,arguments)};
render=function(){var out=foregroundRender.apply(this,arguments);ensureGlobalUi();updateGlobalUi();return out};
enterApp=function(){var out=foregroundEnterApp.apply(this,arguments);setTimeout(function(){void initBackgroundProcessing()},0);return out};
logoutUser=async function(){try{return await foregroundLogoutUser.apply(this,arguments)}finally{stopBackgroundProcessing()}};

globalThis.renderDocuments=renderDocuments;
globalThis.render=render;
globalThis.enterApp=enterApp;
globalThis.logoutUser=logoutUser;

window.addEventListener('online',function(){void retryPendingEnqueues();void resumeJobs();void loadJobs(false).catch(function(){});openBackgroundPanelAfterNetwork()});
window.addEventListener('offline',openBackgroundPanelAfterNetwork);

setTimeout(function(){
  if(currentUser&&document.getElementById('mainApp')&&document.getElementById('mainApp').style.display!=='none')void initBackgroundProcessing();
  ensureGlobalUi();updateGlobalUi();
},0);
})();