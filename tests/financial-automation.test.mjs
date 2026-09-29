import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {validateIban,validateBic,analyzeOcrIban} from '../supabase/functions/financial-automation/lib/iban-bic.mjs';
import {parseCamt053,parseMt940,secureXmlPreflight,attachTransactionFingerprints,statementSummary} from '../supabase/functions/financial-automation/lib/bank-import.mjs';
import {matchTransactionAgainstLedger,batchMatchTransactions,invoiceOutstandingCents} from '../supabase/functions/financial-automation/lib/matching.mjs';
import {compareDuplicateFingerprint,textFingerprint,supplierFingerprint} from '../supabase/functions/financial-automation/lib/duplicates.mjs';
import {validateUblSemantics} from '../supabase/functions/financial-automation/lib/ubl.mjs';

assert.equal(validateIban('NL91 ABNA 0417 1643 00').valid,true);
assert.equal(validateIban('nl91abna0417164300').normalized,'NL91ABNA0417164300');
assert.equal(validateIban('NL91ABNA0417164301').valid,false);
assert.equal(validateIban('NL91ABNA0417').errors.includes('IBAN_LENGTH'),true);
assert.equal(validateBic('ABNANL2A','NL91ABNA0417164300').valid,true);
assert.equal(validateBic('ABNADEFF','NL91ABNA0417164300').valid,false);
const ocr=analyzeOcrIban('NL91ABNAO417164300');assert.equal(ocr.status,'uncertain');assert.ok(ocr.candidates.includes('NL91ABNA0417164300'));assert.equal(ocr.corrected,false);

const camt={Document:{BkToCstmrStmt:{Stmt:[
 {Acct:{Id:{IBAN:'NL91ABNA0417164300'}},Ntry:[{Amt:{'#text':'121.00','@_Ccy':'EUR'},CdtDbtInd:'CRDT',BookgDt:{Dt:'2026-09-29'},ValDt:{Dt:'2026-09-29'},AcctSvcrRef:'REF1',NtryDtls:{TxDtls:{Refs:{EndToEndId:'PAY-001',TxId:'TX1'},RltdPties:{Dbtr:{Nm:'Acme BV'},DbtrAcct:{Id:{IBAN:'NL69INGB0123456789'}}},RmtInf:{Ustrd:'Invoice 2026-001'}}}}]},
 {Acct:{Id:{IBAN:'NL91ABNA0417164300'}},Ntry:[{Amt:{'#text':'10.25','@_Ccy':'EUR'},CdtDbtInd:'DBIT',BookgDt:{Dt:'2026-09-30'},NtryDtls:{TxDtls:{Refs:{TxId:'TX2'},RltdPties:{Cdtr:{Nm:'Supplier BV'}},RmtInf:{Ustrd:'Bank fee'}}}}]}
]}}};
const cp=parseCamt053(camt,'a'.repeat(64));assert.equal(cp.statement_count,2);assert.equal(cp.transactions.length,2);assert.equal(cp.transactions[0].amount_cents,12100);assert.equal(cp.transactions[1].amount_cents,-1025);assert.equal(cp.transactions[0].counterparty_iban,'NL69INGB0123456789');assert.throws(()=>parseCamt053({}),/CAMT053_ROOT_MISSING/);

const mt=':20:START\n:25:NL91ABNA0417164300\n:60F:C260928EUR1000,00\n:61:2609290929C121,00NTRFNONREF//BANKREF1\n:86:?20EREF/PAY-001?32Acme BV?31NL69INGB0123456789\n:61:2609300930D10,25NCHGNONREF//BANKREF2\n:86:Bank fee\n:62F:C260930EUR1110,75';
const mp=parseMt940(mt,'b'.repeat(64));assert.equal(mp.transactions.length,2);assert.equal(mp.transactions[0].amount_cents,12100);assert.equal(mp.transactions[1].amount_cents,-1025);assert.throws(()=>parseMt940(':20:none'),/MT940_TRANSACTION_TAG_MISSING/);
const xxe=secureXmlPreflight('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>');assert.equal(xxe.ok,false);assert.ok(xxe.errors.includes('XML_DOCTYPE_FORBIDDEN'));assert.ok(secureXmlPreflight('<a>'.repeat(81)+'</a>'.repeat(81)).errors.includes('XML_DEPTH_EXCEEDED'));
const fp=await attachTransactionFingerprints(cp.transactions,'a'.repeat(64));assert.notEqual(fp[0].transaction_fingerprint,fp[1].transaction_fingerprint);const sum=statementSummary(fp);assert.equal(sum.credit_total_cents,12100);assert.equal(sum.debit_total_cents,1025);

