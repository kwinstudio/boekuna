import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { parseBankAmountToCents, parseCamt053, parseMt940, secureXmlPreflight, attachTransactionFingerprints } from '../supabase/functions/financial-automation/lib/bank-import.mjs';
import { validateIban, validateBic, analyzeOcrIban } from '../supabase/functions/financial-automation/lib/iban-bic.mjs';
import { matchTransactionAgainstLedger, invoiceOutstandingCents, batchMatchTransactions } from '../supabase/functions/financial-automation/lib/matching.mjs';
import { compareDuplicateFingerprint, findDuplicateCandidates, textFingerprint, supplierFingerprint } from '../supabase/functions/financial-automation/lib/duplicates.mjs';
import { validateUblSemantics } from '../supabase/functions/financial-automation/lib/ubl.mjs';
import { loadEdge } from './production-code.mjs';

const results=[];
const fail=[];
function record(name,fn){
  try{const value=fn();if(value&&typeof value.then==='function')return value.then(v=>{results.push({name,ok:true,detail:v??null})}).catch(e=>{fail.push({name,error:String(e?.stack||e)});results.push({name,ok:false,error:String(e?.message||e)})});results.push({name,ok:true,detail:value??null})}
  catch(e){fail.push({name,error:String(e?.stack||e)});results.push({name,ok:false,error:String(e?.message||e)})}
}
const eq=(a,b,msg)=>assert.deepEqual(a,b,msg);
const ok=(v,msg)=>assert.ok(v,msg);

// 1. Decimal / bank money parsing.
for(const [raw,expected] of [['100',10000],['100.0',10000],['100.00',10000],['100,00',10000],['1.004',100],['1.005',101],['-1.005',-101]]) {
  await record('money '+raw,()=>eq(parseBankAmountToCents(raw),expected));
}

// 2. CAMT happy path + fields.
const camt={Document:{BkToCstmrStmt:{Stmt:[
 {Acct:{Id:{IBAN:'NL91ABNA0417164300'}},Ntry:[
  {Amt:{'#text':'100.00','@_Ccy':'EUR'},CdtDbtInd:'CRDT',BookgDt:{Dt:'2026-09-01'},ValDt:{Dt:'2026-09-02'},AcctSvcrRef:'REF-A',NtryDtls:{TxDtls:{Refs:{EndToEndId:'E2E-A',TxId:'TX-A'},RltdPties:{Dbtr:{Nm:'Alice BV'},DbtrAcct:{Id:{IBAN:'NL69INGB0123456789'}}},RmtInf:{Ustrd:['Factuur A','deel 2']}}}},
  {Amt:{'#text':'10.25','@_Ccy':'EUR'},CdtDbtInd:'DBIT',BookgDt:{Dt:'2026-09-03'},ValDt:{Dt:'2026-09-04'},AcctSvcrRef:'REF-B',NtryDtls:{TxDtls:{Refs:{EndToEndId:'E2E-B',TxId:'TX-B'},RltdPties:{Cdtr:{Nm:'Supplier BV'},CdtrAcct:{Id:{IBAN:'NL91ABNA0417164300'}}},RmtInf:{Ustrd:'Kosten'}}}}
 ]},
 {Acct:{Id:{IBAN:'NL02RABO0123456789'}},Ntry:[
  {Amt:{'#text':'1.01','@_Ccy':'EUR'},CdtDbtInd:'CRDT',BookgDt:{Dt:'2026-09-05'},NtryDtls:{TxDtls:{Refs:{TxId:'TX-C'},RltdPties:{Dbtr:{Nm:'Bob'}}}}}
 ]}
]}}};
const cp=parseCamt053(camt,'a'.repeat(64));
await record('CAMT multiple statements',()=>eq(cp.statement_count,2));
await record('CAMT transaction count',()=>eq(cp.transactions.length,3));
await record('CAMT credit sign',()=>eq(cp.transactions[0].amount_cents,10000));
await record('CAMT debit sign',()=>eq(cp.transactions[1].amount_cents,-1025));
await record('CAMT value date',()=>eq(cp.transactions[0].value_date,'2026-09-02'));
await record('CAMT refs',()=>{eq(cp.transactions[0].transaction_id,'TX-A');eq(cp.transactions[0].end_to_end_id,'E2E-A');eq(cp.transactions[0].bank_reference,'REF-A')});
await record('CAMT counterparty fields',()=>{eq(cp.transactions[0].counterparty_name,'Alice BV');eq(cp.transactions[0].counterparty_iban,'NL69INGB0123456789')});
await record('CAMT malformed root',()=>assert.throws(()=>parseCamt053({}),/CAMT053_ROOT_MISSING/));

