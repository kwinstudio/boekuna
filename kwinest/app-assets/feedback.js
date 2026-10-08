/* BOEKUNA Hulp & feedback — "even iets aan BOEKUNA doorgeven".
   App-only layer. One central feedback sheet (category → short message → optional screenshot →
   send) that every entry point reuses, plus "Mijn meldingen". Safe technical context is added
   automatically; documents, bank data, tokens and storage are never collected. Screenshots are
   only sent after the user picks one and presses send. Nothing here changes financial data,
   VAT logic, the document parser or Document Intelligence. */
(function(){
  'use strict';
  var TABLE='feedback_reports',BUCKET='feedback-screenshots';
  var TIMEOUT_MS=20000,MAX_MESSAGE=2000,MAX_SCREENSHOT_INPUT=15*1024*1024,MAX_SCREENSHOT_SIDE=2400;
  var CATEGORIES=[
    {key:'bug',label:'Er werkt iets niet',prompt:'Wat ging er mis?',placeholder:'Bijvoorbeeld: ik druk op Opslaan en er gebeurt niets.',icon:'<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z"/>'},
    {key:'incorrect_result',label:'Iets klopt niet',prompt:'Wat klopt er volgens jou niet?',placeholder:'Bijvoorbeeld: het btw-bedrag is anders dan op mijn bon.',icon:'<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>'},
    {key:'unclear',label:'Iets is onduidelijk',prompt:'Wat was niet duidelijk?',placeholder:'Bijvoorbeeld: ik wist niet welke knop ik moest kiezen.',icon:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17h.01"/>'},
    {key:'feature_request',label:'Ik heb een idee',prompt:'Wat zou je graag makkelijker of anders willen?',placeholder:'Bijvoorbeeld: ik wil een factuur kunnen kopiëren.',icon:'<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/>'}
  ];
  // Internal types stay out of the customer UI; ocr_correction is shown as "Iets klopt niet".
  var INTERNAL_TYPES=['bug','incorrect_result','unclear','feature_request','ocr_correction'];
  var CUSTOMER_STATUS={received:'Ontvangen',reviewing:'Wordt bekeken',in_progress:'In behandeling',resolved:'Opgelost'};
  var FIELD_LABELS={invoiceNumber:'Factuurnummer',invoiceDate:'Factuurdatum',supplier:'Leverancier',subtotal:'Bedrag excl. btw',vat:'Btw-bedrag',vatRate:'Btw-percentage',invoiceTotal:'Totaal',currency:'Valuta'};
  // Document review keys → feedback field identity.
  var OCR_FIELDS=[['invoiceNumber','invoiceNumber'],['issueDate','invoiceDate'],['party','supplier'],['net','subtotal'],['vatAmount','vat'],['vatRate','vatRate'],['gross','invoiceTotal'],['currency','currency']];
  var MONEY_FIELDS={net:1,vatAmount:1,gross:1};
  var FEATURE_LABELS={'document-review':'Document controleren','document-upload':'Document uploaden','document-processing':'Documentverwerking','bank-import':'Bankimport'};

  var sheet=null,sheetState=null,returnFocus=null,submitting=false;

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function svg(path,cls){return '<svg class="'+(cls||'fb-icon')+'" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+path+'</svg>'}
  function categoryFor(key){return CATEGORIES.filter(function(c){return c.key===key})[0]||null}
  function customerCategory(internal){return internal==='ocr_correction'?'incorrect_result':internal}
  function userId(){try{return typeof currentUser!=='undefined'&&currentUser&&currentUser.id?String(currentUser.id):''}catch(e){return ''}}
  function storageKey(kind){return 'boekuna-feedback-'+kind+':'+userId()}
  function lsGet(key){try{return localStorage.getItem(key)}catch(e){return null}}
  function lsSet(key,value){try{if(value==null)localStorage.removeItem(key);else localStorage.setItem(key,value)}catch(e){}}
  function uuid(){
    if(window.crypto&&typeof crypto.randomUUID==='function')return crypto.randomUUID();
    var b=new Uint8Array(16);crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
    var h=Array.prototype.map.call(b,function(x){return x.toString(16).padStart(2,'0')}).join('');
    return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }
  function dateLabel(iso){
    var d=new Date(iso);if(isNaN(d))return '';
    var opts={day:'numeric',month:'long'};if(d.getFullYear()!==new Date().getFullYear())opts.year='numeric';
    return d.toLocaleDateString('nl-NL',opts);
  }
  function clip(v,n){v=String(v==null?'':v);return v.length>n?v.slice(0,n):v}

  // ---------- Safe technical context ----------
  function platformInfo(){
    var ua=navigator.userAgent||'',standalone=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
    var os=/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1)?'iOS':/Android/.test(ua)?'Android':/Mac OS X/.test(ua)?'macOS':/Windows/.test(ua)?'Windows':/Linux/.test(ua)?'Linux':'other';
    var platform=/Boekuna-iOS\//.test(ua)?'ios-app':/Boekuna-Android\//.test(ua)?'android-app':standalone?'pwa':'web';
    var m,browser='other';
    if((m=ua.match(/Edg\/(\d+)/)))browser='Edge '+m[1];
    else if((m=ua.match(/(?:Chrome|CriOS)\/(\d+)/)))browser='Chrome '+m[1];
    else if((m=ua.match(/(?:Firefox|FxiOS)\/(\d+)/)))browser='Firefox '+m[1];
    else if((m=ua.match(/Version\/(\d+)[^ ]* .*Safari/)))browser='Safari '+m[1];
    else if(/AppleWebKit/.test(ua))browser='WebKit';
    var w=Math.min(window.innerWidth||0,screen.width||window.innerWidth||0),touch=navigator.maxTouchPoints>0;
    var deviceClass=w<600?'mobile':(w<1025&&touch)?'tablet':'desktop';
    return {platform:platform,os:os,browser:browser,deviceClass:deviceClass};
  }
  function currentPage(){try{return typeof page!=='undefined'?String(page||''):''}catch(e){return ''}}
  function buildContext(extra){
    var p=platformInfo(),build=window.BOEKUNA_BUILD||{},theme=window.BoekunaTheme;
    var ctx={
      v:1,route:clip(currentPage(),40),release:clip(build.release||'dev',40),releaseProfile:clip(build.profile||'',40),
      platform:p.platform,os:p.os,browser:p.browser,deviceClass:p.deviceClass,
      viewport:(window.innerWidth||0)+'x'+(window.innerHeight||0),locale:clip(navigator.language||'',20),
      theme:theme?theme.preference()+'/'+theme.resolved():'light',online:navigator.onLine!==false,submittedAt:new Date().toISOString()
    };
    extra=extra||{};
    // Only whitelisted, short, non-sensitive identifiers from the entry point.
    ['feature','errorCode','referenceId','documentId','processingJobId','documentType'].forEach(function(k){
      if(extra[k]!=null&&extra[k]!=='')ctx[k]=clip(extra[k],80);
    });
    if(Array.isArray(extra.ocrCorrections)&&extra.ocrCorrections.length)ctx.ocrCorrections=extra.ocrCorrections.slice(0,12);
    return ctx;
  }

  // ---------- OCR corrections (Document controleren) ----------
  function normalizeValue(key,value){
    if(value==null)return '';
    if(MONEY_FIELDS[key]){var n=Number(String(value).replace(',','.'));return Number.isFinite(n)?n.toFixed(2):String(value).trim()}
    if(key==='vatRate'){var r=Number(value);return Number.isFinite(r)?String(r):String(value).trim()}
    if(key==='currency')return String(value).trim().toUpperCase();
    return String(value).trim();
  }
  function shortValue(v){v=String(v==null?'':v);return v.length>80?v.slice(0,80):v}
  // Field identity + recognised value + corrected value, plus existing Document Intelligence
  // metadata when it is already there. Never the OCR text, the file or other document fields.
  function diffRecognition(original,corrected,doc){
    if(!original||!corrected)return [];
    var out=[];
    OCR_FIELDS.forEach(function(pair){
      var key=pair[0],field=pair[1];
      if(!(key in original))return;
      var before=normalizeValue(key,original[key]),after=normalizeValue(key,corrected[key]);
      if(before===after||(before===''&&after===''))return;
      if(Array.isArray(corrected.deferredFields)&&corrected.deferredFields.indexOf(key)>=0)return;
      var entry={field:field,originalValue:shortValue(before),correctedValue:shortValue(after)};
      var conf=original.fieldConfidence&&Number(original.fieldConfidence[key]);
      if(Number.isFinite(conf))entry.confidence=conf;
      var prov=(doc&&doc.fieldProvenance&&doc.fieldProvenance[key])||null;
      if(prov&&typeof prov==='object'){
        if(prov.source)entry.sourceType=clip(prov.source,30);
        if(prov.page!=null&&Number.isFinite(Number(prov.page)))entry.page=Number(prov.page);
        if(prov.evidenceId)entry.evidenceRef=clip(prov.evidenceId,60);
      }
      out.push(entry);
    });
    return out;
  }
  function processorVersion(d){
    var keys=['processorVersion','engineVersion','pipelineVersion','engine','processor'];
    for(var i=0;i<keys.length;i++){var v=d&&d[keys[i]];if(typeof v==='string'&&v&&v.length<=40)return v}
    return '';
  }
  function liveReviewCorrections(){
    try{
      var d=typeof pendingPdfImport!=='undefined'&&pendingPdfImport?pendingPdfImport.parsed:null;
      var api=window.BookunaDocumentReviewV2;
      if(!d||!api||typeof api.captureReviewSnapshot!=='function')return {corrections:[],documentType:''};
      var snap=api.captureReviewSnapshot();
      var original=d.recognitionOriginal||null;
      var list=diffRecognition(original,snap,d),version=processorVersion(d);
      if(version)list.forEach(function(x){x.processorVersion=version});
      return {corrections:list,documentType:clip(snap&&snap.documentType||d.documentType||'',30)};
    }catch(e){return {corrections:[],documentType:''}}
  }

  // ---------- Screenshot preparation (re-encoded: strips EXIF/location metadata) ----------
  function prepareScreenshot(file){
    return new Promise(function(resolve,reject){
      if(!file)return reject(new Error('none'));
      if(!/^image\//.test(file.type||'')&&!/\.(png|jpe?g|webp|heic|heif)$/i.test(file.name||''))return reject(new Error('type'));
      if(file.size>MAX_SCREENSHOT_INPUT)return reject(new Error('size'));
      var url=URL.createObjectURL(file),img=new Image();
      img.onload=function(){
        try{
          var scale=Math.min(1,MAX_SCREENSHOT_SIDE/Math.max(img.naturalWidth,img.naturalHeight));
          var w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
          var canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
          var ctx=canvas.getContext('2d');ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
          URL.revokeObjectURL(url);
          canvas.toBlob(function(blob){if(!blob)return reject(new Error('encode'));if(blob.size>5*1024*1024)return reject(new Error('size'));resolve(blob)},'image/jpeg',0.88);
        }catch(e){URL.revokeObjectURL(url);reject(e)}
      };
      img.onerror=function(){URL.revokeObjectURL(url);reject(new Error('decode'))};
      img.src=url;
    });
  }

  // ---------- Transport ----------
  function withTimeout(promise){
    var timer;
    return Promise.race([promise,new Promise(function(_,reject){timer=setTimeout(function(){var e=new Error('timeout');e.code='TIMEOUT';reject(e)},Number(window.BOEKUNA_FEEDBACK_TIMEOUT_MS)||TIMEOUT_MS)})]).finally(function(){clearTimeout(timer)});
  }
  async function client(){
    if(typeof getSupabase!=='function')throw Object.assign(new Error('unavailable'),{code:'UNAVAILABLE'});
    return await getSupabase();
  }
  function errorKind(err){
    var code=String(err&&(err.code||err.status||err.statusCode)||''),msg=String(err&&err.message||'').toLowerCase();
    if(navigator.onLine===false||/failed to fetch|network|load failed/.test(msg))return 'offline';
    if(code==='TIMEOUT')return 'timeout';
    if(code==='401'||code==='PGRST301'||/jwt|expired|not authenticated|invalid claim/.test(msg))return 'session';
    if(/feedback_rate_limit/.test(msg))return 'rate';
    return 'other';
  }
  async function sendReport(report){
    var sb=await withTimeout(client());
    var uid=userId();if(!uid)throw Object.assign(new Error('not authenticated'),{code:'401'});
    var path=null;
    if(report.screenshot){
      path=uid+'/'+report.id+'/screenshot.jpg';
      var up=await withTimeout(sb.storage.from(BUCKET).upload(path,report.screenshot,{contentType:'image/jpeg',upsert:false,cacheControl:'0'}));
      // A retry after a timed-out upload finds the same file already there: that is fine.
      if(up&&up.error&&!/exists|duplicate/i.test(String(up.error.message||''))&&String(up.error.statusCode||'')!=='409')throw Object.assign(up.error,{stage:'screenshot'});
    }
    var row={id:report.id,category:report.category,title:report.title,message:report.message,feature:report.context.feature||report.context.route||null,route:report.context.route||null,app_release:report.context.release||null,platform:report.context.platform||null,context:report.context,screenshot_path:path};
    var res=await withTimeout(sb.from(TABLE).insert(row));
    // A retry after a timed-out insert hits the same id: the report is already stored.
    if(res&&res.error&&String(res.error.code)!=='23505'){
      if(path){try{await sb.storage.from(BUCKET).remove([path])}catch(e){}}
      throw res.error;
    }
    lsSet(storageKey('active'),'1');
    return {id:report.id};
  }
  async function fetchReports(){
    var sb=await withTimeout(client());
    var res=await withTimeout(sb.from(TABLE).select('id,created_at,category,title,message,customer_status,customer_reply,status_changed_at,screenshot_path').order('created_at',{ascending:false}).limit(50));
    if(res.error)throw res.error;
    return res.data||[];
  }
  async function screenshotUrl(path){
    var sb=await withTimeout(client());
    var res=await withTimeout(sb.storage.from(BUCKET).createSignedUrl(path,120));
    if(res.error)throw res.error;
    return res.data&&res.data.signedUrl;
  }

  // ---------- Draft (message + category only; never the screenshot) ----------
  function saveDraft(){
    if(!sheetState||!userId())return;
    var text=sheetState.message||'';
    if(!text.trim()){lsSet(storageKey('draft'),null);return}
    lsSet(storageKey('draft'),JSON.stringify({category:sheetState.category,message:clip(text,MAX_MESSAGE),contextKey:sheetState.contextKey||'',savedAt:Date.now()}));
  }
  function readDraft(contextKey){
    try{
      var d=JSON.parse(lsGet(storageKey('draft'))||'null');
      if(!d||Date.now()-Number(d.savedAt||0)>14*86400000)return null;
      if((d.contextKey||'')!==(contextKey||''))return null;
      return d;
    }catch(e){return null}
  }
  function clearDraft(){lsSet(storageKey('draft'),null)}

  // ---------- Sheet ----------
  function lockScroll(on){document.documentElement.classList.toggle('fb-scroll-lock',!!on)}
  function focusables(root){return Array.prototype.filter.call(root.querySelectorAll('button,[href],input:not([type=hidden]),textarea,select,[tabindex]:not([tabindex="-1"])'),function(el){return !el.disabled&&el.offsetParent!==null})}

  function contextSummary(){
    var s=sheetState,ctx=s.extra||{},parts=[];
    if(ctx.feature&&FEATURE_LABELS[ctx.feature])parts.push(FEATURE_LABELS[ctx.feature]);
    if(s.ocr&&s.ocr.length)parts.push(s.ocr.map(function(c){return FIELD_LABELS[c.field]||c.field}).join(', '));
    return parts.join(' · ');
  }
  function whatWeSendHtml(){
    var s=sheetState,items=['De pagina waar je bent','Je apparaattype, browser en de app-versie','Je thema en taal'];
    if(s.extra&&s.extra.errorCode)items.push('De foutcode die je zag');
    if(s.ocr&&s.ocr.length)items.push('Het veld dat je aanpaste: de herkende en jouw waarde');
    return '<details class="fb-details"><summary>Wat sturen we mee?</summary><ul>'+items.map(function(i){return '<li>'+esc(i)+'</li>'}).join('')+'</ul><p>Nooit je documenten, bankgegevens of wachtwoord.</p></details>';
  }
  function stepCategoryHtml(){
    return '<div class="fb-step" data-fb-step="category">'
      +'<h2 class="fb-title" id="fbTitle" tabindex="-1">Waar kunnen we mee helpen?</h2>'
      +'<div class="fb-choices" role="list">'
      +CATEGORIES.map(function(c){return '<div role="listitem"><button type="button" class="fb-choice" data-fb-category="'+c.key+'">'+svg(c.icon)+'<span>'+esc(c.label)+'</span>'+svg('<path d="m9 6 6 6-6 6"/>','fb-chevron')+'</button></div>'}).join('')
      +'</div></div>';
  }
  function stepMessageHtml(){
    var s=sheetState,c=categoryFor(customerCategory(s.category))||CATEGORIES[0],summary=contextSummary();
    var shot=s.screenshotUrl
      ?'<div class="fb-shot"><img src="'+esc(s.screenshotUrl)+'" alt="Gekozen screenshot"><div class="fb-shot-body"><p class="fb-consent" id="fbConsent">Een screenshot kan persoonlijke of financiële gegevens bevatten. Controleer wat je meestuurt.</p><button type="button" class="fb-link" data-fb-action="remove-shot">Screenshot verwijderen</button></div></div>'
      :'<button type="button" class="fb-add-shot" data-fb-action="pick-shot">'+svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M8 5l1.5-2h5L16 5"/>')+'<span>Screenshot toevoegen</span><small>Optioneel</small></button>';
    return '<form class="fb-step fb-form" data-fb-step="message" novalidate>'
      +(s.fixedCategory?'':'<button type="button" class="fb-back" data-fb-action="back">'+svg('<path d="m15 6-6 6 6 6"/>')+'<span>'+esc(c.label)+'</span></button>')
      +'<h2 class="fb-title" id="fbTitle" tabindex="-1"><label for="fbMessage">'+esc(c.prompt)+'</label></h2>'
      +(summary?'<p class="fb-context">Over: '+esc(summary)+'</p>':'')
      +'<textarea id="fbMessage" class="fb-textarea" name="message" rows="5" maxlength="'+MAX_MESSAGE+'" required aria-required="true" aria-describedby="fbMessageError" placeholder="'+esc(c.placeholder)+'">'+esc(s.message||'')+'</textarea>'
      +'<p class="fb-field-error" id="fbMessageError" role="alert" hidden>Vertel kort wat er is.</p>'
      +shot
      +'<input type="file" class="fb-file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" tabindex="-1" aria-hidden="true">'
      +whatWeSendHtml()
      +'<div class="fb-error" role="alert" hidden></div>'
      +'<div class="fb-foot"><button type="submit" class="btn primary fb-submit">Feedback versturen</button></div>'
      +'</form>';
  }
  function stepDoneHtml(){
    return '<div class="fb-step fb-done" data-fb-step="done">'
      +'<div class="fb-done-mark" aria-hidden="true">'+svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>')+'</div>'
      +'<h2 class="fb-title" id="fbTitle" tabindex="-1">Bedankt voor je feedback.</h2>'
      +'<p class="fb-done-text">We bekijken je melding. Je ziet hem terug onder Mijn meldingen.</p>'
      +'<div class="fb-foot"><button type="button" class="btn primary" data-fb-action="done">Klaar</button><button type="button" class="btn" data-fb-action="show-reports">Mijn meldingen</button></div>'
      +'</div>';
  }
  function renderSheet(step){
    if(!sheet)return;
    sheetState.step=step;
    var body=sheet.querySelector('.fb-body');
    body.innerHTML=step==='category'?stepCategoryHtml():step==='done'?stepDoneHtml():stepMessageHtml();
    var title=body.querySelector('#fbTitle');
    if(step==='message'){var ta=body.querySelector('#fbMessage');if(ta){ta.focus({preventScroll:true});ta.setSelectionRange(ta.value.length,ta.value.length)}}
    else if(title)title.focus({preventScroll:true});
  }
  function closeSheet(){
    if(!sheet)return;
    if(sheetState&&sheetState.step==='message')saveDraft();
    if(sheetState&&sheetState.screenshotUrl)URL.revokeObjectURL(sheetState.screenshotUrl);
    var wasDone=sheetState&&sheetState.step==='done';
    sheet.remove();sheet=null;sheetState=null;submitting=false;lockScroll(false);
    var el=returnFocus;returnFocus=null;
    if(el&&el.isConnected)setTimeout(function(){el.focus()},0);
    if(wasDone)refreshPanelReports();
  }

  // opts: {category, feature, errorCode, referenceId, documentId, processingJobId, documentType, ocrCorrections}
  function open(opts){
    opts=opts||{};
    if(sheet)closeSheet();
    returnFocus=document.activeElement;
    var fixed=opts.category&&INTERNAL_TYPES.indexOf(opts.category)>=0?opts.category:null;
    var extra={feature:opts.feature,errorCode:opts.errorCode,referenceId:opts.referenceId,documentId:opts.documentId,processingJobId:opts.processingJobId,documentType:opts.documentType};
    var contextKey=[opts.feature||'',opts.errorCode||'',opts.documentId||''].join('|');
    var draft=readDraft(contextKey);
    sheetState={category:fixed||(draft&&draft.category)||null,fixedCategory:!!fixed,message:draft?draft.message:'',extra:extra,ocr:Array.isArray(opts.ocrCorrections)?opts.ocrCorrections:[],contextKey:contextKey,screenshot:null,screenshotUrl:null,id:uuid(),step:'category'};
    sheet=document.createElement('div');
    sheet.className='fb-backdrop';
    sheet.innerHTML='<div class="fb-sheet" role="dialog" aria-modal="true" aria-labelledby="fbTitle"><div class="fb-head"><span class="fb-grabber" aria-hidden="true"></span><span class="fb-head-title">Feedback</span><button type="button" class="fb-close" data-fb-action="close" aria-label="Sluiten">'+svg('<path d="M6 6l12 12M18 6 6 18"/>')+'</button></div><div class="fb-body"></div></div>';
    document.body.appendChild(sheet);
    lockScroll(true);
    wireSheet(sheet);
    renderSheet(sheetState.category?'message':'category');
  }

  function showError(text){
    var box=sheet&&sheet.querySelector('.fb-error');if(!box)return;
    box.innerHTML=text;box.hidden=false;
  }
  function errorText(kind){
    var saved=' Je bericht is bewaard.';
    if(kind==='offline')return '<strong>Feedback kon niet worden verstuurd.</strong> Je bent offline.'+saved+' Probeer het opnieuw zodra je weer verbinding hebt.';
    if(kind==='session')return '<strong>Feedback kon niet worden verstuurd.</strong> Je bent uitgelogd.'+saved+' Log opnieuw in en probeer het nog eens.';
    if(kind==='rate')return '<strong>Feedback kon niet worden verstuurd.</strong> Je hebt net veel meldingen gestuurd. Probeer het over een uur opnieuw.';
    if(kind==='screenshot')return '<strong>Feedback kon niet worden verstuurd.</strong> De screenshot kon niet worden geüpload. Probeer het opnieuw of verwijder de screenshot.';
    return '<strong>Feedback kon niet worden verstuurd. Probeer het opnieuw.</strong>'+saved;
  }
  function titleFor(category,message,ocr){
    if(category==='ocr_correction'&&ocr&&ocr.length)return clip('Herkenning klopt niet: '+ocr.map(function(c){return FIELD_LABELS[c.field]||c.field}).join(', '),120);
    var first=String(message||'').trim().split(/\n/)[0].replace(/\s+/g,' ');
    return first.length>70?first.slice(0,67).trim()+'…':first;
  }
  async function submit(form){
    if(submitting)return;
    var ta=form.querySelector('#fbMessage'),err=form.querySelector('#fbMessageError'),btn=form.querySelector('.fb-submit');
    var message=String(ta.value||'').trim();
    sheetState.message=ta.value;
    if(message.length<3){err.hidden=false;ta.setAttribute('aria-invalid','true');ta.focus();return}
    err.hidden=true;ta.removeAttribute('aria-invalid');
    var box=form.querySelector('.fb-error');if(box)box.hidden=true;
    submitting=true;btn.disabled=true;btn.setAttribute('aria-busy','true');btn.textContent='Versturen…';
    saveDraft();
    var extra=Object.assign({},sheetState.extra);
    if(sheetState.ocr&&sheetState.ocr.length)extra.ocrCorrections=sheetState.ocr;
    var report={id:sheetState.id,category:sheetState.category,message:clip(message,MAX_MESSAGE),title:titleFor(sheetState.category,message,sheetState.ocr),context:buildContext(extra),screenshot:sheetState.screenshot};
    try{
      if(navigator.onLine===false)throw Object.assign(new Error('offline'),{code:'OFFLINE'});
      await sendReport(report);
      clearDraft();
      if(sheet){renderSheet('done')}
      refreshPanelReports();
    }catch(e){
      if(!sheet)return;
      var kind=e&&e.stage==='screenshot'?'screenshot':errorKind(e);
      showError(errorText(kind));
      btn.disabled=false;btn.removeAttribute('aria-busy');btn.textContent='Opnieuw proberen';if(!sheet.contains(document.activeElement)||document.activeElement===document.body)btn.focus();
    }finally{submitting=false}
  }

  function wireSheet(root){
    root.addEventListener('click',function(event){
      if(event.target===root){closeSheet();return}
      var choice=event.target.closest('[data-fb-category]');
      if(choice){sheetState.category=choice.getAttribute('data-fb-category');renderSheet('message');return}
      var action=event.target.closest('[data-fb-action]');if(!action)return;
      var name=action.getAttribute('data-fb-action');
      if(name==='close'||name==='done')closeSheet();
      else if(name==='back'){var ta=root.querySelector('#fbMessage');if(ta)sheetState.message=ta.value;renderSheet('category')}
      else if(name==='pick-shot'){var f=root.querySelector('.fb-file');if(f){f.value='';f.click()}}
      else if(name==='remove-shot'){
        if(sheetState.screenshotUrl)URL.revokeObjectURL(sheetState.screenshotUrl);
        sheetState.screenshot=null;sheetState.screenshotUrl=null;
        var t=root.querySelector('#fbMessage');if(t)sheetState.message=t.value;
        renderSheet('message');var add=root.querySelector('.fb-add-shot');if(add)add.focus();
      }
      else if(name==='show-reports'){closeSheet();openMyReports()}
    });
    root.addEventListener('input',function(event){
      if(event.target.id==='fbMessage'){sheetState.message=event.target.value;saveDraft();var e=root.querySelector('#fbMessageError');if(e&&event.target.value.trim().length>=3){e.hidden=true;event.target.removeAttribute('aria-invalid')}}
    });
    root.addEventListener('change',async function(event){
      if(!event.target.classList.contains('fb-file'))return;
      var file=event.target.files&&event.target.files[0];if(!file)return;
      var t=root.querySelector('#fbMessage');if(t)sheetState.message=t.value;
      try{
        var blob=await prepareScreenshot(file);
        if(!sheet)return;
        if(sheetState.screenshotUrl)URL.revokeObjectURL(sheetState.screenshotUrl);
        sheetState.screenshot=blob;sheetState.screenshotUrl=URL.createObjectURL(blob);
        renderSheet('message');
        var rm=root.querySelector('[data-fb-action="remove-shot"]');if(rm)rm.focus();
      }catch(e){
        showError(e&&e.message==='size'?'Deze afbeelding is te groot. Kies een screenshot kleiner dan 15 MB.':'Deze afbeelding kan niet worden gebruikt. Kies een PNG- of JPG-bestand.');
      }
    });
    root.addEventListener('submit',function(event){event.preventDefault();submit(event.target)});
    root.addEventListener('keydown',function(event){
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeSheet();return}
      if(event.key==='Tab'){
        var list=focusables(root.querySelector('.fb-sheet'));if(!list.length)return;
        var first=list[0],last=list[list.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
      }
    });
  }

  // ---------- Mijn meldingen ----------
  function statusPill(status){var label=CUSTOMER_STATUS[status]||CUSTOMER_STATUS.received;return '<span class="fb-status fb-status-'+esc(CUSTOMER_STATUS[status]?status:'received')+'">'+esc(label)+'</span>'}
  function categoryLabel(internal){var c=categoryFor(customerCategory(internal));return c?c.label:'Feedback'}
  function reportsListHtml(rows){
    if(!rows.length)return '<p class="fb-empty">Je hebt nog geen meldingen gestuurd.</p>';
    return '<ul class="fb-reports">'+rows.map(function(r){
      return '<li><button type="button" class="fb-report" data-fb-report="'+esc(r.id)+'"><span class="fb-report-main"><strong>'+esc(r.title||categoryLabel(r.category))+'</strong><span>'+esc(dateLabel(r.created_at))+'</span></span>'+statusPill(r.customer_status)+svg('<path d="m9 6 6 6-6 6"/>','fb-chevron')+'</button></li>';
    }).join('')+'</ul>';
  }
  var cachedReports=[];
  async function refreshPanelReports(){
    var box=document.querySelector('[data-fb-reports]');if(!box)return;
    if(!userId()){box.innerHTML='<p class="fb-empty">Log in om je meldingen te zien.</p>';return}
    box.setAttribute('aria-busy','true');
    if(!box.querySelector('.fb-reports,.fb-empty'))box.innerHTML='<p class="fb-empty">Meldingen laden…</p>';
    try{
      cachedReports=await fetchReports();
      box.innerHTML=reportsListHtml(cachedReports);
      markResolvedSeen(cachedReports);
    }catch(e){
      box.innerHTML='<div class="fb-load-error"><p>Je meldingen konden niet worden geladen.</p><button type="button" class="btn small" data-fb-retry-reports>Opnieuw proberen</button></div>';
    }finally{box.removeAttribute('aria-busy')}
  }
  function openMyReports(){
    if(typeof window.openSettingsSection==='function')window.openSettingsSection('help');
    setTimeout(function(){var h=document.getElementById('fbMyReportsTitle');if(h){h.scrollIntoView({block:'start'});h.focus({preventScroll:true})}},60);
  }
  async function openReport(id){
    var r=cachedReports.filter(function(x){return x.id===id})[0];if(!r)return;
    if(sheet)closeSheet();
    returnFocus=document.activeElement;
    sheet=document.createElement('div');sheet.className='fb-backdrop';
    sheet.innerHTML='<div class="fb-sheet" role="dialog" aria-modal="true" aria-labelledby="fbTitle"><div class="fb-head"><span class="fb-grabber" aria-hidden="true"></span><span class="fb-head-title">Melding</span><button type="button" class="fb-close" data-fb-action="close" aria-label="Sluiten">'+svg('<path d="M6 6l12 12M18 6 6 18"/>')+'</button></div><div class="fb-body"><div class="fb-step fb-detail">'
      +'<h2 class="fb-title" id="fbTitle" tabindex="-1">'+esc(r.title||categoryLabel(r.category))+'</h2>'
      +'<div class="fb-detail-meta">'+statusPill(r.customer_status)+'<span>'+esc(categoryLabel(r.category))+' · '+esc(dateLabel(r.created_at))+'</span></div>'
      +(r.customer_reply?'<div class="fb-reply"><strong>Reactie van BOEKUNA</strong><p>'+esc(r.customer_reply)+'</p></div>':'')
      +'<div class="fb-detail-block"><strong>Jouw bericht</strong><p class="fb-message-text">'+esc(r.message)+'</p></div>'
      +(r.screenshot_path?'<div class="fb-detail-block"><strong>Screenshot</strong><div class="fb-detail-shot" data-fb-shot-path="'+esc(r.screenshot_path)+'"><span>Screenshot laden…</span></div></div>':'')
      +'</div></div></div>';
    document.body.appendChild(sheet);lockScroll(true);
    sheetState={step:'detail'};
    wireSheet(sheet);
    sheet.querySelector('#fbTitle').focus({preventScroll:true});
    var holder=sheet.querySelector('[data-fb-shot-path]');
    if(holder){
      try{var url=await screenshotUrl(holder.getAttribute('data-fb-shot-path'));if(holder.isConnected)holder.innerHTML='<img src="'+esc(url)+'" alt="Je screenshot bij deze melding">'}
      catch(e){if(holder.isConnected)holder.innerHTML='<span>De screenshot kon niet worden geladen.</span>'}
    }
  }

  // Settings → Hulp & feedback panel.
  function panelHtml(){
    return '<div class="settings-center-block fb-panel-give"><div class="fb-give"><div><h3>Feedback geven</h3><p>Werkt iets niet, klopt iets niet of heb je een idee? Laat het ons weten.</p></div><button type="button" class="btn primary" data-fb-open>Feedback geven</button></div></div>'
      +'<div class="settings-center-block"><h3 id="fbMyReportsTitle" tabindex="-1">Mijn meldingen</h3><div data-fb-reports aria-live="polite"><p class="fb-empty">Meldingen laden…</p></div></div>'
      +'<div class="settings-center-block"><h3>Hulp nodig</h3>'
      +'<div class="settings-center-line"><div><strong>Mail ons</strong><span>We reageren op werkdagen.</span></div><a class="btn" href="'+esc(typeof SUPPORT_MAILTO!=='undefined'?SUPPORT_MAILTO:'mailto:support@boekuna.nl')+'">'+esc(typeof SUPPORT_EMAIL!=='undefined'?SUPPORT_EMAIL:'support@boekuna.nl')+'</a></div>'
      +'<div class="settings-center-line"><div><strong>Fiscale spelregels</strong><span>De uitgangspunten die Boekuna gebruikt voor btw en facturen.</span></div><button class="btn" type="button" onclick="showLegal()">Bekijken</button></div>'
      +'</div>'
      +legalLinksHtml();
  }

  // Privacy, terms and deletion info live on boekuna.nl; the build passes the URLs in
  // window.BOEKUNA_PUBLIC_LINKS (generated from the same map as all other public links).
  function legalLinksHtml(){
    var links=window.BOEKUNA_PUBLIC_LINKS||{};
    var rows=[['/privacy/','Privacyverklaring','Welke gegevens Boekuna gebruikt en waarom.'],['/voorwaarden/','Algemene voorwaarden','De afspraken over het gebruik van Boekuna.'],['/account-verwijderen/','Account en gegevens verwijderen','Wat er gebeurt als je je account verwijdert.']];
    var html='';
    rows.forEach(function(r){var href=links[r[0]]||('https://boekuna.nl'+r[0]);html+='<div class="settings-center-line"><div><strong>'+esc(r[1])+'</strong><span>'+esc(r[2])+'</span></div><a class="btn" href="'+esc(href)+'" target="_blank" rel="noopener">Openen</a></div>'});
    return '<div class="settings-center-block"><h3>Privacy en voorwaarden</h3>'+html+'</div>';
  }

  // ---------- Resolved feedback: a calm in-app note, once ----------
  function markResolvedSeen(rows){
    var latest=rows.filter(function(r){return r.customer_status==='resolved'}).map(function(r){return r.status_changed_at||''}).sort().pop();
    if(latest)lsSet(storageKey('seen'),latest);
  }
  async function checkResolved(){
    if(!userId()||lsGet(storageKey('active'))!=='1')return;
    try{
      var rows=await fetchReports(),seen=lsGet(storageKey('seen'))||'';
      var fresh=rows.filter(function(r){return r.customer_status==='resolved'&&(r.status_changed_at||'')>seen});
      if(!fresh.length)return;
      cachedReports=rows;
      var r=fresh[0],label=fresh.length>1?'Er zijn '+fresh.length+' meldingen van je opgelost.':'Je melding is opgelost: '+(r.title||categoryLabel(r.category));
      actionToast(label,'Bekijken',function(){markResolvedSeen(rows);openMyReports()});
    }catch(e){}
  }

  // ---------- Action toast (used by contextual entry points) ----------
  function actionToast(text,label,onClick,ms){
    var host=document.getElementById('toastRoot')||document.body;
    var el=document.createElement('div');el.className='toast fb-action-toast';el.setAttribute('role','status');
    el.innerHTML='<span>'+esc(text)+'</span><button type="button">'+esc(label)+'</button><button type="button" class="fb-toast-close" aria-label="Sluiten">×</button>';
    var timer=setTimeout(function(){el.remove()},ms||9000);
    el.querySelector('button').addEventListener('click',function(){clearTimeout(timer);el.remove();onClick()});
    el.querySelector('.fb-toast-close').addEventListener('click',function(){clearTimeout(timer);el.remove()});
    host.appendChild(el);
    return el;
  }

  // ---------- Contextual entry points (same central sheet, context pre-filled) ----------
  function reportButton(label,opts){
    var b=document.createElement('button');b.type='button';b.className='btn fb-context-btn';b.textContent=label;
    b.setAttribute('data-fb-context','1');
    b.addEventListener('click',function(){open(typeof opts==='function'?opts():opts)});
    return b;
  }

  function installContextual(){
    // Upload/processing error dialog.
    if(typeof showUploadError==='function'&&typeof uploadErrorInfo==='function'){
      var originalShowUploadError=showUploadError;
      showUploadError=function(err,file){
        var result=originalShowUploadError.apply(this,arguments),info={};
        try{info=uploadErrorInfo(err)||{}}catch(e){}
        var foot=document.querySelector('#modalRoot .modal-foot');
        if(foot&&info.code!=='ACCOUNT_READ_ONLY'&&!foot.querySelector('[data-fb-context]'))foot.insertBefore(reportButton('Probleem melden',{category:'bug',feature:'document-upload',errorCode:info.code||'',referenceId:info.referenceId||''}),foot.firstChild);
        return result;
      };
    }
    // Failed items in the processing list.
    var observer=new MutationObserver(function(){
      document.querySelectorAll('.processing-error').forEach(function(box){
        if(box.querySelector('[data-fb-context]'))return;
        var row=box.querySelector('button[onclick*="chooseAnotherDocumentProcessingItem"]');if(!row)return;
        var m=(row.getAttribute('onclick')||'').match(/chooseAnotherDocumentProcessingItem\('([^']+)'\)/);
        var id=m?m[1]:'';
        row.parentElement.appendChild(reportButton('Probleem melden',function(){
          var item=null;try{item=documentProcessingSession&&documentProcessingSession.items.filter(function(x){return x.id===id})[0]}catch(e){}
          var err=item&&item.error||{};
          return {category:'bug',feature:'document-processing',errorCode:err.code||err.errorCode||'',referenceId:err.referenceId||'',processingJobId:item&&(item.jobId||item.serverJobId)||''};
        }));
      });
    });
    observer.observe(document.body,{childList:true,subtree:true});
    // Bank import errors open a dialog; offer the same report action in its footer.
    if(typeof showBankImportError==='function'){
      var originalBankError=showBankImportError;
      showBankImportError=function(code){
        var result=originalBankError.apply(this,arguments);
        var foot=document.querySelector('#modalRoot .modal-foot');
        if(foot&&!foot.querySelector('[data-fb-context]'))foot.insertBefore(reportButton('Probleem melden',{category:'bug',feature:'bank-import',errorCode:'BANK_'+String(code||'unreadable').toUpperCase().replace(/[^A-Z0-9_]/g,'_').slice(0,40)}),foot.firstChild);
        return result;
      };
    }
    installDocumentReview();
  }

  // Document controleren: record corrections privately with the document, and offer an optional,
  // subtle "Herkenning klopt niet?" only once the user actually changed a recognised value.
  function installDocumentReview(){
    if(typeof savePdfInvoiceImport==='function'){
      var originalSave=savePdfInvoiceImport;
      savePdfInvoiceImport=async function(){
        var ctx=typeof pendingPdfImport!=='undefined'?pendingPdfImport:null,d=ctx&&ctx.parsed,snapshot=null,original=null;
        try{if(d&&window.BookunaDocumentReviewV2)snapshot=window.BookunaDocumentReviewV2.captureReviewSnapshot();original=d&&d.recognitionOriginal?JSON.parse(JSON.stringify(d.recognitionOriginal)):null}catch(e){}
        var beforeIds=new Set((state.documents||[]).map(function(x){return x.id})),ref=String(ctx&&ctx.sourceClientRef||'');
        var result=await originalSave.apply(this,arguments);
        try{
          if(d&&snapshot&&original&&!(typeof pendingPdfImport!=='undefined'&&pendingPdfImport===ctx)){
            var doc=(ref&&state.documents.filter(function(x){return String(x.fileId||'')===ref})[0])||state.documents.filter(function(x){return !beforeIds.has(x.id)})[0];
            var list=diffRecognition(original,snapshot,d),version=processorVersion(d);
            if(doc&&list.length){
              if(version)list.forEach(function(x){x.processorVersion=version});
              // Stored only in the user's own administration; never sent unless the user reports it.
              doc.recognitionCorrections={recordedAt:new Date().toISOString(),documentType:snapshot.documentType||'',fields:list};
              if(typeof save==='function')save();
            }
          }
        }catch(e){}
        return result;
      };
    }
    // Live hint inside the review wizard.
    document.addEventListener('input',reviewHint,true);
    document.addEventListener('change',reviewHint,true);
    if(typeof openSavedDocumentReview==='function'){
      var originalSaved=openSavedDocumentReview;
      openSavedDocumentReview=function(id){
        var result=originalSaved.apply(this,arguments);
        var doc=(state.documents||[]).filter(function(x){return x.id===id})[0],foot=document.querySelector('#modalRoot .modal-foot');
        if(doc&&doc.recognitionCorrections&&doc.recognitionCorrections.fields&&doc.recognitionCorrections.fields.length&&foot&&!foot.querySelector('[data-fb-context]')){
          foot.insertBefore(reportButton('Herkenning klopt niet?',{category:'ocr_correction',feature:'document-review',documentId:doc.id,documentType:doc.recognitionCorrections.documentType,ocrCorrections:doc.recognitionCorrections.fields}),foot.firstChild);
        }
        return result;
      };
    }
  }
  var hintTimer=null;
  function reviewHint(event){
    var form=event.target&&event.target.closest&&event.target.closest('#pdfImportForm');if(!form)return;
    clearTimeout(hintTimer);
    hintTimer=setTimeout(function(){
      var live=liveReviewCorrections(),host=document.querySelector('#modalRoot .document-review-fields');if(!host)return;
      var hint=host.querySelector('.fb-review-hint');
      if(!live.corrections.length){if(hint)hint.remove();return}
      if(hint)return;
      hint=document.createElement('p');hint.className='fb-review-hint';
      hint.innerHTML='<span>Herkenning klopt niet?</span> ';
      var b=document.createElement('button');b.type='button';b.className='fb-link';b.textContent='Help BOEKUNA verbeteren';
      b.addEventListener('click',function(){
        var now=liveReviewCorrections(),d=typeof pendingPdfImport!=='undefined'&&pendingPdfImport?pendingPdfImport.parsed:null;
        open({category:'ocr_correction',feature:'document-review',documentType:now.documentType,documentId:d&&(d.documentId||d.id)||'',ocrCorrections:now.corrections});
      });
      hint.appendChild(b);host.appendChild(hint);
    },250);
  }

  // ---------- Install ----------
  function wireGlobal(){
    document.addEventListener('click',function(event){
      var opener=event.target.closest&&event.target.closest('[data-fb-open]');
      if(opener){event.preventDefault();open({});return}
      var rep=event.target.closest&&event.target.closest('[data-fb-report]');
      if(rep){event.preventDefault();openReport(rep.getAttribute('data-fb-report'));return}
      if(event.target.closest&&event.target.closest('[data-fb-retry-reports]')){event.preventDefault();refreshPanelReports()}
    });
  }
  var installed=false;
  function install(){
    if(installed)return;installed=true;
    wireGlobal();
    installContextual();
    setTimeout(checkResolved,6000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();

  window.BoekunaFeedback=Object.freeze({
    open:open,
    close:closeSheet,
    openMyReports:openMyReports,
    panelHtml:panelHtml,
    refreshPanelReports:refreshPanelReports,
    buildContext:buildContext,
    diffRecognition:diffRecognition,
    categories:CATEGORIES.map(function(c){return {key:c.key,label:c.label,prompt:c.prompt}}),
    customerStatus:Object.assign({},CUSTOMER_STATUS),
    checkResolved:checkResolved
  });
})();
