import {render,REGISTER,LOGIN,ORGANIZATION,SITE,icon,COMPANY} from '../layout.mjs';
import {pricingCards,softwareLd} from '../pricing.mjs';
import {DOCUMENT_LIMITS} from '../../../supabase/functions/_shared/pricing.mjs';

// The FAQ lives on /faq/; these answers are shared with that page.
export const HOME_FAQ=[
  ["Is Boekuna geschikt voor zzp'ers?","Ja. Boekuna is gemaakt voor zzp'ers, eenmanszaken en kleine ondernemers in Nederland die zelf hun administratie bijhouden. Je maakt facturen, legt kosten en bonnetjes vast en ziet per kwartaal je btw. Boekuna is bedoeld voor zakelijk gebruik."],
  ['Kan ik gratis beginnen?','Ja. Met Start maak je gratis facturen en houd je je klanten en betalingen bij, zonder betaalkaart. Wil je ook je kosten, bonnetjes, btw-overzicht en bank in Boekuna? Dan kies je ZZP voor € 9,95 per maand of € 99,50 per jaar, inclusief btw. Een nieuw account krijgt de eerste 14 dagen ZZP gratis. Er wordt niets afgeschreven: daarna ga je vanzelf naar Start, tenzij je zelf ZZP kiest.'],
  ['Heb ik boekhoudkennis nodig?','Nee. Boekuna gebruikt woorden als inkomsten, kosten en bonnetjes in plaats van boekhoudtermen, en laat zien wat er nog moet gebeuren. Je blijft wel zelf verantwoordelijk voor een juiste administratie en je aangifte.'],
  ['Hoe werkt het scannen van bonnetjes?','Je maakt een foto of uploadt een PDF. Boekuna leest de leverancier, datum, bedragen en btw uit en zet die naast de bon. Jij controleert in twee korte stappen en slaat op. Herkenning kan fouten maken bij een vage foto of een ongewone bon, daarom wordt niets opgeslagen zonder jouw controle.'],
  ['Kan ik facturen maken?',"Ja. Je kiest een klant, zet je diensten erop en deelt de PDF vanuit je eigen e-mail. Boekuna zet de verplichte gegevens erop, maakt creditfacturen en laat zien welke facturen nog openstaan. Je maakt ook offertes die je met één tik omzet naar een factuur, en met ZZP terugkerende facturen."],
  ['Kan ik mijn gegevens exporteren?','Ja. Je downloadt in Instellingen een volledige back-up, exporteert facturen en kosten als CSV en downloadt je originele bonnen en documenten. Je administratie blijft van jou.'],
  ['Kan ik Boekuna op mijn telefoon gebruiken?','Ja. Boekuna werkt in de browser op je telefoon, tablet en computer, met dezelfde gegevens. Op je telefoon maak je met de camera direct een foto van een bon. Er is nog geen app in de App Store of Play Store.'],
  ['Hoe veilig zijn mijn gegevens?','Je administratie en documenten staan op servers in Frankfurt, in de EU. Elk account is in de database afgeschermd en documenten staan in privé-opslag. Je kunt tweestapsverificatie aanzetten. Boekuna gebruikt geen tracking- of advertentiecookies. <a href="/veiligheid/">Lees meer over veiligheid</a>.'],
  ['Kan ik mijn abonnement opzeggen?','Ja, zelf in de app via Abonnement. Je houdt toegang tot het einde van de betaalde maand of het betaalde jaar; een lopende periode wordt niet terugbetaald. Je gegevens blijven daarna bewaard en je kunt alles exporteren.']
];

// Homepage in the studio style Kwin picked on 2026-10-16: one big idea per block, white and
// warm-grey surfaces, black cards, Boekuna green as the only accent. Sizes are in rem so the
// page scales with the viewport (html.studio in site.css). Every number on it is a fact.
const pill=(label,href,kind='green',arrowIcon='arrow',extra='')=>`<a class="pill pill-${kind}${arrowIcon?' pill-arrow':''}" href="${href}"${extra}><span>${label}${arrowIcon?`<span class="pill-badge">${icon(arrowIcon)}</span>`:''}</span></a>`;

const hints=['Nederlands','Opslag in de EU','Geen tracking','Alles exporteren','Tweestapsverificatie','Telefoon en computer'];

