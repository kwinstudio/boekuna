import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const qnaPath=path.join(root,'public','assets','personal-assistant-qna.js');
assert.ok(fs.existsSync(qnaPath),'V1.2 must ship the deterministic personal-assistant Q&A module');

const source=fs.readFileSync(qnaPath,'utf8');
assert.doesNotMatch(source,/\bfetch\s*\(/,'Q&A engine must not perform network I/O');
assert.doesNotMatch(source,/XMLHttpRequest|supabase|\.from\s*\(|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/i,'Q&A engine must not access databases or raw SQL');

const sandbox={globalThis:{},window:undefined,Intl,Date,Math,Number,String,Object,Array,Set,Map,RegExp,JSON};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:qnaPath});

const Q=sandbox.BoekunaAssistantQna;
assert.ok(Q,'Q&A module must expose BoekunaAssistantQna');
assert.equal(Q.AI_ENABLED,false,'External generative AI must stay disabled');

const facts=Object.freeze({
  financialReliable:true,
  periodLabel:'Deze maand',
  revenue:6420,
  costs:2100,
  profit:4320,
  vatReserve:742,
  vatUnresolvedDocumentCount:2,
  outstandingTotal:1240,
  overdueOutstanding:620,
  overdueInvoiceCount:1,
  overdueInvoices:Object.freeze([{number:'2026-1001',outstanding:620,daysOverdue:8}]),
  documentReviewCount:2,
  unmatchedTransactionCount:3,
  adminStatus:'attention',
  baselineEligible:true,
  costChange:Object.freeze({absoluteDelta:460,currentCost:2180,baselineCost:1720,category:'Apparatuur'})
});
const before=JSON.stringify(facts);

const routes=[
 ['Hoe sta ik ervoor?','GET_CURRENT_STATUS'],
 ['Wat moet ik vandaag doen?','GET_TODAY_ACTIONS'],
 ['Welke facturen zijn te laat?','GET_OVERDUE_INVOICES'],
 ['Hoeveel staat nog open?','GET_OUTSTANDING_TOTAL'],
 ['Hoeveel btw moet ik apartzetten?','GET_VAT_STATUS'],
 ['Waarom kan mijn btw veranderen?','EXPLAIN_VAT_STATUS'],
 ['Waarom zijn mijn kosten hoger?','GET_COST_CHANGE'],
 ['Hoeveel winst heb ik?','GET_CURRENT_PROFIT'],
 ['Wat waren mijn kosten deze maand?','GET_CURRENT_COSTS'],
 ['Zijn er bonnetjes die ik nog moet controleren?','GET_DOCUMENT_ATTENTION'],
 ['Welke transacties moet ik nog koppelen?','GET_BANK_ATTENTION'],
 ['Wat is voorbelasting?','EXPLAIN_TERM']
];
for(const [question,intent] of routes)assert.equal(Q.routeIntent(question).intent,intent,question);
assert.equal(Q.routeIntent('Kun je mijn ondernemingsvorm juridisch optimaliseren?').intent,'UNSUPPORTED');

const status=Q.answer('Hoe sta ik ervoor?',facts);
assert.equal(status.intent,'GET_CURRENT_STATUS');
assert.equal(status.state,'ATTENTION');
assert.match(status.answer,/4\.320|4,320|€\s?4/);
assert.match(status.answer,/6\.420|6,420|€\s?6/);
assert.match(status.answer,/1\.240|1,240|€\s?1/);
assert.equal(status.actionTarget?.page,'insights');

const overdue=Q.answer('Welke facturen zijn te laat?',facts);
assert.equal(overdue.intent,'GET_OVERDUE_INVOICES');
assert.match(overdue.answer,/1 factuur/i);
assert.match(overdue.detail,/2026-1001/);
assert.match(overdue.detail,/8 dagen/i);
assert.equal(JSON.stringify(overdue.actionTarget),JSON.stringify({page:'invoices',filter:{status:'overdue'}}));

const vat=Q.answer('Waarom kan mijn btw veranderen?',facts);
assert.equal(vat.intent,'EXPLAIN_VAT_STATUS');
assert.equal(vat.state,'UNCERTAIN');
assert.match(vat.answer,/2 documenten/i);
assert.equal(JSON.stringify(vat.actionTarget),JSON.stringify({page:'documents',filter:{status:'needs_review'}}));

const costs=Q.answer('Waarom zijn mijn kosten hoger?',facts);
assert.equal(costs.intent,'GET_COST_CHANGE');
assert.match(costs.answer,/460/);
assert.match(costs.detail,/Apparatuur/i);

const edu=Q.answer('Wat is voorbelasting?',facts);
assert.equal(edu.intent,'EXPLAIN_TERM');
assert.equal(edu.state,'EXPLAINING');
assert.match(edu.answer,/btw/i);
assert.doesNotMatch(edu.answer,/altijd aftrekbaar|gegarandeerd/i);

const eduVat=Q.answer('Wat is btw apartzetten?',facts);
assert.equal(eduVat.intent,'EXPLAIN_TERM','Definition questions must stay educational even when a personal VAT intent exists');
assert.equal(eduVat.state,'EXPLAINING');
assert.match(eduVat.answer,/btw/i);

