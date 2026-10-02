const BOOKUNA_LOGO="/assets/boekuna-logo-primary.svg";
const BOOKUNA_LOGO_COMPACT="/assets/boekuna-logo-compact.svg";

function ensureBookunaFavicon(){
  document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]').forEach(el=>el.remove());
  const icon=document.createElement('link');
  icon.rel='icon';icon.type='image/svg+xml';icon.href='/assets/boekuna-favicon.svg';icon.dataset.bookunaFavicon='1';
  document.head.appendChild(icon);
  const shortcut=document.createElement('link');
  shortcut.rel='shortcut icon';shortcut.href='/assets/favicon-32.png';
  document.head.appendChild(shortcut);
  const apple=document.createElement('link');
  apple.rel='apple-touch-icon';apple.sizes='180x180';apple.href='/assets/boekuna-app-icon-180.png';
  document.head.appendChild(apple);
  let og=document.querySelector('meta[property="og:image"]');
  if(!og){og=document.createElement('meta');og.setAttribute('property','og:image');document.head.appendChild(og);}
  og.setAttribute('content','https://boekuna.nl/assets/boekuna-og-1200x630.png');
  let twitter=document.querySelector('meta[name="twitter:card"]');
  if(!twitter){twitter=document.createElement('meta');twitter.name='twitter:card';document.head.appendChild(twitter);}
  twitter.content='summary_large_image';
}

function toggleMenu(){
  const menu=document.getElementById('mobileMenu');
  const btn=document.querySelector('.mobile-toggle');
  if(!menu)return;
  const open=menu.classList.toggle('open');
  if(btn){
    btn.setAttribute('aria-expanded',String(open));
    btn.setAttribute('aria-label',open?'Menu sluiten':'Menu openen');
  }
}

function sharedHeader(){
  return `
  <header class="site-header">
    <nav class="nav" aria-label="Hoofdnavigatie">
      <a class="logo" href="/" aria-label="Boekuna home">
        <img class="logo-lockup logo-lockup-primary" src="${BOOKUNA_LOGO}" alt="Boekuna">
        <img class="logo-lockup logo-lockup-compact" src="${BOOKUNA_LOGO_COMPACT}" alt="" aria-hidden="true">
      </a>
      <div class="nav-links">
        <div class="nav-menu-root">
          <button class="nav-link nav-menu-trigger" type="button" data-nav-trigger="product" aria-expanded="false" aria-controls="navPanelProduct">Product <span aria-hidden="true">⌄</span></button>
          <div class="nav-menu-panel nav-menu-panel--wide" id="navPanelProduct" data-nav-panel="product" hidden>
            <div class="nav-menu-column">
              <small>Dagelijks</small>
              <a href="/facturen/"><strong>Facturen</strong><span>Maken, versturen en volgen</span></a>
              <a href="/scanner/"><strong>Documenten</strong><span>Uploaden, herkennen en controleren</span></a>
              <a href="/functies/#relaties"><strong>Relaties</strong><span>Klanten en leveranciers bij elkaar</span></a>
            </div>
            <div class="nav-menu-column">
              <small>Inzicht</small>
              <a href="/btw-bank/"><strong>Btw & bank</strong><span>Kwartaaloverzicht en bankimport</span></a>
              <a href="/rapportages/"><strong>Rapportages</strong><span>Omzet, kosten en resultaat</span></a>
            </div>
            <div class="nav-menu-column nav-menu-column--compact">
              <small>Ontdekken</small>
              <a href="/functies/"><strong>Alle functies</strong></a>
              <a href="/hoe-het-werkt/"><strong>Hoe het werkt</strong></a>
            </div>
          </div>
        </div>
        <div class="nav-menu-root">
          <button class="nav-link nav-menu-trigger" type="button" data-nav-trigger="audience" aria-expanded="false" aria-controls="navPanelAudience">Voor wie <span aria-hidden="true">⌄</span></button>
          <div class="nav-menu-panel" id="navPanelAudience" data-nav-panel="audience" hidden>
            <div class="nav-menu-column">
              <small>Voor ondernemers</small>
              <a href="/voor-ondernemers/#zzp"><strong>ZZP & freelance</strong><span>Minder administratie naast je vak</span></a>
              <a href="/voor-ondernemers/#klein-bedrijf"><strong>Kleine bedrijven</strong><span>Structuur terwijl je groeit</span></a>
              <a href="/voor-ondernemers/#veel-documenten"><strong>Veel documenten</strong><span>Minder handmatig invoerwerk</span></a>
              <a href="/voor-ondernemers/"><strong>Bekijk alle ondernemers</strong></a>
            </div>
          </div>
        </div>
        <a class="nav-link" href="/prijzen/">Prijzen</a>
        <div class="nav-menu-root">
          <button class="nav-link nav-menu-trigger" type="button" data-nav-trigger="support" aria-expanded="false" aria-controls="navPanelSupport">Ondersteuning <span aria-hidden="true">⌄</span></button>
          <div class="nav-menu-panel" id="navPanelSupport" data-nav-panel="support" hidden>
            <div class="nav-menu-column">
              <small>Hulp & vertrouwen</small>
              <a href="/support/"><strong>Support</strong><span>Hulp bij je administratie</span></a>
              <a href="/faq/"><strong>Veelgestelde vragen</strong><span>Snel antwoord op praktische vragen</span></a>
              <a href="/veiligheid/"><strong>Veiligheid & privacy</strong><span>Hoe Boekuna met je gegevens omgaat</span></a>
              <a href="/contact/"><strong>Contact</strong><span>Neem contact op met Boekuna</span></a>
            </div>
          </div>
        </div>
      </div>
      <div class="nav-actions">
        <a class="nav-login" href="https://app.boekuna.nl/?login=1">Inloggen</a>
        <a class="btn primary nav-start" href="https://app.boekuna.nl/?register=1">Gratis starten</a>
        <button class="mobile-toggle" type="button" onclick="toggleMenu()" aria-label="Menu openen" aria-expanded="false" aria-controls="mobileMenu">
          <span class="mobile-toggle-icon" aria-hidden="true"><i></i><i></i><i></i></span>
        </button>
      </div>
    </nav>
    <div class="mobile-menu" id="mobileMenu">
      <details>
        <summary>Product</summary>
        <div class="mobile-sub">
          <a href="/facturen/">Facturen</a>
          <a href="/scanner/">Documenten</a>
          <a href="/functies/#relaties">Relaties</a>
          <a href="/btw-bank/">Btw & bank</a>
          <a href="/rapportages/">Rapportages</a>
          <a href="/functies/">Alle functies</a>
          <a href="/hoe-het-werkt/">Hoe het werkt</a>
        </div>
      </details>
      <details>
        <summary>Voor wie</summary>
        <div class="mobile-sub">
          <a href="/voor-ondernemers/#zzp">ZZP & freelance</a>
          <a href="/voor-ondernemers/#klein-bedrijf">Kleine bedrijven</a>
          <a href="/voor-ondernemers/#veel-documenten">Veel documenten</a>
          <a href="/voor-ondernemers/">Voor wie Boekuna is</a>
        </div>
      </details>
      <details>
        <summary>Ondersteuning</summary>
        <div class="mobile-sub">
          <a href="/support/">Support</a>
          <a href="/faq/">Veelgestelde vragen</a>
          <a href="/veiligheid/">Veiligheid & privacy</a>
          <a href="/contact/">Contact</a>
        </div>
      </details>
      <div class="mobile-menu-secondary">
        <a href="/prijzen/">Prijzen</a>
        <a href="/over/">Over Boekuna</a>
        <a href="https://app.boekuna.nl/?login=1">Inloggen</a>
        <a class="mobile-start" href="https://app.boekuna.nl/?register=1">Gratis starten</a>
      </div>
    </div>
  </header>`;
}

