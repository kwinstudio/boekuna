(function(root){
'use strict';

const AI_ENABLED=false;
const MAX_QUESTION_LENGTH=400;
const INTENTS=Object.freeze({
  CURRENT_STATUS:'GET_CURRENT_STATUS',
  TODAY_ACTIONS:'GET_TODAY_ACTIONS',
  OVERDUE:'GET_OVERDUE_INVOICES',
  OUTSTANDING:'GET_OUTSTANDING_TOTAL',
  VAT:'GET_VAT_STATUS',
  VAT_EXPLAIN:'EXPLAIN_VAT_STATUS',
  COST_CHANGE:'GET_COST_CHANGE',
  PROFIT:'GET_CURRENT_PROFIT',
  COSTS:'GET_CURRENT_COSTS',
  DOCUMENTS:'GET_DOCUMENT_ATTENTION',
  BANK:'GET_BANK_ATTENTION',
  TERM:'EXPLAIN_TERM',
  UNSUPPORTED:'UNSUPPORTED'
});

const KNOWLEDGE=Object.freeze([
  {id:'omzet',aliases:['omzet'],shortAnswer:'Omzet is het bedrag dat je met je verkoop verdient vóórdat je zakelijke kosten eraf gaan.',detail:'Bij Boekuna gaat het bij omzet om je verkoop exclusief btw, volgens je huidige administratie.'},
  {id:'kosten',aliases:['kosten','zakelijke kosten','zakelijke kostenpost'],shortAnswer:'Kosten zijn uitgaven die bij je bedrijf horen.',detail:'Denk bijvoorbeeld aan software, materiaal of zakelijke diensten. Of iets fiscaal aftrekbaar is, hangt af van de situatie.'},
  {id:'winst',aliases:['winst'],shortAnswer:'Winst is wat er overblijft van je omzet nadat je zakelijke kosten eraf zijn.',detail:'Boekuna gebruikt daarvoor dezelfde bedragen als je financiële overzicht.'},
  {id:'btw',aliases:['btw','btw apartzetten','omzetbelasting'],shortAnswer:'Btw is belasting die je meestal boven op je verkoopprijs rekent en die je ook op zakelijke kosten kunt tegenkomen.',detail:'Je btw-overzicht laat zien wat op basis van je huidige administratie te betalen of terug te vragen is. Open controles kunnen dat bedrag nog veranderen.'},
  {id:'voorbelasting',aliases:['voorbelasting','btw op kosten'],shortAnswer:'Voorbelasting is de btw die je betaalt op zakelijke kosten.',detail:'Die btw kun je in veel gevallen verrekenen met btw die je van klanten ontvangt. Of dat in jouw situatie mag, hangt af van de fiscale regels en het document.'},
  {id:'factuur',aliases:['factuur'],shortAnswer:'Een factuur is een rekening waarop staat wat is geleverd, wat het kost en wanneer er betaald moet worden.',detail:'Voor zakelijke facturen gelden vaste gegevens. Boekuna helpt je die gegevens bij te houden.'},
  {id:'inkoopfactuur',aliases:['inkoopfactuur','inkoop factuur'],shortAnswer:'Een inkoopfactuur is een factuur die jij van een leverancier ontvangt.',detail:'Die leg je vast als zakelijke kosten wanneer de uitgave bij je onderneming hoort.'},
  {id:'creditnota',aliases:['creditnota','credit nota'],shortAnswer:'Een creditnota corrigeert of verlaagt een eerdere factuur.',detail:'Boekuna verwerkt een credit volgens dezelfde financiële regels als je bestaande factuuradministratie.'},
  {id:'excl-btw',aliases:['excl btw','exclusief btw','excl. btw'],shortAnswer:'Excl. btw betekent dat de btw nog niet in het bedrag zit.',detail:'Bij €100 excl. btw komt de btw er dus nog bovenop.'},
  {id:'incl-btw',aliases:['incl btw','inclusief btw','incl. btw'],shortAnswer:'Incl. btw betekent dat de btw al in het bedrag zit.',detail:'Het totaal dat je betaalt bevat de btw dan al.'},
  {id:'21-btw',aliases:['21% btw','21 procent btw'],shortAnswer:'21% is het algemene Nederlandse btw-tarief voor veel producten en diensten.',detail:'Niet iedere verkoop of kostenpost gebruikt 21%; Boekuna volgt het tarief dat bij je boeking of gecontroleerde document hoort.'},
  {id:'9-btw',aliases:['9% btw','9 procent btw'],shortAnswer:'9% is een verlaagd Nederlands btw-tarief dat voor bepaalde producten en diensten geldt.',detail:'Gebruik het tarief dat bij de concrete levering en je gecontroleerde administratie hoort.'},
  {id:'meerdere-btw',aliases:['meerdere btw tarieven','meerdere btw-tarieven','bon met meerdere btw tarieven','bon met meerdere btw-tarieven'],shortAnswer:'Een document kan regels met verschillende btw-tarieven bevatten.',detail:'Boekuna bewaart zulke btw-regels apart. Controleer de verdeling als het document aandacht nodig heeft.'},
  {id:'vervaldatum',aliases:['vervaldatum'],shortAnswer:'De vervaldatum is de datum waarop een factuur uiterlijk betaald moet zijn.',detail:'Na die datum kan een nog openstaande factuur als te laat worden getoond.'},
  {id:'openstaand',aliases:['openstaand'],shortAnswer:'Openstaand betekent dat een bedrag nog niet volledig is betaald.',detail:'Een deelbetaling verlaagt dus wat nog openstaat.'},
  {id:'bon-bewaren',aliases:['bon bewaren','waarom moet ik een bon bewaren','bonnetje bewaren'],shortAnswer:'Een bon is bewijs van een zakelijke uitgave en helpt je administratie compleet te houden.',detail:'Bewaar het document zodat je later kunt zien waar het bedrag en de btw vandaan komen.'},
  {id:'bank-koppelen',aliases:['banktransactie koppelen','transactie koppelen','bank transactie koppelen'],shortAnswer:'Een banktransactie koppelen betekent dat je een betaling verbindt aan de juiste factuur, kostenpost of andere boeking.',detail:'Zo kan Boekuna zien welke bedragen al zijn verwerkt.'},
  {id:'nog-te-ontvangen',aliases:['nog te ontvangen'],shortAnswer:'Nog te ontvangen is het bedrag van verstuurde facturen dat nog niet volledig is betaald.',detail:'Deelbetalingen worden ervan afgetrokken; te late openstaande bedragen kunnen apart worden aangegeven.'}
]);

const ACTION_RULES=Object.freeze({
  reports:Object.freeze({}),
  invoices:Object.freeze({status:Object.freeze(['open','overdue'])}),
  expenses:Object.freeze({}),
  vat:Object.freeze({}),
  documents:Object.freeze({status:Object.freeze(['needs_review'])}),
  bank:Object.freeze({status:Object.freeze(['unmatched'])}),
  insights:Object.freeze({})
});

function finite(value,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback}
function money(value){return new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(finite(value))}
function normalize(value){
  return String(value||'').slice(0,MAX_QUESTION_LENGTH).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[?!.,;:()[\]{}"'<>]/g,' ').replace(/\s+/g,' ').trim();
}
function knowledgeForQuestion(question){
  const q=normalize(question);
  if(!q)return null;
  let best=null;
  for(const entry of KNOWLEDGE){
    for(const alias of entry.aliases){
      const a=normalize(alias);
      if(q===a||q.includes(a)){
        if(!best||a.length>best.aliasLength)best={entry,aliasLength:a.length};
      }
    }
  }
  return best?.entry||null;
}
function routeIntent(question){
  const raw=String(question||'');
  if(!raw.trim()||raw.length>MAX_QUESTION_LENGTH)return {intent:INTENTS.UNSUPPORTED,topic:null};
  const q=normalize(raw);

  if(/^wat is\b/.test(q)){const entry=knowledgeForQuestion(q);if(entry)return {intent:INTENTS.TERM,topic:entry.id}}
  if(/\b(hoe sta ik ervoor|hoe gaat het met mijn administratie|status van mijn administratie)\b/.test(q))return {intent:INTENTS.CURRENT_STATUS,topic:null};
  if(/\b(wat moet ik vandaag doen|wat moet ik doen|wat heeft aandacht|wat moet nog gebeuren)\b/.test(q))return {intent:INTENTS.TODAY_ACTIONS,topic:null};
  if(/\b(welke facturen.*te laat|facturen.*te laat|achterstallige facturen)\b/.test(q))return {intent:INTENTS.OVERDUE,topic:null};
  if(/\b(hoeveel.*(nog open|openstaand)|hoeveel staat nog open|wat moet nog binnenkomen)\b/.test(q))return {intent:INTENTS.OUTSTANDING,topic:null};
  if(/\b(waarom.*btw.*verander|waarom kan mijn btw|btw.*onzeker)\b/.test(q))return {intent:INTENTS.VAT_EXPLAIN,topic:null};
  if(/\b(hoeveel btw|btw.*apartzetten|btw positie|btw-overzicht)\b/.test(q))return {intent:INTENTS.VAT,topic:null};
  if(/\b(waarom.*kosten.*hoger|kosten.*hoger|kosten gestegen|waarom zijn mijn kosten)\b/.test(q))return {intent:INTENTS.COST_CHANGE,topic:null};
  if(/\b(hoeveel winst|mijn winst|winst heb ik)\b/.test(q))return {intent:INTENTS.PROFIT,topic:null};
  if(/\b(wat waren mijn kosten|hoeveel kosten.*maand|mijn kosten deze maand)\b/.test(q))return {intent:INTENTS.COSTS,topic:null};
  if(/\b(bon|bonnetje|bonnen|document).*(control|aandacht)|\bcontrol.*(bon|document)/.test(q))return {intent:INTENTS.DOCUMENTS,topic:null};
  if(/\b(transacties|banktransacties).*(koppel|ongekoppeld)|\bwelke transacties/.test(q))return {intent:INTENTS.BANK,topic:null};

  if(/^(wat is|wat zijn|wat betekent|waarom moet ik)\b/.test(q)){
    const entry=knowledgeForQuestion(q);
    if(entry)return {intent:INTENTS.TERM,topic:entry.id};
  }
  return {intent:INTENTS.UNSUPPORTED,topic:null};
}
function sanitizeActionTarget(target){
  if(!target||typeof target!=='object')return null;
  const page=String(target.page||'');
  const rule=ACTION_RULES[page];
  if(!rule)return null;
  const input=target.filter&&typeof target.filter==='object'?target.filter:{};
  const out={};
  const keys=Object.keys(input);
  if(!keys.length)return {page,filter:{}};
  for(const key of keys){
    const allowed=rule[key];
    if(!allowed||!allowed.includes(String(input[key])))return null;
    out[key]=String(input[key]);
  }
  return {page,filter:out};
}
function response(intent,state,answer,detail='',actionLabel='',actionTarget=null,supported=true,title='Boekuna Assistent'){
  return Object.freeze({intent,state,title,answer:String(answer||''),detail:String(detail||''),actionLabel:String(actionLabel||''),actionTarget:sanitizeActionTarget(actionTarget),supported:!!supported});
}
function reliableFacts(facts){return !facts||facts.financialReliable!==false}
function attentionState(facts){return String(facts?.adminStatus||'').toLowerCase()==='calm'?'CALM':'ATTENTION'}
function allClear(facts){
  return finite(facts?.overdueInvoiceCount)===0&&finite(facts?.documentReviewCount)===0&&finite(facts?.unmatchedTransactionCount)===0&&finite(facts?.vatUnresolvedDocumentCount)===0;
}
function unreliable(intent){
  return response(intent,'UNCERTAIN','Je actuele overzicht is tijdelijk niet betrouwbaar beschikbaar.','Ik laat daarom geen financieel bedrag of geruststelling zien. Controleer het later opnieuw.','','',true);
}
function answer(question,facts={},options={}){
  const routed=routeIntent(question),intent=routed.intent;
  if(intent===INTENTS.UNSUPPORTED)return response(intent,'UNCERTAIN','Daar kan ik nog geen betrouwbaar antwoord op geven.','Ik kan je wel helpen met je btw, facturen, kosten, winst, bonnetjes en banktransacties.','','',false);
  if(intent===INTENTS.TERM){
    const entry=KNOWLEDGE.find(x=>x.id===routed.topic);
    if(!entry)return response(INTENTS.UNSUPPORTED,'UNCERTAIN','Daar kan ik nog geen betrouwbaar antwoord op geven.','Kies een van de voorgestelde onderwerpen.','','',false);
    return response(intent,'EXPLAINING',entry.shortAnswer,entry.detail,'','',true);
  }
  if(!reliableFacts(facts))return unreliable(intent);

  const period=String(facts.periodLabel||'Deze periode');
  if(intent===INTENTS.CURRENT_STATUS){
    const state=allClear(facts)?'CALM':attentionState(facts);
    const tail=allClear(facts)?'Je hoeft nu niets te doen.':(finite(facts.overdueInvoiceCount)>0?finite(facts.overdueInvoiceCount)+' '+(finite(facts.overdueInvoiceCount)===1?'factuur is':'facturen zijn')+' te laat.':'Er zijn nog een paar dingen om bij te werken.');
    return response(intent,state,period+' staat je winst op '+money(facts.profit)+'. Omzet: '+money(facts.revenue)+'. Kosten: '+money(facts.costs)+'. Nog te ontvangen: '+money(facts.outstandingTotal)+'.',tail,'Bekijk Voor jou',{page:'insights'});
  }
  if(intent===INTENTS.TODAY_ACTIONS){
    const actions=[];
    if(finite(facts.vatUnresolvedDocumentCount)>0)actions.push(finite(facts.vatUnresolvedDocumentCount)+' document'+(finite(facts.vatUnresolvedDocumentCount)===1?'':'en')+' kan je btw-overzicht nog veranderen.');
    if(finite(facts.overdueInvoiceCount)>0)actions.push(finite(facts.overdueInvoiceCount)+' '+(finite(facts.overdueInvoiceCount)===1?'factuur is':'facturen zijn')+' te laat.');
    if(finite(facts.documentReviewCount)>0&&!finite(facts.vatUnresolvedDocumentCount))actions.push(finite(facts.documentReviewCount)+' document'+(finite(facts.documentReviewCount)===1?' moet':'en moeten')+' gecontroleerd worden.');
    if(finite(facts.unmatchedTransactionCount)>0)actions.push(finite(facts.unmatchedTransactionCount)+' banktransactie'+(finite(facts.unmatchedTransactionCount)===1?' moet':'s moeten')+' nog gekoppeld worden.');
    if(!actions.length)return response(intent,'CALM','Alles bijgewerkt.','Je hoeft nu niets te doen.','','',true);
    return response(intent,'ACTION',actions[0],actions.slice(1).join(' '),'Bekijk Voor jou',{page:'insights'});
  }
  if(intent===INTENTS.OVERDUE){
    const count=Math.max(0,Math.round(finite(facts.overdueInvoiceCount))),rows=Array.isArray(facts.overdueInvoices)?facts.overdueInvoices.slice(0,3):[];
    if(!count)return response(intent,'CALM','Er zijn geen te late facturen.','Op basis van je huidige administratie.','Bekijk facturen',{page:'invoices',filter:{status:'open'}});
    const detail=rows.map(row=>String(row.number||'Factuur')+': '+money(row.outstanding)+' · '+Math.max(0,Math.round(finite(row.daysOverdue)))+' dagen te laat').join(' · ');
    return response(intent,'ACTION',count+' '+(count===1?'factuur is':'facturen zijn')+' te laat, samen '+money(facts.overdueOutstanding)+'.',detail,'Bekijk facturen',{page:'invoices',filter:{status:'overdue'}});
  }
  if(intent===INTENTS.OUTSTANDING){
    const overdue=finite(facts.overdueOutstanding);
    return response(intent,overdue>0?'ATTENTION':'CALM','Er staat nog '+money(facts.outstandingTotal)+' open.',overdue>0?'Daarvan is '+money(overdue)+' te laat.':'Er is nu geen te laat bedrag bekend.','Bekijk facturen',{page:'invoices',filter:{status:'open'}});
  }
  if(intent===INTENTS.VAT){
    const unresolved=Math.max(0,Math.round(finite(facts.vatUnresolvedDocumentCount)));
    return response(intent,unresolved?'UNCERTAIN':'INSIGHT','Btw apartzetten: '+money(facts.vatReserve)+'.',unresolved?'Dit kan nog veranderen door '+unresolved+' document'+(unresolved===1?'':'en')+'.':'Op basis van je huidige administratie.','Bekijk btw',{page:'vat'});
  }
  if(intent===INTENTS.VAT_EXPLAIN){
    const unresolved=Math.max(0,Math.round(finite(facts.vatUnresolvedDocumentCount)));
    if(!unresolved)return response(intent,'CALM','Er zijn nu geen bekende documentcontroles die je btw-overzicht veranderen.','Je huidige btw-overzicht is gebaseerd op de administratie die nu bekend is.','Bekijk btw',{page:'vat'});
    return response(intent,'UNCERTAIN',unresolved+' document'+(unresolved===1?' kan':'en kunnen')+' je btw-overzicht nog veranderen.','Controleer deze documenten voordat je op het btw-bedrag vertrouwt.','Controleer documenten',{page:'documents',filter:{status:'needs_review'}});
  }
  if(intent===INTENTS.COST_CHANGE){
    const change=facts.costChange&&typeof facts.costChange==='object'?facts.costChange:null;
    if(!facts.baselineEligible||!change)return response(intent,'UNCERTAIN','Ik heb nog niet genoeg vergelijkbare historie om betrouwbaar te zeggen of je kosten hoger zijn.','Na minimaal drie volledige vergelijkbare perioden kan Boekuna dit beter beoordelen.','Bekijk kosten',{page:'expenses'});
    const category=String(change.category||'').trim();
    return response(intent,'INSIGHT','Je kosten liggen '+money(change.absoluteDelta)+' hoger dan je recente gemiddelde.','Deze periode '+money(change.currentCost)+' tegenover gemiddeld '+money(change.baselineCost)+(category?'. Vooral '+category+' is gestegen.':'.'),'Bekijk kosten',{page:'expenses'});
  }
  if(intent===INTENTS.PROFIT)return response(intent,'INSIGHT',period+' staat je winst op '+money(facts.profit)+'.','Winst is hier omzet minus je zakelijke kosten.','Bekijk rapportages',{page:'reports'});
  if(intent===INTENTS.COSTS)return response(intent,'INSIGHT',period+' zijn je kosten '+money(facts.costs)+'.','Gebaseerd op je huidige administratie.','Bekijk kosten',{page:'expenses'});
  if(intent===INTENTS.DOCUMENTS){
    const count=Math.max(0,Math.round(finite(facts.documentReviewCount)));
    if(!count)return response(intent,'CALM','Er zijn geen bonnetjes of documenten die nu controle nodig hebben.','Je hoeft hier nu niets te doen.','Bekijk documenten',{page:'documents'});
    return response(intent,'ACTION',count+' document'+(count===1?' moet':'en moeten')+' nog gecontroleerd worden.','Open Documenten om de bestaande controle af te ronden.','Controleer documenten',{page:'documents',filter:{status:'needs_review'}});
  }
  if(intent===INTENTS.BANK){
    const count=Math.max(0,Math.round(finite(facts.unmatchedTransactionCount)));
    if(!count)return response(intent,'CALM','Alle bekende banktransacties zijn verwerkt.','Je hoeft hier nu niets te doen.','Bekijk bank',{page:'bank'});
    return response(intent,'ACTION',count+' banktransactie'+(count===1?' moet':'s moeten')+' nog gekoppeld worden.','Controleer welke boeking bij iedere betaling hoort.','Ga naar bank',{page:'bank',filter:{status:'unmatched'}});
  }
  return response(INTENTS.UNSUPPORTED,'UNCERTAIN','Daar kan ik nog geen betrouwbaar antwoord op geven.','Kies een van de voorgestelde vragen.','','',false);
}
function question(id,questionText,intent,score){return {id,question:questionText,intent,score}}
function suggestQuestions(facts={},insights=[],preferences={}){
  const rows=[];
  if(facts.financialReliable===false)return [question('status-unavailable','Wat kan ik nu wel controleren?',INTENTS.TODAY_ACTIONS,100)];
  const goalSet=new Set(Array.isArray(preferences.goals)?preferences.goals:[]);
  const boost=(goal)=>goalSet.has(goal)?60:0;
  if(finite(facts.vatUnresolvedDocumentCount)>0)rows.push(question('vat-change','Waarom kan mijn btw nog veranderen?',INTENTS.VAT_EXPLAIN,100+boost('Btw overzichtelijk houden')));
  if(finite(facts.overdueInvoiceCount)>0)rows.push(question('overdue','Welke facturen zijn te laat?',INTENTS.OVERDUE,95+boost('Facturen betaald krijgen')));
  if(facts.baselineEligible&&facts.costChange)rows.push(question('cost-change','Waarom zijn mijn kosten hoger?',INTENTS.COST_CHANGE,80+boost('Kosten begrijpen')));
  if(finite(facts.documentReviewCount)>0)rows.push(question('documents','Zijn er bonnetjes die ik nog moet controleren?',INTENTS.DOCUMENTS,75+boost('Bonnetjes bijhouden')));
  if(finite(facts.unmatchedTransactionCount)>0)rows.push(question('bank','Welke transacties moet ik nog koppelen?',INTENTS.BANK,70+boost('Administratie bijhouden')));
  if(finite(facts.profit)!==0||finite(facts.revenue)!==0||finite(facts.costs)!==0)rows.push(question('status','Hoe sta ik ervoor?',INTENTS.CURRENT_STATUS,45+boost('Winst volgen')));
  if(!facts.baselineEligible&&finite(facts.revenue)===0&&finite(facts.costs)===0){
    rows.push(question('learn-profit','Wat is winst?',INTENTS.TERM,50));
    rows.push(question('learn-vat','Wat is btw apartzetten?',INTENTS.TERM,45));
  }else if(!rows.length){
    rows.push(question('status-clear','Hoe sta ik ervoor deze maand?',INTENTS.CURRENT_STATUS,50));
    rows.push(question('learn-profit-difference','Wat is winst?',INTENTS.TERM,30));
  }
  const dedup=new Map();
  for(const row of rows){const old=dedup.get(row.question);if(!old||row.score>old.score)dedup.set(row.question,row)}
  return [...dedup.values()].sort((a,b)=>b.score-a.score||a.question.localeCompare(b.question,'nl')).slice(0,5).map(({score,...row})=>row);
}
function knowledgeTopics(){return KNOWLEDGE.map(x=>x.aliases[0])}

root.BoekunaAssistantQna=Object.freeze({
  AI_ENABLED,
  INTENTS,
  MAX_QUESTION_LENGTH,
  routeIntent,
  answer,
  suggestQuestions,
  knowledgeTopics,
  sanitizeActionTarget
});
})(typeof globalThis!=='undefined'?globalThis:this);
