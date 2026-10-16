import {render,REGISTER,LOGIN,ORGANIZATION,SITE,icon,COMPANY} from '../layout.mjs';
import {pricingCards,softwareLd} from '../pricing.mjs';
import {DOCUMENT_LIMITS} from '../../../supabase/functions/_shared/pricing.mjs';

// The FAQ lives on /faq/; these answers are shared with that page.
export const HOME_FAQ=[
  ["Is Boekuna geschikt voor zzp'ers?","Ja. Boekuna is gemaakt voor zzp'ers, eenmanszaken en kleine ondernemers in Nederland die zelf hun administratie bijhouden. Je maakt facturen, legt kosten en bonnetjes vast en ziet per kwartaal je btw. Boekuna is bedoeld voor zakelijk gebruik."],
  ['Kan ik gratis beginnen?','Ja. Met Start maak je gratis facturen en houd je je klanten en betalingen bij, zonder betaalkaart. Wil je ook je kosten, bonnetjes, btw-overzicht en bank in Boekuna? Dan kies je ZZP voor € 9,95 per maand of € 99,50 per jaar, inclusief btw.'],
  ['Heb ik boekhoudkennis nodig?','Nee. Boekuna gebruikt woorden als inkomsten, kosten en bonnetjes in plaats van boekhoudtermen, en laat zien wat er nog moet gebeuren. Je blijft wel zelf verantwoordelijk voor een juiste administratie en je aangifte.'],
  ['Hoe werkt het scannen van bonnetjes?','Je maakt een foto of uploadt een PDF. Boekuna leest de leverancier, datum, bedragen en btw uit en zet die naast de bon. Jij controleert in twee korte stappen en slaat op. Herkenning kan fouten maken bij een vage foto of een ongewone bon, daarom wordt niets opgeslagen zonder jouw controle.'],
  ['Kan ik facturen maken?',"Ja. Je kiest een klant, zet je diensten erop en deelt de PDF vanuit je eigen e-mail. Boekuna zet de verplichte gegevens erop, maakt creditfacturen en laat zien welke facturen nog openstaan. Offertes en terugkerende facturen zitten nog niet in Boekuna."],
  ['Kan ik mijn gegevens exporteren?','Ja. Je downloadt in Instellingen een volledige back-up, exporteert facturen en kosten als CSV en downloadt je originele bonnen en documenten. Je administratie blijft van jou.'],
  ['Kan ik Boekuna op mijn telefoon gebruiken?','Ja. Boekuna werkt in de browser op je telefoon, tablet en computer, met dezelfde gegevens. Op je telefoon maak je met de camera direct een foto van een bon. Er is nog geen app in de App Store of Play Store.'],
  ['Hoe veilig zijn mijn gegevens?','Je administratie en documenten staan op servers in Frankfurt, in de EU. Elk account is in de database afgeschermd en documenten staan in privé-opslag. Je kunt tweestapsverificatie aanzetten. Boekuna gebruikt geen tracking- of advertentiecookies. <a href="/veiligheid/">Lees meer over veiligheid</a>.'],
  ['Kan ik mijn abonnement opzeggen?','Ja, zelf in de app via Abonnement. Je houdt toegang tot het einde van de betaalde maand of het betaalde jaar; een lopende periode wordt niet terugbetaald. Je gegevens blijven daarna bewaard en je kunt alles exporteren.']
];

// Homepage in the studio style Kwin picked on 2026-10-16: one big idea per block, white and
// warm-grey surfaces, black cards, Boekuna green as the only accent. Sizes are in rem so the
// page scales with the viewport (html.studio in site.css). Every number on it is a fact.
const pill=(label,href,kind='green',arrowIcon='arrow',extra='')=>`<a class="pill pill-${kind}${arrowIcon?' pill-arrow':''}" href="${href}"${extra}><span>${label}${arrowIcon?`<span class="pill-badge">${icon(arrowIcon)}</span>`:''}</span></a>`;

const slides=[
  ['Bonnetjes','Foto. Check. Klaar.'],
  ['Btw','Klaar om over te nemen.'],
  ['Facturen','Verstuurd in een paar tikken.']
];
const hints=['Nederlands','Opslag in de EU','Geen tracking','Alles exporteren','Tweestapsverificatie','Telefoon en computer'];

const audience=[
  ['Freelancers — Creatief','Ontwerpers en fotografen','Je factureert per project of per uur en wilt dat het er netjes uitziet.',['Facturen','Diensten','Btw']],
  ['Winkels — Horeca','Winkels en horeca-starters','Veel kleine bonnetjes en leveranciers. Foto maken, controleren, klaar.',['Bonnetjes','Kosten','Bank']],
  ['Vakmensen — Diensten','Klussers, kappers en coaches','Je bent liever met je vak bezig dan met papier. Dat mag.',['Facturen','Ritten','Overzicht']],
  ['Starters — Nieuw','Net ingeschreven bij de KVK','Begin gratis met facturen en groei door naar je hele boekhouding.',['Gratis start','Facturen']]
];

