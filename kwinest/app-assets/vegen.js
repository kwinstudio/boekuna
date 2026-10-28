/* BOEKUNA vegen — swipe left and right between the phone tabs (Kwin 2026-10-28: "dat we de schermen kan swipen").
   Overzicht, Inkomsten, Kosten and Bonnen sit side by side like the tab bar: swipe left for the next one, right for the
   one before. The screen follows your finger and the next one slides in from that side (motion.js). Gestures that were
   there first keep winning: a list row that has an action that way (Betaald, Meer, Weghalen in handig.js), a row of
   chips that scrolls sideways, a sheet, the menu, and the screen edges, where the iPhone swipes back. */
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
  var EDGE=24,DECIDE=10,COMMIT=72,FLICK=0.45;
  function currentPage(){try{return typeof page==='string'?page:null}catch(e){return null}}
  function tabs(){return Array.prototype.map.call(document.querySelectorAll('#mobileBottomNav [data-mobile-page]'),function(el){return el.getAttribute('data-mobile-page')})}
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

  var g=null;
  function setShift(content,dx,animate){
    content.style.transition=animate?'transform .2s cubic-bezier(.2,.8,.2,1),opacity .2s ease':'none';
    content.style.transform=dx?'translate3d('+dx+'px,0,0)':'';
    var w=window.innerWidth||390;
    content.style.opacity=dx?String(Math.max(.55,1-Math.abs(dx)/w*.9)):'';
  }
  function clearShift(content){content.style.transition='';content.style.transform='';content.style.opacity='';content.classList.remove('bk-paging')}

  document.addEventListener('touchstart',function(e){
    g=null;
    if(e.touches.length!==1)return;
    var content=document.getElementById('content'),t=e.touches[0];if(!content)return;
    var w=window.innerWidth||390;
    if(t.clientX<EDGE||t.clientX>w-EDGE)return; // the iPhone's own swipe back and forward
    if(blocked(e.target,content))return;
    var order=tabs(),now=currentPage(),at=order.indexOf(now);
    if(at<0)return; // only on the four tab screens themselves, not on pages opened from the menu
    g={content:content,target:e.target,x:t.clientX,y:t.clientY,t:Date.now(),dx:0,axis:null,order:order,at:at,lastX:t.clientX,lastT:Date.now(),v:0};
  },{capture:true,passive:true});

  document.addEventListener('touchmove',function(e){
    if(!g||e.touches.length!==1){if(g&&g.axis==='x')clearShift(g.content);g=null;return}
    var t=e.touches[0],mx=t.clientX-g.x,my=t.clientY-g.y;
    if(!g.axis){
      if(Math.abs(mx)+Math.abs(my)<DECIDE)return;
      if(Math.abs(mx)<=Math.abs(my)*1.4){g=null;return}
      // A list row that already started its own swipe (handig.js) keeps the finger.
      var row=g.target.closest('.mobile-card-row');
      if(row&&row.classList.contains('bk-swiping')){g=null;return}
      if(sideScroller(g.target,g.content)){g=null;return}
      g.axis='x';g.content.classList.add('bk-paging');
    }
    if(e.cancelable)e.preventDefault(); // no vertical drift while you swipe sideways
    var next=g.at+(mx<0?1:-1),has=next>=0&&next<g.order.length;
    var dx=has?mx*.6:mx*.18;
    g.dx=mx;g.has=has;
    var now=Date.now();if(now>g.lastT){g.v=(t.clientX-g.lastX)/(now-g.lastT);g.lastX=t.clientX;g.lastT=now}
    setShift(g.content,dx,false);
  },{capture:true,passive:false});

  var swipedAt=0;
  function end(){
    var s=g;g=null;
    if(!s||s.axis!=='x')return;
    swipedAt=Date.now();
    var dir=s.dx<0?1:-1,target=s.order[s.at+dir];
    var flick=Math.abs(s.v)>FLICK&&Math.abs(s.dx)>30&&(s.v<0)===(s.dx<0);
    if(!target||!s.has||(Math.abs(s.dx)<COMMIT&&!flick)){setShift(s.content,0,true);setTimeout(function(){if(!g)clearShift(s.content)},220);return}
    tick();
    var go=function(){clearShift(s.content);if(typeof window.navigate==='function')window.navigate(target)};
    if(reduced.matches)return go();
    var w=window.innerWidth||390;
    s.content.style.transition='transform .12s ease-in,opacity .12s ease-in';
    s.content.style.transform='translate3d('+(-dir*w*.28)+'px,0,0)';s.content.style.opacity='.2';
    setTimeout(go,110);
  }
  document.addEventListener('touchend',end,{capture:true,passive:true});
  document.addEventListener('touchcancel',function(){if(g&&g.axis==='x')setShift(g.content,0,true);var s=g;g=null;if(s)setTimeout(function(){clearShift(s.content)},220)},{capture:true,passive:true});
  // A sideways swipe is not a tap on whatever was under the finger.
  document.addEventListener('click',function(e){if(Date.now()-swipedAt<400&&e.target.closest&&e.target.closest('#content')){e.preventDefault();e.stopPropagation()}},true);
})();
