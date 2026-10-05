/* Native scrolling; no external dependencies. */
(() => {
  'use strict';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  document.body.classList.add('editorial-ready');
  if (!motion.matches) {
    document.querySelectorAll('.title-line > span').forEach((line, row) => {
      const text=line.textContent;
      line.textContent='';
      [...text].forEach((letter, index) => {
        const span=document.createElement('span');span.className='title-letter';span.textContent=letter;
        span.style.setProperty('--letter-delay', `${row*100+index*15}ms`);line.append(span);
      });
    });
    document.body.classList.add('letter-reveal');
  }
  const menu = document.querySelector('#mnav');
  const trigger = document.querySelector('#burger');
  if (menu && trigger) {
    const background = [document.querySelector('main'), document.querySelector('footer')].filter(Boolean);
    let menuWasOpen = false;
    const sync = () => {
      const open = trigger.getAttribute('aria-expanded') === 'true';
      menuWasOpen = open;
      menu.inert = !open;
      background.forEach(el => { el.inert = open; });
      if (open) {
        const first=menu.querySelector('a');
        first?.focus();
        // Visibility transitions start at hidden on the click frame.
        requestAnimationFrame(() => {
          if (trigger.getAttribute('aria-expanded') === 'true' && !menu.contains(document.activeElement)) first?.focus();
        });
      } else document.body.style.overflow = '';
    };
    menu.inert = true;
    trigger.addEventListener('click', sync);
    menu.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const links = [...menu.querySelectorAll('a[href]')];
      if (event.shiftKey && document.activeElement === links[0]) { event.preventDefault(); trigger.focus(); }
      else if (!event.shiftKey && document.activeElement === links.at(-1)) { event.preventDefault(); trigger.focus(); }
    });
    trigger.addEventListener('keydown', event => {
      if (event.key === 'Tab' && trigger.getAttribute('aria-expanded') === 'true') {
        event.preventDefault();
        const links = [...menu.querySelectorAll('a[href]')];
        (event.shiftKey ? links.at(-1) : links[0])?.focus();
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menuWasOpen) { sync(); trigger.focus(); }
    });
    menu.addEventListener('click', event => {
      if (event.target.closest('a') && trigger.getAttribute('aria-expanded') === 'true') trigger.click();
    });
  }
  const marquee = document.querySelector('.product-marquee');
  if (marquee) {
    const track = marquee.querySelector('.marquee-track');
    const clone = marquee.querySelector('.marquee-group').cloneNode(true);
    clone.classList.add('marquee-clone'); clone.setAttribute('aria-hidden', 'true'); clone.inert = true;
    track.append(clone);
    const pause = document.querySelector('#marquee-pause');
    let paused = motion.matches;
    const update = () => {
      marquee.classList.toggle('is-paused', paused || motion.matches);
      pause.setAttribute('aria-pressed', String(paused || motion.matches));
      pause.textContent = motion.matches ? 'Beweging uit' : paused ? 'Beelden afspelen' : 'Beelden pauzeren';
      pause.disabled = motion.matches;
    };
    pause.addEventListener('click', () => { paused = !paused; update(); });
    motion.addEventListener('change', update); update();
  }
  const cursor = document.createElement('div');
  cursor.className = 'editorial-cursor'; cursor.setAttribute('aria-hidden', 'true');
  cursor.innerHTML = '<div class="editorial-cursor-dot"></div>';
  document.body.append(cursor);
  let x=0,y=0,cx=0,cy=0,frame=0,visible=false;
  const enabled=() => finePointer.matches && !motion.matches;
  const stop=() => { cancelAnimationFrame(frame); frame=0; visible=false; cursor.classList.remove('is-visible'); document.body.classList.remove('cursor-active'); };
  const tick=() => {
    if (!enabled() || !visible) { stop(); return; }
    cx+=(x-cx)*.2; cy+=(y-cy)*.2;
    cursor.style.transform=`translate3d(${cx-16}px,${cy-16}px,0)`;
    frame=requestAnimationFrame(tick);
  };
  document.addEventListener('pointermove', event => {
    if (!enabled() || event.pointerType !== 'mouse') { stop(); return; }
    x=event.clientX; y=event.clientY;
    if (!visible) { cx=x; cy=y; visible=true; cursor.classList.add('is-visible'); document.body.classList.add('cursor-active'); }
    cursor.classList.toggle('is-link', !!event.target.closest('a,button,summary,input,select'));
    if (!frame) tick();
  }, {passive:true});
  document.addEventListener('pointerleave', stop); window.addEventListener('blur', stop);
  document.addEventListener('keydown', stop); motion.addEventListener('change', stop); finePointer.addEventListener('change', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
})();
