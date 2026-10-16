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

  // Mobile menu: close on Escape and after choosing a link on the same page.
  document.querySelectorAll('.mobile-nav').forEach(nav=>{
    nav.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav.open){nav.open=false;nav.querySelector('summary').focus()}});
    nav.querySelectorAll('a[href^="/#"],a[href^="#"]').forEach(a=>a.addEventListener('click',()=>{nav.open=false}));
  });

  // Gentle reveal while scrolling. Content stays visible without JS or with reduced motion.
  if(!reduce&&'IntersectionObserver' in window){
    document.documentElement.classList.add('js-motion');
    const io=new IntersectionObserver(entries=>entries.forEach(en=>{
      if(en.isIntersecting){en.target.classList.add('is-visible');io.unobserve(en.target)}
    }),{rootMargin:'0px 0px -8% 0px',threshold:.08});
    document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
  }

  // ---- Homepage (studio) ----------------------------------------------------------
  // Everything below only acts when its hooks exist, so other pages are untouched.
  const root=document.documentElement;
  const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  let started=false;const waiting=[];
  const whenReady=fn=>started?fn():waiting.push(fn);
  const start=()=>{if(started)return;started=true;waiting.splice(0).forEach(f=>f())};

  // Loader: counts 000 to 100 once per browser session, then slides up.
  const loader=document.querySelector('[data-loader]');
  if(loader){
    let seen=false;
    try{seen=sessionStorage.getItem('bk-intro')==='1';sessionStorage.setItem('bk-intro','1')}catch(e){}
    const out=()=>{
      loader.classList.add('is-out');
      setTimeout(start,250);
      setTimeout(()=>loader.classList.add('is-gone'),800);
    };
    if(reduce){loader.classList.add('is-gone');start()}
    else if(seen){requestAnimationFrame(out)}
    else{
      const fill=loader.querySelector('[data-loader-fill]'),num=loader.querySelector('[data-loader-num]');
      const t0=performance.now(),dur=1300;
      const tick=now=>{
        const p=Math.min(1,(now-t0)/dur),v=Math.round(ease(p)*100);
        if(fill)fill.style.width=v+'%';
        if(num)num.textContent=String(v).padStart(3,'0');
        if(p<1)requestAnimationFrame(tick);else setTimeout(out,120);
      };
      requestAnimationFrame(tick);
    }
  }else start();

  // Reveals: blocks (.rv), headline lines (.lines) and words (.words).
  if(root.classList.contains('studio')){
    const show=el=>{
      if(el.classList.contains('lines')){
        const d=+el.dataset.delay||0,st=+el.dataset.stagger||100;
        el.querySelectorAll('.ln>span').forEach((s,i)=>{s.style.transitionDelay=(d+i*st)+'ms'});
      }else if(el.classList.contains('words')){
        el.querySelectorAll('.w').forEach((w,i)=>{w.style.transitionDelay=(i*35)+'ms'});
      }
      el.classList.add('in');
    };
    const els=[...document.querySelectorAll('.studio .rv,.studio .lines,.studio .words')];
    if(reduce||!('IntersectionObserver' in window))els.forEach(show);
    else whenReady(()=>{
      const io=new IntersectionObserver(entries=>entries.forEach(en=>{
        if(en.isIntersecting){show(en.target);io.unobserve(en.target)}
      }),{rootMargin:'0px 0px -6% 0px',threshold:.12});
      els.forEach(el=>io.observe(el));
    });
  }

  // Hero card: three short slides with previous/next buttons.
  document.querySelectorAll('[data-slides]').forEach(card=>{
    const items=[...card.querySelectorAll('.s-hcard-item')],dots=[...card.querySelectorAll('.s-dots i')];
    let i=0;
    const go=dir=>{
      i=(i+dir+items.length)%items.length;
      items.forEach((it,n)=>{it.hidden=n!==i});
      dots.forEach((d,n)=>d.classList.toggle('on',n===i));
    };
    card.querySelectorAll('[data-slide]').forEach(b=>b.addEventListener('click',()=>go(+b.dataset.slide)));
  });

  // Numbers count up while their row scrolls into the middle of the screen.
  const counts=[...document.querySelectorAll('[data-count]')];
  if(counts.length&&!reduce){
    const fmt=n=>n.toLocaleString('nl-NL');
    let last=0;
    const paint=()=>{
      const vh=innerHeight;
      counts.forEach(el=>{
        const r=el.getBoundingClientRect(),target=+el.dataset.count;
        const p=Math.max(0,Math.min(1,(vh-r.top)/(vh/2+r.height/2)));
        el.textContent=fmt(Math.round(target*ease(p)));
      });
    };
    const onScroll=()=>{const now=Date.now();if(now-last<30)return;last=now;requestAnimationFrame(paint)};
    paint();
    addEventListener('scroll',onScroll,{passive:true});
    addEventListener('resize',onScroll,{passive:true});
    addEventListener('scrollend',()=>requestAnimationFrame(paint),{passive:true});
  }

  // Header clock: local time in the Netherlands.
  const clock=document.querySelector('[data-clock]');
  if(clock){
    const t=clock.querySelector('[data-clock-time]'),d=clock.querySelector('[data-clock-date]');
    const tf=new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit'});
    const df=new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',day:'numeric',month:'short'});
    const set=()=>{const now=new Date();t.textContent=tf.format(now);d.textContent=df.format(now).replace('.','')};
    set();clock.hidden=false;setInterval(set,15000);
  }

  // Hero photo: grey by default, colour follows the mouse like a soft brush.
  document.querySelectorAll('[data-liquid]').forEach(box=>{
    if(reduce||!matchMedia('(hover: hover) and (pointer: fine)').matches)return;
    const base=box.querySelector('img');if(!base)return;
    const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');
    base.after(canvas);
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const hero=box.parentElement;
    const pts=[];let w=0,h=0,dpr=1,raf=0,idle=0,empty=0,lx=null,ly=null;
    const R=143,DECAY=.016;
    const size=()=>{
      dpr=Math.min(devicePixelRatio||1,2);w=box.clientWidth;h=box.clientHeight;
      canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    };
    // The colour layer is drawn like object-fit:cover with object-position 72% 30%.
    const cover=()=>{
      const iw=base.naturalWidth,ih=base.naturalHeight;if(!iw||!ih)return null;
      const s=Math.max(w/iw,h/ih),dw=iw*s,dh=ih*s;
      return [(w-dw)*.72,(h-dh)*.3,dw,dh];
    };
    const add=(x,y)=>{
      if(lx!==null){
        const dx=x-lx,dy=y-ly,dist=Math.hypot(dx,dy),step=Math.max(R*.3,1);
        for(let s=step;s<dist;s+=step)pts.push({x:lx+dx*s/dist,y:ly+dy*s/dist,a:1});
      }
      pts.push({x,y,a:1});lx=x;ly=y;idle=0;
      while(pts.length>60)pts.shift();
      if(!raf)raf=requestAnimationFrame(draw);
    };
    const draw=()=>{
      raf=0;
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.globalCompositeOperation='source-over';
      ctx.clearRect(0,0,w,h);
      idle++;
      const fade=DECAY+Math.min(idle*.004,.5);
      for(let n=pts.length-1;n>=0;n--){pts[n].a-=fade*(pts[n].a<.5?1.5:1);if(pts[n].a<=0)pts.splice(n,1)}
      if(!pts.length){if(++empty>120){ctx.clearRect(0,0,w,h);empty=0;return}raf=requestAnimationFrame(draw);return}
      empty=0;
      pts.forEach(p=>{
        const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,R);
        g.addColorStop(0,`rgba(0,0,0,${p.a})`);g.addColorStop(.55,`rgba(0,0,0,${p.a*.82})`);g.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,R,0,Math.PI*2);ctx.fill();
      });
      const c=cover();
      if(c){ctx.globalCompositeOperation='source-in';ctx.drawImage(base,...c)}
      raf=requestAnimationFrame(draw);
    };
    size();addEventListener('resize',size,{passive:true});
    hero.addEventListener('pointermove',e=>{
      if(e.pointerType!=='mouse')return;
      const r=box.getBoundingClientRect();add(e.clientX-r.left,e.clientY-r.top);
    },{passive:true});
    hero.addEventListener('pointerleave',()=>{lx=ly=null});
  });
})();
