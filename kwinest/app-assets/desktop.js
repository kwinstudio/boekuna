// Desktop band (Kwin 2026-10-28, keuze A): the green band ends halfway the page's first row of numbers, so those blocks
// sit half on the colour like the phone's widgets. Pages without numbers end the band just under their title.
(function(){
  const desk=window.matchMedia('(min-width:821px)');
  function measure(){
    const main=document.getElementById('appMain'),content=document.getElementById('content');
    if(!main||!content)return;
    if(!desk.matches){main.style.removeProperty('--d-band-h');return}
    const top=main.getBoundingClientRect().top-main.scrollTop;
    const head=content.querySelector('.page-head'),actions=content.querySelector('.product-page-actions');
    const headBottom=Math.max(head?.getBoundingClientRect().bottom||0,actions?.getBoundingClientRect().bottom||0);
    // Only the numbers right under the title count; a block of numbers further down the page keeps the band short.
    const kpis=[...content.querySelectorAll('.dashboard-kpis,.product-kpis')].find(k=>k.offsetHeight&&!k.closest('.card'));
    const kr=kpis?.getBoundingClientRect();
    let h;
    if(kr&&(!headBottom||kr.top<headBottom+80)){h=kr.top-top+Math.min(kr.height/2,90)}
    else if(headBottom){
      // No numbers: the band stops just under the title, before whatever comes next.
      const next=[...content.children,...(head?.parentElement&&head.parentElement!==content?head.parentElement.children:[]),...content.querySelectorAll(':scope>.product-page-shell>*')].map(el=>el.getBoundingClientRect()).filter(r=>r.height&&r.top>=headBottom-1).reduce((m,r)=>Math.min(m,r.top),Infinity);
      h=Math.max(headBottom+12,Math.min(headBottom+28,next-14))-top}
    else h=150;
    main.style.setProperty('--d-band-h',Math.round(h)+'px');
  }
  let raf=0;const later=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(measure)};
  function start(){
    const content=document.getElementById('content');if(!content)return;
    new MutationObserver(later).observe(content,{childList:true});
    if(window.ResizeObserver)new ResizeObserver(later).observe(content);
    desk.addEventListener?.('change',later);addEventListener('resize',later);later();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
