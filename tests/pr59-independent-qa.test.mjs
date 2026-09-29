import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {attachTransactionFingerprints,parseMt940} from '../supabase/functions/financial-automation/lib/bank-import.mjs';
import {invoiceOutstandingCents,matchTransactionAgainstLedger} from '../supabase/functions/financial-automation/lib/matching.mjs';
import {validateUblSemantics} from '../supabase/functions/financial-automation/lib/ubl.mjs';

const fpBase={
  transaction_id:'QA-TX',
  account_iban:'NL91ABNA0417164300',
  counterparty_name:'Alpha Services BV',
  counterparty_iban:'',
  booking_date:'2026-09-29',
  value_date:'2026-09-29',
  amount_cents:12100,
  currency:'EUR',
  description:'Invoice QA-001',
  end_to_end_id:'E2E-QA-001',
  bank_reference:'REF-QA-001',
  credit_debit:'credit',
  source_format:'camt053'
};
const fingerprint=async(v,hash='a'.repeat(64))=>(await attachTransactionFingerprints([v],hash))[0].transaction_fingerprint;

// #65 — independent identity matrix.
assert.equal(await fingerprint(fpBase),await fingerprint({...fpBase}),'#65 same transaction remains stable');
assert.equal(await fingerprint(fpBase,'a'.repeat(64)),await fingerprint(fpBase,'b'.repeat(64)),'#65 source-file hash is not transaction identity');
assert.notEqual(await fingerprint(fpBase),await fingerprint({...fpBase,counterparty_name:'Beta Services BV'}),'#65 different counterparty names without IBAN remain distinct');
const withIban={...fpBase,counterparty_iban:'NL69INGB0123456789'};
assert.equal(await fingerprint(withIban),await fingerprint({...withIban,counterparty_name:'ALPHA SERVICES B.V.'}),'#65 IBAN dominates display-name differences');
assert.notEqual(await fingerprint(withIban),await fingerprint({...withIban,counterparty_iban:'NL20INGB0001234567'}),'#65 different IBANs remain distinct');
for(const [label,patch] of [
  ['booking date',{booking_date:'2026-09-30'}],
  ['value date',{value_date:'2026-09-30'}],
  ['amount',{amount_cents:12101}],
  ['bank reference',{bank_reference:'REF-QA-002'}],
  ['E2E',{end_to_end_id:'E2E-QA-002'}],
  ['direction',{credit_debit:'debit'}]
]){
  assert.notEqual(await fingerprint(fpBase),await fingerprint({...fpBase,...patch}),`#65 changed ${label} remains distinct`);
}

