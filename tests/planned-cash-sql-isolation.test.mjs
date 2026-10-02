import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Execute production SQL in local PostgreSQL. Auth UID and entitlement session
// claims are fixture inputs; RLS, triggers and the versioned RPC are real SQL.
const db=new PGlite();
const read=name=>fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const schema=read('20260926081916_create_kwinest_core.sql');
const history=read('20260926084114_add_ledger_history_and_mfa_guard.sql');
const entitlement=read('20260928000656_early_access_entitlement_state_machine.sql');
const recurrence=process.env.PLANNED_CASH_MIGRATION?fs.readFileSync(process.env.PLANNED_CASH_MIGRATION,'utf8'):read('20261001234000_planned_cash_recurrence.sql');
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
const legacy={plannedCash:[{id:'old',type:'out',amount:5,date:'2026-01-31',description:'Historical plan'}],invoices:[{id:'unchanged',number:'2026-0001',status:'sent'}]};
async function actor(id,allowed=true){await db.exec('reset role');await db.query("select set_config('test.uid',$1,false),set_config('test.operable',$2,false)",[id,String(allowed)]);await db.exec('set role authenticated')}
async function save(version,state){return (await db.query('select public.save_ledger_state($1,$2::jsonb) as version',[version,JSON.stringify(state)])).rows[0].version}
try{
 await db.exec(`create role authenticated;create role anon;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table auth.users(id uuid primary key);
 create table public.ledger_state(user_id uuid primary key references auth.users(id),state jsonb not null,version bigint not null default 1,updated_at timestamptz default now());
 alter table public.ledger_state enable row level security;
 grant usage on schema public,auth to authenticated;
 grant select,insert,update,delete on public.ledger_state to authenticated;
 create function public.can_operate_bookkeeping() returns boolean language sql stable as $$select coalesce(current_setting('test.operable',true),'false')='true'$$;`);
 const policies=schema.slice(schema.indexOf('drop policy if exists "ledger_select_own"'),schema.indexOf('drop policy if exists "documents_select_own"'));
 await db.exec(policies);
 await db.exec(history.slice(0,history.indexOf('create or replace function public.save_ledger_state(')));
 await db.exec('grant select,insert,update,delete on public.ledger_revisions to authenticated');
 await db.exec(entitlement.slice(entitlement.indexOf('create or replace function public.save_ledger_state('),entitlement.indexOf('create or replace function public.restore_ledger_revision(')));
 await db.exec('revoke all on function public.save_ledger_state(bigint,jsonb) from public,anon;grant execute on function public.save_ledger_state(bigint,jsonb) to authenticated');
 await db.query('insert into auth.users values ($1),($2)',[a,b]);
 await db.query('insert into public.ledger_state(user_id,state) values ($1,$3::jsonb),($2,$3::jsonb)',[a,b,JSON.stringify(legacy)]);
 await db.exec(recurrence);
 await db.exec(recurrence); // Replay is safe and does not double the schedules.
 const migrated=(await db.query('select * from public.ledger_state order by user_id')).rows;
 assert.equal(migrated[0].version,1);
 assert.deepEqual(migrated[0].state,{...legacy,plannedCash:[{...legacy.plannedCash[0],repeating:'oneoff'}]});
 await actor(a);
 assert.deepEqual((await db.query('select user_id from public.ledger_state')).rows,[{user_id:a}]);
 assert.equal((await db.query('update public.ledger_state set state=state where user_id=$1 returning user_id',[b])).rows.length,0,'Cross-tenant update denied');
 assert.equal((await db.query('delete from public.ledger_state where user_id=$1 returning user_id',[b])).rows.length,0,'Cross-tenant delete denied');
 await assert.rejects(db.query('update public.ledger_state set user_id=$1 where user_id=$2',[b,a]),/row-level security/,'Owner transfer denied');
 await assert.rejects(db.query('insert into public.ledger_state values ($1,$2::jsonb,1,now())',[b,JSON.stringify(legacy)]),/row-level security/,'Cross-tenant insert denied');
 const plan={id:'monthly',type:'out',date:'2026-01-31',amount:100.55,repeating:'monthly',description:'Monthly rent'};
 assert.equal(await save(1,{...legacy,plannedCash:[plan]}),2);
 assert.equal(await save(1,{...legacy,plannedCash:[]}),null,'Stale RPC cannot replace new schedule');
 assert.deepEqual((await db.query('select state from public.ledger_state')).rows[0].state.plannedCash,[plan]);
 const invalid=[{...plan,repeating:'daily'},{...plan,date:'2026-02-31'},{...plan,amount:-1},{...plan,amount:'100'},{...plan,type:'other'}];
 for(const item of invalid)await assert.rejects(save(2,{plannedCash:[item]}),/recurrence|planned cash|invalid input/i);
 await assert.rejects(save(2,{plannedCash:{bad:'shape'}}),/array/);
 await assert.rejects(save(2,{plannedCash:[null]}),/object/);
 assert.equal((await db.query('select version from public.ledger_state')).rows[0].version,2,'Invalid input rolls back atomically');
 await actor(a,false);await assert.rejects(save(2,{plannedCash:[]}),/ACCOUNT_READ_ONLY/);
 await actor(b);
 assert.equal((await db.query('select state from public.ledger_state')).rows[0].state.plannedCash[0].id,'old','Other tenant untouched');
 assert.equal(await save(1,{plannedCash:[{...plan,id:'weekly',repeating:'weekly'}]}),2);
 await actor(a);assert.equal((await db.query('select state from public.ledger_state')).rows[0].state.plannedCash[0].id,'monthly');
 assert.equal(await save(2,{...legacy,plannedCash:[]}),3,'Owner deletes its own recurring schedule');
 assert.equal((await db.query('select state from public.ledger_state')).rows[0].state.plannedCash.length,0);
 assert.equal((await db.query('delete from public.ledger_state where user_id=$1 returning user_id',[a])).rows.length,1,'Owner delete allowed');
 console.log('Planned cash local PostgreSQL: PASS (migration replay, legacy data, two-account CRUD/RLS, RPC versioning, rollback, read-only guard)');
}finally{await db.close()}
