import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { invoiceOutstandingCents, matchTransactionAgainstLedger } from '../supabase/functions/financial-automation/lib/matching.mjs';
import { declaration } from './production-code.mjs';

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

const invoice={id:'inv-66',kind:'invoice',status:'sent',number:'INV-66',paymentReference:'PAY-66',issueDate:'2026-09-01',dueDate:'2026-09-30',lines:[{qty:1,unit:100,vat:21}],payments:[]};
const bank=(id,amountCents=5000,fp='fp-'+id)=>({
  id:'local-'+id,
  serverTransactionId:id,
  sourceFingerprint:fp,
  status:'matched',
  matchType:'invoice',
  matchId:'inv-66',
  amount_cents:amountCents,
  booking_date:'2026-09-29',
  description:'PAY-66',
  counterparty_name:'Acme BV'
});

run('manual-only €50 -> €71 outstanding',()=>{
  assert.equal(invoiceOutstandingCents({...invoice,payments:[{id:'m1',amount:50}]},[]),7100);
});
run('bank-only €50 -> €71 outstanding',()=>{
  assert.equal(invoiceOutstandingCents(invoice,[bank('bt-only')]),7100);
});
run('ID-linked manual+bank -> €71',()=>{
  const inv={...invoice,payments:[{id:'m1',amount:50,bankTransactionId:'bt-id'}]};
  assert.equal(invoiceOutstandingCents(inv,[bank('bt-id',5000,'fp-id')]),7100);
});
run('fingerprint-only manual + bank with same fingerprint + server ID -> €71',()=>{
  const inv={...invoice,payments:[{id:'m1',amount:50,bankTransactionFingerprint:'economic-fp'}]};
  assert.equal(invoiceOutstandingCents(inv,[bank('bt-fp',5000,'economic-fp')]),7100);
});
run('unlinked manual €50 + separate bank €50 -> €21',()=>{
  const inv={...invoice,payments:[{id:'m1',amount:50}]};
  assert.equal(invoiceOutstandingCents(inv,[bank('bt-separate',5000,'fp-separate')]),2100);
});
run('two different bank payments remain separate',()=>{
  assert.equal(invoiceOutstandingCents(invoice,[bank('bt-a',5000,'fp-a'),bank('bt-b',5000,'fp-b')]),2100);
});
run('two bank mirrors with same fingerprint count once',()=>{
  assert.equal(invoiceOutstandingCents(invoice,[bank('bt-a',5000,'shared-fp'),bank('bt-b',5000,'shared-fp')]),7100);
});
run('two bank mirrors with same serverTransactionId count once',()=>{
  assert.equal(invoiceOutstandingCents(invoice,[bank('same-id',5000,'fp-a'),bank('same-id',5000,'fp-b')]),7100);
});
run('linked €50 + separate €20 -> €51',()=>{
  const inv={...invoice,payments:[{id:'m1',amount:50,bankTransactionFingerprint:'linked-fp'}]};
  assert.equal(invoiceOutstandingCents(inv,[bank('bt-linked',5000,'linked-fp'),bank('bt-extra',2000,'extra-fp')]),5100);
});
run('multiple manual partials remain additive',()=>{
  const inv={...invoice,payments:[{id:'m1',amount:25},{id:'m2',amount:25}]};
  assert.equal(invoiceOutstandingCents(inv,[]),7100);
});
run('full payment -> zero',()=>{
  assert.equal(invoiceOutstandingCents({...invoice,payments:[{id:'m1',amount:121}]},[]),0);
});
run('€120.99 -> one cent',()=>{
  assert.equal(invoiceOutstandingCents({...invoice,payments:[{id:'m1',amount:120.99}]},[]),1);
});
run('overpayment -> zero not negative',()=>{
  assert.equal(invoiceOutstandingCents({...invoice,payments:[{id:'m1',amount:150}]},[]),0);
});
run('creditnote/refund respects explicit fingerprint identity',()=>{
  const credit={id:'cr-66',kind:'credit',status:'sent',lines:[{qty:1,unit:100,vat:21}],payments:[{id:'refund-manual',amount:50,bankTransactionFingerprint:'refund-fp'}]};
  const refund={serverTransactionId:'refund-bank',sourceFingerprint:'refund-fp',status:'matched',matchType:'invoice',matchId:'cr-66',amount_cents:-5000};
  assert.equal(invoiceOutstandingCents(credit,[refund]),7100);
});
run('duplicate manual representations sharing explicit fingerprint count once',()=>{
  const inv={...invoice,payments:[
    {id:'m1',amount:50,bankTransactionFingerprint:'same-manual-fp'},
    {id:'m2',amount:50,bankTransactionFingerprint:'same-manual-fp'}
  ]};
  assert.equal(invoiceOutstandingCents(inv,[]),7100);
});
run('same amount/date without explicit identity is never heuristic-deduped',()=>{
  const inv={...invoice,payments:[
    {id:'m1',amount:50,date:'2026-09-29'},
    {id:'m2',amount:50,date:'2026-09-29'}
  ]};
  assert.equal(invoiceOutstandingCents(inv,[]),2100);
});