function sharedFooter(){
  return `<footer class="footer footer-v2">
    <div class="footer-inner footer-grid">
      <div class="footer-brand">
        <a class="logo footer-logo" href="/" aria-label="Boekuna home"><img class="logo-lockup logo-lockup-primary" src="${BOOKUNA_LOGO}" alt="Boekuna"></a>
        <p>Boekhouden zonder boekhoudtaal. Voor ondernemers die hun administratie zelf willen begrijpen.</p>
        <a class="footer-cta" href="https://app.boekuna.nl/?register=1">Gratis starten →</a>
      </div>
      <nav class="footer-col" aria-label="Product">
        <h4>Product</h4>
        <a href="/facturen/">Facturen</a>
        <a href="/scanner/">Documenten</a>
        <a href="/btw-bank/">Btw & bank</a>
        <a href="/rapportages/">Rapportages</a>
        <a href="/functies/">Alle functies</a>
        <a href="/prijzen/">Prijzen</a>
      </nav>
      <nav class="footer-col" aria-label="Voor wie">
        <h4>Voor wie</h4>
        <a href="/voor-ondernemers/#zzp">ZZP & freelance</a>
        <a href="/voor-ondernemers/#klein-bedrijf">Kleine bedrijven</a>
        <a href="/voor-ondernemers/#veel-documenten">Veel documenten</a>
        <a href="/hoe-het-werkt/">Hoe het werkt</a>
      </nav>
      <nav class="footer-col" aria-label="Ondersteuning">
        <h4>Ondersteuning</h4>
        <a href="/support/">Support</a>
        <a href="/faq/">FAQ</a>
        <a href="/contact/">Contact</a>
        <a href="/over/">Over Boekuna</a>
      </nav>
      <nav class="footer-col" aria-label="Vertrouwen">
        <h4>Vertrouwen</h4>
        <a href="/veiligheid/">Veiligheid & privacy</a>
        <a href="/privacy/">Privacybeleid</a>
        <a href="/voorwaarden/">Voorwaarden</a>
        <a href="/account-verwijderen/">Account verwijderen</a>
        <a href="mailto:support@boekuna.nl">support@boekuna.nl</a>
      </nav>
    </div>
    <div class="footer-bottom footer-bottom-v2">
      <span>© 2026 Boekuna</span>
      <span class="footer-status"><i aria-hidden="true"></i> Beveiligde cloudomgeving</span>
      <span>Boekuna · Nederland</span>
    </div>
  </footer>`;
}

