-- Provider-agnostic subscription entitlement layer.
-- Additive only: Stripe billing_accounts remains intact as the current provider ledger
-- and rollback/compatibility source. Product access moves to this provider-neutral layer.

create table if not exists public.billing_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  external_customer_ref text,
  external_subscription_ref text,
  plan text not null check (plan in ('boekuna','pro')),
  provider_status text not null,
  access_state text not null check (access_state in ('active','grace','inactive')),
  valid_until timestamptz,
  cancel_at_period_end boolean not null default false,
  provider_event_created bigint not null default 0,
  provider_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id,provider),
  constraint billing_entitlements_provider_format
    check (provider ~ '^[a-z0-9_]{2,40}$'),
  constraint billing_entitlements_active_requires_expiry
    check (access_state='inactive' or valid_until is not null)
);

create unique index if not exists billing_entitlements_provider_subscription_uidx
  on public.billing_entitlements(provider,external_subscription_ref)
  where external_subscription_ref is not null;

create index if not exists billing_entitlements_active_user_idx
  on public.billing_entitlements(user_id,access_state,valid_until);

alter table public.billing_entitlements enable row level security;
revoke all on table public.billing_entitlements from public,anon,authenticated;
grant select,insert,update,delete on table public.billing_entitlements to service_role;

comment on table public.billing_entitlements is
  'Provider-neutral server-managed subscription entitlements. Stripe is the current web purchase provider; future providers such as Google Play map into the same access boundary.';

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
begin
  if v_provider !~ '^[a-z0-9_]{2,40}$' then
    raise exception 'INVALID_PROVIDER';
  end if;
  if p_plan not in ('boekuna','pro') then
    raise exception 'INVALID_PLAN';
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
    p_plan,p_provider_status,p_access_state,p_valid_until,coalesce(p_cancel_at_period_end,false),
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

-- Backfill the current Stripe provider without changing billing_accounts.
insert into public.billing_entitlements(
  user_id,provider,external_customer_ref,external_subscription_ref,
  plan,provider_status,access_state,valid_until,cancel_at_period_end,
  provider_event_created,provider_event_id,created_at,updated_at
)
select b.user_id,'stripe',
       b.stripe_customer_id,b.stripe_subscription_id,
       case when b.plan='pro' then 'pro' else 'boekuna' end,
       b.status,
       case
         when b.status='active' and b.current_period_end is not null and b.current_period_end > now()
           then 'active'
         else 'inactive'
       end,
       b.current_period_end,
       b.cancel_at_period_end,
       greatest(0,coalesce(b.last_stripe_event_created,0)),
       b.last_stripe_event_id,
       b.created_at,
       b.updated_at
from public.billing_accounts b
where b.plan in ('boekuna','pro')
  and (
    b.stripe_customer_id is not null
    or b.stripe_subscription_id is not null
    or b.status <> 'free'
  )
on conflict(user_id,provider) do update set
  external_customer_ref=excluded.external_customer_ref,
  external_subscription_ref=excluded.external_subscription_ref,
  plan=excluded.plan,
  provider_status=excluded.provider_status,
  access_state=excluded.access_state,
  valid_until=excluded.valid_until,
  cancel_at_period_end=excluded.cancel_at_period_end,
  provider_event_created=greatest(public.billing_entitlements.provider_event_created,excluded.provider_event_created),
  provider_event_id=case
    when excluded.provider_event_created >= public.billing_entitlements.provider_event_created
      then excluded.provider_event_id
    else public.billing_entitlements.provider_event_id
  end,
  updated_at=now();

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
        and g.plan in ('boekuna','pro')
    ) then 'paid'
    when exists (
      select 1
      from public.billing_entitlements e
      where e.user_id=p_user_id
        and e.plan in ('boekuna','pro')
        and e.access_state in ('active','grace')
        and e.valid_until is not null
        and e.valid_until > now()
    ) then 'paid'
    -- Transitional rollback fallback until the generic layer has stabilized.
    when exists (
      select 1
      from public.billing_accounts b
      where b.user_id=p_user_id
        and b.plan in ('boekuna','pro')
        and b.status='active'
        and b.current_period_end is not null
        and b.current_period_end > now()
    ) then 'paid'
    else 'free'
  end
$$;

revoke all on function private.entitlement_state_for_user(uuid) from public,anon,authenticated;
grant execute on function private.entitlement_state_for_user(uuid) to service_role;

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
        select g.plan
        from public.internal_access_grants g
        where g.user_id=p_user_id
          and g.active=true
          and g.plan in ('boekuna','pro')
        order by case when g.plan='pro' then 0 else 1 end
        limit 1
      ),
      (
        select e.plan
        from public.billing_entitlements e
        where e.user_id=p_user_id
          and e.plan in ('boekuna','pro')
          and e.access_state in ('active','grace')
          and e.valid_until is not null
          and e.valid_until > now()
        order by case when e.plan='pro' then 0 else 1 end, e.valid_until desc
        limit 1
      ),
      (
        select case when b.plan='pro' then 'pro' else 'boekuna' end
        from public.billing_accounts b
        where b.user_id=p_user_id
          and b.status='active'
          and b.current_period_end is not null
          and b.current_period_end > now()
        limit 1
      ),
      'free'
    )
    else 'free'
  end
$$;

revoke all on function public.billing_effective_plan(uuid) from public,anon,authenticated;
grant execute on function public.billing_effective_plan(uuid) to service_role;

-- Keep Stripe as the current purchase provider, but synchronize its state into
-- the provider-neutral entitlement boundary after the existing monotonic writer succeeds.
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
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer := 0;
  v_access_state text;
begin
  if p_plan not in ('boekuna','pro') then
    raise exception 'INVALID_PLAN';
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
    last_stripe_event_created,last_stripe_event_id,updated_at
  )
  values(
    p_user_id,nullif(p_stripe_customer_id,''),nullif(p_stripe_subscription_id,''),
    p_plan,p_status,null,p_current_period_end,coalesce(p_cancel_at_period_end,false),
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
      p_user_id,
      'stripe',
      p_stripe_customer_id,
      p_stripe_subscription_id,
      p_plan,
      p_status,
      v_access_state,
      p_current_period_end,
      p_cancel_at_period_end,
      p_event_created,
      p_event_id
    );
  end if;

  return v_rows > 0;
end
$$;

revoke all on function public.apply_stripe_subscription_state(uuid,text,text,text,text,timestamptz,boolean,bigint,text)
  from public,anon,authenticated;
grant execute on function public.apply_stripe_subscription_state(uuid,text,text,text,text,timestamptz,boolean,bigint,text)
  to service_role;
