// BOEKUNA intro (boot-intro.css): runs inline right after the intro markup, before any app script.
// The app calls BoekunaIntro.finish() the moment it has a screen to show (setBootstrapVisible(false));
// there is no minimum time. After 2.5 s the intro turns into a quiet loading state until then.
(function(){
  var el=document.getElementById('appBootstrap');if(!el)return;
  var LIMIT=2500,SLOW=10000,FADE=320,t0=performance.now();
  var forced=/[?&]intro=1(?:&|$)/.test(location.search);
  var reduce=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Automated browsers see a still screen that disappears instantly, so tests stay exact.
  var still=!forced&&!!navigator.webdriver;
  var repeat=false;
  try{repeat=sessionStorage.getItem('boekuna-intro-seen')==='1';sessionStorage.setItem('boekuna-intro-seen','1')}catch(e){}
  el.classList.add(still?'is-still':repeat?'is-repeat':'is-playing');
  var waitTimer=0,slowTimer=0,leaveTimer=0;
  // The browser bar / iPhone status strip takes the intro colour while it is up (theme.js leaves it
  // alone meanwhile), then gets the app colour of the current theme back.
  var meta=document.querySelector('meta[name="theme-color"]');
  function dark(){return document.documentElement.dataset.theme==='dark'}
  function tint(){if(meta&&!still){api.tinted=true;meta.setAttribute('content',dark()?'#15191C':'#F6F7F8')}}
  function untint(){if(meta&&api.tinted){api.tinted=false;meta.setAttribute('content',dark()?'#15191C':'#FFFFFF')}}
  function arm(){
    clearTimeout(waitTimer);clearTimeout(slowTimer);
    var at=performance.now()-t0;
    waitTimer=setTimeout(function(){el.classList.add('is-waiting')},Math.max(0,LIMIT-at));
    slowTimer=setTimeout(function(){el.classList.add('is-slow')},Math.max(0,SLOW-at));
  }
  function reset(){el.classList.remove('is-leaving','is-waiting','is-slow')}
  function gone(){el.hidden=true;reset();untint();api.hiddenMs=Math.round(performance.now()-t0)}
  function finish(){
    if(el.hidden||el.classList.contains('is-leaving'))return;
    clearTimeout(waitTimer);clearTimeout(slowTimer);
    var shown=performance.now()-t0;
    api.readyMs=Math.round(shown);
    if(still||reduce){gone();return}
    // Never let the fade carry the intro past 2.5 s.
    var fade=shown<LIMIT?Math.min(FADE,LIMIT-shown-20):240;
    if(fade<40){gone();return}
    el.style.setProperty('--boot-fade',fade+'ms');
    el.classList.add('is-leaving');
    leaveTimer=setTimeout(gone,fade);
  }
  function show(){
    // Already up (the normal start): keep the clock running from the first frame.
    if(!el.hidden&&!el.classList.contains('is-leaving'))return;
    clearTimeout(leaveTimer);reset();el.hidden=false;tint();t0=api.startedAt=performance.now();arm();
  }
  var api={finish:finish,show:show,startedAt:t0,readyMs:null,hiddenMs:null,tinted:false,mode:still?'still':repeat?'repeat':'playing'};
  window.BoekunaIntro=api;
  tint();arm();
})();
