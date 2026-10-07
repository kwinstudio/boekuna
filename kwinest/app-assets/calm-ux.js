/* BOEKUNA calm UX — keeps the page behind an open window still, and limits zoom to content that needs it. */
(function(){
  'use strict';
  var root=document.documentElement;
  var lockedScrollY=null;
  // Invoices, documents and reports keep pinch-zoom; the rest of the app behaves like a native app.
  var ZOOMABLE='.invoice-preview,.invoice-paper,.report-preview-viewport,.review-preview-shell,.document-preview-image,.document-preview-frame,.document-review-preview-image,.document-review-preview-frame';
  var viewportMeta=document.querySelector('meta[name="viewport"]');
  var baseViewport=viewportMeta?viewportMeta.getAttribute('content'):'';
  var zoomAllowed=null;

  function modalOpen(){return !!document.querySelector('#modalRoot .modal-backdrop')}

  function lockScroll(){
    if(lockedScrollY!==null)return;
    lockedScrollY=window.scrollY||0;
    root.classList.add('modal-scroll-locked');
    document.body.style.top=(-lockedScrollY)+'px';
  }
  function unlockScroll(){
    if(lockedScrollY===null)return;
    var y=lockedScrollY;lockedScrollY=null;
    root.classList.remove('modal-scroll-locked');
    document.body.style.top='';
    window.scrollTo({top:y,left:0,behavior:'instant'});
  }

  function setZoomAllowed(allowed){
    if(!viewportMeta||allowed===zoomAllowed)return;
    zoomAllowed=allowed;
    viewportMeta.setAttribute('content',allowed?baseViewport:baseViewport+', maximum-scale=1, user-scalable=no');
    root.classList.toggle('app-zoom-allowed',allowed);
  }
  function zoomableOnScreen(){return !!document.querySelector('#modalRoot '+ZOOMABLE.split(',').join(',#modalRoot '))}

  function sync(){
    if(modalOpen())lockScroll();else unlockScroll();
    setZoomAllowed(zoomableOnScreen());
  }

  function install(){
    var modalRoot=document.getElementById('modalRoot');
    if(modalRoot)new MutationObserver(sync).observe(modalRoot,{childList:true,subtree:true});
    // iOS Safari ignores user-scalable=no, so pinch gestures are stopped here outside zoomable content.
    document.addEventListener('gesturestart',function(event){
      if(zoomAllowed)return;
      if(event.target&&event.target.closest&&event.target.closest(ZOOMABLE))return;
      event.preventDefault();
    },{passive:false});
    sync();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
