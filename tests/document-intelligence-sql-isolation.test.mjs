import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),read=n=>fs.readFileSync(new URL('../supabase/migrations/'+n,import.meta.url),'utf8');
const schema=read('20260926081916_create_kwinest_core.sql'),history=read('20260926084114_add_ledger_history_and_mfa_guard.sql'),entitlement=read('20260928000656_early_access_entitlement_state_machine.sql');
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
const context={crypto:webcrypto,TextEncoder};context.globalThis=context;
vm.runInNewContext(fs.readFileSync(new URL('../public/assets/document-intelligence.js',import.meta.url),'utf8'),context);
const I=context.BoekunaDocumentIntelligence;
async function actor(id,allowed=true){await db.exec('reset role');await db.query("select set_config('test.uid',$1,false),set_config('test.operable',$2,false)",[id,String(allowed)]);await db.exec('set role authenticated')}
async function save(version,state){return (await db.query('select public.save_ledger_state($1,$2::jsonb) as version',[version,JSON.stringify(state)])).rows[0].version}
try{
 await db.exec(`create role authenticated;create role anon;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table auth.users(id uuid primary key);
 create table public.ledger_state(user_id uuid primary key references auth.users(id) on delete cascade,state jsonb not null,version bigint not null default 1,updated_at timestamptz default now());
 alter table public.ledger_state enable row level security;
 grant usage on schema public,auth to authenticated;
 grant select,insert,update,delete on public.ledger_state to authenticated;
 create function public.can_operate_bookkeeping() returns boolean language sql stable as $$select coalesce(current_setting('test.operable',true),'false')='true'$$;`);
 await db.exec(schema.slice(schema.indexOf('drop policy if exists "ledger_select_own"'),schema.indexOf('drop policy if exists "documents_select_own"')));
 await db.exec(history.slice(0,history.indexOf('create or replace function public.save_ledger_state(')));
 await db.exec('grant select,insert,update,delete on public.ledger_revisions to authenticated');
 await db.exec(entitlement.slice(entitlement.indexOf('create or replace function public.save_ledger_state('),entitlement.indexOf('create or replace function public.restore_ledger_revision(')));
 await db.exec('revoke all on function public.save_ledger_state(bigint,jsonb) from public,anon;grant execute on function public.save_ledger_state(bigint,jsonb) to authenticated');
 await db.query('insert into auth.users values ($1),($2)',[a,b]);
 await db.query('insert into public.ledger_state(user_id,state) values ($1,$3::jsonb),($2,$3::jsonb)',[a,b,JSON.stringify({})]);
 const memory=I.create(a),d={party:'Synthetic Supplier',vatId:'NL123456789B01',currency:'EUR',vatRate:21};
 await I.recordFeedback(memory,a,d,d,'doc-one');
 await actor(a);assert.equal(await save(1,{documentIntelligence:memory}),2);
 const stored=(await db.query('select state from public.ledger_state')).rows[0].state;
 assert.equal(stored.documentIntelligence.feedback.length,1);
 assert.equal(await save(1,{documentIntelligence:I.create(a)}),null,'Stale learning cannot overwrite current state');
 await actor(b);assert.deepEqual((await db.query('select state from public.ledger_state')).rows[0].state,{},'B cannot receive A learning');
 assert.equal((await db.query('update public.ledger_state set state=$1::jsonb where user_id=$2 returning user_id',[JSON.stringify({documentIntelligence:I.create(b)}),a])).rows.length,0,'B cannot modify A learning');
 assert.equal((await db.query('delete from public.ledger_state where user_id=$1 returning user_id',[a])).rows.length,0,'B cannot forget A learning');
 await actor(a,false);await assert.rejects(save(2,{documentIntelligence:I.create(a)}),/ACCOUNT_READ_ONLY/);
 await actor(a);I.forget(memory,a);assert.equal(await save(2,{documentIntelligence:memory}),3);
 assert.equal((await db.query('select state from public.ledger_state')).rows[0].state.documentIntelligence.feedback.length,0);
 await db.exec('reset role');await db.query('delete from auth.users where id=$1',[a]);
 assert.equal((await db.query('select * from public.ledger_state where user_id=$1',[a])).rows.length,0,'Deleting account cascades its memory');
 console.log('Document intelligence PostgreSQL: PASS (A/B ownership, stale writes, read-only, forget, account deletion)');
}finally{await db.close()}
