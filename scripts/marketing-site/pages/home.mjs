import {render,REGISTER,LOGIN,ORGANIZATION,SITE,icon,arrow,btn,startCta,shotDesktop,shotPhone,photo,sampleNote,sectionHead,checks,faqList,COMPANY} from '../layout.mjs';
import {pricingCards,softwareLd} from '../pricing.mjs';

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

const benefits=[
  ['scan','Minder overtypen','Maak een foto van je bon. Boekuna vult leverancier, datum, bedragen en btw voor je in. Jij kijkt alleen of het klopt.'],
  ['monitor','Alles op één plek','Facturen, kosten, bonnetjes, bank en btw staan bij elkaar. Op je telefoon en je computer, altijd met dezelfde gegevens.'],
  ['chart','Direct zien waar je staat','Je overzicht laat je winst, wat nog binnen moet komen en welke btw je opzij zet zien. Zonder spreadsheet.']
];

const demo=[
  {tab:'Toevoegen',title:'Foto of bestand. Meer niet.',text:'Maak met je telefoon een foto van een bonnetje of upload een PDF van een inkoopfactuur. PDF, JPG, PNG, WebP en HEIC van een iPhone werken.',visual:`<figure class="demo-receipt"><img src="/assets/site/bon-voorbeeld.webp" width="600" height="900" alt="Voorbeeldbon van een fictieve papierwinkel met een totaal van 50 euro" loading="lazy" decoding="async"><figcaption>Fictieve voorbeeldbon</figcaption></figure>`},
  {tab:'Herkennen',title:'Boekuna vult het voor je in.',text:'Leverancier, datum, categorie en soort staan al klaar. Je ziet de bon en de gegevens naast elkaar, dus vergelijken gaat snel.',visual:shotPhone('review','Stap 1 van het controleren van een bon: leverancier, datum en categorie zijn al ingevuld')},
  {tab:'Controleren',title:'Jij houdt de controle.',text:'In de tweede stap check je het totaal en de btw. Boekuna rekent het bedrag zonder btw uit en zegt het als iets niet sluit. Klopt het? Dan sla je op.',visual:shotPhone('review2','Stap 2 van het controleren: totaal 50 euro inclusief 21 procent btw, met de melding Klaar om op te slaan')},
  {tab:'Bewaard',title:'Netjes in je administratie.',text:'De kostenpost telt mee in je overzicht en je btw. De bon staat bij Bonnetjes, zodat je hem altijd terugvindt voor de bewaarplicht van 7 jaar.',visual:shotPhone('documents','Bonnetjes-overzicht met elf bewaarde bonnen van een fictief bedrijf')}
];

const features=[
  {id:'facturen',eyebrow:'Facturen maken',title:'Een nette factuur in een paar tikken.',text:'Kies je klant, zet je vaste diensten erop en deel de PDF vanuit je eigen e-mail. Boekuna houdt bij wat betaald is en wat nog openstaat.',items:['Verplichte gegevens en btw staan er automatisch op','Creditfactuur bij een fout, met verwijzing','Herinnering sturen bij een te late factuur'],shot:shotDesktop('composer','Nieuwe factuur maken voor een klant, met vaste diensten om met één tik toe te voegen'),href:'/facturen/',link:'Meer over facturen maken'},
  {id:'kosten',eyebrow:'Bonnetjes en kosten',title:'Al je uitgaven en bonnen op een rij.',text:'Elke kostenpost heeft een leverancier, categorie en btw-tarief. Je bonnen staan in één archief, gekoppeld aan de kosten waar ze bij horen.',items:['Zien welke betalingen nog geen bon hebben','Zoeken op leverancier, bestand of factuurnummer','Originele bestanden altijd downloaden'],shot:shotDesktop('expenses','Kostenoverzicht met huur, software, kantoorartikelen en reizen van een fictief bedrijf'),href:'/bonnen/',link:'Meer over bonnetjes en kosten'},
  {id:'btw',eyebrow:'Btw-overzicht',title:'Je btw-aangifte zonder rekenwerk.',text:'Boekuna telt je facturen en kosten per kwartaal op en zet de bedragen in dezelfde rubrieken als de aangifte bij de Belastingdienst. Jij neemt ze over.',items:['Rubriek 1a, 1b, 1e, 3b en 5b','Ondersteunt btw verlegd, EU-levering en de KOR','Knop om alle bedragen te kopiëren'],shot:shotDesktop('vat','Btw-overzicht van het derde kwartaal met de bedragen per rubriek'),href:'/btw/',link:'Meer over het btw-overzicht'},
  {id:'bank',eyebrow:'Bankimport',title:'Je bank en je boekhouding kloppen.',text:'Download een bankbestand bij je bank en lees het in. Boekuna zoekt bij elke betaling de factuur of kostenpost die erbij hoort.',items:['Een gekoppelde bijschrijving zet de factuur op betaald','Waarschuwing als een regel al is ingelezen','Wat overblijft, staat bij Te verwerken'],shot:shotDesktop('bank','Bankscherm met ingelezen betalingen die aan facturen en kosten zijn gekoppeld'),href:'/bank/',link:'Meer over bankimport'},
  {id:'rapportages',eyebrow:'Rapportages',title:'Zien hoe je bedrijf ervoor staat.',text:'Kies een maand, kwartaal of jaar. Je ziet omzet, kosten en winst in een grafiek, plus winst en verlies en wat er nog openstaat.',items:['Winstmarge en kosten per categorie','Openstaande facturen in één oogopslag','Bewaren als PDF'],shot:shotDesktop('reports','Rapportage van dit jaar met omzet, kosten en winst per maand'),href:'/rapportages/',link:'Meer over rapportages'}
];

