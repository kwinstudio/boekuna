-- Expose Stripe portal capability separately from product entitlement.
-- Internal/provider-neutral access may be paid without a Stripe customer.
-- The UI must never infer Stripe portal availability from billing status alone.

begin;

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
  can_manage_subscription boolean
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
    v_can_manage_subscription;
end
$$;

revoke all on function public.get_billing_summary() from public,anon;
grant execute on function public.get_billing_summary() to authenticated,service_role;

commit;
