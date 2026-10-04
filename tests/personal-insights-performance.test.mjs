import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';

const source=fs.readFileSync(new URL('../public/assets/personal-insights.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../public/assets/personal-insights-ui.js',import.meta.url),'utf8');
const qna=fs.readFileSync(new URL('../public/assets/personal-assistant-qna.js',import.meta.url),'utf8');
const sandbox={window:{},console,Intl,Date,Math,JSON,Set,Map,Object,Array,String,Number,Boolean,RegExp};
sandbox.globalThis=sandbox.window;
vm.runInNewContext(source,sandbox,{filename:'personal-insights.js'});
vm.runInNewContext(qna,sandbox,{filename:'personal-assistant-qna.js'});
const Engine=sandbox.window.BoekunaPersonalInsights;
const Qna=sandbox.window.BoekunaAssistantQna;
assert.ok(Engine);
assert.ok(Qna);

// The assistant engine/adapter must remain an in-memory selector layer; it must not create DB/N+1 calls.
for(const banned of ['supabase.from(','sb.from(','fetch(','XMLHttpRequest','rpc(']){
  assert.equal(source.includes(banned),false,'Engine must not perform I/O: '+banned);
  assert.equal(ui.includes(banned),false,'Assistant UI adapter must not perform I/O: '+banned);
  assert.equal(qna.includes(banned),false,'Q&A engine must not perform I/O: '+banned);
}

const now='2026-10-04';
const monthlyMetrics=[];
for(let m=1;m<=10;m++){
 const month='2026-'+String(m).padStart(2,'0');
 monthlyMetrics.push({month,complete:m<10,revenue:8000+m*50,costs:2500+m*20,profit:5500+m*30,categories:{Software:500,Apparatuur:700,Reiskosten:400,Overig:900}});
}
const invoices=Array.from({length:600},(_,i)=>({
 id:'i'+i,number:'2026-'+String(i+1).padStart(5,'0'),kind:'invoice',
 effectiveStatus:i%11===0?'partial':i%7===0?'overdue':'sent',
 issueDate:'2026-09-'+String((i%28)+1).padStart(2,'0'),
 dueDate:i%5===0?'2026-09-20':'2026-10-20',
 gross:121+(i%20),paid:i%11===0?50:0,outstanding:i%11===0?71+(i%20):121+(i%20)
}));
const expenses=Array.from({length:1200},(_,i)=>({
 id:'e'+i,date:'2026-10-'+String((i%4)+1).padStart(2,'0'),vendor:'Vendor '+(i%60),net:25+(i%100),vat:5.25,gross:30.25,vatRates:[21],mixedVat:false
}));
const transactions=Array.from({length:800},(_,i)=>({
 id:'t'+i,status:i%3===0?'unmatched':'matched',date:'2026-10-01',amount:i%2?100:-30,
 matchSuggestion:i%12===0?{type:'invoice',id:'i'+(i%600),label:'Factuur'}:null
}));
const documents=Array.from({length:150},(_,i)=>({id:'d'+i,status:i%19===0?'failed':i%7===0?'review_required':'ready',accountingImpact:i%14===0?'vat':''}));
const recurringVendors=Array.from({length:30},(_,i)=>({key:'vendor-'+i,vendor:'Vendor '+i,monthlyAverage:50+i,occurrences:4}));
const context={now,invoices,expenses,transactions,documents,monthlyMetrics,recurringVendors,vat:{reserve:840,period:'Q4 2026',unresolvedDocumentCount:4},sourceStatus:{financialReliable:true,documentsReliable:true},preferences:Engine.defaultPreferences()};

for(let i=0;i<5;i++)Engine.evaluate(context);
const samples=[];
for(let i=0;i<50;i++){
 const start=performance.now();const result=Engine.evaluate(context);samples.push(performance.now()-start);
 assert.ok(result.length>0);
 assert.ok(Engine.dashboardInsights(result).length<=3);
}
samples.sort((a,b)=>a-b);
const p50=samples[Math.floor(samples.length*.50)],p95=samples[Math.floor(samples.length*.95)],max=samples.at(-1);
assert.ok(p95<150,'Personal insight p95 generation must stay below 150ms in the synthetic large-tenant gate; got '+p95.toFixed(2)+'ms');
console.log(JSON.stringify({test:'personal-insights-performance',invoices:invoices.length,expenses:expenses.length,transactions:transactions.length,documents:documents.length,p50Ms:Number(p50.toFixed(2)),p95Ms:Number(p95.toFixed(2)),maxMs:Number(max.toFixed(2)),ioCallsFromEngine:0}));


const qnaFacts={
 financialReliable:true,periodLabel:'Deze maand',revenue:8420,costs:2180,profit:6240,vatReserve:742,
 vatUnresolvedDocumentCount:2,outstandingTotal:1420,overdueOutstanding:620,overdueInvoiceCount:1,
 overdueInvoices:[{number:'2026-1001',outstanding:620,daysOverdue:8}],documentReviewCount:2,unmatchedTransactionCount:3,
 adminStatus:'attention',baselineEligible:true,costChange:{absoluteDelta:460,currentCost:2180,baselineCost:1720,category:'Apparatuur'}
};
const qnaQuestions=['Hoe sta ik ervoor?','Wat moet ik vandaag doen?','Welke facturen zijn te laat?','Hoeveel staat nog open?','Hoeveel btw moet ik apartzetten?','Waarom kan mijn btw veranderen?','Waarom zijn mijn kosten hoger?','Hoeveel winst heb ik?','Wat is voorbelasting?','Kun je mijn crypto voorspellen?'];
for(let i=0;i<20;i++){Qna.answer(qnaQuestions[i%qnaQuestions.length],qnaFacts);Qna.suggestQuestions(qnaFacts,[],{goals:['Btw overzichtelijk houden']})}
const qnaSamples=[];
for(let i=0;i<1000;i++){
 const start=performance.now();
 const answer=Qna.answer(qnaQuestions[i%qnaQuestions.length],qnaFacts);
 const suggestions=Qna.suggestQuestions(qnaFacts,[],{goals:['Btw overzichtelijk houden']});
 qnaSamples.push(performance.now()-start);
 assert.ok(answer&&suggestions.length>0);
}
qnaSamples.sort((a,b)=>a-b);
const qnaP50=qnaSamples[Math.floor(qnaSamples.length*.50)],qnaP95=qnaSamples[Math.floor(qnaSamples.length*.95)],qnaMax=qnaSamples.at(-1);
assert.ok(qnaP95<25,'Personal Assistant V1.2 Q&A p95 must stay below 25ms; got '+qnaP95.toFixed(2)+'ms');
console.log(JSON.stringify({test:'personal-assistant-v1-2-performance',iterations:qnaSamples.length,p50Ms:Number(qnaP50.toFixed(3)),p95Ms:Number(qnaP95.toFixed(3)),maxMs:Number(qnaMax.toFixed(3)),ioCallsFromQna:0}));
