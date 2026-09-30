const BOOKUNA_ICON="/assets/boekuna-symbol.svg";

function ensureBookunaFavicon(){
  document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]').forEach(el=>el.remove());
  const icon=document.createElement('link');
  icon.rel='icon'; icon.type='image/svg+xml'; icon.href='/assets/boekuna-favicon.svg'; icon.dataset.bookunaFavicon='1';
  document.head.appendChild(icon);
  const shortcut=document.createElement('link');
  shortcut.rel='shortcut icon'; shortcut.href='/assets/favicon-32.png';
  document.head.appendChild(shortcut);
  const apple=document.createElement('link');
  apple.rel='apple-touch-icon'; apple.sizes='180x180'; apple.href='/assets/boekuna-app-icon-180.png';
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
 if(btn)btn.setAttribute('aria-expanded',String(open));
}
function sharedHeader(active=''){
  return `
  <div class="promo">Boekuna helpt ondernemers facturen, documenten, btw en inzicht bij elkaar te houden.</div>
  <header class="site-header"><nav class="nav">
    <a class="logo" href="/"><img class="logo-icon" src="${BOOKUNA_ICON}" alt="" aria-hidden="true"><span>Boekuna</span></a>
    <div class="nav-links">
      <div class="dropdown"><button class="nav-item">Oplossingen ▾</button><div class="dropdown-menu">
        <a href="/functies/"><strong>Alle oplossingen</strong><span>Bekijk de complete boekhoudomgeving.</span></a>
        <a href="/scanner/"><strong>Slimme scanner</strong><span>PDF's, scans en bonfoto's uitlezen.</span></a>
        <a href="/facturen/"><strong>Facturen</strong><span>Facturen, creditnota's en betalingen.</span></a>
        <a href="/btw-bank/"><strong>Btw & bank</strong><span>Btw-overzicht, CSV-import en matching.</span></a>
        <a href="/rapportages/"><strong>Rapportages</strong><span>Omzet, kosten, resultaat en controle.</span></a>
      </div></div>
      <div class="dropdown"><button class="nav-item">Voor ondernemers ▾</button><div class="dropdown-menu">
        <a href="/voor-ondernemers/#zzp"><strong>ZZP & freelance</strong><span>Minder administratie naast je echte werk.</span></a>
        <a href="/voor-ondernemers/#klein-bedrijf"><strong>Kleine bedrijven</strong><span>Meer documenten, één administratie.</span></a>
        <a href="/voor-ondernemers/#veel-documenten"><strong>Groeiende administratie</strong><span>Meer overzicht en controle naarmate je bedrijf groeit.</span></a>
      </div></div>
      <a class="nav-link" href="/prijzen/">Prijzen</a>
      <div class="dropdown"><button class="nav-item">Resources ▾</button><div class="dropdown-menu">
        <a href="/hoe-het-werkt/"><strong>Product tour</strong><span>Van document naar gecontroleerde boeking.</span></a>
        <a href="/faq/"><strong>Veelgestelde vragen</strong><span>Antwoorden vóór je begint.</span></a>
        <a href="/veiligheid/"><strong>Veiligheid & privacy</strong><span>Productstatus en gegevensbescherming.</span></a>
        <a href="/over/"><strong>Over Boekuna</strong><span>Waarom dit product wordt gebouwd.</span></a>
      </div></div>
    </div>
    <div class="nav-actions"><a class="btn" href="/hoe-het-werkt/">Bekijk software</a><a class="btn primary" href="https://app.boekuna.nl/?login=1">Inloggen</a><button class="mobile-toggle" onclick="toggleMenu()" aria-label="Menu" aria-expanded="false" aria-controls="mobileMenu">☰</button></div>
  </nav>
  <div class="mobile-menu" id="mobileMenu">
    <details><summary>Oplossingen</summary><div class="mobile-sub"><a href="/functies/">Alle oplossingen</a><a href="/scanner/">Slimme scanner</a><a href="/facturen/">Facturen</a><a href="/btw-bank/">Btw & bank</a><a href="/rapportages/">Rapportages</a></div></details>
    <details><summary>Voor ondernemers</summary><div class="mobile-sub"><a href="/voor-ondernemers/#zzp">ZZP & freelance</a><a href="/voor-ondernemers/#klein-bedrijf">Kleine bedrijven</a><a href="/voor-ondernemers/#veel-documenten">Groeiende administratie</a></div></details>
    <a href="/prijzen/">Prijzen</a>
    <details><summary>Resources</summary><div class="mobile-sub"><a href="/hoe-het-werkt/">Product tour</a><a href="/faq/">FAQ</a><a href="/veiligheid/">Veiligheid & privacy</a><a href="/over/">Over Boekuna</a></div></details>
    <a href="https://app.boekuna.nl/?login=1">Inloggen</a>
  </div></header>`;
}
function sharedFooter(){
  return `<footer class="footer footer-v2">
    <div class="footer-inner footer-grid">
      <div class="footer-brand">
        <a class="logo footer-logo" href="/"><img class="logo-icon" src="${BOOKUNA_ICON}" alt="" aria-hidden="true"><span>Boekuna</span></a>
        <p>Boekhoudsoftware voor ondernemers die minder willen overtypen, sneller willen controleren en meer grip willen op hun administratie.</p>
        <a class="footer-cta" href="/hoe-het-werkt/">Bekijk hoe Boekuna werkt →</a>
      </div>
      <nav class="footer-col" aria-label="Oplossingen">
        <h4>Oplossingen</h4>
        <a href="/functies/">Alle functies</a>
        <a href="/scanner/">Slimme scanner</a>
        <a href="/facturen/">Facturen</a>
        <a href="/btw-bank/">Btw & bank</a>
        <a href="/rapportages/">Rapportages</a>
      </nav>
      <nav class="footer-col" aria-label="Voor ondernemers">
        <h4>Voor ondernemers</h4>
        <a href="/voor-ondernemers/#zzp">ZZP & freelance</a>
        <a href="/voor-ondernemers/#klein-bedrijf">Kleine bedrijven</a>
        <a href="/voor-ondernemers/#veel-documenten">Groeiende administratie</a>
        <a href="/prijzen/">Prijzen</a>
      </nav>
      <nav class="footer-col" aria-label="Resources">
        <h4>Resources</h4>
        <a href="/hoe-het-werkt/">Product tour</a>
        <a href="/faq/">FAQ</a>
        <a href="/veiligheid/">Veiligheid & security</a>
        <a href="/privacy/">Privacybeleid</a>
        <a href="/voorwaarden/">Voorwaarden</a>
        <a href="/support/">Support</a>
        <a href="mailto:support@boekuna.nl">support@boekuna.nl</a>
        <a href="/account-verwijderen/">Account verwijderen</a>
        <a href="/contact/">Contact</a>
        <a href="/over/">Over Boekuna</a>
      </nav>
    </div>
    <div class="footer-bottom footer-bottom-v2">
      <span>© 2026 Boekuna</span>
      <span class="footer-status"><i aria-hidden="true"></i> Beveiligde cloudomgeving</span>
      <span><a href="/privacy/">Privacy</a> · <a href="/support/">Support</a> · <a href="mailto:support@boekuna.nl">support@boekuna.nl</a></span>
    </div>
  </footer>`;
}
document.addEventListener('DOMContentLoaded',()=>{ensureBookunaFavicon();const h=document.getElementById('siteHeader');if(h)h.innerHTML=sharedHeader(document.body.dataset.page||'');const f=document.getElementById('siteFooter');if(f)f.innerHTML=sharedFooter();initSharedInteractions()});
document.addEventListener('click',e=>{const m=document.getElementById('mobileMenu');if(m&&m.classList.contains('open')&&!e.target.closest('.mobile-menu')&&!e.target.closest('.mobile-toggle'))m.classList.remove('open')});

function initSharedInteractions(){
 const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const header=document.querySelector('.site-header');
 const btn=document.createElement('button');
 btn.type='button';btn.className='site-backtop';btn.setAttribute('aria-label','Terug naar boven');btn.textContent='↑';
 document.body.appendChild(btn);
 const sync=()=>{
  if(header)header.classList.toggle('has-shadow',window.scrollY>12);
  btn.classList.toggle('show',window.scrollY>650);
 };
 window.addEventListener('scroll',sync,{passive:true});sync();
 btn.addEventListener('click',()=>window.scrollTo({top:0,behavior:reduced?'auto':'smooth'}));
 const menu=document.getElementById('mobileMenu');
 if(menu)menu.addEventListener('click',e=>{
   const a=e.target.closest('a');
   if(a){menu.classList.remove('open');const t=document.querySelector('.mobile-toggle');if(t)t.setAttribute('aria-expanded','false')}
 });
}
