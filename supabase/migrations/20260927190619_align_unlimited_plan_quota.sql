-- Align current Boekuna plans with the public offer:
-- Free: 10 smart documents/month
-- Boekuna: 100 smart documents/month
-- Unlimited (internal plan code 'pro'): no monthly quota.

create or replace function public.billing_plan_limit(p_plan text)
returns integer
language sql
immutable
set search_path=public
as $$
  select case p_plan when 'pro' then null when 'boekuna' then 100 else 10 end
$$;

create or replace function public.check_document_quota()
returns table(allowed boolean, plan text, monthly_limit integer, used integer, remaining integer)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
  v_plan text;
  v_limit integer;
  v_used integer;
  v_month date:=date_trunc('month',now())::date;
begin
  if v_user is null then raise exception 'Unauthorized'; end if;
  v_plan:=coalesce(public.billing_effective_plan(v_user),'free');
  v_limit:=public.billing_plan_limit(v_plan);

  select coalesce(u.usage_count,0) into v_used
  from (select 1) seed
  left join public.billing_usage_monthly u
    on u.user_id=v_user and u.month_start=v_month and u.feature='smart_document';

  return query
  select
    (v_limit is null or v_used < v_limit),
    v_plan,
    v_limit,
    v_used,
    case when v_limit is null then null else greatest(0,v_limit-v_used) end;
end
$$;

create or replace function public.record_document_usage()
returns table(plan text, monthly_limit integer, used integer, remaining integer)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
  v_plan text;
  v_limit integer;
  v_used integer;
  v_month date:=date_trunc('month',now())::date;
begin
  if v_user is null then raise exception 'Unauthorized'; end if;
  v_plan:=coalesce(public.billing_effective_plan(v_user),'free');
  v_limit:=public.billing_plan_limit(v_plan);

  insert into public.billing_usage_monthly(user_id,month_start,feature,usage_count,updated_at)
  values(v_user,v_month,'smart_document',1,now())
  on conflict(user_id,month_start,feature)
  do update set usage_count=public.billing_usage_monthly.usage_count+1,updated_at=now()
  returning usage_count into v_used;

  return query
  select
    v_plan,
    v_limit,
    v_used,
    case when v_limit is null then null else greatest(0,v_limit-v_used) end;
end
$$;

create or replace function public.get_billing_summary()
returns table(plan text,status text,monthly_limit integer,used integer,remaining integer,founder_number integer,trial_end timestamptz,current_period_end timestamptz,cancel_at_period_end boolean)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
  v_plan text;
  v_status text;
  v_limit integer;
  v_used integer;
  v_month date:=date_trunc('month',now())::date;
  v_founder integer;
  v_trial timestamptz;
  v_period timestamptz;
  v_cancel boolean;
begin
  if v_user is null then raise exception 'Unauthorized'; end if;

  select coalesce(b.plan,'free'),coalesce(b.status,'free'),b.founder_number,b.trial_end,b.current_period_end,coalesce(b.cancel_at_period_end,false)
  into v_plan,v_status,v_founder,v_trial,v_period,v_cancel
  from (select 1) seed
  left join public.billing_accounts b on b.user_id=v_user;

  if not (v_plan in ('boekuna','pro') and v_status in ('trialing','active')) then
    v_plan:='free';
  end if;

  v_limit:=public.billing_plan_limit(v_plan);
  select coalesce(u.usage_count,0) into v_used
  from (select 1) seed
  left join public.billing_usage_monthly u
    on u.user_id=v_user and u.month_start=v_month and u.feature='smart_document';

  return query
  select
    v_plan,
    v_status,
    v_limit,
    v_used,
    case when v_limit is null then null else greatest(0,v_limit-v_used) end,
    v_founder,
    v_trial,
    v_period,
    v_cancel;
end
$$;
