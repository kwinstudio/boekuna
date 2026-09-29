function norm(v){return String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function compact(v){return norm(v).replace(/\s+/g,'')}
function sim(a,b){const A=new Set(norm(a).split(' ').filter(x=>x.length>1)),B=new Set(norm(b).split(' ').filter(x=>x.length>1));if(!A.size||!B.size)return 0;let n=0;for(const x of A)if(B.has(x))n++;return n/(A.size+B.size-n)}

const MAX_SAFE_BIGINT=BigInt(Number.MAX_SAFE_INTEGER),MIN_SAFE_BIGINT=BigInt(Number.MIN_SAFE_INTEGER);
function safeNumber(n){if(n>MAX_SAFE_BIGINT||n<MIN_SAFE_BIGINT)throw new Error('MONEY_OUT_OF_RANGE');return Number(n)}
function pow10(n){return 10n**BigInt(n)}
function decimalParts(v){
 const s=String(v??'').trim().replace(',','.'),m=s.match(/^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);if(!m)return null;
 const frac=m[3]||'',exp=Number(m[4]||0);if(!Number.isSafeInteger(exp)||Math.abs(exp)>30||(m[2]+frac).length>40)return null;
 let digits=(m[2]+frac).replace(/^0+(?=\d)/,''),scale=frac.length-exp;if(scale<0){digits+='0'.repeat(-scale);scale=0}
 return {n:BigInt(digits||'0')*(m[1]==='-'?-1n:1n),scale};
}
function roundDiv(n,d){if(d<=0n)throw new Error('MONEY_DIVISOR_INVALID');const sign=n<0n?-1n:1n,a=n<0n?-n:n;let q=a/d,r=a%d;if(r*2n>=d)q++;return q*sign}
function decimalToCents(v){const p=decimalParts(v);if(!p)return 0;return safeNumber(roundDiv(p.n*100n,pow10(p.scale)))}
function decimalProductToCents(a,b){const A=decimalParts(a),B=decimalParts(b);if(!A||!B)return 0;return safeNumber(roundDiv(A.n*B.n*100n,pow10(A.scale+B.scale)))}
function integerCents(v){const s=String(v??'').trim();if(!/^[+-]?\d+$/.test(s))return 0;return safeNumber(BigInt(s))}
function percentOfCents(valueCents,rate){const p=decimalParts(rate);if(!p)return 0;return safeNumber(roundDiv(BigInt(valueCents)*p.n,100n*pow10(p.scale)))}
function addCents(a,b){return safeNumber(BigInt(a)+BigInt(b))}
function sumCents(xs){return safeNumber(xs.reduce((s,x)=>s+BigInt(x),0n))}
function signedTransactionCents(t){return t&&t.amount_cents!=null?integerCents(t.amount_cents):decimalToCents(t&&t.amount)}
function lineNet(l){return decimalProductToCents(l&&l.qty,l&&l.unit)}
function discounted(invoice){
 const lines=Array.isArray(invoice&&invoice.lines)?invoice.lines:[],amounts=lines.map(lineNet),base=sumCents(amounts),type=String(invoice&&invoice.discountType||'none'),value=invoice&&invoice.discountValue;
 if(base<=0)return amounts;let discount=0;
 if(type==='percent')discount=Math.max(0,Math.min(base,percentOfCents(base,value)));
 if(type==='fixed')discount=Math.max(0,Math.min(base,decimalToCents(value)));
 if(discount<=0)return amounts;
 const target=base-discount,B=BigInt(base),T=BigInt(target),parts=amounts.map((x,i)=>{const n=BigInt(x)*T;let c=n/B,r=n%B;if(r<0n){c--;r+=B}return {i,c,r}});
 let rest=BigInt(target)-parts.reduce((s,p)=>s+p.c,0n),order=parts.slice().sort((a,b)=>a.r===b.r?a.i-b.i:(a.r>b.r?-1:1));
 for(let i=0;rest>0n;i++,rest--)order[i%order.length].c++;
 return parts.map(p=>safeNumber(p.c));
}
export function invoiceGrossCents(i){
 if(i&&i.financialSnapshot&&i.financialSnapshot.gross_cents!=null)return integerCents(i.financialSnapshot.gross_cents);
 if(i&&i.importedTotals&&i.importedTotals.gross!=null)return Math.abs(decimalToCents(i.importedTotals.gross))*(i.kind==='credit'?-1:1);
 const nets=discounted(i),lines=i&&i.lines||[],zero=['kor','reverse','icp','exempt'].includes(String(i&&i.taxTreatment||'standard')),net=sumCents(nets),vat=zero?0:nets.reduce((s,x,n)=>addCents(s,percentOfCents(x,lines[n]&&lines[n].vat||0)),0);
 return addCents(net,vat)*(i&&i.kind==='credit'?-1:1);
}
function paymentBankIdentities(v){if(!v||typeof v!=='object')return [];const out=[],seen=new Set(),add=(prefix,value,lower=false)=>{if(value==null)return;let s=String(value).trim();if(!s)return;if(lower)s=s.toLowerCase();const identity=prefix+s;if(!seen.has(identity)){seen.add(identity);out.push(identity)}};for(const id of [v.bankTransactionId,v.bank_transaction_id,v.serverTransactionId,v.server_transaction_id])add('id:',id);for(const fp of [v.bankTransactionFingerprint,v.bank_transaction_fingerprint,v.sourceFingerprint,v.transactionFingerprint,v.transaction_fingerprint])add('fp:',fp,true);return out}
function manualPaymentCents(p){if(p&&p.amount_cents!=null)return Math.abs(integerCents(p.amount_cents));return Math.abs(decimalToCents(p&&p.amount))}
function bankPaymentCents(t){return Math.abs(signedTransactionCents(t))}
function overlapsIdentity(ids,known){return ids.some(x=>known.has(x))}
function addIdentities(ids,known){for(const x of ids)known.add(x)}
export function invoiceOutstandingCents(i,txs=[]){
 const gross=Math.abs(invoiceGrossCents(i)),matched=txs.filter(t=>t&&t.status==='matched'&&t.matchType==='invoice'&&String(t.matchId)===String(i&&i.id)),bankIdentities=new Set(),seenBank=new Set();let bank=0;
 for(const t of matched){const identities=paymentBankIdentities(t),duplicate=identities.length>0&&overlapsIdentity(identities,seenBank);addIdentities(identities,seenBank);addIdentities(identities,bankIdentities);if(duplicate)continue;bank=addCents(bank,bankPaymentCents(t))}
 let manual=0,seenManual=new Set();for(const p of i&&Array.isArray(i.payments)?i.payments:[]){const identities=paymentBankIdentities(p);if(identities.length&&overlapsIdentity(identities,bankIdentities))continue;const duplicate=identities.length>0&&overlapsIdentity(identities,seenManual);addIdentities(identities,seenManual);if(duplicate)continue;manual=addCents(manual,manualPaymentCents(p))}
 return Math.max(0,addCents(gross,-addCents(manual,bank)));
}
export function expenseGrossCents(e){
 if(e&&e.financialSnapshot&&e.financialSnapshot.gross_cents!=null)return integerCents(e.financialSnapshot.gross_cents);
 if(e&&e.grossCents!=null)return integerCents(e.grossCents);
 if(e&&e.gross!=null)return decimalToCents(e.gross);
 const ex=decimalToCents(e&&e.exVat),vat=e&&e.vatAmount!=null?decimalToCents(e.vatAmount):(Array.isArray(e&&e.vatLines)?e.vatLines.reduce((s,x)=>addCents(s,decimalToCents(x&&x.vatAmount)),0):0);return addCents(ex,vat);
}
function dateScore(a,b,c){const day=x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x||''))?Math.floor(Date.parse(x+'T00:00:00Z')/86400000):null,A=day(a),ds=[day(b),day(c)].filter(x=>x!=null);if(A==null||!ds.length)return 0;const d=Math.min(...ds.map(x=>Math.abs(A-x)));return d<=3?5:d<=14?3:d<=45?1:0}
function add(c,n,r){if(n){c.score+=n;c.evidence.push(r)}}
function invoiceCandidate(tx,i,contacts,all){
 const outstanding=invoiceOutstandingCents(i,all);if(outstanding<=2||i.status==='draft')return null;const amount=signedTransactionCents(tx),sign=i.kind==='credit'?-1:1;if(Math.sign(amount)!==sign)return null;const paid=Math.abs(amount),c={target_type:'invoice',target_ref:String(i.id),score:0,evidence:[],amount_relation:'none'};
 if(Math.abs(paid-outstanding)<=2){add(c,40,'exact_amount');c.amount_relation='exact'}else if(paid>0&&paid<outstanding){add(c,25,'partial_amount');c.amount_relation='partial'}else if(paid>outstanding&&paid-outstanding<=100){add(c,10,'small_overpayment');c.amount_relation='over'}else return null;
 const desc=compact([tx.description,tx.bank_reference,tx.end_to_end_id].filter(Boolean).join(' ')),no=compact(i.number),ref=compact(i.paymentReference),end=compact(tx.end_to_end_id),bank=compact(tx.bank_reference);
 if(ref&&(desc.includes(ref)||end===ref||bank===ref))add(c,30,'exact_payment_reference');if(no&&desc.includes(no))add(c,30,'exact_invoice_number');if(end&&i.endToEndId&&end===compact(i.endToEndId))add(c,35,'exact_end_to_end_id');
 const customer=contacts.find(x=>String(x.id)===String(i.customerId))||{},ti=compact(tx.counterparty_iban),ii=compact(customer.iban);if(ti&&ii&&ti===ii)add(c,15,'exact_iban');const s=sim(tx.counterparty_name||tx.description,customer.name);if(s>=.85)add(c,10,'party_name_high_similarity');else if(s>=.6)add(c,6,'party_name_similarity');const ds=dateScore(tx.booking_date,i.issueDate,i.dueDate);if(ds)add(c,ds,'date_proximity');c.score=Math.min(100,c.score);c.outstanding_cents=outstanding;return c;
}
function expenseCandidate(tx,e){const gross=Math.abs(expenseGrossCents(e)),amount=signedTransactionCents(tx),paid=Math.abs(amount);if(!gross||amount>=0)return null;const c={target_type:'expense',target_ref:String(e.id),score:0,evidence:[],amount_relation:'none'};if(Math.abs(paid-gross)<=2){add(c,40,'exact_amount');c.amount_relation='exact'}else if(paid<gross){add(c,20,'partial_amount');c.amount_relation='partial'}else return null;const desc=compact([tx.description,tx.bank_reference,tx.end_to_end_id].filter(Boolean).join(' ')),no=compact(e.invoiceNumber);if(no&&desc.includes(no))add(c,30,'exact_invoice_number');if(compact(e.iban||e.counterpartyIban)&&compact(e.iban||e.counterpartyIban)===compact(tx.counterparty_iban))add(c,15,'exact_iban');const s=sim(tx.counterparty_name||tx.description,e.vendor);if(s>=.85)add(c,10,'party_name_high_similarity');else if(s>=.6)add(c,6,'party_name_similarity');const ds=dateScore(tx.booking_date,e.date,e.dueDate);if(ds)add(c,ds,'date_proximity');c.score=Math.min(100,c.score);return c}
export function matchTransactionAgainstLedger(tx,ledger){const contacts=Array.isArray(ledger&&ledger.contacts)?ledger.contacts:[],all=Array.isArray(ledger&&ledger.transactions)?ledger.transactions:[],c=[];for(const i of Array.isArray(ledger&&ledger.invoices)?ledger.invoices:[]){const x=invoiceCandidate(tx,i,contacts,all);if(x)c.push(x)}for(const e of Array.isArray(ledger&&ledger.expenses)?ledger.expenses:[]){const x=expenseCandidate(tx,e);if(x)c.push(x)}c.sort((a,b)=>b.score-a.score||a.target_type.localeCompare(b.target_type)||a.target_ref.localeCompare(b.target_ref));const best=c[0]||null,second=c[1]||null,gap=second?best.score-second.score:100;if(best&&second&&best.score>=40&&second.score>=40&&gap<15)return {state:'ambiguous',score:best.score,best,candidates:c.slice(0,5)};if(!best||best.score<45)return {state:'unmatched',score:best?best.score:0,best:null,candidates:c.slice(0,5)};if(second&&second.score>=45&&gap<15)return {state:'ambiguous',score:best.score,best,candidates:c.slice(0,5)};return {state:best.score>=80?'exact/high-confidence':'suggested',score:best.score,best,candidates:c.slice(0,5)}}
export function batchMatchTransactions(txs,ledger){return (txs||[]).map(tx=>({transaction_id:tx.id||tx.transaction_id,...matchTransactionAgainstLedger(tx,ledger)}))}
export const normalizedPartySimilarity=sim;