// #66 — full economic-payment identity matrix.
const invoice121={id:'qa-invoice',kind:'invoice',status:'sent',lines:[{qty:1,unit:100,vat:21}],payments:[]};
const bank=(id,amount=5000,fp='',extra={})=>({serverTransactionId:id,sourceFingerprint:fp||undefined,status:'matched',matchType:'invoice',matchId:'qa-invoice',amount_cents:amount,...extra});
assert.equal(invoiceOutstandingCents({...invoice121,payments:[{id:'m1',amount:50}]},[]),7100,'#66.1 manual-only');
assert.equal(invoiceOutstandingCents(invoice121,[bank('b-only')]),7100,'#66.2 bank-only');
assert.equal(invoiceOutstandingCents({...invoice121,payments:[{id:'m1',amount:50,bankTransactionId:'b-1'}]},[bank('b-1')]),7100,'#66.3 shared bank id');
assert.equal(invoiceOutstandingCents({...invoice121,payments:[{id:'m1',amount:50,bankTransactionFingerprint:'fp-economic'}]},[bank('b-2',5000,'fp-economic')]),7100,'#66.4 shared fingerprint with bank id present');
assert.equal(invoiceOutstandingCents({...invoice121,payments:[{id:'m1',amount:50,date:'2026-09-29',description:'same'}]},[bank('b-separate',5000,'',{booking_date:'2026-09-29',description:'same'})]),2100,'#66.5 no heuristic amount/date/description dedupe');
assert.equal(invoiceOutstandingCents(invoice121,[bank('b-a',5000,'fp-a'),bank('b-b',5000,'fp-b')]),2100,'#66.6 distinct bank payments both count');
assert.equal(invoiceOutstandingCents(invoice121,[bank('mirror-a',5000,'fp-mirror'),bank('mirror-b',5000,'fp-mirror')]),7100,'#66.7 fingerprint mirrors collapse');
assert.equal(invoiceOutstandingCents(invoice121,[bank('same-id'),bank('same-id')]),7100,'#66.8 server id mirrors collapse');
assert.equal(invoiceOutstandingCents({...invoice121,payments:[{id:'m1',amount:50,bankTransactionFingerprint:'fp-linked'}]},[bank('linked-id',5000,'fp-linked'),bank('extra-id',2000,'fp-extra')]),5100,'#66.9 linked 50 + separate 20');
assert.equal(invoiceOutstandingCents({...invoice121,payments:[{id:'m1',amount:20},{id:'m2',amount:15},{id:'m3',amount:15}]},[]),7100,'#66.10 multiple manual partials');
assert.equal(invoiceOutstandingCents({...invoice121,payments:[{id:'m1',amount:121}]},[]),0,'#66.11 full payment');
assert.equal(invoiceOutstandingCents({...invoice121,payments:[{id:'m1',amount:120.99}]},[]),1,'#66.12 exact cent remainder');
assert.equal(invoiceOutstandingCents({...invoice121,payments:[{id:'m1',amount:121.01}]},[]),0,'#66.13 overpayment never negative');
const credit121={id:'qa-credit',kind:'credit',status:'sent',lines:[{qty:1,unit:100,vat:21}],payments:[{id:'r1',amount:-50,bankTransactionFingerprint:'refund-fp'}]};
assert.equal(invoiceOutstandingCents(credit121,[{serverTransactionId:'refund-bank',sourceFingerprint:'refund-fp',status:'matched',matchType:'invoice',matchId:'qa-credit',amount_cents:-5000}]),7100,'#66.14 credit/refund uses same identity rules');
const reopenedPayments=JSON.parse(JSON.stringify([{id:'m1',amount:50,bankTransactionId:'persist-id',bankTransactionFingerprint:'persist-fp'}]));
const reopenedBank=JSON.parse(JSON.stringify([bank('persist-id',5000,'persist-fp')]));
assert.equal(invoiceOutstandingCents({...invoice121,payments:reopenedPayments},reopenedBank),7100,'#66.15 save/reopen preserves identities');
const index=fs.readFileSync(new URL('../supabase/functions/financial-automation/index.ts',import.meta.url),'utf8');
assert.match(index,/payment\.bankTransactionId=tx\.id;payment\.bankTransactionFingerprint=tx\.transaction_fingerprint/,'#66 manual_payment_id stores both bank identities');
assert.match(index,/if\(tx\.status==="matched"\)throw new Error\("MATCH_ALREADY_CONFIRMED"\)/,'#66.16 repeated confirmation is rejected');
assert.match(index,/p_expected_version:l\.version/,'#66.17 expected ledger version is supplied');
assert.match(index,/if\(newVersion==null\)throw new Error\("LEDGER_VERSION_CONFLICT"\)/,'#66.17 stale ledger version is rejected');

const migrationDir=new URL('../supabase/migrations/',import.meta.url);
const migrations=fs.readdirSync(migrationDir).map(name=>({name,body:fs.readFileSync(new URL(name,migrationDir),'utf8')}));
const matchMigration=migrations.find(x=>x.body.includes('commit_financial_bank_match'));
assert.ok(matchMigration,'atomic match migration exists');
assert.match(matchMigration.body,/where user_id=p_user_id and version=p_expected_version for update/,'stale version is checked under row lock');
assert.match(matchMigration.body,/update public\.bank_transactions set status='matched' where id=p_bank_transaction_id and user_id=p_user_id/,'bank status mutation stays user-scoped');
assert.match(matchMigration.body,/revoke all on function public\.commit_financial_bank_match[\s\S]*from public,anon,authenticated/,'match RPC is not client-callable');
assert.match(matchMigration.body,/grant execute on function public\.commit_financial_bank_match[\s\S]*to service_role/,'match RPC is service-role only');

const importMigration=migrations.find(x=>x.body.includes('commit_financial_bank_import'));
assert.ok(importMigration,'atomic bank import migration exists');
assert.match(importMigration.body,/insert into public\.bank_imports[\s\S]*insert into public\.bank_transactions/,'bank import and transaction inserts are in one RPC body');
assert.match(importMigration.body,/revoke all on function public\.commit_financial_bank_import[\s\S]*from public,anon,authenticated/,'bank import RPC is not client-callable');
assert.match(importMigration.body,/grant execute on function public\.commit_financial_bank_import[\s\S]*to service_role/,'bank import RPC is service-role only');

