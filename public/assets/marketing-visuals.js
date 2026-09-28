(()=>{
  const reduce=()=>!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const initStepper=root=>{
    root.querySelectorAll('[data-bv-stepper]').forEach(stepper=>{
      if(stepper.dataset.bvReady==='1')return;
      stepper.dataset.bvReady='1';
      const buttons=[...stepper.querySelectorAll('[data-bv-step]')];
      const title=stepper.querySelector('[data-bv-step-title]');
      const copy=stepper.querySelector('[data-bv-step-copy]');
      const data={
        1:['Aanleveren','Een document, PDF of bonfoto komt binnen als bron.'],
        2:['Herkennen','Relevante gegevens worden voorbereid om te kunnen controleren.'],
        3:['Controleren','Jij bekijkt en corrigeert voordat iets definitief wordt verwerkt.'],
        4:['Klaar','Het bewijsstuk en de gecontroleerde administratie blijven bij elkaar.']
      };
      const set=n=>{
        const row=data[n]||data[1];
        stepper.dataset.step=String(n);
        buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.bvStep===String(n))));
        if(title)title.textContent=row[0];
        if(copy)copy.textContent=row[1];
      };
      buttons.forEach(b=>b.addEventListener('click',()=>set(Number(b.dataset.bvStep))));
      set(Number(stepper.dataset.step||1));
    });
  };
  const initReveal=root=>{
    const nodes=[...root.querySelectorAll('.bv[data-bv-reveal]:not([data-bv-reveal-ready])')];
    nodes.forEach(n=>n.setAttribute('data-bv-reveal-ready','1'));
    if(reduce()||!('IntersectionObserver'in window)){nodes.forEach(n=>n.classList.add('is-visible'));return}
    const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-visible');io.unobserve(e.target)}}),{threshold:.12,rootMargin:'0px 0px -32px 0px'});
    nodes.forEach(n=>io.observe(n));
  };
  function init(root=document){initStepper(root);initReveal(root)}
  window.initBookunaAbstractVisuals=init;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init(document),{once:true});else init(document);
  let pending=false;
  new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;init(document)})}).observe(document.documentElement,{childList:true,subtree:true});
})();