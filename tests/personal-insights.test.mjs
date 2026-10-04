import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const assetUrl=new URL('../public/assets/personal-insights.js',import.meta.url);
assert.ok(fs.existsSync(assetUrl),'personal-insights.js must exist before assistant rules can pass');
const source=fs.readFileSync(assetUrl,'utf8');
const sandbox={window:{},console,Intl,Date,Math,JSON,Set,Map,Object,Array,String,Number,Boolean,RegExp};
sandbox.globalThis=sandbox.window;
vm.runInNewContext(source,sandbox,{filename:'personal-insights.js'});
const Engine=sandbox.window.BoekunaPersonalInsights;
assert.ok(Engine,'engine must expose window.BoekunaPersonalInsights');
for(const fn of ['evaluate','buildBaselines','rankInsights','defaultPreferences'])assert.equal(typeof Engine[fn],'function',fn+' must be public');
assert.equal(Engine.AI_ENABLED,false,'V1 must not enable generative AI');
assert.equal(Object.isFrozen(Engine.THRESHOLDS),true,'thresholds must be central and immutable');

const NOW='2026-10-04';
const base=overrides=>({
 now:NOW,
 invoices:[],
 expenses:[],
 transactions:[],
 documents:[],
 monthlyMetrics:[],
 vat:{reserve:0,period:'Q4 2026',unresolvedDocumentCount:0},
 sourceStatus:{documentsReliable:true,financialReliable:true},
 preferences:Engine.defaultPreferences(),
 ...overrides
});
const ids=(insights,type)=>insights.filter(x=>x.type===type);
const evaluate=ctx=>Engine.evaluate(base(ctx));

// 1. Group overdue invoices and use authoritative outstanding, not gross.
{
 const insights=evaluate({invoices:[
  {id:'i1',number:'2026-001',kind:'invoice',effectiveStatus:'partial',dueDate:'2026-09-20',gross:1210,paid:1000,outstanding:210,customerName:'A'},
  {id:'i2',number:'2026-002',kind:'invoice',effectiveStatus:'overdue',dueDate:'2026-09-22',gross:605,paid:0,outstanding:605,customerName:'B'}
 ]});
 const overdue=ids(insights,'OVERDUE_INVOICE');
 assert.equal(overdue.length,1,'overdue invoices must be grouped');
 assert.equal(overdue[0].sourceFacts.invoiceCount,2);
 assert.equal(overdue[0].sourceFacts.totalOutstanding,815,'partial payment must reduce authoritative outstanding');
 assert.equal(overdue[0].priority,'P1');
 assert.equal(overdue[0].actionTarget.page,'invoices');
 assert.equal(overdue[0].actionTarget.filter.status,'overdue');
}

// 2. Ten overdue invoices still produce one grouped insight.
{
 const invoices=Array.from({length:10},(_,n)=>({id:'o'+n,number:'F'+n,kind:'invoice',effectiveStatus:'overdue',dueDate:'2026-09-01',gross:100,paid:0,outstanding:100}));
 const overdue=ids(evaluate({invoices}),'OVERDUE_INVOICE');
 assert.equal(overdue.length,1);
 assert.equal(overdue[0].sourceFacts.invoiceCount,10);
}

// 3. Cold start must suppress trend language.
{
 const monthlyMetrics=[
  {month:'2026-09',complete:true,revenue:1200,costs:1000,profit:200,categories:{Software:1000}},
  {month:'2026-10',complete:false,revenue:1200,costs:1800,profit:-600,categories:{Software:1800}}
 ];
 assert.equal(ids(evaluate({monthlyMetrics}),'COST_SPIKE').length,0,'one historical month is not a baseline');
}

