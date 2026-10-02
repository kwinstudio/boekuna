function initBoekunaHomepage(){
  const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const demoData={
    upload:{
      kicker:'Stap 01 · Upload',
      title:'Begin met het document dat je al hebt.',
      text:'Upload een ondersteunde PDF, scan of bonfoto. Het originele bewijsstuk blijft onderdeel van de administratie.'
    },
    recognize:{
      kicker:'Stap 02 · Herkennen',
      title:'Boekuna zet belangrijke gegevens voor je klaar.',
      text:'De scanner probeert onder meer leverancier, datum, bedragen en btw te herkennen zodat jij gerichter kunt controleren.'
    },
    check:{
      kicker:'Stap 03 · Controleren',
      title:'Jij houdt het laatste woord.',
      text:'Controleer de voorgestelde gegevens en waarschuwingen. Onzekerheden blijven zichtbaar totdat jij ze bevestigt.'
    },
    save:{
      kicker:'Stap 04 · Opslaan',
      title:'Pas na jouw akkoord wordt de administratie bijgewerkt.',
      text:'De boeking blijft verbonden met het originele document en kan daarna terugkomen in btw, kosten en rapportages.'
    }
  };

  const controls=[...document.querySelectorAll('[data-demo-step]')];
  const stage=document.getElementById('boekunaDemoStage');
  const kicker=document.getElementById('demoKicker');
  const title=document.getElementById('demoTitle');
  const text=document.getElementById('demoText');

  function setDemoStep(key){
    const data=demoData[key];
    if(!data||!stage)return;
    controls.forEach(control=>{
      const active=control.dataset.demoStep===key;
      control.classList.toggle('is-active',active);
      control.setAttribute('aria-pressed',String(active));
    });
    stage.dataset.demoState=key;
    stage.classList.add('is-changing');
    if(kicker)kicker.textContent=data.kicker;
    if(title)title.textContent=data.title;
    if(text)text.textContent=data.text;
    if(reduced)stage.classList.remove('is-changing');
    else requestAnimationFrame(()=>stage.classList.remove('is-changing'));
  }

  controls.forEach(control=>control.addEventListener('click',()=>setDemoStep(control.dataset.demoStep)));
  setDemoStep('upload');

  const revealTargets=[...document.querySelectorAll('.parity-home > section,.parity-story')];
  if(reduced||!('IntersectionObserver' in window)){
    revealTargets.forEach(target=>target.classList.add('parity-in'));
  }else{
    revealTargets.forEach(target=>target.classList.add('parity-reveal'));
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(!entry.isIntersecting)return;
        entry.target.classList.add('parity-in');
        observer.unobserve(entry.target);
      });
    },{threshold:.08,rootMargin:'0px 0px -40px 0px'});
    revealTargets.forEach(target=>observer.observe(target));
  }
}

document.addEventListener('DOMContentLoaded',initBoekunaHomepage);