// 3. XML security.
for(const [name,xml,code] of [
 ['doctype','<!DOCTYPE x><x/>','XML_DOCTYPE_FORBIDDEN'],
 ['entity','<!ENTITY x "y"><x/>','XML_ENTITY_FORBIDDEN'],
 ['stylesheet','<?xml-stylesheet href="x"?><x/>','XML_STYLESHEET_FORBIDDEN'],
 ['deep','<a>'.repeat(81)+'</a>'.repeat(81),'XML_DEPTH_EXCEEDED']
]) await record('XML guard '+name,()=>ok(secureXmlPreflight(xml,{maxDepth:80}).errors.includes(code),code));

// 4. MT940 including reversal, multiline description and distinct entry/value dates.
const mt=[
 ':20:START',
 ':25:NL91ABNA0417164300',
 ':60F:C260928EUR1000,00',
 ':61:2609290930C100,00NTRFNONREF//BANK1',
 ':86:?20EREF/E2E-1?32Acme BV?31NL69INGB0123456789',
 'vervolg omschrijving',
 ':61:2609300930D10,25NCHGNONREF//BANK2',
 ':86:Bank fee',
 ':61:2609300930R D1,00NTRFREV//REV1'.replace('R D','RD'),
 ':86:Reversal',
 ':62F:C260930EUR1088,75'
].join('\n');
const mp=parseMt940(mt,'b'.repeat(64));
await record('MT940 parses transactions',()=>eq(mp.transactions.length,3));
await record('MT940 credit/debit/reversal signs',()=>eq(mp.transactions.map(x=>x.amount_cents),[10000,-1025,100]));
await record('MT940 multiline description',()=>ok(mp.transactions[0].description.includes('vervolg omschrijving')));
await record('MT940 account/currency',()=>{eq(mp.transactions[0].account_iban,'NL91ABNA0417164300');eq(mp.transactions[0].currency,'EUR')});
await record('MT940 value date preserved',()=>eq(mp.transactions[0].value_date,'2026-09-29'));
await record('MT940 booking/entry date preserved separately',()=>eq(mp.transactions[0].booking_date,'2026-09-30','optional MMDD entry date should be represented as booking date, not discarded'));

// 5. Fingerprint idempotence and false-positive protection.
const baseTx={transaction_id:'TX-1',account_iban:'NL91ABNA0417164300',counterparty_iban:'',booking_date:'2026-09-29',value_date:'2026-09-29',amount_cents:12100,currency:'EUR',end_to_end_id:'E2E',bank_reference:'REF',description:'Betaling',credit_debit:'credit',source_format:'camt053'};
const fpSame=await attachTransactionFingerprints([baseTx,{...baseTx}],'a'.repeat(64));
await record('fingerprint identical economic tx',()=>eq(fpSame[0].transaction_fingerprint,fpSame[1].transaction_fingerprint));
const fpNear=await attachTransactionFingerprints([
 baseTx,
 {...baseTx,booking_date:'2026-09-30'},
 {...baseTx,amount_cents:12101},
 {...baseTx,bank_reference:'REF2'},
 {...baseTx,end_to_end_id:'E2E2'},
 {...baseTx,counterparty_name:'Completely Different Counterparty'}
],'a'.repeat(64));
for(let i=1;i<5;i++)await record('fingerprint near-different '+i,()=>assert.notEqual(fpNear[0].transaction_fingerprint,fpNear[i].transaction_fingerprint));
await record('fingerprint different counterparty name',()=>assert.notEqual(fpNear[0].transaction_fingerprint,fpNear[5].transaction_fingerprint,'counterparty difference must not collapse into duplicate when IBAN is absent'));