// 4. Cost spike requires 3 complete historical months and both percentage + absolute impact.
{
 const history=['2026-07','2026-08','2026-09'].map(month=>({month,complete:true,revenue:2500,costs:1000,profit:1500,categories:{Software:300,Apparatuur:300,Reis:400}}));
 const current={month:'2026-10',complete:false,revenue:2500,costs:1400,profit:1100,categories:{Software:300,Apparatuur:700,Reis:400}};
 const spike=ids(evaluate({monthlyMetrics:[...history,current]}),'COST_SPIKE');
 assert.equal(spike.length,1);
 assert.equal(spike[0].sourceFacts.baselinePeriods,3);
 assert.equal(spike[0].sourceFacts.baselineCost,1000);
 assert.equal(spike[0].sourceFacts.currentCost,1400);
 assert.equal(spike[0].sourceFacts.absoluteDelta,400);
 assert.equal(spike[0].sourceFacts.relativeDelta,0.4);
 assert.match(spike[0].reason,/3 volledige maanden/i);
}

// 5. A tiny absolute difference must not become a dramatic percentage insight.
{
 const history=['2026-07','2026-08','2026-09'].map(month=>({month,complete:true,revenue:100,costs:10,profit:90,categories:{Software:10}}));
 const current={month:'2026-10',complete:false,revenue:100,costs:14,profit:86,categories:{Software:14}};
 assert.equal(ids(evaluate({monthlyMetrics:[...history,current]}),'COST_SPIKE').length,0,'EUR 10 -> 14 is +40% but immaterial');
}

// 6. Document rules use safe workflow facts only; raw OCR content may never enter sourceFacts.
{
 const insights=evaluate({documents:[
  {id:'d1',name:'factuur.pdf',status:'review_required',accountingImpact:'vat',rawOcr:'SECRET OCR TEXT'},
  {id:'d2',name:'bon.jpg',status:'failed',rawOcr:'ANOTHER SECRET'}
 ],vat:{reserve:840,period:'Q4 2026',unresolvedDocumentCount:1}});
 const review=ids(insights,'DOCUMENT_REVIEW_REQUIRED')[0];
 const failed=ids(insights,'DOCUMENT_PROCESSING_FAILED')[0];
 const vat=ids(insights,'VAT_UNRESOLVED_DOCUMENTS')[0];
 assert.ok(review&&failed&&vat,'document and VAT attention rules should fire');
 assert.equal(JSON.stringify(insights).includes('SECRET OCR TEXT'),false,'raw OCR must never leak into insight objects');
 assert.equal(JSON.stringify(insights).includes('ANOTHER SECRET'),false,'raw OCR must never leak into insight objects');
}

// 7. VAT reserve is pass-through truth; engine must not normalize foreign/mixed VAT rates.
{
 const insights=evaluate({
  expenses:[
   {id:'e1',date:'2026-10-01',vendor:'Foreign vendor',net:100,vat:20,gross:120,vatRates:[20],mixedVat:false},
   {id:'e2',date:'2026-10-02',vendor:'Mixed vendor',net:100,vat:15,gross:115,vatRates:[9,21],mixedVat:true}
  ],
  vat:{reserve:35,period:'Q4 2026',unresolvedDocumentCount:0}
 });
 const reserve=ids(insights,'VAT_CURRENT_RESERVE')[0];
 assert.equal(reserve.sourceFacts.reserve,35);
 assert.equal(JSON.stringify(reserve).includes('21%'),false,'assistant must not normalize foreign VAT to 21%');
}

// 8. Existing bank match suggestion may be surfaced; assistant must never invent one.
{
 const without=evaluate({transactions:[{id:'t1',status:'unmatched',date:'2026-10-01',amount:121,description:'betaling'}]});
 assert.equal(ids(without,'BANK_MATCH_AVAILABLE').length,0);
 const withSuggestion=evaluate({transactions:[{id:'t1',status:'unmatched',date:'2026-10-01',amount:121,description:'betaling',matchSuggestion:{type:'invoice',id:'i1',label:'Factuur 2026-001'}}]});
 assert.equal(ids(withSuggestion,'BANK_MATCH_AVAILABLE').length,1);
 assert.equal(ids(withSuggestion,'BANK_MATCH_AVAILABLE')[0].sourceFacts.suggestionType,'invoice');
}

