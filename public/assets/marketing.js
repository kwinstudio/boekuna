function toggleMenu(){document.getElementById('mobileMenu')?.classList.toggle('open')}
function sharedHeader(active=''){
  return `
  <div class="promo">Launchfase · Kwinest wordt voorbereid voor publieke accounts. Bekijk wat nu al werkt en wat nog in ontwikkeling is.</div>
  <header class="site-header"><nav class="nav">
    <a class="logo" href="/"><span class="logo-mark">K</span><span>Kwinest</span></a>
    <div class="nav-links">
      <div class="dropdown"><button class="nav-item">Product ▾</button><div class="dropdown-menu">
        <a href="/functies/"><strong>Alle functies</strong><span>Overzicht van de complete boekhoudomgeving.</span></a>
        <a href="/scanner/"><strong>Slimme scanner</strong><span>PDF's, scans en bonfoto's uitlezen.</span></a>
        <a href="/facturen/"><strong>Facturen</strong><span>Verkoopfacturen, creditnota's en betalingen.</span></a>
        <a href="/btw-bank/"><strong>Btw & bank</strong><span>Btw-overzicht, CSV-import en matching.</span></a>
        <a href="/rapportages/"><strong>Rapportages</strong><span>Omzet, kosten, resultaat en controle.</span></a>
      </div></div>
      <div class="dropdown"><button class="nav-item">Kwinest ▾</button><div class="dropdown-menu">
        <a href="/hoe-het-werkt/"><strong>Zo werkt het</strong><span>Van document naar gecontroleerde boeking.</span></a>
        <a href="/veiligheid/"><strong>Veiligheid & privacy</strong><span>Hoe we omgaan met data en controles.</span></a>
        <a href="/over/"><strong>Over Kwinest</strong><span>Waarom dit product wordt gebouwd.</span></a>
        <a href="/faq/"><strong>Veelgestelde vragen</strong><span>Antwoorden vóór je begint.</span></a>
      </div></div>
      <a class="nav-link" href="/prijzen/">Prijzen</a>
    </div>
    <div class="nav-actions"><a class="btn" href="/prijzen/">Prijzen</a><a class="btn primary" href="/?login=1">Inloggen</a><button class="mobile-toggle" onclick="toggleMenu()" aria-label="Menu">☰</button></div>
  </nav>
  <div class="mobile-menu" id="mobileMenu">
    <details><summary>Product</summary><div class="mobile-sub"><a href="/functies/">Alle functies</a><a href="/scanner/">Slimme scanner</a><a href="/facturen/">Facturen</a><a href="/btw-bank/">Btw & bank</a><a href="/rapportages/">Rapportages</a></div></details>
    <details><summary>Kwinest</summary><div class="mobile-sub"><a href="/hoe-het-werkt/">Zo werkt het</a><a href="/veiligheid/">Veiligheid & privacy</a><a href="/over/">Over Kwinest</a><a href="/faq/">FAQ</a></div></details>
    <a href="/prijzen/">Prijzen</a><a href="/?login=1">Inloggen</a>
  </div></header>`;
}
function sharedFooter(){
  return `<footer class="footer"><div class="footer-inner">
    <div class="footer-brand"><a class="logo" href="/"><span class="logo-mark">K</span><span>Kwinest</span></a><p>Een rustige boekhoudomgeving voor Nederlandse ondernemers, met slimme documentherkenning en controle vóór het boeken.</p></div>
    <div><h4>Product</h4><a href="/functies/">Functies</a><a href="/scanner/">Scanner</a><a href="/facturen/">Facturen</a><a href="/btw-bank/">Btw & bank</a><a href="/rapportages/">Rapportages</a></div>
    <div><h4>Meer over Kwinest</h4><a href="/hoe-het-werkt/">Zo werkt het</a><a href="/veiligheid/">Veiligheid & privacy</a><a href="/over/">Over Kwinest</a><a href="/faq/">FAQ</a></div>
    <div><h4>Start</h4><a href="/prijzen/">Prijzen</a><a href="/?login=1">Inloggen</a><a href="/veiligheid/">Productiestatus</a></div>
  </div><div class="footer-bottom">Kwinest · Boekhoudsoftware in actieve ontwikkeling. Functionaliteit en prijzen kunnen vóór publieke lancering nog wijzigen.</div></footer>`;
}
document.addEventListener('DOMContentLoaded',()=>{const h=document.getElementById('siteHeader');if(h)h.innerHTML=sharedHeader(document.body.dataset.page||'');const f=document.getElementById('siteFooter');if(f)f.innerHTML=sharedFooter()});
document.addEventListener('click',e=>{const m=document.getElementById('mobileMenu');if(m&&m.classList.contains('open')&&!e.target.closest('.mobile-menu')&&!e.target.closest('.mobile-toggle'))m.classList.remove('open')});