// 6. Matching states, partial, ambiguous, credit.
const ledger={contacts:[{id:'c1',name:'Acme BV',iban:'NL69INGB0123456789'}],invoices:[{id:'i1',number:'2026-001',paymentReference:'PAY-001',customerId:'c1',kind:'invoice',status:'sent',issueDate:'2026-09-20',dueDate:'2026-10-04',lines:[{qty:1,unit:100,vat:21}],payments:[]}],expenses:[{id:'e1',vendor:'Supplier BV',invoiceNumber:'SUP-1',date:'2026-09-20',gross:121}],transactions:[]};
const exact=matchTransactionAgainstLedger({amount_cents:12100,booking_date:'2026-09-29',description:'2026-001 PAY-001',counterparty_name:'Acme BV',counterparty_iban:'NL69INGB0123456789',bank_reference:'PAY-001'},ledger);
await record('matching exact/high-confidence',()=>eq(exact.state,'exact/high-confidence'));
const partial=matchTransactionAgainstLedger({amount_cents:5000,booking_date:'2026-09-29',description:'PAY-001',counterparty_name:'Acme BV'},ledger);
await record('matching partial suggested',()=>{eq(partial.state,'suggested');ok(partial.best?.evidence.includes('partial_amount'))});
const ambLedger={contacts:[{id:'a',name:'Alpha'},{id:'b',name:'Beta'}],invoices:[{id:'a1',customerId:'a',status:'sent',lines:[{qty:1,unit:100,vat:0}]},{id:'b1',customerId:'b',status:'sent',lines:[{qty:1,unit:100,vat:0}]}],expenses:[],transactions:[]};
await record('matching ambiguous equal invoices',()=>eq(matchTransactionAgainstLedger({amount_cents:10000,description:'generic'},ambLedger).state,'ambiguous'));
await record('matching unmatched',()=>eq(matchTransactionAgainstLedger({amount_cents:999999,description:'none'},ledger).state,'unmatched'));
const creditLedger={contacts:[{id:'c1',name:'Acme'}],invoices:[{id:'cr1',kind:'credit',customerId:'c1',status:'sent',number:'CR-1',lines:[{qty:1,unit:100,vat:21}],payments:[]}],expenses:[],transactions:[]};
await record('credit note matches debit direction',()=>ok(matchTransactionAgainstLedger({amount_cents:-12100,description:'CR-1'},creditLedger).best?.target_ref==='cr1'));

// 7. Existing manual payment + matched bank transaction must not be counted twice when they represent the same payment.
// Current data model has no bank/manual linkage; this test captures the acceptance risk.
const paidLedgerInvoice={id:'i-double',kind:'invoice',status:'sent',lines:[{qty:1,unit:100,vat:21}],payments:[{id:'p1',amount:50,date:'2026-09-29',bankTransactionId:'bt-1'}]};
const mirroredBank=[{id:'bank-bt-1',serverTransactionId:'bt-1',status:'matched',matchType:'invoice',matchId:'i-double',amount_cents:5000,amount:50}];
await record('manual+bank same payment no double count',()=>eq(invoiceOutstandingCents(paidLedgerInvoice,mirroredBank),7100,'same 50 EUR payment should leave 71 EUR outstanding, not 21 EUR'));

// 8. Explicit cent behavior observation.
await record('invoice 121 less 120.99 leaves one cent',()=>eq(invoiceOutstandingCents({id:'c',kind:'invoice',lines:[{qty:1,unit:100,vat:21}],payments:[{amount:120.99}]},[]),1));
await record('invoice 121 less 121 exact zero',()=>eq(invoiceOutstandingCents({id:'c',kind:'invoice',lines:[{qty:1,unit:100,vat:21}],payments:[{amount:121}]},[]),0));

