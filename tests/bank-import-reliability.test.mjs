import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadApp, appSource } from './production-code.mjs';

// Bank import must never silently drop, merge, flip or reshape a transaction. All fixtures are synthetic.
let seq = 0;
const app = loadApp(['toCents', 'fromCents', 'roundMoney', 'normalizeBankText', 'fnv1a', 'bankFingerprint', 'parseCsvRow',
  'parseBankAmountCents', 'parseBankAmount', 'normalizeBankDate', 'bankDirectionSign', 'applyBankDirection',
  'detectCsvDelimiter', 'parseCsvRecords', 'bankHeaderLayout', 'bankHeaderlessLayout', 'bankCsvLayout',
  'bankCellText', 'decodeBankFileBytes', 'parseBankStatement', 'assignBankImportFingerprints', 'bankRemovedFingerprints', 'bankImportPlan',
  'normalizedMatchText', 'matchTextHas', 'invoiceSign', 'invoicePayments', 'invoicePaidAmount', 'invoiceCreditOffset', 'invoiceOutstanding',
  'invoiceGross', 'invoiceNet', 'invoiceVat', 'lineNetAmount', 'lineVatAmount', 'invoiceDiscountBase', 'invoiceDiscountAmount',
  'invoiceDiscountFactor', 'discountedLineNet', 'discountedLineVat', 'invoiceTaxTreatment', 'isZeroOutputVatTreatment',
  'expenseTaxTreatment', 'expenseVat', 'expenseGross', 'txInvoiceEvidence', 'txExpenseEvidence', 'bankMatchDecision'],
  { uid: p => p + (++seq), TextDecoder, getContact: id => app.state.contacts.find(c => c.id === id) || {} });
app.state.contacts = [];

const fixture = name => fs.readFileSync(new URL('./fixtures/bank/' + name, import.meta.url));
function load(name, existing = []) {
  const dec = app.decodeBankFileBytes(fixture(name));
  assert.ok(!dec.error, name + ' decodes');
  const parsed = app.parseBankStatement(dec.text);
  assert.ok(parsed.ok, name + ' parses: ' + parsed.code);
  return { parsed, plan: app.bankImportPlan(parsed, existing) };
}
const plain = x => JSON.parse(JSON.stringify(x));
const rows = plan => plain(plan.ready.map(r => [r.tx.date, r.tx.amount]));