const audience=[
  ['Freelancers — Creatief','Ontwerpers en fotografen','Je factureert per project of per uur en wilt dat het er netjes uitziet.',['Facturen','Diensten','Btw']],
  ['Vakmensen — Onderweg','Klussers, loodgieters en schilders','Bon fotograferen vanuit de bus, kilometers erbij, offerte en factuur op je telefoon.',['Bonnetjes','Ritten','Offertes']],
  ['Diensten — Vaste klanten','Coaches, developers en adviseurs','Elke maand dezelfde klant? Boekuna zet de factuur voor je klaar.',['Facturen','Terugkerend','Overzicht']],
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
  const body=`
<section class="s-hero s-flux s-flux--video" id="home" aria-labelledby="hero-titel">
 <video class="s-flux-video" data-hero-video muted loop playsinline preload="none" poster="/assets/site/hero-klimmer.webp" aria-hidden="true" tabindex="-1"><source src="/assets/site/hero-klimmer.webm" type="video/webm"><source src="/assets/site/hero-klimmer.mp4" type="video/mp4"></video>
 <div class="s-flux-shade" aria-hidden="true"></div>
 <div class="s-flux-inner">
  <p class="s-flux-kicker rise" style="--rd:300ms">Online boekhoudprogramma voor zzp'ers</p>
  <h1 id="hero-titel" class="rise" style="--rd:380ms">Boekhouden zonder boekhoudtaal<span class="dot">.</span></h1>
  <p class="s-flux-sub rise" style="--rd:490ms">Facturen, bonnetjes en btw op één plek. In gewone woorden.</p>
  <div class="s-flux-ctas rise" style="--rd:600ms">${pill('Begin gratis',REGISTER)}<a class="s-flux-link" href="#functies">Bekijk functies</a></div>
 </div>
 <ul class="s-flux-meta rise" style="--rd:720ms" aria-label="Goed om te weten"><li>14 dagen ZZP gratis</li><li>Geen betaalkaart nodig</li><li>Gemaakt in Nederland</li></ul>
</section>

<section class="s-trust" aria-label="Goed om te weten">
 <ul class="s-shell">${hints.map((h,i)=>`<li class="rv" style="--d:${i*60}ms">${icon('dot')}<span>${h}</span></li>`).join('')}</ul>
</section>

<section class="s-about" id="waarom" aria-labelledby="waarom-titel">
 <div class="s-shell s-about-grid">
  <div class="s-about-left">
   <p class="s-eyebrow">Waarom Boekuna</p>
   <p class="s-about-note rv">${icon('building')}<span>Een Nederlands product van ${COMPANY.name}, ${COMPANY.city}.</span></p>
  </div>
  <div class="s-about-right">
   <h2 id="waarom-titel" class="words">${words('Je begon voor de vrijheid, niet voor de administratie.')} ${words('Boekuna doet het rekenwerk en zegt in gewone woorden wat er nog moet gebeuren.',' mu')}</h2>
   <figure class="s-photo rv"><img src="/assets/site/foto-ondernemer-tablet.webp" width="1600" height="1067" alt="Een lachende ondernemer zit met haar tablet aan tafel in haar zaak" loading="lazy" decoding="async"><figcaption>Foto ter illustratie, geen klant van Boekuna</figcaption></figure>
   <div class="s-about-foot rv" style="--d:200ms"><div><p class="s-label">Vragen? Mail ons</p><a class="s-mail" href="mailto:${COMPANY.email}">${COMPANY.email}</a></div></div>
  </div>
 </div>
</section>

<section class="s-band" aria-labelledby="stappen-titel">
 <div class="s-shell">
  <p class="s-eyebrow rv">Zo werkt een bonnetje</p>
  <h2 id="stappen-titel" class="s-h2 rv">Foto. Check. Klaar.</h2>
  <ol class="s-steps">${[['Foto','Maak een foto van je bon of upload de pdf.'],['Check','Boekuna leest bedrag, datum en btw. Jij kijkt even mee.'],['Klaar','De kosten staan erin en de bon blijft 7 jaar bewaard.']].map(([t,x],i)=>`<li class="rv" style="--from:translateY(24px);--d:${i*80}ms"><span class="s-row-ix">0${i+1}</span><div><h3>${t}</h3><p>${x}</p></div></li>`).join('')}</ol>
 </div>
</section>

<section class="s-works" id="voor-wie" aria-labelledby="wie-titel">
 <div class="s-shell">
  <p class="s-eyebrow rv">Voor wie</p>
  <h2 id="wie-titel" class="s-h2 lines" data-delay="120"><span class="ln"><span>Gemaakt voor jou</span></span></h2>
  <ul class="s-cards">${audience.map(([meta,title,text,tags],i)=>`<li class="rv" style="--from:translateY(48px);--d:${i*90}ms"><div class="s-card"><span class="s-card-meta"><span>${meta}</span></span><span class="s-card-mark" aria-hidden="true"><b>B<span>.</span></b></span><span class="s-card-body"><span class="s-card-title">${title}</span><span class="s-card-text">${text}</span><span class="s-tags">${tags.map(t=>`<span>${t}</span>`).join('')}</span></span></div></li>`).join('')}</ul>
  <p class="s-more rv"><a href="/zzp/">Meer voor zzp'ers ${icon('arrow')}</a></p>
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
    title:"Boekuna — Online boekhoudprogramma voor zzp'ers | Gratis beginnen",
    ogTitle:'Boekuna — Boekhouden zonder boekhoudtaal',
    description:"Boekuna is het eenvoudige boekhoudprogramma voor zzp'ers en kleine ondernemers. Facturen maken, bonnetjes scannen, btw-overzicht per kwartaal. Start gratis.",
    ld:[ORGANIZATION,{"@type":"WebSite","@id":SITE+"/#website","url":SITE+"/","name":"Boekuna","inLanguage":"nl-NL","publisher":{"@id":SITE+"/#org"}},softwareLd()],
    body
  });
}
