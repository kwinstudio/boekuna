const HEADER=\`
<header class="site-header">
  <nav class="nav shell" aria-label="Hoofdnavigatie">
    <a class="brand" href="/" aria-label="Boekuna home"><img src="/assets/boekuna-logo-primary.svg" alt="Boekuna"></a>
    <div class="nav-links" aria-label="Pagina">
      <a href="/#product">Product</a><a href="/#hoe-het-werkt">Hoe het werkt</a><a href="/#prijzen">Prijzen</a><a href="/#faq">FAQ</a>
    </div>
    <div class="nav-actions">
      <a class="nav-login" href="https://app.boekuna.nl/?login=1">Inloggen</a>
      <a class="button button-primary nav-start" href="https://app.boekuna.nl/?register=1">Start gratis</a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobileMenu" aria-label="Menu openen"><span></span><span></span><span></span></button>
    </div>
  </nav>
  <nav class="mobile-menu shell" id="mobileMenu" aria-label="Mobiele navigatie" hidden>
    <a href="/#product">Product</a><a href="/#hoe-het-werkt">Hoe het werkt</a><a href="/#prijzen">Prijzen</a><a href="/#faq">FAQ</a>
    <a href="/support/">Support</a><a href="https://app.boekuna.nl/?login=1">Inloggen</a><a class="button button-primary" href="https://app.boekuna.nl/?register=1">Start gratis</a>
  </nav>
</header>\`;

const FOOTER=\`
<footer class="footer">
  <div class="shell footer-grid">
    <div><img src="/assets/boekuna-logo-reversed.svg" alt="Boekuna" class="footer-logo"><p>Boekhouden zonder boekhoudtaal. Boekuna is een product van Kwinest.</p></div>
    <nav aria-label="Juridisch"><a href="/privacy/">Privacy</a><a href="/voorwaarden/">Voorwaarden</a><a href="/account-verwijderen/">Account verwijderen</a><a href="/support/">Support</a></nav>
    <div class="footer-contact"><a href="mailto:support@boekuna.nl">support@boekuna.nl</a><a href="https://app.boekuna.nl/?login=1">Inloggen</a></div>
  </div>
  <div class="shell footer-bottom">© 2026 Boekuna · Nederland</div>
</footer>\`;

function ensureHead(){
  document.querySelectorAll('link[rel="apple-touch-icon"]').forEach(el=>el.remove());
  const apple=document.createElement('link');apple.rel='apple-touch-icon';apple.sizes='180x180';apple.href='/assets/boekuna-app-icon-180.png';document.head.appendChild(apple);
  let og=document.querySelector('meta[property="og:image"]');
  if(!og){og=document.createElement('meta');og.setAttribute('property','og:image');document.head.appendChild(og);}
  og.setAttribute('content','https://boekuna.nl/assets/boekuna-og-1200x630.png');
  let twitter=document.querySelector('meta[name="twitter:card"]');
  if(!twitter){twitter=document.createElement('meta');twitter.name='twitter:card';document.head.appendChild(twitter);}
  twitter.content='summary_large_image';
}
function mountChrome(){
  const h=document.getElementById('siteHeader');if(h&&!h.children.length)h.innerHTML=HEADER;
  const f=document.getElementById('siteFooter');if(f&&!f.children.length)f.innerHTML=FOOTER;
}
function initMenu(){
  const btn=document.querySelector('.menu-toggle'),menu=document.getElementById('mobileMenu');if(!btn||!menu)return;
  const close=(restore=false)=>{menu.hidden=true;document.body.classList.remove('menu-open');btn.setAttribute('aria-expanded','false');btn.setAttribute('aria-label','Menu openen');if(restore)btn.focus();};
  const open=()=>{menu.hidden=false;document.body.classList.add('menu-open');btn.setAttribute('aria-expanded','true');btn.setAttribute('aria-label','Menu sluiten');menu.querySelector('a')?.focus();};
  btn.addEventListener('click',()=>menu.hidden?open():close(false));
  menu.addEventListener('click',event=>{if(event.target.closest('a'))close(false)});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!menu.hidden){event.preventDefault();close(true);return;}
    if(event.key!=='Tab'||menu.hidden)return;
    const focusable=[btn,...menu.querySelectorAll('a[href]')],first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  window.matchMedia('(min-width:901px)').addEventListener?.('change',event=>{if(event.matches)close(false)});
}
document.addEventListener('DOMContentLoaded',()=>{ensureHead();mountChrome();initMenu();});