// 9. IBAN / BIC / OCR.
for(const [input,valid] of [['NL91 ABNA 0417 1643 00',true],['nl91abna0417164300',true],['NL91-ABNA-0417-1643-00',true],['NL91ABNA0417164301',false],['NL91ABNA0417',false],['ZZ91ABNA0417164300',false],['NL91ABNA04171643@0',false],['',false]]) {
 await record('IBAN '+JSON.stringify(input),()=>eq(validateIban(input).valid,valid));
}
await record('BIC 8',()=>eq(validateBic('ABNANL2A','NL91ABNA0417164300').valid,true));
await record('BIC 11 lowercase',()=>eq(validateBic('abnanl2axxx','NL91ABNA0417164300').valid,true));
await record('BIC syntax invalid',()=>eq(validateBic('ABNA!','NL91ABNA0417164300').valid,false));
await record('BIC country mismatch',()=>eq(validateBic('ABNADEFF','NL91ABNA0417164300').valid,false));
const ocr=analyzeOcrIban('NL91ABNAO417164300');
await record('OCR IBAN uncertain not autocorrected',()=>{eq(ocr.status,'uncertain');eq(ocr.corrected,false);ok(ocr.candidates.includes('NL91ABNA0417164300'))});

// 10. Duplicate documents.
const sha='c'.repeat(64);
await record('duplicate exact SHA',()=>eq(compareDuplicateFingerprint({document_sha256:sha},{document_sha256:sha}).state,'exact_duplicate'));
const sf=await supplierFingerprint('Supplier BV'),tf=await textFingerprint('Invoice 1 total 121.00');
const possibleA={document_sha256:'a'.repeat(64),perceptual_hash:'ffffffffffffffff',supplier_fingerprint:sf,document_date:'2026-09-29',gross_cents:12100,vat_cents:2100,text_fingerprint:tf,document_type:'invoice'};
const possibleB={...possibleA,document_sha256:'b'.repeat(64),perceptual_hash:'fffffffffffffffe'};
await record('duplicate possible scan',()=>eq(compareDuplicateFingerprint(possibleA,possibleB).state,'possible_duplicate'));
await record('duplicate false positive date protection',()=>eq(compareDuplicateFingerprint({document_sha256:'1'.repeat(64),supplier_fingerprint:sf,document_date:'2026-09-29',gross_cents:12100},{document_sha256:'2'.repeat(64),supplier_fingerprint:sf,document_date:'2026-09-30',gross_cents:12100}).state,'distinct'));

