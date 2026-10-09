/* BOEKUNA rustige look — euro's first: the cents of an amount are set smaller and lighter.
   Only touches elements whose whole text is one amount, so innerText/textContent stay exactly the same. */
(function(){
  'use strict';
  var SELECTOR='.metric-value,.mobile-card-value,td.money,.product-kpi-value,.dashboard-summary-value';
  var AMOUNT=/^([^\d]*-?\s?€?\s?-?\d[\d.]*)(,\d{2})$/;

  function set(el,text){
    var m=AMOUNT.exec(text);
    if(!m){el.textContent=text;return}
    el.textContent=m[1];
    var cents=document.createElement('span');
    cents.className='amount-cents';cents.textContent=m[2];
    el.appendChild(cents);
  }
  function cents(el){
    if(!el||el.dataset.counting||el.querySelector('.amount-cents'))return;
    if(el.children.length)return; // Leave mixed markup alone.
    var text=el.textContent;
    if(AMOUNT.test(text.trim()))set(el,text);
  }
  function scan(root){
    if(!root||root.nodeType!==1)return;
    if(root.matches&&root.matches(SELECTOR))cents(root);
    root.querySelectorAll(SELECTOR).forEach(cents);
  }
  window.boekunaLook={cents:cents,setAmount:set};

  function install(){
    var content=document.getElementById('content');
    if(!content)return;
    scan(content);
    new MutationObserver(function(records){
      records.forEach(function(r){
        r.addedNodes.forEach(function(n){if(n.nodeType===1)scan(n)});
        // An amount whose text was replaced in place (e.g. the phone layout restoring a value).
        if(r.target.nodeType===1&&r.target.matches(SELECTOR))cents(r.target);
      });
    }).observe(content,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();

/* 14. The round Nieuw button only floats on the pages where you add things; settings and reports keep their own controls free. */
(function(){
  'use strict';
  var FAB_PAGES={dashboard:1,invoices:1,expenses:1,documents:1,bank:1,contacts:1,income:1,outgoings:1};
  function sync(){
    var app=document.getElementById('mainApp');if(!app)return;
    var current='';try{current=typeof page!=='undefined'?String(page):''}catch(e){}
    if(FAB_PAGES[current])app.setAttribute('data-fab','');else app.removeAttribute('data-fab');
  }
  function install(){
    var content=document.getElementById('content');
    if(!content)return;
    sync();
    new MutationObserver(sync).observe(content,{childList:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();

/* 41. A button that starts something slow shows a small spinner and can't be pressed twice.
   Wraps the app's own async actions; the button is the one just clicked (or the form's submit button). */
(function(){
  'use strict';
  var ACTIONS=['finalSaveInvoice','finalizeDraftAndSend','sharePreparedInvoice','sendReminder','savePdfInvoiceImport','keepDocumentInArchiveOnly','retryPersistentDocument','retryDocumentProcessingItem','retryCloudSave','restoreCloudVersion','restoreConflictBackup','syncOfflineDrafts','refreshBillingCard','openBillingPortal','deleteAccountNow','disableMfa','startMfaEnrollment','verifyMfaEnrollment','loginUser','registerUser','sendPasswordReset','updateRecoveredPassword','verifyMfaLogin'];
  var SHOW_AFTER=250,GIVE_UP=15000;
  var last=null,lastAt=0;
  function remember(btn){last=btn;lastAt=Date.now()}
  document.addEventListener('click',function(e){
    var btn=e.target&&e.target.closest&&e.target.closest('button');
    if(!btn)return;
    if(btn.dataset.busy){e.preventDefault();e.stopPropagation();return} // Second press while busy.
    remember(btn);
  },true);
  document.addEventListener('submit',function(e){
    var form=e.target,btn=e.submitter||(form.querySelector&&form.querySelector('button[type=submit],button:not([type])'));
    if(btn&&btn.dataset.busy){e.preventDefault();e.stopPropagation();return}
    if(btn)remember(btn);
  },true);
  function busy(btn,promise){
    btn.dataset.busy='1';
    var wasDisabled=null;
    var show=setTimeout(function(){
      if(!btn.isConnected)return;
      wasDisabled=btn.disabled;
      btn.classList.add('is-busy');btn.setAttribute('aria-busy','true');btn.disabled=true;
    },SHOW_AFTER);
    var stop=setTimeout(done,GIVE_UP);
    function done(){
      clearTimeout(show);clearTimeout(stop);
      delete btn.dataset.busy;
      if(!btn.classList.contains('is-busy'))return;
      btn.classList.remove('is-busy');btn.removeAttribute('aria-busy');
      if(wasDisabled===false)btn.disabled=false; // The action itself may have disabled it on purpose.
    }
    promise.then(done,done);
  }
  function wrap(name){
    var original=window[name];
    if(typeof original!=='function'||original.boekunaBusy)return;
    var wrapped=function(){
      var result=original.apply(this,arguments);
      var btn=last;
      if(result&&typeof result.then==='function'&&btn&&btn.isConnected&&Date.now()-lastAt<600&&!btn.dataset.busy)busy(btn,result);
      return result;
    };
    wrapped.boekunaBusy=true;
    window[name]=wrapped;
  }
  function install(){ACTIONS.forEach(wrap)}
  window.boekunaBusy={wrap:wrap};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();

/* 61. A wrong or missing field turns red with one sentence under it, instead of a browser bubble. */
(function(){
  'use strict';
  var round=0,focused=-1;
  function amount(v,el){var n=Number(v);if(!isFinite(n))return v;var cents=String(el.step||'').indexOf('.')>=0;return n.toLocaleString('nl-NL',cents?{minimumFractionDigits:2,maximumFractionDigits:2}:{})}
  function message(el){
    var v=el.validity;
    if(v.valueMissing)return el.type==='checkbox'?'Vink dit aan om verder te gaan.':el.type==='radio'||el.tagName==='SELECT'?'Kies er een.':'Vul dit in.';
    if(v.typeMismatch&&el.type==='email')return 'Dit e-mailadres klopt nog niet.';
    if(v.typeMismatch&&el.type==='url')return 'Dit webadres klopt nog niet.';
    if(v.rangeUnderflow)return 'Dit moet minimaal '+amount(el.min,el)+' zijn.';
    if(v.rangeOverflow)return 'Dit mag maximaal '+amount(el.max,el)+' zijn.';
    if(v.stepMismatch)return String(el.step||'').indexOf('.')>=0?'Gebruik maximaal twee cijfers achter de komma.':'Gebruik een heel getal.';
    if(v.tooShort)return 'Dit is te kort (minimaal '+el.minLength+' tekens).';
    if(v.tooLong)return 'Dit is te lang.';
    if(v.badInput)return 'Vul een getal in.';
    if(v.patternMismatch)return el.title||'Dit klopt nog niet.';
    return el.validationMessage||'Dit klopt nog niet.';
  }
  function clear(field,el){
    field.classList.remove('has-error');
    if(el)el.removeAttribute('aria-invalid');
    var note=field.querySelector(':scope>.field-error-text');if(note)note.remove();
  }
  function show(field,el,text){
    field.classList.add('has-error');
    el.setAttribute('aria-invalid','true');
    var note=field.querySelector(':scope>.field-error-text');
    if(!note){
      note=document.createElement('div');note.className='field-error-text';note.id='fieldError-'+Math.random().toString(36).slice(2,9);
      field.appendChild(note);
      var described=(el.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean);
      if(described.indexOf(note.id)<0){described.push(note.id);el.setAttribute('aria-describedby',described.join(' '))}
    }
    note.textContent=text;
  }
  document.addEventListener('invalid',function(e){
    var el=e.target,field=el&&el.closest&&el.closest('.field');
    // The document review keeps its own checks (owned by that flow).
    if(!field||el.closest('#pdfImportForm'))return;
    e.preventDefault();
    show(field,el,message(el));
    // Several fields can fail in one go: only the first gets focus.
    if(focused!==round){focused=round;try{el.focus({preventScroll:true})}catch(_){}field.scrollIntoView({block:'center',behavior:'smooth'})}
    setTimeout(function(){round++},0);
  },true);
  function recheck(e){
    var el=e.target,field=el&&el.closest&&el.closest('.field.has-error');
    if(!field||!el.willValidate)return;
    if(el.validity.valid){
      // A radio group is fine as soon as one is picked.
      clear(field,el);
      field.querySelectorAll('[aria-invalid]').forEach(function(x){x.removeAttribute('aria-invalid')});
    }else if(e.type==='change')show(field,el,message(el));
  }
  document.addEventListener('input',recheck,true);
  document.addEventListener('change',recheck,true);
})();
