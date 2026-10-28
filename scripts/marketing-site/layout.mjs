import fs from 'node:fs';
// Shared layout for boekuna.nl: head, header, footer and the small building blocks every page uses.
// Pages are plain HTML strings; scripts/marketing-site/build.mjs writes them to public/.
import {ICON_SYMBOLS} from './icons.mjs';

export const SITE='https://boekuna.nl';
export const REGISTER='https://app.boekuna.nl/?register=1';
export const LOGIN='https://app.boekuna.nl/?login=1';
export const COMPANY={name:'Kwinest',street:'Arica 139',postal:'2903 PD',city:'Capelle aan den IJssel',kvk:'74542893',vat:'NL002477565B57',email:'support@boekuna.nl'};
export const SAMPLE_NOTE='Echt scherm uit de app, met voorbeeldgegevens van een fictief bedrijf.';

export const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export const icon=(id,cls='icon')=>`<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
export const arrow=icon('arrow');

// Feature pages, in the order the menu shows them.
export const FEATURES=[
  {href:'/facturen/',icon:'file',name:'Facturen maken',sub:'Nette facturen en betalingen volgen'},
  {href:'/bonnen/',icon:'receipt',name:'Bonnetjes en kosten',sub:'Al je uitgaven en bonnen op één plek'},
  {href:'/slim-scannen/',icon:'scan',name:'Slim scannen',sub:'Gegevens van je bon automatisch ingevuld'},
  {href:'/btw/',icon:'up',name:'Btw-overzicht',sub:'Per kwartaal, per rubriek'},
  {href:'/bank/',icon:'bank',name:'Bankimport',sub:'Bankbestand inlezen en koppelen'},
  {href:'/rapportages/',icon:'chart',name:'Rapportages',sub:'Omzet, kosten en winst per periode'}
];

export function btn(label,href,kind='primary',extra=''){
  return `<a class="btn btn-${kind}" href="${href}"${extra}>${label}${kind==='primary'||kind==='light'?' '+arrow:''}</a>`;
}
// What cannot go wrong, said right at the button (loss aversion). All three are true: see the FAQ.
export const REASSURE='Geen betaalkaart nodig · 14 dagen ZZP gratis · daarna vanzelf terug naar gratis Start';
export const startCta=(label='Begin gratis')=>btn(label,REGISTER,'primary');

// Real app screenshots. Desktop images come in 1440 and 720 wide, phone images in 780 and 390 wide.
// In-page desktop screenshots switch to the phone version of the same screen on small screens,
// where a scaled-down desktop is unreadable. Hidden lazy images are not downloaded.
const hasPhoneShot=name=>fs.existsSync(new URL(`../../public/assets/site/app-mobile-${name}-390.webp`,import.meta.url));
// Kwin 2026-10-16: no app screenshots anywhere on the website, so these render nothing.
const NO_SCREENSHOTS=true;
export function shotDesktop(name,alt,{eager=false,sizes='(min-width: 1100px) 640px, 92vw',bar=true,single=false}={}){
  if(NO_SCREENSHOTS)return '';
  const base=`/assets/site/app-desktop-${name}`;
  if(!single&&!eager&&hasPhoneShot(name))return `<div class="shot-switch">${shotDesktop(name,alt,{eager,sizes,bar,single:true})}${shotPhone(name,alt,{sizes:'62vw'})}</div>`;
  return `<figure class="shot shot-desktop">${bar?'<div class="shot-bar" aria-hidden="true"><span></span><span></span><span></span><em>app.boekuna.nl</em></div>':''}<img src="${base}-720.webp" srcset="${base}-720.webp 720w, ${base}.webp 1440w" sizes="${sizes}" width="1440" height="900" alt="${esc(alt)}" ${eager?'fetchpriority="high"':'loading="lazy"'} decoding="async"></figure>`;
}
export function shotPhone(name,alt,{eager=false,sizes='(min-width: 768px) 280px, 62vw'}={}){
  if(NO_SCREENSHOTS)return '';
  const base=`/assets/site/app-mobile-${name}`;
  return `<figure class="shot-phone"><img src="${base}-390.webp" srcset="${base}-390.webp 390w, ${base}.webp 780w" sizes="${sizes}" width="390" height="844" alt="${esc(alt)}" ${eager?'':'loading="lazy" '}decoding="async"></figure>`;
}
export function photo(file,alt,{w,h,cls='photo',eager=false}={}){
  return `<img class="${cls}" src="/assets/site/${file}" width="${w}" height="${h}" alt="${esc(alt)}" ${eager?'':'loading="lazy" '}decoding="async">`;
}
export const sampleNote=(text=SAMPLE_NOTE)=>NO_SCREENSHOTS?'':`<p class="sample-note">${icon('info')}<span>${text}</span></p>`;

export function sectionHead({eyebrow,title,lead,id,center=false,level=2}){
  return `<div class="section-head${center?' center':''}">${eyebrow?`<p class="eyebrow">${eyebrow}</p>`:''}<h${level}${id?` id="${id}"`:''}>${title}</h${level}>${lead?`<p class="lead">${lead}</p>`:''}</div>`;
}
export const checks=items=>`<ul class="checks">${items.map(i=>`<li>${icon('check')}<span>${i}</span></li>`).join('')}</ul>`;
export function faqList(items,{headingLevel=3}={}){
  return `<div class="faq">${items.map(([q,a])=>`<details><summary><span>${q}</span>${icon('chev','icon chev')}</summary><div class="faq-body">${a.startsWith('<')?a:`<p>${a}</p>`}</div></details>`).join('')}</div>`;
}
export function related(links){
  return `<section class="section related" aria-labelledby="lees-verder"><div class="shell"><p class="eyebrow">Lees verder</p><h2 class="h-small" id="lees-verder">Meer over Boekuna</h2><ul class="related-rows">${links.map((l,i)=>`<li><a href="${l.href}"><span class="s-row-ix">0${i+1}</span><span class="related-copy"><strong>${l.name}</strong><small>${l.sub}</small></span><span class="s-row-badge">${icon('arrow-ur')}</span></a></li>`).join('')}</ul></div></section>`;
}
export function limits(title,items){
  return `<aside class="limits" aria-label="${esc(title)}"><h3>${icon('info')}${title}</h3><ul>${items.map(i=>`<li>${i}</li>`).join('')}</ul></aside>`;
}
// Light hero (same as the homepage): soft pastel wash behind centred type, staggered entrance.
export const HERO_BG='<div class="s-flux-bg" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="s-flux-scrim" aria-hidden="true"></div>';
export const dotH1=h=>h.replace(/\.$/,'<span class="dot">.</span>');
const rise=(html,ms)=>html?html.replace(/^<(\w+)(\s+class=")?/,(m,tag,cls)=>cls?`<${tag} style="--rd:${ms}ms" class="rise `:`<${tag} class="rise" style="--rd:${ms}ms"`):'';
export function pageHero({crumbs,eyebrow,h1,lead,visual='',actions,note=''}){
  if(visual&&!/<img|<svg/.test(visual))visual='';
  return `<section class="page-hero${visual?' has-visual':''}">${HERO_BG}<div class="shell page-hero-grid"><div class="page-hero-copy">${rise(breadcrumbHtml(crumbs),0)}${eyebrow?`<p class="eyebrow rise" style="--rd:50ms">${eyebrow}</p>`:''}<h1 class="rise" style="--rd:90ms">${dotH1(h1)}</h1>${lead?`<p class="lead rise" style="--rd:140ms">${lead}</p>`:''}${actions===false?'':`<div class="actions rise" style="--rd:190ms">${actions||startCta()}</div>${actions?'':`<p class="cta-reassure rise" style="--rd:240ms">${REASSURE}</p>`}`}${note}</div>${visual?`<div class="page-hero-visual rise" style="--rd:240ms">${visual}</div>`:''}</div></section>`;
}
function breadcrumbHtml(crumbs){
  if(!crumbs||!crumbs.length)return '';
  return `<nav class="crumbs" aria-label="Kruimelpad"><ol><li><a href="/">Home</a></li>${crumbs.map((c,i)=>i===crumbs.length-1?`<li aria-current="page">${c.name}</li>`:`<li><a href="${c.href}">${c.name}</a></li>`).join('')}</ol></nav>`;
}

