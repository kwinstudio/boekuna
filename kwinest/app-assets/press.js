/* BOEKUNA press — a tap feels like a press: the button sinks a little while your finger is on it (press.css),
   springs back when you let go, and on a phone you feel a light tick (iPhone app, iOS Safari 17.4+, Android). */
(function(){
  'use strict';
  var root=document.documentElement;
  // Automated browsers (tests, screenshots) get the still app, like motion.js.
  var forced=/[?&]motion=1\b/.test(location.search);
  var testRun=false;
  try{testRun=typeof TEST_MODE_NO_AUTH!=='undefined'&&TEST_MODE_NO_AUTH===true}catch(e){}
  if((navigator.webdriver||testRun)&&!forced)return;
  root.classList.add('boekuna-press');

  var PRESSABLE='button,[role="button"],a.btn,label.btn,.btn,.nav-item,.mobile-bottom-nav-item,.mobile-card-main,.mobile-card-row,.r1d-recent-row,.settings-center-row,.action-row,.quick-action,.dashboard-attention-item';
  // These already shrink on :active in look.css; a second shrink would be too much.
  var OWN_PRESS='.r1d-custom-btn,.r1d-wtoggle,.r1d-swatch,.settings-band-option,.r1d-sfeer-btn,.settings-sfeer-option';
  var MIN_DOWN=60; // a quick tap still shows the press
  var pressed=null,since=0,touch=false;

  function pressable(node){
    var el=node&&node.closest?node.closest(PRESSABLE):null;
    if(!el||el.disabled||el.getAttribute('aria-disabled')==='true'||el.matches(OWN_PRESS))return null;
    return el.closest('#mainApp,#modalRoot')?el:null;
  }
  function release(){
    if(!pressed)return;
    var el=pressed;pressed=null;
    setTimeout(function(){
      el.classList.remove('is-pressed');el.classList.add('is-released');
      setTimeout(function(){el.classList.remove('is-released')},240);
    },Math.max(0,MIN_DOWN-(Date.now()-since)));
  }
  document.addEventListener('pointerdown',function(e){
    touch=e.pointerType==='touch'||e.pointerType==='pen';
    if(e.button>0)return;
    var el=pressable(e.target);if(!el)return;
    release();
    el.classList.remove('is-released');el.classList.add('is-pressed');pressed=el;since=Date.now();
  },{capture:true,passive:true});
  // pointercancel also fires when a touch turns into a scroll, so scrolling a list never leaves a row pressed.
  ['pointerup','pointercancel','dragstart'].forEach(function(type){document.addEventListener(type,release,{capture:true,passive:true})});

  var nativeHaptic=null;
  try{nativeHaptic=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.boekunaHaptic||null}catch(e){}
  var ios=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  var hapticSwitch=null;
  function tick(){
    if(nativeHaptic){try{nativeHaptic.postMessage('tap')}catch(e){}return}
    if(typeof navigator.vibrate==='function'){try{navigator.vibrate(8)}catch(e){}return}
    if(!ios)return;
    // iOS Safari has no vibrate, but toggling a switch gives a light tick; a hidden one does that for us.
    if(!hapticSwitch){
      hapticSwitch=document.createElement('label');
      hapticSwitch.setAttribute('aria-hidden','true');
      hapticSwitch.style.cssText='position:fixed;left:-200px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
      var input=document.createElement('input');
      input.type='checkbox';input.setAttribute('switch','');input.tabIndex=-1;
      hapticSwitch.appendChild(input);document.body.appendChild(hapticSwitch);
    }
    try{hapticSwitch.click()}catch(e){}
  }
  // Only a real tap with a finger ticks: not a mouse click, not a scroll that started on a button.
  document.addEventListener('click',function(e){if(touch&&e.isTrusted&&pressable(e.target))tick()},true);
})();
