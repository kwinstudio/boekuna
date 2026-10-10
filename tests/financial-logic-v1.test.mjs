import assert from 'node:assert/strict';
import { appSource, declaration, loadApp, financialNames } from './production-code.mjs';

// The complete money journey on the real production functions, compared with independently worked-out values.
const app = loadApp([...financialNames, 'syncInvoiceStatus', 'invoiceIsOverdueOpen', 'quarterVatPosition', 'inQuarter', 'currentQuarter', 'currentBookYear',
  'expenseDeductibleVat', 'expenseAccountingCost', 'expenseVatRates', 'expenseHasMixedVat', 'expenseVatRateValue', 'splitExpenseGross',
  'mixedExpenseSplit', 'expenseVatFromForm', 'vatReturnBoxes'], { today: () => '2026-10-10' });
const c = v => Math.round(Number(v) * 100);
const eq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m);
const form = o => ({ get: k => (k in o ? o[k] : null), has: k => k in o });
const inv = (id, extra = {}) => ({ id, number: id, kind: 'invoice', status: 'sent', taxTreatment: 'standard', issueDate: '2026-10-02', dueDate: '2026-10-30', lines: [{ qty: 1, unit: 100, vat: 21 }], ...extra });
const reset = (invoices = [], expenses = [], transactions = []) => Object.assign(app.state, { company: { kor: false }, invoices, expenses, transactions });

// Sales invoice of €121 incl. 21% and a cost of €54,50 incl. 9%.
const sale = inv('F-1');
reset([sale]);
eq([c(app.invoiceNet(sale)), c(app.invoiceVat(sale)), c(app.invoiceGross(sale))], [10000, 2100, 12100], 'sale: €100 net, €21 VAT');
const cost = { id: 'k1', date: '2026-10-03', ...app.splitExpenseGross(54.5, 9), vatRate: 9 };
eq([c(cost.exVat), c(cost.vatAmount)], [5000, 450], 'cost: €50 net, €4,50 VAT');
reset([sale], [cost]);
assert.equal(c(app.invoiceNet(sale) - app.expenseAccountingCost(cost)), 5000, 'together: €50 profit excl. VAT');
const boxes = app.vatReturnBoxes([sale], [cost]);
eq([c(boxes.output), c(boxes.input), c(boxes.balance)], [2100, 450, 1650], 'VAT balance €16,50 to pay');
assert.equal(c(app.quarterVatPosition()), 1650, 'quarter position equals the VAT return balance');

// Mixed 9% + 21% typed in by hand: separate lines, never all 21%.
const mixed = app.mixedExpenseSplit(66.6, 4.5, 2.1);
eq(mixed.vatLines.map(v => [v.rate, c(v.taxableAmount), c(v.vatAmount)]), [[9, 5000, 450], [21, 1000, 210]]);
eq([c(mixed.exVat), c(mixed.vatAmount), c(mixed.gross)], [6000, 660, 6660]);
const mixedCost = { id: 'k2', date: '2026-10-04', exVat: mixed.exVat, vatAmount: mixed.vatAmount, gross: mixed.gross, vatRate: null, mixedRates: true, vatLines: mixed.vatLines };
assert.equal(c(app.expenseDeductibleVat(mixedCost)), 660, 'mixed VAT counts as the sum of its lines');
assert.equal(app.expenseVatRateValue(mixedCost), null, 'mixed costs have no single rate');
assert.ok(app.mixedExpenseSplit(10, 4.5, 2.1).error, 'VAT that cannot fit the total is refused');
assert.equal(app.mixedExpenseSplit(100, 4.5, 2.1).vatLines.find(v => v.rate === 0)?.taxableAmount, 33.4, 'a part without VAT becomes a 0% line');

// Manual cost: no assumed 21%. "Weet ik niet" deducts nothing and is marked for follow-up.
assert.equal(app.expenseVatFromForm(form({ gross: '121', vatRate: '' })).error, 'Kies hoeveel btw er op de bon staat.');
const unknown = app.expenseVatFromForm(form({ gross: '121', vatRate: 'unknown' }));
eq([unknown.vatUnknown, c(unknown.vatAmount), c(unknown.exVat), unknown.vatRate], [true, 0, 12100, null]);
assert.equal(app.expenseDeductibleVat({ ...unknown }), 0, 'unknown VAT is never deducted automatically');
const kor = app.expenseVatFromForm(form({ gross: '121', vatRate: '21' }), true);
eq([c(kor.vatAmount), c(kor.exVat)], [0, 12100], 'KOR: no VAT on costs');
const foreign = { exVat: 80, gross: 80, vatAmount: 16, taxTreatment: 'foreign' };
eq([app.expenseDeductibleVat(foreign), app.expenseAccountingCost(foreign)], [0, 80], 'foreign VAT: not deductible, whole amount is cost');