const ledger={contacts:[{id:'c1',name:'Acme BV',iban:'NL69INGB0123456789'}],invoices:[{id:'i1',number:'2026-001',paymentReference:'PAY-001',customerId:'c1',status:'sent',issueDate:'2026-09-20',dueDate:'2026-10-04',lines:[{qty:1,unit:100,vat:21}],payments:[]}],expenses:[],transactions:[]};
const high=matchTransactionAgainstLedger({amount_cents:12100,booking_date:'2026-09-29',description:'2026-001 PAY-001',counterparty_name:'Acme BV',counterparty_iban:'NL69INGB0123456789',bank_reference:'PAY-001'},ledger);assert.equal(high.state,'exact/high-confidence');assert.ok(high.score>=80);assert.equal(invoiceOutstandingCents(ledger.invoices[0],[]),12100);
const partial=matchTransactionAgainstLedger({amount_cents:5000,booking_date:'2026-09-29',description:'PAY-001',counterparty_name:'Acme BV'},ledger);assert.equal(partial.state,'suggested');assert.ok(partial.best.evidence.includes('partial_amount'));
const ambLedger={contacts:[{id:'a',name:'Alpha'},{id:'b',name:'Beta'}],invoices:[{id:'a1',customerId:'a',status:'sent',lines:[{qty:1,unit:100,vat:0}]},{id:'b1',customerId:'b',status:'sent',lines:[{qty:1,unit:100,vat:0}]}],expenses:[],transactions:[]};assert.equal(matchTransactionAgainstLedger({amount_cents:10000,description:'generic'},ambLedger).state,'ambiguous');assert.equal(matchTransactionAgainstLedger({amount_cents:999999,description:'none'},ledger).state,'unmatched');

assert.equal(compareDuplicateFingerprint({document_sha256:'c'.repeat(64)},{document_sha256:'c'.repeat(64)}).state,'exact_duplicate');
const tf=await textFingerprint('Albert Heijn 18,42 29-09-2026'),sf=await supplierFingerprint('Albert Heijn');
const dup=compareDuplicateFingerprint({document_sha256:'d'.repeat(64),perceptual_hash:'ffffffffffffffff',supplier_fingerprint:sf,document_date:'2026-09-29',gross_cents:1842,vat_cents:319,text_fingerprint:tf,document_type:'receipt'},{document_sha256:'e'.repeat(64),perceptual_hash:'fffffffffffffffe',supplier_fingerprint:sf,document_date:'2026-09-29',gross_cents:1842,vat_cents:319,text_fingerprint:tf,document_type:'receipt'});assert.equal(dup.state,'possible_duplicate');
assert.equal(compareDuplicateFingerprint({document_sha256:'1'.repeat(64),supplier_fingerprint:sf,document_date:'2026-09-29',gross_cents:1842},{document_sha256:'2'.repeat(64),supplier_fingerprint:sf,document_date:'2026-09-30',gross_cents:1842}).state,'distinct');

const u={Invoice:{UBLVersionID:'2.1',CustomizationID:'urn:cen.eu:en16931:2017#peppol',ProfileID:'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',ID:'INV-1',IssueDate:'2026-09-29',DocumentCurrencyCode:'EUR',AccountingSupplierParty:{Party:{EndpointID:{'#text':'123','@_schemeID':'0106'},PartyName:{Name:'Supplier'}}},AccountingCustomerParty:{Party:{EndpointID:{'#text':'456','@_schemeID':'0106'},PartyName:{Name:'Customer'}}},InvoiceLine:[{ID:'1',InvoicedQuantity:'1',LineExtensionAmount:{'#text':'150.00','@_currencyID':'EUR'},Item:{Name:'Services'}}],TaxTotal:{TaxAmount:{'#text':'22.50','@_currencyID':'EUR'},TaxSubtotal:[{TaxableAmount:{'#text':'100.00','@_currencyID':'EUR'},TaxAmount:{'#text':'21.00','@_currencyID':'EUR'},TaxCategory:{ID:'S',Percent:'21'}},{TaxableAmount:{'#text':'50.00','@_currencyID':'EUR'},TaxAmount:{'#text':'1.50','@_currencyID':'EUR'},TaxCategory:{ID:'S',Percent:'3'}}]},LegalMonetaryTotal:{TaxExclusiveAmount:{'#text':'150.00','@_currencyID':'EUR'},TaxInclusiveAmount:{'#text':'172.50','@_currencyID':'EUR'},PayableAmount:{'#text':'172.50','@_currencyID':'EUR'}}}};
const uv=validateUblSemantics(u,'<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"></Invoice>');assert.equal(uv.errors.length,0);assert.equal(uv.financial_snapshot.gross_cents,17250);assert.equal(uv.financial_snapshot.mixed_rates,true);const bad=structuredClone(u);bad.Invoice.LegalMonetaryTotal.TaxInclusiveAmount['#text']='171.00';assert.ok(validateUblSemantics(bad,'<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"></Invoice>').errors.some(e=>e.code==='UBL_FINANCIAL_TOTAL_MISMATCH'));

const t0=performance.now();await attachTransactionFingerprints(Array.from({length:1000},(_,i)=>({transaction_id:'t'+i,amount_cents:100+i,booking_date:'2026-09-29',currency:'EUR',source_format:'camt053'})),'f'.repeat(64));const hashMs=performance.now()-t0;const t1=performance.now();assert.equal(batchMatchTransactions(Array.from({length:100},(_,i)=>({id:'x'+i,amount_cents:12100,description:i?'random':'PAY-001'})),ledger).length,100);const matchMs=performance.now()-t1;
console.log('Financial automation: PASS',JSON.stringify({hash1000_ms:Number(hashMs.toFixed(2)),match100_ms:Number(matchMs.toFixed(2))}));
