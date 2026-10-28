/* BOEKUNA handig — small tricks you feel but do not see (Kwin 2026-10-28, "trucjes" 1-12, 14).
   The right keyboard per field, Enter jumps to the next field, amounts read the way you type them (12,50 · 1.234,56 ·
   3 x 45 · 100 + 21%), smart pre-fill, invisible bigger tap areas, swipe and long press in lists, the save button stays
   above the keyboard, shortcuts on a computer and a form error takes you to the field. Styling lives in handig.css.
   Search that forgives typos (13) and the kept half invoice (15) live in the app itself. */
(function(){
  'use strict';
  var root=document.documentElement;
  // Automated browsers (tests, screenshots) get the plain app like motion.js and press.js; ?handig=1 turns it on.
  var forced=/[?&]handig=1\b/.test(location.search);
  var testRun=false;
  try{testRun=typeof TEST_MODE_NO_AUTH!=='undefined'&&TEST_MODE_NO_AUTH===true}catch(e){}
  if((navigator.webdriver||testRun)&&!forced)return;
  root.classList.add('boekuna-handig');

  var phone=window.matchMedia?window.matchMedia('(max-width: 820px)'):{matches:false};
  var coarse=window.matchMedia?window.matchMedia('(pointer: coarse)'):{matches:false};
  // App helpers are global functions; state and editingInvoiceId are global let-bindings, read by name.
  function app(name){return typeof window[name]==='function'?window[name]:null}
  function call(name){var fn=app(name);if(!fn)return false;fn.apply(null,[].slice.call(arguments,1));return true}
  function appState(){try{return typeof state!=='undefined'?state:null}catch(e){return null}}
  function editingInvoice(){try{return typeof editingInvoiceId!=='undefined'?editingInvoiceId:null}catch(e){return null}}
  function visible(el){return !!el&&el.offsetParent!==null&&!el.disabled&&!el.hidden}
  function modalOpen(){return !!document.querySelector('#modalRoot [role="dialog"]')}
  function tick(){try{var h=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.boekunaHaptic;if(h){h.postMessage('tap');return}}catch(e){}try{if(navigator.vibrate)navigator.vibrate(10)}catch(e){}}

  /* ---------- 3. Amounts: read them the way people type them ---------- */
  function plainNumber(s){
    s=s.replace(/,-$/,',00');
    var c=s.lastIndexOf(','),d=s.lastIndexOf('.');
    if(c>-1&&d>-1){s=c>d?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'')}
    else if(c>-1){s=s.replace(/\./g,'').replace(',','.')}
    else if(d>-1&&/^\d{1,3}(\.\d{3})+$/.test(s)){s=s.replace(/\./g,'')}
    if(!/^(\d+\.?\d*|\.\d+)$/.test(s))throw new Error('nan');
    return parseFloat(s);
  }
  // A small sum: + - * / and x, brackets, and "+ 21%" (adds 21 percent of what comes before).
  function readAmount(raw){
    var s=String(raw==null?'':raw).toLowerCase().replace(/€|eur\b/g,'').replace(/\s+/g,'').replace(/[x×]/g,'*').replace(/,-(?![\d])/g,',00').replace(/=$/,'');
    if(!s)return null;
    var tokens=s.match(/[\d.,]+|[+\-*\/%()]/g);
    if(!tokens||tokens.join('')!==s)throw new Error('nan');
    var i=0;
    function peek(){return tokens[i]}
    function next(){return tokens[i++]}
    function factor(){
      var t=next();
      if(t==='('){var v=sum();if(next()!==')')throw new Error('nan');return v}
      if(t==='-')return -factor();
      if(t==='+')return factor();
      if(t===undefined)throw new Error('nan');
      return plainNumber(t);
    }
    function product(){
      var v=factor();
      while(peek()==='*'||peek()==='/'||peek()==='%'){
        var o=next();
        if(o==='%'){v=v/100;continue}
        var r=factor();if(peek()==='%'){next();r=r/100}
        v=o==='*'?v*r:v/r;
      }
      return v;
    }
    function sum(){
      var v=product();
      while(peek()==='+'||peek()==='-'){
        var o=next(),save=i,r=factor();
        if(peek()==='%'&&(tokens[i+1]===undefined||/[+\-)]/.test(tokens[i+1]))){next();r=v*r/100}else{i=save;r=product()}
        v=o==='+'?v+r:v-r;
      }
      return v;
    }
    var value=sum();
    if(i!==tokens.length||!isFinite(value))throw new Error('nan');
    return Math.round(value*1e6)/1e6;
  }
  window.boekunaReadAmount=readAmount;
  var SUM=/[+*\/x×%(]|\d\s*-\s*\d/i;
  function dutch(n,decimals){
    if(decimals&&Math.round(n*100)%100!==0)return n.toFixed(2).replace('.',',');
    var s=String(Math.round(n*1e6)/1e6);
    return s.replace('.',',');
  }

  /* ---------- 1. The right keyboard per field ---------- */
  var nativeValue=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
  // A former number field: shows "12,50" while the app keeps reading "12.5" (value and FormData).
  function makeAmountField(el){
    var step=el.getAttribute('step'),whole=!step||/^\d+$/.test(step);
    var min=el.getAttribute('min'),max=el.getAttribute('max');
    el.dataset.bkNum=whole?'whole':'decimal';
    if(min!=null)el.dataset.bkMin=min;
    if(max!=null)el.dataset.bkMax=max;
    var shown=nativeValue.get.call(el);
    el.type='text';
    el.setAttribute('inputmode',whole?'numeric':'decimal');
    el.setAttribute('autocomplete','off');
    el.setAttribute('autocorrect','off');
    el.setAttribute('spellcheck','false');
    Object.defineProperty(el,'value',{configurable:true,
      get:function(){var raw=nativeValue.get.call(this);if(!String(raw).trim())return '';try{var n=readAmount(raw);return n==null?'':String(n)}catch(e){return raw}},
      set:function(v){var s=v==null?'':String(v);nativeValue.set.call(this,/^-?\d+(\.\d+)?$/.test(s)?s.replace('.',','):s)}
    });
    if(/^-?\d+\.\d+$/.test(shown))nativeValue.set.call(el,shown.replace('.',','));
  }
  function checkAmount(el){
    var raw=nativeValue.get.call(el),msg='';
    if(String(raw).trim()){
      var n=null;try{n=readAmount(raw)}catch(e){msg=el.dataset.bkNum==='whole'?'Vul een getal in, bijvoorbeeld 14.':'Vul een bedrag in, bijvoorbeeld 12,50.'}
      if(!msg&&n!=null){
        if(el.dataset.bkMin!=null&&n<Number(el.dataset.bkMin))msg='Vul minimaal '+dutch(Number(el.dataset.bkMin))+' in.';
        else if(el.dataset.bkMax!=null&&n>Number(el.dataset.bkMax))msg='Vul hoogstens '+dutch(Number(el.dataset.bkMax))+' in.';
      }
    }
    el.setCustomValidity(msg);
  }
  function inReview(el){return !!el.closest('.document-review-v2,.financial-review,.drv2,[data-review-field],#documentReview')}
  function fieldName(el){return ((el.name||'')+' '+(el.id||'')+' '+(el.getAttribute('autocomplete')||'')).toLowerCase()}
  function setupField(el){
    if(el.dataset.bkField)return;
    el.dataset.bkField='1';
    var type=(el.getAttribute('type')||'text').toLowerCase(),name=fieldName(el);
    if(type==='number'){makeAmountField(el);return}
    if(type!=='text'&&type!=='search'&&type!=='email'&&type!=='tel')return;
    if(/(^| )(phone|telefoon|tel)\b|phone/.test(name)&&type==='text'){el.type='tel';if(!el.getAttribute('autocomplete'))el.setAttribute('autocomplete','tel')}
    else if(/iban|\bvat\b|btw|postal|postcode|zip/.test(name)){el.setAttribute('autocapitalize','characters');el.setAttribute('autocorrect','off');el.setAttribute('spellcheck','false')}
    else if(/email/.test(name)){if(type==='text')el.setAttribute('inputmode','email');el.setAttribute('autocapitalize','off');el.setAttribute('autocorrect','off');el.setAttribute('spellcheck','false')}
    else if(/\bkvk\b|kvk/.test(name)){el.setAttribute('inputmode','numeric');el.setAttribute('autocorrect','off')}
    if(el.getAttribute('inputmode')==='decimal'&&!inReview(el))el.dataset.bkSum='1';
  }
  function scan(node){
    if(!node||node.nodeType!==1)return;
    if(node.matches&&node.matches('input'))setupField(node);
    var list=node.querySelectorAll?node.querySelectorAll('input:not([data-bk-field])'):[];
    for(var i=0;i<list.length;i++)setupField(list[i]);
  }
  // FormData reads the field's own text; give it the plain number too.
  var NativeFormData=window.FormData;
  if(NativeFormData&&!NativeFormData.__boekuna){
    var BoekunaFormData=function(form,submitter){
      var fd=submitter===undefined?new NativeFormData(form):new NativeFormData(form,submitter);
      if(form&&form.elements){for(var i=0;i<form.elements.length;i++){var el=form.elements[i];if(el.dataset&&el.dataset.bkNum&&el.name&&!el.disabled)fd.set(el.name,el.value)}}
      return fd;
    };
    BoekunaFormData.prototype=NativeFormData.prototype;
    BoekunaFormData.__boekuna=true;
    window.FormData=BoekunaFormData;
  }
  document.addEventListener('input',function(e){var el=e.target;if(el&&el.dataset&&el.dataset.bkNum)checkAmount(el)},true);
  // Leaving the field: a sum becomes its answer, and a price shows as 12,50.
  document.addEventListener('focusout',function(e){
    var el=e.target;if(!el||!el.dataset)return;
    if(el.dataset.bkNum){
      checkAmount(el);
      var raw=nativeValue.get.call(el);if(!String(raw).trim())return;
      try{var n=readAmount(raw);if(n!=null){var nice=dutch(n,el.dataset.bkNum==='decimal'&&el.getAttribute('step')==='0.01');if(nice!==raw)nativeValue.set.call(el,nice)}}catch(err){}
    }else if(el.dataset.bkSum&&SUM.test(el.value)){
      try{var v=readAmount(el.value);if(v!=null){el.value=v.toFixed(2).replace('.',',');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}}catch(err){}
    }
  },true);

  /* ---------- 2. The Enter key says what it does ---------- */
  function fieldsOf(scope){
    return [].slice.call(scope.querySelectorAll('input,select,textarea')).filter(function(el){
      var t=(el.type||'').toLowerCase();
      return visible(el)&&!el.readOnly&&['hidden','checkbox','radio','button','submit','reset','file','range','color'].indexOf(t)<0;
    });
  }
  function nextField(el){
    var scope=el.form||el.closest('[role="dialog"],.modal');if(!scope)return null;
    var list=fieldsOf(scope),i=list.indexOf(el);
    return i>=0&&i<list.length-1?list[i+1]:null;
  }
  document.addEventListener('focusin',function(e){
    var el=e.target;if(!el||el.tagName!=='INPUT'||el.dataset.bkEnter==='own'||!(coarse.matches||phone.matches))return;
    if(el.getAttribute('enterkeyhint')&&!el.dataset.bkEnter){el.dataset.bkEnter='own';return}
    if(!el.form&&!el.closest('[role="dialog"]'))return;
    if((el.type||'')==='search'||/search|zoek/i.test(el.id+' '+el.className)){el.setAttribute('enterkeyhint','search');el.dataset.bkEnter='search';return}
    var hasNext=!!nextField(el);
    el.setAttribute('enterkeyhint',hasNext?'next':'done');
    el.dataset.bkEnter=hasNext?'next':'done';
  },true);
  document.addEventListener('keydown',function(e){
    if(e.key!=='Enter'||e.isComposing||e.defaultPrevented||e.shiftKey||e.altKey||e.metaKey||e.ctrlKey)return;
    var el=e.target;if(!el||el.tagName!=='INPUT')return;
    if(el.dataset.bkEnter==='next'){var n=nextField(el);if(n){e.preventDefault();n.focus();if(n.select&&n.tagName==='INPUT'&&n.dataset.bkNum)try{n.select()}catch(err){}}}
    else if(el.dataset.bkEnter==='done'){e.preventDefault();el.blur()}
  });

  /* ---------- 4. Smart pre-fill ---------- */
  function recentCustomerIds(st){
    var seen=[],list=(st.invoices||[]).slice().sort(function(a,b){return String(b.issueDate||'').localeCompare(String(a.issueDate||''))});
    for(var i=0;i<list.length&&seen.length<3;i++){var id=list[i].customerId;if(id&&seen.indexOf(id)<0)seen.push(id)}
    return seen;
  }
  function prefillInvoice(select){
    if(select.dataset.bkOrdered)return;select.dataset.bkOrdered='1';
    var st=appState();if(!st)return;
    var ids=recentCustomerIds(st).reverse(),first=select.querySelector('option[value=""]');
    ids.forEach(function(id){var o=select.querySelector('option[value="'+CSS.escape(id)+'"]');if(o&&first)first.after(o)});
  }
  function lastExpenseOf(st,vendor){
    var v=String(vendor||'').trim().toLowerCase();if(!v)return null;
    var list=(st.expenses||[]).filter(function(x){return !x.correctionFor&&!x.correctedAt&&String(x.vendor||'').trim().toLowerCase()===v});
    list.sort(function(a,b){return String(b.date||'').localeCompare(String(a.date||''))});
    return list[0]||null;
  }
  function prefillExpense(form){
    if(form.dataset.bkPrefill)return;form.dataset.bkPrefill='1';
    var st=appState(),vendor=form.elements.vendor;if(!st||!vendor||vendor.value.trim())return; // new costs only
    var names=[],seen={};
    (st.expenses||[]).slice().sort(function(a,b){return String(b.date||'').localeCompare(String(a.date||''))}).forEach(function(x){var n=String(x.vendor||'').trim();if(n&&!seen[n.toLowerCase()]&&names.length<40){seen[n.toLowerCase()]=1;names.push(n)}});
    if(names.length){
      var list=document.createElement('datalist');list.id='bkVendorList';
      names.forEach(function(n){var o=document.createElement('option');o.value=n;list.appendChild(o)});
      form.appendChild(list);vendor.setAttribute('list','bkVendorList');
    }
    var touched={};
    form.addEventListener('change',function(e){if(e.isTrusted&&e.target&&(e.target.name==='category'||e.target.name==='vatRate'))touched[e.target.name]=1});
    function apply(){
      var last=lastExpenseOf(st,vendor.value);if(!last)return;
      var parts=[];
      var cat=form.elements.category;
      if(cat&&!touched.category&&last.category&&cat.querySelector('option[value="'+CSS.escape(String(last.category))+'"]')&&cat.value!==String(last.category)){
        cat.value=String(last.category);cat.dispatchEvent(new Event('change',{bubbles:true}));
        parts.push(cat.options[cat.selectedIndex]?cat.options[cat.selectedIndex].text:'');
      }
      var rate=String(last.vatRate);
      if(!touched.vatRate&&/^(0|9|21)$/.test(rate)){
        var radio=form.querySelector('input[name="vatRate"][value="'+rate+'"]');
        if(radio&&!radio.checked){radio.click();parts.push(rate+'% btw')}
      }
      parts=parts.filter(Boolean);
      var hint=form.querySelector('.bk-hint');
      if(parts.length){
        if(!hint){hint=document.createElement('div');hint.className='help bk-hint';vendor.closest('.field').appendChild(hint)}
        hint.textContent='Zoals vorige keer: '+parts.join(', ');
      }
    }
    vendor.addEventListener('change',apply);
    vendor.addEventListener('input',function(){if(seen[vendor.value.trim().toLowerCase()])apply()});
  }

  /* ---------- 5. Invisible bigger tap areas ---------- */
  var lastPointer='mouse';
  document.addEventListener('pointerdown',function(e){lastPointer=e.pointerType||'mouse'},{capture:true,passive:true});
  var TAP_TARGETS='button,a[href],[role="button"],input[type="checkbox"],input[type="radio"],label.choice-chip,select';
  var SMALL=44,SLOP=12,LIKELY_SLOP=24;
  function likelyButton(scope){
    var form=scope.querySelector('form');if(!form)return null;
    var buttons=[].slice.call(scope.querySelectorAll('.modal-foot .btn.primary')).filter(visible);
    var btn=buttons[buttons.length-1];if(!btn)return null;
    var required=[].slice.call(form.querySelectorAll('[required]')).filter(visible);
    var ready=required.every(function(el){if(el.type==='radio')return !!form.querySelector('input[name="'+CSS.escape(el.name)+'"]:checked');return String(el.value||'').trim()!==''});
    return ready?btn:null;
  }
  function distance(x,y,r){var dx=Math.max(r.left-x,0,x-r.right),dy=Math.max(r.top-y,0,y-r.bottom);return Math.sqrt(dx*dx+dy*dy)}
  document.addEventListener('click',function(e){
    if(!e.isTrusted||lastPointer!=='touch')return;
    var t=e.target;if(!t||!t.closest||t.closest(TAP_TARGETS+',[onclick],.mobile-card-row,.r1d-recent-row,.calm-row,input,textarea,label'))return;
    var scope=t.closest('#modalRoot .modal')||(modalOpen()?null:t.closest('#mainApp,.mobile-bottom-nav'));
    if(!scope)return;
    var likely=scope.classList.contains('modal')?likelyButton(scope):null;
    var best=null,bestD=1e9;
    [].slice.call(scope.querySelectorAll(TAP_TARGETS)).forEach(function(el){
      if(!visible(el))return;
      var r=el.getBoundingClientRect(),big=el===likely;
      if(!big&&r.width>=SMALL&&r.height>=SMALL)return;
      var d=distance(e.clientX,e.clientY,r);
      if(d<=(big?LIKELY_SLOP:SLOP)&&d<bestD){best=el;bestD=d}
    });
    if(!best)return;
    e.preventDefault();e.stopPropagation();
    if(best.tagName==='SELECT'){best.focus();return}
    best.click();
  },true);

  /* ---------- 9. The save button stays above the keyboard ---------- */
  // Sheets already take the height of the visible screen (mobile-product.js). When the keyboard opens, iOS also scrolls
  // the page up a little; the sheet follows that shift, so its bottom (with Opslaan) sits right on top of the keyboard.
  var vv=window.visualViewport;
  function keyboardCheck(){
    if(!vv)return;
    var top=phone.matches?Math.max(0,Math.round(vv.offsetTop)):0;
    root.style.setProperty('--mobile-viewport-offset-top',top+'px');
    root.classList.toggle('bk-keyboard',phone.matches&&window.innerHeight-vv.height>120);
  }
  if(vv){vv.addEventListener('resize',keyboardCheck);vv.addEventListener('scroll',keyboardCheck);keyboardCheck()}

  /* ---------- 6 and 8. Swipe and long press in phone lists ---------- */
  function rowInfo(row){
    if(!row)return null;
    if(row.dataset.bkInvoice){
      var st=appState(),inv=st&&(st.invoices||[]).find(function(x){return x.id===row.dataset.bkInvoice});
      if(!inv)return null;
      var open=false;try{open=inv.status!=='draft'&&inv.status!=='cancelled'&&inv.kind!=='credit'&&app('invoiceOutstanding')(inv)>0.004}catch(e){}
      return {kind:'invoice',id:inv.id,right:open?{label:'Betaald',run:function(){call('registerPayment',inv.id)}}:null,left:{label:'Meer',tone:'more',run:function(){call('invoiceActions',inv.id)}},hold:function(){call('invoiceActions',inv.id)}};
    }
    if(row.dataset.bkExpense){
      var id=row.dataset.bkExpense;
      return {kind:'expense',id:id,right:null,left:{label:'Weghalen',tone:'danger',run:function(){call('correctExpense',id)}},hold:function(){call('newExpense',id)}};
    }
    return null;
  }
  var swipe=null,holdTimer=0,held=false;
  function clearHold(){clearTimeout(holdTimer);holdTimer=0}
  function resetRow(row,animate){
    var main=row.querySelector('.mobile-card-main'),side=row.querySelector('.mobile-card-side');
    [main,side].forEach(function(el){if(!el)return;el.style.transition=animate?'transform .22s cubic-bezier(.2,.8,.2,1)':'';el.style.transform=''});
    row.classList.remove('bk-swiping','bk-swipe-left','bk-swipe-right','bk-swipe-armed');
    var back=row.querySelector('.bk-swipe-back');if(back)setTimeout(function(){if(!row.classList.contains('bk-swiping'))back.remove()},animate?230:0);
  }
  document.addEventListener('pointerdown',function(e){
    if(!phone.matches||(e.pointerType!=='touch'&&e.pointerType!=='pen'))return;
    var row=e.target.closest&&e.target.closest('#content .mobile-card-row[data-bk-invoice],#content .mobile-card-row[data-bk-expense]');
    held=false;clearHold();
    if(!row||e.target.closest('.mobile-card-side button'))return;
    var info=rowInfo(row);if(!info)return;
    swipe={row:row,info:info,x:e.clientX,y:e.clientY,dx:0,axis:null,id:e.pointerId};
    holdTimer=setTimeout(function(){if(swipe&&!swipe.axis){held=true;tick();row.classList.remove('is-pressed');info.hold();swipe=null}},520);
  },{capture:true,passive:true});
  document.addEventListener('pointermove',function(e){
    if(!swipe||e.pointerId!==swipe.id)return;
    var mx=e.clientX-swipe.x,my=e.clientY-swipe.y;
    if(!swipe.axis&&Math.abs(mx)+Math.abs(my)>8){swipe.axis=Math.abs(mx)>Math.abs(my)*1.3?'x':'y';clearHold()}
    if(swipe.axis!=='x')return;
    var row=swipe.row,info=swipe.info,dir=mx>0?'right':'left',action=info[dir];
    var dx=action?mx:mx*0.2;
    dx=Math.max(-160,Math.min(160,dx));
    swipe.dx=dx;
    if(!row.classList.contains('bk-swiping')){
      row.classList.add('bk-swiping');row.classList.remove('is-pressed');
      var back=document.createElement('div');back.className='bk-swipe-back';back.setAttribute('aria-hidden','true');
      back.innerHTML='<span class="bk-swipe-r">'+(info.right?info.right.label:'')+'</span><span class="bk-swipe-l">'+(info.left?info.left.label:'')+'</span>';
      row.prepend(back);
    }
    row.classList.toggle('bk-swipe-right',dx>0);row.classList.toggle('bk-swipe-left',dx<0);
    row.dataset.bkTone=dx<0&&info.left?info.left.tone||'':'';
    row.style.setProperty('--bk-dx',Math.abs(dx)+'px');
    var armed=!!action&&Math.abs(dx)>=88;
    if(armed!==row.classList.contains('bk-swipe-armed')){row.classList.toggle('bk-swipe-armed',armed);if(armed)tick()}
    [row.querySelector('.mobile-card-main'),row.querySelector('.mobile-card-side')].forEach(function(el){if(el){el.style.transition='';el.style.transform='translateX('+dx+'px)'}});
  },{capture:true,passive:true});
  function endSwipe(e){
    clearHold();
    if(!swipe||(e&&e.pointerId!==swipe.id))return;
    var s=swipe;swipe=null;
    if(s.axis!=='x')return;
    s.row.dataset.bkSwiped=String(Date.now());
    var action=s.dx>0?s.info.right:s.info.left;
    var armed=action&&Math.abs(s.dx)>=88;
    resetRow(s.row,true);
    if(armed)setTimeout(action.run,120);
  }
  document.addEventListener('pointerup',endSwipe,{capture:true,passive:true});
  document.addEventListener('pointercancel',endSwipe,{capture:true,passive:true});
  // After a swipe or a long press the finger's click is not a tap.
  document.addEventListener('click',function(e){
    var row=e.target.closest&&e.target.closest('.mobile-card-row');
    if(held||(row&&row.dataset.bkSwiped&&Date.now()-Number(row.dataset.bkSwiped)<500)){held=false;e.preventDefault();e.stopPropagation()}
  },true);
  document.addEventListener('contextmenu',function(e){if(phone.matches&&e.target.closest&&e.target.closest('.mobile-card-row[data-bk-invoice],.mobile-card-row[data-bk-expense],#quickNew'))e.preventDefault()});

  // 8. Hold the + : straight to scanning a receipt.
  var plusTimer=0,plusHeld=false;
  document.addEventListener('pointerdown',function(e){
    var plus=e.target.closest&&e.target.closest('#quickNew');plusHeld=false;clearTimeout(plusTimer);
    if(!plus||!phone.matches||(e.pointerType!=='touch'&&e.pointerType!=='pen'))return;
    var x=e.clientX,y=e.clientY;
    plusTimer=setTimeout(function(){plusHeld=true;tick();plus.classList.remove('is-pressed');call('openUploadSourcePicker','auto')},480);
    var move=function(ev){if(Math.abs(ev.clientX-x)+Math.abs(ev.clientY-y)>10)clearTimeout(plusTimer)};
    document.addEventListener('pointermove',move,{passive:true});
    var up=function(){clearTimeout(plusTimer);document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',up,true)};
    document.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',up,true);
  },{capture:true,passive:true});
  document.addEventListener('click',function(e){if(plusHeld&&e.target.closest&&e.target.closest('#quickNew')){plusHeld=false;e.preventDefault();e.stopImmediatePropagation()}},true);

  /* ---------- 12. Shortcuts on a computer ---------- */
  var KEYS={'/':['Zoeken',function(){call('openGlobalSearch')}],n:['Nieuw',function(){call('quickMenu')}],f:['Nieuwe factuur',function(){call('newInvoice')}],k:['Kosten boeken',function(){call('newExpense')}],b:['Bon scannen',function(){call('openUploadSourcePicker','auto')}],r:['Rit toevoegen',function(){call('newTrip')}]};
  function typing(el){if(!el)return false;var t=el.tagName;return t==='INPUT'||t==='TEXTAREA'||t==='SELECT'||el.isContentEditable}
  function shortcutHelp(){
    var rows=Object.keys(KEYS).map(function(k){return '<div class="bk-key-row"><kbd>'+(k==='/'?'/':k.toUpperCase())+'</kbd><span>'+KEYS[k][0]+'</span></div>'}).join('')+'<div class="bk-key-row"><kbd>Esc</kbd><span>Sluiten</span></div>';
    call('modal','Sneltoetsen','<div class="bk-keys">'+rows+'</div>');
  }
  document.addEventListener('keydown',function(e){
    if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.altKey||e.isComposing||phone.matches)return;
    if(typing(document.activeElement)||modalOpen())return;
    if(!document.getElementById('mainApp')||document.getElementById('mainApp').offsetParent===null)return;
    if(e.key==='?'){e.preventDefault();shortcutHelp();return}
    var hit=KEYS[e.key==='/'?'/':String(e.key).toLowerCase()];
    if(!hit||e.shiftKey&&e.key!=='/')return;
    e.preventDefault();hit[1]();
  });

  /* ---------- 14. A form error takes you to the field ---------- */
  var errorTimer=0;
  function goToError(){
    var dialog=document.querySelector('#modalRoot .modal')||document.getElementById('content');if(!dialog)return;
    var first=[].slice.call(dialog.querySelectorAll('.field-error')).filter(visible)[0];if(!first)return;
    var a=document.activeElement;if(a&&a.classList&&a.classList.contains('field-error'))return;
    var target=first.matches('input,select,textarea')?first:first.querySelector('input,select,textarea');
    try{first.scrollIntoView({block:'center',behavior:'smooth'})}catch(e){first.scrollIntoView()}
    if(target)setTimeout(function(){try{target.focus({preventScroll:true})}catch(e){}},250);
  }
  new MutationObserver(function(list){
    for(var i=0;i<list.length;i++){var m=list[i];
      if(m.type==='attributes'&&m.target.classList&&m.target.classList.contains('field-error')&&String(m.oldValue||'').indexOf('field-error')<0){clearTimeout(errorTimer);errorTimer=setTimeout(goToError,30);break}}
  }).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class'],attributeOldValue:true});

  /* ---------- Watch new screens and sheets ---------- */
  function onAdded(node){
    if(!node||node.nodeType!==1)return;
    scan(node);
    var sel=node.id==='invoiceCustomer'?node:node.querySelector&&node.querySelector('#invoiceCustomer');
    if(sel&&!editingInvoice())prefillInvoice(sel)
    var ef=node.id==='expenseForm'?node:node.querySelector&&node.querySelector('#expenseForm');
    if(ef)prefillExpense(ef);
  }
  new MutationObserver(function(list){
    for(var i=0;i<list.length;i++){var added=list[i].addedNodes;for(var j=0;j<added.length;j++)onAdded(added[j])}
  }).observe(document.body,{childList:true,subtree:true});
  onAdded(document.body);
})();
