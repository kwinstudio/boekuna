import assert from 'node:assert/strict';
import fs from 'node:fs';
import { attachTransactionFingerprints, parseMt940 } from '../supabase/functions/financial-automation/lib/bank-import.mjs';
import { invoiceOutstandingCents } from '../supabase/functions/financial-automation/lib/matching.mjs';
import { validateUblSemantics } from '../supabase/functions/financial-automation/lib/ubl.mjs';

const pass=[];
const fail=[];
function run(name,fn){
  try{fn();pass.push(name)}
  catch(e){fail.push({name,error:String(e?.stack||e)})}
}
async function runAsync(name,fn){
  try{await fn();pass.push(name)}
  catch(e){fail.push({name,error:String(e?.stack||e)})}
}
const cents=v=>Math.round(Number(v)*100);

//
// #65 — transaction fingerprint / counterparty identity
//
const txBase={
  transaction_id:'QA-TX-1',
  account_iban:'NL91ABNA0417164300',
  counterparty_name:'Acme BV',
  counterparty_iban:'',
  booking_date:'2026-09-29',
  value_date:'2026-09-29',
  amount_cents:12100,
  currency:'EUR',
  end_to_end_id:'E2E-QA',
  bank_reference:'BANK-QA',
  description:'Factuur 2026-001',
  credit_debit:'credit',
  source_format:'camt053'
};
const fingerprint=async(obj,hash='a'.repeat(64))=>(await attachTransactionFingerprints([obj],hash))[0].transaction_fingerprint;
await runAsync('#65 original: different counterparty name, no IBAN => different fingerprint',async()=>{
  assert.notEqual(await fingerprint(txBase),await fingerprint({...txBase,counterparty_name:'Other BV'}));
});
await runAsync('#65 same economic tx => same fingerprint',async()=>{
  assert.equal(await fingerprint(txBase),await fingerprint({...txBase}));
});
await runAsync('#65 source file hash excluded from transaction identity',async()=>{
  assert.equal(await fingerprint(txBase,'1'.repeat(64)),await fingerprint(txBase,'2'.repeat(64)));
});
await runAsync('#65 cosmetic case/whitespace normalizes name',async()=>{
  assert.equal(await fingerprint(txBase),await fingerprint({...txBase,counterparty_name:'  ACME   BV  '}));
});
await runAsync('#65 same IBAN dominates name variation',async()=>{
  const a={...txBase,counterparty_iban:'NL69INGB0123456789',counterparty_name:'Acme BV'};
  const b={...a,counterparty_name:'Totally Different Display Name'};
  assert.equal(await fingerprint(a),await fingerprint(b));
});
await runAsync('#65 different counterparty IBAN => different fingerprint',async()=>{
  const a={...txBase,counterparty_iban:'NL69INGB0123456789'};
  const b={...a,counterparty_iban:'NL91ABNA0417164300'};
  assert.notEqual(await fingerprint(a),await fingerprint(b));
});
for(const [label,patch] of [
  ['booking date',{booking_date:'2026-09-30'}],
  ['value date',{value_date:'2026-09-30'}],
  ['amount',{amount_cents:12101}],
  ['bank reference',{bank_reference:'BANK-QA-2'}],
  ['E2E',{end_to_end_id:'E2E-QA-2'}],
  ['direction',{credit_debit:'debit'}]
]){
  await runAsync('#65 near-equal '+label+' stays distinct',async()=>{
    assert.notEqual(await fingerprint(txBase),await fingerprint({...txBase,...patch}));
  });
}

