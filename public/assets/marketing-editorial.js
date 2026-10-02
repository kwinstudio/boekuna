/* Public marketing only. Existing product tabs, form handlers and destinations stay authoritative. */
document.addEventListener('DOMContentLoaded',()=>{
  if(!document.body.classList.contains('editorial-site'))return;
  const main=document.querySelector('main');
  if(main&&!main.id)main.id='marketingMain';
  const skip=document.createElement('a');
  skip.href='#'+main?.id;skip.className='editorial-skip';skip.textContent='Ga naar inhoud';
  if(main)document.body.prepend(skip);
  document.querySelectorAll('a[href]').forEach(link=>{
    if(link.getAttribute('href')===location.pathname)link.setAttribute('aria-current','page');
  });

  // Native details expose an explicit state to assistive technology.
  document.querySelectorAll('details').forEach(detail=>{
    const summary=detail.querySelector('summary');
    const sync=()=>summary?.setAttribute('aria-expanded',String(detail.open));
    detail.addEventListener('toggle',sync);sync();
  });
  document.querySelectorAll('[data-compare]').forEach(button=>{
    const sync=()=>button.setAttribute('aria-pressed',String(button.classList.contains('active')));
    new MutationObserver(sync).observe(button,{attributes:true,attributeFilter:['class']});sync();
  });

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
    window.matchMedia('(min-width:1101px)').addEventListener('change',event=>{
      if(event.matches&&opened){menu.classList.remove('open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Menu openen');}
    });
  }
});
