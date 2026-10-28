// The pricing block for the homepage and /prijzen/. Every amount comes from the server-side
// price list, so the website can never show a price the app does not charge.
import {PLANS,DEFAULT_SELLABLE_PLANS,DOCUMENT_LIMITS,formatEuro,yearlyMonthlyEquivalentCents} from '../../supabase/functions/_shared/pricing.mjs';
import {icon,arrow,REGISTER} from './layout.mjs';

const price=(id,interval)=>formatEuro(PLANS[id].prices[interval]);
const perMonth=id=>formatEuro(yearlyMonthlyEquivalentCents(id));

// Card features: only what the plan split in the app gives (kwinest/index.html PAGE_MIN_PLAN).
const CARDS={
  start:{tag:'Gratis factureren',features:["Facturen, offertes en creditnota's",'Klanten, betalingen en herinneringen','KOR-instelling','Export en back-up']},
  zzp:{tag:'Je hele boekhouding',features:['Alles van Start','Kosten, bonnetjes en btw-overzicht','Terugkerende facturen','Bankimport en rapporten',`${DOCUMENT_LIMITS.zzp} slimme documentherkenningen per maand`]},
  pro:{tag:'Voor veel documenten',features:['Alles van ZZP','Documentherkenning zonder maandlimiet','Herstelpunten']}
};
const list=items=>`<ul>${items.map(f=>`<li>${icon('check')} ${f.replaceAll("'",'&#39;')}</li>`).join('')}</ul>`;

function paidCard(id,featured){
  const c=CARDS[id];
  return `<article class="pricing-card${featured?' pricing-featured':''}" data-plan="${id}">${featured?'<p class="pricing-flag">Hele boekhouding</p>':''}<div class="pricing-head"><h3>${PLANS[id].name}</h3><p>${c.tag}</p></div><div class="pricing-price"><span data-show="month">${price(id,'month')} <span>/ maand</span></span><span data-show="year">${price(id,'year')} <span>/ jaar</span></span></div><p class="pricing-alt"><span data-show="month">of ${price(id,'year')} per jaar, 2 maanden gratis</span><span data-show="year">gemiddeld ${perMonth(id)} per maand · of ${price(id,'month')} per maand</span></p>${list(c.features)}<a class="btn ${featured?'btn-primary':'btn-ghost'}" data-plan-cta href="${REGISTER}&amp;plan=${id}&amp;interval=year">Kies ${PLANS[id].name} ${arrow}</a></article>`;
}

export function pricingCards(){
  const sellable=DEFAULT_SELLABLE_PLANS;
  return `<div class="interval-switch" data-interval-switch><div class="interval-toggle" role="radiogroup" aria-label="Betaalperiode"><button type="button" role="radio" aria-checked="false" tabindex="-1" data-interval="month">Maandelijks</button><button type="button" role="radio" aria-checked="true" tabindex="0" data-interval="year">Jaarlijks <span class="interval-badge">2 maanden gratis</span></button></div><p class="sr-only" aria-live="polite" data-interval-status>Jaarprijzen worden getoond.</p></div><div class="pricing-grid" data-pricing data-interval-current="year"><article class="pricing-card" data-plan="start"><div class="pricing-head"><h3>${PLANS.start.name}</h3><p>${CARDS.start.tag}</p></div><div class="pricing-price">€ 0 <span>altijd gratis</span></div><p class="pricing-alt">Geen betaalkaart nodig</p>${list(CARDS.start.features)}<a class="btn btn-ghost" href="${REGISTER}">Gratis beginnen ${arrow}</a></article>${sellable.map(id=>paidCard(id,id==='zzp')).join('')}</div><p class="pricing-footnote">Alle prijzen inclusief btw. Een jaarabonnement betaal je vooruit voor 12 maanden en verlengt daarna per jaar, tot je opzegt. Opzeggen doe je zelf in de app.</p>`;
}

export function pricingCompare(){
  const yes='<span class="yes">'+icon('check')+'<span class="sr-only">Ja</span></span>',no='<span class="no">–<span class="sr-only">Nee</span></span>';
  const row=(label,cells)=>`<tr><th scope="row">${label}</th>${cells.map(c=>`<td>${c}</td>`).join('')}</tr>`;
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="Vergelijking van de pakketten"><table class="compare-plans"><caption class="sr-only">Wat zit in welk pakket</caption><thead><tr><th scope="col">Functie</th><th scope="col">Start</th><th scope="col">ZZP</th><th scope="col">Pro</th></tr></thead><tbody>
${row('Prijs per maand',['€ 0',price('zzp','month'),price('pro','month')])}
${row('Prijs per jaar (vooruit)',['€ 0',price('zzp','year'),price('pro','year')])}
${row("Facturen, offertes en creditnota's",[yes,yes,yes])}
${row('Klanten, diensten en betalingen',[yes,yes,yes])}
${row('Export en back-up',[yes,yes,yes])}
${row('Kosten, bonnetjes en btw-overzicht',[no,yes,yes])}
${row('Terugkerende facturen',[no,yes,yes])}
${row('Bankimport en rapporten',[no,yes,yes])}
${row('Slimme documentherkenning',[no,DOCUMENT_LIMITS.zzp+' per maand','Geen limiet'])}
${row('Herstelpunten',[no,no,yes])}
</tbody></table></div><p class="table-note">In deze tabel staan alleen functies die nu in Boekuna werken. Had je al een account vóór deze pakketten, dan houd je in Start je boekhouding.</p>`;
}

// schema.org offers: only plans you can buy today, prices as in the app.
export function softwareLd(){
  const offers=[{"@type":"Offer","name":"Start","price":"0","priceCurrency":"EUR"}];
  for(const id of DEFAULT_SELLABLE_PLANS)for(const [interval,label] of [['month','maandelijks'],['year','jaarlijks']])
    offers.push({"@type":"Offer","name":`${PLANS[id].name} ${label}`,"price":(PLANS[id].prices[interval]/100).toFixed(2),"priceCurrency":"EUR","priceSpecification":{"@type":"UnitPriceSpecification","price":(PLANS[id].prices[interval]/100).toFixed(2),"priceCurrency":"EUR","valueAddedTaxIncluded":true,"billingDuration":interval==='month'?'P1M':'P1Y'}});
  return {"@type":"SoftwareApplication","@id":"https://boekuna.nl/#app","name":"Boekuna","applicationCategory":"BusinessApplication","applicationSubCategory":"Boekhoudsoftware","operatingSystem":"Web, iOS, Android (browser)","inLanguage":"nl-NL","url":"https://app.boekuna.nl/","description":"Online boekhoudprogramma voor zzp'ers en kleine ondernemers: facturen maken, bonnetjes scannen, kosten bijhouden, btw-overzicht per kwartaal, bankbestand importeren en rapportages.","publisher":{"@id":"https://boekuna.nl/#org"},"offers":offers};
}
