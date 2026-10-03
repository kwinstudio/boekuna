const HEADER=`
<header class="site-header">
  <nav class="nav shell" aria-label="Hoofdnavigatie">
    <a class="brand-wordmark" href="/" aria-label="Boekuna home">Boekuna<span aria-hidden="true">.</span></a>
    <div class="nav-links" aria-label="Pagina">
      <a href="/#product">Product</a>
      <a href="/#hoe-het-werkt">Hoe het werkt</a>
      <a href="/#prijzen">Prijzen</a>
      <a href="/#faq">FAQ</a>
    </div>
    <div class="nav-actions">
      <a class="nav-login" href="https://app.boekuna.nl/?login=1">Inloggen</a>
      <a class="button button-primary nav-start" href="https://app.boekuna.nl/?register=1">Gratis proberen</a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobileMenu" aria-label="Menu openen"><span></span><span></span><span></span></button>
    </div>
  </nav>
  <nav class="mobile-menu shell" id="mobileMenu" aria-label="Mobiele navigatie" hidden>
    <a href="/#product">Product</a>
    <a href="/#hoe-het-werkt">Hoe het werkt</a>
    <a href="/#prijzen">Prijzen</a>
    <a href="/#faq">FAQ</a>
    <a href="/support/">Support</a>
    <a href="https://app.boekuna.nl/?login=1">Inloggen</a>
    <a class="button button-primary" href="https://app.boekuna.nl/?register=1">Gratis proberen</a>
  </nav>
</header>`;

const FOOTER=`
<footer class="footer">
  <div class="shell footer-grid">
    <div>
      <a class="brand-wordmark brand-wordmark-reversed" href="/" aria-label="Boekuna home">Boekuna<span aria-hidden="true">.</span></a>
      <p>Boekhouden zonder gedoe. Boekuna is een product van Kwinest.</p>
    </div>
    <nav aria-label="Juridisch">
      <a href="/privacy/">Privacy</a>
      <a href="/voorwaarden/">Voorwaarden</a>
      <a href="/voorwaarden/#bedrijfsgegevens">Bedrijfsgegevens</a>
      <a href="/account-verwijderen/">Account verwijderen</a>
    </nav>
    <div class="footer-contact">
      <a href="/support/">Support</a>
      <a href="mailto:support@boekuna.nl">support@boekuna.nl</a>
      <a href="https://app.boekuna.nl/?login=1">Inloggen</a>
    </div>
  </div>
  <div class="shell footer-bottom">© 2026 Boekuna · Nederland</div>
</footer>`;

function ensureHead(){
  let og=document.querySelector('meta[property="og:image"]');
  if(!og){og=document.createElement('meta');og.setAttribute('property','og:image');document.head.appendChild(og);}
  og.setAttribute('content','https://boekuna.nl/assets/boekuna-og-1200x630.png');
  let twitter=document.querySelector('meta[name="twitter:card"]');
  if(!twitter){twitter=document.createElement('meta');twitter.name='twitter:card';document.head.appendChild(twitter);}
  twitter.content='summary_large_image';
}

function mountChrome(){
  const header=document.getElementById('siteHeader');
  if(header&&!header.children.length)header.innerHTML=HEADER;
  const footer=document.getElementById('siteFooter');
  if(footer&&!footer.children.length)footer.innerHTML=FOOTER;
}

function initMenu(){
  const button=document.querySelector('.menu-toggle');
  const menu=document.getElementById('mobileMenu');
  if(!button||!menu)return;

  const close=(restoreFocus=false)=>{
    menu.hidden=true;
    document.body.classList.remove('menu-open');
    button.setAttribute('aria-expanded','false');
    button.setAttribute('aria-label','Menu openen');
    if(restoreFocus)button.focus();
  };
  const open=()=>{
    menu.hidden=false;
    document.body.classList.add('menu-open');
    button.setAttribute('aria-expanded','true');
    button.setAttribute('aria-label','Menu sluiten');
    menu.querySelector('a[href]')?.focus();
  };

  button.addEventListener('click',()=>menu.hidden?open():close());
  menu.addEventListener('click',event=>{if(event.target.closest('a[href]'))close();});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!menu.hidden){
      event.preventDefault();
      close(true);
      return;
    }
    if(event.key!=='Tab'||menu.hidden)return;
    const focusable=[button,...menu.querySelectorAll('a[href]')];
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  window.matchMedia('(min-width:901px)').addEventListener?.('change',event=>{if(event.matches)close();});
}

document.addEventListener('DOMContentLoaded',()=>{
  ensureHead();
  mountChrome();
  initMenu();
});