// Relevant matching regressions: partial remains suggested; exact evidence remains high-confidence;
// existing matched economic payment is excluded from outstanding before scoring the next tx.
run('partial bank payment remains suggested',()=>{
  const ledger={contacts:[{id:'c1',name:'Acme BV'}],invoices:[{...invoice,customerId:'c1'}],expenses:[],transactions:[]};
  const m=matchTransactionAgainstLedger({amount_cents:5000,booking_date:'2026-09-29',description:'PAY-66',counterparty_name:'Acme BV'},ledger);
  assert.equal(m.state,'suggested');
  assert.ok(m.best?.evidence.includes('partial_amount'));
});
run('exact payment evidence remains high-confidence',()=>{
  const ledger={contacts:[{id:'c1',name:'Acme BV'}],invoices:[{...invoice,customerId:'c1'}],expenses:[],transactions:[]};
  const m=matchTransactionAgainstLedger({amount_cents:12100,booking_date:'2026-09-29',description:'INV-66 PAY-66',bank_reference:'PAY-66',counterparty_name:'Acme BV'},ledger);
  assert.equal(m.state,'exact/high-confidence');
});

// Execute exact production nextLedger + confirm declarations from the target source.
const source=fs.readFileSync(new URL('../supabase/functions/financial-automation/index.ts',import.meta.url),'utf8');
const nextLedgerDecl=declaration(source,'nextLedger');
const confirmDecl=declaration(source,'confirm');

const baseLedger={
  invoices:[{...invoice,payments:[{id:'manual-link',amount:50}]}],
  expenses:[],
  transactions:[]
};
const tx={
  id:'11111111-1111-4111-8111-111111111111',
  transaction_fingerprint:'ABCDEF012345',
  booking_date:'2026-09-29',
  amount_cents:5000,
  description:'PAY-66',
  counterparty_name:'Acme BV',
  status:'suggested'
};

run('manual_payment_id linking stores both bankTransactionId and bankTransactionFingerprint',()=>{
  const context=vm.createContext({structuredClone,invoiceOutstandingCents});
  vm.runInContext(nextLedgerDecl,context);
  const next=vm.runInContext(`nextLedger(${JSON.stringify(baseLedger)},${JSON.stringify(tx)},'invoice','inv-66','manual-link')`,context);
  const payment=next.invoices[0].payments[0];
  assert.equal(payment.bankTransactionId,tx.id);
  assert.equal(payment.bankTransactionFingerprint,tx.transaction_fingerprint);
  assert.equal(next.invoices[0].status,'sent');
  assert.equal(invoiceOutstandingCents(next.invoices[0],next.transactions),7100);
});

run('save/reopen JSON roundtrip preserves both identities and €71 outstanding',()=>{
  const context=vm.createContext({structuredClone,invoiceOutstandingCents});
  vm.runInContext(nextLedgerDecl,context);
  const next=vm.runInContext(`nextLedger(${JSON.stringify(baseLedger)},${JSON.stringify(tx)},'invoice','inv-66','manual-link')`,context);
  const reopened=JSON.parse(JSON.stringify(next));
  const payment=reopened.invoices[0].payments[0];
  assert.equal(payment.bankTransactionId,tx.id);
  assert.equal(payment.bankTransactionFingerprint,tx.transaction_fingerprint);
  assert.equal(reopened.transactions[0].serverTransactionId,tx.id);
  assert.equal(reopened.transactions[0].sourceFingerprint,tx.transaction_fingerprint);
  assert.equal(invoiceOutstandingCents(reopened.invoices[0],reopened.transactions),7100);
});

