/* BOEKUNA motion — page entrance, counting totals, success checks and the "Betaald" pop.
   Styling lives in motion.css; this file only decides when it plays. */
(function(){
  'use strict';
  var root=document.documentElement;
  // Automated browsers (tests, screenshots) get the still app so values and pixels stay exact.
  var forced=/[?&]motion=1\b/.test(location.search);
  var testRun=false;
  try{testRun=typeof TEST_MODE_NO_AUTH!=='undefined'&&TEST_MODE_NO_AUTH===true}catch(e){}
  if((navigator.webdriver||testRun)&&!forced)return;
  root.classList.add('boekuna-motion');

  var reduced=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
  var COUNT_SELECTOR='.metric-value,.dashboard-summary-value';
  var NUMBER=/^([^\d-]*?)(-?)(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d+))?([^\d]*)$/;
  var SUCCESS=/(opgeslagen|verstuurd|verzonden|toegevoegd|betaald|geboekt|bewaard|gekoppeld|verwijderd|bijgewerkt|aangepast|gelukt|geïmporteerd|gecontroleerd|gekopieerd|klaar)/i;
  var FAILURE=/(niet|mislukt|fout|kon |kan |probeer|controleer|vul )/i;
  var lastPage=null;
  var lastBadges={};
  var enterTimer=0;

  function currentPage(){try{return typeof page==='string'?page:null}catch(e){return null}}

  // 3. Count a total up from zero to its real value, keeping the exact original text at the end.
  function countUp(el){
    var text=el.textContent.replace(/ /g,' ').trim();
    var m=NUMBER.exec(text);
    if(!m)return;
    var decimals=m[4]?m[4].length:0;
    var target=Number(m[3].replace(/\./g,'')+(decimals?'.'+m[4]:''));
    if(!isFinite(target)||target===0)return;
    var original=el.textContent;
    var format=new Intl.NumberFormat('nl-NL',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
    var start=performance.now(),duration=700;
    function frame(now){
      if(!el.isConnected)return;
      var p=Math.min(1,(now-start)/duration),eased=1-Math.pow(1-p,3);
      if(p>=1){el.textContent=original;return}
      el.textContent=(m[1]+m[2]+format.format(target*eased)+m[5]).replace(/ /g,' ');
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function badgeRows(content){
    var map={};
    content.querySelectorAll('tbody tr,.mobile-card-row').forEach(function(row){
      var badge=row.querySelector('.badge');
      var keyEl=row.querySelector('.link-btn,.mobile-card-metadata');
      if(!badge||!keyEl)return;
      var key=(row.classList.contains('mobile-card-row')?'m:':'t:')+keyEl.textContent.split('·')[0].trim();
      map[key]={text:badge.textContent.trim(),badge:badge};
    });
    return map;
  }

  function onRender(content){
    var now=currentPage();
    var entered=now!==lastPage;
    lastPage=now;
    var badges=badgeRows(content);
    if(entered){
      content.classList.remove('motion-enter');
      void content.offsetWidth;
      content.classList.add('motion-enter');
      clearTimeout(enterTimer);
      enterTimer=setTimeout(function(){content.classList.remove('motion-enter')},1000);
      if(!reduced.matches)content.querySelectorAll(COUNT_SELECTOR).forEach(countUp);
    }else{
      // Re-rendering the same page (after saving, filtering) stays still.
      clearTimeout(enterTimer);
      content.classList.remove('motion-enter');
      // 8. Same page re-rendered after a change: pop a status that just turned "Betaald".
      Object.keys(badges).forEach(function(key){
        var before=lastBadges[key];
        if(before&&before.text!=='Betaald'&&badges[key].text==='Betaald')badges[key].badge.classList.add('motion-paid');
      });
    }
    lastBadges=badges;
  }

  // 5. Toasts that confirm something worked get a check mark that draws itself.
  function decorateToast(el){
    if(!el.classList||!el.classList.contains('toast')||el.querySelector('.motion-check'))return;
    var text=el.textContent||'';
    if(!SUCCESS.test(text)||FAILURE.test(text))return;
    el.classList.add('motion-success');
    el.insertAdjacentHTML('afterbegin','<svg class="motion-check" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="10"/><path d="M6 10.4l2.6 2.6L14.2 7.4"/></svg>');
  }

  function install(){
    var content=document.getElementById('content');
    if(content){
      new MutationObserver(function(){onRender(content)}).observe(content,{childList:true});
      if(content.children.length)onRender(content);
    }
    var toasts=document.getElementById('toastRoot');
    if(toasts)new MutationObserver(function(records){
      records.forEach(function(record){record.addedNodes.forEach(decorateToast)});
    }).observe(toasts,{childList:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