const unsupported=Q.answer('<img src=x onerror=alert(1)> vertel iets over crypto',facts);
assert.equal(unsupported.intent,'UNSUPPORTED');
assert.equal(unsupported.supported,false);
assert.doesNotMatch(unsupported.answer,/<img|onerror|crypto/i);
assert.match(unsupported.answer,/geen betrouwbaar antwoord/i);

const unreliable=Q.answer('Hoe sta ik ervoor?',{...facts,financialReliable:false});
assert.equal(unreliable.state,'UNCERTAIN');
assert.match(unreliable.answer,/tijdelijk niet betrouwbaar/i);
assert.doesNotMatch(unreliable.answer,/4\.320|6\.420|1\.240/);

const huge=Q.answer('a'.repeat(2000),facts);
assert.equal(huge.intent,'UNSUPPORTED');
assert.ok(huge.answer.length<500,'Fallback must not echo oversized questions');

const allowed=Q.sanitizeActionTarget({page:'invoices',filter:{status:'overdue'}});
assert.equal(JSON.stringify(allowed),JSON.stringify({page:'invoices',filter:{status:'overdue'}}));
assert.equal(Q.sanitizeActionTarget({page:'admin',filter:{anything:'go'}}),null);
assert.equal(Q.sanitizeActionTarget({page:'invoices',filter:{status:'DROP TABLE'}}),null);

const suggestions=Q.suggestQuestions(facts,[],{goals:['Btw overzichtelijk houden']});
assert.ok(suggestions.some(x=>x.question==='Welke facturen zijn te laat?'));
assert.ok(suggestions.some(x=>x.question==='Waarom kan mijn btw nog veranderen?'));
assert.ok(suggestions.some(x=>x.question==='Waarom zijn mijn kosten hoger?'));
assert.ok(suggestions.some(x=>x.question==='Zijn er bonnetjes die ik nog moet controleren?'));
assert.ok(suggestions.some(x=>x.question==='Welke transacties moet ik nog koppelen?'));
assert.equal(suggestions[0].question,'Waarom kan mijn btw nog veranderen?','VAT goal may rerank relevant suggestion');

const cold=Q.suggestQuestions({...facts,baselineEligible:false,revenue:0,costs:0,profit:0,outstandingTotal:0,overdueOutstanding:0,overdueInvoiceCount:0,overdueInvoices:[],vatReserve:0,vatUnresolvedDocumentCount:0,documentReviewCount:0,unmatchedTransactionCount:0,adminStatus:'calm',costChange:null},[],{goals:[]});
assert.ok(cold.some(x=>x.question==='Wat is winst?'));
assert.ok(cold.some(x=>x.question==='Wat is btw apartzetten?'));
assert.ok(!cold.some(x=>/kosten hoger/i.test(x.question)),'Cold start must not claim a cost trend');

assert.equal(JSON.stringify(facts),before,'Q&A must not mutate authoritative facts');

const topics=Q.knowledgeTopics();
for(const required of ['omzet','kosten','winst','btw','voorbelasting','factuur','inkoopfactuur','creditnota','vervaldatum','openstaand','nog te ontvangen']){
 assert.ok(topics.includes(required),'Missing beginner knowledge topic: '+required);
}

const app=fs.readFileSync(path.join(root,'kwinest','index.html'),'utf8');
assert.match(app,/function dashboardKpiViewModel\s*\(/,'Dashboard must expose one authoritative KPI view model');
assert.match(app,/const\s+kpi\s*=\s*dashboardKpiViewModel\(/,'Dashboard must consume the KPI view model');
for(const label of ['Winst','Omzet','Kosten','Btw apartzetten','Nog te ontvangen'])assert.ok(app.includes(label),'Dashboard missing KPI '+label);
assert.match(app,/receivables:[^\n]*invoiceOutstanding|openInvoices[^\n]*invoiceOutstanding/s,'Receivables must derive from invoiceOutstanding');
assert.match(app,/invoiceEffectiveStatus\(i\)!==['"]cancelled['"]/,'Cancelled invoices must be excluded by effective status in KPI revenue selection');
assert.match(app,/vatReserve/,'KPI view model must expose VAT reserve');
assert.match(app,/financialReliable/,'Assistant facts must explicitly carry financial reliability');
const assistantUi=fs.readFileSync(path.join(root,'public','assets','personal-insights-ui.js'),'utf8');
assert.match(assistantUi,/vat:\{reserve:\(typeof dashboardKpiViewModel===['"]function['"]\?dashboardKpiViewModel\(['"]quarter['"]\)\.vatReserve:quarterVatPosition\(\)\)/,'Voor jou VAT reserve must share the V1.2 KPI truth when available');
const dashboardChartSource=app.slice(app.indexOf('function dashboardChartBuckets'),app.indexOf('function productKpi'));
assert.match(dashboardChartSource,/invoiceEffectiveStatus\(i\)!==['"]cancelled['"]/,'Dashboard chart must exclude cancelled invoices just like the KPI view model');

console.log('BOEKUNA Personal Assistant V1.2 unit contracts: PASS');