const BRAND=`<span class="brand-word">Boekuna<span class="brand-dot" aria-hidden="true">.</span></span>`;

// Hick's law (Kwin 2026-10-17): few menu choices; the rest lives in the footer.
function header({over=false}={}){
  return `<header class="site-header${over?' site-header--over':''}">
 <nav class="shell nav-shell" aria-label="Hoofdnavigatie">
  <a class="brand" href="/" aria-label="Boekuna, naar de homepagina">${BRAND}</a>
  <div class="desktop-links"><a href="/functies/">Functies</a><a href="/prijzen/">Prijzen</a><a href="/veiligheid/">Veiligheid</a></div>
  <div class="nav-actions">${over?'<p class="nav-clock" data-clock hidden><span>Lokale tijd</span><b data-clock-time></b><i aria-hidden="true">•</i><b data-clock-date></b></p>':''}<a class="nav-signin" href="${LOGIN}">Inloggen</a><a class="btn btn-primary btn-small nav-join" href="${REGISTER}">Begin gratis</a></div>
  <details class="mobile-nav"><summary aria-label="Menu openen">${icon('menu','icon open')}${icon('close','icon shut')}<span class="menu-word" aria-hidden="true"></span><span class="menu-word-shut" aria-hidden="true"></span></summary><div class="mobile-nav-panel"><nav class="mobile-nav-links" aria-label="Mobiele navigatie"><a href="/functies/">Functies</a><a href="/hoe-het-werkt/">Hoe het werkt</a><a href="/prijzen/">Prijzen</a><a href="/veiligheid/">Veiligheid en privacy</a><a href="/faq/">Veelgestelde vragen</a><a href="/support/">Contact en support</a><div class="mobile-nav-footer"><a class="btn btn-ghost" href="${LOGIN}">Inloggen</a><a class="btn btn-primary" href="${REGISTER}">Begin gratis ${arrow}</a></div></nav></div></details>
 </nav>
</header>`;
}

