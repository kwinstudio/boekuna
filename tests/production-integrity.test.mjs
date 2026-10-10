import assert from 'node:assert/strict';
import { loadApp, loadEdge, financialNames } from './production-code.mjs';

const app = loadApp();
const { edge } = loadEdge();
const invoice = (lines, extra = {}) => ({ id: 'invoice', kind: 'invoice', status: 'sent', taxTreatment: 'standard', payments: [], lines, ...extra });
const line = (unit, vat = 21, qty = 1) => ({ qty, unit, vat });

const cases = [
  ['standard', invoice([line(100)]), [100, 21, 121]],
  ['fixed discount on thirds', invoice([line(3)], { discountType: 'fixed', discountValue: 1 }), [2, .42, 2.42]],
  ['one cent across equal lines', invoice([line(.01, 0), line(.01, 0), line(.01, 0)], { discountType: 'fixed', discountValue: .01 }), [.02, 0, .02]],
  ['large invoice small discount', invoice([line(10000)], { discountType: 'fixed', discountValue: 1 }), [9999, 2099.79, 12098.79]],
  ['mixed VAT discount', invoice([line(50), line(50, 9)], { discountType: 'fixed', discountValue: 10 }), [90, 13.5, 103.5]],
  ['percentage discount', invoice([line(100)], { discountType: 'percent', discountValue: 12.5 }), [87.5, 18.38, 105.88]],
  ['credit', invoice([line(100)], { kind: 'credit' }), [-100, -21, -121]],
  ...['kor', 'reverse', 'icp', 'exempt'].map(t => [t, invoice([line(100)], { taxTreatment: t }), [100, 0, 100]]),
  // Half cents round up, also where the binary value is just below (22,50 x 21% = 4,725 is 4,73).
  ['half cent VAT 21%', invoice([line(22.5)]), [22.5, 4.73, 27.23]],
  ['half cent VAT 9%', invoice([line(26.5, 9)]), [26.5, 2.39, 28.89]],
  ['half cent line amount', invoice([line(2.135, 0)]), [2.14, 0, 2.14]],
  ['half cent credit', invoice([line(22.5)], { kind: 'credit' }), [-22.5, -4.73, -27.23]],
];
for (const [label, i, expected] of cases) {
  const actual = [app.invoiceNet(i), app.invoiceVat(i), app.invoiceGross(i)];
  assert.deepEqual(actual, expected, label);
  const c = edge.calc(i);
  assert.deepEqual([c.net, c.vat, c.gross], expected, `Edge parity: ${label}`);
}

// The discount displayed must equal the amount removed, including awkward cents.
for (let cents = 1; cents <= 333; cents++) {
  const i = invoice([line(cents / 100, 0), line(.07, 0), line(.19, 0)], { discountType: 'fixed', discountValue: .11 });
  assert.equal(app.toCents(app.invoiceNet(i)), app.toCents(app.invoiceDiscountBase(i)) - app.toCents(app.invoiceDiscountAmount(i)));
  assert.equal(edge.calc(i).net, app.invoiceNet(i));
}

for (const [value, cents] of [[1.005, 101], [10.075, 1008], [-4.725, -473], [0.004, 0], ['12,5', 0], [NaN, 0], [Infinity, 0]]) {
  assert.equal(app.toCents(value), cents, `toCents(${value})`);
}
assert.ok(Object.is(app.toCents(-0.001), 0), 'No negative zero');

const historic = invoice([line(100)]);
app.state.company.kor = true;
assert.equal(app.invoiceVat(historic), 21, 'Changing company KOR must not change a historic invoice');
app.state.company.kor = false;
assert.equal(app.invoiceVat(invoice([line(100)], { taxTreatment: 'kor' })), 0);

