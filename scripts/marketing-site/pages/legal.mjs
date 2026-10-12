// Legal pages, support and account deletion. The forms post to the existing support_requests endpoint.
import fs from 'node:fs';
import {render,ORGANIZATION,LOGIN,REGISTER,icon,arrow,btn,sectionHead,pageHero,breadcrumbLd,related} from '../layout.mjs';

const fragment=name=>fs.readFileSync(new URL(`../content/${name}.html`,import.meta.url),'utf8');
const SUPABASE=`const SUPABASE_URL='https://vuwfyhtejsxhdfyvkkeq.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_miAZ6CBZShVcmmNwlnEDgA_aGw1X4aP';`;

function legal({path,name,title,description,eyebrow,h1,lead,content,actions}){
  const crumbs=[{name,href:path}];
  return render({path,title,description,ld:[ORGANIZATION,breadcrumbLd(path,crumbs)],body:pageHero({crumbs,eyebrow,h1,lead,actions})+`<section class="section"><div class="shell legal-layout">${content}</div></section>`});
}

export function privacy(){
  return legal({path:'/privacy/',name:'Privacyverklaring',title:'Privacyverklaring | Boekuna',description:'Welke gegevens Boekuna verwerkt, waarom, met welke dienstverleners, hoe lang en welke rechten je hebt. Boekuna gebruikt geen tracking- of advertentiecookies.',eyebrow:'Privacy',h1:'Privacyverklaring',lead:'Je administratie bevat gevoelige informatie. Daar hoort duidelijke uitleg bij. Dit beleid beschrijft welke gegevens Boekuna verwerkt, waarom, welke dienstverleners betrokken zijn en welke keuzes je hebt.',actions:btn('Privacyvraag stellen','/support/','ghost')+btn('Account verwijderen','/account-verwijderen/','ghost'),content:fragment('privacy')});
}
export function voorwaarden(){
  return legal({path:'/voorwaarden/',name:'Algemene voorwaarden',title:'Algemene voorwaarden | Boekuna',description:'De afspraken over het gebruik van Boekuna: alleen voor ondernemers, abonnementen en opzeggen, eigen controle, aansprakelijkheid en Nederlands recht.',eyebrow:'Voorwaarden',h1:'Algemene voorwaarden',lead:'Duidelijke afspraken over het gebruik van Boekuna: wat Boekuna aanbiedt, waar automatisering grenzen heeft en welke verantwoordelijkheid bij jou blijft.',actions:btn('Vraag over de voorwaarden','/support/','ghost')+btn('Privacyverklaring','/privacy/','ghost'),content:fragment('voorwaarden')});
}

