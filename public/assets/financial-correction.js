(function(global){
'use strict';

const DEFAULT_RATES=[0,9,21];
const MONEY_FIELDS=['net','vatAmount','gross'];

function isSafeCentInteger(value){
  return Number.isSafeInteger(value);
}
function roundRatioCents(numerator,denominator){
  if(!Number.isSafeInteger(numerator)||!Number.isSafeInteger(denominator)||denominator<=0) return null;
  const n=BigInt(numerator),d=BigInt(denominator),sign=n<0n?-1n:1n,abs=n<0n?-n:n;
  let q=abs/d;
  const rem=abs%d;
  if(rem*2n>=d)q+=1n;
  const out=q*sign;
  const num=Number(out);
  return Number.isSafeInteger(num)?num:null;
}
function normalizeRate(rate){
  if(rate===''||rate==null)return null;
  const n=Number(rate);
  return Number.isFinite(n)?n:null;
}
function deriveFromGrossRate(grossCents,rate){
  const r=normalizeRate(rate);
  if(!isSafeCentInteger(grossCents)||r==null||r<0||!Number.isInteger(r*1000))return null;
  const scale=100000,rateScaled=Math.round(r*1000);
  const net=roundRatioCents(grossCents*scale,scale+rateScaled);
  if(net==null)return null;
  return {net,vatAmount:grossCents-net,gross:grossCents,rate:r};
}
function deriveFromNetRate(netCents,rate){
  const r=normalizeRate(rate);
  if(!isSafeCentInteger(netCents)||r==null||r<0||!Number.isInteger(r*1000))return null;
  const vat=roundRatioCents(netCents*Math.round(r*1000),100000);
  if(vat==null)return null;
  return {net:netCents,vatAmount:vat,gross:netCents+vat,rate:r};
}
function deriveFromMoneyPair(values,first,second){
  const net=values.net,vat=values.vatAmount,gross=values.gross;
  if(first==='net'&&second==='vatAmount'&&isSafeCentInteger(net)&&isSafeCentInteger(vat))return {net,vatAmount:vat,gross:net+vat};
  if(first==='net'&&second==='gross'&&isSafeCentInteger(net)&&isSafeCentInteger(gross))return {net,vatAmount:gross-net,gross};
  if(first==='vatAmount'&&second==='gross'&&isSafeCentInteger(vat)&&isSafeCentInteger(gross))return {net:gross-vat,vatAmount:vat,gross};
  return null;
}
function candidateFitsRate(candidate,rate,toleranceCents=1){
  const derived=deriveFromNetRate(candidate?.net,rate);
  if(!derived)return false;
  return Math.abs(derived.vatAmount-candidate.vatAmount)<=toleranceCents&&Math.abs(derived.gross-candidate.gross)<=toleranceCents;
}
function inferKnownRate(candidate,validRates=DEFAULT_RATES,toleranceCents=1){
  if(!candidate||!isSafeCentInteger(candidate.net)||!isSafeCentInteger(candidate.vatAmount)||!isSafeCentInteger(candidate.gross))return null;
  const matches=(validRates||DEFAULT_RATES).map(Number).filter(Number.isFinite).filter(rate=>candidateFitsRate(candidate,rate,toleranceCents));
  return matches.length===1?matches[0]:null;
}
function metaFor(provenance,key){
  const p=provenance&&provenance[key]&&typeof provenance[key]==='object'?provenance[key]:{};
  return {source:String(p.source||'recognition'),confidence:Number(p.confidence||0),confirmed:p.confirmed===true,derivedFrom:Array.isArray(p.derivedFrom)?p.derivedFrom:[]};
}
function sourceRank(meta){
  if(meta.source==='user'&&meta.confirmed)return 10000;
  if(meta.source==='recognition'&&meta.confidence>=85)return meta.confidence;
  return -1;
}
function trusted(meta){return sourceRank(meta)>=0}
function sameFieldValue(key,a,b){
  if(key==='vatRate')return normalizeRate(a)===normalizeRate(b);
  return a===b;
}
function buildProposal(input={}){
  const values={
    net:isSafeCentInteger(input.net)?input.net:null,
    vatAmount:isSafeCentInteger(input.vatAmount)?input.vatAmount:null,
    gross:isSafeCentInteger(input.gross)?input.gross:null
  };
  const rate=normalizeRate(input.rate);
  const provenance=input.provenance||{};
  const validRates=(input.validRates||DEFAULT_RATES).map(Number).filter(Number.isFinite);
  if(input.mixedRates)return {status:'mixed',canApply:false,reason:'mixed-vat'};
  const meta={
    net:metaFor(provenance,'net'),
    vatAmount:metaFor(provenance,'vatAmount'),
    gross:metaFor(provenance,'gross'),
    vatRate:metaFor(provenance,'vatRate')
  };
  const userFields=[...MONEY_FIELDS,'vatRate'].filter(k=>meta[k].source==='user'&&meta[k].confirmed);
  const strategies=[];
  const add=(kind,anchors,candidate,bonus=0)=>{
    if(!candidate)return;
    const ranks=anchors.map(k=>sourceRank(meta[k]));
    if(ranks.some(x=>x<0))return;
    const userAnchorCount=anchors.filter(k=>meta[k].source==='user'&&meta[k].confirmed).length;
    strategies.push({kind,anchors,candidate,score:ranks.reduce((a,b)=>a+b,0)+userAnchorCount*1000+bonus});
  };
  if(rate!=null&&validRates.includes(rate)){
    add('gross+rate',['gross','vatRate'],deriveFromGrossRate(values.gross,rate),200);
    add('net+rate',['net','vatRate'],deriveFromNetRate(values.net,rate),100);
  }
  add('net+vat',['net','vatAmount'],deriveFromMoneyPair(values,'net','vatAmount'));
  add('net+gross',['net','gross'],deriveFromMoneyPair(values,'net','gross'),25);
  add('vat+gross',['vatAmount','gross'],deriveFromMoneyPair(values,'vatAmount','gross'),25);

  if(!userFields.length){
    return {status:strategies.length?'needs_confirmation':'insufficient',canApply:false,reason:strategies.length?'confirm-anchor':'insufficient-data'};
  }
  if(!strategies.length)return {status:'insufficient',canApply:false,reason:'insufficient-data'};

  strategies.sort((a,b)=>b.score-a.score);
  const chosen=strategies[0];
  const candidate={...chosen.candidate};
  const inferred=inferKnownRate(candidate,validRates,1);
  if(candidate.rate==null&&inferred!=null)candidate.rate=inferred;

  const conflicts=[];
  for(const key of MONEY_FIELDS){
    if(meta[key].source==='user'&&meta[key].confirmed&&values[key]!=null&&!sameFieldValue(key,values[key],candidate[key])){
      conflicts.push(key);
    }
  }
  if(meta.vatRate.source==='user'&&meta.vatRate.confirmed&&rate!=null&&!candidateFitsRate(candidate,rate,1)){
    conflicts.push('vatRate');
  }
  if(conflicts.length)return {status:'conflict',canApply:false,reason:'confirmed-conflict',conflicts:[...new Set(conflicts)],candidate,anchors:chosen.anchors,inferredRate:inferred};

  const derivedFields=MONEY_FIELDS.filter(key=>!chosen.anchors.includes(key)&&candidate[key]!=null&&candidate[key]!==values[key]);
  const changedFields=MONEY_FIELDS.filter(key=>candidate[key]!=null&&candidate[key]!==values[key]);
  if(!changedFields.length){
    return {status:'consistent',canApply:false,candidate,anchors:chosen.anchors,derivedFields:[],inferredRate:inferred};
  }
  return {
    status:'proposal',
    canApply:derivedFields.length>0,
    candidate,
    anchors:chosen.anchors,
    derivedFields,
    changedFields,
    inferredRate:inferred,
    suggestedRate:(meta.vatRate.source==='user'&&meta.vatRate.confirmed)?null:inferred,
    reason:'deterministic'
  };
}

global.BookunaFinancialCorrection=Object.freeze({
  DEFAULT_RATES,
  MONEY_FIELDS,
  roundRatioCents,
  deriveFromGrossRate,
  deriveFromNetRate,
  deriveFromMoneyPair,
  inferKnownRate,
  candidateFitsRate,
  buildProposal
});
})(globalThis);