// A final credit note settles the unpaid invoice it credits; a draft does not; what is left is a refund.
{
  const original = invoice([line(22.5), line(4.15, 9, 3)], { id: 'orig', number: '2026-0001', issueDate: '2026-09-01' });
  const credit = invoice(structuredClone(original.lines), { id: 'cr', kind: 'credit', creditFor: 'orig', status: 'draft', number: '2026-0002', issueDate: '2026-09-02' });
  app.state.invoices = [original, credit];
  assert.equal(app.invoiceOutstanding(original), 40.8, 'A draft credit note does not settle anything');
  credit.status = 'sent';
  assert.deepEqual([app.invoiceOutstanding(original), app.invoiceOutstanding(credit)], [0, 0], 'Full credit settles the open invoice');
  assert.deepEqual([app.invoiceEffectiveStatus(original), app.invoiceEffectiveStatus(credit)], ['credited', 'credited']);
  credit.lines = [line(22.5)];
  assert.equal(app.invoiceOutstanding(original), 13.57, 'Partial credit lowers what is still owed');
  assert.equal(app.invoiceEffectiveStatus(original), 'sent');
  credit.lines = structuredClone(original.lines);
  original.payments = [{ amount: 40.8 }];
  assert.deepEqual([app.invoiceOutstanding(original), app.invoiceOutstanding(credit)], [0, 40.8], 'Credit on a paid invoice is a refund to pay back');
  assert.deepEqual([app.invoiceEffectiveStatus(original), app.invoiceEffectiveStatus(credit)], ['paid', 'sent']);
  original.payments = [{ amount: 10 }];
  assert.deepEqual([app.invoiceOutstanding(original), app.invoiceOutstanding(credit)], [0, 10], 'Partly paid: credit settles the rest and refunds the payment');
  original.payments = [];
  const second = invoice([line(4.15, 9, 3)], { id: 'cr2', kind: 'credit', creditFor: 'orig', status: 'sent', number: '2026-0003', issueDate: '2026-09-03' });
  credit.lines = [line(22.5)];
  app.state.invoices = [original, credit, second];
  assert.deepEqual([app.invoiceOutstanding(original), app.invoiceOutstanding(credit), app.invoiceOutstanding(second)], [0, 0, 0], 'Two partial credits settle in date order');
  second.lines = [line(30)];
  assert.deepEqual([app.invoiceOutstanding(original), app.invoiceOutstanding(second)], [0, 22.73], 'Credit beyond the open amount stays open as a refund');
  app.state.invoices = [credit];
  assert.equal(app.invoiceOutstanding(credit), 27.23, 'A credit note without its original keeps its own amount');
  app.state.invoices = [];
}

const partial = invoice([line(100)], { payments: [{ amount: 120.99 }] });
assert.equal(app.invoiceOutstanding(partial), .01);
assert.equal(app.invoiceEffectiveStatus(partial), 'partial', 'One cent outstanding must not show paid');

assert.equal(edge.email('test@example.org'), 'test@example.org', 'Normal addresses must be accepted');
assert.equal(edge.email('bad address@example.org'), '', 'Whitespace must be rejected');
assert.equal(edge.email('not-an-email'), '');

const events = [];
const corrections = loadApp([...financialNames, 'logEvent', 'correctExpense', 'closedVatQuarterLabel'], {
  currentUser: { id: 'test-actor', email: 'actor@example.org' },
  uid: prefix => prefix + '-test', confirm: () => true, money: v => String(v), dateNL: v => v,
  save: () => events.push('save'), closeModal: () => {}, render: () => {}, toast: () => {},
});
corrections.state.expenses.push({ id: 'expense', date: '2026-09-01', vendor: 'Test fixture', exVat: 100, vatRate: 21, taxTreatment: 'standard' });
corrections.correctExpense('expense');
assert.equal(corrections.state.expenses.length, 2);
assert.equal(corrections.state.expenses.reduce((sum, e) => sum + corrections.expenseGross(e), 0), 0);
assert.equal(corrections.state.expenses.find(e => e.id === 'expense').correctedBy, 'test-actor');
assert.equal(corrections.state.audit[0].actorId, 'test-actor');
corrections.correctExpense('expense');
assert.equal(corrections.state.expenses.length, 2, 'Correction must not repeat');
console.log(`Production code integrity: PASS (${cases.length} tax/discount cases, 333 allocations, history, payments, corrections, email)`);