// 11. UBL semantic integrity.
function ublBase(){
 return {Invoice:{UBLVersionID:'2.1',CustomizationID:'urn:cen.eu:en16931:2017#peppol',ProfileID:'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',ID:'INV-1',IssueDate:'2026-09-29',DocumentCurrencyCode:'EUR',AccountingSupplierParty:{Party:{EndpointID:{'#text':'123','@_schemeID':'0106'},PartyName:{Name:'Supplier'}}},AccountingCustomerParty:{Party:{EndpointID:{'#text':'456','@_schemeID':'0106'},PartyName:{Name:'Customer'}}},InvoiceLine:[{ID:'1',InvoicedQuantity:'1',LineExtensionAmount:{'#text':'200.00','@_currencyID':'EUR'},Item:{Name:'Services'}}],TaxTotal:{TaxAmount:{'#text':'30.00','@_currencyID':'EUR'},TaxSubtotal:[{TaxableAmount:{'#text':'100.00','@_currencyID':'EUR'},TaxAmount:{'#text':'9.00','@_currencyID':'EUR'},TaxCategory:{ID:'S',Percent:'9'}},{TaxableAmount:{'#text':'100.00','@_currencyID':'EUR'},TaxAmount:{'#text':'21.00','@_currencyID':'EUR'},TaxCategory:{ID:'S',Percent:'21'}}]},LegalMonetaryTotal:{TaxExclusiveAmount:{'#text':'200.00','@_currencyID':'EUR'},TaxInclusiveAmount:{'#text':'230.00','@_currencyID':'EUR'},PayableAmount:{'#text':'230.00','@_currencyID':'EUR'}}}};
}
const raw='<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"></Invoice>';
const uv=validateUblSemantics(ublBase(),raw);
await record('UBL mixed valid',()=>{eq(uv.errors.length,0);eq(uv.financial_snapshot.net_cents,20000);eq(uv.financial_snapshot.vat_cents,3000);eq(uv.financial_snapshot.gross_cents,23000);eq(uv.financial_snapshot.mixed_rates,true);eq(uv.financial_snapshot.vat_lines.length,2)});
const badTotal=ublBase();badTotal.Invoice.LegalMonetaryTotal.TaxInclusiveAmount['#text']='228.00';
await record('UBL wrong gross rejected',()=>ok(validateUblSemantics(badTotal,raw).errors.some(e=>e.code==='UBL_FINANCIAL_TOTAL_MISMATCH')));
const badVatBreakdown=ublBase();
badVatBreakdown.Invoice.TaxTotal.TaxSubtotal=[
 {TaxableAmount:{'#text':'100.00','@_currencyID':'EUR'},TaxAmount:{'#text':'9.00','@_currencyID':'EUR'},TaxCategory:{ID:'S',Percent:'9'}},
 {TaxableAmount:{'#text':'95.24','@_currencyID':'EUR'},TaxAmount:{'#text':'20.00','@_currencyID':'EUR'},TaxCategory:{ID:'S',Percent:'21'}}
];
// Header total still says VAT 30.00 and gross 230.00; subtotals only add to 29.00 and taxable 195.24.
await record('UBL VAT subtotal sum must reconcile to VAT total/net',()=>{
 const v=validateUblSemantics(badVatBreakdown,raw);
 ok(v.errors.some(e=>['UBL_VAT_TOTAL_MISMATCH','UBL_VAT_TAXABLE_SUM_MISMATCH'].includes(e.code)),
   'financially inconsistent VAT subtotals must not be accepted without an error; got '+JSON.stringify(v.errors));
});
for(const [field,mutate,code] of [
 ['ID',d=>d.Invoice.ID='','UBL_REQUIRED_ID'],
 ['IssueDate',d=>d.Invoice.IssueDate='bad','UBL_REQUIRED_ISSUE_DATE'],
 ['currency',d=>d.Invoice.DocumentCurrencyCode='EU','UBL_REQUIRED_CURRENCY'],
 ['supplier',d=>d.Invoice.AccountingSupplierParty={Party:{EndpointID:{'#text':'x','@_schemeID':'0106'}}},'UBL_REQUIRED_SUPPLIER'],
 ['customer',d=>d.Invoice.AccountingCustomerParty={Party:{EndpointID:{'#text':'x','@_schemeID':'0106'}}},'UBL_REQUIRED_CUSTOMER'],
 ['lines',d=>d.Invoice.InvoiceLine=[],'UBL_REQUIRED_LINES']
]) {
 const d=ublBase();mutate(d);await record('UBL missing/invalid '+field,()=>ok(validateUblSemantics(d,raw).errors.some(e=>e.code===code),code));
}