const extras=[
  ['tag','Diensten','Je vaste diensten en prijzen, met één tik op een factuur.'],
  ['users','Klanten en leveranciers','Adres, KVK en e-mail op één plek.'],
  ['car','Ritten','Twee postcodes erin, de kilometers komen er vanzelf bij.'],
  ['phone','Op je telefoon','Overzicht, inkomsten, kosten en bonnen onder je duim.'],
  ['download','Export en back-up','CSV, volledige back-up en je originele bestanden.'],
  ['lock','Tweestapsverificatie','Een extra slot op je account met een authenticator-app.']
];

const audience=[
  ['foto-gezicht-ontwerp.webp','Een freelance ontwerper werkt lachend op haar laptop aan een tafel bij het raam',560,560,'Freelancers en creatieven','Ontwerpers, fotografen, tekstschrijvers. Je factureert per project of per uur en wilt dat het netjes is.'],
  ['foto-ondernemer.webp','Een ondernemer met schort staat met gekruiste armen in haar eigen zaak',1100,880,'Winkels en horeca-starters','Veel kleine bonnetjes en leveranciers. Foto maken, controleren, klaar.'],
  ['foto-vakman.webp','Handen van een vakman die een stuk hout schaaft in de werkplaats',810,540,'Vakmensen en dienstverleners','Klussers, kappers, coaches. Je bent liever met je vak bezig dan met papier.'],
  ['foto-gezicht-foto.webp','Een fotograaf maakt buiten een foto met een spiegelreflexcamera',560,560,'Startende zzp\'ers','Net ingeschreven bij de KVK? Begin gratis met facturen en groei door naar je hele boekhouding.']
];

const trust=[
  ['building','Een Nederlands bedrijf',`Boekuna is een product van ${COMPANY.name} in ${COMPANY.city}, KVK ${COMPANY.kvk}.`],
  ['lock','Opslag in de EU','Je administratie en documenten staan op servers in Frankfurt, Duitsland.'],
  ['shield','Alleen jij ziet je gegevens','Elk account is afgeschermd in de database. Documenten staan in privé-opslag.'],
  ['scan','Bonnen blijven bij ons','Bonnen worden uitgelezen op de eigen documentserver, niet door externe AI-diensten.'],
  ['eye','Geen tracking','De website en de app gebruiken geen advertentie- of trackingcookies.'],
  ['download','Jouw data, jouw keuze','Alles exporteren of je account verwijderen doe je zelf in de app.']
];

const notYet=['Geen live bankkoppeling: je leest zelf een bankbestand in.','De btw-aangifte doe je zelf bij de Belastingdienst, met de bedragen uit Boekuna.','Nog geen offertes en terugkerende facturen.','Geen salarisadministratie en geen meerdere gebruikers in één account.'];