await runAsync('match_confirm persists linked identities and repeated confirm is rejected',async()=>{
  let currentTx={...tx};
  let serverState=structuredClone(baseLedger);
  let serverVersion=7;
  let capturedState=null;
  const chain={
    select(){return this},eq(){return this},
    async single(){return {data:structuredClone(currentTx),error:null}}
  };
  const admin={
    from(name){assert.equal(name,'bank_transactions');return chain},
    async rpc(name,args){
      assert.equal(name,'commit_financial_bank_match');
      capturedState=structuredClone(args.p_state);
      serverState=structuredClone(args.p_state);
      serverVersion+=1;
      currentTx={...currentTx,status:'matched'};
      return {data:serverVersion,error:null};
    }
  };
  const ledger=async()=>({state:structuredClone(serverState),version:serverVersion});
  const safe=(v,n=240)=>String(v??'').slice(0,n);
  const context=vm.createContext({
    structuredClone,invoiceOutstandingCents,matchTransactionAgainstLedger,
    admin,ledger,safe
  });
  vm.runInContext(nextLedgerDecl+'\n'+confirmDecl,context);
  const sb={};
  const body={transaction_id:tx.id,target_type:'invoice',target_ref:'inv-66',manual_payment_id:'manual-link'};
  const first=await vm.runInContext(`confirm('user-1',sb,${JSON.stringify(body)})`,Object.assign(context,{sb}));
  assert.equal(first.state,'manually_matched');
  assert.equal(capturedState.invoices[0].payments[0].bankTransactionId,tx.id);
  assert.equal(capturedState.invoices[0].payments[0].bankTransactionFingerprint,tx.transaction_fingerprint);
  assert.equal(invoiceOutstandingCents(capturedState.invoices[0],capturedState.transactions),7100);
  await assert.rejects(()=>vm.runInContext(`confirm('user-1',sb,${JSON.stringify(body)})`,context),/MATCH_ALREADY_CONFIRMED/);
});

await runAsync('stale ledger version returns conflict and does not mutate authoritative state',async()=>{
  const staleTx={...tx,id:'22222222-2222-4222-8222-222222222222',transaction_fingerprint:'STALE-FP',status:'suggested'};
  const authoritative=structuredClone(baseLedger);
  const before=JSON.stringify(authoritative);
  const chain={select(){return this},eq(){return this},async single(){return {data:structuredClone(staleTx),error:null}}};
  const admin={
    from(name){assert.equal(name,'bank_transactions');return chain},
    async rpc(name,args){
      assert.equal(name,'commit_financial_bank_match');
      assert.equal(args.p_expected_version,9);
      return {data:null,error:null};
    }
  };
  const ledger=async()=>({state:structuredClone(authoritative),version:9});
  const safe=(v,n=240)=>String(v??'').slice(0,n);
  const context=vm.createContext({structuredClone,invoiceOutstandingCents,matchTransactionAgainstLedger,admin,ledger,safe});
  vm.runInContext(nextLedgerDecl+'\n'+confirmDecl,context);
  context.sb={};
  const body={transaction_id:staleTx.id,target_type:'invoice',target_ref:'inv-66',manual_payment_id:'manual-link'};
  await assert.rejects(()=>vm.runInContext(`confirm('user-1',sb,${JSON.stringify(body)})`,context),/LEDGER_VERSION_CONFLICT/);
  assert.equal(JSON.stringify(authoritative),before);
});

// Verify the exact migration used by the target still protects the ledger update with the expected version.
run('atomic match migration keeps stale-version guard before transaction/match mutation',()=>{
  const migration=fs.readFileSync(new URL('../supabase/migrations/20260928235358_financial_automation_match_commit.sql',import.meta.url),'utf8');
  assert.ok(migration.includes('where user_id=p_user_id and version=p_expected_version for update'));
  assert.ok(migration.includes('where user_id=p_user_id and version=p_expected_version returning version into v_new_version'));
  const ledgerUpdate=migration.indexOf('update public.ledger_state');
  const matchInsert=migration.indexOf('insert into public.transaction_matches');
  const bankUpdate=migration.indexOf('update public.bank_transactions');
  assert.ok(ledgerUpdate>=0&&matchInsert>ledgerUpdate&&bankUpdate>matchInsert);
});

console.log('03A_ISSUE66_PASS '+JSON.stringify(pass));
if(fail.length){
  console.error('03A_ISSUE66_FAIL '+JSON.stringify(fail));
  process.exitCode=1;
}else{
  console.log('03A issue #66 independent retest: PASS');
}
