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

  // Pricing: month/year switch. Prices are in the HTML; this only toggles which one
  // is shown and carries the chosen period to the app link. No reload, no layout shift.
  document.querySelectorAll('[data-interval-switch]').forEach(sw=>{
    const radios=[...sw.querySelectorAll('[role=radio]')];
    const status=sw.querySelector('[data-interval-status]');
    const grid=sw.parentElement.querySelector('[data-pricing]');
    const set=(interval,focus)=>{
      radios.forEach(r=>{const on=r.dataset.interval===interval;r.setAttribute('aria-checked',String(on));r.tabIndex=on?0:-1;if(on&&focus)r.focus()});
      if(grid){
        grid.dataset.intervalCurrent=interval;
        grid.querySelectorAll('a[data-plan-cta]').forEach(a=>{const u=new URL(a.href);u.searchParams.set('interval',interval);a.href=u.toString()});
      }
      if(status)status.textContent=interval==='year'?'Jaarprijzen worden getoond.':'Maandprijzen worden getoond.';
    };
    radios.forEach((r,i)=>{
      r.addEventListener('click',()=>set(r.dataset.interval,false));
      r.addEventListener('keydown',e=>{
        if(!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown'].includes(e.key))return;
        e.preventDefault();
        const n=radios[(i+(e.key==='ArrowRight'||e.key==='ArrowDown'?1:radios.length-1))%radios.length];
        set(n.dataset.interval,true);
      });
    });
  });

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
