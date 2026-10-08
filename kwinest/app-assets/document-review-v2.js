(function(global){
'use strict';

const legacyShowPdfImportReview=global.showPdfImportReview;
const legacySavePdfInvoiceImport=global.savePdfInvoiceImport;
const legacyOpenPersistentDocumentReview=global.openPersistentDocumentReview;
const legacyAttentionRows=global.attentionRows;
const legacyPersistentDocumentReviewActionForFile=global.persistentDocumentReviewActionForFile;
const legacyApplyFinancialCorrectionProposal=global.applyFinancialCorrectionProposal;
const legacyConfirmSuggestedFinancialRate=global.confirmSuggestedFinancialRate;

const OPTIONAL_FIELDS=[
  'address','postal','city','email','phone','kvk','vatId','iban','dueDate','paymentReference',
  'orderNumber','paymentTermDays','description','paymentMethod','currency'
];
const REQUIREMENTS={
  receipt:{
    blocking:['party','issueDate','net','vatAmount','gross','vatRate'],
    attention:['party','category'],
    optional:['invoiceNumber',...OPTIONAL_FIELDS]
  },
  purchase_invoice:{
    blocking:['party','issueDate','invoiceNumber','net','vatAmount','gross','vatRate'],
    attention:['category'],
    optional:[...OPTIONAL_FIELDS]
  },
  sale_invoice:{
    blocking:['party','issueDate','invoiceNumber','net','vatAmount','gross','vatRate'],
    attention:[],
    optional:['category',...OPTIONAL_FIELDS]
  },
  sales_invoice:{
    blocking:['party','issueDate','invoiceNumber','net','vatAmount','gross','vatRate'],
    attention:[],
    optional:['category',...OPTIONAL_FIELDS]
  },
  credit_invoice:{
    blocking:['party','issueDate','invoiceNumber','net','vatAmount','gross','vatRate'],
    attention:['category'],
    optional:[...OPTIONAL_FIELDS]
  },
  invoice:{
    blocking:['party','issueDate','invoiceNumber','net','vatAmount','gross','vatRate'],
    attention:['category'],
    optional:[...OPTIONAL_FIELDS]
  },
  other:{
    blocking:['issueDate','gross'],
    attention:['party','category'],
    optional:['invoiceNumber','net','vatAmount','vatRate','vatLines',...OPTIONAL_FIELDS]
  }
};
const LABELS={
  party:'Leverancier',issueDate:'Datum',invoiceNumber:'Factuurnummer',category:'Categorie',
  net:'Bedrag excl. btw',vatAmount:'Btw-bedrag',gross:'Totaal',vatRate:'Btw-percentage',vatLines:'Btw-verdeling'
};
const NORMAL_RATES=[9,21];
const NL_BOOKABLE_RATES=[0,9,21];
const SAVE_REQUIRED=['party','issueDate','net','vatAmount','gross','vatRate'];

function requirementsFor(type){
  const key=String(type||'other').toLowerCase();
  const src=REQUIREMENTS[key]||REQUIREMENTS.other;
  return {blocking:[...src.blocking],attention:[...src.attention],optional:[...new Set(src.optional)]};
}
function reviewDocumentType(d){
  return String(d?.documentType||'other');
}
function cents(value){
  if(typeof financialReviewCentsFromInput==='function')return financialReviewCentsFromInput(value);
  const n=typeof parseSignedMoneyValue==='function'?parseSignedMoneyValue(value):Number(String(value).replace(',','.'));
  return typeof financialMoneyCents==='function'?financialMoneyCents(n):Number.isFinite(n)?Math.round(n*100):null;
}
function formatCents(value){return value==null?'':(value/100).toFixed(2)}
function normalizeCurrencyCode(value){return String(value||'EUR').trim().toUpperCase()}
function parseExchangeRateToEur(value){
  const raw=String(value??'').trim().replace(',','.');
  if(!/^\d+(?:\.\d{1,8})?$/.test(raw))return null;
  const parts=raw.split('.'),whole=(parts[0].replace(/^0+(?=\d)/,'')||'0'),fraction=(parts[1]||'').replace(/0+$/,'');
  const numerator=BigInt(whole+(fraction||'')),denominator=10n**BigInt(fraction.length);
  if(numerator<=0n)return null;
  return {numerator,denominator,normalized:fraction?whole+'.'+fraction:whole}
}
function roundBigRatio(numerator,denominator){
  if(typeof numerator!=='bigint'||typeof denominator!=='bigint'||denominator<=0n)return null;
  const sign=numerator<0n?-1n:1n,abs=numerator<0n?-numerator:numerator;
  let quotient=abs/denominator;
  if((abs%denominator)*2n>=denominator)quotient+=1n;
  return quotient*sign
}
function convertSourceCentsToEur(sourceCents,rateText){
  if(!Number.isSafeInteger(sourceCents))return null;
  const rate=parseExchangeRateToEur(rateText);if(!rate)return null;
  const out=roundBigRatio(BigInt(sourceCents)*rate.numerator,rate.denominator);
  if(out==null)return null;
  const n=Number(out);return Number.isSafeInteger(n)?n:null
}
function sourceMoney(value,currency='EUR'){
  const code=normalizeCurrencyCode(currency);
  try{return new Intl.NumberFormat('nl-NL',{style:'currency',currency:/^[A-Z]{3}$/.test(code)?code:'EUR'}).format(Number(value||0))}
  catch(_){return code+' '+Number(value||0).toFixed(2)}
}
function foreignCurrencyReviewState(d){
  const f=document.getElementById('pdfImportForm'),value=k=>String(f?.elements.namedItem(k)?.value??'').trim();
  const currency=normalizeCurrencyCode(value('currency')||d?.currency||'EUR');
  const sourceCents={net:cents(value('net')),vatAmount:cents(value('vatAmount')),gross:cents(value('gross'))};
  const sourceAmounts=Object.fromEntries(Object.entries(sourceCents).map(([k,v])=>[k,v==null?null:v/100]));
  if(currency==='EUR')return {currency,rate:null,confirmed:true,sourceCents,sourceAmounts,bookingAmountsEur:sourceAmounts,bookingVatLinesEur:[]};
  const rate=parseExchangeRateToEur(value('exchangeRateToEur')||d?.exchangeRateToEur||'');
  const confirmed=!!rate&&value('exchangeRateConfirmed')==='on'&&d?.exchangeRateConfirmed===true&&String(d?.exchangeRateToEur||'')===rate.normalized;
  if(!rate||Object.values(sourceCents).some(v=>v==null)||sourceCents.net+sourceCents.vatAmount!==sourceCents.gross){
    return {currency,rate,confirmed,sourceCents,sourceAmounts,bookingAmountsEur:null,bookingVatLinesEur:[]}
  }
  let netC,vatC,bookingVatLinesEur=[];
  if(d?.mixedRates){
    const rows=document.querySelector('.mixed-vat-row')?readMixedVatEditor():(d.vatLines||[]).map(x=>({rate:Number(x.rate),netC:cents(x.taxableAmount),vatC:cents(x.vatAmount),valid:true}));
    if(rows.length<2||rows.some(x=>!x.valid||x.netC==null||x.vatC==null))return {currency,rate,confirmed,sourceCents,sourceAmounts,bookingAmountsEur:null,bookingVatLinesEur:[]};
    const converted=rows.map(x=>({rate:x.rate,netC:convertSourceCentsToEur(x.netC,rate.normalized),vatC:convertSourceCentsToEur(x.vatC,rate.normalized)}));
    if(converted.some(x=>x.netC==null||x.vatC==null))return {currency,rate,confirmed,sourceCents,sourceAmounts,bookingAmountsEur:null,bookingVatLinesEur:[]};
    bookingVatLinesEur=converted.map(x=>({rate:x.rate,taxableAmount:x.netC/100,vatAmount:x.vatC/100}));
    netC=converted.reduce((sum,x)=>sum+x.netC,0);
    vatC=converted.reduce((sum,x)=>sum+x.vatC,0);
  }else{
    netC=convertSourceCentsToEur(sourceCents.net,rate.normalized);
    vatC=convertSourceCentsToEur(sourceCents.vatAmount,rate.normalized)
  }
  if(netC==null||vatC==null)return {currency,rate,confirmed,sourceCents,sourceAmounts,bookingAmountsEur:null,bookingVatLinesEur:[]};
  const grossC=netC+vatC;
  if(!Number.isSafeInteger(grossC))return {currency,rate,confirmed,sourceCents,sourceAmounts,bookingAmountsEur:null,bookingVatLinesEur:[]};
  return {currency,rate,confirmed,sourceCents,sourceAmounts,bookingAmountsEur:{net:netC/100,vatAmount:vatC/100,gross:grossC/100},bookingVatLinesEur}
}
function updateForeignCurrencyPreview(){
  const d=pendingPdfImport?.parsed,card=document.querySelector('[data-review-issue="currency"]');if(!d||!card)return;
  const f=document.getElementById('pdfImportForm'),currency=normalizeCurrencyCode(f?.elements.namedItem('currency')?.value||d.currency||'EUR');
  card.querySelectorAll('[data-fx-source-code]').forEach(el=>{el.textContent=currency});
  const state=foreignCurrencyReviewState(d),preview=card.querySelector('[data-fx-preview]'),status=card.querySelector('[data-fx-status]');
  if(!preview||!status)return;
  if(currency==='EUR'){
    status.textContent='Valuta staat op EUR; er is geen wisselkoers nodig.';status.className='exchange-rate-status good';preview.innerHTML='';return
  }
  if(!state.rate){
    status.textContent='Vul eerst de koers in die je voor deze boeking gebruikt.';status.className='exchange-rate-status';preview.innerHTML='';return
  }
  if(!state.confirmed){
    status.textContent='Koers ingevuld. Bevestig hem expliciet voordat je opslaat.';status.className='exchange-rate-status warn';preview.innerHTML='';return
  }
  status.textContent='Bevestigd: 1 '+currency+' = '+state.rate.normalized.replace('.',',')+' EUR';status.className='exchange-rate-status good';
  const b=state.bookingAmountsEur;
  preview.innerHTML=b?'<strong>Boeking in EUR</strong><span>Excl. '+esc(money(b.net))+' · btw '+esc(money(b.vatAmount))+' · totaal '+esc(money(b.gross))+'</span>':'<strong>Koers bevestigd</strong><span>Corrigeer eerst de bedragen om de EUR-boeking te berekenen.</span>'
}
function confirmExchangeRate(){
  const d=pendingPdfImport?.parsed,f=document.getElementById('pdfImportForm'),input=f?.elements.namedItem('exchangeRateToEur'),confirmed=f?.elements.namedItem('exchangeRateConfirmed');if(!d||!input||!confirmed)return;
  const rate=parseExchangeRateToEur(input.value);
  if(!rate){input.setCustomValidity('Vul een positieve wisselkoers in, bijvoorbeeld 0,92.');input.reportValidity();return}
  input.setCustomValidity('');input.value=rate.normalized;d.exchangeRateToEur=rate.normalized;d.exchangeRateConfirmed=true;d.exchangeRateConfirmedAt=new Date().toISOString();confirmed.value='on';
  genericProvenance(d).exchangeRateToEur={source:'user',confirmed:true,confirmedAt:d.exchangeRateConfirmedAt};
  updateForeignCurrencyPreview();updateBeginnerReviewState()
}
function safeDate(value,issue=''){
  const v=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return '';
  if(issue&&v<issue)return '';
  return v
}
function safeKvk(value){return typeof plausibleKvk==='function'&&plausibleKvk(value)?String(value||''):''}
function safeVatId(value){return typeof plausibleVat==='function'&&plausibleVat(value)?String(value||''):''}
function safeIban(value){return typeof ibanValid==='function'&&ibanValid(value)===true?String(value||'').replace(/\s/g,'').toUpperCase():''}
function selectOptions(values,current){
  return values.map(v=>'<option '+(String(current||'')===String(v)?'selected':'')+'>'+esc(v)+'</option>').join('')
}
function genericProvenance(d){
  if(!d.reviewFieldProvenance||typeof d.reviewFieldProvenance!=='object')d.reviewFieldProvenance={};
  return d.reviewFieldProvenance
}
function isUserConfirmed(d,key){
  const p=genericProvenance(d)[key]||d.fieldProvenance?.[key];
  return p?.source==='user'&&p?.confirmed===true
}
function isCalculated(d,key){return d.fieldProvenance?.[key]?.source==='calculated'}
function fieldConfidence(d,key){const n=Number(d?.fieldConfidence?.[key]);return Number.isFinite(n)?n:0}
function fieldUncertain(d,key,threshold=75){
  if(isUserConfirmed(d,key)||isCalculated(d,key))return false;
  const value=d?.[key];
  if(value===''||value==null)return true;
  const c=fieldConfidence(d,key);
  return c>0&&c<threshold
}
function provenanceBadge(d,key){
  if(isUserConfirmed(d,key))return '<span class="beginner-provenance good">Bevestigd</span>';
  if(isCalculated(d,key))return '<span class="beginner-provenance good">Berekend</span>';
  if(fieldUncertain(d,key,key==='gross'?85:75))return '<span class="beginner-provenance warn">Controleer dit even</span>';
  return '<span class="beginner-provenance">Herkend</span>'
}
function canDeferField(d,key){
  const type=reviewDocumentType(d);
  if(key==='category')return ['receipt','purchase_invoice','credit_invoice','invoice'].includes(type);
  if(key==='party')return type==='receipt'&&String(d?.party||'').trim().length>0;
  return false
}
function attentionControls(d,key){
  if(!fieldUncertain(d,key,key==='party'?75:70))return '';
  const defer=canDeferField(d,key)?'<button type="button" class="link-btn" data-review-defer="'+key+'" onclick="deferDocumentReviewField(\''+key+'\')">Later controleren</button>':'';
  return '<div class="beginner-field-actions" data-review-actions="'+key+'"><button type="button" class="link-btn" onclick="confirmDocumentReviewField(\''+key+'\')">Dit klopt zo</button><button type="button" class="link-btn" onclick="focusDocumentReviewField(\''+key+'\')">Aanpassen</button>'+defer+'</div>'
}
function deferredFields(d){
  const x=Array.isArray(d?.reviewDeferredFields)?d.reviewDeferredFields:[];
  return [...new Set(x.filter(key=>canDeferField(d,key)))]
}
function setDeferredFields(d,fields){d.reviewDeferredFields=[...new Set(fields)]}
function deferDocumentReviewField(key){
  const d=pendingPdfImport?.parsed;if(!d||!canDeferField(d,key))return;
  setDeferredFields(d,[...deferredFields(d),key]);
  const row=document.querySelector('[data-review-actions="'+key+'"]');
  if(row)row.innerHTML='<span class="beginner-deferred">Later controleren</span><button type="button" class="link-btn" onclick="confirmDocumentReviewField(\''+key+'\')">Toch nu bevestigen</button>';
  updateBeginnerReviewState()
}
function confirmDocumentReviewField(key){
  const d=pendingPdfImport?.parsed,f=document.getElementById('pdfImportForm'),el=f?.elements.namedItem(key);if(!d||!el)return;
  const value=String(el.value||'').trim();if(!value){el.focus();return}
  genericProvenance(d)[key]={source:'user',confirmed:true,confirmedAt:new Date().toISOString()};
  setDeferredFields(d,deferredFields(d).filter(x=>x!==key));
  const badge=el.closest('.field')?.querySelector('.beginner-provenance');if(badge){badge.className='beginner-provenance good';badge.textContent='Bevestigd'}
  const actions=document.querySelector('[data-review-actions="'+key+'"]');if(actions)actions.innerHTML='<span class="beginner-confirmed">Dit klopt zo</span>';
  updateBeginnerReviewState()
}
function focusDocumentReviewField(key){
  const el=document.getElementById('pdfImportForm')?.elements.namedItem(key);el?.focus();el?.scrollIntoView?.({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})
}

function confirmFinancialReviewAnchor(key){
  const f=document.getElementById('pdfImportForm'),el=f?.elements.namedItem(key);
  if(!el||String(el.value||'').trim()===''){el?.focus();return}
  if(typeof global.confirmFinancialReviewField==='function')global.confirmFinancialReviewField(key);
  const actions=document.querySelector('[data-financial-anchor-actions="'+key+'"]');
  if(actions)actions.innerHTML='<span class="beginner-confirmed">Dit klopt zo</span>';
  updateBeginnerReviewState()
}

function rateSelectValue(d){return d?.mixedRates||d?.vatRate==null?'':String(Number(d.vatRate))}
function specialRateSelected(d){return !d?.mixedRates&&Number(d?.vatRate)===0}
function mixedLineRow(line,index){
  const rate=Number(line?.rate);
  const options=[...new Set([9,21,0,...(pendingPdfImport?.parsed?.detectedVatRates||[]),rate])].filter(r=>Number.isFinite(r)&&r>=0&&r<=100).map(r=>'<option value="'+esc(String(r))+'" '+(r===rate?'selected':'')+'>'+esc(String(r))+'%</option>').join('');
  return '<div class="mixed-vat-row" data-vat-line-index="'+index+'">'+
    '<div class="field"><label>Btw</label><select data-vat-line-rate aria-label="Btw-percentage regel '+(index+1)+'">'+options+'</select></div>'+
    '<div class="field"><label>Bedrag excl.</label><input data-vat-line-net inputmode="decimal" autocomplete="off" value="'+esc(line?.taxableAmount!=null?Number(line.taxableAmount).toFixed(2):'')+'" aria-label="Bedrag excl. btw regel '+(index+1)+'"></div>'+
    '<div class="field"><label>Btw-bedrag</label><input data-vat-line-vat inputmode="decimal" autocomplete="off" value="'+esc(line?.vatAmount!=null?Number(line.vatAmount).toFixed(2):'')+'" aria-label="Btw-bedrag regel '+(index+1)+'"></div>'+
    '<button type="button" class="icon-btn mixed-vat-remove" aria-label="Btw-regel verwijderen" onclick="removeMixedVatLine('+index+')">×</button>'+
  '</div>'
}
function currentMixedLines(d){
  const lines=Array.isArray(d?.vatLines)?d.vatLines:[];
  if(lines.length)return lines.map(x=>({rate:Number(x.rate),taxableAmount:x.taxableAmount,vatAmount:x.vatAmount}));
  return [{rate:9,taxableAmount:'',vatAmount:''},{rate:21,taxableAmount:'',vatAmount:''}]
}
function renderMixedVatRows(){
  const d=pendingPdfImport?.parsed,root=document.getElementById('mixedVatRows');if(!d||!root)return;
  root.innerHTML=currentMixedLines(d).map(mixedLineRow).join('');
  root.querySelectorAll('input,select').forEach(el=>{el.addEventListener('input',syncMixedVatEditor);el.addEventListener('change',syncMixedVatEditor)});
}
function readMixedVatEditor(){
  const rows=[...document.querySelectorAll('.mixed-vat-row')];
  return rows.map(row=>{
    const rate=Number(row.querySelector('[data-vat-line-rate]')?.value);
    const netC=cents(row.querySelector('[data-vat-line-net]')?.value);
    const vatC=cents(row.querySelector('[data-vat-line-vat]')?.value);
    return {rate,netC,vatC,valid:Number.isFinite(rate)&&netC!=null&&vatC!=null}
  })
}
function syncMixedVatEditor(){
  const d=pendingPdfImport?.parsed;if(!d?.mixedRates)return;
  const lines=readMixedVatEditor();
  d.vatLines=lines.map(x=>({rate:x.rate,taxableAmount:x.netC==null?'':x.netC/100,vatAmount:x.vatC==null?'':x.vatC/100}));
  d.vatRate=null;
  if(!d.fieldProvenance||typeof d.fieldProvenance!=='object')d.fieldProvenance={};
  d.fieldProvenance.vatLines={source:'user',confirmed:true,confidence:null,confirmedAt:new Date().toISOString()};
  updateMixedVatStatus();updateBeginnerReviewState()
}
function addMixedVatLine(){
  const d=pendingPdfImport?.parsed;if(!d)return;
  const lines=currentMixedLines(d);lines.push({rate:21,taxableAmount:'',vatAmount:''});d.vatLines=lines;renderMixedVatRows();updateMixedVatStatus();updateBeginnerReviewState()
}
function removeMixedVatLine(index){
  const d=pendingPdfImport?.parsed;if(!d)return;
  const lines=currentMixedLines(d);if(lines.length<=2){toast('Een bon met meerdere btw-tarieven heeft minimaal twee regels.');return}
  lines.splice(index,1);d.vatLines=lines;renderMixedVatRows();syncMixedVatEditor()
}
function mixedVatValidation(){
  const d=pendingPdfImport?.parsed;if(!d?.mixedRates)return {ok:true,lines:[]};
  const rows=readMixedVatEditor();
  if(rows.length<2)return {ok:false,field:'vatLines',message:'Voeg minimaal twee btw-regels toe.'};
  if(rows.some(x=>!x.valid))return {ok:false,field:'vatLines',message:'Controleer de bedragen in de btw-verdeling.'};
  const netSum=rows.reduce((s,x)=>s+x.netC,0),vatSum=rows.reduce((s,x)=>s+x.vatC,0);
  const f=document.getElementById('pdfImportForm'),netC=cents(f?.elements.namedItem('net')?.value),vatC=cents(f?.elements.namedItem('vatAmount')?.value),grossC=cents(f?.elements.namedItem('gross')?.value);
  if(netC==null||vatC==null||grossC==null)return {ok:false,field:'vatLines',message:'Controleer eerst de totalen.'};
  if(netSum!==netC||vatSum!==vatC)return {ok:false,field:'vatLines',message:'De btw-verdeling telt nog niet op tot het totaal.',netSum,vatSum,netC,vatC,grossC};
  if(netC+vatC!==grossC)return {ok:false,field:'gross',message:'Bedrag excl. btw + btw klopt nog niet met het totaal.'};
  return {ok:true,lines:rows,netSum,vatSum,grossC}
}
function updateMixedVatStatus(){
  const d=pendingPdfImport?.parsed,el=document.getElementById('mixedVatStatus');if(!d?.mixedRates||!el)return;
  const x=mixedVatValidation();el.className='mixed-vat-status '+(x.ok?'good':'warn');el.textContent=x.ok?'✓ Btw-verdeling klopt':x.message
}
function useMixedVatTotals(){
  const d=pendingPdfImport?.parsed,f=document.getElementById('pdfImportForm');if(!d||!f)return;
  const rows=readMixedVatEditor();if(rows.length<2||rows.some(x=>!x.valid)){updateMixedVatStatus();return}
  const netC=rows.reduce((s,x)=>s+x.netC,0),vatC=rows.reduce((s,x)=>s+x.vatC,0),grossC=netC+vatC;
  for(const [key,value] of Object.entries({net:netC,vatAmount:vatC,gross:grossC})){const el=f.elements.namedItem(key);if(el)el.value=formatCents(value);d[key]=value/100}
  if(!d.fieldProvenance||typeof d.fieldProvenance!=='object')d.fieldProvenance={};
  for(const key of ['net','vatAmount','gross'])d.fieldProvenance[key]={source:'calculated',confirmed:false,confidence:null,derivedFrom:['vatLines'],calculatedAt:new Date().toISOString()};
  if(typeof financialReviewEvent==='function')financialReviewEvent('financial_recalculation_applied',['net','vatAmount','gross']);
  if(typeof updateFinancialReviewPanel==='function')updateFinancialReviewPanel();
  updateMixedVatStatus();updateBeginnerReviewState()
}

function specialVatPanel(open){
  const panel=document.getElementById('otherVatSituation');if(!panel)return;
  panel.hidden=!open;
  const button=document.getElementById('otherVatToggle');if(button)button.setAttribute('aria-expanded',String(open))
}
function toggleOtherVatSituation(){specialVatPanel(document.getElementById('otherVatSituation')?.hidden!==false)}
function chooseZeroVat(){
  const d=pendingPdfImport?.parsed,f=document.getElementById('pdfImportForm');if(!d||!f)return;
  const rate=f.elements.namedItem('vatRate');if(rate)rate.value='0';
  d.vatRate=0;
  const vat=f.elements.namedItem('vatAmount');if(vat&&!String(vat.value||'').trim())vat.value='0.00';
  if(typeof syncFinancialReviewStateFromForm==='function')syncFinancialReviewStateFromForm('vatRate');
  specialVatPanel(false);updateBeginnerReviewState();if(typeof updateFinancialReviewPanel==='function')updateFinancialReviewPanel()
}

function financialBlockingIssues(d){
  const f=document.getElementById('pdfImportForm');if(!f)return [{field:'form',message:'Het controlescherm is niet volledig geladen.'}];
  if(d?.bookingAllowed===false)return [];
  const type=reviewDocumentType(d),req=requirementsFor(type),issues=[],value=k=>String(f.elements.namedItem(k)?.value??'').trim();
  if(d?.accountingVatTreatment==='review_required'&&!value('vatTreatmentChoice'))issues.push({field:'vatTreatmentChoice',message:'Kies hoe de btw op dit document moet worden behandeld.'});
  const currency=normalizeCurrencyCode(value('currency')||d?.currency||'EUR');
  if(!/^[A-Z]{3}$/.test(currency))issues.push({field:'currency',message:'Gebruik een valutacode van drie letters, bijvoorbeeld USD.'});
  else if(currency!=='EUR'){
    const rate=parseExchangeRateToEur(value('exchangeRateToEur'));
    const confirmed=!!rate&&value('exchangeRateConfirmed')==='on'&&d?.exchangeRateConfirmed===true&&String(d?.exchangeRateToEur||'')===rate.normalized;
    if(!rate)issues.push({field:'exchangeRateToEur',message:'Vul de wisselkoers in: hoeveel EUR is 1 '+currency+'?'});
    else if(!confirmed)issues.push({field:'exchangeRateToEur',message:'Bevestig de wisselkoers van 1 '+currency+' = '+rate.normalized.replace('.',',')+' EUR.'})
    else{
      const fx=foreignCurrencyReviewState(d),complete=Object.values(fx.sourceCents||{}).every(v=>v!=null)&&fx.sourceCents.net+fx.sourceCents.vatAmount===fx.sourceCents.gross;
      if(complete&&!fx.bookingAmountsEur)issues.push({field:'exchangeRateToEur',message:'Deze koers kan niet veilig naar eurocenten worden omgerekend. Controleer de koers en bedragen.'})
    }
  }
  // Saving books the document, so whatever the booking needs is required here too, also for "other" documents.
  // Otherwise the save button looks ready while saving silently refuses.
  const required=new Set([...req.blocking,...SAVE_REQUIRED]);
  if(d?.mixedRates){required.delete('vatRate');required.add('vatLines')}
  for(const key of required){
    if(['net','vatAmount','gross','vatRate','vatLines'].includes(key))continue;
    if(!value(key))issues.push({field:key,message:(LABELS[key]||key)+' ontbreekt.'})
  }
  const netC=cents(value('net')),vatC=cents(value('vatAmount')),grossC=cents(value('gross'));
  if(required.has('net')&&netC==null)issues.push({field:'net',message:'Controleer het bedrag excl. btw.'});
  if(required.has('vatAmount')&&vatC==null)issues.push({field:'vatAmount',message:'Controleer het btw-bedrag.'});
  if(required.has('gross')&&(grossC==null||grossC===0))issues.push({field:'gross',message:'Controleer het totaal.'});
  if(netC!=null&&vatC!=null&&grossC!=null&&netC+vatC!==grossC){
    issues.push({field:'vatAmount',message:'De bedragen kloppen nog niet met elkaar.'})
  }
  if(!d?.mixedRates&&required.has('vatRate')&&netC!=null&&vatC!=null&&grossC!=null){
    const rate=value('vatRate')===''?null:Number(value('vatRate'));
    if(rate!=null&&Number.isFinite(rate)&&!NL_BOOKABLE_RATES.includes(rate)&&d?.accountingVatTreatment!=='review_required')issues.push({field:'vatRate',message:'Kies 21%, 9% of geen btw. Is dit buitenlandse btw? Kies dan bij btw "Buitenlandse btw".'});
    else if(rate==null||!Number.isFinite(rate))issues.push({field:d?.accountingVatTreatment==='review_required'?'vatRate':'vatAmount',message:d?.accountingVatTreatment==='review_required'?'Kies het btw-percentage.':'Controleer het btw-bedrag.'});
    else if(typeof BookunaFinancialCorrection!=='undefined'&&!BookunaFinancialCorrection.candidateFitsRate({net:netC,vatAmount:vatC,gross:grossC},rate,1)){
      issues.push({field:d?.accountingVatTreatment==='review_required'?'vatRate':'vatAmount',message:d?.accountingVatTreatment==='review_required'?'Het btw-percentage past niet bij deze bedragen.':'Controleer het btw-bedrag op het document.'})
    }
  }
  if(d?.mixedRates){const mixed=mixedVatValidation();if(!mixed.ok)issues.push({field:mixed.field||'vatLines',message:mixed.message})}
  const duplicateEl=f.elements.namedItem('confirmDuplicate');
  if(d?.duplicateCandidate&&!(duplicateEl?.checked||duplicateEl?.value==='on'))issues.push({field:'confirmDuplicate',message:'Controleer eerst of dit document echt nieuw is.'});
  const anomalyEl=f.elements.namedItem('confirmAnomaly');
  if((d?.anomalyCodes||[]).length&&anomalyEl?.value!=='on')issues.push({field:'confirmAnomaly',message:'Controleer het originele document voordat je verdergaat.'});
  return issues.filter((x,i,a)=>a.findIndex(y=>y.field===x.field)===i)
}
function updateFinancialBadges(){
  const d=pendingPdfImport?.parsed,f=document.getElementById('pdfImportForm');if(!d||!f)return;
  for(const key of ['net','vatAmount','gross','vatRate']){
    const el=f.elements.namedItem(key),badge=el?.closest('.field')?.querySelector('.beginner-provenance');if(!badge)continue;
    const holder=document.createElement('div');holder.innerHTML=provenanceBadge(d,key);const next=holder.firstElementChild;if(next)badge.replaceWith(next)
  }
}

const REVIEW_STEP_ONE_FIELDS=new Set(['party','issueDate','invoiceNumber','category','confirmDuplicate','confirmAnomaly']);
let reviewWizardStep=1;
function reviewStepForField(field){return REVIEW_STEP_ONE_FIELDS.has(field)?1:2}
function reviewIssuesForStep(step,issues){
  const source=Array.isArray(issues)?issues:financialBlockingIssues(pendingPdfImport?.parsed);
  return source.filter(issue=>reviewStepForField(issue.field)===Number(step))
}
function updateReviewWizardUi(){
  const flow=document.querySelector('.document-review-flow.two-step-review');if(!flow)return;
  const step=reviewWizardStep===2?2:1;
  flow.dataset.reviewWizardStep=String(step);
  flow.querySelectorAll('[data-review-page]').forEach(page=>{const active=Number(page.dataset.reviewPage)===step;page.hidden=!active;page.setAttribute('aria-hidden',String(!active))});
  flow.querySelectorAll('.review-wizard-progress span').forEach((bar,index)=>bar.classList.toggle('active',index<step));
  const label=document.getElementById('documentReviewStepLabel');
  if(label)label.textContent=step===1?'Stap 1 van 2 · Basis':'Stap 2 van 2 · Bedragen';
  document.querySelectorAll('[data-review-next]').forEach(btn=>{const show=step===1;btn.hidden=!show;btn.style.display=show?'inline-flex':'none'});
  document.querySelectorAll('[data-review-prev]').forEach(btn=>{const show=step===2;btn.hidden=!show;btn.style.display=show?'inline-flex':'none'});
  document.querySelectorAll('[data-review-save]').forEach(btn=>{const show=step===2;btn.hidden=!show;btn.style.display=show?'inline-flex':'none'});
}
function focusReviewIssue(issue){
  if(!issue)return;
  if(issue.field==='vatLines'){document.querySelector('.mixed-vat-row input')?.focus();return}
  if(issue.field==='confirmAnomaly'){document.querySelector('[data-review-issue="confirmAnomaly"] button')?.focus();return}
  if(issue.field==='confirmDuplicate'){document.querySelector('[data-review-issue="confirmDuplicate"] button')?.focus();return}
  const el=document.getElementById('pdfImportForm')?.elements.namedItem(issue.field);el?.focus?.()
}
function focusDocumentReviewIssue(field){
  const step=reviewStepForField(field);
  if(step!==reviewWizardStep){setReviewWizardStep(step,false);requestAnimationFrame(()=>focusReviewIssue({field}));return}
  focusReviewIssue({field})
}
function setReviewWizardStep(step,validate=true){
  const target=Number(step)===2?2:1,d=pendingPdfImport?.parsed;
  if(target===2&&validate&&d){
    const basisIssues=reviewIssuesForStep(1,financialBlockingIssues(d));
    if(basisIssues.length){reviewWizardStep=1;updateReviewWizardUi();updateBeginnerReviewState();focusReviewIssue(basisIssues[0]);return false}
  }
  reviewWizardStep=target;updateReviewWizardUi();
  document.querySelector('.document-review-flow.two-step-review')?.closest('.modal')?.querySelector('.modal-body')?.scrollTo?.({top:0,behavior:'auto'});
  const heading=document.querySelector('[data-review-page="'+target+'"] h4');heading?.focus?.();
  updateBeginnerReviewState();
  return true
}
function setDocumentReviewStep(step){return setReviewWizardStep(step,false)}
function goToReviewWizardStep(step){return setReviewWizardStep(step,true)}
function updateBeginnerReviewState(){
  const d=pendingPdfImport?.parsed;if(!d)return;
  if(d.mixedRates)syncMixedVatFromDomWithoutRender();
  const issues=financialBlockingIssues(d),basisIssues=reviewIssuesForStep(1,issues),amountIssues=reviewIssuesForStep(2,issues);
  const basis=document.getElementById('reviewBasisState'),amount=document.getElementById('reviewBlockingState'),warning=document.getElementById('reviewAmountIssueText');
  if(basis){
    basis.hidden=!basisIssues.length;
    basis.className='beginner-review-state '+(basisIssues.length?'bad':'good');
    basis.innerHTML=basisIssues.length?'<strong>Controleer dit nog even</strong><span>'+esc(basisIssues[0].message)+'</span>':''
  }
  if(amount){
    // A question that already has its own card above is not repeated in this summary.
    // Issues from the first step are listed here too: on step 2 they are otherwise invisible while Save stays off.
    const otherIssues=issues.filter(issue=>!amountIssues.includes(issue));
    const listed=[...amountIssues.filter(issue=>!document.querySelector('[data-review-issue="'+(issue.field==='exchangeRateToEur'?'currency':issue.field)+'"]:not(.resolved)')),...otherIssues];
    amount.hidden=issues.length>0&&!listed.length;
    amount.className='beginner-review-state '+(issues.length?'bad':'good');
    amount.innerHTML=listed.length?'<strong>Nog '+listed.length+' '+(listed.length===1?'punt':'punten')+' oplossen</strong><div class="beginner-issue-list">'+listed.map(issue=>'<button type="button" class="beginner-issue" onclick="focusDocumentReviewIssue(\''+esc(issue.field)+'\')">'+esc(issue.message)+'</button>').join('')+'</div>':issues.length?'':'<strong>✓ Klaar om op te slaan</strong><span>De bedragen sluiten op elkaar aan.</span>'
  }
  const financial=amountIssues.find(x=>['net','vatAmount','gross','vatRate','vatLines'].includes(x.field));
  if(warning){warning.hidden=true;warning.textContent=''}
  const netEditor=document.querySelector('[data-review-net-editor]');
  if(netEditor){
    const f=document.getElementById('pdfImportForm'),netC=cents(f?.elements.namedItem('net')?.value),vatC=cents(f?.elements.namedItem('vatAmount')?.value),grossC=cents(f?.elements.namedItem('gross')?.value),netMeta=d.fieldProvenance?.net||{};
    const needsExplicitNet=amountIssues.some(x=>x.field==='net')||(netMeta.source==='user'&&netMeta.confirmed&&netC!=null&&vatC!=null&&grossC!=null&&netC+vatC!==grossC);
    netEditor.hidden=!needsExplicitNet;netEditor.style.display=needsExplicitNet?'':'none'
  }
  const rateField=document.querySelector('[data-review-field="vatRate"]');
  if(rateField&&!d.mixedRates){
    const needsRate=amountIssues.some(x=>x.field==='vatRate')||d.accountingVatTreatment==='review_required';
    rateField.hidden=!needsRate;rateField.style.display=needsRate?'':'none'
  }
  const financialPanel=document.getElementById('financialCorrectionPanel');
  if(financialPanel)financialPanel.classList.toggle('review-secondary-panel',!financial);
  document.querySelectorAll('[data-review-next]').forEach(btn=>{btn.disabled=basisIssues.length>0});
  document.querySelectorAll('[data-review-save]').forEach(btn=>{btn.disabled=issues.length>0});
  updateReviewWizardUi();updateFinancialBadges();if(d.mixedRates)updateMixedVatStatus()
}
function syncMixedVatFromDomWithoutRender(){
  const d=pendingPdfImport?.parsed;if(!d?.mixedRates||!document.querySelector('.mixed-vat-row'))return;
  const lines=readMixedVatEditor();d.vatLines=lines.map(x=>({rate:x.rate,taxableAmount:x.netC==null?'':x.netC/100,vatAmount:x.vatC==null?'':x.vatC/100}));d.vatRate=null
}
function firstBlockingFocus(){
  const d=pendingPdfImport?.parsed,issue=financialBlockingIssues(d)[0];if(!issue)return;
  reviewWizardStep=reviewStepForField(issue.field);updateReviewWizardUi();
  requestAnimationFrame(()=>focusReviewIssue(issue))
}
function reconcileSimpleReviewAmounts(markUserKey=null){
  if(typeof global.reconcileFinancialReviewVisibleAmounts==='function')return global.reconcileFinancialReviewVisibleAmounts(markUserKey);
  const d=pendingPdfImport?.parsed,f=document.getElementById('pdfImportForm');if(!d||!f||d.mixedRates)return;
  const grossC=cents(f.elements.namedItem('gross')?.value),vatC=cents(f.elements.namedItem('vatAmount')?.value);
  if(grossC==null||vatC==null||grossC===0)return;
  if(vatC!==0&&Math.sign(grossC)!==Math.sign(vatC))return;
  if(Math.abs(vatC)>Math.abs(grossC))return;
  if(!d.fieldProvenance||typeof d.fieldProvenance!=='object')d.fieldProvenance={};
  const provenance=d.fieldProvenance,netMeta=provenance.net||{},visibleAnchorEdited=['gross','vatAmount'].includes(markUserKey);
  if(visibleAnchorEdited){
    const edited=f.elements.namedItem(markUserKey);
    if(edited&&String(edited.value??'').trim()!=='')provenance[markUserKey]={source:'user',confirmed:true,confidence:null,confirmedAt:new Date().toISOString()};
  }
  const anchorTrusted=key=>{const p=provenance[key]||{},confidence=Number(p.confidence??d.fieldConfidence?.[key]??0);return (p.source==='user'&&p.confirmed)||(p.source==='recognition'&&confidence>=85)};
  if(!anchorTrusted('gross')||!anchorTrusted('vatAmount'))return;
  if(netMeta.source==='user'&&netMeta.confirmed&&!visibleAnchorEdited)return;
  const netC=grossC-vatC,netEl=f.elements.namedItem('net');
  if(netEl)netEl.value=formatCents(netC);
  d.net=netC/100;
  provenance.net={source:'calculated',confirmed:false,confidence:null,derivedFrom:['gross','vatAmount'],calculatedAt:new Date().toISOString()};
  if(typeof BookunaFinancialCorrection!=='undefined'){
    const inferred=BookunaFinancialCorrection.inferKnownRate({net:netC,vatAmount:vatC,gross:grossC},BookunaFinancialCorrection.DEFAULT_RATES,1);
    const rateMeta=provenance.vatRate||{};
    if(inferred!=null&&!(rateMeta.source==='user'&&rateMeta.confirmed)){
      const rateEl=f.elements.namedItem('vatRate');if(rateEl)rateEl.value=String(inferred);
      d.vatRate=inferred;
      provenance.vatRate={source:'calculated',confirmed:false,confidence:null,derivedFrom:['gross','vatAmount'],calculatedAt:new Date().toISOString()}
    }
  }
  if(markUserKey&&typeof financialReviewEvent==='function')financialReviewEvent('financial_recalculation_applied',['net'])
}
// Foreign and historical VAT use rates such as 19% or 20%. After the user picks the VAT situation, the rate is
// read from the amounts on the document so the select never lacks the only option that fits.
function rateFromAmounts(netC,vatC,grossC){
  if(netC==null||vatC==null||grossC==null||netC<=0||netC+vatC!==grossC||typeof BookunaFinancialCorrection==='undefined')return null;
  const exact=vatC*100/netC;
  for(const digits of [0,1,2]){
    const rate=Number(exact.toFixed(digits));
    if(rate>=0&&rate<=100&&BookunaFinancialCorrection.candidateFitsRate({net:netC,vatAmount:vatC,gross:grossC},rate,1))return rate
  }
  return null
}
function applyTreatmentRate(){
  const d=pendingPdfImport?.parsed,f=document.getElementById('pdfImportForm');if(!d||!f||d.mixedRates)return;
  const select=f.elements.namedItem('vatRate');if(!select)return;
  const netC=cents(f.elements.namedItem('net')?.value),vatC=cents(f.elements.namedItem('vatAmount')?.value),grossC=cents(f.elements.namedItem('gross')?.value);
  const current=select.value===''?null:Number(select.value);
  if(current!=null&&typeof BookunaFinancialCorrection!=='undefined'&&netC!=null&&vatC!=null&&grossC!=null&&BookunaFinancialCorrection.candidateFitsRate({net:netC,vatAmount:vatC,gross:grossC},current,1))return;
  const rate=rateFromAmounts(netC,vatC,grossC);if(rate==null)return;
  if(![...select.options].some(o=>Number(o.value)===rate&&o.value!=='')){const o=document.createElement('option');o.value=String(rate);o.textContent=String(rate).replace('.',',')+'%';select.insertBefore(o,select.lastElementChild)}
  select.value=String(rate);d.vatRate=rate;
  if(!d.fieldProvenance||typeof d.fieldProvenance!=='object')d.fieldProvenance={};
  d.fieldProvenance.vatRate={source:'calculated',confirmed:false,confidence:null,derivedFrom:['net','vatAmount'],calculatedAt:new Date().toISOString()};
  if(typeof syncFinancialReviewStateFromForm==='function')syncFinancialReviewStateFromForm('vatRate');
  const field=select.closest('[data-review-field]');if(field){field.hidden=false;field.style.display=''}
}
function onGenericReviewInput(event){
  const d=pendingPdfImport?.parsed,key=event?.target?.name;if(!d||!key)return;
  if(['party','category','issueDate','invoiceNumber','documentType','type'].includes(key))d[key]=String(event.target?.value??'');
  if(key==='currency'){
    d.currency=normalizeCurrencyCode(event.target?.value||'EUR');event.target.value=d.currency;d.exchangeRateConfirmed=false;d.exchangeRateConfirmedAt=null;
    const confirmed=document.getElementById('pdfImportForm')?.elements.namedItem('exchangeRateConfirmed');if(confirmed)confirmed.value=''
  }
  if(key==='exchangeRateToEur'){
    d.exchangeRateToEur=String(event.target?.value??'').trim().replace(',','.');d.exchangeRateConfirmed=false;d.exchangeRateConfirmedAt=null;event.target.setCustomValidity('');
    const confirmed=document.getElementById('pdfImportForm')?.elements.namedItem('exchangeRateConfirmed');if(confirmed)confirmed.value=''
  }
  if(['party','category','issueDate','invoiceNumber'].includes(key)){
    genericProvenance(d)[key]={source:'user',confirmed:true,confirmedAt:new Date().toISOString()};
    setDeferredFields(d,deferredFields(d).filter(x=>x!==key))
  }
  if(key==='vatTreatmentChoice')applyTreatmentRate();
  if(['net','vatAmount','gross','vatRate'].includes(key)&&typeof syncFinancialReviewStateFromForm==='function'){syncFinancialReviewStateFromForm(key);reconcileSimpleReviewAmounts(key)}
  if(typeof updateFinancialReviewPanel==='function'&&['net','vatAmount','gross','vatRate'].includes(key))updateFinancialReviewPanel();
  if(['currency','exchangeRateToEur','net','vatAmount','gross'].includes(key))updateForeignCurrencyPreview();
  updateBeginnerReviewState()
}
function bindBeginnerReview(){
  const f=document.getElementById('pdfImportForm'),d=pendingPdfImport?.parsed;if(!f||!d)return;
  f.querySelectorAll('input,select,textarea').forEach(el=>{if(el.closest('#mixedVatRows'))return;el.addEventListener('input',onGenericReviewInput);el.addEventListener('change',onGenericReviewInput)});
  if(d.mixedRates)renderMixedVatRows();else reconcileSimpleReviewAmounts();
  const financialPanel=document.getElementById('financialCorrectionPanel');
  if(financialPanel){
    const observer=new MutationObserver(()=>queueMicrotask(()=>updateBeginnerReviewState()));
    observer.observe(financialPanel,{childList:true,subtree:true,characterData:true});
  }
  if(typeof updateFinancialReviewPanel==='function')updateFinancialReviewPanel();
  updateForeignCurrencyPreview();updateBeginnerReviewState()
}

function applyFinancialCorrectionProposal(){
  const result=typeof legacyApplyFinancialCorrectionProposal==='function'?legacyApplyFinancialCorrectionProposal():undefined;
  queueMicrotask(()=>updateBeginnerReviewState());
  return result
}
function confirmSuggestedFinancialRate(rate){
  const result=typeof legacyConfirmSuggestedFinancialRate==='function'?legacyConfirmSuggestedFinancialRate(rate):undefined;
  queueMicrotask(()=>updateBeginnerReviewState());
  return result
}

function documentValuePresent(d,key){
  if(key==='vatLines')return Array.isArray(d?.vatLines)&&d.vatLines.length>=2;
  const value=d?.[key];return value!==''&&value!=null
}
function dataMixedVatValidation(d){
  if(!d?.mixedRates)return {ok:true};
  const rows=Array.isArray(d.vatLines)?d.vatLines:[];
  if(rows.length<2)return {ok:false,field:'vatLines',message:'Controleer de btw-verdeling.'};
  const clean=rows.map(x=>({net:cents(x.taxableAmount),vat:cents(x.vatAmount),rate:Number(x.rate)}));
  if(clean.some(x=>x.net==null||x.vat==null||!Number.isFinite(x.rate)))return {ok:false,field:'vatLines',message:'Controleer de btw-verdeling.'};
  const net=clean.reduce((s,x)=>s+x.net,0),vat=clean.reduce((s,x)=>s+x.vat,0),docNet=cents(d.net),docVat=cents(d.vatAmount),gross=cents(d.gross);
  if(docNet==null||docVat==null||gross==null||net!==docNet||vat!==docVat||docNet+docVat!==gross)return {ok:false,field:'vatLines',message:'De btw-verdeling telt nog niet op tot het totaal.'};
  return {ok:true}
}
function reviewIssueLabel(field){
  if(field==='category')return 'Waar hoort deze uitgave bij?';
  if(field==='party')return 'Van wie is deze bon?';
  if(field==='invoiceNumber')return 'Controleer het factuurnummer';
  if(field==='issueDate')return 'Controleer de datum';
  if(['vatAmount','vatRate','vatLines'].includes(field))return 'Controleer de btw';
  if(['net','gross'].includes(field))return 'Controleer de bedragen';
  if(field==='currency')return 'Controleer de valuta';
  if(field==='exchangeRateToEur')return 'Bevestig de wisselkoers';
  return 'Controleer dit'
}
function presentationIssues(d){
  if(!d||d.bookingAllowed===false)return [];
  const req=requirementsFor(reviewDocumentType(d)),out=[],add=(field,message,kind='field')=>{if(!out.some(x=>x.field===field))out.push({field,message,kind})};
  const routed=new Set(Array.isArray(d.reviewRouting?.fields)?d.reviewRouting.fields:[]);
  for(const key of req.blocking){
    if(key==='vatRate'&&d.mixedRates)continue;
    if(!documentValuePresent(d,key))add(key,(LABELS[key]||key)+' ontbreekt.')
  }
  const n=cents(d.net),v=cents(d.vatAmount),g=cents(d.gross);
  if(n!=null&&v!=null&&g!=null&&n+v!==g)add(['vatAmount','net','gross'].find(k=>routed.has(k))||'gross','Deze bedragen kloppen nog niet met elkaar.','financial');
  if(!d.mixedRates&&n!=null&&v!=null&&g!=null&&d.vatRate!=null&&typeof BookunaFinancialCorrection!=='undefined'&&!BookunaFinancialCorrection.candidateFitsRate({net:n,vatAmount:v,gross:g},Number(d.vatRate),0)){
    add(['vatAmount','vatRate','net','gross'].find(k=>routed.has(k))||'vatRate','Het btw-percentage past niet bij deze bedragen.','financial')
  }
  const mixed=dataMixedVatValidation(d);if(!mixed.ok)add('vatLines',mixed.message,'mixed');
  if(d.accountingVatTreatment==='review_required')add('vatTreatmentChoice','Deze factuur lijkt buitenlandse of historische btw te bevatten.','vat-treatment');
  if(d.currency&&d.currency!=='EUR')add('currency','Deze valuta heeft extra controle nodig.','currency');
  if(d.duplicateCandidate)add('confirmDuplicate','Deze bon lijkt al verwerkt.','duplicate');
  for(const key of routed){
    if(['vatTreatmentChoice','confirmDuplicate','vatLines'].includes(key))continue;
    if(!out.some(x=>x.field===key))add(key,(LABELS[key]||key)+' heeft je controle nodig.',['net','vatAmount','gross','vatRate'].includes(key)?'financial':'field')
  }
  for(const key of req.attention||[]){
    if(deferredFields(d).includes(key)||isUserConfirmed(d,key))continue;
    if(fieldUncertain(d,key,key==='party'?75:70))add(key,(LABELS[key]||key)+' heeft je controle nodig.')
  }
  if((d.anomalyCodes||[]).length)add('confirmAnomaly','Vergelijk de gemarkeerde gegevens met het originele document.','anomaly');
  return out
}
function buildDocumentReviewViewModel(d){
  const issues=presentationIssues(d),route=String(d?.reviewRouting?.mode||''),mixed=dataMixedVatValidation(d);
  let mode='SIMPLE';
  if(d?.bookingAllowed===false)mode='NON_BOOKABLE';
  else if(issues.length){
    const hard=route==='FULL_REVIEW'||d?.accountingVatTreatment==='review_required'||d?.currency!=='EUR'||!!d?.duplicateCandidate||!mixed.ok||(d?.anomalyCodes||[]).length>0;
    mode=!hard&&issues.length<=3?'QUICK':'FULL'
  }
  const type=reviewDocumentType(d);
  return {
    mode,
    summary:{
      party:String(d?.party||''),
      issueDate:String(d?.issueDate||''),
      invoiceNumber:String(d?.invoiceNumber||''),
      gross:d?.gross,
      vatAmount:d?.vatAmount,
      vatRate:d?.vatRate,
      category:String(d?.category||''),
      documentType:type,
      mixedRates:!!d?.mixedRates,
      vatLines:structuredClone(d?.vatLines||[])
    },
    primaryFields:type==='receipt'?['party','issueDate','gross','vatAmount','category']:['party','issueDate','invoiceNumber','gross','vatAmount',...(d?.type==='sale'?[]:['category'])],
    issues,
    hiddenFields:[...OPTIONAL_FIELDS],
    canSave:mode!=='NON_BOOKABLE'&&!issues.length,
    primaryAction:mode==='NON_BOOKABLE'?'Document bewaren':'Opslaan'
  }
}
function summaryRow(label,value,extraClass=''){
  return '<div class="result-summary-row '+extraClass+'"><span>'+esc(label)+'</span><strong>'+esc(value==null||value===''?'—':String(value))+'</strong></div>'
}
function reviewVatSummary(d){
  if(d.mixedRates){
    const lines=(d.vatLines||[]).map(x=>num(Number(x.rate))+'%').join(' + ');
    return money(Number(d.vatAmount||0))+(lines?' · '+lines:'')
  }
  if(Number(d.vatRate)===0)return 'Geen btw op dit document';
  return (d.vatAmount!=null?money(Number(d.vatAmount)):'—')+(d.vatRate!=null?' · '+num(Number(d.vatRate))+'%':'')
}
function selectFieldOptions(values,current){
  return values.map(v=>'<option value="'+esc(v)+'" '+(String(current||'')===String(v)?'selected':'')+'>'+esc(v)+'</option>').join('')
}
function canonicalFieldControl(d,key,issue=false){
  const cls='field'+(key==='party'?' full':''),attr=issue?' data-review-issue="'+esc(key)+'"':'';
  if(key==='party')return '<div class="'+cls+'"'+attr+'><label>'+esc(reviewIssueLabel(key))+'</label><input name="party" value="'+esc(d.party||'')+'" required>'+(!isUserConfirmed(d,key)&&issue?'<div class="beginner-field-actions"><button type="button" class="link-btn" onclick="confirmDocumentReviewField(\'party\')">Klopt</button>'+(canDeferField(d,key)?'<button type="button" class="link-btn" data-review-defer="party" onclick="deferDocumentReviewField(\'party\')">Later controleren</button>':'')+'</div>':'')+'</div>';
  if(key==='issueDate')return '<div class="'+cls+'"'+attr+'><label>'+esc(reviewIssueLabel(key))+'</label><input type="date" name="issueDate" value="'+esc(safeDate(d.issueDate))+'" required></div>';
  if(key==='invoiceNumber')return '<div class="'+cls+'"'+attr+'><label>'+esc(reviewIssueLabel(key))+'</label><input name="invoiceNumber" value="'+esc(d.invoiceNumber||'')+'" '+(!['receipt','other'].includes(reviewDocumentType(d))?'required':'')+'></div>';
  if(key==='category')return '<div class="'+cls+'"'+attr+'><label>'+esc(reviewIssueLabel(key))+'</label><select name="category">'+selectFieldOptions(['Inkoop','Kantoor','Software','Reiskosten','Marketing','Representatie','Huisvesting','Bank- & factoringkosten','Overig'],String(d.category||'Inkoop'))+'</select>'+(issue&&canDeferField(d,key)?'<div class="beginner-field-actions"><button type="button" class="link-btn" data-review-defer="category" onclick="deferDocumentReviewField(\'category\')">Later controleren</button></div>':'')+'</div>';
  if(key==='net')return '<div class="'+cls+'"'+attr+'><label>'+esc(reviewIssueLabel(key))+' · excl. btw</label><input id="pdfImportNet" name="net" inputmode="decimal" autocomplete="off" value="'+esc(d.net!==''&&d.net!=null?Number(d.net).toFixed(2):'')+'" required></div>';
  if(key==='vatAmount')return '<div class="'+cls+'"'+attr+'><label>'+esc(reviewIssueLabel(key))+' · btw-bedrag</label><input id="pdfImportVatAmount" name="vatAmount" inputmode="decimal" autocomplete="off" value="'+esc(d.vatAmount!==''&&d.vatAmount!=null?Number(d.vatAmount).toFixed(2):'')+'" required></div>';
  if(key==='gross')return '<div class="'+cls+'"'+attr+'><label>'+esc(reviewIssueLabel(key))+' · totaal</label><input id="pdfImportGross" name="gross" inputmode="decimal" autocomplete="off" value="'+esc(d.gross!==''&&d.gross!=null?Number(d.gross).toFixed(2):'')+'" required></div>';
  if(key==='vatRate'){
    const rate=rateSelectValue(d),special=d.vatRate!=null&&!NORMAL_RATES.includes(Number(d.vatRate));
    return '<div class="'+cls+'"'+attr+'><label>'+esc(reviewIssueLabel(key))+' · btw-percentage</label><select id="pdfImportVatRate" name="vatRate" '+(d.mixedRates?'disabled':'')+'><option value="">Kies</option><option value="21" '+(rate==='21'?'selected':'')+'>21%</option><option value="9" '+(rate==='9'?'selected':'')+'>9%</option>'+(special?'<option value="'+esc(String(d.vatRate))+'" selected>'+esc(String(d.vatRate))+'%</option>':'')+'<option value="0" '+(Number(d.vatRate)===0?'selected':'')+'>Geen btw / 0%</option></select></div>'
  }
  if(key==='currency')return '<div class="'+cls+'"'+attr+'><label>Valuta</label><input name="currency" value="'+esc(String(d.currency||'EUR').toUpperCase())+'" maxlength="3"></div>';
  return ''
}
function issuePanel(d,issue){
  if(issue.field==='currency'||issue.field==='exchangeRateToEur'){
    const currency=normalizeCurrencyCode(d.currency||'EUR'),rate=parseExchangeRateToEur(d.exchangeRateToEur||''),confirmed=!!rate&&d.exchangeRateConfirmed===true;
    return '<section class="review-issue-card attention foreign-currency-review" data-review-issue="currency"><h5>Bedrag in <span data-fx-source-code>'+esc(currency)+'</span></h5><p>Vul de koers in die je voor deze boeking gebruikt.</p><div class="foreign-currency-fields"><div class="field"><label>Valuta</label><input name="currency" value="'+esc(currency)+'" maxlength="3" autocomplete="off" inputmode="text"></div><div class="field"><label for="exchangeRateToEur">Wisselkoers</label><div class="foreign-rate-equation"><span>1 <strong data-fx-source-code>'+esc(currency)+'</strong> =</span><input id="exchangeRateToEur" name="exchangeRateToEur" inputmode="decimal" autocomplete="off" placeholder="0,92" value="'+esc(rate?.normalized||'')+'"><span>EUR</span></div></div></div><input type="hidden" name="exchangeRateConfirmed" value="'+(confirmed?'on':'')+'"><div class="review-issue-actions"><button type="button" class="btn small" onclick="confirmExchangeRate()">Wisselkoers bevestigen</button></div><div data-fx-status class="exchange-rate-status" role="status" aria-live="polite"></div><div data-fx-preview class="exchange-rate-preview" aria-live="polite"></div></section>'
  }
  if(issue.field==='vatTreatmentChoice'){
    const rate=d.vatRate!=null&&d.vatRate!==''&&Number.isFinite(Number(d.vatRate))?num(Number(d.vatRate))+'% ':'';
    return '<section class="review-issue-card attention vat-treatment-card" data-review-issue="vatTreatmentChoice"><h5>Welke btw staat erop?</h5><p>Deze '+rate+'btw is geen gewoon Nederlands tarief.</p><div class="review-choice-group" role="radiogroup" aria-label="Soort btw"><label class="review-choice"><input type="radio" name="vatTreatmentChoice" value="foreign"><span><strong>Buitenlandse btw</strong><small>Niet terug te vragen</small></span></label><label class="review-choice"><input type="radio" name="vatTreatmentChoice" value="standard"><span><strong>Nederlandse btw</strong><small>Oud of afwijkend tarief</small></span></label></div></section>'
  }
  if(issue.field==='confirmDuplicate')return '<section class="review-issue-card attention" data-review-issue="confirmDuplicate"><h5>Deze bon lijkt al verwerkt</h5><p>'+esc(d.duplicateCandidate?.label||'We hebben een vergelijkbaar document gevonden.')+'</p><input type="hidden" name="confirmDuplicate" value=""><div class="review-issue-actions"><button type="button" class="btn small" onclick="viewDuplicateCandidate()">Bekijk bestaand document</button><button type="button" class="btn small" onclick="confirmDuplicateOverride()">Dit is toch een nieuwe bon</button></div></section>';
  if(issue.field==='confirmAnomaly')return '<section class="review-issue-card attention" data-review-issue="confirmAnomaly"><h5>Dit document heeft extra controle nodig</h5><p>'+esc(issue.message||'Vergelijk de gegevens met het origineel.')+'</p><input type="hidden" name="confirmAnomaly" value=""><div class="review-issue-actions"><button type="button" class="btn small" onclick="toggleDocumentOriginal(true)">Bekijk origineel</button><button type="button" class="btn small" onclick="confirmDocumentAnomaly()">Ik heb het origineel gecontroleerd</button></div></section>';
  if(issue.field==='vatLines')return '';
  if(issue.field==='document')return '<section class="review-issue-card attention" data-review-issue="document"><h5>Dit document heeft extra controle nodig</h5><p>'+esc(issue.message)+'</p><button type="button" class="link-btn" onclick="toggleDocumentReviewEdit(true)">Gegevens controleren</button></section>';
  const control=canonicalFieldControl(d,issue.field,true);
  return control?'<section class="review-issue-card" data-issue-kind="'+esc(issue.kind||'field')+'"><h5>'+esc(reviewIssueLabel(issue.field))+'</h5><p>'+esc(issue.message||'Controleer dit onderdeel.')+'</p>'+control+'</section>':''
}
function toggleDocumentReviewEdit(force){
  const panel=document.querySelector('[data-review-edit-panel]'),button=document.querySelector('[data-review-edit-toggle]');if(!panel)return;
  const open=typeof force==='boolean'?force:panel.hidden;
  panel.hidden=!open;if(button)button.setAttribute('aria-expanded',String(open));
  if(open)panel.querySelector('input,select,textarea')?.focus()
}
function toggleDocumentOriginal(force,tab){
  // The original opens in the full-screen viewer: it always has a close button and keeps the review underneath intact.
  const file=pendingPdfImport?.file;
  if(force!==false&&file&&global.BoekunaDocumentViewer)return global.BoekunaDocumentViewer.open({file,name:file.name,tab:tab||'document'});
  const panel=document.getElementById('reviewOriginalPanel'),button=document.querySelector('[data-review-original-toggle]');if(!panel)return;
  const open=typeof force==='boolean'?force:!panel.classList.contains('open');
  panel.classList.toggle('open',open);
  if(button){button.setAttribute('aria-expanded',String(open));if(button.classList.contains('review-original-toggle-icon'))button.setAttribute('aria-label',open?'Origineel document verbergen':'Origineel document bekijken')}
}
// Desktop shows the original next to the fields, rendered with the same viewer so its text can be selected.
function mountReviewPreview(){
  const file=pendingPdfImport?.file,shell=document.querySelector('#reviewOriginalPanel .review-preview-shell');
  if(!file||!pendingPdfImport.previewUrl||!shell||shell.querySelector('.review-viewer')||!global.BoekunaDocumentViewer||global.BoekunaDocumentViewer.mobile())return;
  if(!/pdf|image/i.test(String(file.type||''))&&!/\.(pdf|jpe?g|png|webp|gif)$/i.test(String(file.name||'')))return;
  // "Tekst kopiëren" swaps the document for its text in this same panel, so the review keeps its size and you copy with the mouse.
  const bar=document.createElement('div');bar.className='review-viewer-bar';
  bar.innerHTML='<span class="review-viewer-hint">Selecteer tekst om te kopiëren</span><span class="review-viewer-actions"><button type="button" class="link-btn" data-review-text-toggle>Tekst kopiëren</button><button type="button" class="link-btn" onclick="toggleDocumentOriginal(true)">Vergroten</button></span>';
  const host=document.createElement('div');host.className='review-viewer';
  shell.replaceChildren(bar,host);
  const docHost=document.createElement('div');host.append(docHost);
  const view=global.BoekunaDocumentViewer.createView(docHost,{file,name:file.name,url:pendingPdfImport.previewUrl||'',compact:true});
  const text=global.BoekunaDocumentViewer.textPanel(view);text.panel.hidden=true;host.append(text.panel);
  const toggle=bar.querySelector('[data-review-text-toggle]'),hint=bar.querySelector('.review-viewer-hint');
  toggle.addEventListener('click',()=>{
    const showText=text.panel.hidden;
    if(showText)host.style.height=host.offsetHeight+'px';
    text.panel.hidden=!showText;docHost.hidden=showText;host.scrollTop=0;
    toggle.textContent=showText?'Document tonen':'Tekst kopiëren';
    hint.textContent=showText?'Klik een regel om te kopiëren':'Selecteer tekst om te kopiëren';
    if(showText)text.load();
  });
  requestAnimationFrame(()=>view.render())
}
function toggleMixedVatEditor(force){
  const panel=document.getElementById('mixedVatEditorPanel'),button=document.getElementById('mixedVatEditToggle');if(!panel)return;
  const open=typeof force==='boolean'?force:panel.hidden;
  panel.hidden=!open;if(button)button.setAttribute('aria-expanded',String(open));
  if(open)panel.querySelector('input,select')?.focus()
}
function confirmDuplicateOverride(){
  const el=document.getElementById('pdfImportForm')?.elements.namedItem('confirmDuplicate');if(el)el.value='on';
  const card=document.querySelector('[data-review-issue="confirmDuplicate"]');if(card)card.classList.add('resolved');
  updateBeginnerReviewState()
}
function confirmDocumentAnomaly(){
  const el=document.getElementById('pdfImportForm')?.elements.namedItem('confirmAnomaly');if(el)el.value='on';
  const card=document.querySelector('[data-review-issue="confirmAnomaly"]');if(card)card.classList.add('resolved');
  updateBeginnerReviewState()
}
function viewDuplicateCandidate(){
  const id=pendingPdfImport?.parsed?.duplicateCandidate?.id;
  if(id&&state.documents?.some(x=>String(x.id)===String(id))&&typeof openSavedDocumentReview==='function')return openSavedDocumentReview(id);
  toast('Het bestaande document staat in je documentenoverzicht.')
}
async function saveDocumentWithoutBooking(){
  const importContext=pendingPdfImport,ledger=state,owner=currentUser?.id,d=importContext?.parsed;if(!importContext||!d||d.bookingAllowed!==false)return;
  const sourceClientRef=String(importContext.sourceClientRef||''),sourceDocument=sourceClientRef?state.documents.find(x=>String(x.fileId||'')===sourceClientRef):null,fileId=sourceClientRef||uid('file'),docId=sourceDocument?.id||uid('d');
  let fileSaved=!!sourceClientRef;
  if(!sourceClientRef){
    try{await putStoredFile(fileId,importContext.file);fileSaved=true}catch(err){console.warn(err);toast('Het document kon niet veilig worden bewaard. Probeer het opnieuw.');return}
  }
  if(currentUser?.id!==owner||state!==ledger||pendingPdfImport!==importContext)return;
  const snapshot=captureReviewSnapshot();
  const row={id:docId,fileId:fileSaved?fileId:null,name:importContext.file.name,type:d.documentType||'other',date:d.issueDate||today(),linkedType:null,linkedId:null,source:'document-import',size:importContext.file.size,sha256:importContext.sha256||d.sha256||'',pageCount:d.pageCount??null,ocrUsed:!!d.processor?.ocrUsed,analyzed:true,processingState:'ready',reviewSnapshot:snapshot,reviewAttentionFields:[],reviewedAt:new Date().toISOString(),nonBookable:true};
  const index=state.documents.findIndex(x=>x.id===docId||String(x.fileId||'')===String(fileId||''));
  if(index>=0)state.documents[index]={...state.documents[index],...row};else state.documents.unshift(row);
  logEvent('Document bewaard zonder boeking',row.name||docId,'document',docId,null,{documentType:row.type});
  save();
  const processingJobId=String(importContext.processingJobId||'');
  if(processingJobId&&documentProcessingJobs.find(x=>x.id===processingJobId)?.state==='review_required')invokeDocumentProcessing('resolve',{job_id:processingJobId}).then(()=>fetchDocumentProcessingJobs()).catch(err=>console.warn('Documentcontrole afronden',err));
  cleanupPendingImport();closeModal();navigate('documents');toast('Document bewaard zonder boeking.')
}
function reviewHiddenInput(name,value){
  return '<input type="hidden" name="'+esc(name)+'" value="'+esc(value==null?'':String(value))+'">'
}
function reviewWizardField(d,key,label,full=false){
  const cls='field'+(full?' full':''),safeLabel=esc(label);
  if(key==='party')return '<div class="'+cls+'" data-review-field="party"><label>'+safeLabel+'</label><input name="party" value="'+esc(d.party||'')+'" required autocomplete="organization"></div>';
  if(key==='issueDate')return '<div class="'+cls+'" data-review-field="issueDate"><label>'+safeLabel+'</label><input type="date" name="issueDate" value="'+esc(safeDate(d.issueDate))+'" required></div>';
  if(key==='invoiceNumber')return '<div class="'+cls+'" data-review-field="invoiceNumber"><label>'+safeLabel+'</label><input name="invoiceNumber" value="'+esc(d.invoiceNumber||'')+'" '+(['receipt','other'].includes(reviewDocumentType(d))?'':'required ')+'autocomplete="off"></div>';
  if(key==='category')return '<div class="'+cls+'" data-review-field="category"><label>'+safeLabel+'</label><select name="category">'+selectFieldOptions(['Inkoop','Kantoor','Software','Reiskosten','Marketing','Representatie','Huisvesting','Bank- & factoringkosten','Overig'],String(d.category||'Inkoop'))+'</select></div>';
  if(key==='net')return '<div class="'+cls+'" data-review-field="net"><label>'+safeLabel+'</label><input id="pdfImportNet" name="net" inputmode="decimal" autocomplete="off" value="'+esc(d.net!==''&&d.net!=null?Number(d.net).toFixed(2):'')+'" required></div>';
  if(key==='vatAmount')return '<div class="'+cls+'" data-review-field="vatAmount"><label>'+safeLabel+'</label><input id="pdfImportVatAmount" name="vatAmount" inputmode="decimal" autocomplete="off" value="'+esc(d.vatAmount!==''&&d.vatAmount!=null?Number(d.vatAmount).toFixed(2):'')+'" required></div>';
  if(key==='gross')return '<div class="'+cls+'" data-review-field="gross"><label>'+safeLabel+'</label><input id="pdfImportGross" name="gross" inputmode="decimal" autocomplete="off" value="'+esc(d.gross!==''&&d.gross!=null?Number(d.gross).toFixed(2):'')+'" required></div>';
  if(key==='vatRate'){
    const rate=rateSelectValue(d),special=d.vatRate!=null&&!NORMAL_RATES.includes(Number(d.vatRate));
    return '<div class="'+cls+(d.mixedRates?' review-hidden-scalar':'')+'" data-review-field="vatRate"><label>'+safeLabel+'</label><select id="pdfImportVatRate" name="vatRate" '+(d.mixedRates?'disabled':'')+'><option value="">Kies</option><option value="21" '+(rate==='21'?'selected':'')+'>21%</option><option value="9" '+(rate==='9'?'selected':'')+'>9%</option>'+(special?'<option value="'+esc(String(d.vatRate))+'" selected>'+esc(String(d.vatRate))+'%</option>':'')+'<option value="0" '+(Number(d.vatRate)===0?'selected':'')+'>Geen btw / 0%</option></select>'+(Number(d.vatRate)===0?'<div class="help review-zero-vat-note">Geen btw (0%)</div>':'')+'</div>'
  }
  return ''
}
function reviewIssuePanelForStep(d,issue){
  if(['confirmDuplicate','confirmAnomaly','vatTreatmentChoice','currency'].includes(issue.field))return issuePanel(d,issue);
  return ''
}
function showPdfImportReview(d){
  if(!d||typeof legacyShowPdfImportReview!=='function')return legacyShowPdfImportReview?.(d);
  if(!d.recognitionOriginal){const fields=['documentType','paymentReference','party','invoiceNumber','issueDate','dueDate','net','vatAmount','gross','vatRate','currency','category'];d.recognitionOriginal=Object.fromEntries(fields.map(k=>[k,d[k]]));d.recognitionOriginal.fieldConfidence={...(d.memoryBaseConfidence||d.fieldConfidence)};for(const key of ['anomalyCodes','accountingVatTreatment','bookingAllowed','confidenceScore','reviewRouting','mixedRates','vatLines'])d.recognitionOriginal[key]=structuredClone(d[key]);}
  if(typeof ensureFinancialReviewProvenance==='function')ensureFinancialReviewProvenance(d);
  if(!d.reviewFieldProvenance)d.reviewFieldProvenance={};
  if(!Array.isArray(d.reviewDeferredFields))d.reviewDeferredFields=[];
  if(d.mixedRates)d.vatRate=null;
  // A rate Boekuna cannot book as Dutch VAT (for example 19% or 20%) gets the foreign/historical VAT question
  // instead of a save that is refused later.
  if(!d.mixedRates&&d.vatRate!=null&&d.vatRate!==''&&Number.isFinite(Number(d.vatRate))&&!NL_BOOKABLE_RATES.includes(Number(d.vatRate))&&d.bookingAllowed!==false)d.accountingVatTreatment='review_required';

  reviewWizardStep=1;
  const vm=buildDocumentReviewViewModel(d),type=reviewDocumentType(d),isReceipt=type==='receipt',isSale=['sale_invoice','sales_invoice'].includes(type)||d.type==='sale',invoiceRequired=!['receipt','other'].includes(type);
  const due=safeDate(d.dueDate,d.issueDate),currency=String(d.currency||'EUR').toUpperCase(),categoryValue=String(d.category||'Inkoop');
  const safeAddress=String(d.address||''),safePostal=String(d.postal||''),safeCity=String(d.city||''),safeEmail=String(d.email||''),safePhone=String(d.phone||''),kvk=safeKvk(d.kvk),vatId=safeVatId(d.vatId),iban=safeIban(d.iban);
  const adjustTotal=(d.adjustments||[]).reduce((sum,a)=>sum+Number(a.gross||0),0);
  const preview=pendingPdfImport?.previewUrl?(pendingPdfImport.file.type==='application/pdf'||/\.pdf$/i.test(pendingPdfImport.file.name)?'<iframe src="'+esc(pendingPdfImport.previewUrl)+'" title="Origineel document" class="document-review-preview-frame"></iframe>':'<img src="'+esc(pendingPdfImport.previewUrl)+'" alt="Origineel document" class="document-review-preview-image">'):'<div class="beginner-preview-empty"><strong>Document ontvangen</strong><span>Het origineel blijft beschikbaar tijdens de controle.</span></div>';

  if(vm.mode==='NON_BOOKABLE'){
    const nonBookableBody='<div class="document-review-flow beginner-review exception-first-review non-bookable-review"><aside id="reviewOriginalPanel" class="review-original-panel"><div class="review-preview-shell">'+preview+'</div></aside><div class="document-review-fields"><section class="review-main-card"><div class="review-step-head"><div><span class="review-kicker">Document</span><h4>Dit lijkt geen definitieve bon of factuur</h4></div></div><p>Je kunt het document wel bewaren, maar we boeken het niet als kosten of inkomsten.</p><form id="pdfImportForm">'+
      reviewHiddenInput('type',d.type||'purchase')+reviewHiddenInput('documentType',type)+reviewHiddenInput('party',d.party||'')+reviewHiddenInput('issueDate',d.issueDate||today())+reviewHiddenInput('invoiceNumber',d.invoiceNumber||'')+reviewHiddenInput('category',categoryValue)+reviewHiddenInput('net',d.net??'')+reviewHiddenInput('vatAmount',d.vatAmount??'')+reviewHiddenInput('gross',d.gross??'')+reviewHiddenInput('vatRate',d.vatRate??'')+reviewHiddenInput('currency',currency)+
      '</form><button type="button" class="link-btn" data-review-original-toggle onclick="toggleDocumentOriginal()">Bekijk origineel</button></section></div></div>';
    const nonBookableFoot='<div class="desktop-review-actions"><button class="btn" type="button" onclick="cancelDocumentReview()">Annuleren</button><button class="btn primary" type="button" onclick="saveDocumentWithoutBooking()">Document bewaren</button></div><div class="mobile-review-actions"><button class="btn primary" type="button" onclick="saveDocumentWithoutBooking()">Document bewaren</button></div>';
    modal('Document controleren',nonBookableBody,nonBookableFoot,true);requestAnimationFrame(mountReviewPreview);return
  }

  const initialIssues=presentationIssues(d),basisSpecial=initialIssues.filter(x=>['confirmDuplicate','confirmAnomaly'].includes(x.field)),amountSpecial=initialIssues.filter(x=>['vatTreatmentChoice','currency'].includes(x.field));
  const mixedValid=dataMixedVatValidation(d).ok;
  const mixed=d.mixedRates?'<section class="mixed-vat-summary" data-mixed-summary><h5>Deze bon heeft '+(d.vatLines?.length||'meerdere')+' btw-tarieven</h5><div class="mixed-vat-summary-lines">'+(d.vatLines||[]).map(x=>'<div><strong>'+esc(num(Number(x.rate)))+'%</strong><span>Btw '+esc(money(Number(x.vatAmount||0)))+'</span></div>').join('')+'</div><div class="mixed-vat-total"><span>Totaal btw</span><strong>'+esc(money(Number(d.vatAmount||0)))+'</strong></div>'+(mixedValid?'<p class="review-ok">✓ Verdeling klopt</p>':'<p class="review-attention">Controleer de btw-verdeling</p>')+'<button id="mixedVatEditToggle" type="button" class="link-btn" aria-expanded="'+String(!mixedValid)+'" onclick="toggleMixedVatEditor()">Verdeling aanpassen</button><div id="mixedVatEditorPanel" '+(mixedValid?'hidden':'')+'><div id="mixedVatRows"></div><div class="mixed-vat-actions"><button type="button" class="btn small" onclick="addMixedVatLine()">Regel toevoegen</button><button type="button" class="btn small" onclick="useMixedVatTotals()">Gebruik deze totalen</button></div><div id="mixedVatStatus" class="mixed-vat-status" role="status" aria-live="polite"></div></div></section>':'';
  const payment=(d.advancePayment!=null||d.alreadyPaid!=null||d.outstandingAmount!=null)?'<section class="review-context-card"><strong>Betaling</strong>'+(d.advancePayment!=null?'<span>Voorschot '+money(Number(d.advancePayment))+'</span>':'')+(d.alreadyPaid!=null?'<span>Al betaald '+money(Number(d.alreadyPaid))+'</span>':'')+(d.outstandingAmount!=null?'<span>Nog te betalen '+money(Number(d.outstandingAmount))+'</span>':'')+'</section>':'';

  const basisControls=[
    reviewWizardField(d,'party',isSale?'Klant':'Leverancier',true),
    reviewWizardField(d,'issueDate',isReceipt?'Datum bon':'Factuurdatum'),
    isReceipt?reviewWizardField(d,'category','Categorie'):reviewWizardField(d,'invoiceNumber','Factuurnummer')
  ].join('');
  const basisIssues=basisSpecial.map(x=>reviewIssuePanelForStep(d,x)).join('');

  const netControl=reviewWizardField(d,'net','Bedrag excl. btw').replace('data-review-field="net"','data-review-field="net" data-review-net-editor hidden style="display:none"');
  const amountControls=[
    reviewWizardField(d,'gross','Totaal incl. btw',true),
    reviewWizardField(d,'vatAmount','Btw-bedrag'),
    reviewWizardField(d,'vatRate','Btw-percentage'),
    netControl
  ].join('');
  const amountIssues=amountSpecial.map(x=>reviewIssuePanelForStep(d,x)).join('');

  const hidden=[
    reviewHiddenInput('type',d.type||'purchase'),
    reviewHiddenInput('documentType',type),
    reviewHiddenInput('status',d.status||'sent'),
    isReceipt?reviewHiddenInput('invoiceNumber',d.invoiceNumber||''):'',
    !isReceipt?reviewHiddenInput('category',categoryValue):'',
    currency==='EUR'?reviewHiddenInput('currency','EUR'):'',
    reviewHiddenInput('address',safeAddress),reviewHiddenInput('postal',safePostal),reviewHiddenInput('city',safeCity),
    reviewHiddenInput('email',safeEmail),reviewHiddenInput('phone',safePhone),reviewHiddenInput('kvk',kvk),reviewHiddenInput('vatId',vatId),reviewHiddenInput('iban',iban),
    reviewHiddenInput('dueDate',due),reviewHiddenInput('paymentTermDays',d.paymentTermDays??''),reviewHiddenInput('orderNumber',d.orderNumber||''),
    reviewHiddenInput('paymentReference',d.paymentReference||''),reviewHiddenInput('description',d.description||''),
    !d.duplicateCandidate?reviewHiddenInput('confirmDuplicate','on'):''
  ].join('');

  const financialNeedsAttention=initialIssues.some(x=>x.kind==='financial'||x.kind==='mixed');
  const financialPanel='<div id="financialCorrectionPanel" class="financial-correction-panel '+(financialNeedsAttention?'':'review-secondary-panel')+'" role="status" aria-live="polite"><h5>Controleer totaal en btw</h5><p>Pas alleen aan wat niet klopt.</p></div>';

  const body='<div class="document-review-flow beginner-review exception-first-review two-step-review" data-review-mode="'+esc(vm.mode)+'" data-review-wizard-step="1">'+
    '<aside id="reviewOriginalPanel" class="review-original-panel"><div class="review-preview-shell">'+preview+'</div></aside>'+
    '<div class="document-review-fields"><form id="pdfImportForm">'+hidden+
      '<div class="review-wizard-head"><div><span class="review-kicker">'+esc(isReceipt?'Bon controleren':'Factuur controleren')+'</span><h4 id="documentReviewStepLabel" tabindex="-1">Stap 1 van 2 · Basis</h4></div><button type="button" class="icon-btn review-original-toggle-icon" data-review-original-toggle aria-label="Origineel document bekijken" title="Origineel document" aria-expanded="false" onclick="toggleDocumentOriginal()"><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/></svg></button></div>'+
      '<div class="review-wizard-progress" aria-hidden="true"><span class="active"></span><span></span></div>'+
      '<section class="review-wizard-page" data-review-page="1"><div class="review-page-copy"><h4 tabindex="-1">Basisgegevens</h4><p>Controleer alleen wat nodig is om deze '+(isReceipt?'bon':'factuur')+' te herkennen.</p></div><div class="form-grid review-wizard-grid">'+basisControls+'</div>'+basisIssues+'<div id="reviewBasisState" class="beginner-review-state bad" role="status" aria-live="polite" hidden></div></section>'+
      '<section class="review-wizard-page" data-review-page="2" hidden><div class="review-page-copy"><h4 tabindex="-1">Bedragen</h4><p>Controleer alleen het totaal en de btw. Boekuna berekent de rest.</p></div>'+

        '<div class="form-grid review-wizard-grid review-amount-grid">'+amountControls+'</div>'+
        '<div id="reviewAmountIssueText" class="notice warn compact-review-warning" role="status" hidden></div>'+amountIssues+mixed+payment+financialPanel+
        (adjustTotal>0?'<label class="review-checkbox compact-adjustment"><input type="checkbox" name="bookAdjustments" checked> <span>Gedetecteerde kosten ('+money(adjustTotal)+') apart boeken</span></label>':'')+
        '<div id="reviewBlockingState" class="beginner-review-state" role="status" aria-live="polite"></div>'+
      '</section>'+
    '</form></div></div>';

  const saveLabel=isReceipt?'Bon opslaan':'Factuur opslaan';
  const foot='<div class="desktop-review-actions review-wizard-actions"><button class="btn" type="button" data-review-prev hidden onclick="goToReviewWizardStep(1)">Vorige</button><button class="btn primary" type="button" data-review-next onclick="goToReviewWizardStep(2)">Volgende</button><button class="btn primary" type="button" data-review-save hidden aria-label="Gecontroleerd & opslaan" onclick="savePdfInvoiceImport()">'+saveLabel+'</button></div>'+
    '<div class="mobile-review-actions review-wizard-actions"><button class="btn" type="button" data-review-prev hidden onclick="goToReviewWizardStep(1)">Vorige</button><button class="btn primary" type="button" data-review-next onclick="goToReviewWizardStep(2)">Volgende</button><button class="btn primary" type="button" data-review-save hidden aria-label="Gecontroleerd & opslaan" onclick="savePdfInvoiceImport()">'+saveLabel+'</button></div>';
  modal('Document controleren',body,foot,true);
  requestAnimationFrame(()=>{bindBeginnerReview();setReviewWizardStep(1,false);mountReviewPreview()})
}

function captureReviewSnapshot(){
  const d=pendingPdfImport?.parsed,f=document.getElementById('pdfImportForm');if(!d||!f)return null;
  syncMixedVatFromDomWithoutRender();
  const fd=Object.fromEntries(new FormData(f).entries()),number=v=>{const n=typeof parseSignedMoneyValue==='function'?parseSignedMoneyValue(v):Number(v);return Number.isFinite(n)?n:null},fx=foreignCurrencyReviewState(d),currency=normalizeCurrencyCode(fd.currency||d.currency||'EUR');
  const sourceAmounts={net:number(fd.net),vatAmount:number(fd.vatAmount),gross:number(fd.gross)};
  return {
    version:3,reviewedAt:new Date().toISOString(),
    type:String(fd.type||d.type||'purchase'),documentType:String(fd.documentType||d.documentType||'other'),
    party:String(fd.party||''),issueDate:String(fd.issueDate||''),invoiceNumber:String(fd.invoiceNumber||''),category:String(fd.category||''),
    ...sourceAmounts,sourceAmounts,
    lineItemCount:Number(d.lineItems?.length||0),vatRate:d.mixedRates?null:(fd.vatRate===''?null:Number(fd.vatRate)),mixedRates:!!d.mixedRates,
    vatLines:typeof canonicalFinancialVatLines==='function'?canonicalFinancialVatLines(d.vatLines):structuredClone(d.vatLines||[]),
    vatId:String(fd.vatId||d.vatId||''),iban:String(fd.iban||''),currency,description:String(fd.description||''),dueDate:String(fd.dueDate||''),
    exchangeRateToEur:currency==='EUR'?null:(fx.rate?.normalized||null),exchangeRateConfirmed:currency!=='EUR'&&fx.confirmed,exchangeRateConfirmedAt:currency!=='EUR'&&fx.confirmed?(d.exchangeRateConfirmedAt||null):null,
    bookingCurrency:'EUR',bookingAmountsEur:currency==='EUR'?sourceAmounts:structuredClone(fx.bookingAmountsEur),bookingVatLinesEur:currency==='EUR'?[]:structuredClone(fx.bookingVatLinesEur||[]),
    sourcePaymentAmounts:{advancePayment:d.advancePayment??null,alreadyPaid:d.alreadyPaid??null,outstandingAmount:d.outstandingAmount??null,amountDue:d.amountDue??null,payout:d.payout??null},
    sourceAdjustments:structuredClone(d.adjustments||[]),sourceLineItems:structuredClone(d.lineItems||[]),
    paymentReference:String(fd.paymentReference||''),orderNumber:String(fd.orderNumber||''),paymentTermDays:fd.paymentTermDays===''?null:Number(fd.paymentTermDays),
    advancePayment:d.advancePayment??null,alreadyPaid:d.alreadyPaid??null,outstandingAmount:d.outstandingAmount??null,amountDue:d.amountDue??null,accountingVatTreatment:d.accountingVatTreatment||'standard',vatTreatmentChoice:String(fd.vatTreatmentChoice||''),detectedVatRates:structuredClone(d.detectedVatRates||[]),fieldProvenance:structuredClone(d.fieldProvenance||{}),reviewFieldProvenance:structuredClone(d.reviewFieldProvenance||{}),
    deferredFields:deferredFields(d)
  }
}
function convertOptionalSourceAmount(value,rate){
  const c=cents(value);if(c==null)return value;
  const converted=convertSourceCentsToEur(c,rate);return converted==null?value:converted/100
}
function prepareForeignCurrencyLegacyBooking(d,snapshot){
  if(!snapshot||snapshot.currency==='EUR')return ()=>{};
  const f=document.getElementById('pdfImportForm'),rate=snapshot.exchangeRateToEur,booking=snapshot.bookingAmountsEur;
  if(!f||!snapshot.exchangeRateConfirmed||!rate||!booking)return ()=>{};
  const formOriginal=Object.fromEntries(['currency','net','vatAmount','gross'].map(k=>[k,f.elements.namedItem(k)?.value]));
  const parsedOriginal={currency:d.currency,net:d.net,vatAmount:d.vatAmount,gross:d.gross,vatLines:structuredClone(d.vatLines||[]),advancePayment:d.advancePayment,alreadyPaid:d.alreadyPaid,outstandingAmount:d.outstandingAmount,amountDue:d.amountDue,payout:d.payout,adjustments:structuredClone(d.adjustments||[]),lineItems:structuredClone(d.lineItems||[])};
  const values={currency:'EUR',net:Number(booking.net).toFixed(2),vatAmount:Number(booking.vatAmount).toFixed(2),gross:Number(booking.gross).toFixed(2)};
  for(const [key,value] of Object.entries(values)){const el=f.elements.namedItem(key);if(el)el.value=String(value)}
  d.currency='EUR';d.net=booking.net;d.vatAmount=booking.vatAmount;d.gross=booking.gross;
  if(d.mixedRates&&snapshot.bookingVatLinesEur?.length)d.vatLines=structuredClone(snapshot.bookingVatLinesEur);
  for(const key of ['advancePayment','alreadyPaid','outstandingAmount','amountDue','payout'])if(d[key]!=null)d[key]=convertOptionalSourceAmount(d[key],rate);
  d.adjustments=(d.adjustments||[]).map(a=>{
    const net=a.net!=null?convertOptionalSourceAmount(a.net,rate):a.net,vat=a.vat!=null?convertOptionalSourceAmount(a.vat,rate):a.vat,netC=cents(net),vatC=cents(vat);
    const gross=netC!=null&&vatC!=null?(netC+vatC)/100:convertOptionalSourceAmount(a.gross,rate);
    return {...a,net,vat,gross}
  });
  d.lineItems=(d.lineItems||[]).map(item=>({...item,unit:convertOptionalSourceAmount(item.unit,rate),total:item.total==null?item.total:convertOptionalSourceAmount(item.total,rate)}));
  return ()=>{
    for(const [key,value] of Object.entries(formOriginal)){const el=f.elements.namedItem(key);if(el&&value!=null)el.value=String(value)}
    Object.assign(d,parsedOriginal)
  }
}
function annotateForeignCurrencyBooking(doc,snapshot){
  if(!doc||!snapshot||snapshot.currency==='EUR'||!snapshot.exchangeRateConfirmed)return;
  const meta={sourceCurrency:snapshot.currency,exchangeRateToEur:snapshot.exchangeRateToEur,exchangeRateConfirmedAt:snapshot.exchangeRateConfirmedAt||snapshot.reviewedAt,sourceAmounts:structuredClone(snapshot.sourceAmounts),sourcePaymentAmounts:structuredClone(snapshot.sourcePaymentAmounts||{}),bookingCurrency:'EUR',bookingAmountsEur:structuredClone(snapshot.bookingAmountsEur)};
  Object.assign(doc,meta);
  doc.sourceFieldProvenance=structuredClone(snapshot.fieldProvenance||{});
  if(!doc.fieldProvenance||typeof doc.fieldProvenance!=='object')doc.fieldProvenance={};
  for(const key of ['net','vatAmount','gross'])doc.fieldProvenance[key]={source:'calculated',confirmed:false,confidence:null,derivedFrom:['sourceAmount','exchangeRateToEur'],calculatedAt:snapshot.exchangeRateConfirmedAt||snapshot.reviewedAt};
  const linked=doc.linkedType==='expense'?state.expenses.find(x=>x.id===doc.linkedId):doc.linkedType==='invoice'?state.invoices.find(x=>x.id===doc.linkedId):null;
  if(linked){
    Object.assign(linked,meta,{sourceVatLines:structuredClone(snapshot.vatLines||[]),bookingVatLinesEur:structuredClone(snapshot.bookingVatLinesEur||[]),sourceLineItems:structuredClone(snapshot.sourceLineItems||[])});
    linked.sourceFieldProvenance=structuredClone(snapshot.fieldProvenance||{});
    if(!linked.fieldProvenance||typeof linked.fieldProvenance!=='object')linked.fieldProvenance={};
    for(const key of ['net','vatAmount','gross'])linked.fieldProvenance[key]={source:'calculated',confirmed:false,confidence:null,derivedFrom:['sourceAmount','exchangeRateToEur'],calculatedAt:snapshot.exchangeRateConfirmedAt||snapshot.reviewedAt}
  }
  const adjustmentRows=(state.expenses||[]).filter(x=>x.documentId===doc.id&&x.source==='document-import-adjustment');
  adjustmentRows.forEach((row,index)=>{
    const source=snapshot.sourceAdjustments?.[index]||null;
    Object.assign(row,{sourceCurrency:snapshot.currency,exchangeRateToEur:snapshot.exchangeRateToEur,exchangeRateConfirmedAt:snapshot.exchangeRateConfirmedAt||snapshot.reviewedAt,bookingCurrency:'EUR',sourceAmounts:source?{net:source.net??null,vatAmount:source.vat??null,gross:source.gross??null}:null})
  })
}
function findSavedDocumentAfter(beforeIds,sourceClientRef,fileName){
  if(sourceClientRef){const d=state.documents.find(x=>String(x.fileId||'')===String(sourceClientRef));if(d)return d}
  const fresh=state.documents.find(x=>!beforeIds.has(x.id));if(fresh)return fresh;
  return state.documents.find(x=>String(x.name||'')===String(fileName||'')&&x.linkedId)||null
}
// When saving is refused, the reason stays on screen next to the save button instead of a toast that disappears.
function showSaveRefusal(message,el){
  const box=document.getElementById('reviewBlockingState');
  if(el){const field=el.closest('[data-review-field]');if(field){field.hidden=false;field.style.display=''}const page=el.closest('[data-review-page]');if(page)setReviewWizardStep(Number(page.dataset.reviewPage),false);requestAnimationFrame(()=>el.focus?.())}
  if(box){box.hidden=false;box.className='beginner-review-state bad';box.innerHTML='<strong>Nog niet opgeslagen</strong><span>'+esc(message)+'</span>';box.scrollIntoView?.({block:'nearest'})}
}
async function savePdfInvoiceImport(){
  const importContext=pendingPdfImport,d=importContext?.parsed;if(!d)return legacySavePdfInvoiceImport?.();
  syncMixedVatFromDomWithoutRender();
  const issues=financialBlockingIssues(d);if(issues.length){updateBeginnerReviewState();firstBlockingFocus();toast('Controleer de gemarkeerde gegevens voordat je opslaat.');return}
  const snapshot=captureReviewSnapshot(),deferred=snapshot?.deferredFields||[],beforeIds=new Set(state.documents.map(x=>x.id)),beforeContactIds=new Set(state.contacts.map(x=>x.id)),sourceClientRef=String(importContext?.sourceClientRef||''),fileName=importContext?.file?.name||'';
  const original=structuredClone(d.recognitionOriginal||d),accountId=currentUser?.id,ledger=state,restoreForeign=prepareForeignCurrencyLegacyBooking(d,snapshot);
  const form=document.getElementById('pdfImportForm'),invalid=form&&!form.checkValidity()?form.querySelector(':invalid'):null;
  if(invalid){restoreForeign();showSaveRefusal((invalid.closest('.field')?.querySelector('label')?.textContent||'Een veld')+' ontbreekt nog.',invalid);return}
  let result,refusal='';const originalToast=global.toast;
  global.toast=function(message,...rest){refusal=String(message||'');return originalToast?.apply(this,[message,...rest])};
  try{result=await legacySavePdfInvoiceImport()}finally{global.toast=originalToast;if(pendingPdfImport===importContext)restoreForeign()}
  if(currentUser?.id!==accountId||state!==ledger)return result;
  if(pendingPdfImport){if(pendingPdfImport===importContext)showSaveRefusal(refusal||'Opslaan lukte niet. Controleer de gegevens en probeer het opnieuw.');return result}
  const doc=findSavedDocumentAfter(beforeIds,sourceClientRef,fileName);if(!doc||!snapshot)return result;
  annotateForeignCurrencyBooking(doc,snapshot);
  if(deferred.includes('party')&&doc.linkedType==='expense'){
    state.contacts=state.contacts.filter(c=>beforeContactIds.has(c.id)||c.type!=='supplier'||String(c.name||'').trim()!==String(snapshot.party||'').trim());
  }
  if(accountId&&currentUser?.id===accountId&&state===ledger&&typeof BoekunaDocumentIntelligence!=='undefined'){
    if(!state.documentIntelligence||state.documentIntelligence.ownerId!==accountId)state.documentIntelligence=BoekunaDocumentIntelligence.create(accountId);
    await BoekunaDocumentIntelligence.recordFeedback(state.documentIntelligence,accountId,original,snapshot,doc.sha256||doc.id);
    if(currentUser?.id!==accountId||state!==ledger)return result;
  }
  doc.reviewSnapshot=snapshot;doc.reviewAttentionFields=[...deferred];doc.reviewedAt=snapshot.reviewedAt;
  if(doc.verification?.method==='manual-review'){
    doc.verification.status='verified';doc.verification.method=deferred.length?'user-reviewed-with-attention':'user-reviewed';doc.verification.reasons=[];doc.verification.checkedAt=new Date().toISOString();doc.verification.differences=[];doc.verification.financialIssues=[]
  }
  save();if(page==='documents'||page==='control')render();
  return result
}

function savedReviewValue(snapshot,key){
  const value=snapshot?.[key];if(value==null||value==='')return '—';
  if(['net','vatAmount','gross'].includes(key))return sourceMoney(Number(value),snapshot?.currency||'EUR');
  if(key==='vatRate')return value==null?'Meerdere tarieven':num(Number(value))+'%';
  if(key==='issueDate')return dateNL(value);
  return String(value)
}
function openSavedDocumentReview(id){
  const doc=state.documents.find(x=>x.id===id),s=doc?.reviewSnapshot;if(!doc||!s)return toast('De opgeslagen controle is niet beschikbaar.');
  const rows=[['Leverancier / relatie','party'],['Datum','issueDate'],['Factuurnummer','invoiceNumber'],['Valuta','currency'],['Bedrag excl. btw','net'],['Btw','vatAmount'],['Totaal','gross']];
  const vat=s.mixedRates?'<div class="saved-review-vat"><strong>Btw-verdeling</strong>'+((s.vatLines||[]).map(x=>'<span>'+esc(num(x.rate))+'% · excl. '+esc(sourceMoney(x.taxableAmount,s.currency))+' · btw '+esc(sourceMoney(x.vatAmount,s.currency))+'</span>').join('')||'<span>—</span>')+'</div>':'<div class="saved-review-row"><span>Btw-percentage</span><strong>'+esc(savedReviewValue(s,'vatRate'))+'</strong></div>';
  const fx=s.currency&&s.currency!=='EUR'&&s.exchangeRateConfirmed?'<div class="saved-review-fx"><strong>Bevestigde wisselkoers</strong><span>1 '+esc(s.currency)+' = '+esc(String(s.exchangeRateToEur||'').replace('.',','))+' EUR</span>'+(s.bookingAmountsEur?'<span>EUR-boeking · excl. '+esc(money(s.bookingAmountsEur.net))+' · btw '+esc(money(s.bookingAmountsEur.vatAmount))+' · totaal '+esc(money(s.bookingAmountsEur.gross))+'</span>':'')+'</div>':'';
  const attention=Array.isArray(doc.reviewAttentionFields)&&doc.reviewAttentionFields.length?'<div class="notice warn"><strong>Later controleren</strong><br>'+doc.reviewAttentionFields.map(x=>esc(LABELS[x]||x)).join(' · ')+'</div>':'';
  modal('Opgeslagen controle','<div class="saved-review-card">'+rows.map(([label,key])=>'<div class="saved-review-row"><span>'+esc(label)+'</span><strong>'+esc(savedReviewValue(s,key))+'</strong></div>').join('')+vat+fx+'</div>'+attention,'<button class="btn" onclick="closeModal()">Sluiten</button>'+(doc.reviewAttentionFields?.length?'<button class="btn primary" onclick="openDeferredDocumentReview(\''+esc(doc.id)+'\')">Nu controleren</button>':''),true)
}
function openDeferredDocumentReview(id){
  const doc=state.documents.find(x=>x.id===id),s=doc?.reviewSnapshot,fields=Array.isArray(doc?.reviewAttentionFields)?doc.reviewAttentionFields:[];if(!doc||!s||!fields.length)return openSavedDocumentReview(id);
  const party=fields.includes('party')?'<div class="field"><label>Leverancier</label><input name="party" value="'+esc(s.party||'')+'" required></div>':'';
  const category=fields.includes('category')?'<div class="field"><label>Categorie</label><select name="category">'+selectOptions(['Inkoop','Kantoor','Software','Reiskosten','Marketing','Representatie','Huisvesting','Bank- & factoringkosten','Overig'],s.category||'Inkoop')+'</select></div>':'';
  modal('Later controleren','<p>Werk alleen het aandachtspunt bij. De eerder bevestigde bedragen blijven ongewijzigd.</p><form id="deferredReviewForm" class="form-grid">'+party+category+'</form>','<button class="btn" onclick="closeModal()">Annuleren</button><button class="btn primary" onclick="saveDeferredDocumentReview(\''+esc(id)+'\')">Opslaan</button>')
}
function saveDeferredDocumentReview(id){
  const doc=state.documents.find(x=>x.id===id),s=doc?.reviewSnapshot,f=document.getElementById('deferredReviewForm');if(!doc||!s||!f)return;
  if(!f.checkValidity()){f.reportValidity();return}
  const fd=Object.fromEntries(new FormData(f).entries()),expense=doc.linkedType==='expense'?state.expenses.find(x=>x.id===doc.linkedId):null,invoice=doc.linkedType==='invoice'?state.invoices.find(x=>x.id===doc.linkedId):null;
  for(const field of [...(doc.reviewAttentionFields||[])]){
    if(field==='party'&&fd.party){
      s.party=String(fd.party).trim();
      if(expense){
        expense.vendor=s.party;
        findOrCreateContact('supplier',{party:s.party,email:'',phone:'',vatId:'',kvk:'',address:'',postal:'',city:'',iban:''});
      }
      if(invoice){const c=findOrCreateContact('customer',{party:s.party,email:'',phone:'',vatId:'',kvk:'',address:'',postal:'',city:'',iban:''});invoice.customerId=c.id}
    }
    if(field==='category'&&fd.category){s.category=String(fd.category);if(expense)expense.category=s.category}
    if(!s.reviewFieldProvenance)s.reviewFieldProvenance={};s.reviewFieldProvenance[field]={source:'user',confirmed:true,confirmedAt:new Date().toISOString()}
  }
  doc.reviewAttentionFields=[];s.deferredFields=[];doc.reviewedAt=new Date().toISOString();
  logEvent('Documentaandacht opgelost',doc.name||id,'document',doc.id,null,{fields:Object.keys(fd)});save();closeModal();render();toast('Aandachtspunt bijgewerkt.')
}
async function openPersistentDocumentReview(jobId){
  const job=documentProcessingJobs.find(j=>String(j.id)===String(jobId)),saved=job?state.documents.find(d=>String(d.fileId||'')===String(job.client_ref||'')&&d.linkedId&&d.reviewSnapshot):null;
  if(saved)return openSavedDocumentReview(saved.id);
  return legacyOpenPersistentDocumentReview(jobId)
}
function attentionRows(){
  const rows=typeof legacyAttentionRows==='function'?legacyAttentionRows():[],keys=new Set(rows.map(x=>x.key));
  for(const d of state.documents||[]){
    const fields=Array.isArray(d.reviewAttentionFields)?d.reviewAttentionFields:[];
    if(!fields.length)continue;
    const key='document-review-'+d.id;if(keys.has(key))continue;
    rows.push({key,category:'documents',title:d.name||'Document',detail:'Later controleren · '+fields.map(x=>LABELS[x]||x).join(', '),action:()=>openDeferredDocumentReview(d.id),label:'Controleren'})
  }
  return rows
}
function persistentDocumentReviewActionForFile(d){
  const existing=typeof legacyPersistentDocumentReviewActionForFile==='function'?legacyPersistentDocumentReviewActionForFile(d):'';
  if(existing)return existing;
  return d?.reviewSnapshot?'<button class="link-btn" onclick="openSavedDocumentReview(\''+esc(d.id)+'\')">Bekijken</button> ':''
}

global.BookunaDocumentReviewV2=Object.freeze({requirementsFor,financialBlockingIssues,mixedVatValidation,captureReviewSnapshot,buildDocumentReviewViewModel,parseExchangeRateToEur,convertSourceCentsToEur,foreignCurrencyReviewState});
global.requirementsForDocumentReview=requirementsFor;
global.setDocumentReviewStep=setDocumentReviewStep;
global.goToReviewWizardStep=goToReviewWizardStep;
global.showPdfImportReview=showPdfImportReview;
global.savePdfInvoiceImport=savePdfInvoiceImport;
global.deferDocumentReviewField=deferDocumentReviewField;
global.confirmDocumentReviewField=confirmDocumentReviewField;
global.focusDocumentReviewField=focusDocumentReviewField;
global.confirmFinancialReviewAnchor=confirmFinancialReviewAnchor;
global.confirmExchangeRate=confirmExchangeRate;
global.focusDocumentReviewIssue=focusDocumentReviewIssue;
global.addMixedVatLine=addMixedVatLine;
global.removeMixedVatLine=removeMixedVatLine;
global.useMixedVatTotals=useMixedVatTotals;
global.toggleOtherVatSituation=toggleOtherVatSituation;
global.chooseZeroVat=chooseZeroVat;
global.toggleDocumentReviewEdit=toggleDocumentReviewEdit;
global.toggleDocumentOriginal=toggleDocumentOriginal;
global.toggleMixedVatEditor=toggleMixedVatEditor;
global.confirmDuplicateOverride=confirmDuplicateOverride;
global.confirmDocumentAnomaly=confirmDocumentAnomaly;
global.viewDuplicateCandidate=viewDuplicateCandidate;
global.saveDocumentWithoutBooking=saveDocumentWithoutBooking;
global.updateBeginnerReviewState=updateBeginnerReviewState;
global.applyFinancialCorrectionProposal=applyFinancialCorrectionProposal;
global.confirmSuggestedFinancialRate=confirmSuggestedFinancialRate;
global.openSavedDocumentReview=openSavedDocumentReview;
global.openDeferredDocumentReview=openDeferredDocumentReview;
global.saveDeferredDocumentReview=saveDeferredDocumentReview;
global.openPersistentDocumentReview=openPersistentDocumentReview;
global.attentionRows=attentionRows;
global.persistentDocumentReviewActionForFile=persistentDocumentReviewActionForFile;
})(globalThis);
