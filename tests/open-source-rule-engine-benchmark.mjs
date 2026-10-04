import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {Engine} from 'json-rules-engine';

const facts={
  overdueInvoiceCount:2,
  outstandingAmount:1420,
  partialPaymentCount:1,
  costBaselinePeriods:3,
  costRelativeDelta:0.40,
  costAbsoluteDelta:400,
  documentReviewCount:1,
  vatUnresolvedCount:1,
  unmatchedBankCount:3,
  coldStart:false,
  noAction:false
};

const templates=[
  {name:'OVERDUE_INVOICE',priority:90,own:f=>f.overdueInvoiceCount>0&&f.outstandingAmount>0,json:{all:[{fact:'overdueInvoiceCount',operator:'greaterThan',value:0},{fact:'outstandingAmount',operator:'greaterThan',value:0}]}},
  {name:'PARTIAL_PAYMENT',priority:80,own:f=>f.partialPaymentCount>0,json:{all:[{fact:'partialPaymentCount',operator:'greaterThan',value:0}]}},
  {name:'COST_SPIKE',priority:50,own:f=>f.costBaselinePeriods>=3&&f.costRelativeDelta>=0.30&&f.costAbsoluteDelta>=100,json:{all:[{fact:'costBaselinePeriods',operator:'greaterThanInclusive',value:3},{fact:'costRelativeDelta',operator:'greaterThanInclusive',value:0.30},{fact:'costAbsoluteDelta',operator:'greaterThanInclusive',value:100}]}},
  {name:'SMALL_SPIKE_SUPPRESSED',priority:40,own:f=>f.costRelativeDelta>=0.30&&f.costAbsoluteDelta<100,json:{all:[{fact:'costRelativeDelta',operator:'greaterThanInclusive',value:0.30},{fact:'costAbsoluteDelta',operator:'lessThan',value:100}]}},
  {name:'DOCUMENT_REVIEW',priority:95,own:f=>f.documentReviewCount>0,json:{all:[{fact:'documentReviewCount',operator:'greaterThan',value:0}]}},
  {name:'VAT_UNRESOLVED',priority:100,own:f=>f.vatUnresolvedCount>0,json:{all:[{fact:'vatUnresolvedCount',operator:'greaterThan',value:0}]}},
  {name:'BANK_UNMATCHED',priority:70,own:f=>f.unmatchedBankCount>0,json:{all:[{fact:'unmatchedBankCount',operator:'greaterThan',value:0}]}},
  {name:'COLD_START',priority:20,own:f=>f.coldStart===true,json:{all:[{fact:'coldStart',operator:'equal',value:true}]}},
  {name:'NO_ACTION',priority:10,own:f=>f.noAction===true,json:{all:[{fact:'noAction',operator:'equal',value:true}]}},
  {name:'HIGH_OUTSTANDING',priority:45,own:f=>f.outstandingAmount>=1000,json:{all:[{fact:'outstandingAmount',operator:'greaterThanInclusive',value:1000}]}}
];

function buildOwn(count){
  return Array.from({length:count},(_,i)=>{
    const t=templates[i%templates.length],suffix=':'+String(i).padStart(3,'0');
    return {id:t.name+suffix,priority:t.priority,when:t.own};
  });
}
function runOwn(rules,input){
  const events=[];
  for(const rule of rules)if(rule.when(input))events.push({type:rule.id,priority:rule.priority});
  events.sort((a,b)=>b.priority-a.priority||a.type.localeCompare(b.type));
  return events;
}
function buildJson(count){
  const engine=new Engine([], {allowUndefinedFacts:false});
  for(let i=0;i<count;i++){
    const t=templates[i%templates.length],suffix=':'+String(i).padStart(3,'0');
    engine.addRule({name:t.name+suffix,priority:t.priority,conditions:t.json,event:{type:t.name+suffix,params:{priority:t.priority}}});
  }
  return engine;
}
function normalize(events){
  return events.map(e=>({type:e.type,priority:Number(e.params?.priority??e.priority??0)})).sort((a,b)=>b.priority-a.priority||a.type.localeCompare(b.type));
}
async function timed(label,fn,iterations=1000){
  const start=performance.now();
  for(let i=0;i<iterations;i++)await fn();
  return {label,iterations,totalMs:performance.now()-start};
}

const results=[];
for(const count of [10,100]){
  const own=buildOwn(count),json=buildJson(count);
  const expected=runOwn(own,facts),actual=normalize((await json.run(facts)).events);
  assert.deepEqual(actual,expected,'json-rules-engine outputs must match lightweight BOEKUNA rule proof for '+count+' rules');
  const ownTiming=await timed('own-'+count,()=>runOwn(own,facts));
  const jsonTiming=await timed('json-rules-engine-'+count,async()=>{await json.run(facts)});
  results.push({...ownTiming,avgMs:ownTiming.totalMs/ownTiming.iterations},{...jsonTiming,avgMs:jsonTiming.totalMs/jsonTiming.iterations});
}

// Async fact support proof (feature exists, but BOEKUNA V1 deliberately does not need I/O facts).
{
  const engine=new Engine();
  engine.addFact('asyncOutstanding',async()=>1420);
  engine.addRule({conditions:{all:[{fact:'asyncOutstanding',operator:'greaterThan',value:0}]},event:{type:'ASYNC_FACT'}});
  const out=await engine.run({});
  assert.equal(out.events[0]?.type,'ASYNC_FACT');
}

// Error behavior: missing authoritative facts fail closed by throwing instead of inventing a value.
{
  const engine=new Engine([], {allowUndefinedFacts:false});
  engine.addRule({conditions:{all:[{fact:'missingFinancialTruth',operator:'greaterThan',value:0}]},event:{type:'SHOULD_NOT_FIRE'}});
  await assert.rejects(()=>engine.run({}),/fact/i);
}

console.log(JSON.stringify({candidate:'json-rules-engine',version:'7.3.1',license:'ISC',rules:[10,100],evaluationsPerCase:1000,results},null,2));