//
// #66 — manual payment + matched bank transaction identity
//
const invoice={id:'inv-qa',kind:'invoice',status:'sent',lines:[{qty:1,unit:100,vat:21}],payments:[]};
const bank=(id,amount=5000,fp='fp-'+id)=>({
  id:'bank-'+id,
  serverTransactionId:id,
  sourceFingerprint:fp,
  status:'matched',
  matchType:'invoice',
  matchId:'inv-qa',
  amount_cents:amount
});
run('#66 original: linked manual + same bank ID count once',()=>{
  const inv={...invoice,payments:[{id:'m1',amount:50,bankTransactionId:'bt-1'}]};
  assert.equal(invoiceOutstandingCents(inv,[bank('bt-1')]),7100);
});
run('#66 manual-only payment preserved',()=>{
  assert.equal(invoiceOutstandingCents({...invoice,payments:[{id:'m1',amount:50}]},[]),7100);
});
run('#66 bank-only payment preserved',()=>{
  assert.equal(invoiceOutstandingCents(invoice,[bank('bt-1')]),7100);
});
run('#66 unlinked same-amount manual + bank are separate events',()=>{
  assert.equal(invoiceOutstandingCents({...invoice,payments:[{id:'m1',amount:50}]},[bank('bt-2')]),2100);
});
run('#66 two separate same-amount bank payments stay separate',()=>{
  assert.equal(invoiceOutstandingCents(invoice,[bank('bt-1'),bank('bt-2')]),2100);
});
run('#66 duplicate reopened bank mirror same explicit ID counted once',()=>{
  assert.equal(invoiceOutstandingCents(invoice,[bank('bt-1'),{...bank('bt-1'),id:'other-local-row'}]),7100);
});
run('#66 explicit fingerprint-only manual link collapses same bank economic payment',()=>{
  const inv={...invoice,payments:[{id:'m1',amount:50,bankTransactionFingerprint:'economic-fp'}]};
  assert.equal(invoiceOutstandingCents(inv,[bank('bt-1',5000,'economic-fp')]),7100);
});
run('#66 duplicate bank mirrors with same fingerprint count once even if local/server IDs differ',()=>{
  const a=bank('bt-1',5000,'same-economic-fp');
  const b=bank('bt-2',5000,'same-economic-fp');
  assert.equal(invoiceOutstandingCents(invoice,[a,b]),7100);
});
run('#66 linked payment plus separate second bank payment both count',()=>{
  const inv={...invoice,payments:[{id:'m1',amount:50,bankTransactionId:'bt-1'}]};
  assert.equal(invoiceOutstandingCents(inv,[bank('bt-1'),bank('bt-2',2000)]),5100);
});
run('#66 multiple manual partials',()=>{
  assert.equal(invoiceOutstandingCents({...invoice,payments:[{amount:25},{amount:25}]},[]),7100);
});
run('#66 full payment closes exactly',()=>{
  assert.equal(invoiceOutstandingCents({...invoice,payments:[{amount:121}]},[]),0);
});
run('#66 one cent remains one cent',()=>{
  assert.equal(invoiceOutstandingCents({...invoice,payments:[{amount:120.99}]},[]),1);
});
run('#66 overpayment floors at zero',()=>{
  assert.equal(invoiceOutstandingCents({...invoice,payments:[{amount:150}]},[]),0);
});
run('#66 credit note/refund linked representation count once',()=>{
  const cr={id:'credit-qa',kind:'credit',status:'sent',lines:[{qty:1,unit:100,vat:21}],payments:[{amount:50,bankTransactionId:'refund-1'}]};
  const refund={serverTransactionId:'refund-1',sourceFingerprint:'refund-fp',status:'matched',matchType:'invoice',matchId:'credit-qa',amount_cents:-5000};
  assert.equal(invoiceOutstandingCents(cr,[refund]),7100);
});

