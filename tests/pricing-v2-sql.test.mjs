// Pricing V2 migration on a production-shaped PostgreSQL (PGlite):
// plan mapping, intervals, monotonic Stripe writer, no paid quota, legacy rows.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {DOCUMENT_LIMITS} from '../supabase/functions/_shared/pricing.mjs';

const db=new PGlite();
const testerMigration=fs.readFileSync('supabase/migrations/20261007101500_tester_invite_code_access.sql','utf8');
const pricingMigration=fs.readFileSync('supabase/migrations/20261008170000_pricing_v2_plans_and_intervals.sql','utf8');
const U=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [LEGACY_BOEKUNA,LEGACY_PRO,NEW_ZZP,NEW_BIZ,FREE,INTERNAL,OTHER,TESTER]=[1,2,3,4,5,6,7,8].map(U);

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
async function one(sql,params=[]){return (await db.query(sql,params)).rows[0]}
async function effective(id){await service();return (await one('select public.billing_effective_plan($1) as p',[id])).p}
async function applyV2(id,{plan,status='active',interval='month',price='price_x',amount=995,created,sub='sub_'+id.slice(-4),days=30,cancel=false}){
  await service();
  return (await one(`select public.apply_stripe_subscription_state_v2($1,'cus_'||$2,$3,$4,$5,now()+($6||' days')::interval,$7,$8::bigint,'evt_'||$8::text,$9,$10,$11::integer) as ok`,
    [id,id.slice(-4),sub,plan,status,String(days),cancel,created,interval,price,amount])).ok;
}

