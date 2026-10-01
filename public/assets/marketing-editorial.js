/* Public marketing only. Existing product tabs, form handlers and destinations stay authoritative. */
document.addEventListener('DOMContentLoaded',()=>{
  if(!document.body.classList.contains('editorial-site'))return;
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine=window.matchMedia('(pointer:fine) and (min-width:769px)');
  const main=document.querySelector('main');
  if(main&&!main.id)main.id='marketingMain';
  const skip=document.createElement('a');
  skip.href='#'+main?.id;skip.className='editorial-skip';skip.textContent='Ga naar inhoud';
  if(main)document.body.prepend(skip);
  document.querySelectorAll('a[href]').forEach(link=>{
    if(link.getAttribute('href')===location.pathname)link.setAttribute('aria-current','page');
  });

  // Preserve original text nodes and spacing, including the authored second hero line.
  // Word wrappers never replace accessible text with duplicate labels or aria-hidden copy.
  function revealWords(heading){
    const walker=document.createTreeWalker(heading,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    let index=0;
    nodes.forEach(node=>{
      const fragment=document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach(part=>{
        if(!part)return;
        if(/^\s+$/.test(part)){fragment.append(document.createTextNode(part));return;}
        const mask=document.createElement('span');mask.className='editorial-word-mask';
        const word=document.createElement('span');word.className='editorial-word';word.textContent=part;
        word.style.setProperty('--word-delay',Math.min(index++*140,1120)+'ms');
        mask.append(word);fragment.append(mask);
      });
      node.replaceWith(fragment);
    });
  }
  if(!preference.matches){
    const heading=document.querySelector('h1');
    if(heading)revealWords(heading);
  }

  // A short decorative curtain, never a loading gate. Content and navigation are
  // already usable, user input dismisses it immediately, and storage errors fail open.
  let intro=null,cleanupTimer=0,readyTimer=0;
  const finishIntro=()=>{
    clearTimeout(cleanupTimer);clearTimeout(readyTimer);
    document.body.classList.add('ed-intro-ready');
    if(intro){intro.remove();intro=null;}
    window.removeEventListener('keydown',finishIntro);
    window.removeEventListener('pointerdown',finishIntro);
  };
  let firstVisit=false;
  try{
    firstVisit=!sessionStorage.getItem('boekuna:marketing-intro-v2');
    sessionStorage.setItem('boekuna:marketing-intro-v2','1');
  }catch{/* Disabled browser storage cannot block a marketing page. */}
  if(firstVisit&&document.body.dataset.page==='home'&&!preference.matches){
    intro=document.createElement('div');intro.className='editorial-intro';
    intro.setAttribute('aria-hidden','true');intro.dataset.editorialDecoration='';
    const mark=document.createElement('div');mark.className='editorial-intro-mark';
    const track=document.createElement('div');track.className='editorial-intro-track';
    intro.append(mark,track);document.body.append(intro);
    readyTimer=setTimeout(()=>document.body.classList.add('ed-intro-ready'),250);
    cleanupTimer=setTimeout(finishIntro,780);
    window.addEventListener('keydown',finishIntro,{once:true});
    window.addEventListener('pointerdown',finishIntro,{once:true});
  }else finishIntro();

  const revealElements=[...document.querySelectorAll('main h2,main figure,.kz-solution,.kz-reason,.kz-fact,.mk-card,.how-flow-card')];
  let observer=null;
  if(!preference.matches&&'IntersectionObserver' in window){
    observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(!entry.isIntersecting)return;
        entry.target.classList.add('ed-arrived');observer.unobserve(entry.target);
      });
    },{threshold:.08});
    revealElements.forEach((element,index)=>{
      element.style.setProperty('--reveal-delay',(index%3)*90+'ms');observer.observe(element);
    });
  }

  // Spring only while settling. Scroll input schedules one layout-read phase;
  // subsequent frames write transforms, so there is no permanent animation loop.
  const plates=[...document.querySelectorAll('.kz-hero-product-proof .product-proof,.kz-benefit.reverse .product-crop,.kz-apps .product-mobile')];
  const springs=plates.map(element=>({element,x:0,v:0,target:0}));
  plates.forEach(element=>element.classList.add('ed-parallax'));
  let frame=0,lastTime=0,needsMeasure=true;
  function stopParallax(){
    cancelAnimationFrame(frame);frame=0;lastTime=0;
    springs.forEach(spring=>{spring.x=0;spring.v=0;spring.target=0;spring.element.style.removeProperty('--ed-parallax');});
  }
  function animate(time){
    frame=0;
    if(preference.matches||!fine.matches||document.hidden){stopParallax();return;}
    if(needsMeasure){
      const targets=springs.map(spring=>{
        const rect=spring.element.getBoundingClientRect();
        return rect.bottom>0&&rect.top<innerHeight?Math.min(20,Math.max(-20,(innerHeight*.55-rect.top)*.035)):0;
      });
      springs.forEach((spring,index)=>spring.target=targets[index]);needsMeasure=false;
    }
    const dt=Math.min(1/30,Math.max(1/240,(time-(lastTime||time-16))/1000));lastTime=time;
    let moving=false;
    springs.forEach(spring=>{
      spring.v+=(-200*(spring.x-spring.target)-26*spring.v)*dt;
      spring.x+=spring.v*dt;
      if(Math.abs(spring.target-spring.x)<.05&&Math.abs(spring.v)<.05){spring.x=spring.target;spring.v=0;}
      else moving=true;
      spring.element.style.setProperty('--ed-parallax',spring.x.toFixed(2)+'px');
    });
    if(moving)frame=requestAnimationFrame(animate);else lastTime=0;
  }
  const schedule=()=>{
    needsMeasure=true;
    if(!frame&&!preference.matches&&fine.matches)frame=requestAnimationFrame(animate);
  };
  if(plates.length){
    window.addEventListener('scroll',schedule,{passive:true});
    window.addEventListener('resize',schedule,{passive:true});
    fine.addEventListener('change',()=>{stopParallax();schedule();});
    document.addEventListener('visibilitychange',()=>{stopParallax();if(!document.hidden)schedule();});
    schedule();
  }
  preference.addEventListener('change',event=>{
    if(event.matches){finishIntro();observer?.disconnect();revealElements.forEach(element=>element.classList.remove('ed-arrived'));stopParallax();}
    else schedule();
  });
  window.addEventListener('pageshow',event=>{if(event.persisted){finishIntro();schedule();}});

  // Enhance the original menu without duplicating links or replacing its handlers.
  const menu=document.getElementById('mobileMenu');
  const toggle=document.querySelector('.mobile-toggle');
  if(menu&&toggle){
    let opened=false;
    const header=menu.closest('.site-header');
    const background=[...document.body.children].filter(element=>!element.contains(header)&&!element.matches('script,style'));
    const inertBefore=new Map();
    function syncMenu(){
      const next=menu.classList.contains('open');
      if(next===opened)return;
      opened=next;document.body.classList.toggle('editorial-menu-open',opened);
      if(opened){
        background.forEach(element=>{inertBefore.set(element,element.inert);element.inert=true;});
        header.setAttribute('role','dialog');header.setAttribute('aria-modal','true');header.setAttribute('aria-label','Navigatie');
        menu.querySelector('summary,a')?.focus();
      }else{
        background.forEach(element=>element.inert=inertBefore.get(element)||false);inertBefore.clear();
        header.removeAttribute('role');header.removeAttribute('aria-modal');header.removeAttribute('aria-label');toggle.focus();
      }
      if(main)main.inert=opened;
    }
    new MutationObserver(syncMenu).observe(menu,{attributes:true,attributeFilter:['class']});
    document.addEventListener('keydown',event=>{
      if(!opened||event.key!=='Tab')return;
      const focusable=[...header.querySelectorAll('a,summary,button')].filter(element=>element.getClientRects().length);
      const first=focusable[0],last=focusable.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    });
    window.matchMedia('(min-width:1024px)').addEventListener('change',event=>{
      if(event.matches&&opened){menu.classList.remove('open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Menu openen');}
    });
  }
});