//
// #67 — UBL VAT subtotal/header reconciliation
//
const rawInvoice='<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"></Invoice>';
const rawCredit='<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"></CreditNote>';
function baseInvoice(){
  return {Invoice:{
    UBLVersionID:'2.1',
    CustomizationID:'urn:cen.eu:en16931:2017#peppol',
    ProfileID:'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',
    ID:'INV-QA',IssueDate:'2026-09-29',DocumentCurrencyCode:'EUR',
    AccountingSupplierParty:{Party:{EndpointID:{'#text':'123','@_schemeID':'0106'},PartyName:{Name:'Supplier'}}},
    AccountingCustomerParty:{Party:{EndpointID:{'#text':'456','@_schemeID':'0106'},PartyName:{Name:'Customer'}}},
    InvoiceLine:[
      {ID:'1',InvoicedQuantity:'1',LineExtensionAmount:{'#text':'100.00','@_currencyID':'EUR'},Item:{Name:'Nine'}},
      {ID:'2',InvoicedQuantity:'1',LineExtensionAmount:{'#text':'100.00','@_currencyID':'EUR'},Item:{Name:'Twenty-one'}}
    ],
    TaxTotal:{TaxAmount:{'#text':'30.00','@_currencyID':'EUR'},TaxSubtotal:[
      {TaxableAmount:{'#text':'100.00','@_currencyID':'EUR'},TaxAmount:{'#text':'9.00','@_currencyID':'EUR'},TaxCategory:{ID:'S',Percent:'9'}},
      {TaxableAmount:{'#text':'100.00','@_currencyID':'EUR'},TaxAmount:{'#text':'21.00','@_currencyID':'EUR'},TaxCategory:{ID:'S',Percent:'21'}}
    ]},
    LegalMonetaryTotal:{
      TaxExclusiveAmount:{'#text':'200.00','@_currencyID':'EUR'},
      TaxInclusiveAmount:{'#text':'230.00','@_currencyID':'EUR'},
      PayableAmount:{'#text':'230.00','@_currencyID':'EUR'}
    }
  }};
}
run('#67 valid mixed VAT remains valid',()=>{
  const r=validateUblSemantics(baseInvoice(),rawInvoice);
  assert.equal(r.errors.length,0);
  assert.equal(r.financial_snapshot.mixed_rates,true);
  assert.equal(r.financial_snapshot.vat_lines.length,2);
});
run('#67 original mismatch rejects both VAT total and taxable basis',()=>{
  const d=baseInvoice();
  d.Invoice.TaxTotal.TaxSubtotal[1].TaxableAmount['#text']='95.24';
  d.Invoice.TaxTotal.TaxSubtotal[1].TaxAmount['#text']='20.00';
  const r=validateUblSemantics(d,rawInvoice);
  const codes=new Set(r.errors.map(e=>e.code));
  assert.ok(codes.has('UBL_VAT_TOTAL_MISMATCH'),JSON.stringify(r.errors));
  assert.ok(codes.has('UBL_VAT_TAXABLE_SUM_MISMATCH'),JSON.stringify(r.errors));
});
run('#67 one-cent VAT subtotal/header mismatch is rejected exactly',()=>{
  const d=baseInvoice();
  d.Invoice.TaxTotal.TaxAmount['#text']='29.99';
  d.Invoice.LegalMonetaryTotal.TaxInclusiveAmount['#text']='229.99';
  const r=validateUblSemantics(d,rawInvoice);
  assert.ok(r.errors.some(e=>e.code==='UBL_VAT_TOTAL_MISMATCH'),JSON.stringify(r.errors));
});
run('#67 one-cent taxable subtotal/header mismatch is rejected exactly',()=>{
  const d=baseInvoice();
  d.Invoice.TaxTotal.TaxSubtotal[1].TaxableAmount['#text']='99.99';
  const r=validateUblSemantics(d,rawInvoice);
  assert.ok(r.errors.some(e=>e.code==='UBL_VAT_TAXABLE_SUM_MISMATCH'),JSON.stringify(r.errors));
});
run('#67 0% VAT reconciles',()=>{
  const d=baseInvoice();
  d.Invoice.InvoiceLine=[{ID:'1',InvoicedQuantity:'1',LineExtensionAmount:{'#text':'100.00','@_currencyID':'EUR'},Item:{Name:'Zero'}}];
  d.Invoice.TaxTotal={TaxAmount:{'#text':'0.00','@_currencyID':'EUR'},TaxSubtotal:[{TaxableAmount:{'#text':'100.00','@_currencyID':'EUR'},TaxAmount:{'#text':'0.00','@_currencyID':'EUR'},TaxCategory:{ID:'Z',Percent:'0'}}]};
  d.Invoice.LegalMonetaryTotal={TaxExclusiveAmount:{'#text':'100.00','@_currencyID':'EUR'},TaxInclusiveAmount:{'#text':'100.00','@_currencyID':'EUR'},PayableAmount:{'#text':'100.00','@_currencyID':'EUR'}};
  const r=validateUblSemantics(d,rawInvoice);
  assert.equal(r.errors.length,0,JSON.stringify(r.errors));
});
run('#67 per-rate one-cent rounding tolerance remains separate from exact sum reconciliation',()=>{
  const d=baseInvoice();
  d.Invoice.InvoiceLine=[{ID:'1',InvoicedQuantity:'1',LineExtensionAmount:{'#text':'33.33','@_currencyID':'EUR'},Item:{Name:'Rounded'}}];
  d.Invoice.TaxTotal={TaxAmount:{'#text':'7.01','@_currencyID':'EUR'},TaxSubtotal:[{TaxableAmount:{'#text':'33.33','@_currencyID':'EUR'},TaxAmount:{'#text':'7.01','@_currencyID':'EUR'},TaxCategory:{ID:'S',Percent:'21'}}]};
  d.Invoice.LegalMonetaryTotal={TaxExclusiveAmount:{'#text':'33.33','@_currencyID':'EUR'},TaxInclusiveAmount:{'#text':'40.34','@_currencyID':'EUR'},PayableAmount:{'#text':'40.34','@_currencyID':'EUR'}};
  const r=validateUblSemantics(d,rawInvoice);
  assert.ok(!r.errors.some(e=>e.code==='UBL_VAT_TOTAL_MISMATCH'));
  assert.ok(!r.errors.some(e=>e.code==='UBL_VAT_TAXABLE_SUM_MISMATCH'));
  assert.ok(!r.errors.some(e=>e.code==='UBL_VAT_ARITHMETIC'),JSON.stringify(r.errors));
});
run('#67 credit note VAT subtotal/header reconciliation',()=>{
  const inv=baseInvoice().Invoice;
  const d={CreditNote:{
    UBLVersionID:inv.UBLVersionID,CustomizationID:inv.CustomizationID,ProfileID:inv.ProfileID,
    ID:'CR-QA',IssueDate:inv.IssueDate,DocumentCurrencyCode:'EUR',
    AccountingSupplierParty:inv.AccountingSupplierParty,AccountingCustomerParty:inv.AccountingCustomerParty,
    CreditNoteLine:[
      {ID:'1',CreditedQuantity:'1',LineExtensionAmount:{'#text':'100.00','@_currencyID':'EUR'},Item:{Name:'Credit nine'}},
      {ID:'2',CreditedQuantity:'1',LineExtensionAmount:{'#text':'100.00','@_currencyID':'EUR'},Item:{Name:'Credit twenty-one'}}
    ],
    TaxTotal:structuredClone(inv.TaxTotal),
    LegalMonetaryTotal:structuredClone(inv.LegalMonetaryTotal)
  }};
  let r=validateUblSemantics(d,rawCredit);
  assert.equal(r.errors.length,0,JSON.stringify(r.errors));
  d.CreditNote.TaxTotal.TaxSubtotal[1].TaxAmount['#text']='20.00';
  r=validateUblSemantics(d,rawCredit);
  assert.ok(r.errors.some(e=>e.code==='UBL_VAT_TOTAL_MISMATCH'),JSON.stringify(r.errors));
});
run('#67 allowance case can reconcile tax subtotals to post-allowance net',()=>{
  const d=baseInvoice();
  d.Invoice.AllowanceCharge=[{ChargeIndicator:'false',Amount:{'#text':'10.00','@_currencyID':'EUR'}}];
  d.Invoice.TaxTotal={TaxAmount:{'#text':'18.90','@_currencyID':'EUR'},TaxSubtotal:[{TaxableAmount:{'#text':'90.00','@_currencyID':'EUR'},TaxAmount:{'#text':'18.90','@_currencyID':'EUR'},TaxCategory:{ID:'S',Percent:'21'}}]};
  d.Invoice.LegalMonetaryTotal={TaxExclusiveAmount:{'#text':'90.00','@_currencyID':'EUR'},TaxInclusiveAmount:{'#text':'108.90','@_currencyID':'EUR'},PayableAmount:{'#text':'108.90','@_currencyID':'EUR'}};
  d.Invoice.InvoiceLine=[{ID:'1',InvoicedQuantity:'1',LineExtensionAmount:{'#text':'100.00','@_currencyID':'EUR'},Item:{Name:'Allowance base'}}];
  const r=validateUblSemantics(d,rawInvoice);
  assert.ok(!r.errors.some(e=>e.code==='UBL_VAT_TOTAL_MISMATCH'||e.code==='UBL_VAT_TAXABLE_SUM_MISMATCH'),JSON.stringify(r.errors));
});

