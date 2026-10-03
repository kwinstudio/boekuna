function initBoekunaHomepage(){
  const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root=document.documentElement;
  const clamp=(value,min=0,max=1)=>Math.min(max,Math.max(min,value));

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

  const stories=[...document.querySelectorAll('[data-scroll-story]')];
  const storyStage=document.querySelector('.parity-product-stories');
  const storyProgress=document.querySelector('[data-motion-story-progress]');
  const storyJumpers=[...document.querySelectorAll('[data-story-jump]')];
  const focusSections=[...document.querySelectorAll('[data-motion-focus]')];
  const motionFlow=document.querySelector('[data-motion-flow]');
  const flowSteps=motionFlow?[...motionFlow.querySelectorAll('[data-motion-flow-step]')]:[];
  const finalCta=document.querySelector('[data-motion-final]');
  const motionRail=document.querySelector('[data-motion-rail]');
  const motionRailTrack=document.querySelector('[data-motion-rail-track]');

  function setActiveStory(index){
    if(!storyProgress||index<0||index>=stories.length)return;
    storyProgress.dataset.activeStory=String(index);
    storyJumpers.forEach((button,buttonIndex)=>{
      button.classList.toggle('is-active',buttonIndex===index);
      if(buttonIndex===index)button.setAttribute('aria-current','true');
      else button.removeAttribute('aria-current');
    });
    stories.forEach((story,storyIndex)=>{
      const active=storyIndex===index;
      story.classList.toggle('is-story-active',active);
      story.dataset.storyState=active?'active':'idle';
    });
  }

  storyJumpers.forEach(button=>button.addEventListener('click',()=>{
    const index=Number.parseInt(button.dataset.storyJump||'-1',10);
    const target=stories[index];
    if(!target)return;
    target.scrollIntoView({behavior:reduced?'auto':'smooth',block:'center'});
  }));

  let railDragging=false;
  let railStartX=0;
  let railDragX=0;
  if(motionRail&&motionRailTrack){
    motionRail.style.setProperty('--rail-shift','0px');
    if(reduced){
      motionRail.dataset.dragEnabled='false';
    }else{
      motionRail.dataset.dragEnabled='true';
      motionRail.addEventListener('pointerdown',event=>{
        if(event.pointerType==='touch')return;
        railDragging=true;
        railStartX=event.clientX;
        railDragX=0;
        motionRail.classList.add('is-dragging');
        motionRail.setPointerCapture?.(event.pointerId);
      });
      motionRail.addEventListener('pointermove',event=>{
        if(!railDragging)return;
        railDragX=clamp(event.clientX-railStartX,-64,64);
        motionRail.style.setProperty('--rail-shift',railDragX.toFixed(2)+'px');
      });
      const releaseRail=event=>{
        if(!railDragging)return;
        railDragging=false;
        motionRail.classList.remove('is-dragging');
        try{motionRail.releasePointerCapture?.(event.pointerId);}catch(_error){}
        railDragX=0;
        motionRail.style.setProperty('--rail-shift','0px');
      };
      motionRail.addEventListener('pointerup',releaseRail);
      motionRail.addEventListener('pointercancel',releaseRail);
      motionRail.addEventListener('pointerleave',event=>{if(event.buttons===0)releaseRail(event);});
    }
  }

  let scrollFrame=0;
  function syncScrollInteraction(){
    scrollFrame=0;
    const scrollable=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);
    const pageProgress=clamp(window.scrollY/scrollable);
    root.style.setProperty('--scroll-progress',pageProgress.toFixed(4));

    if(motionRail&&!railDragging&&!reduced){
      const rect=motionRail.getBoundingClientRect();
      const local=clamp((window.innerHeight-rect.top)/(window.innerHeight+rect.height));
      motionRail.style.setProperty('--rail-shift',((local-.5)*22).toFixed(2)+'px');
    }

    const viewportCenter=window.innerHeight/2;
    let closestIndex=-1;
    let closestDistance=Number.POSITIVE_INFINITY;
    stories.forEach((story,index)=>{
      const rect=story.getBoundingClientRect();
      const center=rect.top+rect.height/2;
      const distance=Math.abs(center-viewportCenter);
      if(rect.bottom>0&&rect.top<window.innerHeight&&distance<closestDistance){
        closestDistance=distance;
        closestIndex=index;
      }
      if(reduced){
        story.style.setProperty('--story-shift','0px');
        story.style.setProperty('--story-scale','1');
        return;
      }
      if(rect.bottom<0||rect.top>window.innerHeight)return;
      const normalized=(center-viewportCenter)/Math.max(window.innerHeight,1);
      const shift=clamp(normalized*-18,-14,14);
      const scale=1-Math.min(.012,Math.abs(normalized)*.009);
      story.style.setProperty('--story-shift',shift.toFixed(2)+'px');
      story.style.setProperty('--story-scale',scale.toFixed(4));
    });
    if(closestIndex>=0)setActiveStory(closestIndex);

    if(storyStage&&storyProgress){
      const rect=storyStage.getBoundingClientRect();
      const denominator=Math.max(1,rect.height-window.innerHeight*.2);
      const local=clamp((window.innerHeight*.6-rect.top)/denominator);
      storyProgress.style.setProperty('--story-progress',local.toFixed(4));
    }

    focusSections.forEach(section=>{
      const rect=section.getBoundingClientRect();
      const local=clamp((window.innerHeight*.86-rect.top)/(window.innerHeight+rect.height*.4));
      section.style.setProperty('--focus-progress',reduced?'.5':local.toFixed(4));
      const focusOffset=reduced?0:(.5-local)*28;
      section.style.setProperty('--focus-copy-y',focusOffset.toFixed(2)+'px');
      section.style.setProperty('--focus-visual-y',(focusOffset*-1.25).toFixed(2)+'px');
      section.classList.toggle('is-focus-active',rect.top<window.innerHeight*.72&&rect.bottom>window.innerHeight*.28);
    });

    if(motionFlow){
      const rect=motionFlow.getBoundingClientRect();
      const local=clamp((window.innerHeight*.82-rect.top)/(window.innerHeight+rect.height*.28));
      motionFlow.style.setProperty('--flow-progress',local.toFixed(4));
      flowSteps.forEach((step,index)=>{
        const threshold=index/Math.max(1,flowSteps.length);
        const active=reduced||local>=threshold+.06;
        step.classList.toggle('is-flow-active',active);
      });
    }

    if(finalCta&&!reduced){
      const rect=finalCta.getBoundingClientRect();
      const local=clamp((window.innerHeight-rect.top)/(window.innerHeight+rect.height));
      finalCta.style.setProperty('--final-progress',local.toFixed(4));
      finalCta.style.setProperty('--final-scale',(.28+local*.92).toFixed(4));
    }
  }
  function queueScrollInteraction(){
    if(scrollFrame)return;
    scrollFrame=requestAnimationFrame(syncScrollInteraction);
  }
  window.addEventListener('scroll',queueScrollInteraction,{passive:true});
  window.addEventListener('resize',queueScrollInteraction,{passive:true});

  const parallaxRoot=document.querySelector('[data-parallax-root]');
  if(parallaxRoot){
    parallaxRoot.style.setProperty('--hero-x','0px');
    parallaxRoot.style.setProperty('--hero-y','0px');
    if(!reduced){
      parallaxRoot.addEventListener('pointermove',event=>{
        if(event.pointerType&&event.pointerType!=='mouse'&&event.pointerType!=='pen')return;
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

  if(finalCta){
    finalCta.style.setProperty('--final-x','50%');
    finalCta.style.setProperty('--final-y','50%');
    if(reduced){
      finalCta.dataset.motionState='static';
      finalCta.classList.add('is-final-active');
    }else{
      finalCta.addEventListener('pointermove',event=>{
        if(event.pointerType&&event.pointerType!=='mouse'&&event.pointerType!=='pen')return;
        const rect=finalCta.getBoundingClientRect();
        finalCta.style.setProperty('--final-x',clamp((event.clientX-rect.left)/rect.width)*100+'%');
        finalCta.style.setProperty('--final-y',clamp((event.clientY-rect.top)/rect.height)*100+'%');
      });
    }
  }

  if('IntersectionObserver' in window){
    const finalObserver=finalCta&&!reduced?new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(!entry.isIntersecting)return;
        finalCta.classList.add('is-final-active');
        finalCta.dataset.motionState='active';
      });
    },{threshold:.25}):null;
    if(finalObserver&&finalCta)finalObserver.observe(finalCta);
  }else if(finalCta){
    finalCta.classList.add('is-final-active');
    finalCta.dataset.motionState=reduced?'static':'active';
  }

  const controls=[...document.querySelectorAll('[data-demo-step]')];
  const stage=document.getElementById('boekunaDemoStage');
  const demoSection=document.querySelector('[data-motion-demo]');
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
    if(demoSection)demoSection.dataset.motionState=key;
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
    ...document.querySelectorAll('.parity-plan-grid article'),
    ...focusSections.flatMap(section=>[...section.querySelectorAll('.parity-focus-copy>*')])
  ];
  staggerTargets.forEach((target,index)=>{
    target.classList.add('interaction-stagger');
    target.style.setProperty('--stagger-index',String(index%5));
    target.style.setProperty('--stagger-delay',(70+(index%5)*62)+'ms');
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

  if(reduced){
    if(storyProgress){
      storyProgress.style.setProperty('--story-progress','1');
      setActiveStory(0);
    }
    if(motionFlow){
      motionFlow.style.setProperty('--flow-progress','1');
      flowSteps.forEach(step=>step.classList.add('is-flow-active'));
    }
  }

  splitKineticTitle();
  initIntro();
  syncScrollInteraction();
}

document.addEventListener('DOMContentLoaded',initBoekunaHomepage);
