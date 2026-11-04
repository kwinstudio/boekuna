/* BOEKUNA klopt — proven patterns from Revolut, the iPhone and the other bookkeeping apps, so the app says one thing
   one way everywhere (Kwin 2026-11-04, "UI-trucs" 5, 7, 9, 11, 12). The logic fixes (1-4, 6, 8, 15) live in the app itself,
   the pull-down on a whole sheet (14) in motion.js. Styling lives in klopt.css.
   5  a Boekuna sheet with a red button instead of the browser's grey pop-up (Apple HIG, action sheets)
   7  every big amount with small cents, the way the rest of the app shows them
   9  small actions as green text without an underline (Apple HIG, tint colour); 12: the chosen tab gets a filled icon
   11 the big title scrolls away and a thin bar with the small title stays at the top (Apple, large titles) */
(function(){
  'use strict';
  var root=document.documentElement;
  // Automated browsers (tests, screenshots) get the plain app like motion.js, handig.js and gevoel.js; ?klopt=1 turns it on.
  var forced=/[?&]klopt=1\b/.test(location.search);
  var testRun=false;
  try{testRun=typeof TEST_MODE_NO_AUTH!=='undefined'&&TEST_MODE_NO_AUTH===true}catch(e){}
  if((navigator.webdriver||testRun)&&!forced)return;
  root.classList.add('boekuna-klopt');

  var phone=window.matchMedia?window.matchMedia('(max-width: 820px)'):{matches:false};

  /* ---------- 5. Ask in a Boekuna sheet, not in a browser pop-up ---------- */
  var asking=null;
  window.boekunaAsk=function(opts,onYes){
    opts=opts||{};
    if(asking)asking.close(false);
    var back=document.createElement('div');back.className='bk-confirm';
    var box=document.createElement('div');box.className='bk-confirm-box';box.setAttribute('role','alertdialog');box.setAttribute('aria-modal','true');
    var id='bkConfirm'+Date.now();box.setAttribute('aria-labelledby',id+'t');
    var title=document.createElement('h2');title.id=id+'t';title.textContent=opts.title||'Weet je het zeker?';box.appendChild(title);
    if(opts.text){var text=document.createElement('p');text.id=id+'d';text.textContent=opts.text;box.appendChild(text);box.setAttribute('aria-describedby',id+'d')}
    var row=document.createElement('div');row.className='bk-confirm-actions';
    var no=document.createElement('button');no.type='button';no.className='bk-confirm-no';no.textContent=opts.cancel||'Annuleren';
    var yes=document.createElement('button');yes.type='button';yes.className='bk-confirm-yes';yes.textContent=opts.ok||'Verwijderen';
    row.appendChild(yes);row.appendChild(no);box.appendChild(row);back.appendChild(box);
    var before=document.activeElement,done=false;
    function close(ok){
      if(done)return;done=true;asking=null;
      document.removeEventListener('keydown',onKey,true);
      back.classList.add('is-leaving');back.inert=true;setTimeout(function(){back.remove()},180);
      try{if(before&&before.isConnected&&before.focus)before.focus({preventScroll:true})}catch(e){}
      if(ok)onYes();
    }
    function onKey(e){
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(false)}
      else if(e.key==='Tab'){var order=[yes,no],at=order.indexOf(document.activeElement);e.preventDefault();order[(at+(e.shiftKey?order.length-1:1))%order.length].focus()}
    }
    yes.addEventListener('click',function(){close(true)});
    no.addEventListener('click',function(){close(false)});
    back.addEventListener('click',function(e){if(e.target===back)close(false)});
    document.addEventListener('keydown',onKey,true);
    document.body.appendChild(back);
    asking={close:close};
    // The safe choice has the focus, so Enter never removes something by accident.
    requestAnimationFrame(function(){no.focus({preventScroll:true})});
  };

  /* ---------- 7. Small cents on every big amount ---------- */
  var CENTS='.report-story-amount,.invoice-view-amount,.expense-detail-amount';
  function cents(rootEl){
    var look=window.boekunaLook;if(!look||!rootEl||rootEl.nodeType!==1)return;
    if(rootEl.matches&&rootEl.matches(CENTS))look.cents(rootEl);
    rootEl.querySelectorAll(CENTS).forEach(function(el){look.cents(el)});
  }

  /* ---------- 11. The title stays at the top when you scroll ---------- */
  var compact=false,ticking=false;
  function heroTitle(){
    // A page's band starts with its title; the overview's band starts with the big Winst number.
    var content=document.getElementById('content'),hero=content&&content.querySelector(':scope > .r1d-hero');
    return hero&&(hero.querySelector(':scope > .r1d-title')||hero.firstElementChild);
  }
  function syncCompact(){
    ticking=false;
    var title=phone.matches&&heroTitle(),bar=document.querySelector('#mainApp .topbar'),on=false;
    if(title&&bar){var r=title.getBoundingClientRect(),b=bar.getBoundingClientRect();on=r.bottom<=b.bottom}
    if(on!==compact){compact=on;root.classList.toggle('bk-compact',on)}
  }
  function onScroll(){if(!ticking){ticking=true;requestAnimationFrame(syncCompact)}}
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',onScroll,{passive:true});

  function install(){
    var content=document.getElementById('content'),modalRoot=document.getElementById('modalRoot');
    if(content){
      cents(content);
      new MutationObserver(function(records){
        records.forEach(function(r){r.addedNodes.forEach(cents)});
        onScroll();
      }).observe(content,{childList:true,subtree:true});
    }
    if(modalRoot)new MutationObserver(function(records){records.forEach(function(r){r.addedNodes.forEach(cents)})}).observe(modalRoot,{childList:true,subtree:true});
    syncCompact();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