function footer(){
  return `<footer class="site-footer">
 <div class="shell footer-cta"><div><p class="footer-cta-title">Zo simpel kan het zijn.</p><p class="footer-cta-sub">Probeer ZZP 14 dagen gratis. Daarna ga je vanzelf naar gratis Start, dus je zit nergens aan vast.</p></div><a class="btn btn-primary" href="${REGISTER}">Begin gratis ${arrow}</a></div>
 <div class="shell footer-columns">
  <div class="footer-brand"><a class="brand" href="/" aria-label="Boekuna, naar de homepagina">${BRAND}</a><p>Online boekhoudprogramma voor zzp'ers en kleine ondernemers. Facturen, bonnetjes, kosten en btw op één plek, in gewone taal.</p></div>
  <nav aria-label="Product"><h2>Product</h2><a href="/functies/">Alle functies</a>${FEATURES.map(f=>`<a href="${f.href}">${f.name}</a>`).join('')}<a href="/prijzen/">Prijzen</a></nav>
  <nav aria-label="Boekuna"><h2>Boekuna</h2><a href="/hoe-het-werkt/">Hoe het werkt</a><a href="/zzp/">Voor zzp'ers</a><a href="/veiligheid/">Veiligheid en privacy</a><a href="/over-ons/">Over Boekuna</a><a href="/support/">Contact en support</a><a href="/faq/">Veelgestelde vragen</a><a href="/kennisbank/">Kennisbank</a></nav>
  <nav aria-label="Juridisch"><h2>Juridisch</h2><a href="/privacy/">Privacyverklaring</a><a href="/voorwaarden/">Algemene voorwaarden</a><a href="/account-verwijderen/">Account verwijderen</a><a href="${LOGIN}">Inloggen</a></nav>
 </div>
 <div class="shell footer-legal"><p>Boekuna is een product van ${COMPANY.name} · ${COMPANY.street}, ${COMPANY.postal} ${COMPANY.city} · KVK ${COMPANY.kvk} · Btw-id ${COMPANY.vat} · <a href="mailto:${COMPANY.email}">${COMPANY.email}</a></p><p>© 2026 ${COMPANY.name} · Boekuna is bedoeld voor ondernemers. Prijzen zijn inclusief btw.</p></div>
 <div class="footer-watermark" aria-hidden="true"></div>
</footer>`;
}

