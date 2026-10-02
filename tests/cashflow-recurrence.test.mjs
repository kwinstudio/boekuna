import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
const start=html.indexOf('function normalizePlannedCash(');
assert.ok(start>=0,'Cashflow must normalize missing recurrence to oneoff');
const source=html.slice(start,html.indexOf('function renderCashflow(',start));
const context=vm.createContext({
  state:{invoices:[],plannedCash:[],transactions:[{amount:1000}],expenses:[],settlements:[]},
  today:()=> '2026-01-31',cashBalance:()=>1000,invoiceOutstanding:i=>i.outstanding,
});
vm.runInContext(source,context);
const run=(code)=>JSON.parse(JSON.stringify(vm.runInContext(code,context)));
const dates=(date,repeating,from,to)=>run(`plannedCashOccurrenceDates(${JSON.stringify({date,repeating})},'${from}','${to}')`);
assert.equal(run(`normalizePlannedCash({id:'old',date:'2026-01-01',amount:20}).repeating`),'oneoff');
assert.equal(run(`normalizePlannedCash({repeating:'unsupported'}).repeating`),'oneoff');
assert.deepEqual(dates('2026-01-31','monthly','2026-01-01','2026-05-31'),['2026-01-31','2026-02-28','2026-03-31','2026-04-30','2026-05-31'],'Month-end clamps against original anchor without drift');
assert.deepEqual(dates('2024-01-31','monthly','2024-02-01','2024-03-31'),['2024-02-29','2024-03-31']);
assert.deepEqual(dates('2024-02-29','yearly','2024-01-01','2028-03-01'),['2024-02-29','2025-02-28','2026-02-28','2027-02-28','2028-02-29']);
assert.deepEqual(dates('2026-01-31','quarterly','2026-01-01','2027-02-01'),['2026-01-31','2026-04-30','2026-07-31','2026-10-31','2027-01-31']);
assert.deepEqual(dates('2026-12-28','weekly','2026-12-01','2027-01-12'),['2026-12-28','2027-01-04','2027-01-11']);
assert.deepEqual(dates('2026-03-22','weekly','2026-03-22','2026-04-05'),['2026-03-22','2026-03-29','2026-04-05'],'UTC calendar arithmetic remains weekly across DST');
assert.deepEqual(dates('2026-02-30','monthly','2026-01-01','2026-04-01'),[],'Invalid dates cannot invent forecast occurrences');
assert.deepEqual(dates('2027-01-31','monthly','2026-01-01','2026-12-31'),[]);
assert.deepEqual(dates('2026-01-31','monthly','2026-03-01','2026-02-01'),[]);
assert.deepEqual(dates('2026-01-31','oneoff','2026-01-01','2026-05-31'),['2026-01-31']);
assert.equal(run(`plannedCashProjection([{date:'2027-01-01',type:'out',amount:'invalid'}], '2026-02-28','2026-01-31')`),0,'Future oneoff remains excluded before amount conversion');
assert.equal(run(`plannedCashProjection([{date:'2025-01-01',type:'out',amount:20}], '2026-02-28','2026-01-31')`),-20,'Historical oneoff behavior remains unchanged');
assert.equal(run(`plannedCashProjection([{date:'2025-01-31',type:'out',amount:20,repeating:'monthly'}], '2026-02-28','2026-01-31')`),-40,'Recurring forecast counts only today through cutoff; historical occurrences are not replayed');
assert.equal(run(`plannedCashProjection([{date:'2026-01-31',type:'in',amount:20,repeating:'weekly'}], '2026-02-28','2026-01-31')`),100);
vm.runInContext(`state.invoices=[{status:'sent',kind:'invoice',dueDate:'2026-02-10',outstanding:61},{status:'draft',dueDate:'2026-02-10',outstanding:100}];state.plannedCash=[{id:'rent',date:'2026-01-31',type:'out',amount:100,repeating:'monthly'}]`,context);
const before=run('state');
assert.equal(run('forecastAt(30)'),861,'Forecast adds open receivable and two expected occurrences');
assert.deepEqual(run('state'),before,'Forecast leaves actual transactions, invoices, payments, VAT data and persisted plans untouched');
const serialized=JSON.stringify(before);
vm.runInContext(`state=JSON.parse(${JSON.stringify(serialized)})`,context);
assert.equal(run('forecastAt(30)'),861,'Reload produces same projection');
assert.equal(run('state.plannedCash.length'),1,'No generated rows are persisted');
console.log('Cashflow recurrence domain regression: PASS (calendar anchors, legacy behavior, deterministic forecast, no ledger mutation)');
