const BOOKUNA_ICON="data:image/png;base64,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";

function ensureBookunaFavicon(){
  document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]').forEach(el=>el.remove());
  const icon=document.createElement('link');
  icon.rel='icon'; icon.type='image/png'; icon.href=BOOKUNA_ICON; icon.dataset.bookunaFavicon='1';
  document.head.appendChild(icon);
  const shortcut=document.createElement('link');
  shortcut.rel='shortcut icon'; shortcut.type='image/png'; shortcut.href=BOOKUNA_ICON;
  document.head.appendChild(shortcut);
  const apple=document.createElement('link');
  apple.rel='apple-touch-icon'; apple.href=BOOKUNA_ICON;
  document.head.appendChild(apple);
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
    <div class="nav-actions"><a class="btn" href="/hoe-het-werkt/">Bekijk software</a><a class="btn primary" href="/?login=1">Inloggen</a><button class="mobile-toggle" onclick="toggleMenu()" aria-label="Menu" aria-expanded="false" aria-controls="mobileMenu">☰</button></div>
  </nav>
  <div class="mobile-menu" id="mobileMenu">
    <details><summary>Oplossingen</summary><div class="mobile-sub"><a href="/functies/">Alle oplossingen</a><a href="/scanner/">Slimme scanner</a><a href="/facturen/">Facturen</a><a href="/btw-bank/">Btw & bank</a><a href="/rapportages/">Rapportages</a></div></details>
    <details><summary>Voor ondernemers</summary><div class="mobile-sub"><a href="/voor-ondernemers/#zzp">ZZP & freelance</a><a href="/voor-ondernemers/#klein-bedrijf">Kleine bedrijven</a><a href="/voor-ondernemers/#veel-documenten">Groeiende administratie</a></div></details>
    <a href="/prijzen/">Prijzen</a>
    <details><summary>Resources</summary><div class="mobile-sub"><a href="/hoe-het-werkt/">Product tour</a><a href="/faq/">FAQ</a><a href="/veiligheid/">Veiligheid & privacy</a><a href="/over/">Over Boekuna</a></div></details>
    <a href="/?login=1">Inloggen</a>
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
 const faqItems=[...document.querySelectorAll('.mk-faq-item')];
 faqItems.forEach(item=>{
   const toggle=item.querySelector('.mk-faq-toggle'),answer=item.querySelector('.mk-faq-answer');
   if(!toggle||!answer)return;
   const setOpen=open=>{item.classList.toggle('open',open);toggle.setAttribute('aria-expanded',String(open));answer.setAttribute('aria-hidden',String(!open))};
   setOpen(item.classList.contains('open'));
   toggle.addEventListener('click',()=>{
     const willOpen=toggle.getAttribute('aria-expanded')!=='true';
     faqItems.forEach(other=>{const b=other.querySelector('.mk-faq-toggle'),a=other.querySelector('.mk-faq-answer');if(b&&a){other.classList.remove('open');b.setAttribute('aria-expanded','false');a.setAttribute('aria-hidden','true')}});
     setOpen(willOpen);
   });
 });
 if(faqItems.length)document.documentElement.classList.add('faq-enhanced');
 const menu=document.getElementById('mobileMenu');
 if(menu)menu.addEventListener('click',e=>{
   const a=e.target.closest('a');
   if(a){menu.classList.remove('open');const t=document.querySelector('.mobile-toggle');if(t)t.setAttribute('aria-expanded','false')}
 });
}
