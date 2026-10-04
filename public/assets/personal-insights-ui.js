(function(root){
'use strict';

const GOALS=['Facturen betaald krijgen','Btw overzichtelijk houden','Bonnetjes bijhouden','Kosten begrijpen','Winst volgen','Administratie bijhouden'];
const SAFE_VAT_REVIEW_FIELDS=new Set(['net','vatAmount','gross','vatRate','vatLines']);
const ASSISTANT_METRIC_EVENTS=new Set(['insight_shown','insight_opened','action_clicked','dismissed','helpful','not_relevant']);
const assistantShownThisSession=new Set();

function engine(){return root.BoekunaPersonalInsights}
function prefs(){
  const defaults=engine()?.defaultPreferences?.()||{personalTips:true,weeklySummary:true,goals:[],hiddenTypes:[],dismissed:{},feedback:{}};
  const current=state?.assistant&&typeof state.assistant==='object'?state.assistant:{};
  return {
    ...defaults,...current,
    goals:Array.isArray(current.goals)?current.goals:[],
    hiddenTypes:Array.isArray(current.hiddenTypes)?current.hiddenTypes:[],
    dismissed:current.dismissed&&typeof current.dismissed==='object'?current.dismissed:{},
    feedback:current.feedback&&typeof current.feedback==='object'?current.feedback:{}
  };
}
function assistantMonthMetrics(){
  const rows=new Map(),ensure=month=>{
    if(!/^\d{4}-\d{2}$/.test(month))return null;
    if(!rows.has(month))rows.set(month,{month,complete:month<today().slice(0,7),revenue:0,costs:0,profit:0,categories:{},activity:0});
    return rows.get(month);
  };
  for(const i of state.invoices||[]){
    if(i.status==='draft'||!i.issueDate)continue;
    const row=ensure(String(i.issueDate).slice(0,7));if(!row)continue;
    row.revenue=roundMoney(row.revenue+invoiceNet(i));row.activity++;
  }
  for(const e of state.expenses||[]){
    if(!e?.date)continue;
    const row=ensure(String(e.date).slice(0,7));if(!row)continue;
    const value=roundMoney(Number(e.exVat||0)),category=String(e.category||'Overig').trim()||'Overig';
    row.costs=roundMoney(row.costs+value);row.categories[category]=roundMoney(Number(row.categories[category]||0)+value);row.activity++;
  }
  ensure(today().slice(0,7));
  return [...rows.values()].filter(x=>!x.complete||x.activity>0).sort((a,b)=>a.month.localeCompare(b.month)).slice(-13).map(x=>({...x,profit:roundMoney(x.revenue-x.costs)}));
}
function assistantRecurringVendors(){
  const groups=new Map();
  for(const e of state.expenses||[]){
    if(!e?.vendor||!e?.date||Number(e.exVat||0)<=0)continue;
    const normalized=String(e.vendor).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
    if(!normalized)continue;
    const g=groups.get(normalized)||{key:normalized,vendor:String(e.vendor),months:new Map(),occurrences:0};
    const month=String(e.date).slice(0,7);g.months.set(month,roundMoney(Number(g.months.get(month)||0)+Number(e.exVat||0)));g.occurrences++;groups.set(normalized,g);
  }
  return [...groups.values()].filter(g=>g.months.size>=3&&g.occurrences>=3).map(g=>({
    key:g.key,vendor:g.vendor,occurrences:g.occurrences,
    monthlyAverage:roundMoney([...g.months.values()].reduce((a,b)=>a+b,0)/g.months.size)
  }));
}
function assistantSafeDocumentFacts(){
  const map=new Map(),add=(id,status,accountingImpact='')=>{
    const key=String(id||'');if(!key)return;
    const existing=map.get(key);
    if(existing?.status==='failed')return;
    map.set(key,{id:key,status,accountingImpact:accountingImpact||existing?.accountingImpact||''});
  };
  for(const job of (typeof documentProcessingJobs!=='undefined'&&Array.isArray(documentProcessingJobs)?documentProcessingJobs:[])){
    const status=String(job?.state||'');
    if(status==='failed')add(job.id||job.client_ref,'failed');
    else if(status==='review_required')add(job.id||job.client_ref,'review_required');
  }
  for(const d of state.documents||[]){
    const processing=String(d?.processingState||''),verification=String(d?.verification?.status||d?.verificationStatus||'');
    if(processing==='failed')add(d.id||d.fileId,'failed');
    else if(processing==='review_required')add(d.id||d.fileId,'review_required');
    if(verification==='needs_review'){
      const diffs=Array.isArray(d?.verification?.differences)?d.verification.differences:[],financialIssues=Array.isArray(d?.verification?.financialIssues)?d.verification.financialIssues:[];
      const affectsVat=financialIssues.length>0||diffs.some(x=>SAFE_VAT_REVIEW_FIELDS.has(String(x?.field||'')));
      add(d.id||d.fileId,'review_required',affectsVat?'vat':'');
    }
  }
  return [...map.values()];
}
function assistantContext(){
  const documents=assistantSafeDocumentFacts();
  return {
    now:today(),
    invoices:(state.invoices||[]).filter(i=>i.status!=='draft').map(i=>({
      id:String(i.id||''),number:String(i.number||''),kind:String(i.kind||'invoice'),effectiveStatus:invoiceEffectiveStatus(i),
      issueDate:String(i.issueDate||''),dueDate:String(i.dueDate||''),gross:invoiceGross(i),paid:invoicePaidAmount(i),outstanding:invoiceOutstanding(i),
      customerName:String(getContact(i.customerId)?.name||'')
    })),
    expenses:(state.expenses||[]).map(e=>({
      id:String(e.id||''),date:String(e.date||''),vendor:String(e.vendor||''),net:Number(e.exVat||0),vat:expenseVat(e),gross:expenseGross(e),
      vatRates:Array.isArray(e.vatLines)?e.vatLines.map(x=>Number(x?.rate)).filter(Number.isFinite):[Number(e.vatRate)].filter(Number.isFinite),mixedVat:!!e.mixedRates
    })),
    transactions:(state.transactions||[]).map(t=>({
      id:String(t.id||''),status:String(t.status||'unmatched'),date:String(t.date||''),amount:Number(t.amount||0),
      matchSuggestion:t.matchSuggestion&&t.matchSuggestion.type&&t.matchSuggestion.id?{type:String(t.matchSuggestion.type),id:String(t.matchSuggestion.id),label:String(t.matchSuggestion.label||'')}:null
    })),
    documents,
    monthlyMetrics:assistantMonthMetrics(),
    recurringVendors:assistantRecurringVendors(),
    vat:{reserve:quarterVatPosition(),period:'Q'+currentQuarter()+' '+currentBookYear(),unresolvedDocumentCount:documents.filter(d=>d.status==='review_required'&&d.accountingImpact==='vat').length},
    sourceStatus:{documentsReliable:!(typeof documentProcessingFetchError!=='undefined'&&documentProcessingFetchError),financialReliable:true},
    preferences:prefs()
  };
}
function snapshot(){
  const E=engine();
  if(!E)return {ok:false,error:'ENGINE_UNAVAILABLE',context:null,insights:[],status:{state:'UNKNOWN',label:'Status niet beschikbaar',detail:'De assistent kon niet worden geladen.'}};
  try{
    const context=assistantContext(),insights=E.evaluate(context),status=E.adminStatus(context,insights);
    return {ok:true,context,insights,status,weekly:E.weeklySummary(context,insights)};
  }catch(error){
    console.warn('BOEKUNA assistant unavailable',error?.message||'UNKNOWN');
    return {ok:false,error:'ENGINE_ERROR',context:null,insights:[],status:{state:'UNKNOWN',label:'Status niet beschikbaar',detail:'Je administratie blijft gewoon werken.'}};
  }
}
function iconFor(item){
  if(item?.priority==='P0'||item?.priority==='P1')return 'i-clock';
  if(item?.category==='vat')return 'i-tax';
  if(item?.category==='documents')return 'i-folder';
  if(item?.category==='invoices')return 'i-file';
  if(item?.category==='bank')return 'i-bank';
  return 'i-chart';
}
function recordAssistantMetric(event){
  if(!ASSISTANT_METRIC_EVENTS.has(event)||!currentUser)return;
  state.assistant=prefs();
  const current=state.assistant.metrics&&typeof state.assistant.metrics==='object'?state.assistant.metrics:{};
  const counts=current.counts&&typeof current.counts==='object'?current.counts:{};
  state.assistant.metrics={counts:{...counts,[event]:Math.max(0,Math.round(Number(counts[event]||0)))+1},lastEventAt:new Date().toISOString()};
  save();
}
function noteAssistantShown(items){
  let added=0;
  for(const item of items||[]){
    const key=String(item?.id||'');if(!key||assistantShownThisSession.has(key))continue;
    assistantShownThisSession.add(key);added++;
  }
  if(!added||!currentUser)return;
  state.assistant=prefs();
  const current=state.assistant.metrics&&typeof state.assistant.metrics==='object'?state.assistant.metrics:{};
  const counts=current.counts&&typeof current.counts==='object'?current.counts:{};
  state.assistant.metrics={counts:{...counts,insight_shown:Math.max(0,Math.round(Number(counts.insight_shown||0)))+added},lastEventAt:new Date().toISOString()};
  save();
}
function assistantCard(item,compact=false){
  return '<button type="button" class="assistant-insight-card" data-priority="'+esc(item.priority)+'" onclick="openAssistantInsight('+esc(JSON.stringify(item.id))+')" aria-label="'+esc(item.title)+'. '+esc(item.summary)+'">'+
   '<span class="assistant-insight-icon" aria-hidden="true">'+icon(iconFor(item))+'</span>'+
   '<span class="assistant-insight-copy"><strong>'+esc(item.title)+'</strong><span>'+esc(item.summary)+(compact?'':' · '+esc(item.priorityLabel))+'</span></span>'+
   '<span class="assistant-insight-chevron" aria-hidden="true">›</span></button>'
}
function renderAssistantDashboard(){
  const E=engine(),s=snapshot();
  if(!s.ok||s.status.state==='UNKNOWN'){
    return '<section class="card dashboard-attention assistant-dashboard assistant-source-error"><div class="section-head"><div><h2 class="assistant-dashboard-title">'+icon('i-clock')+' Voor jou</h2><p>Persoonlijke administratiehulp</p></div></div><div class="assistant-empty assistant-source-error">'+icon('i-clock')+'<div><strong>Status tijdelijk niet beschikbaar</strong><span>Je administratie blijft werken. Boekuna toont liever niets dan een onbetrouwbaar inzicht.</span><button class="btn small" type="button" style="margin-top:9px" onclick="retryDocumentAttentionFetch()">Opnieuw proberen</button></div></div></section>';
  }
  const items=E.dashboardInsights(s.insights);noteAssistantShown(items);
  const body=items.length?'<div class="assistant-insight-list">'+items.map(x=>assistantCard(x,true)).join('')+'</div>':'<div class="assistant-empty">'+icon('i-check')+'<div><strong>Alles bijgewerkt</strong><span>Je administratie heeft op dit moment geen aandacht nodig.</span></div></div>';
  return '<section class="card dashboard-attention assistant-dashboard"><div class="section-head"><div><h2 class="assistant-dashboard-title">'+icon('i-chart')+' Voor jou</h2><p>Wat nu belangrijk is in jouw administratie</p></div><span class="badge '+(s.status.state==='BIJGEWERKT'?'good':s.status.state==='AANDACHT_NODIG'?'warn':'')+'">'+esc(s.status.label)+'</span></div>'+body+
   '<div class="assistant-dashboard-footer"><span class="assistant-admin-label"><strong>'+esc(s.status.label)+'</strong> · '+esc(s.status.detail)+'</span><button type="button" class="link-btn" onclick="navigate(\'insights\')">Bekijk alle inzichten</button></div></section>'
}
function groupSection(title,items,iconId){
  if(!items.length)return '';
  return '<section class="card assistant-group"><div class="section-head"><div><h2 class="assistant-group-title">'+icon(iconId)+' '+esc(title)+'</h2></div><span class="section-meta">'+items.length+'</span></div><div class="assistant-insight-list">'+items.map(x=>assistantCard(x)).join('')+'</div></section>'
}
function renderWeekly(summary){
  return '<aside class="card assistant-week"><div class="section-head"><div><h2>Je week in Boekuna</h2><p>Stand van deze maand</p></div></div><div class="assistant-week-grid">'+
    [['Omzet',money(summary.revenue)],['Kosten',money(summary.costs)],['Winst',money(summary.profit)],['Btw apartzetten',money(summary.vatReserve)]].map(([label,value])=>'<div class="assistant-week-stat"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('')+
    '</div><div class="help" style="margin-top:10px">'+(summary.overdueInvoices?summary.overdueInvoices+' factuur'+(summary.overdueInvoices===1?'':'en')+' te laat · ':'')+(summary.documentsToReview?summary.documentsToReview+' document'+(summary.documentsToReview===1?'':'en')+' controleren':'Geen open documentcontrole')+'</div></aside>'
}
function renderMonthEnd(s){
  const month=new Intl.DateTimeFormat('nl-NL',{month:'long'}).format(new Date((s.context?.now||today())+'T12:00:00'));
  const review=s.insights.some(x=>['DOCUMENT_REVIEW_REQUIRED','DOCUMENT_PROCESSING_FAILED','VAT_UNRESOLVED_DOCUMENTS'].includes(x.type));
  const bank=s.insights.some(x=>x.type==='BANK_UNMATCHED');
  const overdue=s.insights.some(x=>x.type==='OVERDUE_INVOICE');
  const rows=[
    ['Documenten verwerkt',!review],
    ['Bank bijgewerkt',!bank],
    ['Geen facturen te laat',!overdue]
  ];
  return '<section class="card assistant-week"><div class="section-head"><div><h2>'+esc(month.charAt(0).toUpperCase()+month.slice(1))+' afronden</h2><p>Administratieve checklist, geen periode-lock.</p></div></div><div class="assistant-month-list">'+rows.map(([label,ok])=>'<div class="assistant-month-row"><span aria-hidden="true">'+(ok?'✓':'•')+'</span><strong>'+esc(label)+'</strong><em>'+esc(ok?'Klaar':'Aandacht')+'</em></div>').join('')+'</div></section>'
}
function renderInsights(){
  const s=snapshot(),E=engine();
  if(!s.ok||s.status.state==='UNKNOWN')return '<div class="page-head"><div><h1>Voor jou</h1><p>Persoonlijke administratiehulp</p></div></div><div class="card assistant-status-card"><div class="assistant-status-line">'+icon('i-clock')+'<div><strong>Status tijdelijk niet beschikbaar</strong><span>Boekuna toont geen geruststellende status zolang een bron niet betrouwbaar beschikbaar is.</span></div></div></div>';
  noteAssistantShown(s.insights);
  const urgent=s.insights.filter(x=>['P0','P1'].includes(x.priority));
  const remaining=s.insights.filter(x=>!['P0','P1'].includes(x.priority));
  const moneyItems=remaining.filter(x=>['invoices','costs'].includes(x.category));
  const vat=remaining.filter(x=>x.category==='vat');
  const admin=remaining.filter(x=>['documents','bank','admin'].includes(x.category));
  const other=remaining.filter(x=>!['invoices','costs','vat','documents','bank','admin'].includes(x.category));
  const noItems=!s.insights.length;
  const empty=noItems?'<section class="card assistant-group"><div class="assistant-empty">'+icon('i-check')+'<div><strong>Alles bijgewerkt</strong><span>Je administratie heeft op dit moment geen aandacht nodig. Boekuna vult de pagina niet met algemene tips.</span></div></div></section>':'';
  const main=empty+groupSection('Vandaag',urgent,'i-clock')+groupSection('Geld',moneyItems,'i-chart')+groupSection('Btw',vat,'i-tax')+groupSection('Administratie',admin,'i-check')+groupSection('Opvallend',other,'i-chart');
  return '<div class="page-head"><div><h1>Voor jou</h1><p>Boekuna kijkt mee en laat zien wat voor jou belangrijk is.</p></div></div>'+
   '<div class="card assistant-status-card"><div class="assistant-status-line">'+icon(s.status.state==='BIJGEWERKT'?'i-check':'i-clock')+'<div><strong>'+esc(s.status.label)+'</strong><span>'+esc(s.status.detail)+'</span></div></div></div>'+
   '<div class="assistant-page-grid"><div class="assistant-section-stack">'+main+'</div><div class="assistant-section-stack">'+(prefs().weeklySummary!==false?renderWeekly(s.weekly):'')+renderMonthEnd(s)+'</div></div>'+
   '<p class="assistant-disclaimer">Boekuna helpt je administratie bijhouden. Voor persoonlijk fiscaal advies kun je een adviseur raadplegen.</p>'
}
function factLabel(key,value){
  const labels={invoiceCount:'Aantal facturen',totalOutstanding:'Nog te ontvangen',maxDaysOverdue:'Langst te laat',documentCount:'Documenten',transactionCount:'Transacties',baselinePeriods:'Vergelijkingsmaanden',baselineCost:'Gemiddelde kosten',currentCost:'Kosten deze maand',absoluteDelta:'Verschil',relativeDelta:'Relatief verschil',reserve:'Btw-positie',period:'Periode',category:'Categorie',occurrences:'Waarnemingen',monthlyAverage:'Gemiddeld per maand'};
  if(!labels[key])return null;
  let shown=value;
  if(['totalOutstanding','baselineCost','currentCost','absoluteDelta','reserve','monthlyAverage'].includes(key))shown=money(Number(value||0));
  else if(key==='relativeDelta')shown=Math.round(Number(value||0)*100)+'%';
  else if(key==='maxDaysOverdue')shown=Number(value||0)+' dagen';
  return [labels[key],String(shown)]
}
function openAssistantInsight(id){
  const s=snapshot(),item=s.insights.find(x=>x.id===id);
  if(!item){toast('Dit aandachtspunt is al opgelost of niet meer actueel.');if(page==='insights'||page==='dashboard')render();return}
  recordAssistantMetric('insight_opened');
  const facts=Object.entries(item.sourceFacts||{}).map(([k,v])=>factLabel(k,v)).filter(Boolean).map(([label,value])=>'<div class="assistant-detail-fact"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('');
  const canHide=['P2','P3'].includes(item.priority),footer='<button class="btn" onclick="closeModal()">Sluiten</button>'+(canHide?'<button class="btn" onclick="dismissAssistantInsight('+esc(JSON.stringify(item.id))+')">Niet meer tonen</button>':'')+(item.actionTarget?'<button class="btn primary" onclick="runAssistantInsightAction('+esc(JSON.stringify(item.id))+')">'+esc(item.actionLabel)+'</button>':'');
  modal(item.title,'<div class="assistant-detail-section"><h4>Wat zien we?</h4><p>'+esc(item.summary)+(item.detail?' '+esc(item.detail):'')+'</p></div><div class="assistant-detail-section"><h4>Waarom zie je dit?</h4><p>'+esc(item.reason)+'</p>'+facts+'</div><div class="assistant-detail-section"><h4>Wat kun je doen?</h4><p>'+(item.actionTarget?esc(item.actionLabel)+'.':'Er is nu geen actie nodig.')+'</p></div><div class="assistant-feedback"><button type="button" class="btn small" onclick="assistantFeedback('+esc(JSON.stringify(item.id))+',\'helpful\')">Nuttig</button><button type="button" class="btn small" onclick="assistantFeedback('+esc(JSON.stringify(item.id))+',\'not_relevant\')">Niet relevant</button></div>',footer,true)
}
function runAssistantInsightAction(id){
  const s=snapshot(),item=s.insights.find(x=>x.id===id);
  if(!item){closeModal();toast('Dit aandachtspunt is al opgelost.');render();return}
  const target=item.actionTarget;if(!target?.page)return;
  recordAssistantMetric('action_clicked');
  closeModal();
  const entries=Object.entries(target.filter||{});
  if(entries.length===1){
    const [key,value]=entries[0],list=listPageState(target.page);
    if(list?.filters&&Object.prototype.hasOwnProperty.call(list.filters,key)){void navigateWithFilter(target.page,key,value);return}
  }
  void navigate(target.page)
}
function assistantFeedback(id,value){
  const s=snapshot(),item=s.insights.find(x=>x.id===id);if(!item)return;
  state.assistant=prefs();state.assistant.feedback={...state.assistant.feedback,[item.type]:value};recordAssistantMetric(value==='helpful'?'helpful':'not_relevant');
  toast(value==='helpful'?'Bedankt. Dit helpt Boekuna beter prioriteren.':'Begrepen. Minder relevante inzichten krijgen lager gewicht.');
  closeModal();if(page==='insights'||page==='dashboard')render()
}
function dismissAssistantInsight(id){
  const s=snapshot(),item=s.insights.find(x=>x.id===id);if(!item)return;
  if(['P0','P1'].includes(item.priority)){toast('Belangrijke aandachtspunten kunnen niet permanent worden verborgen.');return}
  state.assistant=prefs();state.assistant.hiddenTypes=[...new Set([...(state.assistant.hiddenTypes||[]),item.type])];recordAssistantMetric('dismissed');closeModal();render();toast('Dit type inzicht wordt niet meer getoond')
}
function setAssistantPreference(key,value){
  if(!['personalTips','weeklySummary'].includes(key))return;
  state.assistant=prefs();state.assistant[key]=!!value;save();render()
}
function toggleAssistantGoal(goal,enabled){
  if(!GOALS.includes(goal))return;
  state.assistant=prefs();const next=new Set(state.assistant.goals||[]);enabled?next.add(goal):next.delete(goal);state.assistant.goals=[...next];save()
}
function restoreHiddenAssistantInsights(){
  state.assistant=prefs();state.assistant.hiddenTypes=[];state.assistant.dismissed={};save();render();toast('Verborgen tips zijn hersteld')
}
function renderAssistantSettings(){
  const p=prefs();
  return '<section class="settings-group"><h2 class="settings-group-label">Assistent & inzichten</h2><div class="card settings-compact">'+
   '<div class="section-head"><div><h3>Voor jou</h3><p>Persoonlijke signalen uit je eigen administratie.</p></div><span class="badge good">Zonder externe AI</span></div>'+
   '<div class="assistant-setting-row"><div class="assistant-setting-copy"><strong>Persoonlijke tips</strong><span>Toon alleen tips die passen bij je eigen administratie.</span></div><button type="button" class="toggle '+(p.personalTips!==false?'on':'')+'" role="switch" aria-checked="'+(p.personalTips!==false?'true':'false')+'" aria-label="Persoonlijke tips" onclick="setAssistantPreference(\'personalTips\','+(p.personalTips===false?'true':'false')+')"><span></span></button></div>'+
   '<div class="assistant-setting-row"><div class="assistant-setting-copy"><strong>Wekelijkse samenvatting</strong><span>Toon de in-app samenvatting op Voor jou. Er wordt geen e-mail verstuurd.</span></div><button type="button" class="toggle '+(p.weeklySummary!==false?'on':'')+'" role="switch" aria-checked="'+(p.weeklySummary!==false?'true':'false')+'" aria-label="Wekelijkse samenvatting" onclick="setAssistantPreference(\'weeklySummary\','+(p.weeklySummary===false?'true':'false')+')"><span></span></button></div>'+
   '<div style="margin-top:14px"><strong style="font-size:12px">Waar wil je vooral hulp bij?</strong><div class="assistant-settings-goals">'+GOALS.map(g=>'<label class="assistant-goal"><input type="checkbox" '+(p.goals.includes(g)?'checked':'')+' onchange="toggleAssistantGoal('+esc(JSON.stringify(g))+',this.checked)"><span>'+esc(g)+'</span></label>').join('')+'</div></div>'+
   '<div class="assistant-settings-actions"><button type="button" class="btn" onclick="restoreHiddenAssistantInsights()">Verborgen tips herstellen</button><button type="button" class="btn" onclick="navigate(\'insights\')">Open Voor jou</button></div>'+
   '<p class="assistant-disclaimer">Financiële bedragen en statussen komen uit de bestaande Boekuna-berekeningen. Voorkeuren bepalen alleen wat hoger of lager wordt getoond; belangrijke financiële waarschuwingen blijven zichtbaar.</p></div></section>'
}

root.renderAssistantDashboard=renderAssistantDashboard;
root.renderInsights=renderInsights;
root.renderAssistantSettings=renderAssistantSettings;
root.openAssistantInsight=openAssistantInsight;
root.runAssistantInsightAction=runAssistantInsightAction;
root.assistantFeedback=assistantFeedback;
root.dismissAssistantInsight=dismissAssistantInsight;
root.setAssistantPreference=setAssistantPreference;
root.toggleAssistantGoal=toggleAssistantGoal;
root.restoreHiddenAssistantInsights=restoreHiddenAssistantInsights;
root.__boekunaAssistantTest={context:assistantContext,snapshot};
})(typeof window!=='undefined'?window:globalThis);