document.addEventListener('DOMContentLoaded',()=>{
  ensureBookunaFavicon();
  const h=document.getElementById('siteHeader');if(h)h.innerHTML=sharedHeader();
  const f=document.getElementById('siteFooter');if(f)f.innerHTML=sharedFooter();
  initSharedInteractions();
});

document.addEventListener('click',event=>{
  const menu=document.getElementById('mobileMenu');
  const mobileBtn=document.querySelector('.mobile-toggle');
  if(menu&&menu.classList.contains('open')&&!event.target.closest('.mobile-menu')&&!event.target.closest('.mobile-toggle')){
    menu.classList.remove('open');
    if(mobileBtn){mobileBtn.setAttribute('aria-expanded','false');mobileBtn.setAttribute('aria-label','Menu openen');}
  }
});

function initSharedInteractions(){
  const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const header=document.querySelector('.site-header');
  const btn=document.createElement('button');
  btn.type='button';btn.className='site-backtop';btn.setAttribute('aria-label','Terug naar boven');btn.textContent='↑';
  document.body.appendChild(btn);
  const sync=()=>{
    if(header)header.classList.toggle('has-shadow',window.scrollY>12);
    btn.classList.toggle('show',window.scrollY>700);
  };
  window.addEventListener('scroll',sync,{passive:true});sync();
  btn.addEventListener('click',()=>window.scrollTo({top:0,behavior:reduced?'auto':'smooth'}));

  const desktopTriggers=[...document.querySelectorAll('[data-nav-trigger]')];
  let activeDesktopTrigger=null;
  const closeDesktopMenus=(restoreFocus=false)=>{
    const previous=activeDesktopTrigger;
    desktopTriggers.forEach(trigger=>{
      trigger.setAttribute('aria-expanded','false');
      const panel=document.querySelector('[data-nav-panel="'+trigger.dataset.navTrigger+'"]');
      if(panel)panel.hidden=true;
    });
    activeDesktopTrigger=null;
    if(restoreFocus&&previous)previous.focus();
  };
  const openDesktopMenu=trigger=>{
    const same=activeDesktopTrigger===trigger&&trigger.getAttribute('aria-expanded')==='true';
    closeDesktopMenus(false);
    if(same)return;
    const panel=document.querySelector('[data-nav-panel="'+trigger.dataset.navTrigger+'"]');
    if(!panel)return;
    trigger.setAttribute('aria-expanded','true');
    panel.hidden=false;
    activeDesktopTrigger=trigger;
  };
  desktopTriggers.forEach(trigger=>trigger.addEventListener('click',event=>{
    event.stopPropagation();
    openDesktopMenu(trigger);
  }));
  document.querySelectorAll('[data-nav-panel]').forEach(panel=>panel.addEventListener('click',event=>event.stopPropagation()));

  const menu=document.getElementById('mobileMenu');
  if(menu)menu.addEventListener('click',event=>{
    const link=event.target.closest('a');
    if(link){
      menu.classList.remove('open');
      const trigger=document.querySelector('.mobile-toggle');
      if(trigger){trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-label','Menu openen');}
    }
  });

  document.addEventListener('click',event=>{
    if(activeDesktopTrigger&&!event.target.closest('.nav-menu-root'))closeDesktopMenus(false);
    if(menu&&menu.classList.contains('open')&&!event.target.closest('.mobile-menu')&&!event.target.closest('.mobile-toggle')){
      menu.classList.remove('open');
      const mobileBtn=document.querySelector('.mobile-toggle');
      if(mobileBtn){mobileBtn.setAttribute('aria-expanded','false');mobileBtn.setAttribute('aria-label','Menu openen');}
    }
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    if(activeDesktopTrigger){closeDesktopMenus(true);return;}
    if(!menu||!menu.classList.contains('open'))return;
    menu.classList.remove('open');
    const trigger=document.querySelector('.mobile-toggle');
    if(trigger){trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-label','Menu openen');trigger.focus();}
  });
  window.matchMedia('(max-width:1100px)').addEventListener?.('change',event=>{
    if(event.matches)closeDesktopMenus(false);
  });
}