// ING: YYYYMMDD, Af/Bij column, thousands separator, two identical coffees stay two transactions.
{
  const { plan } = load('ing-semicolon.csv');
  assert.deepEqual(rows(plan), [['2026-10-01', -3.5], ['2026-10-01', -3.5], ['2026-10-02', 1210]]);
  assert.notEqual(plan.ready[0].tx.fingerprint, plan.ready[1].tx.fingerprint, 'identical rows are both kept');
  assert.match(plan.ready[2].tx.description, /Voorbeeld Klant BV · Factuur F2026-014/, 'name and Mededelingen are combined');
  assert.equal(plan.ready[2].tx.counterpartyIban, 'NL91ABNA0417164300');
  assert.equal(plan.incoming, 1210); assert.equal(plan.outgoing, 7);
}
// Rabobank: comma CSV, explicit + sign, Omschrijving-1 used, "Oorspr bedrag" is not the amount.
{
  const { plan } = load('rabobank-comma.csv');
  assert.deepEqual(rows(plan), [['2026-10-03', -12.5], ['2026-10-04', 605]]);
  assert.match(plan.ready[1].tx.description, /Betaling factuur F2026-015/);
  assert.equal(plan.ready[1].tx.counterpartyIban, 'NL91ABNA0417164300', 'counterparty IBAN, not own account');
}
// Knab: D/C direction column, quoted description with semicolon.
assert.deepEqual(rows(load('knab-debit-credit.csv').plan), [['2026-10-05', -19.99], ['2026-10-06', 50]]);
// Separate Af and Bij columns: signs follow the column, a row with both filled needs review.
{
  const { plan } = load('split-af-bij.csv');
  assert.deepEqual(rows(plan), [['2026-10-07', -45], ['2026-10-08', 121]]);
  assert.equal(plan.problems.length, 1); assert.match(plan.problems[0].problem, /Zowel Af als Bij/);
}
// Headerless exports: de Volksbank (ASN/SNS/RegioBank), Triodos, ABN AMRO .TAB.
assert.deepEqual(rows(load('volksbank-headerless.csv').plan), [['2026-10-07', 121], ['2026-10-08', -45]]);
assert.equal(load('volksbank-headerless.csv').plan.ready[0].tx.description, 'Voorbeeld Klant BV · Factuur F2026-017');
assert.deepEqual(rows(load('triodos-headerless.csv').plan), [['2026-10-07', 1210], ['2026-10-08', -9.95]]);
assert.deepEqual(rows(load('abn-amro.tab').plan), [['2026-10-07', -25], ['2026-10-08', 121]]);
// Encodings: UTF-8 with BOM (comma CSV, decimal point) and Windows-1252.
{
  const { plan } = load('utf8-bom.csv');
  assert.deepEqual(rows(plan), [['2026-10-07', -4.2], ['2026-10-08', 100]]);
  assert.equal(plan.ready[0].tx.description, 'Café Voorbeeld'); assert.equal(plan.ready[1].tx.description, 'Klant, BV');
  assert.equal(app.decodeBankFileBytes(fixture('windows-1252.csv')).encoding, 'windows-1252');
  assert.equal(load('windows-1252.csv').plan.ready[0].tx.description, 'Café Crème');
}
// Partly invalid file: preamble, multi-line quoted text, odd rows. Every data row is either ready or a visible problem.
{
  const { plan } = load('messy-partly-invalid.csv');
  assert.deepEqual(rows(plan), [['2026-10-01', -1234.56], ['2026-10-01', 12.5], ['2026-10-04', -7], ['2026-10-05', -8]]);
  assert.match(plan.ready[0].tx.description, /"aanhalingstekens"; puntkomma en regeleinde/);
  assert.deepEqual(plain(plan.problems.map(p => p.problem)), ['Datum "31-02-2026" is niet herkend.', 'Bedrag "1.250" is niet eenduidig.', 'Bedrag ontbreekt.', 'Deze regel heeft te weinig kolommen.']);
  assert.equal(plan.found, plan.ready.length + plan.problems.length + plan.duplicates.length, 'nothing disappears');
}
// Unknown columns ask for a mapping; the mapped layout then reads the file.
{
  const text = app.decodeBankFileBytes(fixture('unknown-columns.csv')).text, res = app.parseBankStatement(text);
  assert.equal(res.ok, false); assert.equal(res.code, 'columns');
  const mapped = app.parseBankStatement(text, { delimiter: ';', headerless: false, di: 0, ai: 2, adi: -1, aci: -1, dci: -1, oi: 1, descs: [1], idi: -1, eti: -1, ri: -1, ibi: -1, ci: -1 });
  assert.deepEqual(rows(app.bankImportPlan(mapped, [])), [['2026-10-07', -45]]);
  const swallow = app.parseBankStatement('07-10-2026;Shell;-45,00', { delimiter: ';', headerless: false, di: 0, ai: 2, adi: -1, aci: -1, dci: -1, oi: 1, descs: [1], idi: -1, eti: -1, ri: -1, ibi: -1, ci: -1 });
  assert.equal(swallow.rows.length, 1, '"first row has names" never swallows a real transaction');
}
// Unsupported files get a clear reason instead of a column error.
assert.equal(app.parseBankStatement('<?xml version="1.0"?><Document><BkToCstmrStmt/></Document>').code, 'camt');
assert.equal(app.parseBankStatement(':20:X\n:25:NL00\n:61:2610071007C10,00NTRF//X\n').code, 'mt940');
assert.equal(app.decodeBankFileBytes(new TextEncoder().encode('%PDF-1.7')).error, 'pdf');
assert.equal(app.decodeBankFileBytes(new Uint8Array([0x50, 0x4b, 3, 4, 0])).error, 'spreadsheet');
assert.equal(app.parseBankStatement('').code, 'empty');
// Foreign currency rows are not booked as euro.
assert.match(app.bankImportPlan(app.parseBankStatement('Datum;Munt;Omschrijving;Bedrag\n07-10-2026;USD;AWS;-10,00'), []).problems[0].problem, /USD/);

