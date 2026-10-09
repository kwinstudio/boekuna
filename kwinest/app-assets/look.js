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
