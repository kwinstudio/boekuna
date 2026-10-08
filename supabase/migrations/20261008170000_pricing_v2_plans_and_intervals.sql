-- Boekuna Pricing V2: four plans (Start, ZZP, Pro, Business), month or year billing.
--
-- Additive and backwards compatible:
--  * Existing rows keep their storage keys. 'free' stays the key for Start and
--    'boekuna' is read as ZZP. New writes store 'zzp', 'pro' or 'business'.
--  * The pre-V2 nine-argument Stripe writer keeps working for Edge Functions that
--    are not yet redeployed; it forwards to the V2 writer without interval data.
--  * Paid plans no longer carry a monthly smart-document quota. Usage keeps being
--    counted in billing_usage_monthly for cost analysis. Start keeps its existing
--    10 checks per month (nobody loses a right they have today).
--  * No subscription is cancelled, re-created or re-priced by this migration.

begin;

-- 1. Accept the new plan keys next to the legacy ones.
alter table public.billing_accounts drop constraint if exists billing_accounts_plan_check;
alter table public.billing_accounts add constraint billing_accounts_plan_check
  check (plan in ('free','boekuna','zzp','pro','business'));

alter table public.billing_entitlements drop constraint if exists billing_entitlements_plan_check;
alter table public.billing_entitlements add constraint billing_entitlements_plan_check
  check (plan in ('boekuna','zzp','pro','business'));

alter table public.internal_access_grants drop constraint if exists internal_access_grants_plan_check;
alter table public.internal_access_grants add constraint internal_access_grants_plan_check
  check (plan in ('boekuna','zzp','pro','business'));

-- 2. Billing interval and the price actually paid, separate from plan identity.
alter table public.billing_accounts
  add column if not exists billing_interval text,
  add column if not exists stripe_price_id text,
  add column if not exists unit_amount_cents integer;
alter table public.billing_accounts drop constraint if exists billing_accounts_interval_check;
alter table public.billing_accounts add constraint billing_accounts_interval_check
  check (billing_interval is null or billing_interval in ('month','year'));
alter table public.billing_accounts drop constraint if exists billing_accounts_amount_check;
alter table public.billing_accounts add constraint billing_accounts_amount_check
  check (unit_amount_cents is null or unit_amount_cents >= 0);

alter table public.billing_entitlements
  add column if not exists billing_interval text,
  add column if not exists price_ref text;
alter table public.billing_entitlements drop constraint if exists billing_entitlements_interval_check;
alter table public.billing_entitlements add constraint billing_entitlements_interval_check
  check (billing_interval is null or billing_interval in ('month','year'));

-- Historic price information: every Stripe price a subscription has used.
create table if not exists public.billing_subscription_prices (
  provider text not null,
  external_subscription_ref text not null,
  price_ref text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('boekuna','zzp','pro','business')),
  billing_interval text not null check (billing_interval in ('month','year')),
  unit_amount_cents integer check (unit_amount_cents is null or unit_amount_cents >= 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (provider,external_subscription_ref,price_ref)
);
create index if not exists billing_subscription_prices_user_idx
  on public.billing_subscription_prices(user_id);
alter table public.billing_subscription_prices enable row level security;
revoke all on table public.billing_subscription_prices from public,anon,authenticated;
grant select,insert,update,delete on table public.billing_subscription_prices to service_role;

