import assert from "node:assert/strict";

const toCents=v=>Math.round((Number(v||0)+(Number(v||0)>=0?Number.EPSILON:-Number.EPSILON))*100);
const fromCents=c=>Number(c||0)/100;
const roundMoney=v=>fromCents(toCents(v));
const lineNetAmount=l=>roundMoney(Number(l?.qty||0)*Number(l?.unit||0));
const lineVatAmount=l=>roundMoney(lineNetAmount(l)*Number(l?.vat||0)/100);
const invoiceSign=i=>i?.kind==="credit"?-1:1;
const invoiceTaxTreatment=i=>String(i?.taxTreatment||"standard");
const isZeroOutputVatTreatment=v=>["kor","reverse","icp","exempt"].includes(String(v||"standard"));
const invoiceNet=i=>{
  const raw=i?.importedTotals?.net!=null
    ? Math.abs(roundMoney(i.importedTotals.net))
    : (i?.lines||[]).reduce((s,l)=>roundMoney(s+lineNetAmount(l)),0);
  return roundMoney(raw*invoiceSign(i));
};
const invoiceVat=i=>{
  if(isZeroOutputVatTreatment(invoiceTaxTreatment(i)))return 0;
  const raw=i?.importedTotals?.vat!=null
    ? Math.abs(roundMoney(i.importedTotals.vat))
    : (i?.lines||[]).reduce((s,l)=>roundMoney(s+lineVatAmount(l)),0);
  return roundMoney(raw*invoiceSign(i));
};
const invoiceGross=i=>i?.importedTotals?.gross!=null
  ? roundMoney(Math.abs(roundMoney(i.importedTotals.gross))*invoiceSign(i))
  : roundMoney(invoiceNet(i)+invoiceVat(i));

let transactions=[];
const invoicePayments=i=>Array.isArray(i?.payments)?i.payments:[];
const invoicePaidAmount=i=>{
  const manual=invoicePayments(i).reduce((s,p)=>roundMoney(s+Math.abs(roundMoney(p.amount||0))),0);
  const bank=transactions
    .filter(t=>t.status==="matched"&&t.matchType==="invoice"&&t.matchId===i.id)
    .reduce((s,t)=>roundMoney(s+Math.abs(roundMoney(t.amount||0))),0);
  return roundMoney(manual+bank);
};
const invoiceOutstanding=i=>Math.max(0,roundMoney(Math.abs(invoiceGross(i))-invoicePaidAmount(i)));

const normalizeBankText=v=>String(v||"").trim().toLowerCase().replace(/\s+/g," ");
const fnv1a=v=>{let h=2166136261;for(let i=0;i<v.length;i++){h^=v.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,"0")};
const bankFingerprint=t=>"b1-"+fnv1a([
  t.sourceId||"",t.endToEndId||"",t.reference||"",t.date||"",
  String(toCents(t.amount||0)),normalizeBankText(t.description),normalizeBankText(t.counterpartyIban||"")
].join("|"));

const normalizedMatchText=v=>normalizeBankText(v).replace(/[^a-z0-9]+/g," ");
const txInvoiceEvidence=(t,i,customer={name:"",iban:""})=>{
  const desc=normalizedMatchText([t.description,t.reference,t.endToEndId].filter(Boolean).join(" "));
  const amountOk=Math.abs(roundMoney(invoiceOutstanding(i)-Number(t.amount||0)))<=0.02;
  if(!amountOk)return {score:0,reasons:[]};
  let score=50;const reasons=["bedrag"];
  const number=normalizedMatchText(i.number),payref=normalizedMatchText(i.paymentReference),name=normalizedMatchText(customer.name);
  const iban=String(customer.iban||"").replace(/\s/g,"").toLowerCase();
  const txIban=String(t.counterpartyIban||"").replace(/\s/g,"").toLowerCase();
  if(number&&desc.includes(number)){score+=35;reasons.push("factuurnummer")}
  if(payref&&payref!==number&&desc.includes(payref)){score+=30;reasons.push("betalingskenmerk")}
  if(name&&name.length>=4&&desc.includes(name)){score+=20;reasons.push("klantnaam")}
  if(iban&&txIban&&iban===txIban){score+=25;reasons.push("IBAN")}
  return {score,reasons};
};

const validateJournalEntry=entry=>{
  const debit=roundMoney((entry.lines||[]).reduce((s,l)=>s+roundMoney(l.debit||0),0));
  const credit=roundMoney((entry.lines||[]).reduce((s,l)=>s+roundMoney(l.credit||0),0));
  const diff=roundMoney(debit-credit);
  return {ok:Math.abs(diff)<=0.01,debit,credit,diff};
};
const inQuarter=(date,q,year)=>{
  const d=new Date(date+"T12:00:00");
  return d.getFullYear()===Number(year)&&Math.ceil((d.getMonth()+1)/3)===Number(q);
};

