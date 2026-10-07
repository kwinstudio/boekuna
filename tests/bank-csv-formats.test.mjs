import assert from 'node:assert/strict';
import { loadApp } from './production-code.mjs';

// Real export layouts of Dutch banks: dates, separators and Af/Bij direction columns.
const app = loadApp(['toCents', 'fromCents', 'roundMoney', 'normalizeBankText', 'parseCsvRow',
  'parseBankAmount', 'normalizeBankDate', 'applyBankDirection', 'bankCsvLayout']);

function read(text) {
  const lines = text.split('\n').filter(Boolean), layout = app.bankCsvLayout(lines[0]);
  assert.ok(layout, 'layout herkend: ' + lines[0]);
  return lines.slice(layout.headerless ? 0 : 1).map(line => {
    const c = app.parseCsvRow(line, layout.delimiter);
    return { date: app.normalizeBankDate(c[layout.di]), amount: app.applyBankDirection(app.parseBankAmount(c[layout.ai]), layout.dci >= 0 ? c[layout.dci] : ''), desc: c[layout.oi], iban: layout.ibi >= 0 ? c[layout.ibi] : '' };
  });
}

// ING: YYYYMMDD and positive amounts with an Af/Bij column.
assert.deepEqual(read('"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)";"Mutatiesoort";"Mededelingen"\n"20261007";"Shell";"NL20INGB0001234567";"";"BA";"Af";"45,00";"Betaalautomaat";""\n"20261007";"Klant BV";"NL20INGB0001234567";"NL91ABNA0417164300";"GT";"Bij";"1.300,00";"Online";""')
  .map(r => [r.date, r.amount, r.iban]), [['2026-10-07', -45, ''], ['2026-10-07', 1300, 'NL91ABNA0417164300']]);

// Knab: CreditDebet column with D/C.
assert.deepEqual(read('Rekeningnummer;Transactiedatum;Valutacode;CreditDebet;Bedrag;Tegenrekeningnummer;Tegenrekeninghouder;Valutadatum;Betaalwijze;Omschrijving\nNL01KNAB0123456789;07-10-2026;EUR;D;19,99;NL02;Provider;07-10-2026;Incasso;Abonnement\nNL01KNAB0123456789;07-10-2026;EUR;C;50,00;NL03;Klant;07-10-2026;Overboeking;Factuur')
  .map(r => [r.date, r.amount]), [['2026-10-07', -19.99], ['2026-10-07', 50]]);

// Rabobank: signed amounts; counterparty IBAN, not the own account.
assert.deepEqual(read('"IBAN/BBAN","Munt","BIC","Volgnr","Datum","Rentedatum","Bedrag","Saldo na trn","Tegenrekening IBAN/BBAN","Naam tegenpartij"\n"NL11RABO0123456789","EUR","RABONL2U","1","2026-10-07","2026-10-07","-12,50","100,00","NL22INGB0001111111","Albert Heijn"')
  .map(r => [r.date, r.amount, r.iban]), [['2026-10-07', -12.5, 'NL22INGB0001111111']]);

// ABN AMRO .TAB: tab separated, no header row.
assert.deepEqual(read('123456789\tEUR\t20261007\t1000,00\t975,00\t20261007\t-25,00\tBEA Koffiebar')
  .map(r => [r.date, r.amount, r.desc]), [['2026-10-07', -25, 'BEA Koffiebar']]);

// Generic file without direction column keeps signs; single-digit day/month dates work.
assert.deepEqual(read('Datum;Omschrijving;Bedrag\n7-10-2026;Bol.com;-121,00').map(r => [r.date, r.amount]), [['2026-10-07', -121]]);
assert.equal(app.bankCsvLayout('Foo;Bar'), null, 'Missing columns are rejected');

console.log('bank csv formats: ok');