-- 3. Plan helpers. Legacy keys map onto the V2 product names.
create or replace function private.canonical_plan(p_plan text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(btrim(coalesce(p_plan,'')))
    when 'zzp' then 'zzp'
    when 'boekuna' then 'zzp'
    when 'pro' then 'pro'
    when 'unlimited' then 'pro'
    when 'business' then 'business'
    else 'start'
  end
$$;

create or replace function private.plan_rank(p_plan text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case private.canonical_plan(p_plan)
    when 'zzp' then 1 when 'pro' then 2 when 'business' then 3 else 0
  end
$$;

revoke all on function private.canonical_plan(text) from public,anon,authenticated;
revoke all on function private.plan_rank(text) from public,anon,authenticated;
grant execute on function private.canonical_plan(text) to service_role;
grant execute on function private.plan_rank(text) to service_role;

-- 4. No monthly smart-document quota on any paid plan. Start keeps 10.
create or replace function public.billing_plan_limit(p_plan text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case
    when lower(btrim(coalesce(p_plan,''))) in ('pro','unlimited','business') then null
    when lower(btrim(coalesce(p_plan,''))) in ('zzp','boekuna') then 100
    else 10
  end
$$;

-- 5. Effective access, provider-neutral, all paid plans.
create or replace function private.entitlement_state_for_user(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1
      from public.internal_access_grants g
      where g.user_id=p_user_id
        and g.active=true
        and g.plan in ('boekuna','zzp','pro','business')
    ) then 'paid'
    when exists (
      select 1
      from public.billing_entitlements e
      where e.user_id=p_user_id
        and e.plan in ('boekuna','zzp','pro','business')
        and e.access_state in ('active','grace')
        and e.valid_until is not null
        and e.valid_until > now()
    ) then 'paid'
    -- Transitional rollback fallback until the generic layer has stabilized.
    when exists (
      select 1
      from public.billing_accounts b
      where b.user_id=p_user_id
        and b.plan in ('boekuna','zzp','pro','business')
        and b.status='active'
        and b.current_period_end is not null
        and b.current_period_end > now()
    ) then 'paid'
    else 'free'
  end
$$;

revoke all on function private.entitlement_state_for_user(uuid) from public,anon,authenticated;
grant execute on function private.entitlement_state_for_user(uuid) to service_role;

-- Returns 'free' (Start), 'zzp', 'pro' or 'business'. The highest active plan wins.
create or replace function public.billing_effective_plan(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case private.entitlement_state_for_user(p_user_id)
    when 'paid' then coalesce(
      (
        select private.canonical_plan(x.plan)
        from (
          select g.plan
          from public.internal_access_grants g
          where g.user_id=p_user_id
            and g.active=true
            and g.plan in ('boekuna','zzp','pro','business')
          union all
          select e.plan
          from public.billing_entitlements e
          where e.user_id=p_user_id
            and e.plan in ('boekuna','zzp','pro','business')
            and e.access_state in ('active','grace')
            and e.valid_until is not null
            and e.valid_until > now()
          union all
          select b.plan
          from public.billing_accounts b
          where b.user_id=p_user_id
            and b.plan in ('boekuna','zzp','pro','business')
            and b.status='active'
            and b.current_period_end is not null
            and b.current_period_end > now()
        ) x
        order by private.plan_rank(x.plan) desc
        limit 1
      ),
      'free'
    )
    else 'free'
  end
$$;

revoke all on function public.billing_effective_plan(uuid) from public,anon,authenticated;
grant execute on function public.billing_effective_plan(uuid) to service_role;

-- 6. Generic entitlement writer: accepts the V2 plans and stores the V2 key.
create or replace function public.apply_subscription_entitlement(
  p_user_id uuid,
  p_provider text,
  p_external_customer_ref text,
  p_external_subscription_ref text,
  p_plan text,
  p_provider_status text,
  p_access_state text,
  p_valid_until timestamptz,
  p_cancel_at_period_end boolean,
  p_event_created bigint,
  p_event_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer := 0;
  v_provider text := lower(trim(coalesce(p_provider,'')));
  v_plan text := lower(btrim(coalesce(p_plan,'')));
begin
  if v_provider !~ '^[a-z0-9_]{2,40}$' then
    raise exception 'INVALID_PROVIDER';
  end if;
  if v_plan not in ('boekuna','zzp','pro','business') then
    raise exception 'INVALID_PLAN';
  end if;
  -- Tester codes keep their historic 'boekuna' key; providers that sell
  -- subscriptions store the V2 product key.
  if v_provider <> 'tester_code' then
    v_plan := private.canonical_plan(v_plan);
  end if;
  if coalesce(trim(p_provider_status),'')='' then
    raise exception 'INVALID_PROVIDER_STATUS';
  end if;
  if p_access_state not in ('active','grace','inactive') then
    raise exception 'INVALID_ACCESS_STATE';
  end if;
  if p_access_state in ('active','grace') and p_valid_until is null then
    raise exception 'ACTIVE_ENTITLEMENT_REQUIRES_EXPIRY';
  end if;
  if p_event_created is null or p_event_created < 0 then
    raise exception 'INVALID_EVENT_TIME';
  end if;

  insert into public.billing_entitlements(
    user_id,provider,external_customer_ref,external_subscription_ref,
    plan,provider_status,access_state,valid_until,cancel_at_period_end,
    provider_event_created,provider_event_id,updated_at
  )
  values(
    p_user_id,v_provider,nullif(p_external_customer_ref,''),nullif(p_external_subscription_ref,''),
    v_plan,p_provider_status,p_access_state,p_valid_until,coalesce(p_cancel_at_period_end,false),
    p_event_created,nullif(p_event_id,''),now()
  )
  on conflict(user_id,provider) do update set
    external_customer_ref=excluded.external_customer_ref,
    external_subscription_ref=excluded.external_subscription_ref,
    plan=excluded.plan,
    provider_status=excluded.provider_status,
    access_state=excluded.access_state,
    valid_until=excluded.valid_until,
    cancel_at_period_end=excluded.cancel_at_period_end,
    provider_event_created=excluded.provider_event_created,
    provider_event_id=excluded.provider_event_id,
    updated_at=now()
  where excluded.provider_event_created >= public.billing_entitlements.provider_event_created;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end
$$;

revoke all on function public.apply_subscription_entitlement(uuid,text,text,text,text,text,text,timestamptz,boolean,bigint,text)
  from public,anon,authenticated;
grant execute on function public.apply_subscription_entitlement(uuid,text,text,text,text,text,text,timestamptz,boolean,bigint,text)
  to service_role;

-- 7. Stripe writer V2: plan, interval and price come from the price the customer pays.
create or replace function public.apply_stripe_subscription_state_v2(
  p_user_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_plan text,
  p_status text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_event_created bigint,
  p_event_id text,
  p_billing_interval text,
  p_stripe_price_id text,
  p_unit_amount_cents integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer := 0;
  v_access_state text;
  v_plan text;
  v_interval text := nullif(lower(btrim(coalesce(p_billing_interval,''))),'');
  v_price text := nullif(btrim(coalesce(p_stripe_price_id,'')),'');
begin
  if lower(btrim(coalesce(p_plan,''))) not in ('boekuna','zzp','pro','business') then
    raise exception 'INVALID_PLAN';
  end if;
  v_plan := private.canonical_plan(p_plan);
  if v_interval is not null and v_interval not in ('month','year') then
    raise exception 'INVALID_INTERVAL';
  end if;
  if p_unit_amount_cents is not null and p_unit_amount_cents < 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_status not in ('free','trialing','active','past_due','canceled','incomplete','incomplete_expired','unpaid','paused') then
    raise exception 'INVALID_STATUS';
  end if;
  if p_event_created is null or p_event_created < 0 then
    raise exception 'INVALID_EVENT_TIME';
  end if;

  insert into public.billing_accounts(
    user_id,stripe_customer_id,stripe_subscription_id,
    plan,status,trial_end,current_period_end,cancel_at_period_end,
    billing_interval,stripe_price_id,unit_amount_cents,
    last_stripe_event_created,last_stripe_event_id,updated_at
  )
  values(
    p_user_id,nullif(p_stripe_customer_id,''),nullif(p_stripe_subscription_id,''),
    v_plan,p_status,null,p_current_period_end,coalesce(p_cancel_at_period_end,false),
    v_interval,v_price,p_unit_amount_cents,
    p_event_created,nullif(p_event_id,''),now()
  )
  on conflict(user_id) do update set
    stripe_customer_id=excluded.stripe_customer_id,
    stripe_subscription_id=excluded.stripe_subscription_id,
    plan=excluded.plan,
    status=excluded.status,
    trial_end=null,
    current_period_end=excluded.current_period_end,
    cancel_at_period_end=excluded.cancel_at_period_end,
    -- A pre-V2 writer passes no interval/price: keep what is known.
    billing_interval=coalesce(excluded.billing_interval,public.billing_accounts.billing_interval),
    stripe_price_id=coalesce(excluded.stripe_price_id,public.billing_accounts.stripe_price_id),
    unit_amount_cents=coalesce(excluded.unit_amount_cents,public.billing_accounts.unit_amount_cents),
    last_stripe_event_created=excluded.last_stripe_event_created,
    last_stripe_event_id=excluded.last_stripe_event_id,
    updated_at=now()
  where excluded.last_stripe_event_created >= public.billing_accounts.last_stripe_event_created;

  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    v_access_state:=case
      when p_status='active'
       and p_current_period_end is not null
       and p_current_period_end > now()
        then 'active'
      else 'inactive'
    end;

    perform public.apply_subscription_entitlement(
      p_user_id,'stripe',p_stripe_customer_id,p_stripe_subscription_id,
      v_plan,p_status,v_access_state,p_current_period_end,p_cancel_at_period_end,
      p_event_created,p_event_id
    );

    update public.billing_entitlements e
       set billing_interval=coalesce(v_interval,e.billing_interval),
           price_ref=coalesce(v_price,e.price_ref)
     where e.user_id=p_user_id
       and e.provider='stripe'
       and e.provider_event_created=p_event_created;

    if v_price is not null and v_interval is not null and nullif(p_stripe_subscription_id,'') is not null then
      insert into public.billing_subscription_prices(
        provider,external_subscription_ref,price_ref,user_id,plan,billing_interval,unit_amount_cents
      )
      values('stripe',p_stripe_subscription_id,v_price,p_user_id,v_plan,v_interval,p_unit_amount_cents)
      on conflict(provider,external_subscription_ref,price_ref) do update set
        last_seen_at=now();
    end if;
  end if;

  return v_rows > 0;
end
$$;

revoke all on function public.apply_stripe_subscription_state_v2(uuid,text,text,text,text,timestamptz,boolean,bigint,text,text,text,integer)
  from public,anon,authenticated;
grant execute on function public.apply_stripe_subscription_state_v2(uuid,text,text,text,text,timestamptz,boolean,bigint,text,text,text,integer)
  to service_role;

-- Pre-V2 signature, kept for Edge Functions deployed before this migration.
create or replace function public.apply_stripe_subscription_state(
  p_user_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_plan text,
  p_status text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_event_created bigint,
  p_event_id text
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select public.apply_stripe_subscription_state_v2(
    p_user_id,p_stripe_customer_id,p_stripe_subscription_id,p_plan,p_status,
    p_current_period_end,p_cancel_at_period_end,p_event_created,p_event_id,
    null,null,null
  )
$$;

revoke all on function public.apply_stripe_subscription_state(uuid,text,text,text,text,timestamptz,boolean,bigint,text)
  from public,anon,authenticated;
grant execute on function public.apply_stripe_subscription_state(uuid,text,text,text,text,timestamptz,boolean,bigint,text)
  to service_role;

-- 8. Subscription details for the app's Abonnement screen (own account only).
-- 8a. Accounts that exist when this migration runs keep the bookkeeping they had on the free plan
-- (costs, receipts, VAT, bank, reports). New Start accounts get invoicing only. Never removed here.
create table if not exists private.start_legacy_accounts(
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);
revoke all on private.start_legacy_accounts from public,anon,authenticated;
insert into private.start_legacy_accounts(user_id) select id from auth.users on conflict do nothing;

drop function if exists public.get_subscription_details();
create or replace function public.get_subscription_details()
returns table(
  plan text,
  plan_rank integer,
  billing_interval text,
  unit_amount_cents integer,
  status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  has_stripe_subscription boolean,
  start_includes_bookkeeping boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
begin
  if v_user is null then raise exception 'Unauthorized'; end if;
  v_plan := public.billing_effective_plan(v_user);
  return query
  select
    case when v_plan='free' then 'start' else v_plan end,
    private.plan_rank(v_plan),
    b.billing_interval,
    b.unit_amount_cents,
    coalesce(b.status,'free'),
    b.current_period_end,
    coalesce(b.cancel_at_period_end,false),
    coalesce(nullif(btrim(b.stripe_subscription_id),'') is not null,false),
    exists(select 1 from private.start_legacy_accounts l where l.user_id=v_user)
  from (select 1) seed
  left join public.billing_accounts b on b.user_id=v_user;
end
$$;

revoke all on function public.get_subscription_details() from public,anon;
grant execute on function public.get_subscription_details() to authenticated,service_role;

-- 9. Feature gates read the plan server-side: has_plan('pro') etc.
create or replace function public.has_plan(p_min_plan text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and lower(btrim(coalesce(p_min_plan,''))) in ('start','free','zzp','boekuna','pro','business')
     and private.plan_rank(public.billing_effective_plan(auth.uid())) >= private.plan_rank(p_min_plan)
$$;

revoke all on function public.has_plan(text) from public,anon;
grant execute on function public.has_plan(text) to authenticated,service_role;

-- 10. Billing summary: same API shape, all V2 plans, highest plan first.
create or replace function public.get_billing_summary()
returns table(
  plan text,
  status text,
  monthly_limit integer,
  used integer,
  remaining integer,
  founder_number integer,
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  entitlement_status text,
  early_access_started_at timestamptz,
  early_access_ends_at timestamptz,
  can_operate boolean,
  can_manage_subscription boolean,
  access_source text,
  access_ends_at timestamptz,
  tester_access_used boolean
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_plan text;
  v_billing_status text;
  v_entitlement text;
  v_limit integer;
  v_used integer;
  v_month date:=date_trunc('month',now())::date;
  v_period timestamptz;
  v_cancel boolean;
  v_can_manage_subscription boolean:=false;
  v_access_source text:='free';
  v_access_ends_at timestamptz;
  v_tester_access_used boolean:=false;
begin
  if v_user is null then raise exception 'Unauthorized'; end if;

  v_entitlement:=private.entitlement_state_for_user(v_user);
  v_plan:=public.billing_effective_plan(v_user);

  select
    coalesce(b.status,'free'),
    b.current_period_end,
    coalesce(b.cancel_at_period_end,false),
    coalesce(nullif(btrim(b.stripe_customer_id),'') is not null,false)
  into v_billing_status,v_period,v_cancel,v_can_manage_subscription
  from (select 1) seed
  left join public.billing_accounts b on b.user_id=v_user;

  v_tester_access_used:=exists(
    select 1 from public.billing_entitlements e
     where e.user_id=v_user and e.provider='tester_code'
  );

  if exists (
    select 1
      from public.internal_access_grants g
     where g.user_id=v_user
       and g.active=true
       and g.plan in ('boekuna','zzp','pro','business')
  ) then
    v_access_source:='internal';
  else
    select e.provider,e.valid_until
      into v_access_source,v_access_ends_at
      from public.billing_entitlements e
     where e.user_id=v_user
       and e.plan in ('boekuna','zzp','pro','business')
       and e.access_state in ('active','grace')
       and e.valid_until is not null
       and e.valid_until>now()
     order by
       private.plan_rank(e.plan) desc,
       case when e.provider='stripe' then 0 when e.provider='tester_code' then 1 else 2 end,
       e.valid_until desc
     limit 1;

    if not found and exists (
      select 1
        from public.billing_accounts b
       where b.user_id=v_user
         and b.plan in ('boekuna','zzp','pro','business')
         and b.status='active'
         and b.current_period_end is not null
         and b.current_period_end>now()
    ) then
      v_access_source:='stripe';
      v_access_ends_at:=v_period;
    end if;
  end if;

  v_limit:=public.billing_plan_limit(v_plan);

  select coalesce(u.usage_count,0) into v_used
  from (select 1) seed
  left join public.billing_usage_monthly u
    on u.user_id=v_user
   and u.month_start=v_month
   and u.feature='smart_document';

  return query
  select
    v_plan,
    v_billing_status,
    v_limit,
    v_used,
    case when v_limit is null then null else greatest(0,v_limit-v_used) end,
    null::integer,
    null::timestamptz,
    v_period,
    v_cancel,
    v_entitlement,
    null::timestamptz,
    null::timestamptz,
    true,
    v_can_manage_subscription,
    coalesce(v_access_source,'free'),
    v_access_ends_at,
    v_tester_access_used;
end
$$;

revoke all on function public.get_billing_summary() from public,anon;
grant execute on function public.get_billing_summary() to authenticated,service_role;

-- 11. Tester codes: any active paid V2 plan blocks a tester period, as before.
create or replace function public.redeem_tester_invite_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_now timestamptz:=clock_timestamp();
  v_window timestamptz:=date_trunc('hour',clock_timestamp());
  v_attempts integer:=0;
  v_verified_at timestamptz;
  v_normalized text;
  v_hash bytea;
  v_invite private.tester_invite_codes%rowtype;
  v_expires_at timestamptz;
  v_event_created bigint;
  v_written boolean;
begin
  if v_user is null then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  -- Lock the auth user row so two different invite codes cannot race to grant
  -- two tester periods to the same account.
  select u.email_confirmed_at
    into v_verified_at
    from auth.users u
   where u.id=v_user
   for update;

  if not found then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;
  if v_verified_at is null then
    return jsonb_build_object('ok',false,'code','EMAIL_NOT_VERIFIED');
  end if;

  insert into private.tester_code_redemption_attempts(user_id,window_start,attempts,updated_at)
  values(v_user,v_window,1,v_now)
  on conflict(user_id) do update set
    window_start=case
      when private.tester_code_redemption_attempts.window_start=excluded.window_start
        then private.tester_code_redemption_attempts.window_start
      else excluded.window_start
    end,
    attempts=case
      when private.tester_code_redemption_attempts.window_start=excluded.window_start
        then private.tester_code_redemption_attempts.attempts+1
      else 1
    end,
    updated_at=excluded.updated_at
  returning attempts into v_attempts;

  if v_attempts>10 then
    return jsonb_build_object('ok',false,'code','RATE_LIMITED');
  end if;

  v_normalized:=upper(regexp_replace(btrim(coalesce(p_code,'')),'[[:space:]]+','','g'));
  if v_normalized !~ '^BOEKUNA-[A-HJ-NP-Z2-9]{16}$' then
    return jsonb_build_object('ok',false,'code','INVALID_CODE');
  end if;

  v_hash:=extensions.digest(convert_to(v_normalized,'UTF8'),'sha256');

  select c.*
    into v_invite
    from private.tester_invite_codes c
   where c.code_hash=v_hash
   for update;

  if not found then
    return jsonb_build_object('ok',false,'code','INVALID_CODE');
  end if;

  -- A retry of the exact successful redemption by the same user is idempotent
  -- while the original test period is still active. It never extends expiry.
  if v_invite.redeemed_at is not null then
    if v_invite.redeemed_by_user_id=v_user
       and v_invite.access_expires_at is not null
       and v_invite.access_expires_at>v_now then
      return jsonb_build_object(
        'ok',true,
        'code','TESTER_CODE_REDEEMED',
        'plan','boekuna',
        'access_source','tester_code',
        'activated_at',v_invite.access_activated_at,
        'expires_at',v_invite.access_expires_at,
        'idempotent',true
      );
    end if;
    if v_invite.redeemed_by_user_id=v_user then
      return jsonb_build_object('ok',false,'code','ACCOUNT_TEST_ALREADY_USED');
    end if;
    return jsonb_build_object('ok',false,'code','CODE_ALREADY_USED');
  end if;

  if v_invite.status='revoked' then
    return jsonb_build_object('ok',false,'code','INVALID_CODE');
  end if;
  if v_invite.status='expired'
     or (v_invite.code_expires_at is not null and v_invite.code_expires_at<=v_now) then
    update private.tester_invite_codes
       set status='expired'
     where id=v_invite.id and status='issued';
    return jsonb_build_object('ok',false,'code','CODE_EXPIRED');
  end if;
  if v_invite.status<>'issued' then
    return jsonb_build_object('ok',false,'code','INVALID_CODE');
  end if;

  -- Any valid non-tester subscription entitlement blocks redemption. This is
  -- provider-neutral, so future paid providers retain priority too.
  if exists (
    select 1
      from public.billing_entitlements e
     where e.user_id=v_user
       and e.provider<>'tester_code'
       and e.plan in ('boekuna','zzp','pro','business')
       and e.access_state in ('active','grace')
       and e.valid_until is not null
       and e.valid_until>v_now
  ) or exists (
    select 1
      from public.billing_accounts b
     where b.user_id=v_user
       and b.plan in ('boekuna','zzp','pro','business')
       and b.status='active'
       and b.stripe_customer_id is not null
       and b.stripe_subscription_id is not null
       and b.current_period_end is not null
       and b.current_period_end>v_now
  ) then
    return jsonb_build_object('ok',false,'code','ACTIVE_SUBSCRIPTION');
  end if;

  -- One tester period per account for life. Expiry does not make the account
  -- eligible for another code.
  if exists (
    select 1 from public.billing_entitlements e
     where e.user_id=v_user and e.provider='tester_code'
  ) then
    return jsonb_build_object('ok',false,'code','ACCOUNT_TEST_ALREADY_USED');
  end if;

  v_expires_at:=v_now+interval '30 days';
  v_event_created:=floor(extract(epoch from v_now))::bigint;

  v_written:=public.apply_subscription_entitlement(
    v_user,
    'tester_code',
    null,
    v_invite.id::text,
    'boekuna',
    'tester_active',
    'active',
    v_expires_at,
    false,
    v_event_created,
    'tester-code:'||v_invite.id::text
  );

  if not coalesce(v_written,false) then
    raise exception 'TESTER_ENTITLEMENT_WRITE_FAILED';
  end if;

  update private.tester_invite_codes
     set status='redeemed',
         redeemed_at=v_now,
         redeemed_by_user_id=v_user,
         access_activated_at=v_now,
         access_expires_at=v_expires_at
   where id=v_invite.id
     and status='issued';

  if not found then
    raise exception 'TESTER_CODE_REDEMPTION_CONFLICT';
  end if;

  return jsonb_build_object(
    'ok',true,
    'code','TESTER_CODE_REDEEMED',
    'plan','boekuna',
    'access_source','tester_code',
    'activated_at',v_now,
    'expires_at',v_expires_at,
    'idempotent',false
  );
end
$$;

revoke all on function public.redeem_tester_invite_code(text)
  from public,anon,authenticated;
grant execute on function public.redeem_tester_invite_code(text)
  to authenticated,service_role;

commit;
