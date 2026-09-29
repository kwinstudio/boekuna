
-- Retire the First 100 / Early Access campaign completely.
-- Historical claim tables remain as locked audit records; no new claims can be allocated.

drop trigger if exists on_auth_user_early_access on auth.users;
drop function if exists private.handle_early_access_auth_change();
drop trigger if exists refresh_early_access_campaign_count on public.early_access_claims;
drop function if exists private.refresh_early_access_campaign_count();

drop function if exists public.get_early_access_campaign_status();
drop function if exists private.set_early_access_campaign_open(boolean);
drop function if exists private.ensure_early_access_claim(uuid);
drop function if exists public.reserve_founding_offer(uuid);

update public.early_access_campaign
set is_open=false,
    closed_at=coalesce(closed_at,clock_timestamp()),
    updated_at=clock_timestamp()
where id=1;

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

revoke all on function private.entitlement_state_for_user(uuid) from public,anon,authenticated;
grant execute on function private.entitlement_state_for_user(uuid) to service_role;

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

revoke all on function public.billing_effective_plan(uuid) from public,anon;
grant execute on function public.billing_effective_plan(uuid) to authenticated,service_role;

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

revoke all on function public.get_billing_summary() from public,anon;
grant execute on function public.get_billing_summary() to authenticated,service_role;

comment on table public.early_access_claims is
'ARCHIVED: retired First 100 / Early Access campaign history. No new claims are allocated.';
comment on table public.early_access_campaign is
'ARCHIVED: retired First 100 / Early Access campaign. Permanently closed.';
comment on table public.founding_offer_claims is
'ARCHIVED: retired Founding 100 campaign history. No longer used for checkout or entitlement.';
