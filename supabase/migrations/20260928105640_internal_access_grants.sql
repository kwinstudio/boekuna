create table if not exists public.internal_access_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null check (plan in ('boekuna','pro')),
  active boolean not null default true,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.internal_access_grants enable row level security;
revoke all on table public.internal_access_grants from anon, authenticated;
grant select, insert, update, delete on table public.internal_access_grants to service_role;

comment on table public.internal_access_grants is
  'Server-managed internal plan grants for owner/demo/support accounts. Separate from Stripe billing and Early Access.';

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
      from public.billing_accounts b
      where b.user_id=p_user_id
        and b.plan in ('boekuna','pro')
        and b.status='active'
        and b.current_period_end is not null
        and b.current_period_end > now()
    ) then 'paid'
    when exists (
      select 1
      from public.early_access_claims e
      where e.current_user_id=p_user_id
        and e.ends_at > now()
    ) then 'early_access_active'
    when exists (
      select 1
      from public.early_access_claims e
      where e.current_user_id=p_user_id
    ) then 'expired_read_only'
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
        limit 1
      ),
      (
        select case when b.plan='pro' then 'pro' else 'boekuna' end
        from public.billing_accounts b
        where b.user_id=p_user_id
      ),
      'free'
    )
    when 'early_access_active' then 'boekuna'
    else 'free'
  end
$$;

revoke all on function public.billing_effective_plan(uuid) from public,anon,authenticated;
grant execute on function public.billing_effective_plan(uuid) to service_role;
