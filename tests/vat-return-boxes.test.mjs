import assert from 'node:assert/strict';
import { loadApp, financialNames } from './production-code.mjs';

// The VAT page lists the boxes of the Dutch VAT return; expenses are entered as on the receipt.
const app = loadApp([...financialNames, 'expenseDeductibleVat', 'vatReturnBoxes', 'splitExpenseGross']);
const inv = (id, lines, extra = {}) => ({ id, status: 'sent', taxTreatment: 'standard', lines, ...extra });
const invoices = [
  inv('a', [{ qty: 10, unit: 85, vat: 21 }, { qty: 1, unit: 49.99, vat: 9 }, { qty: 1, unit: 20, vat: 0 }]),
  inv('b', [{ qty: 3, unit: 33.33, vat: 21 }], { discountType: 'percent', discountValue: 10 }),
  inv('c', [{ qty: 1, unit: 33.33, vat: 21, sourceLineIndex: 0 }], { kind: 'credit', creditFor: 'b', discountType: 'fixed', discountValue: 3.33 }),
  inv('d', [{ qty: 1, unit: 500, vat: 0 }], { taxTreatment: 'icp' }),
  inv('e', [{ qty: 1, unit: 300, vat: 0 }], { taxTreatment: 'reverse' }),
];
const expenses = [{ exVat: 100, vatRate: 21 }, { exVat: 50, vatAmount: 4.5 }, { exVat: 80, gross: 80, taxTreatment: 'foreign', vatRate: 21 }];
const r = app.vatReturnBoxes(invoices, expenses);
assert.deepEqual(JSON.parse(JSON.stringify(r.box)), {
  '1a': { net: 909.99, vat: 191.1 }, '1b': { net: 49.99, vat: 4.5 }, '1e': { net: 320, vat: 0 }, '3b': { net: 500, vat: 0 },
});
assert.equal(r.output, invoices.reduce((s, i) => app.roundMoney(s + app.invoiceVat(i)), 0), '1a + 1b equals output VAT');
assert.equal(r.input, 25.5, '5b skips foreign expenses');
assert.equal(r.foreignExpenses, 1);
assert.equal(r.balance, 170.1);

app.state.company = { kor: false };
assert.deepEqual({ ...app.splitExpenseGross(121, 21) }, { gross: 121, exVat: 100, vatAmount: 21 });
assert.deepEqual({ ...app.splitExpenseGross(54.5, 9) }, { gross: 54.5, exVat: 50, vatAmount: 4.5 });
assert.deepEqual({ ...app.splitExpenseGross(10, 21) }, { gross: 10, exVat: 8.26, vatAmount: 1.74 });
assert.deepEqual({ ...app.splitExpenseGross(80, 0) }, { gross: 80, exVat: 80, vatAmount: 0 });
assert.deepEqual({ ...app.splitExpenseGross(121, 21, true) }, { gross: 121, exVat: 121, vatAmount: 0 }, 'KOR: whole amount is cost');

console.log('vat return boxes: ok');
