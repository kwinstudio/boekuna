function toggleMenu(){document.getElementById('mobileMenu')?.classList.toggle('open')}
function sharedHeader(active=''){
  return `
  <div class="promo">Kwinest helpt ondernemers facturen, documenten, btw en inzicht bij elkaar te houden.</div>
  <header class="site-header"><nav class="nav">
    <a class="logo" href="/"><span class="logo-mark">K</span><span>Kwinest</span></a>
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
        <a href="/voor-ondernemers/#veel-documenten"><strong>Veel facturen & bonnen</strong><span>Sneller verwerken en controleren.</span></a>
      </div></div>
      <a class="nav-link" href="/prijzen/">Prijzen</a>
      <div class="dropdown"><button class="nav-item">Resources ▾</button><div class="dropdown-menu">
        <a href="/hoe-het-werkt/"><strong>Product tour</strong><span>Van document naar gecontroleerde boeking.</span></a>
        <a href="/faq/"><strong>Veelgestelde vragen</strong><span>Antwoorden vóór je begint.</span></a>
        <a href="/veiligheid/"><strong>Veiligheid & privacy</strong><span>Productstatus en gegevensbescherming.</span></a>
        <a href="/over/"><strong>Over Kwinest</strong><span>Waarom dit product wordt gebouwd.</span></a>
      </div></div>
    </div>
    <div class="nav-actions"><a class="btn" href="/hoe-het-werkt/">Bekijk software</a><a class="btn primary" href="/?login=1">Inloggen</a><button class="mobile-toggle" onclick="toggleMenu()" aria-label="Menu">☰</button></div>
  </nav>
  <div class="mobile-menu" id="mobileMenu">
    <details><summary>Oplossingen</summary><div class="mobile-sub"><a href="/functies/">Alle oplossingen</a><a href="/scanner/">Slimme scanner</a><a href="/facturen/">Facturen</a><a href="/btw-bank/">Btw & bank</a><a href="/rapportages/">Rapportages</a></div></details>
    <details><summary>Voor ondernemers</summary><div class="mobile-sub"><a href="/voor-ondernemers/#zzp">ZZP & freelance</a><a href="/voor-ondernemers/#klein-bedrijf">Kleine bedrijven</a><a href="/voor-ondernemers/#veel-documenten">Veel facturen & bonnen</a></div></details>
    <a href="/prijzen/">Prijzen</a>
    <details><summary>Resources</summary><div class="mobile-sub"><a href="/hoe-het-werkt/">Product tour</a><a href="/faq/">FAQ</a><a href="/veiligheid/">Veiligheid & privacy</a><a href="/over/">Over Kwinest</a></div></details>
    <a href="/?login=1">Inloggen</a>
  </div></header>`;
}
function sharedFooter(){
  return `<footer class="footer"><div class="footer-inner">
    <div class="footer-brand"><a class="logo" href="/"><span class="logo-mark">K</span><span>Kwinest</span></a><p>Boekhoudsoftware voor ondernemers die minder willen overtypen, sneller willen controleren en meer grip willen op hun administratie.</p></div>
    <div><h4>Oplossingen</h4><a href="/functies/">Alle oplossingen</a><a href="/scanner/">Scanner</a><a href="/facturen/">Facturen</a><a href="/btw-bank/">Btw & bank</a><a href="/rapportages/">Rapportages</a></div>
    <div><h4>Voor ondernemers</h4><a href="/voor-ondernemers/#zzp">ZZP & freelance</a><a href="/voor-ondernemers/#klein-bedrijf">Kleine bedrijven</a><a href="/voor-ondernemers/#veel-documenten">Veel documenten</a><a href="/prijzen/">Prijzen</a></div>
    <div><h4>Resources</h4><a href="/hoe-het-werkt/">Product tour</a><a href="/faq/">FAQ</a><a href="/veiligheid/">Veiligheid & privacy</a><a href="/over/">Over Kwinest</a></div>
  </div><div class="footer-bottom">Kwinest · Boekhoudsoftware in actieve ontwikkeling. Functionaliteit en prijzen kunnen vóór publieke lancering nog wijzigen.</div></footer>`;
}
document.addEventListener('DOMContentLoaded',()=>{const h=document.getElementById('siteHeader');if(h)h.innerHTML=sharedHeader(document.body.dataset.page||'');const f=document.getElementById('siteFooter');if(f)f.innerHTML=sharedFooter()});
document.addEventListener('click',e=>{const m=document.getElementById('mobileMenu');if(m&&m.classList.contains('open')&&!e.target.closest('.mobile-menu')&&!e.target.closest('.mobile-toggle'))m.classList.remove('open')});
