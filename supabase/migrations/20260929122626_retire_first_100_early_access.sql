update public.early_access_campaign
set is_open=false,
    closed_at=coalesce(closed_at,now()),
    updated_at=now()
where id=1;

drop trigger if exists on_auth_user_early_access on auth.users;
drop trigger if exists refresh_early_access_campaign_count on public.early_access_claims;

create or replace function private.entitlement_state_for_user(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path=''
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

create or replace function public.billing_effective_plan(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select case private.entitlement_state_for_user(p_user_id)
    when 'paid' then coalesce(
      (
        select g.plan
        from public.internal_access_grants g
        where g.user_id=p_user_id
          and g.active=true
          and g.plan in ('boekuna','pro')
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
  can_operate boolean
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
begin
  if v_user is null then raise exception 'Unauthorized'; end if;

  v_entitlement:=private.entitlement_state_for_user(v_user);
  v_plan:=public.billing_effective_plan(v_user);

  select
    coalesce(b.status,'free'),
    b.current_period_end,
    coalesce(b.cancel_at_period_end,false)
  into v_billing_status,v_period,v_cancel
  from (select 1) seed
  left join public.billing_accounts b on b.user_id=v_user;

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
    true;
end
$$;

drop function if exists public.get_early_access_campaign_status();
drop function if exists public.reserve_founding_offer(uuid);
drop function if exists private.set_early_access_campaign_open(boolean);
drop function if exists private.handle_early_access_auth_change();
drop function if exists private.refresh_early_access_campaign_count();
drop function if exists private.ensure_early_access_claim(uuid);

comment on table public.early_access_campaign is
'RETIRED: First-100/Early Access campaign is permanently disabled and retained only for historical audit context.';
comment on table public.early_access_claims is
'RETIRED: no new Early Access claims are issued. Historical rows, if any, are retained only for audit context.';
comment on table public.founding_offer_claims is
'RETIRED: legacy Founding 100 records are not used for entitlement or checkout.';
comment on table public.internal_access_grants is
'Server-managed internal plan grants for owner/demo/support accounts. Separate from Stripe billing.';
