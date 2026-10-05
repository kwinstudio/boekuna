(() => {
  'use strict';
  const root=document.querySelector('.premium-home');
  if(!root)return;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const story=root.querySelector('.story');
  const scenes=[...story.querySelectorAll('.story-scene')];
  const choices=[...story.querySelectorAll('[data-story]')];
  const pause=story.querySelector('#story-pause');
  let selected=0,paused=motion.matches,timer=null,inView=true,hovered=false;
  story.querySelector('.story-controls').hidden=false;
  function schedule(){
    clearTimeout(timer);
    timer=null;
    if(paused||motion.matches||document.hidden||!inView||hovered||story.contains(document.activeElement))return;
    timer=setTimeout(()=>{show((selected+1)%scenes.length);schedule();},6000);
  }
  function show(index){
    selected=index;
    scenes.forEach((scene,i)=>{scene.hidden=i!==index;});
    choices.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
  }
  function label(){
    const stopped=paused||motion.matches;
    pause.disabled=motion.matches;
    pause.textContent=stopped?'Afspelen':'Pauzeren';
    pause.setAttribute('aria-label',motion.matches?'Automatisch afspelen uitgeschakeld bij verminderde beweging':stopped?'Productverhalen afspelen':'Productverhalen pauzeren');
  }
  function stop(){paused=true;label();schedule();}
  choices.forEach(button=>button.addEventListener('click',()=>{show(Number(button.dataset.story));stop();}));
  pause.addEventListener('click',()=>{if(motion.matches)return;paused=!paused;label();schedule();});
  story.addEventListener('mouseenter',()=>{hovered=true;schedule();});
  story.addEventListener('mouseleave',()=>{hovered=false;schedule();});
  story.addEventListener('touchstart',stop,{passive:true});
  story.addEventListener('focusin',schedule);
  story.addEventListener('focusout',()=>queueMicrotask(schedule));
  document.addEventListener('visibilitychange',schedule);
  motion.addEventListener('change',()=>{if(motion.matches)paused=true;label();schedule();});
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;schedule();},{threshold:.15}).observe(story);
  let startX=null;
  const stage=story.querySelector('.story-stage');
  stage.addEventListener('touchstart',event=>{startX=event.touches[0].clientX;},{passive:true});
  stage.addEventListener('touchend',event=>{if(startX===null)return;const delta=event.changedTouches[0].clientX-startX;if(Math.abs(delta)>45){show((selected+(delta<0?1:scenes.length-1))%scenes.length);stop();}startX=null;},{passive:true});
  label();schedule();

  const images=[['documenten','Documenten toevoegen in de echte Boekuna-app','Begin met een foto of bestand. Ook meerdere tegelijk.'],['bon-controleren','Herkende bedragen controleren in de echte Boekuna-app','Boekuna leest de gegevens. Wat onzeker is, blijft zichtbaar.'],['documenten','Het documentenoverzicht in de echte Boekuna-app','Na jouw controle bewaar je de gegevens in je administratie.']];
  const steps=[...root.querySelectorAll('[data-workflow-step]')];
  const image=root.querySelector('#workflow-image');
  const caption=root.querySelector('#workflow-caption');
  function setStep(index){
    steps.forEach((step,i)=>step.querySelector('button').setAttribute('aria-pressed',String(i===index)));
    image.src='/assets/stories/'+images[index][0]+'.webp';
    image.alt=images[index][1];caption.textContent=images[index][2];
  }
  steps.forEach((step,index)=>step.querySelector('button').addEventListener('click',()=>setStep(index)));
  // Observe all steps together; no scroll interception or per-frame scroll work.
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>{
      if(innerWidth<701||motion.matches)return;
      const entry=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
      if(entry)setStep(Number(entry.target.dataset.workflowStep));
    },{rootMargin:'-20% 0px -35% 0px',threshold:[0,.25,.5]});
    steps.forEach(step=>observer.observe(step));
  }
})();
