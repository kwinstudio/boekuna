(function(root){
'use strict';

const AI_ENABLED=false;
const THRESHOLDS=Object.freeze({
  COST_SPIKE_PERCENT:0.30,
  COST_SPIKE_MIN_ABSOLUTE:100,
  CATEGORY_SPIKE_PERCENT:0.30,
  CATEGORY_SPIKE_MIN_ABSOLUTE:75,
  BASELINE_MIN_PERIODS:3,
  NEARLY_DUE_DAYS:3,
  HIGH_OUTSTANDING_MIN:1000,
  RECURRING_VENDOR_MIN_OCCURRENCES:3
});
const PRIORITY_WEIGHT=Object.freeze({P0:400,P1:300,P2:200,P3:100});
const PRIORITY_LABEL=Object.freeze({P0:'Nu oplossen',P1:'Aandacht nodig',P2:'Opvallend',P3:'Tip'});

function defaultPreferences(){
  return {
    personalTips:true,
    weeklySummary:true,
    goals:[],
    hiddenTypes:[],
    dismissed:{},
    feedback:{}
  };
}
function finite(v,fallback=0){const n=Number(v);return Number.isFinite(n)?n:fallback}
function round(v){return Math.round((finite(v)+Number.EPSILON)*100)/100}
function money(v){return new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(finite(v))}
function parseDay(v){
  const s=String(v||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
  const d=new Date(s+'T12:00:00Z');
  return Number.isFinite(d.getTime())?d:null;
}
function daysBetween(a,b){
  const da=parseDay(a),db=parseDay(b);
  if(!da||!db)return null;
  return Math.floor((db.getTime()-da.getTime())/86400000);
}
function monthKey(v){return String(v||'').slice(0,7)}
function avg(values){const v=values.map(Number).filter(Number.isFinite);return v.length?round(v.reduce((a,b)=>a+b,0)/v.length):0}
function currentMetric(context){
  const rows=(context.monthlyMetrics||[]).filter(x=>x&&x.month);
  if(!rows.length)return null;
  const nowMonth=monthKey(context.now);
  return rows.find(x=>x.month===nowMonth)||rows[rows.length-1]||null;
}
function buildBaselines(context){
  const current=currentMetric(context),currentMonth=current?.month||monthKey(context.now);
  const history=(context.monthlyMetrics||[])
    .filter(x=>x&&x.complete===true&&x.month&&x.month<currentMonth)
    .sort((a,b)=>String(a.month).localeCompare(String(b.month)))
    .slice(-THRESHOLDS.BASELINE_MIN_PERIODS);
  const categories={};
  for(const row of history){
    for(const [key,value] of Object.entries(row.categories||{})){
      (categories[key]||(categories[key]=[])).push(finite(value));
    }
  }
  const categoryAverages={};
  for(const [key,values] of Object.entries(categories))categoryAverages[key]=avg(values);
  return Object.freeze({
    eligible:history.length>=THRESHOLDS.BASELINE_MIN_PERIODS,
    periodCount:history.length,
    periods:history.map(x=>x.month),
    revenue:avg(history.map(x=>x.revenue)),
    costs:avg(history.map(x=>x.costs)),
    profit:avg(history.map(x=>x.profit)),
    categories:categoryAverages
  });
}
function action(page,filter){return {page,filter:filter||{}}}
function insight(input){
  return {
    id:input.id,
    ruleId:input.ruleId,
    ruleVersion:input.ruleVersion||1,
    type:input.type,
    category:input.category,
    priority:input.priority,
    severity:input.severity||input.priority,
    priorityLabel:PRIORITY_LABEL[input.priority]||'',
    title:input.title,
    summary:input.summary||'',
    detail:input.detail||'',
    reason:input.reason||'',
    sourceFacts:input.sourceFacts||{},
    actionLabel:input.actionLabel||'Bekijken',
    actionTarget:input.actionTarget||null,
    status:'ACTIVE',
    score:finite(input.score),
    expiresAt:input.expiresAt||null
  };
}
function overdueRule(context){
  const rows=(context.invoices||[]).filter(i=>i&&i.kind!=='credit'&&!['draft','cancelled','paid'].includes(String(i.effectiveStatus||''))&&Math.round(finite(i.outstanding)*100)>0&&daysBetween(i.dueDate,context.now)>0);
  if(!rows.length)return [];
  const total=round(rows.reduce((s,i)=>s+finite(i.outstanding),0));
  const lateDays=rows.map(i=>daysBetween(i.dueDate,context.now)).filter(Number.isFinite).map(x=>Math.max(0,x));
  const maxDays=lateDays.length?Math.max(...lateDays):0;
  const title=rows.length===1
    ? '1 factuur is '+maxDays+' dag'+(maxDays===1?'':'en')+' te laat'
    : rows.length+' facturen zijn te laat';
  return [insight({
    id:'OVERDUE_INVOICE:group',ruleId:'INVOICE_OVERDUE_V1',type:'OVERDUE_INVOICE',category:'invoices',priority:'P1',
    title,summary:'Er staat nog '+money(total)+' open.',
    detail:rows.length===1?(String(rows[0].number||'Factuur')+' · vervaldatum '+String(rows[0].dueDate||'')):(maxDays?'De oudste staat '+maxDays+' dagen open na de vervaldatum.':'Controleer de openstaande facturen.'),
    reason:rows.length+' open factuur'+(rows.length===1?'':'en')+' met vervaldatum vóór vandaag en resterend bedrag groter dan nul.',
    sourceFacts:{invoiceCount:rows.length,totalOutstanding:total,maxDaysOverdue:maxDays},
    actionLabel:'Bekijk facturen',actionTarget:action('invoices',{status:'overdue'}),score:Math.min(95,maxDays)+Math.min(100,total/100)
  })];
}
function nearlyDueRule(context){
  const rows=(context.invoices||[]).filter(i=>{
    if(!i||i.kind==='credit'||Math.round(finite(i.outstanding)*100)<=0||['overdue','paid','cancelled'].includes(String(i.effectiveStatus||'')))return false;
    const d=daysBetween(context.now,i.dueDate);
    return Number.isFinite(d)&&d>=0&&d<=THRESHOLDS.NEARLY_DUE_DAYS;
  });
  if(!rows.length)return [];
  const total=round(rows.reduce((s,i)=>s+finite(i.outstanding),0));
  const soonest=Math.min(...rows.map(i=>daysBetween(context.now,i.dueDate)).filter(Number.isFinite));
  return [insight({
    id:'NEARLY_DUE_INVOICE:group',ruleId:'INVOICE_NEARLY_DUE_V1',type:'NEARLY_DUE_INVOICE',category:'invoices',priority:'P2',
    title:rows.length===1?'1 factuur vervalt binnenkort':rows.length+' facturen vervallen binnenkort',
    summary:money(total)+' staat nog open.',
    detail:soonest===0?'De eerste vervalt vandaag.':'De eerste vervalt over '+soonest+' dag'+(soonest===1?'':'en')+'.',
    reason:'Open facturen met een vervaldatum binnen '+THRESHOLDS.NEARLY_DUE_DAYS+' dagen.',
    sourceFacts:{invoiceCount:rows.length,totalOutstanding:total,soonestDueDays:soonest},
    actionLabel:'Bekijk facturen',actionTarget:action('invoices',{status:'open'}),score:THRESHOLDS.NEARLY_DUE_DAYS-soonest
  })];
}
function highOutstandingRule(context,baselines){
  const rows=(context.invoices||[]).filter(i=>i&&i.kind!=='credit'&&Math.round(finite(i.outstanding)*100)>0&&!['paid','cancelled'].includes(String(i.effectiveStatus||'')));
  const total=round(rows.reduce((s,i)=>s+finite(i.outstanding),0));
  if(!rows.length||total<THRESHOLDS.HIGH_OUTSTANDING_MIN)return [];
  const relative=baselines.eligible&&baselines.revenue>0?total/baselines.revenue:null;
  if(relative!=null&&relative<0.5)return [];
  return [insight({
    id:'HIGH_OUTSTANDING:current',ruleId:'HIGH_OUTSTANDING_V1',type:'HIGH_OUTSTANDING',category:'invoices',priority:'P2',
    title:'Er staat '+money(total)+' open',summary:rows.length+' open factuur'+(rows.length===1?'':'en')+'.',
    detail:relative!=null?'Dit is '+Math.round(relative*100)+'% van je gemiddelde maandomzet over de gebruikte vergelijkingsperiode.':'Bekijk welke facturen nog betaald moeten worden.',
    reason:relative!=null?'Openstaand bedrag vergeleken met je eigen recente maandomzet.':'Openstaand bedrag boven de centrale signaleringsdrempel.',
    sourceFacts:{invoiceCount:rows.length,totalOutstanding:total,baselineRevenue:baselines.revenue||null},
    actionLabel:'Bekijk openstaand',actionTarget:action('invoices',{status:'open'}),score:Math.min(100,total/100)
  })];
}
function documentRules(context){
  const docs=context.documents||[],review=docs.filter(d=>d?.status==='review_required'),failed=docs.filter(d=>d?.status==='failed');
  const out=[];
  if(failed.length)out.push(insight({
    id:'DOCUMENT_PROCESSING_FAILED:group',ruleId:'DOCUMENT_FAILED_V1',type:'DOCUMENT_PROCESSING_FAILED',category:'documents',priority:'P1',
    title:failed.length===1?'1 document kon niet verwerkt worden':failed.length+' documenten konden niet verwerkt worden',
    summary:'Controleer het bestand of probeer het opnieuw.',
    reason:'De documentworkflow heeft een definitieve foutstatus teruggegeven.',
    sourceFacts:{documentCount:failed.length},
    actionLabel:'Bekijk documenten',actionTarget:action('documents'),score:40+failed.length
  }));
  if(review.length)out.push(insight({
    id:'DOCUMENT_REVIEW_REQUIRED:group',ruleId:'DOCUMENT_REVIEW_V1',type:'DOCUMENT_REVIEW_REQUIRED',category:'documents',priority:'P1',
    title:review.length===1?'1 document moet worden gecontroleerd':review.length+' documenten moeten worden gecontroleerd',
    summary:'Controleer de gegevens voordat ze als administratie tellen.',
    reason:'De gevalideerde documentworkflow staat op controle nodig.',
    sourceFacts:{documentCount:review.length,vatImpactCount:review.filter(x=>x.accountingImpact==='vat').length},
    actionLabel:'Controleer documenten',actionTarget:action('documents',{status:'needs_review'}),score:35+review.length
  }));
  return out;
}
function bankRules(context){
  const unmatched=(context.transactions||[]).filter(t=>t?.status==='unmatched');
  const out=[];
  if(unmatched.length)out.push(insight({
    id:'BANK_UNMATCHED:group',ruleId:'BANK_UNMATCHED_V1',type:'BANK_UNMATCHED',category:'bank',priority:'P1',
    title:unmatched.length===1?'1 transactie moet nog gekoppeld worden':unmatched.length+' transacties moeten nog gekoppeld worden',
    summary:'Koppel de transacties aan de juiste boeking.',
    reason:'Banktransacties met de bestaande status ongekoppeld.',
    sourceFacts:{transactionCount:unmatched.length},
    actionLabel:'Ga naar bank',actionTarget:action('bank',{status:'unmatched'}),score:20+unmatched.length
  }));
  const suggestions=unmatched.filter(t=>t.matchSuggestion&&t.matchSuggestion.type&&t.matchSuggestion.id);
  if(suggestions.length)out.push(insight({
    id:'BANK_MATCH_AVAILABLE:group',ruleId:'BANK_MATCH_AVAILABLE_V1',type:'BANK_MATCH_AVAILABLE',category:'bank',priority:'P2',
    title:suggestions.length===1?'Voor 1 transactie is een match beschikbaar':'Voor '+suggestions.length+' transacties is een match beschikbaar',
    summary:'Controleer het voorstel voordat je koppelt.',
    reason:'BOEKUNA heeft al een bestaand matchvoorstel voor deze ongekoppelde transactie.',
    sourceFacts:{transactionCount:suggestions.length,suggestionType:String(suggestions[0].matchSuggestion.type)},
    actionLabel:'Controleer matches',actionTarget:action('bank',{status:'unmatched'}),score:10+suggestions.length
  }));
  return out;
}
function vatRules(context){
  const v=context.vat||{},out=[],unresolved=Math.max(0,Math.round(finite(v.unresolvedDocumentCount)));
  if(unresolved)out.push(insight({
    id:'VAT_UNRESOLVED_DOCUMENTS:current',ruleId:'VAT_UNRESOLVED_DOCUMENTS_V1',type:'VAT_UNRESOLVED_DOCUMENTS',category:'vat',priority:'P0',
    title:unresolved===1?'1 document kan je btw-overzicht nog veranderen':unresolved+' documenten kunnen je btw-overzicht nog veranderen',
    summary:'Controleer deze documenten voordat je op het btw-overzicht vertrouwt.',
    reason:'Er zijn gevalideerde documentcontroles open die invloed kunnen hebben op de btw-status.',
    sourceFacts:{documentCount:unresolved,period:String(v.period||'')},
    actionLabel:'Controleer documenten',actionTarget:action('documents',{status:'needs_review'}),score:80+unresolved
  }));
  const reserve=round(v.reserve);
  if(Math.abs(reserve)>0.005)out.push(insight({
    id:'VAT_CURRENT_RESERVE:current',ruleId:'VAT_CURRENT_RESERVE_V1',type:'VAT_CURRENT_RESERVE',category:'vat',priority:'P2',
    title:reserve>=0?'Btw apartzetten: '+money(reserve):'Btw terug te vragen: '+money(Math.abs(reserve)),
    summary:'Gebaseerd op je huidige BOEKUNA-btw-overzicht.',
    detail:unresolved?'Dit bedrag kan nog veranderen zolang documenten controle nodig hebben.':'Er zijn geen bekende open documentcontroles die dit signaal beïnvloeden.',
    reason:'Het bedrag is rechtstreeks overgenomen uit de bestaande BOEKUNA-btw-berekening.',
    sourceFacts:{reserve,period:String(v.period||''),unresolvedDocumentCount:unresolved},
    actionLabel:'Bekijk btw',actionTarget:action('vat'),score:5
  }));
  return out;
}
function costRules(context,baselines){
  if(!baselines.eligible)return [];
  const current=currentMetric(context);
  if(!current)return [];
  const currentCost=round(current.costs),baselineCost=round(baselines.costs),absoluteDelta=round(currentCost-baselineCost),relativeDelta=baselineCost>0?round(absoluteDelta/baselineCost):0,out=[];
  if(baselineCost>0&&relativeDelta>=THRESHOLDS.COST_SPIKE_PERCENT&&absoluteDelta>=THRESHOLDS.COST_SPIKE_MIN_ABSOLUTE){
    out.push(insight({
      id:'COST_SPIKE:'+String(current.month),ruleId:'COST_SPIKE_V1',type:'COST_SPIKE',category:'costs',priority:'P2',
      title:'Je kosten liggen '+money(absoluteDelta)+' hoger dan je recente gemiddelde',
      summary:'Deze maand '+money(currentCost)+' tegenover gemiddeld '+money(baselineCost)+'.',
      detail:'Gebaseerd op je laatste '+baselines.periodCount+' volledige maanden.',
      reason:'Deze maand ligt minimaal '+Math.round(THRESHOLDS.COST_SPIKE_PERCENT*100)+'% én minimaal '+money(THRESHOLDS.COST_SPIKE_MIN_ABSOLUTE)+' boven je eigen recente gemiddelde over '+baselines.periodCount+' volledige maanden.',
      sourceFacts:{period:String(current.month),baselinePeriods:baselines.periodCount,baselineCost,currentCost,absoluteDelta,relativeDelta},
      actionLabel:'Bekijk kosten',actionTarget:action('expenses'),score:Math.min(99,relativeDelta*100+absoluteDelta/100)
    }));
  }
  const spikes=[];
  for(const [category,currentValueRaw] of Object.entries(current.categories||{})){
    const currentValue=round(currentValueRaw),baseline=round(baselines.categories[category]);
    if(!(baseline>0))continue;
    const delta=round(currentValue-baseline),ratio=round(delta/baseline);
    if(ratio>=THRESHOLDS.CATEGORY_SPIKE_PERCENT&&delta>=THRESHOLDS.CATEGORY_SPIKE_MIN_ABSOLUTE)spikes.push({category,currentValue,baseline,delta,ratio});
  }
  spikes.sort((a,b)=>b.delta-a.delta);
  if(spikes.length){
    const top=spikes[0];
    out.push(insight({
      id:'CATEGORY_SPIKE:'+String(current.month),ruleId:'CATEGORY_SPIKE_V1',type:'CATEGORY_SPIKE',category:'costs',priority:'P2',
      title:top.category+' valt op in je kosten',summary:top.category+' ligt '+money(top.delta)+' boven je recente gemiddelde.',
      detail:spikes.length>1?'Ook '+(spikes.length-1)+' andere categorie'+(spikes.length===2?'':'ën')+' wijken duidelijk af.':'Gebaseerd op je eigen recente historie.',
      reason:'Categorie-uitgaven worden pas gemeld na '+baselines.periodCount+' volledige vergelijkingsmaanden en een combinatie van procentuele en absolute afwijking.',
      sourceFacts:{period:String(current.month),baselinePeriods:baselines.periodCount,category:top.category,baseline:top.baseline,current:top.currentValue,absoluteDelta:top.delta,relativeDelta:top.ratio,spikeCount:spikes.length},
      actionLabel:'Bekijk kosten',actionTarget:action('expenses',{category:top.category}),score:Math.min(90,top.ratio*100+top.delta/100)
    }));
  }
  return out;
}
function recurringRules(context){
  const rows=(context.recurringVendors||[]).filter(x=>x&&finite(x.occurrences)>=THRESHOLDS.RECURRING_VENDOR_MIN_OCCURRENCES);
  if(!rows.length)return [];
  const top=rows.slice().sort((a,b)=>finite(b.monthlyAverage)-finite(a.monthlyAverage))[0];
  const key=String(top.key||top.vendor||'vendor').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'vendor';
  return [insight({
    id:'RECURRING_VENDOR:'+key,ruleId:'RECURRING_VENDOR_V1',type:'RECURRING_VENDOR',category:'costs',priority:'P3',
    title:String(top.vendor||'Een leverancier')+' lijkt terugkerend',summary:'Ongeveer '+money(top.monthlyAverage)+' per maand.',
    detail:'Dit is alleen een patroon; BOEKUNA past geen boekingen automatisch aan.',
    reason:'Dezelfde opgeslagen leverancier komt periodiek terug met voldoende waarnemingen.',
    sourceFacts:{vendorKey:key,occurrences:Math.round(finite(top.occurrences)),monthlyAverage:round(top.monthlyAverage)},
    actionLabel:'Bekijk kosten',actionTarget:action('expenses'),score:5
  })];
}
const RULE_REGISTRY=Object.freeze([
  Object.freeze({id:'INVOICE_OVERDUE_V1',version:1,category:'invoices',priority:'P1'}),
  Object.freeze({id:'INVOICE_NEARLY_DUE_V1',version:1,category:'invoices',priority:'P2'}),
  Object.freeze({id:'HIGH_OUTSTANDING_V1',version:1,category:'invoices',priority:'P2'}),
  Object.freeze({id:'DOCUMENT_FAILED_V1',version:1,category:'documents',priority:'P1'}),
  Object.freeze({id:'DOCUMENT_REVIEW_V1',version:1,category:'documents',priority:'P1'}),
  Object.freeze({id:'BANK_UNMATCHED_V1',version:1,category:'bank',priority:'P1'}),
  Object.freeze({id:'BANK_MATCH_AVAILABLE_V1',version:1,category:'bank',priority:'P2'}),
  Object.freeze({id:'VAT_UNRESOLVED_DOCUMENTS_V1',version:1,category:'vat',priority:'P0'}),
  Object.freeze({id:'VAT_CURRENT_RESERVE_V1',version:1,category:'vat',priority:'P2'}),
  Object.freeze({id:'COST_SPIKE_V1',version:1,category:'costs',priority:'P2'}),
  Object.freeze({id:'CATEGORY_SPIKE_V1',version:1,category:'costs',priority:'P2'}),
  Object.freeze({id:'RECURRING_VENDOR_V1',version:1,category:'costs',priority:'P3'})
]);
function preferenceBoost(item,prefs){
  if(!['P2','P3'].includes(item.priority))return 0;
  const goals=Array.isArray(prefs.goals)?prefs.goals:[];
  const map={
    'Facturen betaald krijgen':'invoices',
    'Btw overzichtelijk houden':'vat',
    'Bonnetjes bijhouden':'documents',
    'Kosten begrijpen':'costs',
    'Winst volgen':'reports',
    'Administratie bijhouden':'admin'
  };
  return goals.some(g=>map[g]===item.category)?20:0;
}
function feedbackBoost(item,prefs){
  if(!['P2','P3'].includes(item.priority))return 0;
  const value=prefs.feedback?.[item.type]||prefs.feedback?.[item.id];
  if(value==='helpful'||value==='nuttig')return 5;
  if(value==='not_relevant'||value==='niet_relevant')return -15;
  return 0;
}
function rankInsights(insights,preferences){
  const prefs={...defaultPreferences(),...(preferences||{})};
  return (insights||[]).slice().sort((a,b)=>{
    const p=(PRIORITY_WEIGHT[b.priority]||0)-(PRIORITY_WEIGHT[a.priority]||0);
    if(p)return p;
    const as=finite(a.score)+preferenceBoost(a,prefs)+feedbackBoost(a,prefs),bs=finite(b.score)+preferenceBoost(b,prefs)+feedbackBoost(b,prefs);
    if(bs!==as)return bs-as;
    return String(a.id||'').localeCompare(String(b.id||''));
  });
}
function applyPreferences(items,prefsInput){
  const prefs={...defaultPreferences(),...(prefsInput||{})},hidden=new Set(prefs.hiddenTypes||[]),dismissed=prefs.dismissed||{};
  return items.filter(item=>{
    if(['P0','P1'].includes(item.priority))return true;
    if(item.priority==='P3'&&prefs.personalTips===false)return false;
    if(hidden.has(item.type))return false;
    if(dismissed[item.id]||dismissed[item.type])return false;
    return true;
  });
}
function evaluate(context){
  const ctx=context||{},prefs={...defaultPreferences(),...(ctx.preferences||{})};
  const source=ctx.sourceStatus||{};
  if(source.financialReliable===false)return [];
  const baselines=buildBaselines(ctx);
  let out=[];
  out.push(...overdueRule(ctx));
  out.push(...nearlyDueRule(ctx));
  out.push(...highOutstandingRule(ctx,baselines));
  if(source.documentsReliable!==false){
    out.push(...documentRules(ctx));
    out.push(...vatRules(ctx));
  }else{
    // A document-source error must never be presented as "all clear".
    const v={...(ctx.vat||{}),unresolvedDocumentCount:0};
    out.push(...vatRules({...ctx,vat:v}).filter(x=>x.type==='VAT_CURRENT_RESERVE'));
  }
  out.push(...bankRules(ctx));
  out.push(...costRules(ctx,baselines));
  out.push(...recurringRules(ctx));
  const dedup=new Map();
  for(const item of out){if(item?.id&&!dedup.has(item.id))dedup.set(item.id,item)}
  return rankInsights(applyPreferences([...dedup.values()],prefs),prefs);
}
function dashboardInsights(items){return (items||[]).slice(0,3)}
function adminStatus(context,items){
  const source=context?.sourceStatus||{};
  if(source.financialReliable===false||source.documentsReliable===false)return {state:'UNKNOWN',label:'Status niet beschikbaar',detail:'Een bron kon niet betrouwbaar worden bijgewerkt.'};
  const active=items||evaluate(context||{});
  const actions=active.filter(x=>['P0','P1'].includes(x.priority));
  if(actions.length)return {state:'AANDACHT_NODIG',label:'Heeft aandacht nodig',detail:actions.length+' actie'+(actions.length===1?'':'s')+' te doen.'};
  const operational=active.filter(x=>['documents','bank'].includes(x.category));
  if(operational.length)return {state:'BIJNA_BIJGEWERKT',label:'Bijna bijgewerkt',detail:'Er staan nog enkele administratieve punten open.'};
  return {state:'BIJGEWERKT',label:'Helemaal bijgewerkt',detail:'Je administratie heeft op dit moment geen actie nodig.'};
}
function weeklySummary(context,items){
  const current=currentMetric(context)||{},insights=items||evaluate(context||{});
  const overdue=insights.find(x=>x.type==='OVERDUE_INVOICE'),review=insights.find(x=>x.type==='DOCUMENT_REVIEW_REQUIRED');
  return {
    period:String(current.month||monthKey(context?.now)),
    revenue:round(current.revenue),
    costs:round(current.costs),
    profit:round(current.profit),
    vatReserve:round(context?.vat?.reserve),
    overdueInvoices:Math.round(finite(overdue?.sourceFacts?.invoiceCount)),
    documentsToReview:Math.round(finite(review?.sourceFacts?.documentCount))
  };
}
function sourceFactsForDetail(item){return item&&item.sourceFacts?{...item.sourceFacts}:{}}

root.BoekunaPersonalInsights=Object.freeze({
  AI_ENABLED,
  THRESHOLDS,
  RULE_REGISTRY,
  PRIORITY_LABEL,
  defaultPreferences,
  buildBaselines,
  evaluate,
  rankInsights,
  dashboardInsights,
  adminStatus,
  weeklySummary,
  sourceFactsForDetail
});
})(typeof window!=='undefined'?window:globalThis);