// Amounts: exact cents, signs never flipped, ambiguous values refused.
for (const [raw, cents] of [['12,50', 1250], ['-12,50', -1250], ['12.50', 1250], ['1.234,56', 123456], ['1,234.56', 123456],
  ['12,50-', -1250], ['(12,50)', -1250], ['−12,50', -1250], ['€ -0,01', -1], ['+605,00', 60500], ['1.234.567', 123456700], ['0,1', 10], ['EUR 7', 700]])
  assert.equal(app.parseBankAmountCents(raw).cents, cents, raw);
for (const raw of ['1.250', '1,250']) assert.equal(app.parseBankAmountCents(raw).error, 'ambiguous', raw);
for (const raw of ['abc', '1,2,3', '12,345,67', '1.234,567', '--5', '']) assert.ok(app.parseBankAmountCents(raw).error, raw);
// Dates: ISO, compact, Dutch, two-digit year, with time; impossible dates refused.
for (const [raw, iso] of [['2026-10-07', '2026-10-07'], ['20261007', '2026-10-07'], ['7-10-2026', '2026-10-07'], ['07/10/2026', '2026-10-07'],
  ['07.10.26', '2026-10-07'], ['2026-10-07 14:22:01', '2026-10-07'], ['2026-10-07T10:00:00Z', '2026-10-07'], ['29-02-2028', '2028-02-29']])
  assert.equal(app.normalizeBankDate(raw), iso, raw);
for (const raw of ['31-02-2026', '2026-13-01', '00-01-2026', 'gisteren', '']) assert.equal(app.normalizeBankDate(raw), '', raw);

// Duplicate upload: the same file a second time adds nothing; an overlapping file adds only the new rows.
{
  const first = load('ing-semicolon.csv').plan.ready.map(r => r.tx);
  const again = load('ing-semicolon.csv', first).plan;
  assert.equal(again.ready.length, 0); assert.equal(again.duplicates.length, 3);
}
// Transactions imported with the old importer (description = first name column only) are still recognised.
{
  const legacy = { date: '2026-10-02', amount: 1210, description: 'Voorbeeld Klant BV', sourceId: '', endToEndId: '', reference: '', counterpartyIban: 'NL91ABNA0417164300' };
  legacy.fingerprint = app.bankFingerprint(legacy);
  const plan = load('ing-semicolon.csv', [legacy]).plan;
  assert.equal(plan.duplicates.length, 1); assert.equal(plan.ready.length, 2);
}
// Large file: 10.000 rows are read completely and fast.
{
  const lines = ['Datum;Omschrijving;Bedrag'];
  for (let i = 0; i < 10000; i++) lines.push(`2026-10-${String(1 + i % 28).padStart(2, '0')};Regel ${i};-${(i % 500) + 1},${String(i % 100).padStart(2, '0')}`);
  const t0 = Date.now(), plan = app.bankImportPlan(app.parseBankStatement(lines.join('\n')), []);
  assert.equal(plan.ready.length, 10000); assert.ok(Date.now() - t0 < 3000, 'large file within 3s');
  assert.equal(app.parseBankStatement(['Datum;Omschrijving;Bedrag', ...Array(20001).fill('2026-10-01;x;-1,00')].join('\n')).code, 'too_large');
}

