/* BOEKUNA vegen — swipe left and right between the phone tabs (Kwin 2026-10-28: "dat we de schermen kan swipen").
   Overzicht, Inkomsten, Kosten and Bonnen sit side by side like the tab bar: swipe left for the next one, right for the
   one before. Gestures that were there first keep winning: a list row that has an action that way (Betaald, Meer,
   Weghalen in handig.js), a row of chips that scrolls sideways, a sheet, the menu, and the screen edges, where the iPhone
   swipes back.

   Soepeler (Kwin 2026-11-02: "het swipen gaat nog niet soepel"), the way native tab pagers do it:
   - the screen sticks to your finger 1:1 (before it lagged at 60% and faded), with a soft stop where there is no next tab;
   - the next screen already slides in beside it, so you see where you are going. It is the screen as you last left it
     (kept when you left that tab, nothing is rendered during the swipe), swapped for the fresh one when the swipe lands;
   - letting go finishes the move at the speed of your flick, both screens together, instead of a fade and a second
     slide-in; the tab bar switches the moment you let go. */
(function(){
  'use strict';
  var root=document.documentElement;
  // Automated browsers (tests, screenshots) get the plain app like motion.js and handig.js; ?vegen=1 turns it on.
  var forced=/[?&]vegen=1\b/.test(location.search);
  var testRun=false;
  try{testRun=typeof TEST_MODE_NO_AUTH!=='undefined'&&TEST_MODE_NO_AUTH===true}catch(e){}
  if((navigator.webdriver||testRun)&&!forced)return;
  root.classList.add('boekuna-vegen');

  var phone=window.matchMedia?window.matchMedia('(max-width: 820px)'):{matches:false};
  var reduced=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
  var EDGE=24,DECIDE=8,FLICK=0.35,KEEP=15*60e3;
  var EASE='cubic-bezier(.22,.75,.25,1)';
  function currentPage(){try{return typeof page==='string'?page:null}catch(e){return null}}
  function tabs(){return Array.prototype.map.call(document.querySelectorAll('#mobileBottomNav [data-mobile-page]'),function(el){return el.getAttribute('data-mobile-page')})}
  function width(){return window.innerWidth||390}
  function tick(){try{var h=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.boekunaHaptic;if(h){h.postMessage('tap');return}}catch(e){}try{if(navigator.vibrate)navigator.vibrate(10)}catch(e){}}
  function sideScroller(el,stop){
    for(;el&&el!==stop;el=el.parentElement){
      if(el.scrollWidth>el.clientWidth+2){var o=getComputedStyle(el).overflowX;if(o==='auto'||o==='scroll')return true}
    }
    return false;
  }
  function blocked(target,content){
    if(!phone.matches||!target||!target.closest||!content.contains(target))return true;
    if(document.querySelector('#modalRoot [role="dialog"]'))return true;
    var side=document.getElementById('sidebar');if(side&&side.classList.contains('open'))return true;
    if(document.body.dataset.productAuthenticated==='false')return true;
    if(target.closest('input,textarea,select,[contenteditable="true"],[draggable="true"],.sortable-chosen,.sortable-drag,canvas'))return true;
    return false;
  }

  /* ---------- The screen you left, kept for the next swipe ----------
     render() replaces #content's children with innerHTML, so the old children are simply let go. We hold on to them
     (no copy, no extra work) in a stand-in #content that is only shown while you swipe. */
  var kept={};
  function keepLeaving(from,content){
    var box=document.createElement('div');
    box.id='content';
    box.className=String(content.className||'').replace(/\b(motion-enter|motion-dir-left|motion-dir-right|bk-paging)\b/g,'').trim()+' bk-peek';
    if(content.dataset.page)box.dataset.page=content.dataset.page;
    box.setAttribute('aria-hidden','true');box.setAttribute('inert','');
    return {box:box,kids:Array.prototype.slice.call(content.childNodes),top:content.getBoundingClientRect().top,at:Date.now(),from:from};
  }
  function storeKept(k){
    // Only when the page really changed and the old children were let go untouched.
    for(var i=0;i<k.kids.length;i++)if(k.kids[i].isConnected)return;
    if(!k.kids.length)return;
    k.kids.forEach(function(n){k.box.appendChild(n)});
    delete k.kids;
    kept[k.from]=k;
  }
  function wrapNavigate(){
    var orig=window.navigate;if(typeof orig!=='function'||orig.__vegen)return;
    var wrapped=function(next){
      var from=currentPage(),content=document.getElementById('content'),k=null;
      if(phone.matches&&content&&from&&next!==from&&tabs().indexOf(from)>=0)k=keepLeaving(from,content);
      var result=orig.apply(this,arguments);
      if(k){
        var done=false,finish=function(){if(done||currentPage()!==next)return;done=true;storeKept(k)};
        finish();
        if(result&&typeof result.then==='function')result.then(finish,function(){});
      }
      if(phone.matches)prerenderNeighbours();
      return result;
    };
    wrapped.__vegen=true;wrapped.__bk=orig.__bk;
    window.navigate=wrapped;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wrapNavigate,{once:true});else wrapNavigate();

  /* ---------- The tab beside you, ready before you swipe (Kwin 2026-11-05: "niet altijd soepel genoeg") ----------
     The first swipe to a tab you had not opened yet showed empty colour beside the screen and slid the new one in late.
     When the phone has a quiet moment, the tabs left and right of this one are drawn once into the same stand-in as a
     kept screen, at the top (where a tab you open fresh starts). Nothing is shown and nothing listens until you swipe. */
  var RENDER={dashboard:'renderDashboard',invoices:'renderInvoices',expenses:'renderExpenses',documents:'renderDocuments'};
  function prerender(name){
    var k=kept[name];if(k&&Date.now()-k.at<KEEP)return;
    var fn=window[RENDER[name]],content=document.getElementById('content'),now=currentPage();
    if(typeof fn!=='function'||!content||!now||now===name||!phone.matches)return;
    var box=document.createElement('div'),html;
    try{
      page=name;
      html=typeof window.renderMemoized==='function'&&typeof renderMemo!=='undefined'?(function(){var outer=renderMemo;renderMemo=outer||new Map();try{return fn()}finally{if(!outer)renderMemo=null}})():fn();
      box.id='content';
      box.className=String(content.className||'').replace(/\b(motion-enter|motion-dir-left|motion-dir-right|bk-paging|bk-peek)\b/g,'').trim()+' bk-peek';
      box.dataset.page=name;box.setAttribute('aria-hidden','true');box.setAttribute('inert','');
      box.innerHTML=html;
      if(typeof window.applyPhoneBand==='function')window.applyPhoneBand(box);
    }catch(e){return}
    finally{page=now}
    kept[name]={box:box,top:content.getBoundingClientRect().top+(window.scrollY||0),at:Date.now(),from:name};
  }
  var preTimer=0;
  function prerenderNeighbours(){
    clearTimeout(preTimer);
    preTimer=setTimeout(function(){
      var idle=window.requestIdleCallback||function(cb){return setTimeout(cb,1)};
      idle(function(){
        if(g)return; // never in the middle of a swipe
        var order=tabs(),at=order.indexOf(currentPage());if(at<0)return;
        [order[at+1],order[at-1]].forEach(function(name){if(name)prerender(name)});
      },{timeout:1500});
    },450);
  }
  if(document.readyState==='complete')prerenderNeighbours();else window.addEventListener('load',prerenderNeighbours,{once:true});
  // Data that changed elsewhere (a sync, an edit) makes a kept screen old news.
  window.addEventListener('pagehide',function(){kept={}});

  // Place the kept screen beside the real one, exactly where it will be once that tab opens.
  function showPeek(g,dir){
    var name=g.order[g.at+dir],k=name&&kept[name];
    if(!k||Date.now()-k.at>KEEP)return null;
    var box=k.box,content=g.content,r=content.getBoundingClientRect(),left=r.left-(g.shown||0);
    // handig.js brings you back to where you were on that tab (within 15 minutes, the same as KEEP), so it lands right here.
    var top=k.top;
    box.style.cssText='position:fixed;left:0;top:0;margin:0;box-sizing:border-box;width:'+r.width+'px;pointer-events:none;z-index:1;transition:none;transform:none;will-change:transform';
    if(box.parentNode!==content.parentNode||box.previousSibling!==content)content.parentNode.insertBefore(box,content.nextSibling);
    var o=box.getBoundingClientRect();
    box.style.left=(left-o.left)+'px';box.style.top=(top-o.top)+'px';
    return {box:box,dir:dir,name:name};
  }
  function hidePeek(p){if(p&&p.box.parentNode)p.box.parentNode.removeChild(p.box)}

  var g=null,gen=0; // gen: a later swipe owns the screen, so an older swipe's timer must not reset it
  function place(s,dx,ms,ease){
    var w=width(),tr=ms?'transform '+ms+'ms '+(ease||EASE):'none';
    s.shown=dx;
    s.content.style.transition=tr;
    s.content.style.transform=dx?'translate3d('+dx+'px,0,0)':'translate3d(0,0,0)';
    if(s.peek){s.peek.box.style.transition=tr;s.peek.box.style.transform='translate3d('+(dx+s.peek.dir*w)+'px,0,0)'}
  }
  function clearShift(content){content.style.transition='';content.style.transform='';content.style.willChange='';content.classList.remove('bk-paging')}

  document.addEventListener('touchstart',function(e){
    if(g&&g.settling)return;
    g=null;
    if(e.touches.length!==1)return;
    var content=document.getElementById('content'),t=e.touches[0];if(!content)return;
    var w=width();
    if(t.clientX<EDGE||t.clientX>w-EDGE)return; // the iPhone's own swipe back and forward
    if(blocked(e.target,content))return;
    var order=tabs(),now=currentPage(),at=order.indexOf(now);
    if(at<0)return; // only on the four tab screens themselves, not on pages opened from the menu
    var ts=e.timeStamp||Date.now();
    g={content:content,target:e.target,x:t.clientX,y:t.clientY,dx:0,axis:null,order:order,at:at,samples:[[ts,t.clientX]],peek:null};
  },{capture:true,passive:true});

  document.addEventListener('touchmove',function(e){
    if(!g||g.settling)return;
    if(e.touches.length!==1){cancel();return}
    var t=e.touches[0],mx=t.clientX-g.x,my=t.clientY-g.y;
    if(!g.axis){
      if(Math.abs(mx)+Math.abs(my)<DECIDE)return;
      if(Math.abs(mx)<=Math.abs(my)*1.2){g=null;return}
      // A list row that already started its own swipe (handig.js) keeps the finger.
      var row=g.target.closest('.mobile-card-row');
      if(row&&row.classList.contains('bk-swiping')){g=null;return}
      if(sideScroller(g.target,g.content)){g=null;return}
      g.axis='x';gen++;g.content.classList.add('bk-paging');g.content.style.willChange='transform';
      g.x=t.clientX; // start from here, so the screen does not jump by the few pixels it took to decide
      mx=0;
    }
    if(e.cancelable)e.preventDefault(); // no vertical drift while you swipe sideways
    var dir=mx<0?1:-1,has=g.at+dir>=0&&g.at+dir<g.order.length;
    if(mx&&(!g.peek||g.peek.dir!==dir)){hidePeek(g.peek);g.peek=has?showPeek(g,dir):null}
    var w=width();
    // Where there is no next tab the screen gives a little, then stops, like the end of a list.
    var dx=has?mx:(mx/(1+Math.abs(mx)/(w*.18)))*.5;
    g.dx=mx;g.has=has;
    var ts=e.timeStamp||Date.now();g.samples.push([ts,t.clientX]);if(g.samples.length>6)g.samples.shift();
    place(g,dx,0);
  },{capture:true,passive:false});

  // Speed of the last ~80 ms of the finger, in px per ms.
  function velocity(s){
    var list=s.samples,last=list[list.length-1],first=last;
    for(var i=list.length-2;i>=0;i--){if(last[0]-list[i][0]>80)break;first=list[i]}
    // A finger that stopped before it let go is not a flick: the screen goes where it is, not where it was heading.
    if(s.endTs&&s.endTs-last[0]>100)return 0;
    var dt=last[0]-first[0];return dt>0?(last[1]-first[1])/dt:0;
  }
  function markTab(name){
    document.querySelectorAll('#mobileBottomNav [data-mobile-page]').forEach(function(el){el.classList.toggle('active',el.getAttribute('data-mobile-page')===name)});
  }
  function settle(s,fn,ms){s.settling=true;var done=false,go=function(){if(done)return;done=true;s.settling=false;if(g===s)g=null;fn()};s.content.addEventListener('transitionend',function te(ev){if(ev.target===s.content){s.content.removeEventListener('transitionend',te);go()}});setTimeout(go,ms+60)}
  function cancel(){
    var s=g;if(!s)return;
    if(s.axis!=='x'){g=null;return}
    place(s,0,200);
    settle(s,function(){hidePeek(s.peek);clearShift(s.content)},200);
  }

  var swipedAt=0;
  function end(){
    var s=g;
    if(!s||s.settling)return;
    if(s.axis!=='x'){g=null;return}
    swipedAt=Date.now();
    var w=width(),dir=s.dx<0?1:-1,target=s.order[s.at+dir],v=velocity(s);
    var flick=Math.abs(v)>FLICK&&Math.abs(s.dx)>20&&(v<0)===(s.dx<0);
    if(!target||!s.has||(Math.abs(s.dx)<w*.3&&!flick)){cancel();return}
    tick();markTab(target);
    var go=function(){
      var peek=s.peek,content=s.content;
      try{window.__boekunaSwipeNav=Date.now()}catch(e){}
      // Render the real tab while the kept copy still covers it, then swap in the same frame: nothing moves.
      content.style.transition='none';content.style.transform='translate3d(0,0,0)';
      if(typeof window.navigate==='function')window.navigate(target);
      hidePeek(peek);
      if(peek||reduced.matches){clearShift(content);return}
      // No kept copy (first visit of that tab): the new screen slides the rest of the way in.
      content.style.transform='translate3d('+(dir*w*.35)+'px,0,0)';
      void content.offsetWidth;
      content.style.transition='transform 220ms '+EASE;content.style.transform='translate3d(0,0,0)';
      var mine=gen;setTimeout(function(){if(gen===mine)clearShift(content)},260);
    };
    if(reduced.matches){g=null;go();return}
    // Finish the move at the speed of the flick: fast flicks land fast, a slow drag eases out.
    var left=w-Math.abs(s.dx),speed=Math.max(Math.abs(v),1.1),ms=Math.round(Math.min(280,Math.max(140,left/speed)));
    place(s,-dir*w,ms);
    settle(s,go,ms);
  }
  document.addEventListener('touchend',function(e){if(g)g.endTs=e.timeStamp||Date.now();end()},{capture:true,passive:true});
  document.addEventListener('touchcancel',function(){if(g&&!g.settling)cancel()},{capture:true,passive:true});
  // A sideways swipe is not a tap on whatever was under the finger.
  document.addEventListener('click',function(e){if(Date.now()-swipedAt<400&&e.target.closest&&e.target.closest('#content')){e.preventDefault();e.stopPropagation()}},true);
})();