export default function home(){
  const body=`
<section class="hero">
 <div class="shell hero-grid">
  <div class="hero-copy">
   <p class="eyebrow">Online boekhoudprogramma voor zzp'ers</p>
   <h1>Boekhouden zonder boekhoudtaal.</h1>
   <p class="lead">Facturen maken, bonnetjes scannen en je btw-overzicht klaar hebben. In gewone woorden, op je telefoon en je computer.</p>
   <div class="actions">${startCta()}${btn('Bekijk hoe het werkt','#hoe-het-werkt','ghost')}</div>
   <ul class="hero-assure"><li>${icon('check')}Start is gratis</li><li>${icon('check')}Geen betaalkaart nodig</li><li>${icon('check')}Gegevens in de EU</li></ul>
  </div>
  <div class="hero-visual">
   ${shotDesktop('dashboard','Het overzicht in Boekuna met winst, omzet, kosten, btw en wat nog binnen moet komen',{eager:true,sizes:'(min-width: 1100px) 700px, 94vw'})}
   ${shotPhone('review2','Een bon controleren op de telefoon: totaal en btw kloppen, klaar om op te slaan',{eager:true,sizes:'(min-width: 768px) 230px, 40vw'})}
  </div>
 </div>
 <div class="shell">${sampleNote()}</div>
</section>

<section class="section facts" aria-label="Kort over Boekuna"><div class="shell"><ul class="fact-strip">
 <li>${icon('building')}<span><strong>Nederlands</strong> product van ${COMPANY.name}</span></li>
 <li>${icon('lock')}<span><strong>Opslag in de EU</strong> in Frankfurt</span></li>
 <li>${icon('eye')}<span><strong>Geen tracking</strong>cookies</span></li>
 <li>${icon('download')}<span><strong>Alles exporteren</strong> wanneer je wilt</span></li>
</ul></div></section>

<section class="section" aria-labelledby="voordelen"><div class="shell">
 ${sectionHead({eyebrow:'Waarom Boekuna',title:'Je hoeft geen boekhouder te zijn.',id:'voordelen',lead:'Boekuna doet het rekenwerk en zegt in gewone taal wat er nog moet gebeuren. Jij houdt overzicht en tijd over voor je werk.'})}
 <div class="benefits">${benefits.map(([i,t,p])=>`<article class="benefit">${icon(i,'icon benefit-icon')}<h3>${t}</h3><p>${p}</p></article>`).join('')}</div>
</div></section>

<section class="section dark demo" id="hoe-het-werkt" aria-labelledby="hoe-titel"><div class="shell">
 ${sectionHead({eyebrow:'Hoe werkt Boekuna?',title:'Van bonnetje naar boekhouding in vier stappen.',id:'hoe-titel',lead:'Zo verwerk je een bon of inkoopfactuur. Echte schermen uit de app, met een fictieve voorbeeldbon.'})}
 <div class="tour" data-tour>
  <div class="tour-tabs" role="tablist" aria-label="Stappen">${demo.map((d,i)=>`<button type="button" role="tab" id="tab-${i}" aria-controls="stap-${i}" aria-selected="${i===0}" tabindex="${i===0?0:-1}"><span class="tour-num">${i+1}</span>${d.tab}</button>`).join('')}</div>
  ${demo.map((d,i)=>`<div class="tour-panel" role="tabpanel" id="stap-${i}" aria-labelledby="tab-${i}" tabindex="0"${i?' hidden':''}><div class="tour-text"><p class="tour-step">Stap ${i+1} van 4</p><h3>${d.title}</h3><p>${d.text}</p></div><div class="tour-visual">${d.visual}</div></div>`).join('')}
 </div>
 <div class="honest"><p>${icon('info')}<span><strong>Eerlijk over herkenning.</strong> Een vage foto of een ongewone bon kan verkeerd gelezen worden. Daarom komt er niets in je administratie zonder jouw controle. Met ZZP worden 100 documenten per maand slim uitgelezen, met Pro is er geen maandlimiet.</span></p><a class="link-light" href="/slim-scannen/">Meer over slim scannen ${arrow}</a></div>
</div></section>

<section class="section" id="mogelijkheden" aria-labelledby="functies-titel"><div class="shell">
 ${sectionHead({eyebrow:'Functies',title:'Alles voor je administratie. Niets wat je niet nodig hebt.',id:'functies-titel',lead:'Boekuna heeft een vast aantal duidelijke schermen. Dit zijn de belangrijkste.'})}
 ${features.map((f,i)=>`<article class="feature${i%2?' flip':''}" id="${f.id}"><div class="feature-copy"><p class="eyebrow">${f.eyebrow}</p><h3>${f.title}</h3><p>${f.text}</p>${checks(f.items)}<a class="text-link" href="${f.href}">${f.link} ${arrow}</a></div><div class="feature-visual">${f.shot}</div></article>`).join('')}
 <div class="extras">${extras.map(([i,t,p])=>`<div class="extra">${icon(i)}<div><h3>${t}</h3><p>${p}</p></div></div>`).join('')}</div>
 <p class="center-link"><a class="text-link" href="/functies/">Bekijk alle functies ${arrow}</a></p>
</div></section>

<section class="section soft" id="voor-wie" aria-labelledby="wie-titel"><div class="shell">
 ${sectionHead({eyebrow:'Voor wie',title:'Gemaakt voor zelfstandigen die liever ondernemen.',id:'wie-titel',lead:'Boekuna is er voor zzp\'ers, eenmanszaken en kleine ondernemers in Nederland die hun administratie zelf willen bijhouden, zonder boekhoudkennis.'})}
 <div class="audience">${audience.map(([f,a,w,h,t,p])=>`<article class="person">${photo(f,a,{w,h})}<h3>${t}</h3><p>${p}</p></article>`).join('')}</div>
 <p class="photo-note">Foto's ter illustratie. Dit zijn geen klanten van Boekuna.</p>
 <div class="fit"><div><h3>Boekuna past bij je als je</h3>${checks(['zelf je facturen maakt en je bonnen wilt bewaren','per kwartaal btw-aangifte doet','in één oogopslag wilt zien hoe je ervoor staat'])}</div><div><h3>Wat Boekuna (nog) niet doet</h3><ul class="crosses">${notYet.map(n=>`<li>${icon('x')}<span>${n}</span></li>`).join('')}</ul></div></div>
 <p class="center-link"><a class="text-link" href="/zzp/">Boekhouden als zzp'er ${arrow}</a></p>
</div></section>

<section class="section" id="vertrouwen" aria-labelledby="vertrouwen-titel"><div class="shell">
 ${sectionHead({eyebrow:'Veiligheid en vertrouwen',title:'Je administratie is van jou. En blijft van jou.',id:'vertrouwen-titel',lead:'Boekuna is een jong merk. Daarom zeggen we precies hoe het zit, zonder keurmerken of cijfers die we niet kunnen laten zien.'})}
 <div class="trust-grid">${trust.map(([i,t,p])=>`<div class="trust-item">${icon(i)}<h3>${t}</h3><p>${p}</p></div>`).join('')}</div>
 <div class="company-card"><div><h3>Wie zit erachter?</h3><p>Boekuna wordt gemaakt en verbeterd door ${COMPANY.name}, een Nederlandse onderneming. Je mailt met mensen, in het Nederlands.</p></div><dl><div><dt>Bedrijf</dt><dd>${COMPANY.name}</dd></div><div><dt>Adres</dt><dd>${COMPANY.street}, ${COMPANY.postal} ${COMPANY.city}</dd></div><div><dt>KVK</dt><dd>${COMPANY.kvk}</dd></div><div><dt>Contact</dt><dd><a href="mailto:${COMPANY.email}">${COMPANY.email}</a></dd></div></dl></div>
 <p class="center-link"><a class="text-link" href="/veiligheid/">Lees hoe je gegevens beschermd zijn ${arrow}</a></p>
</div></section>

<section class="section soft pricing-section" id="tarieven" aria-labelledby="prijzen-titel"><div class="shell">
 ${sectionHead({eyebrow:'Prijzen',title:'Eenvoudige prijzen.',id:'prijzen-titel',center:true,lead:'Gratis factureren, of je hele boekhouding voor een vast bedrag.'})}
 ${pricingCards()}
 <p class="center-link"><a class="text-link" href="/prijzen/">Pakketten vergelijken ${arrow}</a></p>
</div></section>

<section class="section" id="vragen" aria-labelledby="vragen-titel"><div class="shell faq-layout">
 <div>${sectionHead({eyebrow:'Veelgestelde vragen',title:'Goed om te weten.',id:'vragen-titel',lead:'Staat je vraag er niet bij? Mail <a href="mailto:support@boekuna.nl">support@boekuna.nl</a>.'})}<a class="text-link" href="/faq/">Alle vragen en antwoorden ${arrow}</a></div>
 ${faqList(HOME_FAQ)}
</div></section>

<section class="section final" aria-labelledby="slot-titel"><div class="shell final-inner">
 <h2 id="slot-titel">Zo simpel kan het zijn.</h2>
 <p>Maak gratis een account en verstuur vandaag je eerste factuur. Je hebt geen betaalkaart nodig.</p>
 <div class="actions center">${startCta()}<a class="btn btn-ghost-light" href="${LOGIN}">Inloggen</a></div>
</div></section>`;
  return render({
    path:'/',
    title:"Boekuna — Online boekhoudprogramma voor zzp'ers | Gratis beginnen",
    ogTitle:'Boekuna — Boekhouden zonder boekhoudtaal',
    description:"Boekuna is het eenvoudige boekhoudprogramma voor zzp'ers en kleine ondernemers. Facturen maken, bonnetjes scannen, btw-overzicht per kwartaal. Start gratis.",
    preloadImage:'<link rel="preload" as="image" href="/assets/site/app-desktop-dashboard-720.webp" imagesrcset="/assets/site/app-desktop-dashboard-720.webp 720w, /assets/site/app-desktop-dashboard.webp 1440w" imagesizes="(min-width: 1100px) 700px, 94vw" fetchpriority="high">\n',
    ld:[ORGANIZATION,{"@type":"WebSite","@id":SITE+"/#website","url":SITE+"/","name":"Boekuna","inLanguage":"nl-NL","publisher":{"@id":SITE+"/#org"}},softwareLd()],
    body
  });
}
