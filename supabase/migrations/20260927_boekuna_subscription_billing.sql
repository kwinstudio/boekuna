-- Boekuna subscription billing, Founding 100 and monthly smart-document quotas
-- Applied to production on 2026-09-27.

create table if not exists public.billing_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text not null default 'free' check (plan in ('free','boekuna','pro')),
  status text not null default 'free' check (status in ('free','trialing','active','past_due','canceled','incomplete','incomplete_expired','unpaid','paused')),
  founder_number integer unique check (founder_number is null or founder_number between 1 and 100),
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.billing_accounts enable row level security;
revoke all on public.billing_accounts from anon, authenticated;
grant select on public.billing_accounts to authenticated;
drop policy if exists "billing_accounts_select_own" on public.billing_accounts;
create policy "billing_accounts_select_own" on public.billing_accounts for select to authenticated using (auth.uid() = user_id);

create table if not exists public.billing_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null,
  feature text not null default 'smart_document',
  usage_count integer not null default 0 check (usage_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, month_start, feature)
);
alter table public.billing_usage_monthly enable row level security;
revoke all on public.billing_usage_monthly from anon, authenticated;
grant select on public.billing_usage_monthly to authenticated;
drop policy if exists "billing_usage_select_own" on public.billing_usage_monthly;
create policy "billing_usage_select_own" on public.billing_usage_monthly for select to authenticated using (auth.uid() = user_id);

create table if not exists public.founding_offer_claims (
  user_id uuid primary key references auth.users(id) on delete cascade,
  founder_number integer not null unique check (founder_number between 1 and 100),
  status text not null default 'reserved' check (status in ('reserved','activated')),
  reserved_until timestamptz,
  checkout_session_id text,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.founding_offer_claims enable row level security;
revoke all on public.founding_offer_claims from anon, authenticated;

create table if not exists public.billing_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);
alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;

create or replace function public.billing_plan_limit(p_plan text)
returns integer language sql immutable as $$
  select case p_plan when 'pro' then 300 when 'boekuna' then 100 else 10 end
$$;

create or replace function public.billing_effective_plan(p_user_id uuid)
returns text language sql stable security definer set search_path=public as $$
  select case when b.plan in ('boekuna','pro') and b.status in ('trialing','active') then b.plan else 'free' end
  from (select 1) seed left join public.billing_accounts b on b.user_id=p_user_id
$$;

create or replace function public.check_document_quota()
returns table(allowed boolean, plan text, monthly_limit integer, used integer, remaining integer)
language plpgsql security definer set search_path=public as $$
declare
  v_user uuid:=auth.uid(); v_plan text; v_limit integer; v_used integer;
  v_month date:=date_trunc('month',now())::date;
begin
  if v_user is null then raise exception 'Unauthorized'; end if;
  v_plan:=coalesce(public.billing_effective_plan(v_user),'free');
  v_limit:=public.billing_plan_limit(v_plan);
  select coalesce(u.usage_count,0) into v_used
  from (select 1) seed
  left join public.billing_usage_monthly u
    on u.user_id=v_user and u.month_start=v_month and u.feature='smart_document';
  return query select v_used<v_limit,v_plan,v_limit,v_used,greatest(0,v_limit-v_used);
end $$;

create or replace function public.record_document_usage()
returns table(plan text, monthly_limit integer, used integer, remaining integer)
language plpgsql security definer set search_path=public as $$
declare
  v_user uuid:=auth.uid(); v_plan text; v_limit integer; v_used integer;
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
  return query select v_plan,v_limit,v_used,greatest(0,v_limit-v_used);
end $$;

create or replace function public.get_billing_summary()
returns table(plan text,status text,monthly_limit integer,used integer,remaining integer,founder_number integer,trial_end timestamptz,current_period_end timestamptz,cancel_at_period_end boolean)
language plpgsql security definer set search_path=public as $$
declare
  v_user uuid:=auth.uid(); v_plan text; v_status text; v_limit integer; v_used integer;
  v_month date:=date_trunc('month',now())::date; v_founder integer; v_trial timestamptz;
  v_period timestamptz; v_cancel boolean;
begin
  if v_user is null then raise exception 'Unauthorized'; end if;
  select coalesce(b.plan,'free'),coalesce(b.status,'free'),b.founder_number,b.trial_end,b.current_period_end,coalesce(b.cancel_at_period_end,false)
  into v_plan,v_status,v_founder,v_trial,v_period,v_cancel
  from (select 1) seed left join public.billing_accounts b on b.user_id=v_user;
  if not (v_plan in ('boekuna','pro') and v_status in ('trialing','active')) then v_plan:='free'; end if;
  v_limit:=public.billing_plan_limit(v_plan);
  select coalesce(u.usage_count,0) into v_used
  from (select 1) seed left join public.billing_usage_monthly u
    on u.user_id=v_user and u.month_start=v_month and u.feature='smart_document';
  return query select v_plan,v_status,v_limit,v_used,greatest(0,v_limit-v_used),v_founder,v_trial,v_period,v_cancel;
end $$;

create or replace function public.reserve_founding_offer(p_user_id uuid)
returns table(eligible boolean,founder_number integer)
language plpgsql security definer set search_path=public as $$
declare
  v_existing public.founding_offer_claims%rowtype; v_next integer;
begin
  perform pg_advisory_xact_lock(74542893);
  delete from public.founding_offer_claims where status='reserved' and reserved_until<now();
  select * into v_existing from public.founding_offer_claims where user_id=p_user_id;
  if found then
    if v_existing.status='activated' then return query select false,v_existing.founder_number; return; end if;
    update public.founding_offer_claims set reserved_until=now()+interval '24 hours',updated_at=now() where user_id=p_user_id;
    return query select true,v_existing.founder_number; return;
  end if;
  select coalesce(max(f.founder_number),0)+1 into v_next from public.founding_offer_claims f;
  if v_next>100 then return query select false,null::integer; return; end if;
  insert into public.founding_offer_claims(user_id,founder_number,status,reserved_until)
  values(p_user_id,v_next,'reserved',now()+interval '24 hours');
  return query select true,v_next;
end $$;

revoke all on function public.reserve_founding_offer(uuid) from public,anon,authenticated;
grant execute on function public.reserve_founding_offer(uuid) to service_role;
grant execute on function public.check_document_quota() to authenticated;
grant execute on function public.record_document_usage() to authenticated;
grant execute on function public.get_billing_summary() to authenticated;
grant execute on function public.billing_effective_plan(uuid) to service_role;
grant execute on function public.billing_plan_limit(text) to service_role;