try{
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private; create schema extensions;
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function extensions.gen_random_bytes(n integer) returns bytea language sql volatile as $$ select decode(substr(md5(random()::text||clock_timestamp()::text),1,greatest(2,n*2)),'hex') $$;
    create function extensions.digest(value bytea, algorithm text) returns bytea language sql immutable as $$ select decode(md5(encode(value,'hex')||algorithm),'hex') $$;
    create table public.internal_access_grants(user_id uuid primary key references auth.users(id),plan text not null check (plan in ('boekuna','pro')),active boolean not null default true);
    create table public.billing_accounts(
      user_id uuid primary key references auth.users(id),stripe_customer_id text,stripe_subscription_id text,
      plan text not null default 'free' check (plan in ('free','boekuna','pro')),
      status text not null default 'free' check (status in ('free','trialing','active','past_due','canceled','incomplete','incomplete_expired','unpaid','paused')),
      trial_end timestamptz,current_period_end timestamptz,cancel_at_period_end boolean not null default false,
      last_stripe_event_created bigint not null default 0,last_stripe_event_id text,
      created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
      constraint billing_active_requires_stripe_identity check (status<>'active' or (stripe_customer_id is not null and stripe_subscription_id is not null and current_period_end is not null)));
    create table public.billing_entitlements(user_id uuid not null references auth.users(id),provider text not null,external_customer_ref text,external_subscription_ref text,
      plan text not null check (plan in ('boekuna','pro')),provider_status text not null,access_state text not null check (access_state in ('active','grace','inactive')),
      valid_until timestamptz,cancel_at_period_end boolean not null default false,provider_event_created bigint not null default 0,provider_event_id text,
      created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(user_id,provider));
    create table public.billing_usage_monthly(user_id uuid not null,month_start date not null,feature text not null,usage_count integer not null default 0,updated_at timestamptz default now(),primary key(user_id,month_start,feature));
    create function public.apply_subscription_entitlement(p_user_id uuid,p_provider text,p_external_customer_ref text,p_external_subscription_ref text,p_plan text,p_provider_status text,p_access_state text,p_valid_until timestamptz,p_cancel_at_period_end boolean,p_event_created bigint,p_event_id text) returns boolean language plpgsql security definer set search_path='' as $$ begin insert into public.billing_entitlements(user_id,provider,external_customer_ref,external_subscription_ref,plan,provider_status,access_state,valid_until,cancel_at_period_end,provider_event_created,provider_event_id) values(p_user_id,p_provider,p_external_customer_ref,p_external_subscription_ref,p_plan,p_provider_status,p_access_state,p_valid_until,coalesce(p_cancel_at_period_end,false),p_event_created,p_event_id) on conflict(user_id,provider) do update set plan=excluded.plan,access_state=excluded.access_state,valid_until=excluded.valid_until,provider_event_created=excluded.provider_event_created; return true; end $$;
    create function private.entitlement_state_for_user(p_user_id uuid) returns text language sql stable security definer set search_path='' as $$ select 'free' $$;
    create function public.billing_effective_plan(p_user_id uuid) returns text language sql stable security definer set search_path='' as $$ select 'free' $$;
    create function public.billing_plan_limit(p_plan text) returns integer language sql immutable as $$ select case p_plan when 'pro' then null when 'boekuna' then 100 else 10 end $$;
    create function public.check_document_quota() returns table(allowed boolean,plan text,monthly_limit integer,used integer,remaining integer) language plpgsql security definer set search_path='' as $$
      declare v_user uuid:=auth.uid(); v_plan text; v_limit integer; v_used integer;
      begin v_plan:=coalesce(public.billing_effective_plan(v_user),'free'); v_limit:=public.billing_plan_limit(v_plan);
        select coalesce(u.usage_count,0) into v_used from (select 1) seed left join public.billing_usage_monthly u on u.user_id=v_user and u.month_start=date_trunc('month',now())::date and u.feature='smart_document';
        return query select (v_limit is null or v_used<v_limit),v_plan,v_limit,v_used,case when v_limit is null then null else greatest(0,v_limit-v_used) end; end $$;
    grant usage on schema public,auth,private to authenticated,service_role;
    grant usage on schema extensions to service_role;
    grant select on auth.users to authenticated,service_role;
    grant select,insert,update,delete on public.billing_entitlements,public.billing_accounts,public.internal_access_grants,public.billing_usage_monthly to service_role;
    grant execute on function public.check_document_quota() to authenticated;
  `);
  await db.query('insert into auth.users(id,email_confirmed_at) select x,now() from unnest($1::uuid[]) x',[[LEGACY_BOEKUNA,LEGACY_PRO,NEW_ZZP,NEW_BIZ,FREE,INTERNAL,OTHER,TESTER]]);
  await db.exec(testerMigration);

  // Rows written before Pricing V2 with the old keys.
  await db.query(`insert into public.billing_accounts(user_id,stripe_customer_id,stripe_subscription_id,plan,status,current_period_end,last_stripe_event_created)
    values ($1,'cus_old1','sub_old1','boekuna','active',now()+interval '20 days',100),($2,'cus_old2','sub_old2','pro','active',now()+interval '20 days',100)`,[LEGACY_BOEKUNA,LEGACY_PRO]);
  await db.query(`insert into public.billing_entitlements(user_id,provider,external_customer_ref,external_subscription_ref,plan,provider_status,access_state,valid_until,provider_event_created)
    values ($1,'stripe','cus_old1','sub_old1','boekuna','active','active',now()+interval '20 days',100),($2,'stripe','cus_old2','sub_old2','pro','active','active',now()+interval '20 days',100)`,[LEGACY_BOEKUNA,LEGACY_PRO]);
  await db.query("insert into public.internal_access_grants(user_id,plan) values ($1,'pro')",[INTERNAL]);
  await db.query("insert into public.billing_usage_monthly(user_id,month_start,feature,usage_count) values ($1,date_trunc('month',now())::date,'smart_document',150),($2,date_trunc('month',now())::date,'smart_document',10)",[LEGACY_BOEKUNA,FREE]);

  await db.exec('reset role');
  await db.exec(pricingMigration);
  // Running the migration twice must be harmless.
  await db.exec(pricingMigration);

  // Legacy rows are untouched and keep their subscription, renewal date and paid access.
  await service();
  const legacy=await one('select plan,stripe_subscription_id,current_period_end>now() as future from public.billing_accounts where user_id=$1',[LEGACY_BOEKUNA]);
  assert.deepEqual([legacy.plan,legacy.stripe_subscription_id,legacy.future],['boekuna','sub_old1',true],'migration must not rewrite or cancel existing subscriptions');
  assert.equal(await effective(LEGACY_BOEKUNA),'zzp','legacy Boekuna maps to ZZP');
  assert.equal(await effective(LEGACY_PRO),'pro','legacy Unlimited maps to Pro');
  assert.equal(await effective(INTERNAL),'pro','internal grants keep access');
  assert.equal(await effective(FREE),'free','users without a plan are Start (storage key free)');

  // Monthly document recognition: Start 10, ZZP 100 (as the old paid plan), Pro and Business no limit.
  for(const [plan,limit] of [['zzp',100],['boekuna',100],['pro',null],['unlimited',null],['business',null],['free',10],['start',10],[null,10]])
    assert.equal((await one('select public.billing_plan_limit($1) as l',[plan])).l,limit,String(plan)+' document limit');
  for(const [plan,limit] of Object.entries(DOCUMENT_LIMITS))
    assert.equal((await one('select public.billing_plan_limit($1) as l',[plan])).l,limit,'server limit equals pricing.mjs for '+plan);
  await actor(LEGACY_BOEKUNA);
  const q=await one('select * from public.check_document_quota()');
  assert.equal(q.allowed,false,'a ZZP customer at 150 documents has used the 100 of this month');
  assert.equal(q.monthly_limit,100);
  await actor(FREE);
  assert.equal((await one('select * from public.check_document_quota()')).allowed,false,'Start limit unchanged');

  // New subscriptions: V2 keys, interval and price stored, history kept.
  assert.equal(await applyV2(NEW_ZZP,{plan:'zzp',interval:'year',price:'price_zzp_year',amount:9950,created:200,days:365}),true);
  await service();
  let acc=await one('select plan,billing_interval,stripe_price_id,unit_amount_cents from public.billing_accounts where user_id=$1',[NEW_ZZP]);
  assert.deepEqual({...acc},{plan:'zzp',billing_interval:'year',stripe_price_id:'price_zzp_year',unit_amount_cents:9950});
  let ent=await one("select plan,billing_interval,price_ref,access_state from public.billing_entitlements where user_id=$1 and provider='stripe'",[NEW_ZZP]);
  assert.deepEqual({...ent},{plan:'zzp',billing_interval:'year',price_ref:'price_zzp_year',access_state:'active'});
  assert.equal(await effective(NEW_ZZP),'zzp');

  // Out-of-order event: an older event never overwrites newer state.
  assert.equal(await applyV2(NEW_ZZP,{plan:'zzp',interval:'month',price:'price_zzp_month',amount:995,created:150}),false);
  await service();
  assert.equal((await one('select billing_interval from public.billing_accounts where user_id=$1',[NEW_ZZP])).billing_interval,'year');

  // Duplicate event (same created time) is idempotent.
  assert.equal(await applyV2(NEW_ZZP,{plan:'zzp',interval:'year',price:'price_zzp_year',amount:9950,created:200,days:365}),true);
  await service();
  assert.equal(Number((await one('select count(*) n from public.billing_subscription_prices where user_id=$1',[NEW_ZZP])).n),1);

  // Upgrade via portal (new price) keeps price history.
  await applyV2(NEW_ZZP,{plan:'pro',interval:'year',price:'price_pro_year',amount:19950,created:300,days:365});
  assert.equal(await effective(NEW_ZZP),'pro');
  await service();
  assert.equal(Number((await one('select count(*) n from public.billing_subscription_prices where user_id=$1',[NEW_ZZP])).n),2,'old and new prices are both kept');

  // Pre-V2 writer still works and keeps the known interval.
  await service();
  assert.equal((await one(`select public.apply_stripe_subscription_state($1,'cus_0003','sub_0003','pro','active',now()+interval '365 days',true,400,'evt_400') as ok`,[NEW_ZZP])).ok,true);
  acc=await one('select plan,billing_interval,cancel_at_period_end from public.billing_accounts where user_id=$1',[NEW_ZZP]);
  assert.deepEqual({...acc},{plan:'pro',billing_interval:'year',cancel_at_period_end:true});

  // Old Edge Function passing 'boekuna' stores the V2 key.
  await service();
  await one(`select public.apply_stripe_subscription_state($1,'cus_old1','sub_old1','boekuna','active',now()+interval '30 days',false,500,'evt_500') as ok`,[LEGACY_BOEKUNA]);
  assert.equal((await one('select plan from public.billing_accounts where user_id=$1',[LEGACY_BOEKUNA])).plan,'zzp');

  // Business, cancellation and expiry: access ends only when the paid period ends; data stays.
  await applyV2(NEW_BIZ,{plan:'business',interval:'month',price:'price_biz_month',amount:3495,created:100});
  assert.equal(await effective(NEW_BIZ),'business');
  await applyV2(NEW_BIZ,{plan:'business',status:'active',cancel:true,created:110});
  assert.equal(await effective(NEW_BIZ),'business','cancel at period end keeps access until the end');
  await applyV2(NEW_BIZ,{plan:'business',status:'canceled',created:120,days:-1});
  assert.equal(await effective(NEW_BIZ),'free','ended subscription falls back to Start');
  await service();
  assert.equal(Number((await one('select count(*) n from public.billing_accounts where user_id=$1',[NEW_BIZ])).n),1,'billing history is never deleted');
  await applyV2(NEW_BIZ,{plan:'business',status:'past_due',created:130});
  assert.equal(await effective(NEW_BIZ),'free','failed payment does not give paid access');

  // Invalid input is rejected server-side.
  for(const [plan,interval,amount] of [['gold','month',995],['zzp','week',995],['zzp','month',-1],['start','month',0]]){
    await service();
    await assert.rejects(db.query(`select public.apply_stripe_subscription_state_v2($1,'c','s','${plan}','active',now()+interval '1 day',false,999,'e','${interval}','p',${amount})`,[OTHER]),`must reject ${plan}/${interval}/${amount}`);
  }

  // Own-account details and plan gates; a user never sees another user's billing.
  await actor(NEW_ZZP);
  const d=await one('select * from public.get_subscription_details()');
  assert.equal(d.plan,'pro');assert.equal(d.billing_interval,'year');assert.equal(d.has_stripe_subscription,true);
  assert.equal((await one("select public.has_plan('zzp') v")).v,true);
  assert.equal((await one("select public.has_plan('business') v")).v,false);
  assert.equal((await one("select public.has_plan('typo') v")).v,false,'unknown plan never unlocks');
  await actor(OTHER);
  const other=await one('select * from public.get_subscription_details()');
  assert.equal(other.plan,'start');assert.equal(other.billing_interval,null);assert.equal(other.has_stripe_subscription,false);
  await assert.rejects(db.query('select * from public.billing_subscription_prices'),'clients cannot read the price ledger');
  await assert.rejects(db.query("select public.apply_stripe_subscription_state_v2($1,'c','s','zzp','active',now()+interval '1 day',false,1,'e','month','p',995)",[OTHER]),'clients cannot write billing state');
  await db.exec('reset role');
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from public.get_subscription_details()'),'anon has no access');

  // Billing summary keeps its shape and reports the V2 plan.
  await actor(LEGACY_PRO);
  const s=await one('select * from public.get_billing_summary()');
  assert.equal(s.plan,'pro');assert.equal(s.monthly_limit,null);assert.equal(s.entitlement_status,'paid');

  // Tester codes: an active V2 subscription still blocks a tester period.
  await service();
  const code=(await one("select code from public.generate_tester_invite_codes(1,'pricing-v2',30,null)")).code;
  await actor(NEW_ZZP);
  assert.equal((await one('select public.redeem_tester_invite_code($1) r',[code])).r.code,'ACTIVE_SUBSCRIPTION');
  await actor(TESTER);
  const t=(await one('select public.redeem_tester_invite_code($1) r',[code])).r;
  assert.equal(t.ok,true);
  assert.equal(await effective(TESTER),'zzp','tester access is ZZP');

  console.log('Pricing V2 SQL migration: PASS');
}finally{
  await db.close();
}