export function support(){
  const path='/support/',crumbs=[{name:'Contact en support',href:path}];
  const body=`<section class="section" id="supportformulier"><div class="shell form-layout">
<aside class="form-side">${sectionHead({eyebrow:'Wat helpt',title:'Korte context werkt het best.',id:'context',lead:'Vertel wat je deed, wat je verwachtte en wat er gebeurde. Dan vinden we het probleem sneller.'})}
<ul class="form-points"><li>${icon('users')}<span><strong>Account en toegang</strong>Welke stap lukt niet bij inloggen of herstellen?</span></li><li>${icon('receipt')}<span><strong>Document of boeking</strong>Het bestandstype, het scherm en het bedrag of veld dat niet klopt.</span></li><li>${icon('wallet')}<span><strong>Betaling en abonnement</strong>Je pakket en wat je ziet. Stuur geen kaartgegevens.</span></li><li>${icon('shield')}<span><strong>Privacy</strong>Kies Privacy als onderwerp, dan is je verzoek direct herkenbaar.</span></li></ul>
<div class="contact-card"><p><strong>Liever mailen?</strong></p><p><a href="mailto:support@boekuna.nl">support@boekuna.nl</a></p><p class="muted">Je krijgt antwoord in het Nederlands.</p></div></aside>
<div class="form-card"><h2>Stuur je vraag</h2><p class="muted">Je bericht wordt veilig opgeslagen als supportverzoek, zodat de context bij elkaar blijft.</p>
<form id="supportForm" class="form-grid" novalidate>
<div class="field"><label for="supportEmail">E-mailadres</label><input id="supportEmail" name="email" type="email" autocomplete="email" required maxlength="320" placeholder="naam@bedrijf.nl"></div>
<div class="field"><label for="supportCategory">Onderwerp</label><select id="supportCategory" name="category" required><option value="">Kies een onderwerp</option><option>Account &amp; toegang</option><option>Document of boeking</option><option>Betaling &amp; abonnement</option><option>Financiële fout</option><option>Privacy</option><option>Feedback of overig</option></select></div>
<div class="field full"><label for="supportSubject">Korte titel</label><input id="supportSubject" name="subject" required minlength="2" maxlength="90" placeholder="Bijvoorbeeld: bedrag wordt verkeerd herkend"></div>
<div class="field full"><label for="supportMessage">Wat gebeurt er?</label><textarea id="supportMessage" name="message" required minlength="10" maxlength="4000" aria-describedby="supportHelp" placeholder="Wat deed je, wat verwachtte je en wat gebeurde er?"></textarea><p class="field-help" id="supportHelp">Stuur nooit wachtwoorden, herstelcodes, volledige betaalkaartgegevens of geheime sleutels mee.</p></div>
<div class="hidden" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
<div class="field full"><button class="btn btn-primary" id="supportSubmit" type="submit">Verstuur je vraag</button><p class="form-status" id="supportStatus" role="status" aria-live="polite"></p></div>
</form>
<p class="form-note">Wil je je account verwijderen? Gebruik dan de verwijderoptie in de app, of de pagina <a href="/account-verwijderen/">Account verwijderen</a> als je niet meer kunt inloggen.</p></div>
</div></section>
${related([{href:'/faq/',icon:'info',name:'Veelgestelde vragen',sub:'Misschien staat je antwoord er al'},{href:'/privacy/',icon:'shield',name:'Privacyverklaring',sub:'Welke gegevens Boekuna verwerkt'},{href:LOGIN,icon:'lock',name:'Inloggen',sub:'Naar je administratie'}])}`;
  const script=`<script>
${SUPABASE}
const form=document.getElementById('supportForm'),statusEl=document.getElementById('supportStatus'),btn=document.getElementById('supportSubmit');
form.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity())return;const fd=new FormData(form);if(String(fd.get('website')||''))return;btn.disabled=true;btn.textContent='Versturen…';statusEl.textContent='';statusEl.className='form-status';try{
 const category=String(fd.get('category')||'Support').trim(),subject=String(fd.get('subject')||'').trim();
 const payload={email:String(fd.get('email')||'').trim().toLowerCase(),subject:('['+category+'] '+subject).slice(0,120),message:String(fd.get('message')||'').trim(),source:'store-support',user_agent:navigator.userAgent.slice(0,500)};
 const r=await fetch(SUPABASE_URL+'/rest/v1/support_requests',{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(payload)});
 if(!r.ok)throw new Error('Supportverzoek kon niet worden opgeslagen');
 form.reset();statusEl.textContent='Ontvangen. We komen bij je terug via e-mail.';statusEl.className='form-status success';btn.textContent='Verstuurd';
}catch(err){statusEl.innerHTML='Versturen is niet gelukt. Mail ons via <a href="mailto:support@boekuna.nl">support@boekuna.nl</a>.';statusEl.className='form-status error';btn.disabled=false;btn.textContent='Verstuur je vraag';}
});
</script>
`;
  return render({path,title:'Contact en support | Boekuna',description:'Een vraag over je account, een document, je abonnement of privacy? Stuur je vraag via het formulier of mail support@boekuna.nl. Antwoord in het Nederlands.',ld:[ORGANIZATION,breadcrumbLd(path,crumbs)],inlineScript:script,body:pageHero({crumbs,eyebrow:'Contact en support',h1:'Vertel wat er gebeurt. Dan helpen we gericht.',lead:'Gebruik het formulier voor vragen over je account, documenten, betalingen, je abonnement, privacy of het product. Deel nooit wachtwoorden of betaalkaartgegevens.',actions:btn('Naar het formulier','#supportformulier','primary')+btn('Mail support','mailto:support@boekuna.nl','ghost')})+body});
}