// 12. PDF real generation: A4, mixed VAT groups, due date, multipage headers/page numbering, special characters.
let handler;const drawn=[];
const mockClient={auth:{getUser:async()=>({data:{user:{id:'qa'}},error:null})},rpc:async()=>({data:null,error:null})};
const {edge}=loadEdge({
 StandardFonts,rgb,
 PDFDocument:{async create(){const pdf=await PDFDocument.create();const add=pdf.addPage.bind(pdf);pdf.addPage=(...args)=>{const p=add(...args.map(a=>Array.isArray(a)?Array.from(a):a)),draw=p.drawText.bind(p);p.drawText=(t,o)=>{drawn.push(String(t));return draw(t,o)};return p};return pdf}},
 Deno:{serve:fn=>{handler=fn},env:{get:key=>({SUPABASE_URL:'https://test.invalid',SUPABASE_ANON_KEY:'x',SUPABASE_SERVICE_ROLE_KEY:'y'})[key]}},
 createClient:()=>mockClient,
 fetch:async()=>new Response('{}',{status:500})
});
drawn.length=0;
const mixedInvoice={id:'m',number:'MIX-1',kind:'invoice',taxTreatment:'standard',issueDate:'2026-09-29',dueDate:'2026-10-13',paymentReference:'REF-MIX',lines:[{qty:1,unit:100,vat:9,desc:'Café & Müller'},{qty:1,unit:100,vat:21,desc:"Diensten ë é 'test'"}],vatLines:[{rate:9,taxableAmount:100,vatAmount:9},{rate:21,taxableAmount:100,vatAmount:21}],payments:[]};
const mixedPdf=await edge.pdfBytes({invoice:mixedInvoice,company:{name:'Müller & Zonen B.V.',tradeName:'Müller',iban:'NL91ABNA0417164300',address:'Straat 1',postal:'1000AA',city:'Amsterdam'},customer:{name:"Café d'Été & Co",address:'Kade 2',postal:'2000BB',city:'Utrecht'}});
const mixedLoaded=await PDFDocument.load(mixedPdf);
await record('PDF A4 dimensions',()=>{const p=mixedLoaded.getPage(0).getSize();ok(Math.abs(p.width-595.28)<0.1);ok(Math.abs(p.height-841.89)<0.1)});
await record('PDF mixed VAT labels',()=>{ok(drawn.some(x=>x.startsWith('Btw 9% over')));ok(drawn.some(x=>x.startsWith('Btw 21% over')))});
await record('PDF due date/payment ref',()=>{ok(drawn.includes('Vervaldatum 13-10-2026'));ok(drawn.includes('REF-MIX'))});
await record('PDF special chars',()=>{ok(drawn.includes('Café & Müller'));ok(drawn.includes("Diensten ë é 'test'"))});
drawn.length=0;
const longInvoice={id:'long',number:'LONG-1',kind:'invoice',taxTreatment:'standard',issueDate:'2026-09-29',dueDate:'2026-10-13',paymentReference:'LONG',lines:Array.from({length:55},(_,i)=>({qty:1,unit:10+i/100,vat:i%2?9:21,desc:'Lange regel '+(i+1)+' Café Müller met extra omschrijving'})),payments:[]};
const longPdf=await edge.pdfBytes({invoice:longInvoice,company:{name:'Een zeer lange bedrijfsnaam voor regressietest B.V.',iban:'NL91ABNA0417164300'},customer:{name:'Ook een bijzonder lange klantnaam voor de regressietest B.V.'}});
const longLoaded=await PDFDocument.load(longPdf);
await record('PDF 55 lines multipage',()=>ok(longLoaded.getPageCount()>1));
await record('PDF repeated table header',()=>ok(drawn.filter(x=>x==='Omschrijving').length>=2));
await record('PDF page numbering all pages',()=>{for(let i=1;i<=longLoaded.getPageCount();i++)ok(drawn.includes('Pagina '+i+' / '+longLoaded.getPageCount()))});

// 13. Performance.
const p0=performance.now();
await attachTransactionFingerprints(Array.from({length:1000},(_,i)=>({...baseTx,transaction_id:'T'+i,amount_cents:100+i,description:'tx '+i})),'f'.repeat(64));
const hashMs=performance.now()-p0;
const p1=performance.now();
batchMatchTransactions(Array.from({length:100},(_,i)=>({id:'m'+i,amount_cents:12100,description:i===0?'PAY-001':'random '+i})),ledger);
const matchMs=performance.now()-p1;
const rows=Array.from({length:200},(_,i)=>({...possibleA,document_ref:'d'+i,document_sha256:String(i).padStart(64,'0').slice(-64)}));
const p2=performance.now();findDuplicateCandidates(possibleB,rows,{limit:5});const dupMs=performance.now()-p2;
const p3=performance.now();for(let i=0;i<100;i++)validateUblSemantics(ublBase(),raw);const ublMs=performance.now()-p3;
results.push({name:'performance',ok:true,detail:{hash1000_ms:+hashMs.toFixed(2),match100_ms:+matchMs.toFixed(2),duplicate200_ms:+dupMs.toFixed(2),ubl100_ms:+ublMs.toFixed(2)}});

console.log('03A_PR59_RESULTS '+JSON.stringify(results));
if(fail.length){
 console.error('03A_PR59_FAILURES '+JSON.stringify(fail));
 process.exitCode=1;
}else{
 console.log('03A PR59 independent module/PDF QA: PASS');
}
