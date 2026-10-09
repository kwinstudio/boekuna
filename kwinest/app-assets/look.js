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

/* Meer menu (style C, screen 10): on the phone the drawer shows who you are and your plan on top,
   and a dark-mode switch at the bottom. Presentation only: the switch uses the existing theme API. */
(function(){
  'use strict';
  function txt(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function who(){
    var c=(typeof state!=='undefined'&&state&&state.company)||{};
    var name=c.contactName||c.tradeName||c.name||((typeof currentUser!=='undefined'&&currentUser&&currentUser.email)||'');
    var plan='';
    try{var r=typeof currentPlanRank==='function'?currentPlanRank():null;if(r!==null&&typeof PLAN_RANK_LABEL!=='undefined'&&PLAN_RANK_LABEL[r])plan=PLAN_RANK_LABEL[r]+'-abonnement'}catch(e){}
    var initials=String(name).split(/[\s@.]+/).filter(Boolean).slice(0,2).map(function(w){return w.charAt(0).toUpperCase()}).join('')||'B';
    return {name:name,plan:plan,initials:initials};
  }
  function sync(){
    var side=document.getElementById('sidebar');if(!side)return;
    var head=side.querySelector('.drawer-profile');
    if(!head){
      head=document.createElement('button');head.type='button';head.className='drawer-profile';
      head.addEventListener('click',function(){if(typeof navigate==='function')navigate('settings')});
      var brand=side.querySelector('.brand');if(brand)brand.after(head);else side.prepend(head);
    }
    var w=who();
    head.innerHTML='<span class="drawer-avatar" aria-hidden="true">'+txt(w.initials)+'</span><span class="drawer-who"><strong>'+txt(w.name||'Jouw account')+'</strong>'+(w.plan?'<span>'+txt(w.plan)+'</span>':'')+'</span>';
    head.setAttribute('aria-label','Account: '+(w.name||'jouw account')+(w.plan?', '+w.plan:''));
    var sw=side.querySelector('.drawer-theme');
    if(!sw&&window.BoekunaTheme){
      sw=document.createElement('button');sw.type='button';sw.className='drawer-theme';sw.setAttribute('role','switch');
      sw.innerHTML='<span>Donkere modus</span><span class="drawer-switch" aria-hidden="true"><i></i></span>';
      sw.addEventListener('click',function(){window.BoekunaTheme.set(window.BoekunaTheme.resolved()==='dark'?'light':'dark');sync()});
      side.appendChild(sw);
    }
    if(sw&&window.BoekunaTheme)sw.setAttribute('aria-checked',window.BoekunaTheme.resolved()==='dark'?'true':'false');
  }
  document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('#mobileMenu'))sync()},true);
  document.addEventListener('boekuna:themechange',sync);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync);else sync();
})();

/* 21. Pull down to refresh on the phone. It reloads the app the normal way (the same as closing
   and reopening it), and only when everything is saved, so nothing that is still being stored is lost. */
(function(){
  'use strict';
  var phone=matchMedia('(max-width:820px) and (pointer:coarse)');
  var startY=null,dy=0,pill=null,armed=false,TRIGGER=80;
  function ui(){
    if(pill)return pill;
    pill=document.createElement('div');pill.className='pull-refresh';pill.setAttribute('role','status');pill.setAttribute('aria-live','polite');
    pill.innerHTML='<span class="pull-refresh-spin" aria-hidden="true"></span><span class="pull-refresh-text"></span>';
    document.body.appendChild(pill);return pill;
  }
  function blocked(target){
    var app=document.getElementById('mainApp');
    if(!app||app.classList.contains('hidden')||!phone.matches)return true;
    if(document.querySelector('#modalRoot .modal-backdrop'))return true;
    if(document.body.classList.contains('mobile-drawer-open')||document.getElementById('sidebar')?.classList.contains('open'))return true;
    return !(target&&target.closest&&target.closest('#content'))||(window.scrollY||document.documentElement.scrollTop)>0;
  }
  function show(text,y){var p=ui();p.querySelector('.pull-refresh-text').textContent=text;p.classList.add('is-visible');p.style.transform='translate(-50%,'+Math.min(0,y-60)+'px)'}
  function hide(){if(pill){pill.classList.remove('is-visible','is-loading');pill.style.transform=''}}
  document.addEventListener('touchstart',function(e){startY=e.touches.length===1&&!blocked(e.target)?e.touches[0].clientY:null;dy=0;armed=false},{passive:true});
  document.addEventListener('touchmove',function(e){
    if(startY==null)return;
    dy=e.touches[0].clientY-startY;
    if(dy<=8||(window.scrollY||0)>0){hide();return}
    armed=dy>TRIGGER;
    show(armed?'Laat los om te verversen':'Trek om te verversen',Math.min(dy,TRIGGER+20));
  },{passive:true});
  document.addEventListener('touchend',function(){
    if(startY==null)return;startY=null;
    if(!armed){hide();return}
    var status=typeof cloudSyncStatus!=='undefined'?cloudSyncStatus:'saved';
    if(!navigator.onLine||status==='offline'){show('Geen verbinding',80);setTimeout(hide,1600);return}
    if(status!=='saved'){show('Even wachten, nog aan het opslaan',80);setTimeout(hide,1800);return}
    var p=ui();p.classList.add('is-loading');show('Nieuwste ophalen…',80);
    setTimeout(function(){location.reload()},150);
  },{passive:true});
})();

/* 16. iPhone quick actions (hold the app icon): the native shell calls boekunaQuickAction('scan'|'invoice').
   It waits until you are logged in. Scanning asks for one tap, because iOS only opens the camera after a tap. */
(function(){
  'use strict';
  var pending=null,timer=null,tries=0;
  function ready(){var app=document.getElementById('mainApp');return typeof currentUser!=='undefined'&&!!currentUser&&!!app&&app.style.display!=='none'&&!app.classList.contains('hidden')}
  function run(){
    if(!pending)return;
    if(!ready()){if(++tries<240){clearTimeout(timer);timer=setTimeout(run,500)}return}
    var action=pending;pending=null;tries=0;
    try{if(typeof closeModal==='function')closeModal()}catch(e){}
    if(action==='invoice'&&typeof newInvoice==='function'){newInvoice();return}
    if(action==='scan'&&typeof modal==='function'){
      modal('Bon scannen','<p class="quick-scan-text">Maak een foto van je bon. Boekuna leest hem uit.</p>',
        '<button class="btn" type="button" onclick="closeModal()">Annuleren</button><button class="btn primary" type="button" onclick="closeModal();openUploadSourcePicker(\'auto\',true)">Camera openen</button>');
    }
  }
  window.boekunaQuickAction=function(action){
    if(action!=='scan'&&action!=='invoice')return false;
    pending=action;tries=0;run();return true;
  };
})();