const invoice={id:"inv-1",kind:"invoice",taxTreatment:"standard",number:"2026-0001",paymentReference:"2026-0001",lines:[{qty:1,unit:100,vat:21}],payments:[]};
const credit={id:"cr-1",kind:"credit",taxTreatment:"standard",creditFor:"inv-1",lines:[{qty:1,unit:100,vat:21}],payments:[]};

assert.equal(invoiceNet(invoice),100,"invoice net");
assert.equal(invoiceVat(invoice),21,"invoice VAT");
assert.equal(invoiceGross(invoice),121,"gross = net + VAT");
assert.equal(invoiceNet(credit),-100,"credit net must be negative");
assert.equal(invoiceVat(credit),-21,"credit VAT must be negative");
assert.equal(invoiceGross(credit),-121,"credit gross must be negative");
assert.equal(roundMoney(invoiceNet(invoice)+invoiceNet(credit)),0,"full credit cancels revenue");
assert.equal(roundMoney(invoiceVat(invoice)+invoiceVat(credit)),0,"full credit cancels VAT");

const partial={...structuredClone(invoice),id:"inv-partial",payments:[{id:"p1",date:"2026-09-27",amount:60}]};
transactions=[];
assert.equal(invoiceOutstanding(partial),61,"€121 - €60 = €61 outstanding");
partial.payments.push({id:"p2",date:"2026-09-28",amount:61});
assert.equal(invoiceOutstanding(partial),0,"two partial payments close invoice");

const almost={...structuredClone(invoice),id:"inv-almost",payments:[{amount:120.99}]};
assert.equal(invoiceOutstanding(almost),0.01,"one cent remains outstanding");

const mixed={kind:"invoice",taxTreatment:"standard",lines:[{qty:1,unit:100,vat:21},{qty:1,unit:100,vat:9}]};
assert.equal(invoiceVat(mixed),30,"mixed 21% + 9% VAT");
assert.equal(invoiceVat({...invoice,taxTreatment:"kor"}),0,"KOR invoice has no output VAT");
assert.equal(invoiceVat({...invoice,taxTreatment:"reverse"}),0,"reverse charge invoice has no output VAT in local VAT total");

assert.equal(roundMoney(10.005),10.01,"10.005 rounds to 10.01");
assert.equal(lineNetAmount({qty:3,unit:19.99}),59.97,"19.99 x 3");
assert.equal(invoiceVat({kind:"invoice",taxTreatment:"standard",lines:[{qty:1,unit:100,vat:9}]}),9,"9% VAT");
assert.equal(invoiceVat({kind:"invoice",taxTreatment:"standard",lines:[{qty:1,unit:100,vat:0}]}),0,"0% VAT");

const row={date:"2026-09-27",amount:121,description:"Betaling factuur 2026-0001",reference:"ABC",counterpartyIban:"NL00TEST0123456789"};
assert.equal(bankFingerprint(row),bankFingerprint({...row}),"same bank row must deduplicate");
assert.notEqual(bankFingerprint(row),bankFingerprint({...row,amount:122}),"different amount is not duplicate");

const amountOnly=txInvoiceEvidence({date:"2026-09-27",amount:121,description:"betaling"},invoice,{name:"Klant BV"});
assert.equal(amountOnly.score,50,"amount only stays medium confidence");
assert.ok(amountOnly.score<80,"amount-only match must not auto-link");
const identified=txInvoiceEvidence({date:"2026-09-27",amount:121,description:"betaling 2026-0001"},invoice,{name:"Klant BV"});
assert.ok(identified.score>=80,"amount + invoice number may be high confidence");

assert.equal(validateJournalEntry({lines:[{debit:121,credit:0},{debit:0,credit:121}]}).ok,true,"balanced journal accepted");
assert.equal(validateJournalEntry({lines:[{debit:121,credit:0},{debit:0,credit:120}]}).ok,false,"unbalanced journal rejected");

const journal=[
 {lines:[{debit:121,credit:0},{debit:0,credit:100},{debit:0,credit:21}]},
 {lines:[{debit:0,credit:121},{debit:100,credit:0},{debit:21,credit:0}]}
];
const debit=roundMoney(journal.flatMap(x=>x.lines).reduce((s,l)=>s+Number(l.debit||0),0));
const creditTotal=roundMoney(journal.flatMap(x=>x.lines).reduce((s,l)=>s+Number(l.credit||0),0));
assert.equal(debit,creditTotal,"total ledger debit = credit");

assert.equal(inQuarter("2027-02-15",1,2027),true,"2027 invoice appears in 2027 Q1");
assert.equal(inQuarter("2027-02-15",1,2026),false,"2027 invoice does not appear in 2026");

console.log("Boekuna accounting integrity tests: PASS");