// Phone-only bar with the main button in thumb reach (site.js shows it after the hero).
// Not on legal and support pages, where people come to read or to leave.
const NO_STICKY=new Set(['/privacy/','/voorwaarden/','/account-verwijderen/','/support/','/404.html']);
const stickyCta=()=>`<div class="sticky-cta" data-sticky-cta hidden><p><b>14 dagen ZZP gratis</b>Geen betaalkaart nodig</p><a class="btn btn-primary" href="${REGISTER}">Begin gratis ${arrow}</a></div>
`;

export const ORGANIZATION={"@type":"Organization","@id":SITE+"/#org","name":COMPANY.name,"brand":{"@type":"Brand","name":"Boekuna"},"url":SITE+"/","logo":SITE+"/assets/boekuna-symbol.svg","email":COMPANY.email,"vatID":COMPANY.vat,"address":{"@type":"PostalAddress","streetAddress":COMPANY.street,"postalCode":COMPANY.postal,"addressLocality":COMPANY.city,"addressCountry":"NL"},"identifier":{"@type":"PropertyValue","propertyID":"KVK","value":COMPANY.kvk},"contactPoint":{"@type":"ContactPoint","contactType":"customer support","email":COMPANY.email,"availableLanguage":"nl"}};

export function breadcrumbLd(path,crumbs){
  return {"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":SITE+"/"},...crumbs.map((c,i)=>({"@type":"ListItem","position":i+2,"name":c.name.replace(/<[^>]+>/g,''),"item":SITE+(c.href||path)}))]};
}

// One full HTML document. `ld` is a list of schema.org nodes; `scripts` only for the support forms.
export function render({path,title,description,body,ld=[],robots='index,follow',ogTitle,ogType='website',inlineScript='',preloadImage='',studio=false,before=''}){
  const url=SITE+path;
  const graph=ld.length?`<script type="application/ld+json">${JSON.stringify({"@context":"https://schema.org","@graph":ld})}</script>\n`:'';
  return `<!doctype html>
<html lang="nl"${studio?' class="studio"':''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="${robots}">
<meta name="theme-color" content="#FFFFFF">
<meta name="color-scheme" content="light">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="${ogType}">
<meta property="og:locale" content="nl_NL">
<meta property="og:site_name" content="Boekuna">
<meta property="og:title" content="${esc(ogTitle||title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/site/og-boekuna.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Boekuna, online boekhouden voor zzp'ers">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" href="/assets/fonts/onest-var-latin.woff2" as="font" type="font/woff2" crossorigin>
${preloadImage}<link rel="icon" href="/assets/boekuna-favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="stylesheet" href="/assets/baseline.css">
<link rel="stylesheet" href="/assets/site/site.css">
<script src="/assets/site/site.js" defer></script>
${graph}</head>
<body>
<a class="skip-link" href="#inhoud">Ga naar inhoud</a>
<svg class="icon-library" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${ICON_SYMBOLS}</svg>
${before}${header({over:studio})}
<main id="inhoud">
${body}
</main>
${inlineScript}${NO_STICKY.has(path)?'':stickyCta()}${footer()}
</body>
</html>
`;
}
