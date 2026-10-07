import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const migration=fs.readFileSync('supabase/migrations/20261007101500_tester_invite_code_access.sql','utf8');
const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const C='00000000-0000-4000-8000-000000000003';
const D='00000000-0000-4000-8000-000000000004';
const E='00000000-0000-4000-8000-000000000005';
const F='00000000-0000-4000-8000-000000000006';

async function actor(id){
  await db.exec('reset role');
  await db.query("select set_config('test.uid',$1,false)",[id]);
  await db.exec('set role authenticated');
}
async function service(){
  await db.exec('reset role');
  await db.query("select set_config('test.uid','',false)");
  await db.exec('set role service_role');
}
async function redeem(code){
  return (await db.query('select public.redeem_tester_invite_code($1) as result',[code])).rows[0].result;
}
async function effective(userId){
  await service();
  return (await db.query('select public.billing_effective_plan($1) as plan',[userId])).rows[0].plan;
}

try{
  await db.exec([
    "create role anon;",
    "create role authenticated;",
    "create role service_role;",
    "create schema auth;",
    "create schema private;",
    "create schema extensions;",
    "create table auth.users(id uuid primary key,email_confirmed_at timestamptz);",
    "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;",
    "create function extensions.gen_random_bytes(n integer) returns bytea language sql volatile as $$ select decode(substr(md5(random()::text||clock_timestamp()::text),1,greatest(2,n*2)),'hex') $$;",
    "create function extensions.digest(value bytea, algorithm text) returns bytea language sql immutable as $$ select decode(md5(encode(value,'hex')||algorithm),'hex') $$;",
    "create table public.internal_access_grants(user_id uuid primary key references auth.users(id),plan text not null,active boolean not null default true);",
    "create table public.billing_accounts(user_id uuid primary key references auth.users(id),stripe_customer_id text,stripe_subscription_id text,plan text not null default 'free',status text not null default 'free',current_period_end timestamptz,cancel_at_period_end boolean not null default false);",
    "create table public.billing_entitlements(user_id uuid not null references auth.users(id),provider text not null,external_customer_ref text,external_subscription_ref text,plan text not null,provider_status text not null,access_state text not null,valid_until timestamptz,cancel_at_period_end boolean not null default false,provider_event_created bigint not null default 0,provider_event_id text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(user_id,provider));",
    "create table public.billing_usage_monthly(user_id uuid not null,month_start date not null,feature text not null,usage_count integer not null default 0,primary key(user_id,month_start,feature));",
    "create function public.apply_subscription_entitlement(p_user_id uuid,p_provider text,p_external_customer_ref text,p_external_subscription_ref text,p_plan text,p_provider_status text,p_access_state text,p_valid_until timestamptz,p_cancel_at_period_end boolean,p_event_created bigint,p_event_id text) returns boolean language plpgsql security definer set search_path='' as $$ begin insert into public.billing_entitlements(user_id,provider,external_customer_ref,external_subscription_ref,plan,provider_status,access_state,valid_until,cancel_at_period_end,provider_event_created,provider_event_id,updated_at) values(p_user_id,p_provider,p_external_customer_ref,p_external_subscription_ref,p_plan,p_provider_status,p_access_state,p_valid_until,coalesce(p_cancel_at_period_end,false),p_event_created,p_event_id,now()) on conflict(user_id,provider) do update set external_customer_ref=excluded.external_customer_ref,external_subscription_ref=excluded.external_subscription_ref,plan=excluded.plan,provider_status=excluded.provider_status,access_state=excluded.access_state,valid_until=excluded.valid_until,cancel_at_period_end=excluded.cancel_at_period_end,provider_event_created=excluded.provider_event_created,provider_event_id=excluded.provider_event_id,updated_at=now(); return true; end $$;",
    "create function private.entitlement_state_for_user(p_user_id uuid) returns text language sql stable security definer set search_path='' as $$ select case when exists(select 1 from public.billing_entitlements e where e.user_id=p_user_id and e.plan in ('boekuna','pro') and e.access_state in ('active','grace') and e.valid_until>now()) then 'paid' else 'free' end $$;",
    "create function public.billing_effective_plan(p_user_id uuid) returns text language sql stable security definer set search_path='' as $$ select coalesce((select e.plan from public.billing_entitlements e where e.user_id=p_user_id and e.plan in ('boekuna','pro') and e.access_state in ('active','grace') and e.valid_until>now() order by case when e.plan='pro' then 0 else 1 end,case when e.provider='stripe' then 0 else 1 end,e.valid_until desc limit 1),'free') $$;",
    "create function public.billing_plan_limit(p_plan text) returns integer language sql immutable as $$ select case when p_plan='boekuna' then 100 when p_plan='pro' then null else 10 end $$;",
    "grant usage on schema public,auth,private to authenticated,service_role;",
    "grant select on auth.users to authenticated,service_role;",
    "grant execute on function public.billing_effective_plan(uuid) to service_role;"
  ].join('\n'));

  await db.query("insert into auth.users(id,email_confirmed_at) values ($1,now()),($2,now()),($3,null),($4,now()),($5,now()),($6,now())",[A,B,C,D,E,F]);
  await db.exec(migration);

  const columns=(await db.query("select column_name from information_schema.columns where table_schema='private' and table_name='tester_invite_codes' order by ordinal_position")).rows.map(x=>x.column_name);
  assert.ok(columns.includes('code_hash'));
  assert.ok(!columns.includes('code'),'plaintext code must not be stored');

  await service();
  const generated=(await db.query("select * from public.generate_tester_invite_codes(3,'beta-wave-1',30,null)")).rows;
  assert.equal(generated.length,3);
  assert.equal(new Set(generated.map(x=>x.code)).size,3);
  for(const row of generated){
    assert.match(row.code,/^BOEKUNA-[A-HJ-NP-Z2-9]{16}$/);
    assert.equal(Number(row.duration_days),30);
    assert.equal(row.campaign,'beta-wave-1');
  }
  const [codeA,codeB]=generated.map(x=>x.code);

  await actor(A);
  const first=await redeem(codeA);
  assert.equal(first.ok,true);
  assert.equal(first.plan,'boekuna');
  assert.equal(first.access_source,'tester_code');
  assert.equal(first.idempotent,false);
  const activated=new Date(first.activated_at).getTime();
  const expires=new Date(first.expires_at).getTime();
  assert.ok(Math.abs((expires-activated)-(30*24*60*60*1000))<1000);

  const entitlement=(await db.query("select provider,plan,access_state,valid_until from public.billing_entitlements where user_id=$1 and provider='tester_code'",[A])).rows[0];
  assert.equal(entitlement.provider,'tester_code');
  assert.equal(entitlement.plan,'boekuna');
  assert.equal(entitlement.access_state,'active');
  assert.equal(new Date(entitlement.valid_until).getTime(),expires);

  const retry=await redeem(codeA);
  assert.equal(retry.ok,true);
  assert.equal(retry.idempotent,true);
  assert.equal(new Date(retry.expires_at).getTime(),expires);

  const stacking=await redeem(codeB);
  assert.equal(stacking.ok,false);
  assert.equal(stacking.code,'ACCOUNT_TEST_ALREADY_USED');

  await actor(B);
  const used=await redeem(codeA);
  assert.equal(used.code,'CODE_ALREADY_USED');

  await actor(C);
  const unverified=await redeem(codeB);
  assert.equal(unverified.code,'EMAIL_NOT_VERIFIED');

  await service();
  await db.query("insert into public.billing_entitlements(user_id,provider,plan,provider_status,access_state,valid_until,provider_event_created) values($1,'stripe','pro','active','active',now()+interval '60 days',1)",[D]);
  await actor(D);
  const paid=await redeem(codeB);
  assert.equal(paid.code,'ACTIVE_SUBSCRIPTION');
  assert.equal(await effective(D),'pro');

  await service();
  await db.query("insert into public.billing_entitlements(user_id,provider,plan,provider_status,access_state,valid_until,provider_event_created) values($1,'stripe','pro','active','active',now()+interval '60 days',2) on conflict(user_id,provider) do update set plan='pro',provider_status='active',access_state='active',valid_until=excluded.valid_until",[A]);
  assert.equal(await effective(A),'pro');
  await service();
  await db.query("update public.billing_entitlements set valid_until=now()-interval '1 second' where user_id=$1 and provider='tester_code'",[A]);
  assert.equal(await effective(A),'pro','tester expiry must not downgrade active paid plan');

  await service();
  const expCode=(await db.query("select * from public.generate_tester_invite_codes(1,'expiry-test',30,now()+interval '1 day')")).rows[0].code;
  await db.query("update private.tester_invite_codes set code_expires_at=now()-interval '1 second' where code_hash=extensions.digest(convert_to($1,'UTF8'),'sha256')",[expCode]);
  await actor(E);
  const expired=await redeem(expCode);
  assert.equal(expired.code,'CODE_EXPIRED');

  await actor(F);
  for(let i=0;i<10;i++){
    const invalid=await redeem('BOEKUNA-AAAAAAAAAAAAAAAA');
    assert.equal(invalid.code,'INVALID_CODE');
  }
  const limited=await redeem('BOEKUNA-BBBBBBBBBBBBBBBB');
  assert.equal(limited.code,'RATE_LIMITED');
  await service();
  const attempts=(await db.query("select attempts from private.tester_code_redemption_attempts where user_id=$1",[F])).rows[0].attempts;
  assert.equal(Number(attempts),11);

  await service();
  await db.query("delete from public.billing_entitlements where user_id=$1 and provider='stripe'",[A]);
  assert.equal(await effective(A),'free','expired tester without paid entitlement must fall back to free');

  await actor(B);
  await assert.rejects(db.query('select * from private.tester_invite_codes'),/permission denied|access denied/i);

  console.log('BOEKUNA tester invite-code SQL: PASS');
}finally{
  await db.close();
}
