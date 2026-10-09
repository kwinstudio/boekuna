/* BOEKUNA motion — calm, logical movement: pages, totals, lists, details, scans, success checks
   and a livelier overview (trend, mini-chart, ring, profit split). Styling lives in motion.css. */
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
  var phone=window.matchMedia?window.matchMedia('(max-width: 820px)'):{matches:false};
  var COUNT_SELECTOR='.metric-value,.dashboard-summary-value';
  var NUMBER=/^([^\d-]*?)(-?)(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d+))?([^\d]*)$/;
  var SUCCESS=/(opgeslagen|verstuurd|verzonden|toegevoegd|betaald|geboekt|bewaard|gekoppeld|verwijderd|bijgewerkt|aangepast|gelukt|geïmporteerd|gecontroleerd|gekopieerd|klaar)/i;
  var FAILURE=/(niet|mislukt|fout|kon |kan |probeer|controleer|vul )/i;
  var ROW_SELECTOR='tbody tr,.mobile-card-row';
  var lastPage=null;
  var lastBadges={};
  var rowsByPage={};
  var valuesByPage={};
  var enterTimer=0;
  var lastTap=null;
  var seenDocs=null,lastFly=0;

  function currentPage(){try{return typeof page==='string'?page:null}catch(e){return null}}
  // App helpers are global functions; state and the job list are global let-bindings, read by name.
  function g(name){
    try{
      if(name==='state')return typeof state!=='undefined'?state:undefined;
      if(name==='documentProcessingJobs')return typeof documentProcessingJobs!=='undefined'?documentProcessingJobs:undefined;
    }catch(e){return undefined}
    return typeof window[name]==='function'?window[name]:undefined;
  }

  function parseAmount(text){
    var m=NUMBER.exec(String(text||'').replace(/ /g,' ').trim());
    if(!m)return null;
    var decimals=m[4]?m[4].length:0;
    var value=Number(m[3].replace(/\./g,'')+(decimals?'.'+m[4]:''));
    if(!isFinite(value))return null;
    return {m:m,decimals:decimals,value:m[2]?-value:value};
  }
  function formatLike(parsed,value){
    var format=new Intl.NumberFormat('nl-NL',{minimumFractionDigits:parsed.decimals,maximumFractionDigits:parsed.decimals});
    return (parsed.m[1]+(value<0?'-':'')+format.format(Math.abs(value))+parsed.m[5]).replace(/ /g,' ');
  }
  var euro=new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'});

  // Totals count from where they were (zero the first time) to their real value, ending on the exact original text.
  function countTo(el,from){
    var parsed=parseAmount(el.textContent);
    if(!parsed||reduced.matches)return;
    var target=parsed.value,start=performance.now(),duration=700,original=el.textContent;
    if(from===target||(from===0&&target===0))return;
    function frame(now){
      if(!el.isConnected)return;
      var p=Math.min(1,(now-start)/duration),eased=1-Math.pow(1-p,3);
      if(p>=1){el.textContent=original;return}
      el.textContent=formatLike(parsed,from+(target-from)*eased);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  function valueKey(el){
    var card=el.closest('.card,.metric')||el.parentElement;
    var label=card&&card.querySelector('.dashboard-kpi-label,.metric-label,.dashboard-summary-title,.metric-head span,small');
    return (label?label.textContent.trim():'')+'|'+Array.prototype.indexOf.call(el.ownerDocument.querySelectorAll(COUNT_SELECTOR),el);
  }
  function animateValues(content,pageName,sameRender){
    var before=valuesByPage[pageName]||{},after={};
    content.querySelectorAll(COUNT_SELECTOR).forEach(function(el){
      var parsed=parseAmount(el.textContent);if(!parsed)return;
      var key=valueKey(el);after[key]=parsed.value;
      var had=Object.prototype.hasOwnProperty.call(before,key);
      if(!had){if(!sameRender)countTo(el,0);return}
      if(before[key]===parsed.value)return;
      countTo(el,before[key]);
      // A change you caused shows how much it moved.
      if(/€/.test(el.textContent)){
        var diff=Math.round((parsed.value-before[key])*100)/100,host=el.closest('.card')||el.parentElement;
        var chip=document.createElement('span');
        chip.className='motion-delta '+(diff>=0?'is-up':'is-down');chip.setAttribute('aria-hidden','true');
        chip.textContent=(diff>=0?'+ ':'− ')+euro.format(Math.abs(diff)).replace(/^-/,'');
        host.classList.add('motion-delta-host');host.appendChild(chip);
        setTimeout(function(){chip.remove()},1400);
      }
    });
    valuesByPage[pageName]=after;
  }

  // Rows: a key per row so we can see what was added or removed between renders.
  function rowKey(row){
    if(row.classList.contains('mobile-card-row')){
      var t=row.querySelector('.mobile-card-title'),m=row.querySelector('.mobile-card-metadata');
      return 'm:'+(t?t.textContent.trim():'')+'|'+(m?m.textContent.trim():'');
    }
    var cells=row.querySelectorAll('td');
    return 't:'+(cells[0]?cells[0].textContent.trim():'')+'|'+(cells[1]?cells[1].textContent.trim():'');
  }
  function snapshotRows(content){
    var list=[];
    content.querySelectorAll(ROW_SELECTOR).forEach(function(row){if(row.closest('.motion-ghost'))return;list.push({key:rowKey(row),html:row.outerHTML,row:row})});
    return list;
  }
  function countKeys(list){var c={};list.forEach(function(r){c[r.key]=(c[r.key]||0)+1});return c}
  function diffRows(before,after){
    var b=countKeys(before),a=countKeys(after),added=[],removed=[],seen={},seenB={},kindIndex={};
    after.forEach(function(r){seen[r.key]=(seen[r.key]||0)+1;if(seen[r.key]>(b[r.key]||0))added.push(r)});
    before.forEach(function(r){
      var kind=r.key.charAt(0);kindIndex[kind]=(kindIndex[kind]||0);
      seenB[r.key]=(seenB[r.key]||0)+1;
      if(seenB[r.key]>(a[r.key]||0))removed.push({key:r.key,html:r.html,index:kindIndex[kind],kind:kind});
      kindIndex[kind]++;
    });
    return {added:added,removed:removed};
  }
  // A. A new item slides into its place and lights up briefly.
  function markNew(rows){rows.forEach(function(r){r.row.classList.add('motion-new')})}
  // B. A removed item slides out and the rows below close the gap.
  function ghostRemoved(content,after,removed){
    removed.forEach(function(r){
      var sameKind=after.filter(function(x){return x.key.charAt(0)===r.kind}).map(function(x){return x.row});
      var anchor=sameKind[r.index]||null;
      var parent=anchor?anchor.parentElement:(sameKind.length?sameKind[sameKind.length-1].parentElement:null);
      if(!parent||!parent.getClientRects().length)return;
      var holder=document.createElement(r.kind==='t'?'tbody':'div');holder.innerHTML=r.html;
      var ghost=holder.firstElementChild;if(!ghost)return;
      ghost.classList.add('motion-ghost');ghost.setAttribute('aria-hidden','true');ghost.setAttribute('inert','');
      ghost.classList.remove('motion-new');
      parent.insertBefore(ghost,anchor&&anchor.parentElement===parent?anchor:null);
      var done=false;
      function finish(){
        if(done)return;done=true;
        var below=[],n=ghost.nextElementSibling;
        while(n&&below.length<12){below.push({el:n,top:n.getBoundingClientRect().top});n=n.nextElementSibling}
        ghost.remove();
        below.forEach(function(b){
          var dy=b.top-b.el.getBoundingClientRect().top;if(!dy)return;
          b.el.animate([{transform:'translateY('+dy+'px)'},{transform:'none'}],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'});
        });
      }
      ghost.addEventListener('animationend',finish,{once:true});
      setTimeout(finish,500);
    });
  }

  function badgeRows(content){
    var map={};
    content.querySelectorAll(ROW_SELECTOR).forEach(function(row){
      var badge=row.querySelector('.badge');
      var keyEl=row.querySelector('.link-btn,.mobile-card-metadata');
      if(!badge||!keyEl)return;
      var key=(row.classList.contains('mobile-card-row')?'m:':'t:')+keyEl.textContent.split('·')[0].trim();
      map[key]={text:badge.textContent.trim(),badge:badge};
    });
    return map;
  }

  // C. On a phone, a new screen comes from the side of the tab you tapped.
  function navOrder(){
    var items=document.querySelectorAll(phone.matches?'#mobileBottomNav [data-mobile-page]':'.nav-item[data-page]');
    return Array.prototype.map.call(items,function(el){return el.getAttribute('data-mobile-page')||el.getAttribute('data-page')});
  }
  function direction(from,to){
    if(!phone.matches||!from||!to)return '';
    var order=navOrder(),a=order.indexOf(from),b=order.indexOf(to);
    if(a<0||b<0||a===b)return '';
    return b>a?'motion-dir-right':'motion-dir-left';
  }

  // 1-4. A livelier overview, kept calm: one trend line on profit and a quiet mini-chart.
  function sumPeriod(from,to){
    var inRange=g('inRange'),invoiceNet=g('invoiceNet'),expenseCost=g('expenseAccountingCost'),status=g('invoiceEffectiveStatus'),st=g('state');
    if(!st||!inRange||!invoiceNet||!expenseCost||!status)return null;
    var sales=0,costs=0;
    (st.invoices||[]).forEach(function(i){if(i.status!=='draft'&&status(i)!=='cancelled'&&inRange(i.issueDate,from,to))sales+=invoiceNet(i)});
    (st.expenses||[]).forEach(function(e){if(inRange(e.date,from,to))costs+=expenseCost(e)});
    sales=Math.round(sales*100)/100;costs=Math.round(costs*100)/100;
    return {sales:sales,costs:costs,profit:Math.round((sales-costs)*100)/100};
  }
  function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function shift(isoDate,preset){
    var d=new Date(isoDate+'T12:00:00'),day=d.getDate();
    if(preset==='week'){d.setDate(day-7);return iso(d)}
    var months=preset==='quarter'?3:preset==='year'?12:1;
    d.setDate(1);d.setMonth(d.getMonth()-months);
    var last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));
    return iso(d);
  }
  var PREVIOUS={week:'vorige week',month:'vorige maand',quarter:'vorig kwartaal',year:'vorig jaar'};
  function sparkSvg(values,color){
    var w=120,h=28,pad=3,min=Math.min.apply(null,values.concat([0])),max=Math.max.apply(null,values.concat([0]));
    if(max===min)max=min+1;
    var pts=values.map(function(v,i){return [pad+i*(w-pad*2)/(values.length-1),pad+(h-pad*2)*(1-(v-min)/(max-min))]});
    var line=pts.map(function(p,i){return (i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)}).join(' ');
    var area=line+' L'+pts[pts.length-1][0].toFixed(1)+' '+h+' L'+pts[0][0].toFixed(1)+' '+h+' Z';
    var end=pts[pts.length-1];
    // The end dot is HTML so it stays round while the line stretches to the card width.
    return '<div class="motion-spark-wrap" style="--spark:'+color+'"><svg class="motion-spark" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none" aria-hidden="true"><path class="motion-spark-area" d="'+area+'"/><path class="motion-spark-line" pathLength="100" d="'+line+'"/></svg><span class="motion-spark-dot" aria-hidden="true" style="left:'+(end[0]/w*100).toFixed(2)+'%;top:'+(end[1]/h*100).toFixed(2)+'%"></span></div>';
  }
  function decorateDashboard(content,entered){
    var cards=content.querySelectorAll('.dashboard-kpi');
    if(!cards.length)return;
    var preset=String(sessionStorage.getItem('dashboardPeriod')||'month');
    var rangeFn=g('dashboardPeriodRange'),range=null;
    try{range=rangeFn?rangeFn(preset):null}catch(e){}
    var now=new Date(),months=[];
    for(var i=5;i>=0;i--){var s=new Date(now.getFullYear(),now.getMonth()-i,1),e=i?new Date(now.getFullYear(),now.getMonth()-i+1,0):now;months.push(sumPeriod(iso(s),iso(e)))}
    if(months.some(function(x){return !x}))return;
    var current=range&&range.from&&range.to?sumPeriod(range.from,range.to):null;
    var previous=current&&PREVIOUS[range.preset]?sumPeriod(shift(range.from,range.preset),shift(range.to,range.preset)):null;
    var hasHistory=months.some(function(x){return x.sales||x.costs});
    cards.forEach(function(card){
      if(card.querySelector('.motion-kpi-extra'))return;
      var label=(card.querySelector('.dashboard-kpi-label')||{}).textContent||'';
      var kind=/winst/i.test(label)?'profit':/omzet/i.test(label)?'sales':/kosten/i.test(label)?'costs':'';
      if(!kind)return;
      var html='';
      if(kind!=='profit'&&kind!=='sales'&&kind!=='costs')return;
      var color=kind==='sales'?'#63D471':kind==='costs'?'#E5534B':'#3B82F6';
      if(kind==='profit'&&previous)html+=trendHtml(kind,current[kind],previous[kind],PREVIOUS[range.preset]);
      if(hasHistory)html+=sparkSvg(months.map(function(m){return m[kind]}),color);
      if(!html)return;
      var extra=document.createElement('div');extra.className='motion-kpi-extra'+(entered?' is-entering':'');extra.innerHTML=html;
      card.appendChild(extra);
    });
  }
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function trendHtml(kind,now,before,label){
    var diff=Math.round((now-before)*100)/100;
    if(!now&&!before)return '';
    var good=kind==='costs'?diff<=0:diff>=0;
    var text=(before>0&&now>=0)?Math.round(Math.abs(diff)/before*100)+'%':euro.format(Math.abs(diff));
    if(diff===0)return '<span class="motion-trend is-flat">Gelijk aan '+esc(label)+'</span>';
    return '<span class="motion-trend '+(good?'is-good':'is-bad')+'"><span class="motion-arrow" aria-hidden="true">'+(diff>0?'▲':'▼')+'</span><span class="motion-sr">'+(diff>0?'hoger, ':'lager, ')+'</span>'+text+' t.o.v. '+esc(label)+'</span>';
  }

  function onRender(content){
    var now=currentPage();
    var entered=now!==lastPage;
    var from=lastPage;
    lastPage=now;
    var badges=badgeRows(content);
    var rows=snapshotRows(content);
    var before=rowsByPage[now];
    if(entered){
      content.classList.remove('motion-enter','motion-dir-right','motion-dir-left');
      void content.offsetWidth;
      var dir=direction(from,now);
      content.classList.add('motion-enter');if(dir)content.classList.add(dir);
      clearTimeout(enterTimer);
      enterTimer=setTimeout(function(){content.classList.remove('motion-enter','motion-dir-right','motion-dir-left')},1000);
    }else{
      // Re-rendering the same page (after saving, filtering) keeps the page still; only what changed moves.
      clearTimeout(enterTimer);
      content.classList.remove('motion-enter','motion-dir-right','motion-dir-left');
      Object.keys(badges).forEach(function(key){
        var old=lastBadges[key];
        if(old&&old.text!=='Betaald'&&badges[key].text==='Betaald')badges[key].badge.classList.add('motion-paid');
      });
    }
    if(before&&!reduced.matches){
      var d=diffRows(before,rows),grew=rows.length-before.length;
      if(d.added.length&&d.added.length<=3&&grew===d.added.length&&!d.removed.length)markNew(d.added);
      if(!entered&&d.removed.length&&d.removed.length<=2&&!d.added.length&&-grew===d.removed.length)ghostRemoved(content,rows,d.removed);
    }
    lastBadges=badges;
    rowsByPage[now]=rows.map(function(r){return {key:r.key,html:r.html}});
    if(now==='dashboard')decorateDashboard(content,entered);
    animateValues(content,now,!entered);
    watchDocuments();
  }

  // D. A newly scanned or uploaded receipt flies to Bonnen.
  function documentIds(){
    var st=g('state'),jobs=g('documentProcessingJobs'),ids=[];
    ((st&&st.documents)||[]).forEach(function(d){if(d&&d.id)ids.push('d:'+d.id)});
    (Array.isArray(jobs)?jobs:[]).forEach(function(j){var id=j&&(j.client_ref||j.clientRef||j.id);if(id)ids.push('j:'+id)});
    return ids;
  }
  function watchDocuments(){
    var ids=documentIds();
    if(seenDocs===null){seenDocs={};ids.forEach(function(id){seenDocs[id]=1});return}
    var fresh=ids.filter(function(id){return !seenDocs[id]});
    ids.forEach(function(id){seenDocs[id]=1});
    if(fresh.length&&fresh.length<=3&&Date.now()-lastFly>4000){lastFly=Date.now();flyToDocuments()}
  }
  function flyToDocuments(){
    if(reduced.matches)return;
    var target=document.querySelector(phone.matches?'#mobileBottomNav [data-mobile-page="documents"]':'.nav-item[data-page="documents"]');
    if(!target)return;
    var t=target.getBoundingClientRect();if(!t.width)return;
    var chip=document.createElement('div');chip.className='motion-fly';chip.setAttribute('aria-hidden','true');
    chip.innerHTML='<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>';
    document.body.appendChild(chip);
    var sx=window.innerWidth/2-22,sy=window.innerHeight/2-22,tx=t.left+t.width/2-22,ty=t.top+t.height/2-22;
    var anim=chip.animate([
      {transform:'translate('+sx+'px,'+sy+'px) scale(.6)',opacity:0},
      {transform:'translate('+sx+'px,'+(sy-12)+'px) scale(1)',opacity:1,offset:.25},
      {transform:'translate('+tx+'px,'+ty+'px) scale(.35)',opacity:.4}
    ],{duration:750,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});
    anim.onfinish=function(){chip.remove();target.classList.remove('motion-bump');void target.offsetWidth;target.classList.add('motion-bump');setTimeout(function(){target.classList.remove('motion-bump')},500)};
  }

  // E. A detail window grows out of the row you tapped.
  function rememberTap(event){
    var row=event.target&&event.target.closest&&event.target.closest('#content tbody tr,#content .mobile-card-row,#content .dashboard-attention-item');
    lastTap=row?{rect:row.getBoundingClientRect(),time:Date.now()}:null;
  }
  function onModal(){
    var modal=document.querySelector('#modalRoot .modal');
    if(!modal||modal.dataset.motionSeen)return;
    modal.dataset.motionSeen='1';
    if(!lastTap||Date.now()-lastTap.time>900||reduced.matches)return;
    var m=modal.getBoundingClientRect(),r=lastTap.rect;lastTap=null;
    modal.style.transformOrigin=Math.round(r.left+r.width/2-m.left)+'px '+Math.round(r.top+r.height/2-m.top)+'px';
    modal.classList.add('motion-from-row');
  }

  // Toasts that confirm something worked get a check mark that draws itself.
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
    var modalRoot=document.getElementById('modalRoot');
    if(modalRoot)new MutationObserver(onModal).observe(modalRoot,{childList:true});
    document.addEventListener('pointerdown',rememberTap,true);
    // Uploads can finish without a page render; a light check keeps the Bonnen flight honest.
    setInterval(function(){if(document.visibilityState==='visible'&&seenDocs!==null)watchDocuments()},2000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
