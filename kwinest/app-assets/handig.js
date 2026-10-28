/* BOEKUNA handig — small tricks you feel but do not see (Kwin 2026-10-28, "trucjes" 1-12, 14).
   The right keyboard per field, Enter jumps to the next field, amounts read the way you type them (12,50 · 1.234,56 ·
   3 x 45 · 100 + 21%), smart pre-fill, invisible bigger tap areas, swipe and long press in lists, the save button stays
   above the keyboard, shortcuts on a computer and a form error takes you to the field. Round 2 (17-27, 29): dates in plain
   language, the + menu learns, paste fills a whole address, tap to copy, hold to send, a small celebration at "betaald",
   tap an amount for with/without btw, focus after a service, lists remember where you were, tap the top to go up,
   "zelfde als vorige keer" and a cost typed or spoken in one line. Styling lives in handig.css.
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
  // money is a const in the app script, so it is not on window; reach it by name.
  function app(name){if(typeof window[name]==='function')return window[name];if(name==='money'){try{return typeof money==='function'?money:null}catch(e){return null}}return null}
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
    // Phones keep their own date wheel (and the Vandaag/Gisteren chips); on a computer you can type "gisteren".
    if(type==='date'){if(!coarse.matches&&!el.classList.contains('bk-date-native')&&!inReview(el)&&!el.closest('.period-range-fields'))makeDateField(el);return}
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
      if(form&&form.elements){for(var i=0;i<form.elements.length;i++){var el=form.elements[i];if(el.dataset&&(el.dataset.bkNum||el.dataset.bkDate)&&el.name&&!el.disabled)fd.set(el.name,el.value)}}
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
      if(hint&&!parts.length&&hint.dataset.bkFor===String(last.id))return; // already shown for this supplier
      if(!hint){hint=document.createElement('div');hint.className='help bk-hint';vendor.closest('.field').appendChild(hint)}
      hint.dataset.bkFor=String(last.id);
      hint.textContent=parts.length?'Zoals vorige keer: '+parts.join(', '):'';
      // 27. Same as last time: one tap fills the amount of the previous cost too.
      var gross=form.elements.gross,amount=0;try{amount=app('expenseGross')?app('expenseGross')(last):0}catch(e){}
      if(gross&&amount>0&&!String(gross.value||'').trim()){
        var again=document.createElement('button');again.type='button';again.className='btn small bk-again';
        again.textContent='Zelfde als vorige keer · '+(app('money')?app('money')(amount):amount.toFixed(2));
        again.addEventListener('click',function(){gross.value=amount.toFixed(2);gross.dispatchEvent(new Event('input',{bubbles:true}));gross.dispatchEvent(new Event('change',{bubbles:true}));again.remove();hint.textContent='Ingevuld zoals vorige keer. Pas aan wat anders is.'});
        hint.appendChild(document.createElement('br'));hint.appendChild(again);
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
    // No action that way: the row lets go, so the swipe can change screens (vegen.js).
    if(swipe.axis==='x'&&!swipe.row.classList.contains('bk-swiping')&&!swipe.info[mx>0?'right':'left']&&root.classList.contains('boekuna-vegen')){swipe=null;return}
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

  /* ---------- 17. Dates in plain language ---------- */
  var DAYS=['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
  var MONTHS={jan:1,feb:2,mrt:3,maa:3,apr:4,mei:5,jun:6,jul:7,aug:8,sep:9,okt:10,oct:10,nov:11,dec:12};
  function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function make(y,m,d){var x=new Date(y,m-1,d,12);return x.getFullYear()===y&&x.getMonth()===m-1&&x.getDate()===d?iso(x):null}
  function readDate(raw){
    var s=String(raw==null?'':raw).trim().toLowerCase().replace(/\s+/g,' ');if(!s)return null;
    var now=new Date();now.setHours(12,0,0,0);
    var rel={vandaag:0,gisteren:-1,eergisteren:-2,morgen:1,overmorgen:2}[s];
    if(rel!=null){now.setDate(now.getDate()+rel);return iso(now)}
    var m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);if(m)return make(+m[1],+m[2],+m[3]);
    m=s.match(/^(?:(?:ma|di|wo|do|vr|za|zo)[a-z]*\.?\s+)?(\d{1,2})[\/\-. ](\d{1,2})(?:[\/\-. ](\d{2,4}))?$/);
    if(m){var y=m[3]?+m[3]:now.getFullYear();if(y<100)y+=2000;return make(y,+m[2],+m[1])}
    m=s.match(/^(?:(?:ma|di|wo|do|vr|za|zo)[a-z]*\.?\s+)?(\d{1,2})\s*([a-z]{3})[a-z]*\.?(?:\s+(\d{4}))?$/);
    if(m&&MONTHS[m[2]])return make(m[3]?+m[3]:now.getFullYear(),MONTHS[m[2]],+m[1]);
    m=s.match(/^(vorige\s+)?(zondag|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag)$/);
    if(m){var back=(now.getDay()-DAYS.indexOf(m[2])+7)%7;if(m[1]&&back===0)back=7;now.setDate(now.getDate()-back);return iso(now)}
    m=s.match(/^(\d{1,3}) dag(?:en)? geleden$/);if(m){now.setDate(now.getDate()-Number(m[1]));return iso(now)}
    return null;
  }
  window.boekunaReadDate=readDate;
  function showDate(isoDate){var m=String(isoDate||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'-'+m[2]+'-'+m[1]:String(isoDate||'')}
  function longDate(isoDate){try{return new Date(isoDate+'T12:00:00').toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}catch(e){return isoDate}}
  function makeDateField(el){
    var start=nativeValue.get.call(el);
    el.dataset.bkDate='1';
    el.type='text';
    el.setAttribute('inputmode','text');el.setAttribute('autocomplete','off');el.setAttribute('autocorrect','off');el.setAttribute('spellcheck','false');
    if(!el.placeholder)el.placeholder='dd-mm-jjjj of "gisteren"';
    Object.defineProperty(el,'value',{configurable:true,
      get:function(){var raw=nativeValue.get.call(this);if(!String(raw).trim())return '';return readDate(raw)||''},
      set:function(v){nativeValue.set.call(this,showDate(v==null?'':String(v)))}
    });
    nativeValue.set.call(el,showDate(start));
    // The calendar stays one tap away: a native date picker sits under a small calendar button.
    var wrap=document.createElement('span');wrap.className='bk-date-wrap';
    el.parentNode.insertBefore(wrap,el);wrap.appendChild(el);
    var pick=document.createElement('span');pick.className='bk-date-pick';pick.setAttribute('aria-hidden','true');
    pick.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>';
    var native=document.createElement('input');native.type='date';native.tabIndex=-1;native.className='bk-date-native';native.setAttribute('aria-label','Kies een datum in de kalender');
    pick.appendChild(native);wrap.appendChild(pick);
    native.addEventListener('focus',function(){native.value=el.value||iso(new Date());if(el.min)native.min=el.min;if(el.max)native.max=el.max});
    native.addEventListener('change',function(){if(!native.value)return;el.value=native.value;checkDate(el);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))});
    if(el.disabled||el.readOnly)pick.hidden=true;
  }
  function checkDate(el){
    var raw=nativeValue.get.call(el),msg='';
    if(String(raw).trim()){
      var d=readDate(raw);
      if(!d)msg='Typ een datum, bijvoorbeeld 12-10-2026 of "gisteren".';
      else if(el.min&&d<el.min)msg='Kies een datum vanaf '+showDate(el.min)+'.';
      else if(el.max&&d>el.max)msg='Kies een datum tot en met '+showDate(el.max)+'.';
    }
    el.setCustomValidity(msg);
    var help=el.closest('.bk-date-wrap')&&el.closest('.bk-date-wrap').nextElementSibling;
    if(help&&help.classList.contains('bk-date-read'))help.remove();
    if(document.activeElement===el&&String(raw).trim()&&!/^\d{1,2}-\d{1,2}-\d{4}$/.test(raw)){
      var d2=readDate(raw),note=document.createElement('div');note.className='help bk-date-read';
      note.textContent=d2?longDate(d2):'Dit snap ik nog niet';
      el.closest('.bk-date-wrap').after(note);
    }
  }
  document.addEventListener('input',function(e){var el=e.target;if(el&&el.dataset&&el.dataset.bkDate)checkDate(el)},true);
  document.addEventListener('focusout',function(e){
    var el=e.target;if(!el||!el.dataset||!el.dataset.bkDate)return;
    var raw=nativeValue.get.call(el),d=readDate(raw);
    if(d&&showDate(d)!==raw)nativeValue.set.call(el,showDate(d));
    checkDate(el);
    var w=el.closest('.bk-date-wrap');if(w&&w.nextElementSibling&&w.nextElementSibling.classList.contains('bk-date-read'))w.nextElementSibling.remove();
  },true);

  /* ---------- 18. The + menu learns what you do most ---------- */
  var QUICK_KEY='boekuna.quickUse';
  function quickUse(){try{return JSON.parse(localStorage.getItem(QUICK_KEY)||'{}')||{}}catch(e){return {}}}
  function quickLabel(btn){var t=btn.querySelector('strong');return (t?t.textContent:btn.textContent).trim()}
  document.addEventListener('click',function(e){
    var tile=e.target.closest&&e.target.closest('#modalRoot .quick-tiles .quick-tile');if(!tile)return;
    var use=quickUse(),k=quickLabel(tile);use[k]=(use[k]||0)+1;try{localStorage.setItem(QUICK_KEY,JSON.stringify(use))}catch(err){}
  },true);
  function orderQuickTiles(box){
    if(box.dataset.bkOrdered)return;box.dataset.bkOrdered='1';
    var use=quickUse(),tiles=[].slice.call(box.querySelectorAll('.quick-tile'));
    var total=tiles.reduce(function(n,t){return n+(use[quickLabel(t)]||0)},0);if(total<5)return; // learn slowly
    var sorted=tiles.slice().sort(function(a,b){return (use[quickLabel(b)]||0)-(use[quickLabel(a)]||0)});
    // Only move a tile up when it is clearly used more, so the order stays calm.
    if((use[quickLabel(sorted[0])]||0)<(use[quickLabel(tiles[0])]||0)*1.5+1)return;
    sorted.forEach(function(t){box.appendChild(t)});
  }

  /* ---------- 19. Paste fills a whole address ---------- */
  function splitContact(t){
    var out={},lines=String(t).split(/\r?\n|·|\|/).map(function(x){return x.trim()}).filter(Boolean),flat=String(t).replace(/\s+/g,' ');
    var m=flat.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);if(m)out.email=m[0];
    m=flat.match(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/);if(m)out.iban=m[0].replace(/\s/g,'');
    m=flat.match(/\bkvk(?:[- ]?(?:nummer|nr\.?))?[:\s]*([0-9]{8})\b/i);if(m)out.kvk=m[1];
    m=flat.match(/\b(?:btw(?:[- ]?(?:id|nummer|nr\.?))?|vat)[:\s]*(NL\s?\d{9}\s?B\s?\d{2})\b/i)||flat.match(/\b(NL\d{9}B\d{2})\b/);if(m)out.vat=m[1].replace(/\s/g,'').toUpperCase();
    m=flat.match(/(?:\+31|0031|\b0)[\s-]?6(?:[\s-]?\d){8}\b|(?:\+31|0031|\b0)[1-9]\d(?:[\s-]?\d){7}\b/);if(m)out.phone=m[0].trim();
    for(var i=0;i<lines.length;i++){var pc=lines[i].match(/^(\d{4})\s?([A-Za-z]{2})\b\s*(.*)$/);if(pc&&!/^(\d{4})\s?(AB|NL)$/i.test(lines[i])){out.postal=pc[1]+' '+pc[2].toUpperCase();if(pc[3])out.city=pc[3].replace(/[,;].*$/,'').trim();break}}
    var street=lines.find(function(l){return /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'.\- ]+\s\d+\s?[a-zA-Z]?(?:[-\s]\d+)?$/.test(l)});if(street)out.address=street;
    var name=lines.find(function(l){return l!==street&&!/@|\d{4}\s?[A-Za-z]{2}\b|kvk|btw|iban|^NL\d|\+31|^0\d|^tel|^www\.|https?:/i.test(l)&&/[a-z]/i.test(l)});if(name)out.name=name;
    return out;
  }
  window.boekunaSplitContact=splitContact;
  var FIELD_KEYS={name:'name',naam:'name',companyname:'name',email:'email',address:'address',adres:'address',street:'address',postal:'postal',postcode:'postal',zip:'postal',city:'city',plaats:'city',phone:'phone',telefoon:'phone',kvk:'kvk',vat:'vat',btw:'vat',iban:'iban'};
  function keyOf(el){var n=String(el.name||'').toLowerCase().replace(/^newcustomer/,'').replace(/^company/,'');return FIELD_KEYS[n]||null}
  document.addEventListener('paste',function(e){
    var el=e.target;if(!el||el.tagName!=='INPUT'&&el.tagName!=='TEXTAREA')return;
    var own=keyOf(el);if(!own)return;
    var text=(e.clipboardData||window.clipboardData).getData('text');if(!text)return;
    var found=splitContact(text),kinds=['email','iban','kvk','postal','phone','address','vat'].filter(function(k){return found[k]});
    if(kinds.length<2)return;
    var scope=el.closest('#newCustomerFields')||el.form||el.closest('.modal');if(!scope)return;
    e.preventDefault();
    var filled=0;
    [].slice.call(scope.querySelectorAll('input,textarea')).forEach(function(f){
      var k=keyOf(f);if(!k||!found[k])return;
      if(f!==el&&String(f.value||'').trim())return; // never overwrite what you typed
      f.value=found[k];f.dispatchEvent(new Event('input',{bubbles:true}));f.dispatchEvent(new Event('change',{bubbles:true}));filled++;
    });
    if(found[own]==null&&own==='name'&&!String(el.value||'').trim()){el.value=text.split(/\r?\n/)[0].trim();el.dispatchEvent(new Event('input',{bubbles:true}))}
    if(filled)call('toast',filled+(filled===1?' veld':' velden')+' ingevuld uit wat je plakte');
  },true);

  /* ---------- 20. Tap a number to copy it ---------- */
  var COPY_RX=/\b(NL\d{2}\s?[A-Z]{4}(?:\s?\d{4}){2}\s?\d{2}|NL\s?\d{9}\s?B\s?\d{2})\b/g;
  var SKIP_COPY='input,textarea,select,option,button,a,script,style,[contenteditable],.bk-copy,svg,code,pre,.invoice-paper,iframe,label';
  function decorateCopy(root){
    if(!root||!root.querySelectorAll)return;
    var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:function(n){COPY_RX.lastIndex=0;if(!COPY_RX.test(n.nodeValue))return NodeFilter.FILTER_SKIP;var p=n.parentElement;return p&&!p.closest(SKIP_COPY)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP}});
    var nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(function(n){
      var frag=document.createDocumentFragment(),text=n.nodeValue,last=0;COPY_RX.lastIndex=0;var m;
      while((m=COPY_RX.exec(text))){
        if(m.index>last)frag.appendChild(document.createTextNode(text.slice(last,m.index)));
        var b=document.createElement('button');b.type='button';b.className='bk-copy';b.textContent=m[0];b.setAttribute('aria-label',m[0]+' kopiëren');b.dataset.copy=m[0].replace(/\s/g,'');
        frag.appendChild(b);last=m.index+m[0].length;
      }
      if(last<text.length)frag.appendChild(document.createTextNode(text.slice(last)));
      n.parentNode.replaceChild(frag,n);
    });
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('.bk-copy');if(!b)return;
    e.preventDefault();e.stopPropagation();
    var done=function(){b.classList.add('is-copied');tick();call('toast','Gekopieerd');setTimeout(function(){b.classList.remove('is-copied')},1400)};
    try{navigator.clipboard.writeText(b.dataset.copy).then(done,function(){})}catch(err){}
  },true);
  var copyTimer=0;
  function scheduleCopy(){clearTimeout(copyTimer);copyTimer=setTimeout(function(){decorateCopy(document.querySelector('#modalRoot .modal-body'));decorateCopy(document.getElementById('content'))},120)}

  /* ---------- 21. Hold to send ---------- */
  var HOLD_MS=650,holdOk=null;
  function holdButton(el){
    var b=el&&el.closest&&el.closest('#modalRoot .btn.primary');
    if(!b||!b.closest('#modalRoot')||!b.closest('#modalRoot').querySelector('#invoiceForm'))return null;
    return /^Versturen$/.test(b.textContent.trim())?b:null;
  }
  document.addEventListener('pointerdown',function(e){
    if(e.pointerType!=='touch'&&e.pointerType!=='pen')return;
    var b=holdButton(e.target);if(!b)return;
    b.classList.add('bk-holding');b.style.setProperty('--bk-hold',HOLD_MS+'ms');
    var timer=setTimeout(function(){b.classList.remove('bk-holding');tick();holdOk=b;b.click()},HOLD_MS);
    var stop=function(){clearTimeout(timer);b.classList.remove('bk-holding');document.removeEventListener('pointerup',stop,true);document.removeEventListener('pointercancel',stop,true)};
    document.addEventListener('pointerup',stop,true);document.addEventListener('pointercancel',stop,true);
  },{capture:true,passive:true});
  document.addEventListener('click',function(e){
    var b=holdButton(e.target);if(!b||lastPointer!=='touch')return;
    if(holdOk===b){holdOk=null;return}
    e.preventDefault();e.stopImmediatePropagation();
    var hint=b.parentNode.querySelector('.bk-hold-hint');
    if(!hint){hint=document.createElement('div');hint.className='bk-hold-hint';hint.textContent='Houd de knop even vast om te versturen';b.parentNode.appendChild(hint)}
    hint.classList.remove('is-shown');void hint.offsetWidth;hint.classList.add('is-shown');
  },true);

  /* ---------- 22. A small celebration at "betaald" ---------- */
  var SOUND_KEY='boekuna.sound';
  function soundOn(){try{return localStorage.getItem(SOUND_KEY)!=='off'}catch(e){return true}}
  var audio=null;
  function kaChing(){
    if(!soundOn())return;
    try{
      audio=audio||new (window.AudioContext||window.webkitAudioContext)();
      var t=audio.currentTime;
      [[1318.5,0],[1760,0.09]].forEach(function(n){
        var o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.value=n[0];
        g.gain.setValueAtTime(0.0001,t+n[1]);g.gain.exponentialRampToValueAtTime(0.18,t+n[1]+0.01);g.gain.exponentialRampToValueAtTime(0.0001,t+n[1]+0.35);
        o.connect(g);g.connect(audio.destination);o.start(t+n[1]);o.stop(t+n[1]+0.4);
      });
    }catch(e){}
  }
  function celebrate(){tick();setTimeout(tick,110);kaChing()}
  window.boekunaCelebrate=celebrate;
  function watchToasts(){
    var root=document.getElementById('toastRoot');if(!root||root.dataset.bkWatch)return;root.dataset.bkWatch='1';
    new MutationObserver(function(list){list.forEach(function(m){[].forEach.call(m.addedNodes,function(n){if(n.nodeType===1&&/staat op betaald|^Btw-aangifte (gedaan|staat op gedaan)/i.test(n.textContent||''))celebrate()})})}).observe(root,{childList:true});
  }
  function addSoundSetting(node){
    var hide=node.querySelector&&node.querySelector('label[for="hideAmountsToggle"]');if(!hide||document.getElementById('bkSoundToggle'))return;
    var label=document.createElement('label');label.className=hide.className;label.setAttribute('for','bkSoundToggle');
    label.innerHTML='<span><strong>Geluidje bij betaald</strong><span class="help settings-hint">Een zacht kassa-geluid als een klant betaalt.</span></span><input type="checkbox" role="switch" id="bkSoundToggle" aria-label="Geluidje bij betaald">';
    var input=label.querySelector('input');input.checked=soundOn();
    input.addEventListener('change',function(){try{localStorage.setItem(SOUND_KEY,input.checked?'on':'off')}catch(e){}if(input.checked)kaChing()});
    hide.after(label);
  }

  /* ---------- 23. Tap an amount: with or without btw ---------- */
  var VAT_KEY='boekuna.listExVat';
  function exVatMode(){try{return sessionStorage.getItem(VAT_KEY)==='1'}catch(e){return false}}
  function rowNet(row){
    var st=appState();if(!st)return null;
    if(row.dataset.bkInvoice){var inv=(st.invoices||[]).find(function(x){return x.id===row.dataset.bkInvoice});return inv&&app('invoiceNet')?app('invoiceNet')(inv):null}
    if(row.dataset.bkExpense){var ex=(st.expenses||[]).find(function(x){return x.id===row.dataset.bkExpense});return ex?Number(ex.exVat||0):null}
    return null;
  }
  function applyVatMode(scope){
    var on=exVatMode(),money=app('money');if(!money)return;
    [].forEach.call((scope||document).querySelectorAll('#content .mobile-card-row[data-bk-invoice] .mobile-card-value,#content .mobile-card-row[data-bk-expense] .mobile-card-value'),function(v){
      if(!v.dataset.bkGross)v.dataset.bkGross=v.innerHTML;
      if(on){var net=rowNet(v.closest('.mobile-card-row'));if(net==null)return;v.innerHTML=money(net).replace(/,(\d{2})$/,'<span class="amount-cents">,$1</span>')+'<small class="bk-exvat">excl.</small>'}
      else v.innerHTML=v.dataset.bkGross;
      v.classList.add('bk-vat-flip');v.setAttribute('role','button');v.setAttribute('tabindex','0');v.setAttribute('aria-label',(on?'Zonder btw':'Met btw')+', tik om te wisselen');
    });
  }
  document.addEventListener('click',function(e){
    var v=e.target.closest&&e.target.closest('#content .bk-vat-flip');if(!v)return;
    e.preventDefault();e.stopPropagation();
    try{sessionStorage.setItem(VAT_KEY,exVatMode()?'0':'1')}catch(err){}
    applyVatMode();tick();call('toast',exVatMode()?'Bedragen zonder btw':'Bedragen met btw');
  },true);

  /* ---------- 24. After a service, the cursor waits at the amount ---------- */
  document.addEventListener('click',function(e){
    var chip=e.target.closest&&e.target.closest('#invoiceForm .service-chip');if(!chip)return;
    setTimeout(function(){var q=document.querySelector('#invoiceLines .line-item:last-child [data-k=qty]');if(visible(q)){q.focus();try{q.select()}catch(err){}}},80);
  });

  /* ---------- 25 and 26. Lists remember where you were; tap the top to go up ---------- */
  var scrollMem={},navByTab=0;
  function currentPage(){try{return typeof page==='string'?page:null}catch(e){return null}}
  document.addEventListener('click',function(e){
    var tab=e.target.closest&&e.target.closest('.mobile-bottom-nav-item,#sidebar .nav-item');if(!tab)return;
    if(tab.classList.contains('active')&&phone.matches&&window.scrollY>0){e.preventDefault();e.stopImmediatePropagation();window.scrollTo({top:0,behavior:'smooth'});return}
    navByTab=Date.now();
  },true);
  document.addEventListener('click',function(e){
    if(!phone.matches||window.scrollY<200)return;
    var top=e.target.closest&&e.target.closest('.topbar,#pageTitle');if(!top||e.target.closest('button,a,input'))return;
    window.scrollTo({top:0,behavior:'smooth'});
  });
  function wrapNavigate(){
    var orig=window.navigate;if(typeof orig!=='function'||orig.__bk)return;
    var wrapped=function(next){
      var from=currentPage();if(from)scrollMem[from]={y:window.scrollY,t:Date.now()};
      var result=orig.apply(this,arguments);
      var mem=scrollMem[next],byTab=Date.now()-navByTab<800;
      if(byTab&&mem&&next!==from&&Date.now()-mem.t<15*60e3&&mem.y>0)requestAnimationFrame(function(){requestAnimationFrame(function(){window.scrollTo({top:mem.y,behavior:'instant'})})});
      return result;
    };
    wrapped.__bk=true;window.navigate=wrapped;
  }
  wrapNavigate();

  /* ---------- 29. A cost in one line, typed or spoken ---------- */
  var CATEGORY_WORDS=[[/park|tank|benzine|diesel|ns\b|trein|ov|taxi|uber|q-park|shell|bp\b|esso|parkeer|kilometer|km\b/,'Reiskosten'],[/lunch|diner|koffie|restaurant|eten|drinken|borrel/,'Representatie'],[/software|abonnement|adobe|microsoft|google|apple|licentie|hosting|domein/,'Software'],[/reclame|advertentie|facebook|instagram|flyer|drukwerk|marketing/,'Marketing'],[/huur|energie|stroom|gas|water|kantoorruimte/,'Huisvesting'],[/inkoop|materiaal|voorraad|bouwmarkt|gamma|praxis|hornbach/,'Inkoop'],[/kantoor|papier|printer|pennen|bureau/,'Kantoor']];
  var WORD_NUMBERS={een:1,twee:2,drie:3,vier:4,vijf:5,zes:6,zeven:7,acht:8,negen:9,tien:10,elf:11,twaalf:12,dertien:13,veertien:14,vijftien:15,twintig:20,dertig:30,veertig:40,vijftig:50,honderd:100};
  function readCostLine(text){
    var s=' '+String(text||'').toLowerCase().replace(/€/g,' euro ').replace(/\s+/g,' ')+' ',out={};
    var m=s.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:euro|eur\b)?/);
    if(m){try{out.amount=readAmount(m[1])}catch(e){}}
    else{var w=s.match(/\b(een|twee|drie|vier|vijf|zes|zeven|acht|negen|tien|elf|twaalf|dertien|veertien|vijftien|twintig|dertig|veertig|vijftig|honderd)\s+euro/);if(w)out.amount=WORD_NUMBERS[w[1]]}
    var v=s.match(/\b(?:bij|van|aan)\s+([a-z0-9&'.\- ]+?)(?=\s+(?:voor|op|gisteren|vandaag|eergisteren|met)\b|\s*$)/);
    if(v)out.vendor=v[1].trim().replace(/\b\w/g,function(c){return c.toUpperCase()});
    for(var i=0;i<CATEGORY_WORDS.length;i++)if(CATEGORY_WORDS[i][0].test(s)){out.category=CATEGORY_WORDS[i][1];break}
    if(/\bgisteren\b/.test(s))out.date=readDate('gisteren');else if(/\beergisteren\b/.test(s))out.date=readDate('eergisteren');
    return out;
  }
  window.boekunaReadCostLine=readCostLine;
  function fillExpense(found,text){
    call('newExpense');
    setTimeout(function(){
      var f=document.getElementById('expenseForm');if(!f)return;
      var set=function(el,v){if(!el||v==null)return;el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))};
      set(f.elements.vendor,found.vendor);
      if(found.amount!=null)set(f.elements.gross,Number(found.amount).toFixed(2));
      if(found.category&&f.elements.category&&f.elements.category.querySelector('option[value="'+found.category+'"]'))set(f.elements.category,found.category);
      if(found.date&&f.elements.date)set(f.elements.date,found.date);
      if(f.elements.notes&&!f.elements.notes.value)set(f.elements.notes,text);
      call('toast','Controleer en sla op');
    },60);
  }
  function quickCostSheet(){
    var speech=window.SpeechRecognition||window.webkitSpeechRecognition;
    call('modal','Kost in één zin','<form id="bkQuickCost" class="bk-quick-cost"><label for="bkQuickCostText">Typ of zeg wat je kocht</label><div class="bk-quick-row"><input id="bkQuickCostText" class="bk-quick-input" placeholder="12 euro parkeren bij Q-Park" autocomplete="off" enterkeyhint="go">'+(speech?'<button type="button" class="btn bk-mic" id="bkMic" aria-label="Inspreken"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>':'')+'</div><div class="help" id="bkQuickCostRead">Bedrag, waar en waarvoor. Je controleert het daarna.</div></form>','<button class="btn" type="button" onclick="closeModal()">Annuleren</button><button class="btn primary" type="button" id="bkQuickCostGo">Verder</button>');
    var input=document.getElementById('bkQuickCostText'),read=document.getElementById('bkQuickCostRead');
    var show=function(){var f=readCostLine(input.value),parts=[];if(f.amount!=null)parts.push((app('money')?app('money')(f.amount):f.amount));if(f.vendor)parts.push(f.vendor);if(f.category)parts.push(f.category);read.textContent=parts.length?'Boekuna leest: '+parts.join(' · '):'Bedrag, waar en waarvoor. Je controleert het daarna.'};
    input.addEventListener('input',show);
    var go=function(){var text=input.value.trim();if(!text){input.focus();return}var f=readCostLine(text);call('closeModal');fillExpense(f,text)};
    document.getElementById('bkQuickCostGo').addEventListener('click',go);
    document.getElementById('bkQuickCost').addEventListener('submit',function(e){e.preventDefault();go()});
    var mic=document.getElementById('bkMic');
    if(mic&&speech)mic.addEventListener('click',function(){
      try{var r=new speech();r.lang='nl-NL';r.interimResults=true;mic.classList.add('is-listening');
        r.onresult=function(ev){input.value=[].map.call(ev.results,function(x){return x[0].transcript}).join(' ');show()};
        r.onend=function(){mic.classList.remove('is-listening')};r.onerror=function(){mic.classList.remove('is-listening')};r.start()}catch(err){mic.classList.remove('is-listening')}
    });
    setTimeout(function(){try{input.focus()}catch(e){}},120);
  }
  window.boekunaQuickCost=quickCostSheet;
  function addQuickCostTile(box){
    if(box.querySelector('.bk-quick-cost-tile'))return;
    var row=document.createElement('button');row.type='button';row.className='quick-action bk-quick-cost-tile';
    row.innerHTML='<span class="quick-action-icon" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></span><span class="quick-action-text"><strong>Kost in één zin</strong><small>Typ of spreek in</small></span>';
    row.addEventListener('click',function(){call('closeModal');setTimeout(quickCostSheet,30)});
    box.prepend(row);
  }

  /* ---------- Watch new screens and sheets ---------- */
  function onAdded(node){
    if(!node||node.nodeType!==1)return;
    scan(node);
    var sel=node.id==='invoiceCustomer'?node:node.querySelector&&node.querySelector('#invoiceCustomer');
    if(sel&&!editingInvoice())prefillInvoice(sel)
    var ef=node.id==='expenseForm'?node:node.querySelector&&node.querySelector('#expenseForm');
    if(ef)prefillExpense(ef);
    var tiles=node.classList&&node.classList.contains('quick-tiles')?node:node.querySelector&&node.querySelector('#modalRoot .quick-tiles,.quick-tiles');
    if(tiles&&tiles.closest('#modalRoot')){orderQuickTiles(tiles);var rows=tiles.parentNode.querySelector('.quick-rows');if(rows)addQuickCostTile(rows)}
    addSoundSetting(node);
    if(node.closest&&(node.closest('#content')||node.closest('#modalRoot'))||node.id==='content'||node.id==='modalRoot'||node===document.body)scheduleCopy();
    if(node.querySelector&&node.querySelector('.mobile-card-row[data-bk-invoice],.mobile-card-row[data-bk-expense]')||node.classList&&node.classList.contains('mobile-card-row'))applyVatMode();
  }
  new MutationObserver(function(list){
    for(var i=0;i<list.length;i++){var added=list[i].addedNodes;for(var j=0;j<added.length;j++)onAdded(added[j])}
  }).observe(document.body,{childList:true,subtree:true});
  onAdded(document.body);
  watchToasts();
})();
