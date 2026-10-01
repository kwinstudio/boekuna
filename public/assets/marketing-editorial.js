/* Public marketing enhancement. No product/auth/billing dependencies. */
document.addEventListener('DOMContentLoaded',()=>{
  if(!document.body.classList.contains('editorial-site'))return;
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const main=document.querySelector('main');
  if(main&&!main.id)main.id='marketingMain';
  const skip=document.createElement('a');skip.href='#'+main?.id;skip.className='editorial-skip';skip.textContent='Ga naar inhoud';
  if(main)document.body.prepend(skip);

  // Keep the literal original heading text/spacing. Wrappers carry no duplicate
  // aria-label and do not hide readable text from the accessibility tree.
  const heading=document.querySelector('h1');
  if(heading&&!preference.matches){
    const walker=document.createTreeWalker(heading,NodeFilter.SHOW_TEXT);
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    let wordIndex=0;
    nodes.forEach(node=>{
      const fragment=document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach(part=>{
        if(!part)return;
        if(/^\s+$/.test(part)){fragment.append(document.createTextNode(part));return;}
        const mask=document.createElement('span');mask.className='editorial-word-mask';
        const word=document.createElement('span');word.className='editorial-word';word.textContent=part;
        word.style.setProperty('--word-delay',Math.min(wordIndex++*35,245)+'ms');mask.append(word);fragment.append(mask);
      });
      node.replaceWith(fragment);
    });
  }

  const sections=Array.from(document.querySelectorAll('main>section,.marketing main>section'));
  if(!preference.matches&&'IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(entry.isIntersecting){entry.target.classList.add('ed-arrived');observer.unobserve(entry.target);}
    }),{threshold:.06});
    sections.forEach(section=>{section.classList.add('ed-reveal');observer.observe(section);});
    preference.addEventListener('change',event=>{if(event.matches){observer.disconnect();sections.forEach(section=>section.classList.remove('ed-reveal','ed-arrived'));}});
  }

  // Small image movement only. Native scrolling is never intercepted.
  const image=document.querySelector('.kz-hero-product-proof .product-proof');
  const fine=window.matchMedia('(pointer:fine)');
  let frame=0;
  const syncParallax=()=>{
    frame=0;if(!image)return;
    if(preference.matches||!fine.matches){image.style.removeProperty('--ed-parallax');return;}
    const rect=image.getBoundingClientRect();
    if(rect.bottom>0&&rect.top<innerHeight)image.style.setProperty('--ed-parallax',Math.min(18,Math.max(-18,(innerHeight*.6-rect.top)*.035))+'px');
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(syncParallax);};
  if(image){image.classList.add('ed-parallax');window.addEventListener('scroll',schedule,{passive:true});preference.addEventListener('change',syncParallax);fine.addEventListener('change',syncParallax);schedule();}

  // Original toggle/links/Escape remain authoritative. Observe the resulting
  // open state to make the larger mobile presentation keyboard accessible.
  const menu=document.getElementById('mobileMenu');
  const toggle=document.querySelector('.mobile-toggle');
  if(menu&&toggle){
    let opened=false;
    const header=menu.closest('.site-header');
    const background=[...document.body.children].filter(el=>!el.contains(header)&&!el.matches('script,style'));
    const inertBefore=new Map();
    const syncMenu=()=>{
      const next=menu.classList.contains('open');if(next===opened)return;opened=next;
      document.body.classList.toggle('editorial-menu-open',opened);
      if(opened){
        background.forEach(el=>{inertBefore.set(el,el.inert);el.inert=true;});
        // The masthead includes the existing close toggle, so every focusable
        // control belongs to the modal navigation's accessibility subtree.
        header.setAttribute('role','dialog');header.setAttribute('aria-modal','true');header.setAttribute('aria-label','Navigatie');
        menu.querySelector('summary,a')?.focus();
      }else{
        background.forEach(el=>el.inert=inertBefore.get(el)||false);inertBefore.clear();
        header.removeAttribute('role');header.removeAttribute('aria-modal');header.removeAttribute('aria-label');toggle.focus();
      }
      if(main)main.inert=opened;
    };
    new MutationObserver(syncMenu).observe(menu,{attributes:true,attributeFilter:['class']});
    document.addEventListener('keydown',event=>{
      if(!opened||event.key!=='Tab')return;
      const candidates=[...header.querySelectorAll('a,summary,button')].filter(el=>el.getClientRects().length);
      const first=candidates[0],last=candidates.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    });
    window.matchMedia('(min-width:901px)').addEventListener('change',event=>{
      if(event.matches&&opened){menu.classList.remove('open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Menu openen');}
    });
  }
});