const suiteMigration=migrations.find(x=>x.body.includes('create table if not exists public.bank_transactions'));
assert.ok(suiteMigration,'financial automation schema migration exists');
for(const table of ['bank_imports','bank_transactions','transaction_matches','document_duplicate_fingerprints','document_validation_results']){
  assert.ok(suiteMigration.body.includes(`alter table public.${table} enable row level security`),`RLS enabled for ${table}`);
}
assert.match(suiteMigration.body,/revoke insert,update,delete on public\.bank_imports,public\.bank_transactions,public\.transaction_matches,public\.document_duplicate_fingerprints,public\.document_validation_results from anon,authenticated/,'client roles cannot mutate financial tables directly');
assert.match(index,/const mutations=new Set\(\["bank_commit","match_suggest","match_confirm","duplicate_register","ubl_validate_store"\]\)/,'all state-changing financial actions are entitlement-gated');
assert.match(index,/const persisted=m\.state==="exact\/high-confidence"\?"suggested":m\.state/,'high-confidence suggestions never auto-book');
assert.match(index,/console\.info\("financial_automation",\{action,\.\.\.fields\}\)/,'logging stays metadata-only');

// #67 — exact UBL subtotal/header reconciliation.
const supplier={Party:{EndpointID:{'#text':'SUP-1','@_schemeID':'0106'},PartyName:{Name:'Supplier BV'}}};
const customer={Party:{EndpointID:{'#text':'CUS-1','@_schemeID':'0106'},PartyName:{Name:'Customer BV'}}};
const money=v=>({'#text':Number(v).toFixed(2),'@_currencyID':'EUR'});
function makeInvoice({net=200,vat=30,gross=230,subs=[{taxable:100,tax:9,rate:9},{taxable:100,tax:21,rate:21}],allowance=null,line=200}={}){
  const d={
    UBLVersionID:'2.1',
    CustomizationID:'urn:cen.eu:en16931:2017#peppol',
    ProfileID:'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
    ID:'QA-UBL-1',
    IssueDate:'2026-09-29',
    DocumentCurrencyCode:'EUR',
    AccountingSupplierParty:supplier,
    AccountingCustomerParty:customer,
    InvoiceLine:[{ID:'1',InvoicedQuantity:'1',LineExtensionAmount:money(line),Item:{Name:'Service'}}],
    TaxTotal:{TaxAmount:money(vat),TaxSubtotal:subs.map(s=>({TaxableAmount:money(s.taxable),TaxAmount:money(s.tax),TaxCategory:{ID:'S',Percent:String(s.rate)}}))},
    LegalMonetaryTotal:{TaxExclusiveAmount:money(net),TaxInclusiveAmount:money(gross),PayableAmount:money(gross)}
  };
  if(allowance!=null)d.AllowanceCharge=[{ChargeIndicator:'false',Amount:money(allowance)}];
  return {Invoice:d};
}
const invoiceNs='<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"></Invoice>';
assert.equal(validateUblSemantics(makeInvoice(),invoiceNs).errors.length,0,'#67 mixed 9%+21% reconciles');
const originalMismatch=validateUblSemantics(makeInvoice({subs:[{taxable:100,tax:9,rate:9},{taxable:95.24,tax:20,rate:21}]}),invoiceNs);
assert.ok(originalMismatch.errors.some(e=>e.code==='UBL_VAT_TOTAL_MISMATCH'),'#67 original VAT subtotal mismatch rejected');
assert.ok(originalMismatch.errors.some(e=>e.code==='UBL_VAT_TAXABLE_SUM_MISMATCH'),'#67 original taxable subtotal mismatch rejected');
const vatCent=validateUblSemantics(makeInvoice({subs:[{taxable:100,tax:9,rate:9},{taxable:100,tax:20.99,rate:21}]}),invoiceNs);
assert.ok(vatCent.errors.some(e=>e.code==='UBL_VAT_TOTAL_MISMATCH'),'#67 one-cent VAT mismatch is rejected exactly');
const taxableCent=validateUblSemantics(makeInvoice({subs:[{taxable:100,tax:9,rate:9},{taxable:99.99,tax:21,rate:21}]}),invoiceNs);
assert.ok(taxableCent.errors.some(e=>e.code==='UBL_VAT_TAXABLE_SUM_MISMATCH'),'#67 one-cent taxable mismatch is rejected exactly');
assert.equal(validateUblSemantics(makeInvoice({net:100,vat:0,gross:100,line:100,subs:[{taxable:100,tax:0,rate:0}]}),invoiceNs).errors.length,0,'#67 0% VAT reconciles');
const credit={CreditNote:{
  UBLVersionID:'2.1',CustomizationID:'urn:cen.eu:en16931:2017#peppol',ProfileID:'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
  ID:'QA-CR-1',IssueDate:'2026-09-29',DocumentCurrencyCode:'EUR',AccountingSupplierParty:supplier,AccountingCustomerParty:customer,
  CreditNoteLine:[{ID:'1',CreditedQuantity:'1',LineExtensionAmount:money(100),Item:{Name:'Credit'}}],
  TaxTotal:{TaxAmount:money(21),TaxSubtotal:[{TaxableAmount:money(100),TaxAmount:money(21),TaxCategory:{ID:'S',Percent:'21'}}]},
  LegalMonetaryTotal:{TaxExclusiveAmount:money(100),TaxInclusiveAmount:money(121),PayableAmount:money(121)}
}};
const creditNs='<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"></CreditNote>';
assert.equal(validateUblSemantics(credit,creditNs).errors.length,0,'#67 CreditNote reconciliation passes');
const allowanceOk=makeInvoice({net:190,vat:27.9,gross:217.9,line:200,allowance:10,subs:[{taxable:90,tax:18.9,rate:21},{taxable:100,tax:9,rate:9}]});
assert.equal(validateUblSemantics(allowanceOk,invoiceNs).errors.length,0,'#67 allowance uses post-allowance taxable basis');
const allowanceBad=makeInvoice({net:190,vat:30,gross:220,line:200,allowance:10,subs:[{taxable:100,tax:21,rate:21},{taxable:100,tax:9,rate:9}]});
assert.ok(validateUblSemantics(allowanceBad,invoiceNs).errors.some(e=>e.code==='UBL_VAT_TAXABLE_SUM_MISMATCH'),'#67 pre-allowance taxable subtotal is rejected');

