/* BOEKUNA thema — Automatisch / Licht / Donker.
   App-only layer. The early boot snippet in <head> (scripts/build-app.mjs) already set
   html[data-theme] from this device's last choice before the first paint; this file keeps it
   in sync with the account preference (state.meta.theme) and with the device setting. */
(function(){
  'use strict';
  var KEY='boekuna-theme';
  var CHOICES=['system','light','dark'];
  var THEME_COLOR={light:'#FFFFFF',dark:'#15191C'};
  var media=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;

  function valid(value){return CHOICES.indexOf(value)>=0?value:'system'}
  function readLocal(){try{return valid(localStorage.getItem(KEY))}catch(e){return 'system'}}
  function writeLocal(value){try{localStorage.setItem(KEY,value)}catch(e){}}
  function systemDark(){return !!(media&&media.matches)}
  function resolve(pref){return pref==='dark'||(pref==='system'&&systemDark())?'dark':'light'}

  function apply(pref){
    pref=valid(pref);
    var root=document.documentElement,resolved=resolve(pref);
    root.dataset.themePref=pref;
    if(root.dataset.theme!==resolved){
      root.dataset.theme=resolved;
      document.dispatchEvent(new CustomEvent('boekuna:themechange',{detail:{preference:pref,theme:resolved}}));
    }
    root.style.colorScheme=resolved;
    var meta=document.querySelector('meta[name="theme-color"]');
    // While the Boekuna intro is up it owns the bar colour; it hands back the theme colour when it leaves.
    if(meta&&!(window.BoekunaIntro&&window.BoekunaIntro.tinted))meta.setAttribute('content',THEME_COLOR[resolved]);
    return resolved;
  }

  function preference(){return valid(document.documentElement.dataset.themePref||readLocal())}

  // The account preference wins once the administration is loaded, so a choice made on one
  // device follows the user to the next. Until then this device's last choice is used.
  function accountPreference(){
    try{var t=typeof state!=='undefined'&&state&&state.meta?state.meta.theme:null;return CHOICES.indexOf(t)>=0?t:null}catch(e){return null}
  }
  function syncFromAccount(){
    var fromAccount=accountPreference();
    if(!fromAccount||fromAccount===preference())return;
    writeLocal(fromAccount);apply(fromAccount);
  }

  function setPreference(value){
    value=valid(value);
    writeLocal(value);apply(value);
    try{
      if(typeof state!=='undefined'&&state&&typeof currentUser!=='undefined'&&currentUser){
        if(!state.meta||typeof state.meta!=='object')state.meta={};
        if(state.meta.theme!==value){state.meta.theme=value;if(typeof save==='function')save()}
      }
    }catch(e){}
    return value;
  }

  // Automatisch follows the device at runtime (e.g. iPhone switching to Dark in the evening).
  function onSystemChange(){if(preference()==='system')apply('system')}
  if(media){
    if(typeof media.addEventListener==='function')media.addEventListener('change',onSystemChange);
    else if(typeof media.addListener==='function')media.addListener(onSystemChange);
  }
  // Another tab changed the choice.
  window.addEventListener('storage',function(event){if(event.key===KEY)apply(readLocal())});
  // A PWA coming back from the background may have missed a system change.
  document.addEventListener('visibilitychange',function(){if(!document.hidden)apply(preference())});

  apply(preference());

  function install(){
    if(typeof render!=='function')return;
    var originalRender=render;
    render=function(){syncFromAccount();return originalRender.apply(this,arguments)};
    syncFromAccount();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();

  window.BoekunaTheme=Object.freeze({
    choices:CHOICES.slice(),
    preference:preference,
    resolved:function(){return document.documentElement.dataset.theme==='dark'?'dark':'light'},
    set:setPreference,
    syncFromAccount:syncFromAccount
  });
})();