const rows=[
  ['/facturen/','Facturen maken','Klant kiezen, diensten erop, versturen. Boekuna houdt bij wat nog openstaat.'],
  ['/bonnen/','Bonnetjes en kosten','Foto maken, Boekuna vult de bedragen in. Jij controleert, de bon blijft 7 jaar bewaard.'],
  ['/btw/','Btw-overzicht','De bedragen per rubriek, klaar om over te nemen in je aangifte bij de Belastingdienst.'],
  ['/bank/','Bankimport','Bankbestand inlezen. Boekuna koppelt de betalingen aan je facturen en kosten.']
];

const stats=[
  ['€ ',0,'','om te beginnen, zonder betaalkaart'],
  ['',7,' jaar','bewaarplicht, en je bonnen staan veilig in één archief'],
  ['',DOCUMENT_LIMITS.zzp,'','slimme scans per maand met ZZP, met Pro zonder limiet'],
  ['',0,'','tracking- of advertentiecookies op de site en in de app']
];

const words=(text,cls='')=>text.split(' ').map(w=>`<span class="w${cls}">${w}</span>`).join(' ');

export default function home(){
  const loader=`<div class="loader" data-loader aria-hidden="true"><div class="loader-center"><p class="loader-brand">Boekuna<span>.</span></p><p class="loader-tag">Boekhouden zonder boekhoudtaal.</p></div><div class="loader-progress"><div class="loader-track"><div class="loader-fill" data-loader-fill></div></div><div class="loader-row"><span>Laden</span><span class="loader-num" data-loader-num>000</span></div></div></div>
`;
  const body=`
<section class="s-hero" id="home" aria-labelledby="hero-titel">
 <div class="s-hero-media" data-liquid>
  <img class="s-hero-base" src="/assets/site/foto-ondernemer.webp" width="1100" height="880" alt="Een lachende ondernemer staat met de armen over elkaar in haar eigen zaak" fetchpriority="high" decoding="async">
 </div>
 <div class="s-hero-veil" aria-hidden="true"></div>
 <div class="s-hero-mark rv" style="--d:300ms" aria-hidden="true"></div>
 <div class="s-shell s-hero-grid">
  <div class="s-hero-copy">
   <p class="s-eyebrow rv" style="--d:200ms">Online boekhoudprogramma voor zzp'ers</p>
   <h1 id="hero-titel" class="lines" data-delay="250" data-stagger="120"><span class="ln"><span>Boekhouden </span></span><span class="ln"><span>zonder </span></span><span class="ln"><span>boekhoudtaal.</span></span></h1>
   <p class="s-assure rv" style="--d:650ms">${icon('check')}Gratis beginnen, geen betaalkaart nodig</p>
   <div class="s-ctas rv" style="--d:750ms">${pill('Begin gratis',REGISTER)}${pill('Bekijk functies','#functies','outline','')}</div>
  </div>
  <div class="s-hero-side">
   <div class="s-hcard rv" style="--d:400ms;--from:translateY(16px) scale(.96)" data-slides>
    <div class="s-hcard-tile" aria-hidden="true"><b>B<span>.</span></b></div>
    <div class="s-hcard-panel">
     <div class="s-hcard-slot" aria-live="polite">${slides.map(([c,t],i)=>`<div class="s-hcard-item"${i?' hidden':''}><p class="s-hcard-cap">${c}</p><p class="s-hcard-title">${t}</p></div>`).join('')}</div>
     <div class="s-hcard-bottom"><div class="s-dots" aria-hidden="true">${slides.map((_,i)=>`<i${i?'':' class="on"'}></i>`).join('')}</div><div class="s-hcard-nav"><button type="button" data-slide="-1" aria-label="Vorige">${icon('arrow','icon flip')}</button><button type="button" data-slide="1" aria-label="Volgende">${icon('arrow')}</button></div></div>
    </div>
   </div>
   <div class="s-hints rv" style="--d:550ms"><p>Goed om te weten</p><ul>${hints.map(h=>`<li>${icon('dot')}${h}</li>`).join('')}</ul></div>
  </div>
 </div>
 <div class="s-shell"><div class="s-status rv" style="--d:900ms;--from:none"><span>Gemaakt in Nederland</span><span class="s-status-mid">Foto ter illustratie, geen klant van Boekuna</span><span class="s-status-end">Scroll verder ↓</span></div></div>
</section>

<section class="s-about" id="waarom" aria-labelledby="waarom-titel">
 <div class="s-shell s-about-grid">
  <div class="s-about-left">
   <span class="s-about-big" aria-hidden="true"><b>B<span>.</span></b></span>
   <p class="s-eyebrow">Waarom Boekuna</p>
   <p class="s-about-note rv">${icon('building')}<span>Een Nederlands product van ${COMPANY.name}, ${COMPANY.city}.</span></p>
  </div>
  <div class="s-about-right">
   <h2 id="waarom-titel" class="words">${words('Je begon voor de vrijheid, niet voor de administratie.')} ${words('Boekuna doet het rekenwerk en zegt in gewone woorden wat er nog moet gebeuren.',' mu')}</h2>
   <div class="s-about-foot rv" style="--d:200ms"><div><p class="s-label">Vragen? Mail ons</p><a class="s-mail" href="mailto:${COMPANY.email}">${COMPANY.email}</a></div>${pill('Over Boekuna','/over-ons/','outline')}</div>
  </div>
 </div>
</section>

<section class="s-band" aria-label="Foto, check, klaar">
 <ul class="s-shell">
  <li class="rv" style="--from:translateY(28px);--d:0ms"><span class="s-band-t light">Foto</span></li>
  <li class="rv" style="--from:translateY(28px);--d:120ms"><span class="s-band-t accent">Check</span></li>
  <li class="rv" style="--from:translateY(28px);--d:240ms"><span class="s-band-t dark">${icon('arrow')}<span class="sr-only">en dan</span></span></li>
  <li class="rv" style="--from:translateY(28px);--d:360ms"><span class="s-band-t ghost">Klaar</span></li>
 </ul>
</section>

<section class="s-works" id="voor-wie" aria-labelledby="wie-titel">
 <div class="s-shell">
  <p class="s-eyebrow s-eyebrow-pill rv">Voor wie</p>
  <h2 id="wie-titel" class="s-h2 lines" data-delay="120"><span class="ln"><span>Gemaakt voor jou</span></span></h2>
  <ul class="s-cards">${audience.map(([meta,title,text,tags],i)=>`<li class="rv" style="--from:translateY(48px);--d:${i*90}ms"><a class="s-card" href="/zzp/"><span class="s-card-meta"><span>${meta}</span><span class="s-card-badge">${icon('arrow-ur')}</span></span><span class="s-card-mark" aria-hidden="true"><b>B<span>.</span></b></span><span class="s-card-body"><span class="s-card-title">${title}</span><span class="s-card-text">${text}</span><span class="s-tags">${tags.map(t=>`<span>${t}</span>`).join('')}</span></span></a></li>`).join('')}</ul>
 </div>
</section>

<section class="s-rows" id="functies" aria-labelledby="functies-titel">
 <div class="s-shell">
  <p class="s-eyebrow rv">Functies</p>
  <h2 id="functies-titel" class="s-h2 lines" data-delay="120"><span class="ln"><span>Wat Boekuna </span></span><span class="ln"><span>voor je doet</span></span></h2>
  <ul>${rows.map(([href,title,text],i)=>`<li class="rv" style="--from:translateY(24px);--d:${i*80}ms"><a href="${href}"><span class="s-row-ix">0${i+1}</span><span class="s-row-title">${title}</span><span class="s-row-text">${text}</span><span class="s-row-badge">${icon('arrow-ur')}</span></a></li>`).join('')}</ul>
  <p class="s-more rv"><a href="/functies/">Bekijk alle functies ${icon('arrow')}</a></p>
 </div>
</section>

<section class="s-stats" id="cijfers" aria-labelledby="cijfers-titel">
 <div class="s-shell">
  <div class="s-stats-panel rv" style="--from:translateY(40px) scale(.99)">
   <p class="s-eyebrow light">In cijfers</p>
   <h2 id="cijfers-titel" class="lines" data-delay="120"><span class="ln"><span>Geen beloftes. Gewoon feiten.</span></span></h2>
   <ul class="s-stats-grid">${stats.map(([pre,n,post,label],i)=>`<li class="rv" style="--from:translateY(20px);--d:${i*90}ms"><p class="s-stat">${pre?`<em>${pre.trim()}</em> `:''}<span data-count="${n}">${n}</span>${post}</p><p class="s-stat-label">${label}</p></li>`).join('')}</ul>
  </div>
 </div>
</section>

<section class="s-prices pricing-section" id="tarieven" aria-labelledby="prijzen-titel">
 <div class="s-shell">
  <p class="s-eyebrow rv">Prijzen</p>
  <h2 id="prijzen-titel" class="s-h2 lines" data-delay="120"><span class="ln"><span>Eenvoudige prijzen.</span></span></h2>
  <p class="s-lead rv">Gratis factureren, of je hele boekhouding voor een vast bedrag.</p>
  ${pricingCards()}
  <p class="s-more"><a href="/prijzen/">Pakketten vergelijken ${icon('arrow')}</a></p>
 </div>
</section>`;
  return render({
    path:'/',
    studio:true,
    before:loader,
    title:"Boekuna — Online boekhoudprogramma voor zzp'ers | Gratis beginnen",
    ogTitle:'Boekuna — Boekhouden zonder boekhoudtaal',
    description:"Boekuna is het eenvoudige boekhoudprogramma voor zzp'ers en kleine ondernemers. Facturen maken, bonnetjes scannen, btw-overzicht per kwartaal. Start gratis.",
    preloadImage:'<link rel="preload" as="image" href="/assets/site/foto-ondernemer.webp" fetchpriority="high">\n',
    ld:[ORGANIZATION,{"@type":"WebSite","@id":SITE+"/#website","url":SITE+"/","name":"Boekuna","inLanguage":"nl-NL","publisher":{"@id":SITE+"/#org"}},softwareLd()],
    body
  });
}