export function accountVerwijderen(){
  const path='/account-verwijderen/',crumbs=[{name:'Account verwijderen',href:path}];
  const body=`<section class="section"><div class="shell"><ol class="steps">${[['Maak een export','Bewaar wat je zelf moet bewaren. Je administratie moet je meestal 7 jaar bewaren. Download in Instellingen een back-up en je originele bestanden.'],['Verwijder in de app','Log in, open Instellingen › Account en kies Account verwijderen. Een lopend abonnement stopt dan eerst. Dit is de snelste route.'],['Geen toegang meer?','Gebruik het formulier hieronder met hetzelfde e-mailadres als je account. We kunnen eerst om verificatie vragen.']].map(([t,p])=>`<li><h3>${t}</h3><p>${p}</p></li>`).join('')}</ol></div></section>
<section class="section soft" id="verzoek"><div class="shell form-layout"><aside class="form-side">${sectionHead({eyebrow:'Online verwijderingsverzoek',title:'Alleen nodig als je de app niet kunt gebruiken.',id:'verzoek-titel',lead:'Gebruik hetzelfde e-mailadres als voor je account. Boekuna kan extra verificatie vragen voordat je account definitief wordt verwijderd.'})}<ul class="form-points"><li>${icon('lock')}<span><strong>Geen wachtwoord nodig</strong>Stuur nooit je wachtwoord mee.</span></li><li>${icon('pen')}<span><strong>Typ VERWIJDER</strong>Zo voorkomen we onbedoelde verzoeken.</span></li><li>${icon('info')}<span><strong>Definitief</strong>Maak vooraf de exports die je nodig hebt.</span></li></ul></aside>
<div class="form-card"><h2>Verwijderingsverzoek</h2><form id="deleteRequestForm" class="form-grid" novalidate>
<div class="field full"><label for="deleteEmail">E-mailadres van je Boekuna-account</label><input id="deleteEmail" name="email" type="email" autocomplete="email" required maxlength="320"></div>
<div class="field full"><label for="deleteConfirm">Bevestiging: typ VERWIJDER</label><input id="deleteConfirm" name="confirm" required pattern="VERWIJDER" autocomplete="off"></div>
<div class="field full"><label for="deleteMessage">Toelichting (optioneel)</label><textarea id="deleteMessage" name="message" maxlength="2000" placeholder="Bijvoorbeeld: ik heb geen toegang meer tot de app."></textarea></div>
<div class="hidden" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
<div class="field full"><button class="btn btn-dark" id="deleteSubmit" type="submit">Verzoek indienen</button><p class="form-status" id="deleteStatus" role="status" aria-live="polite"></p></div>
</form></div></div></section>`;
  const script=`<script>
${SUPABASE}
const form=document.getElementById('deleteRequestForm'),statusEl=document.getElementById('deleteStatus'),btn=document.getElementById('deleteSubmit');
form.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity())return;const fd=new FormData(form);if(String(fd.get('website')||''))return;btn.disabled=true;btn.textContent='Verzoek indienen…';statusEl.textContent='';statusEl.className='form-status';try{
 const email=String(fd.get('email')||'').trim(),extra=String(fd.get('message')||'').trim();
 const payload={email,subject:'Account deletion request',message:'Verzoek om Boekuna-account en gekoppelde gebruikersgegevens te verwijderen.'+(extra?'\\n\\nToelichting: '+extra:''),source:'privacy',user_agent:navigator.userAgent.slice(0,500)};
 const r=await fetch(SUPABASE_URL+'/rest/v1/support_requests',{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(payload)});
 if(!r.ok)throw new Error('Verzoek kon niet worden opgeslagen');
 form.reset();statusEl.textContent='Je verwijderingsverzoek is ontvangen. Boekuna kan eerst om verificatie van het account vragen.';statusEl.className='form-status success';btn.textContent='Verzoek ontvangen';
}catch(err){statusEl.textContent='Indienen is niet gelukt. Probeer het later opnieuw of mail support@boekuna.nl.';statusEl.className='form-status error';btn.disabled=false;btn.textContent='Verzoek indienen';}
});
</script>
`;
  return render({path,title:'Account verwijderen | Boekuna',description:'Zo verwijder je je Boekuna-account: in de app via Instellingen, of met een online verzoek als je niet meer kunt inloggen. Maak eerst een export voor je bewaarplicht.',ld:[ORGANIZATION,breadcrumbLd(path,crumbs)],inlineScript:script,body:pageHero({crumbs,eyebrow:'Account en gegevens',h1:'Je Boekuna-account verwijderen.',lead:'De snelste route is vanuit de app zelf. Kun je niet meer inloggen, dan dien je hier een verwijderingsverzoek in met het e-mailadres van je account.',actions:btn('Open Boekuna',LOGIN,'primary')+btn('Online verzoek','#verzoek','ghost')})+body});
}

export function notFound(){
  return render({path:'/404.html',robots:'noindex,follow',title:'Pagina niet gevonden | Boekuna',description:'Deze pagina bestaat niet (meer).',body:`<section class="page-hero"><div class="shell narrow center-text"><p class="eyebrow">404</p><h1>Deze pagina bestaat niet (meer).</h1><p class="lead">Misschien is de pagina verhuisd. Kies hieronder waar je naartoe wilt.</p><div class="actions center">${btn('Naar de homepagina','/','primary')}${btn('Alle functies','/functies/','ghost')}${btn('Inloggen',LOGIN,'ghost')}</div></div></section>`});
}

// Old URLs that moved: a tiny page that sends visitors (and search engines, via canonical) on.
export function redirectPage(to){
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><link rel="canonical" href="https://boekuna.nl${to}"><meta http-equiv="refresh" content="0;url=${to}"><title>Deze pagina is verhuisd | Boekuna</title><link rel="icon" href="/assets/boekuna-favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/baseline.css"></head><body><main class="holding" id="main"><div class="holding-inner"><a class="holding-mark" href="/" aria-label="Boekuna">Boekuna<span class="holding-dot" aria-hidden="true">.</span></a><h1>Deze pagina is verhuisd.</h1><p>Je wordt doorgestuurd. Gebeurt dat niet, kies dan de link hieronder.</p><div class="holding-actions"><a class="btn btn-primary" href="${to}">Ga verder</a></div></div></main></body></html>
`;
}
