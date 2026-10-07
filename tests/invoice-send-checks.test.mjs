import assert from 'node:assert/strict';
import { loadApp } from './production-code.mjs';

// Regression: a new user with incomplete company details pressed "Versturen" and
// the send check threw a ReferenceError instead of listing what is missing.
const missing = [{ ok: false, key: 'iban', label: 'IBAN', msg: 'Vul je IBAN in.' },
  { ok: false, key: 'kvk', label: 'KVK-nummer', msg: 'Vul je KVK-nummer in.' }];
const app = loadApp(['invoiceSendChecks'], {
  invoiceFinalChecks: () => ({ errors: [{ label: 'KVK-nummer', msg: 'Vul je KVK-nummer in.', companyField: 'kvk' }], warnings: [], oks: [] }),
  companyRequirementsForInvoice: () => missing,
});

const r = app.invoiceSendChecks({ customer: { email: 'klant@example.test' } });
assert.deepEqual(r.errors.map(e => e.companyField), ['kvk', 'iban'], 'Missing company fields are listed once each');

const noEmail = app.invoiceSendChecks({ customer: {} });
assert.ok(noEmail.errors.some(e => e.label === 'Klant-e-mail'), 'Missing recipient e-mail is reported');

console.log('invoice send checks: ok');