//
// #68 — MT940 value date / optional entry booking date
//
function parseSingle(tag){
  return parseMt940(':20:QA\n:25:NL91ABNA0417164300\n:60F:C260101EUR0,00\n:61:'+tag+'\n:86:QA entry').transactions[0];
}
run('#68 original 29 Sep value / 30 Sep booking',()=>{
  const t=parseSingle('2609290930C100,00NTRFNONREF//ENTRY1');
  assert.equal(t.value_date,'2026-09-29');
  assert.equal(t.booking_date,'2026-09-30');
});
run('#68 Dec to Jan rollover',()=>{
  const t=parseSingle('2612310101C1,00NTRFNONREF//ENTRY2');
  assert.equal(t.value_date,'2026-12-31');
  assert.equal(t.booking_date,'2027-01-01');
});
run('#68 Jan to Dec backward rollover',()=>{
  const t=parseSingle('2601011231C1,00NTRFNONREF//ENTRY3');
  assert.equal(t.value_date,'2026-01-01');
  assert.equal(t.booking_date,'2025-12-31');
});
run('#68 no optional entry date falls back booking=value',()=>{
  const t=parseSingle('260929C1,00NTRFNONREF//ENTRY4');
  assert.equal(t.value_date,'2026-09-29');
  assert.equal(t.booking_date,'2026-09-29');
});
run('#68 invalid optional entry date warns and falls back safely',()=>{
  const parsed=parseMt940(':20:QA\n:25:NL91ABNA0417164300\n:60F:C260101EUR0,00\n:61:2602280230C1,00NTRFNONREF//ENTRY5\n:86:Invalid entry');
  assert.equal(parsed.transactions[0].value_date,'2026-02-28');
  assert.equal(parsed.transactions[0].booking_date,'2026-02-28');
  assert.ok(parsed.warnings.some(x=>x.includes('invalid_entry_date')),JSON.stringify(parsed.warnings));
});
run('#68 leap-year optional entry date is preserved',()=>{
  const t=parseSingle('2802280229C1,00NTRFNONREF//ENTRY6');
  assert.equal(t.value_date,'2028-02-28');
  assert.equal(t.booking_date,'2028-02-29');
});
run('#68 reversal sign semantics unaffected',()=>{
  const t=parseSingle('2609290930R D1,00NTRFNONREF//REV'.replace('R D','RD'));
  assert.equal(t.amount_cents,100);
  assert.equal(t.credit_debit,'credit');
});

console.log('03A_PR59_RETEST_PASS '+JSON.stringify(pass));
fs.writeFileSync(new URL('./.03a-pr59-retest-result.json',import.meta.url),JSON.stringify({pass,fail},null,2)+'\n');
if(fail.length){
  console.error('03A_PR59_RETEST_FAIL '+JSON.stringify(fail));
  console.log('03A PR59 targeted retest completed with findings; final workflow gate will fail after full regression.');
}else{
  console.log('03A PR59 #65-#68 independent retest: PASS');
}
