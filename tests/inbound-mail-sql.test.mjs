import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Bonnen mailen (Kwin 2026-11-04): the production migration in local PostgreSQL.
// auth.uid() and the plan are fixture inputs; tables, RLS and the RPCs are the real SQL.
const db=new PGlite();
const sql=fs.readFileSync(new URL('../supabase/migrations/20261104140000_inbound_mail.sql',import.meta.url),'utf8');
const a='00000000-0000-4000-8000-00000000000a',b='00000000-0000-4000-8000-00000000000b',start='00000000-0000-4000-8000-00000000000c';
async function as(id){await db.exec('reset role');await db.query("select set_config('test.uid',$1,false)",[id||'']);await db.exec('set role '+(id?'authenticated':'anon'))}
async function asService(){await db.exec('reset role');await db.query("select set_config('test.uid','',false)");await db.exec('set role service_role')}
const mine=(hint,company,create=false,rotate=false)=>db.query('select public.inbound_address_mine($1,$2::jsonb,$3,$4) as local',[hint,JSON.stringify(company||{}),create,rotate]).then(r=>r.rows[0].local);
try{
 await db.exec(`create role authenticated;create role anon;create role service_role bypassrls;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table auth.users(id uuid primary key);
 create table public.paid(user_id uuid primary key);
 create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text,updated_at timestamptz default now());
 insert into vault.decrypted_secrets(name,decrypted_secret) values ('inbound_mail_resend_api_key','re_fixture'),('inbound_mail_webhook_secret','whsec_fixture');
 create function private.entitlement_state_for_user(p_user_id uuid) returns text language sql stable security definer set search_path='' as $$select case when exists(select 1 from public.paid where user_id=p_user_id) then 'paid' else 'free' end$$;
 grant usage on schema public,auth,private to authenticated,anon,service_role;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;`);
 await db.query('insert into auth.users values ($1),($2),($3)',[a,b,start]);
 await db.query('insert into public.paid values ($1),($2)',[a,b]);
 await db.exec(sql);
 await db.exec(sql); // a replay is safe

 await as(a);
 assert.equal(await mine('Kwin Studio',{}),null,'Reading never creates an address');
 const first=await mine('Kwin Stüdio B.V.',{name:'Kwin Studio',kvk:'12345678',vat:'NL001',extra:'x'.repeat(500)},true);
 assert.match(first,/^kwinstudiobv-[0-9a-f]{12}$/,'A readable start and a random tail: '+first);
 assert.equal(await mine('',{name:'Kwin Studio'},true),first,'One active address per account');
 assert.equal(await mine('',{name:'Kwin Studio Nieuw'}),first);
 const own=(await db.query('select local_part,company_context from public.inbound_addresses')).rows;
 assert.equal(own.length,1);assert.deepEqual(own[0].company_context,{name:'Kwin Studio Nieuw',tradeName:'',kvk:'',vat:''},'Company details are refreshed and trimmed to known keys');
 await assert.rejects(db.query("insert into public.inbound_addresses(user_id,local_part) values ($1,'stolen-abcdef')",[a]),/permission denied/,'No direct insert');
 await assert.rejects(db.query('update public.inbound_addresses set local_part=$1',['mine-abcdef']),/permission denied/,'No direct update');
 const second=await mine('Kwin',{},false,true);
 assert.notEqual(second,first,'Nieuw adres gives a new address');assert.match(second,/^kwin-[0-9a-f]{12}$/);
 assert.equal((await db.query('select count(*)::int as n from public.inbound_addresses where revoked_at is null')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int as n from public.inbound_addresses')).rows[0].n,2,'The old address stays revoked, not deleted');
 assert.equal(await mine('',{},true),second);
 assert.equal(await mine('!!',{},false,true).then(v=>v.split('-')[0]),'bon','No usable hint: bon-…');

 await as(b);
 assert.equal((await db.query('select * from public.inbound_addresses')).rows.length,0,'Another account sees nothing');
 assert.equal((await db.query('select * from public.inbound_mail_events')).rows.length,0);
 const other=await mine('B',{},true);assert.ok(other);
 await assert.rejects(db.query("select * from public.inbound_mail_target($1)",[other]),/permission denied/,'Users cannot look up addresses');

 await as(start);
 await assert.rejects(mine('Start',{},true),/PLAN_REQUIRED/,'Start has no bookkeeping, so no address');
 assert.equal(await mine('Start',{}),null);
 await as(null);
 await assert.rejects(mine('x',{},true),/permission denied|AUTH_REQUIRED/,'Not signed in: nothing');

 await as(a);
 await assert.rejects(db.query('select * from public.inbound_mail_secrets()'),/permission denied/,'Users cannot read the mail secrets');
 await asService();
 assert.deepEqual((await db.query('select * from public.inbound_mail_secrets()')).rows,[{resend_api_key:'re_fixture',webhook_secret:'whsec_fixture'}],'The edge function reads them from Vault');
 const active=(await db.query('select local_part from public.inbound_addresses where user_id=$1 and revoked_at is null',[a])).rows[0].local_part;
 assert.deepEqual((await db.query('select user_id,entitled,company_context->>$2 as name from public.inbound_mail_target($1)',[active.toUpperCase(),'name'])).rows,[{user_id:a,entitled:true,name:''}],'Address is found case-insensitively');
 assert.equal((await db.query('select * from public.inbound_mail_target($1)',[first])).rows.length,0,'A revoked address finds nobody');
 await db.exec('reset role');await db.query('delete from public.paid where user_id=$1',[a]);await asService();
 assert.equal((await db.query('select entitled from public.inbound_mail_target($1)',[active])).rows[0].entitled,false,'Plan ended: mail is not stored');
 await db.query("insert into public.inbound_mail_events(email_id,local_part,user_id,outcome) values ('e1',$1,$2,'stored')",[active,a]);
 await assert.rejects(db.query("insert into public.inbound_mail_events(email_id,local_part) values ('e1',$1)",[active]),/duplicate key/,'A replayed webhook cannot claim the same mail twice');
 await assert.rejects(db.query("update public.inbound_mail_events set outcome='spam'"),/check constraint/);
 await as(a);
 assert.equal((await db.query('select outcome from public.inbound_mail_events')).rows[0].outcome,'stored','The owner can see what arrived');
 await as(b);
 assert.equal((await db.query('select * from public.inbound_mail_events')).rows.length,0);
 console.log('Inbound mail SQL: addresses, rotation, plan gate, RLS and replay: PASS');
}finally{await db.close()}