// Matching: conservative. Amount alone is a suggestion; an identifier links; ties are never auto-linked.
{
  const s = app.state;
  s.contacts = [{ id: 'c1', name: 'Voorbeeld Klant BV', iban: 'NL91ABNA0417164300' }];
  const inv = (id, number, total, issueDate = '2026-10-01') => ({ id, number, customerId: 'c1', status: 'sent', issueDate, lines: [{ qty: 1, unit: total, vat: 0 }], payments: [] });
  s.invoices = [inv('i1', 'F2026-1', 121), inv('i12', 'F2026-12', 121), inv('i2', 'F2026-020', 500)];
  s.expenses = [{ id: 'e1', vendor: 'Tankstation Voorbeeld', date: '2026-10-07', gross: 45 }, { id: 'e2', vendor: 'Ander Bedrijf', date: '2026-09-01', gross: 45 }];
  s.transactions = [];
  assert.equal(app.invoiceOutstanding(s.invoices[0]), 121, 'fixture invoice total');
  const tx = (amount, description, extra = {}) => ({ id: 't', date: '2026-10-08', amount, description, status: 'unmatched', ...extra });
  // "F2026-12" in the text must not count as invoice "F2026-1".
  const d12 = app.bankMatchDecision(tx(121, 'Betaling F2026-12'));
  assert.equal(d12.auto?.id, 'i12');
  assert.ok(!app.txInvoiceEvidence(tx(121, 'Betaling F2026-12'), s.invoices[0]).reasons.includes('factuurnummer'));
  // Same amount, same customer, no number: two candidates, user chooses.
  const tie = app.bankMatchDecision(tx(121, 'Voorbeeld Klant BV', { counterpartyIban: 'NL91ABNA0417164300' }));
  assert.equal(tie.auto, undefined); assert.equal(tie.suggestion.candidates.length, 2);
  // Name + IBAN + amount but no identifier: suggestion only, even with one candidate.
  const nameOnly = app.bankMatchDecision(tx(500, 'Voorbeeld Klant BV', { counterpartyIban: 'NL91ABNA0417164300' }));
  assert.equal(nameOnly.auto, undefined); assert.equal(nameOnly.suggestion.id, 'i2');
  // Payment dated before the invoice: never automatic.
  const early = app.bankMatchDecision(tx(500, 'F2026-020', { date: '2026-09-15' }));
  assert.equal(early.auto, undefined); assert.ok(early.suggestion);
  // Amount mismatch: nothing.
  assert.deepEqual(plain(app.bankMatchDecision(tx(499, 'F2026-020'))), {});
  // Costs: supplier + date near the receipt links; amount only stays a suggestion with both candidates.
  assert.equal(app.bankMatchDecision(tx(-45, 'Tankstation Voorbeeld')).auto?.id, 'e1');
  const costTie = app.bankMatchDecision(tx(-45, 'Pinbetaling'));
  assert.equal(costTie.auto, undefined); assert.equal(costTie.suggestion.candidates.length, 2);
}

// A transaction the user deleted stays out on the next import of the same file; the rest is unaffected.
{
  const { parsed, plan } = load('ing-semicolon.csv');
  const deleted = plan.ready[2].tx;
  app.state.bankRemoved = [{ fingerprint: deleted.fingerprint, date: deleted.date, amount: deleted.amount }];
  const again = app.bankImportPlan(parsed, [plan.ready[0].tx]);
  assert.equal(again.removed.length, 1, 'deleted row is skipped');
  assert.equal(again.duplicates.length, 1);
  assert.deepEqual(rows(again), [['2026-10-01', -3.5]], 'the second identical coffee still imports');
  app.state.bankRemoved = [];
}

// The import flow shows a preview first and only books on confirm.
assert.match(appSource, /function handleCSV\(e\)\{[\s\S]*?startBankImport\(/);
assert.doesNotMatch(appSource.slice(appSource.indexOf('function startBankImport('), appSource.indexOf('function showBankImportError(')), /state\.transactions\.push/);
assert.match(appSource, /function confirmBankImport\(\)\{[\s\S]*?bankImportPlan\(p\.parsed,state\.transactions\)/);

console.log('bank import reliability: ok');
