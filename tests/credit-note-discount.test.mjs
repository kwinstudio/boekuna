import assert from 'node:assert/strict';
import { loadApp, financialNames } from './production-code.mjs';

// Credit notes must follow the original invoice's discount, never credit more than was billed.
const app = loadApp([...financialNames, 'creditedQtyForLine', 'creditTotalUsed', 'applySourceDiscountToCredit']);
const credit = (src, qtys, id) => {
  const c = { id, kind: 'credit', creditFor: src.id, status: 'draft', taxTreatment: 'standard',
    lines: src.lines.map((l, i) => qtys[i] ? { ...l, qty: qtys[i], sourceLineIndex: i } : null).filter(Boolean) };
  app.applySourceDiscountToCredit(src, c);
  app.state.invoices.push(c);
  return [app.invoiceNet(c), app.invoiceVat(c), app.invoiceGross(c)];
};

const pct = { id: 'p', status: 'sent', taxTreatment: 'standard', discountType: 'percent', discountValue: 10, lines: [{ desc: 'Uren', qty: 3, unit: 33.33, vat: 21 }] };
app.state.invoices = [pct];
assert.deepEqual([app.invoiceNet(pct), app.invoiceVat(pct)], [89.99, 18.9]);
assert.deepEqual(credit(pct, [1], 'c1'), [-30, -6.3, -36.3], '1 of 3 hours at 10% discount');
assert.deepEqual(credit(pct, [1], 'c2'), [-30, -6.3, -36.3]);
assert.deepEqual(credit(pct, [1], 'c3')[0], -29.99, 'Last credit closes exactly on the billed net');
assert.equal(app.creditTotalUsed('p'), 89.99);

const fixed = { id: 'f', status: 'sent', taxTreatment: 'standard', discountType: 'fixed', discountValue: 50, lines: [{ desc: 'Pakket', qty: 2, unit: 100, vat: 21 }] };
app.state.invoices = [fixed];
assert.deepEqual(credit(fixed, [2], 'f1'), [-150, -31.5, -181.5], 'Full credit equals the discounted invoice');

const plain = { id: 'n', status: 'sent', taxTreatment: 'standard', lines: [{ desc: 'Werk', qty: 1, unit: 100, vat: 21 }] };
app.state.invoices = [plain];
const c = { id: 'n1', kind: 'credit', creditFor: 'n', lines: [{ ...plain.lines[0], sourceLineIndex: 0 }] };
app.applySourceDiscountToCredit(plain, c);
assert.equal(c.discountType, undefined, 'No discount fields on credits of undiscounted invoices');

console.log('credit note discount: ok');