// 9. P2/P3 dismissal may hide an insight; P0/P1 safety/action insights cannot be permanently hidden.
{
 const recurring={type:'RECURRING_VENDOR',id:'RECURRING_VENDOR:adobe'};
 const overdueId='OVERDUE_INVOICE:group';
 const prefs={...Engine.defaultPreferences(),hiddenTypes:['RECURRING_VENDOR'],dismissed:{[overdueId]:NOW}};
 const facts=base({
  preferences:prefs,
  invoices:[{id:'i1',number:'F1',kind:'invoice',effectiveStatus:'overdue',dueDate:'2026-09-01',gross:500,paid:0,outstanding:500}],
  recurringVendors:[{key:'adobe',vendor:'Adobe',monthlyAverage:65,occurrences:4}]
 });
 const insights=Engine.evaluate(facts);
 assert.equal(ids(insights,recurring.type).length,0,'P3 hidden type should stay hidden');
 assert.equal(ids(insights,'OVERDUE_INVOICE').length,1,'P1 overdue warning must not be suppressed by dismissal state');
}

// 10. Resolution is automatic on recompute: when invoice is paid, overdue insight disappears.
{
 const open=base({invoices:[{id:'i1',number:'F1',kind:'invoice',effectiveStatus:'overdue',dueDate:'2026-09-01',gross:500,paid:0,outstanding:500}]});
 assert.equal(ids(Engine.evaluate(open),'OVERDUE_INVOICE').length,1);
 const paid=structuredClone(open);paid.invoices[0]={...paid.invoices[0],effectiveStatus:'paid',paid:500,outstanding:0};
 assert.equal(ids(Engine.evaluate(paid),'OVERDUE_INVOICE').length,0);
}

// 11. Priority ordering is deterministic: P0 > P1 > P2 > P3.
{
 const ranked=Engine.rankInsights([
  {id:'tip',priority:'P3',score:1},
  {id:'insight',priority:'P2',score:90},
  {id:'action',priority:'P1',score:1},
  {id:'block',priority:'P0',score:1}
 ]);
 assert.deepEqual(ranked.map(x=>x.id),['block','action','insight','tip']);
}

// 12. Dashboard selector caps at three and puts blocking/action items first.
{
 const results=evaluate({
  invoices:[{id:'i1',number:'F1',kind:'invoice',effectiveStatus:'overdue',dueDate:'2026-09-01',gross:500,paid:0,outstanding:500}],
  transactions:[{id:'t1',status:'unmatched',date:'2026-10-01',amount:500}],
  documents:[{id:'d1',name:'x.pdf',status:'review_required',accountingImpact:'vat'}],
  vat:{reserve:600,period:'Q4 2026',unresolvedDocumentCount:1},
  recurringVendors:[{key:'adobe',vendor:'Adobe',monthlyAverage:65,occurrences:4}]
 });
 const dash=Engine.dashboardInsights(results);
 assert.equal(dash.length,3);
 assert.ok(['P0','P1'].includes(dash[0].priority));
}

// 13. Copy must remain plain Dutch and must not contain tax-advice or AI-accountant claims.
{
 const sample=evaluate({
  invoices:[{id:'i1',number:'F1',kind:'invoice',effectiveStatus:'overdue',dueDate:'2026-09-01',gross:500,paid:0,outstanding:500}],
  vat:{reserve:250,period:'Q4 2026',unresolvedDocumentCount:0}
 });
 const text=JSON.stringify(sample).toLowerCase();
 for(const banned of ['ai accountant','ai boekhouder','koop nu apparatuur','belasting te besparen','debiteurenpositie','reconciliatie'])assert.equal(text.includes(banned),false,'banned assistant wording: '+banned);
}

console.log('BOEKUNA personal insights deterministic engine contracts: PASS');
