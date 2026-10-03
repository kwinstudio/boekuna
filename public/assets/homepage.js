function initBoekunaHomepage(){
  const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer=window.matchMedia&&window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const root=document.documentElement;

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

  function splitKineticTitle(){
    const title=document.querySelector('[data-kinetic-title]');
    if(!title||title.dataset.kineticReady==='true')return;
    let wordIndex=0;
    [...title.childNodes].forEach(node=>{
      if(node.nodeType!==Node.TEXT_NODE)return;
      const fragment=document.createDocumentFragment();
      const parts=node.textContent.split(/(\s+)/);
      parts.forEach(part=>{
        if(!part)return;
        if(/^\s+$/.test(part)){fragment.appendChild(document.createTextNode(part));return;}
        const span=document.createElement('span');
        span.className='interaction-word';
        span.style.setProperty('--word-index',String(wordIndex));
        span.style.setProperty('--word-delay',(120+wordIndex*58)+'ms');
        wordIndex+=1;
        span.textContent=part;
        fragment.appendChild(span);
      });
      node.replaceWith(fragment);
    });
    title.dataset.kineticReady='true';
    requestAnimationFrame(()=>requestAnimationFrame(()=>title.classList.add('is-kinetic-ready')));
  }

  function initIntro(){
    const intro=document.querySelector('[data-interaction-intro]');
    if(!intro||reduced)return;
    let seen=false;
    try{seen=sessionStorage.getItem('boekunaInteractionIntro')==='1';}catch(_error){}
    if(seen)return;
    intro.hidden=false;
    intro.setAttribute('aria-hidden','false');
    document.body.classList.add('interaction-entering');
    requestAnimationFrame(()=>intro.classList.add('is-visible'));
    window.setTimeout(()=>{
      intro.classList.add('is-done');
      intro.setAttribute('aria-hidden','true');
      document.body.classList.remove('interaction-entering');
      try{sessionStorage.setItem('boekunaInteractionIntro','1');}catch(_error){}
    },560);
  }

  let scrollFrame=0;
  const stories=[...document.querySelectorAll('[data-scroll-story]')];
  function syncScrollInteraction(){
    scrollFrame=0;
    const scrollable=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);
    const progress=Math.min(1,Math.max(0,window.scrollY/scrollable));
    root.style.setProperty('--scroll-progress',progress.toFixed(4));
    if(reduced){
      stories.forEach(story=>{
        story.style.setProperty('--story-shift','0px');
        story.style.setProperty('--story-scale','1');
      });
      return;
    }
    const viewportCenter=window.innerHeight/2;
    stories.forEach(story=>{
      const rect=story.getBoundingClientRect();
      if(rect.bottom<0||rect.top>window.innerHeight)return;
      const center=rect.top+rect.height/2;
      const normalized=(center-viewportCenter)/Math.max(window.innerHeight,1);
      const shift=Math.max(-14,Math.min(14,normalized*-18));
      const scale=1-Math.min(.012,Math.abs(normalized)*.009);
      story.style.setProperty('--story-shift',shift.toFixed(2)+'px');
      story.style.setProperty('--story-scale',scale.toFixed(4));
    });
  }
  function queueScrollInteraction(){
    if(scrollFrame)return;
    scrollFrame=requestAnimationFrame(syncScrollInteraction);
  }
  window.addEventListener('scroll',queueScrollInteraction,{passive:true});
  window.addEventListener('resize',queueScrollInteraction,{passive:true});
  syncScrollInteraction();

  const parallaxRoot=document.querySelector('[data-parallax-root]');
  if(parallaxRoot){
    parallaxRoot.style.setProperty('--hero-x','0px');
    parallaxRoot.style.setProperty('--hero-y','0px');
    if(!reduced&&finePointer){
      parallaxRoot.addEventListener('pointermove',event=>{
        const rect=parallaxRoot.getBoundingClientRect();
        if(!rect.width||!rect.height)return;
        const x=((event.clientX-rect.left)/rect.width-.5)*2;
        const y=((event.clientY-rect.top)/rect.height-.5)*2;
        parallaxRoot.style.setProperty('--hero-x',(x*6).toFixed(2)+'px');
        parallaxRoot.style.setProperty('--hero-y',(y*6).toFixed(2)+'px');
      });
      parallaxRoot.addEventListener('pointerleave',()=>{
        parallaxRoot.style.setProperty('--hero-x','0px');
        parallaxRoot.style.setProperty('--hero-y','0px');
      });
    }
  }

  if('IntersectionObserver' in window){
    const storyObserver=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        const active=entry.isIntersecting&&entry.intersectionRatio>=.34;
        entry.target.classList.toggle('is-story-active',active);
        entry.target.dataset.storyState=active?'active':'idle';
      });
    },{threshold:[.18,.34,.58],rootMargin:'-8% 0px -8% 0px'});
    stories.forEach(story=>{
      story.dataset.storyState='idle';
      storyObserver.observe(story);
    });
  }else{
    stories.forEach(story=>{
      story.classList.add('is-story-active');
      story.dataset.storyState='active';
    });
  }

  const controls=[...document.querySelectorAll('[data-demo-step]')];
  const stage=document.getElementById('boekunaDemoStage');
  const kicker=document.getElementById('demoKicker');
  const title=document.getElementById('demoTitle');
  const text=document.getElementById('demoText');

  function setDemoStep(key,{focus=false}={}){
    const data=demoData[key];
    if(!data||!stage)return;
    let targetControl=null;
    controls.forEach(control=>{
      const active=control.dataset.demoStep===key;
      control.classList.toggle('is-active',active);
      control.setAttribute('aria-pressed',String(active));
      if(active)targetControl=control;
    });
    stage.dataset.demoState=key;
    stage.classList.add('is-changing');
    if(kicker)kicker.textContent=data.kicker;
    if(title)title.textContent=data.title;
    if(text)text.textContent=data.text;
    if(focus&&targetControl)targetControl.focus();
    if(reduced)stage.classList.remove('is-changing');
    else requestAnimationFrame(()=>stage.classList.remove('is-changing'));
  }

  controls.forEach((control,index)=>{
    control.addEventListener('click',()=>setDemoStep(control.dataset.demoStep));
    control.addEventListener('keydown',event=>{
      if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
      event.preventDefault();
      let next=index;
      if(event.key==='ArrowRight')next=(index+1)%controls.length;
      if(event.key==='ArrowLeft')next=(index-1+controls.length)%controls.length;
      if(event.key==='Home')next=0;
      if(event.key==='End')next=controls.length-1;
      setDemoStep(controls[next].dataset.demoStep,{focus:true});
    });
  });
  setDemoStep('upload');

  const staggerTargets=[
    ...document.querySelectorAll('.parity-principles article'),
    ...document.querySelectorAll('.parity-support-grid>a'),
    ...document.querySelectorAll('.parity-plan-grid article')
  ];
  staggerTargets.forEach((target,index)=>{
    target.classList.add('interaction-stagger');
    target.style.setProperty('--stagger-index',String(index%4));
    target.style.setProperty('--stagger-delay',(70+(index%4)*70)+'ms');
  });

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

  splitKineticTitle();
  initIntro();
}

document.addEventListener('DOMContentLoaded',initBoekunaHomepage);
