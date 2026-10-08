(()=>{
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Product tour: accessible tabs with arrow-key support.
  document.querySelectorAll('[data-tour]').forEach(tour=>{
    const tabs=[...tour.querySelectorAll('[role=tab]')];
    const select=(tab,focus)=>{
      tabs.forEach(t=>{
        const on=t===tab;
        t.setAttribute('aria-selected',String(on));
        t.tabIndex=on?0:-1;
        const panel=document.getElementById(t.getAttribute('aria-controls'));
        if(!panel)return;
        panel.hidden=!on;
        panel.classList.remove('is-entering');
        if(on&&!reduce){void panel.offsetWidth;panel.classList.add('is-entering')}
      });
      if(focus)tab.focus();
      tab.scrollIntoView({block:'nearest',inline:'nearest',behavior:reduce?'auto':'smooth'});
    };
    tabs.forEach((tab,i)=>{
      tab.addEventListener('click',()=>select(tab,false));
      tab.addEventListener('keydown',e=>{
        const k=e.key;let n=null;
        if(k==='ArrowRight')n=tabs[(i+1)%tabs.length];
        else if(k==='ArrowLeft')n=tabs[(i-1+tabs.length)%tabs.length];
        else if(k==='Home')n=tabs[0];
        else if(k==='End')n=tabs[tabs.length-1];
        if(n){e.preventDefault();select(n,true)}
      });
    });
  });

  // Plan helper: recommend a plan from the number of documents per month.
  const helper=document.querySelector('[data-plan-helper]');
  if(helper){
    const input=helper.querySelector('input'),count=helper.querySelector('[data-plan-count]'),advice=helper.querySelector('[data-plan-advice]');
    const cards={gratis:document.querySelector('[data-plan=gratis]'),boekuna:document.querySelector('[data-plan=boekuna]'),unlimited:document.querySelector('[data-plan=unlimited]')};
    const update=()=>{
      const v=Number(input.value);
      count.textContent=v>=150?'150+':String(v);
      const plan=v<=10?'gratis':v<=100?'boekuna':'unlimited';
      advice.innerHTML=plan==='gratis'?'Advies: <strong>Gratis</strong>, met 10 slimme documentchecks per maand.'
        :plan==='boekuna'?'Advies: <strong>Boekuna</strong>, met 100 slimme documentchecks per maand.'
        :'Advies: <strong>Unlimited</strong>, zonder maandlimiet op slimme documentchecks.';
      Object.entries(cards).forEach(([k,el])=>el&&el.classList.toggle('is-recommended',k===plan));
    };
    input.addEventListener('input',update);
    update();
  }

  // Header dropdown: close on outside click, Escape, or when focus leaves it.
  document.querySelectorAll('.nav-drop').forEach(drop=>{
    const close=()=>{if(drop.open){drop.open=false}};
    document.addEventListener('click',e=>{if(!drop.contains(e.target))close()});
    drop.addEventListener('keydown',e=>{if(e.key==='Escape'&&drop.open){close();drop.querySelector('summary').focus()}});
    drop.addEventListener('focusout',e=>{if(e.relatedTarget&&!drop.contains(e.relatedTarget))close()});
  });

  // Gentle reveal while scrolling. Content stays visible without JS or with reduced motion.
  if(!reduce&&'IntersectionObserver' in window){
    document.documentElement.classList.add('js-motion');
    const io=new IntersectionObserver(entries=>entries.forEach(en=>{
      if(en.isIntersecting){en.target.classList.add('is-visible');io.unobserve(en.target)}
    }),{rootMargin:'0px 0px -8% 0px',threshold:.08});
    document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
  }
})();
