(function(global){
'use strict';
const VERSION=1,RETENTION_DAYS=180,MAX_EVENTS=500,MIN_OBSERVATIONS=3;
const PATTERN_FIELDS=['currency','vatRate','category'];
async function hash(value){const bytes=new TextEncoder().encode(String(value));return Array.from(new Uint8Array(await global.crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('')}
function normalize(v){return String(v??'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim()}
function owner(memory,ownerId){if(!ownerId||memory?.ownerId!==ownerId)throw new Error('Document memory owner mismatch')}
function create(ownerId){return {version:VERSION,ownerId,profiles:{},feedback:[],enabled:false}}
async function supplierKey(ownerId,d){const identity=d.vatId?normalize(d.vatId):normalize(d.party);return identity?hash(ownerId+'|supplier|'+identity):null}
function cleanup(memory,now=Date.now()){
 const cutoff=now-RETENTION_DAYS*86400000;
 memory.feedback=(memory.feedback||[]).filter(x=>Date.parse(x.timestamp)>=cutoff).slice(-MAX_EVENTS);
 for(const [key,p] of Object.entries(memory.profiles||{})){if(Date.parse(p.updatedAt)<cutoff)delete memory.profiles[key]}
}
async function recordFeedback(memory,ownerId,original,confirmed,documentFingerprint,outcome='accepted'){
 owner(memory,ownerId);cleanup(memory);
 if(!documentFingerprint||!['accepted','corrected','rejected'].includes(outcome))return;
 const key=await supplierKey(ownerId,confirmed);if(!key)return;
 const docKey=await hash(ownerId+'|document|'+documentFingerprint);
 if(memory.feedback.some(x=>x.documentKey===docKey))return;
 const timestamp=new Date().toISOString(),correctedFields=[];
 for(const field of ['party','invoiceNumber','issueDate','dueDate','net','vatAmount','gross','vatRate','currency','category']){
  if(normalize(original?.[field])!==normalize(confirmed?.[field]))correctedFields.push({field,originalHash:await hash(ownerId+'|'+normalize(original?.[field])),correctedHash:await hash(ownerId+'|'+normalize(confirmed?.[field])),confidenceBefore:Number(original?.fieldConfidence?.[field]||0)});
 }
 memory.feedback.push({supplierKey:key,documentKey:docKey,outcome,correctedFields,timestamp});
 const profile=memory.profiles[key]||{observations:0,successes:0,rejections:0,patterns:{},updatedAt:timestamp};
 profile.observations++;profile.updatedAt=timestamp;
 if(outcome==='rejected')profile.rejections++;
 else{
  profile.successes++;
  for(const field of PATTERN_FIELDS){
   const value=confirmed?.[field];if(value==null||value==='')continue;
   // Never retain free-text fields. Category is restricted to existing product vocabulary.
   if(field==='category'&&!['Software','Reiskosten','Marketing','Inkoop','Overig','Kantoor','Huisvesting','Telefoon & internet','Bank- & factoringkosten'].includes(value))continue;
   if(field==='currency'&&!/^[A-Z]{3}$/.test(value))continue;
   if(field==='vatRate'&&(!Number.isFinite(Number(value))||Number(value)<0||Number(value)>100))continue;
   const options=profile.patterns[field]||{};options[String(value)]=(options[String(value)]||0)+1;profile.patterns[field]=options;
  }
 }
 memory.profiles[key]=profile;cleanup(memory);
}
function forget(memory,ownerId){owner(memory,ownerId);memory.profiles={};memory.feedback=[];memory.enabled=false}
const api={create,recordFeedback,cleanup,forget,supplierKey,hash};
global.BoekunaDocumentIntelligence=api;
})(typeof window!=='undefined'?window:globalThis);
