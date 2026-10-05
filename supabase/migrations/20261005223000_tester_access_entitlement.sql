-- Explicit, expiring tester access for the current 3-month tester promotion.
-- This is intentionally separate from the retired First-100 / Early Access campaign.
-- Product access is stored in the provider-neutral entitlement layer as provider "tester".
-- No Stripe customer, trial or payment method is created.

begin;

create or replace function public.grant_tester_access(p_user_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path=''
as $$
declare
  v_verified boolean:=false;
  v_ends_at timestamptz;
  v_event_created bigint;
begin
  select u.email_confirmed_at is not null
    into v_verified
    from auth.users u
   where u.id=p_user_id;

  if not found then
    raise exception 'TESTER_USER_NOT_FOUND';
  end if;
  if not coalesce(v_verified,false) then
    raise exception 'TESTER_ACCOUNT_NOT_VERIFIED';
  end if;

  v_ends_at:=now()+interval '90 days';
  v_event_created:=floor(extract(epoch from clock_timestamp()))::bigint;

  perform public.apply_subscription_entitlement(
    p_user_id,
    'tester',
    null,
    null,
    'boekuna',
    'tester_active',
    'active',
    v_ends_at,
    false,
    v_event_created,
    'tester-grant:'||p_user_id::text||':'||v_event_created::text
  );

  return v_ends_at;
end
$$;

revoke all on function public.grant_tester_access(uuid) from public,anon,authenticated;
grant execute on function public.grant_tester_access(uuid) to service_role;

create or replace function public.revoke_tester_access(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_rows integer:=0;
  v_event_created bigint:=floor(extract(epoch from clock_timestamp()))::bigint;
begin
  update public.billing_entitlements
     set provider_status='tester_revoked',
         access_state='inactive',
         valid_until=least(coalesce(valid_until,now()),now()),
         provider_event_created=greatest(provider_event_created,v_event_created),
         provider_event_id='tester-revoke:'||p_user_id::text||':'||v_event_created::text,
         updated_at=now()
   where user_id=p_user_id
     and provider='tester';

  get diagnostics v_rows=row_count;
  return v_rows>0;
end
$$;

revoke all on function public.revoke_tester_access(uuid) from public,anon,authenticated;
grant execute on function public.revoke_tester_access(uuid) to service_role;

drop function if exists public.get_billing_summary();

create function public.get_billing_summary()
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
  access_ends_at timestamptz
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

  if exists (
    select 1
      from public.internal_access_grants g
     where g.user_id=v_user
       and g.active=true
       and g.plan in ('boekuna','pro')
  ) then
    v_access_source:='internal';
  else
    select e.provider,e.valid_until
      into v_access_source,v_access_ends_at
      from public.billing_entitlements e
     where e.user_id=v_user
       and e.plan in ('boekuna','pro')
       and e.access_state in ('active','grace')
       and e.valid_until is not null
       and e.valid_until>now()
     order by
       case when e.plan='pro' then 0 else 1 end,
       case when e.provider='stripe' then 0 when e.provider='tester' then 1 else 2 end,
       e.valid_until desc
     limit 1;

    if not found and exists (
      select 1
        from public.billing_accounts b
       where b.user_id=v_user
         and b.plan in ('boekuna','pro')
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
    v_access_ends_at;
end
$$;

revoke all on function public.get_billing_summary() from public,anon;
grant execute on function public.get_billing_summary() to authenticated,service_role;

comment on function public.grant_tester_access(uuid) is
  'Service-only: grants a verified user 90 days of Boekuna tester access without creating Stripe state.';
comment on function public.revoke_tester_access(uuid) is
  'Service-only: immediately revokes an existing tester entitlement.';

commit;