// #68 — MT940 optional entry-date and reversal semantics.
const mt=(value,entry='',marker='C',date='260929')=>`:20:QA\n:25:NL91ABNA0417164300\n:60F:C${date}EUR0,00\n:61:${value}${entry}${marker}1,00NTRFNONREF//QA1\n:86:QA\n:62F:C${date}EUR1,00`;
let p=parseMt940(mt('260929','0930'));
assert.equal(p.transactions[0].value_date,'2026-09-29','#68 normal value date');
assert.equal(p.transactions[0].booking_date,'2026-09-30','#68 normal entry date');
p=parseMt940(mt('261231','0101','C','261231'));assert.equal(p.transactions[0].booking_date,'2027-01-01','#68 Dec→Jan');
p=parseMt940(mt('260101','1231','C','260101'));assert.equal(p.transactions[0].booking_date,'2025-12-31','#68 Jan→Dec');
p=parseMt940(mt('260929',''));assert.equal(p.transactions[0].booking_date,'2026-09-29','#68 missing entry falls back to value date');
p=parseMt940(mt('260228','0230','C','260228'));assert.equal(p.transactions[0].booking_date,'2026-02-28','#68 invalid entry falls back safely');assert.ok(p.warnings.some(w=>w.includes('invalid_entry_date')),'#68 invalid entry emits warning');
p=parseMt940(mt('240228','0229','C','240228'));assert.equal(p.transactions[0].booking_date,'2024-02-29','#68 leap-day entry accepted');
p=parseMt940(mt('260929','0930','RC'));assert.equal(p.transactions[0].amount_cents,-100,'#68 reversal credit becomes debit without breaking entry-date handling');

// Matching suggestions remain suggestions only; no automatic state mutation in pure matcher.
const ledger={contacts:[{id:'c1',name:'Customer BV',iban:'NL69INGB0123456789'}],invoices:[{id:'qa-match',number:'QA-001',paymentReference:'QA-001',customerId:'c1',status:'sent',issueDate:'2026-09-20',dueDate:'2026-10-04',lines:[{qty:1,unit:100,vat:21}],payments:[]}],expenses:[],transactions:[]};
const suggested=matchTransactionAgainstLedger({amount_cents:12100,booking_date:'2026-09-29',description:'QA-001',counterparty_name:'Customer BV',counterparty_iban:'NL69INGB0123456789'},ledger);
assert.equal(suggested.state,'exact/high-confidence','matcher can identify high confidence without booking it');

const t0=performance.now();
await attachTransactionFingerprints(Array.from({length:1000},(_,i)=>({...fpBase,transaction_id:'perf-'+i,amount_cents:10000+i})),'f'.repeat(64));
const fingerprintMs=performance.now()-t0;
const t1=performance.now();
for(let i=0;i<100;i++)matchTransactionAgainstLedger({amount_cents:12100,booking_date:'2026-09-29',description:i?'other':'QA-001',counterparty_name:'Customer BV'},ledger);
const matchMs=performance.now()-t1;
const t2=performance.now();validateUblSemantics(makeInvoice(),invoiceNs);const ublMs=performance.now()-t2;
console.log('PR59 independent QA: PASS',JSON.stringify({fingerprint1000_ms:Number(fingerprintMs.toFixed(2)),match100_ms:Number(matchMs.toFixed(2)),ubl_ms:Number(ublMs.toFixed(2))}));
