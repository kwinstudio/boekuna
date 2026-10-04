(function(global){
'use strict';
const VERSION=1,RETENTION_DAYS=180,MAX_EVENTS=500,MIN_OBSERVATIONS=3;
const PATTERN_FIELDS=['documentType','currency','vatRate','category'];
const FIELDS=['documentType','paymentReference','party','invoiceNumber','issueDate','dueDate','net','vatAmount','gross','vatRate','currency','category'];
const CATEGORIES=['Software','Reiskosten','Marketing','Inkoop','Overig','Kantoor','Huisvesting','Representatie','Telefoon & internet','Bank- & factoringkosten'];
async function hash(value){const bytes=new TextEncoder().encode(String(value));return Array.from(new Uint8Array(await global.crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('')}
function normalize(v){return (v&&typeof v==='object'?JSON.stringify(v):String(v??'')).normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim()}
function bucket(n){return n>=90?'HIGH':n>=70?'MEDIUM':'LOW'}
function owner(memory,ownerId){if(!ownerId||memory?.ownerId!==ownerId)throw new Error('Document memory owner mismatch')}
function create(ownerId){return {version:VERSION,ownerId,profiles:{},feedback:[],enabled:false}}
async function supplierKey(ownerId,d){const identity=d.vatId?normalize(d.vatId):normalize(d.party);return identity?hash(ownerId+'|supplier|'+identity):null}
function invoicePattern(v){return String(v||'').replace(/[A-Za-z]/g,'A').replace(/\d/g,'9').slice(0,60)}
function safePatterns(d){
 const patterns={};
 for(const field of PATTERN_FIELDS){
  const value=d?.[field];if(value==null||value==='')continue;
  if(field==='category'&&(!CATEGORIES.includes(value)||d.deferredFields?.includes(field)))continue;
  if(field==='documentType'&&!['purchase_invoice','sale_invoice','credit_invoice','receipt','other'].includes(value))continue;
  if(field==='currency'&&!/^[A-Z]{3}$/.test(value))continue;
  if(field==='vatRate'&&(!Number.isFinite(Number(value))||Number(value)<0||Number(value)>100))continue;
  patterns[field]=String(value);
 }
 if(d.invoiceNumber)patterns.invoicePattern=invoicePattern(d.invoiceNumber);
 if(d.paymentReference)patterns.paymentReferencePattern=invoicePattern(d.paymentReference);
 const days=(Date.parse(d.dueDate)-Date.parse(d.issueDate))/86400000;if(Number.isInteger(days)&&days>=0&&days<=365)patterns.duePeriod=String(days);
 // Coarse amount bands support anomaly ranking without retaining exact totals.
 const amount=Math.abs(Number(d.gross));if(Number.isFinite(amount)&&amount>0)patterns.amountBand=String(Math.floor(Math.log10(amount)));
 if(d.lineItems?.length||d.lineItemCount)patterns.layoutShape=String(Math.min(50,d.lineItems?.length||d.lineItemCount))+'|'+(d.mixedRates?'mixed':'single');
 return patterns;
}
function cleanup(memory,now=Date.now()){
 const cutoff=now-RETENTION_DAYS*86400000;
 memory.feedback=(memory.feedback||[]).filter(x=>Date.parse(x.timestamp)>=cutoff).slice(-MAX_EVENTS);
 // Rebuild from retained observations so stale evidence cannot survive a refresh.
 const profiles={};
 for(const event of memory.feedback){
  const p=profiles[event.supplierKey]||{observations:0,successes:0,rejections:0,patterns:{},fieldStats:{},updatedAt:event.timestamp};
  p.observations++;p.updatedAt=event.timestamp;
  if(event.outcome==='rejected')p.rejections++;
  else{
   p.successes++;
   for(const [field,value] of Object.entries(event.patterns||{})){const options=p.patterns[field]||{};options[value]=(options[value]||0)+1;p.patterns[field]=options}
   for(const field of event.fieldOutcomes||[]){const key=field.field+'|'+field.bucket,stats=p.fieldStats[key]||{observations:0,correct:0};stats.observations++;if(field.correct)stats.correct++;p.fieldStats[key]=stats}
  }
  profiles[event.supplierKey]=p;
 }
 memory.profiles=profiles;
}
async function recordFeedback(memory,ownerId,original,confirmed,documentFingerprint,outcome='accepted'){
 owner(memory,ownerId);cleanup(memory);
 if(!documentFingerprint||!['accepted','corrected','rejected'].includes(outcome)||confirmed?.deferredFields?.includes('party'))return;
 const key=await supplierKey(ownerId,confirmed);if(!key)return;
 const docKey=await hash(ownerId+'|document|'+documentFingerprint);
 if(memory.feedback.some(x=>x.documentKey===docKey))return;
 const timestamp=new Date().toISOString(),correctedFields=[],fieldOutcomes=[];
 const patterns=outcome==='rejected'?{}:safePatterns(confirmed);
 if(outcome!=='rejected'&&confirmed.iban)patterns.bankAccountHash=await hash(ownerId+'|bank|'+normalize(confirmed.iban));
 for(const field of FIELDS){
  const changed=normalize(original?.[field])!==normalize(confirmed?.[field]);
  const n=Number(original?.fieldConfidence?.[field]||0);
  if(original?.[field]!=null&&original?.[field]!==''&&!confirmed?.deferredFields?.includes(field))fieldOutcomes.push({field,bucket:bucket(n),correct:!changed});
  if(changed)correctedFields.push({field,originalHash:await hash(ownerId+'|'+normalize(original?.[field])),correctedHash:await hash(ownerId+'|'+normalize(confirmed?.[field])),confidenceBefore:n});
 }
 memory.feedback.push({supplierKey:key,documentKey:docKey,outcome:outcome==='accepted'&&correctedFields.length?'corrected':outcome,correctedFields,fieldOutcomes,patterns,telemetry:{...telemetry(original),correctedFieldTypes:correctedFields.map(x=>x.field)},timestamp});
 cleanup(memory);
}
function confidenceEstimate(stats){return stats?.observations>=20?Math.min(95,Math.floor((stats.correct+1)/(stats.observations+2)*100)):null}
function moneyCents(value){
 if(value==null||value==='')return null;
 const match=String(value).match(/^(-?)(\d+)(?:\.(\d{1,}))?$/);if(!match)return null;
 const dec=(match[3]||'').padEnd(3,'0');let n=BigInt(match[2])*100n+BigInt(dec.slice(0,2));if(Number(dec[2])>=5)n++;if(match[1])n=-n;const out=Number(n);return Number.isSafeInteger(out)?out:null;
}
function reviewRoute(d,memoryAgrees=false){
 const critical=['documentType','party','invoiceNumber','issueDate','net','vatAmount','gross','vatRate','currency'];
 if(d.documentType==='receipt')critical.splice(critical.indexOf('invoiceNumber'),1);
 if(d.mixedRates)critical.splice(critical.indexOf('vatRate'),1,'vatLines');
 const fields=critical.filter(k=>!d.fieldProvenance?.[k]?.confirmed&&!d.reviewFieldProvenance?.[k]?.confirmed&&(Number(d.fieldConfidence?.[k]||0)<90||d[k]==null||d[k]===''));
 const n=moneyCents(d.net),v=moneyCents(d.vatAmount),g=moneyCents(d.gross),consistent=n!=null&&v!=null&&g!=null&&n+v===g;
 const blocked=d.bookingAllowed===false||['other','bank_document','unknown'].includes(d.documentType)||d.accountingVatTreatment==='review_required'||d.currency!=='EUR'||d.duplicateCandidate||d.anomalyCodes?.length||!consistent||d.mixedRates&&((d.vatLines||[]).length<2||(d.vatLines||[]).reduce((sum,l)=>sum+(moneyCents(l.taxableAmount)||0),0)!==n||(d.vatLines||[]).reduce((sum,l)=>sum+(moneyCents(l.vatAmount)||0),0)!==v);
 const mode=blocked||fields.length>3?'FULL_REVIEW':(!fields.length&&memoryAgrees?'AUTO_ACCEPT_CANDIDATE':'QUICK_REVIEW');
 return {mode,fields,count:fields.length,autoBook:false};
}
async function predict(memory,ownerId,d){
 owner(memory,ownerId);cleanup(memory);
 const key=await supplierKey(ownerId,d),p=key?memory.profiles[key]:null;
 const candidate={...d,fieldConfidence:{...d.fieldConfidence},memoryEvidence:[]};
 let agrees=false;
 if(p&&p.successes>=MIN_OBSERVATIONS&&p.rejections===0){
  const top=field=>Object.entries(p.patterns[field]||{}).sort((a,b)=>b[1]-a[1])[0];
  agrees=['documentType','currency','vatRate'].every(k=>top(k)&&top(k)[0]===String(d[k])&&top(k)[1]/p.successes>=.9);
  const currentPatterns=safePatterns(d);
  if(d.iban)currentPatterns.bankAccountHash=await hash(ownerId+'|bank|'+normalize(d.iban));
  candidate.memoryComparisons=[];candidate.memoryAnomalyFields=[];
  for(const field of ['documentType','currency','vatRate','duePeriod','invoicePattern','paymentReferencePattern','amountBand','layoutShape','bankAccountHash']){
   const usual=top(field),current=currentPatterns[field];
   if(usual&&usual[1]>=MIN_OBSERVATIONS&&usual[1]/p.successes>=.9&&current!=null&&usual[0]!==String(current)&&(['bankAccountHash','currency','vatRate','documentType'].includes(field)||field==='amountBand'&&Math.abs(Number(usual[0])-Number(current))>=2))candidate.memoryAnomalyFields.push(field==='bankAccountHash'?'iban':field==='amountBand'?'gross':field);
   if(usual&&usual[1]>=MIN_OBSERVATIONS&&usual[1]/p.successes>=.9&&current!=null)candidate.memoryComparisons.push({field,agrees:usual[0]===String(current),source:'tenant-confirmations',observations:usual[1],updatedAt:p.updatedAt});
  }
  if(agrees){
   for(const field of ['party','invoiceNumber','issueDate','dueDate','currency']){
    if(d.fieldProvenance?.[field]?.confirmed||d.reviewFieldProvenance?.[field]?.confirmed)continue;
    const current=Number(d.fieldConfidence?.[field]||0),stats=p.fieldStats[field+'|'+bucket(current)],estimate=confidenceEstimate(stats);
    if(current<70||current>=90||estimate==null||estimate<90)continue;
    if(field==='invoiceNumber'&&top('invoicePattern')?.[0]!==invoicePattern(d.invoiceNumber))continue;
    candidate.fieldConfidence[field]=estimate;
    candidate.memoryEvidence.push({field,source:'tenant-confirmations',observations:stats.observations,updatedAt:p.updatedAt,confidenceBefore:current,confidenceAfter:estimate});
   }
   const category=top('category');
   if(category&&category[1]>=MIN_OBSERVATIONS&&category[1]/p.successes>=.9&&!d.fieldProvenance?.category?.confirmed&&!d.reviewFieldProvenance?.category?.confirmed&&Number(d.fieldConfidence?.category||0)<70){
    candidate.category=category[0];candidate.memoryEvidence.push({field:'category',source:'tenant-confirmations',observations:category[1],updatedAt:p.updatedAt});
   }
  }
 }
 candidate.reviewRouting=reviewRoute(candidate,agrees);
 if(candidate.memoryAnomalyFields?.length)candidate.reviewRouting={mode:'FULL_REVIEW',fields:[...new Set([...candidate.reviewRouting.fields,...candidate.memoryAnomalyFields])],count:new Set([...candidate.reviewRouting.fields,...candidate.memoryAnomalyFields]).size,autoBook:false};
 if(!memory.enabled)return {...d,reviewRouting:reviewRoute(d),memoryShadow:candidate.reviewRouting,memoryEvidence:[],memoryPredictions:candidate.memoryEvidence};
 return candidate;
}
function relationshipCandidates(d,rows){
 const candidates=[];
 for(const row of rows||[]){
  if(normalize(row.party)!==normalize(d.party)||row.currency!==d.currency)continue;
  if(d.referencedInvoiceNumber&&normalize(row.invoiceNumber)===normalize(d.referencedInvoiceNumber))candidates.push({id:row.id,type:d.isCredit?'credit_for':'reference',score:1,evidence:['explicit-reference','supplier','currency'],autoLink:false});
  else if(d.orderNumber&&row.orderNumber&&normalize(d.orderNumber)===normalize(row.orderNumber))candidates.push({id:row.id,type:'same_order',score:.95,evidence:['order-reference','supplier','currency'],autoLink:false});
  else if(row.type==='payment'&&d.paymentReference&&normalize(row.paymentReference)===normalize(d.paymentReference)&&moneyCents(row.total)===moneyCents(d.gross)&&Math.abs(Date.parse(row.invoiceDate)-Date.parse(d.issueDate))<=31*86400000)candidates.push({id:row.id,type:'payment_for',score:1,evidence:['payment-reference','supplier','currency','exact-amount','date-proximity'],autoLink:false});
 }
 return candidates;
}
function telemetry(d){
 return {documentType:['purchase_invoice','sale_invoice','credit_invoice','receipt','other','bank_document'].includes(d.documentType)?d.documentType:'other',reviewMode:['FULL_REVIEW','QUICK_REVIEW','AUTO_ACCEPT_CANDIDATE'].includes(d.reviewRouting?.mode)?d.reviewRouting.mode:reviewRoute(d).mode,confidenceBucket:bucket(Number(d.confidenceScore||0)),correctedFieldTypes:[],anomalyTypes:(d.anomalyCodes||[]).filter(x=>['PRINTED_SUBTOTAL_CONFLICT','PRINTED_VAT_TOTAL_CONFLICT','VAT_MATH_MISMATCH','TOTAL_ARITHMETIC_MISMATCH','VAT_GROUP_MISMATCH','INCOMPLETE_VAT_GROUPS','LINE_ARITHMETIC_MISMATCH','LINE_VAT_MISMATCH','LINE_GROSS_MISMATCH','LINE_NET_MISMATCH','LINE_TOTAL_MISMATCH','NON_BOOKABLE_DOCUMENT','DUE_DATE_BEFORE_INVOICE','INVOICE_NUMBER_YEAR_ONLY','UNEXPECTED_NEGATIVE_AMOUNT','PAYMENT_BALANCE_MISMATCH','IMPOSSIBLE_OUTSTANDING','IMPOSSIBLE_PAYMENT','CURRENCY_CONFLICT','COMPETING_PAYMENT_AMOUNTS','AMBIGUOUS_PAYMENT_COMPONENTS'].includes(x)).slice(0,20)};
}
function aggregateMetrics(memory){
 const events=memory.feedback||[],metrics={documents:events.length,correctedDocuments:0,rejectedDocuments:0,reviewModes:{},anomalies:{},fields:{}};
 for(const event of events){
  if(event.outcome==='corrected')metrics.correctedDocuments++;
  if(event.outcome==='rejected')metrics.rejectedDocuments++;
  const mode=event.telemetry?.reviewMode;if(['FULL_REVIEW','QUICK_REVIEW','AUTO_ACCEPT_CANDIDATE'].includes(mode))metrics.reviewModes[mode]=(metrics.reviewModes[mode]||0)+1;
  for(const type of telemetry({anomalyCodes:event.telemetry?.anomalyTypes}).anomalyTypes)metrics.anomalies[type]=(metrics.anomalies[type]||0)+1;
  for(const field of FIELDS){const f=metrics.fields[field]||{observations:0,corrections:0};if(event.fieldOutcomes?.some(x=>x.field===field))f.observations++;if(event.correctedFields?.some(x=>x.field===field))f.corrections++;metrics.fields[field]=f}
 }
 return metrics;
}
function forget(memory,ownerId){owner(memory,ownerId);memory.profiles={};memory.feedback=[];memory.enabled=false}
global.BoekunaDocumentIntelligence={create,recordFeedback,cleanup,forget,supplierKey,hash,predict,reviewRoute,relationshipCandidates,telemetry,aggregateMetrics,confidenceEstimate};
})(typeof window!=='undefined'?window:globalThis);