// One cent rule for open amounts.
const paid = (id, payments, extra) => { const i = inv(id, { payments, ...extra }); return i };
for (const [amount, open] of [[120.99, 1], [120.98, 2]]) {
  const i = paid('P' + open, [{ amount, date: '2026-10-05' }]); reset([i]); app.syncInvoiceStatus(i);
  assert.equal(c(app.invoiceOutstanding(i)), open, `€${amount} paid leaves ${open} cent open`);
  assert.equal(app.invoiceEffectiveStatus(i), 'partial', 'status is partly paid');
  assert.equal(i.status, 'sent', 'a cent open is never stored as paid');
  assert.equal(app.invoiceHasOpenAmount(i), true, 'and it stays in the open lists');
}
{
  const i = paid('P0', [{ amount: 121, date: '2026-10-05' }]); reset([i]); app.syncInvoiceStatus(i);
  eq([c(app.invoiceOutstanding(i)), app.invoiceEffectiveStatus(i), i.status, app.invoiceHasOpenAmount(i)], [0, 'paid', 'paid', false], 'exact payment: nothing open');
}
{
  const i = paid('P2', [{ amount: 60.5, date: '2026-10-05' }, { amount: 50, date: '2026-10-06' }]); reset([i]);
  eq([c(app.invoiceOutstanding(i)), app.invoiceEffectiveStatus(i)], [1050, 'partial'], 'several part payments');
  i.payments.push({ amount: 10.5, date: '2026-10-07' }); app.syncInvoiceStatus(i);
  eq([c(app.invoiceOutstanding(i)), app.invoiceEffectiveStatus(i)], [0, 'paid'], 'last part settles it');
}
{
  const i = paid('PB', [{ amount: 21, date: '2026-10-05' }]);
  reset([i], [], [{ id: 't', status: 'matched', matchType: 'invoice', matchId: 'PB', amount: 100, date: '2026-10-06' }]);
  eq([c(app.invoicePaidAmount(i)), app.invoiceEffectiveStatus(i)], [12100, 'paid'], 'bank payment plus manual registration, counted once each');
}
{
  const i = paid('PC', [{ amount: 50, date: '2026-10-05' }]);
  const credit = inv('CR', { kind: 'credit', creditFor: 'PC', lines: [{ qty: 1, unit: 100, vat: 21, sourceLineIndex: 0 }] });
  reset([i, credit]);
  eq([c(app.invoiceOutstanding(i)), app.invoiceEffectiveStatus(i)], [0, 'credited'], 'credit note settles the unpaid part');
  assert.equal(c(app.invoiceOutstanding(credit)), 5000, 'the paid €50 stays open on the credit as a refund');
  assert.equal(c(app.vatReturnBoxes([i, credit], []).output), 0, 'credit note reverses the VAT');
}
{
  const old = inv('OLD', { issueDate: '2026-08-20', dueDate: '2026-09-03' }); reset([old]);
  eq([app.invoiceHasOpenAmount(old), app.invoiceIsOverdueOpen(old)], [true, true], 'open invoice from an earlier month stays open and overdue');
}

// Cancelled invoices: never revenue, VAT or receivable.
const cancelled = inv('X-1', { status: 'cancelled' });
reset([cancelled]);
eq([app.invoiceCounts(cancelled), c(app.invoiceOutstanding(cancelled)), app.invoiceHasOpenAmount(cancelled), app.invoiceIsOverdueOpen(cancelled)], [false, 0, false, false]);
assert.equal(c(app.quarterVatPosition()), 0, 'cancelled invoice adds no VAT to the tax reserve');
const draft = inv('D-1', { status: 'draft' });
assert.equal(app.invoiceCounts(draft), false, 'a concept never counts');

// Every total uses the same rule: no screen may filter on "not a concept" alone.
for (const name of ['quarterVatPosition', 'renderVat', 'renderVatHistory', 'renderVatHistoryTable', 'vatReturnCopyText', 'copyVat', 'renderCashflow', 'forecastAt',
  'renderReports', 'buildReportPreview', 'freeToSpend', 'monthCardHtml', 'vatQuarterAmount', 'renderInvoices', 'invoiceIsOverdueOpen', 'bankMatchDecision']) {
  const src = declaration(appSource, name);
  assert.ok(!/\b[a-z]\.status!=='draft'/.test(src), `${name} must use invoiceCounts, not only "not a concept"`);
  assert.ok(!/invoiceOutstanding\([a-z]+\)\s*(>|<=)\s*0?\.0[12]/.test(src), `${name} must use the one-cent rule`);
}
assert.ok(!appSource.includes('Die krijg je terug'), 'no promise that receipt VAT comes back');
console.log('financial logic v1: ok');
