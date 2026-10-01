-- Temporary BOEKUNA Developer Mode.
-- Purpose: short-lived preview entitlement for one real QA identity without mutating Stripe or production billing state.
-- Safe default: no service-side issuer call = no developer session = normal billing/auth.

create table if not exists public.developer_mode_sessions (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  origin text not null,
  environment text not null check (environment in ('development','preview','staging')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint developer_mode_session_token_length check (char_length(token) between 40 and 160),
  constraint developer_mode_session_expiry check (expires_at > created_at)
);

create index if not exists developer_mode_sessions_user_expiry_idx
  on public.developer_mode_sessions(user_id,expires_at);

alter table public.developer_mode_sessions enable row level security;
revoke all on table public.developer_mode_sessions from public,anon,authenticated;
grant select,insert,update,delete on table public.developer_mode_sessions to service_role;

create or replace function public.issue_developer_mode_session(
  p_user_id uuid,
  p_token text,
  p_origin text,
  p_environment text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_origin text:=trim(trailing '/' from coalesce(p_origin,''));
  v_environment text:=lower(trim(coalesce(p_environment,'')));
begin
  if auth.role() <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  if p_user_id is null or not exists(select 1 from auth.users u where u.id=p_user_id) then raise exception 'INVALID_QA_USER'; end if;
  if char_length(coalesce(p_token,'')) < 40 then raise exception 'INVALID_DEV_TOKEN'; end if;
  if v_environment not in ('development','preview','staging') then raise exception 'INVALID_DEV_ENVIRONMENT'; end if;
  if v_origin in (
    'https://app.boekuna.nl',
    'https://boekuna.nl',
    'https://www.boekuna.nl',
    'https://boekuna-boekhouding.onrender.com',
    'https://kwinest-boekhouding.onrender.com'
  ) then raise exception 'PRODUCTION_ORIGIN_FORBIDDEN'; end if;
  if p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '12 hours' then raise exception 'INVALID_DEV_EXPIRY'; end if;

  delete from public.developer_mode_sessions
   where expires_at<=now() or revoked_at is not null;

  insert into public.developer_mode_sessions(token,user_id,origin,environment,expires_at)
  values(p_token,p_user_id,v_origin,v_environment,p_expires_at)
  on conflict(token) do update set
    user_id=excluded.user_id,
    origin=excluded.origin,
    environment=excluded.environment,
    expires_at=excluded.expires_at,
    revoked_at=null;

  return true;
end
$$;

revoke all on function public.issue_developer_mode_session(uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.issue_developer_mode_session(uuid,text,text,text,timestamptz) to service_role;

create or replace function private.developer_mode_active(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_headers jsonb:='{}'::jsonb;
  v_token text;
  v_origin text;
begin
  if p_user_id is null then return false; end if;
  begin
    v_headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  exception when others then
    return false;
  end;
  v_token:=coalesce(v_headers->>'x-boekuna-dev-session','');
  v_origin:=trim(trailing '/' from coalesce(v_headers->>'origin',''));
  if char_length(v_token)<40 or v_origin='' then return false; end if;
  if v_origin in (
    'https://app.boekuna.nl',
    'https://boekuna.nl',
    'https://www.boekuna.nl',
    'https://boekuna-boekhouding.onrender.com',
    'https://kwinest-boekhouding.onrender.com'
  ) then return false; end if;

  return exists(
    select 1
      from public.developer_mode_sessions s
     where s.token=v_token
       and s.user_id=p_user_id
       and s.origin=v_origin
       and s.environment in ('development','preview','staging')
       and s.revoked_at is null
       and s.expires_at>now()
  );
end
$$;

revoke all on function private.developer_mode_active(uuid) from public,anon,authenticated;
grant execute on function private.developer_mode_active(uuid) to service_role;

create or replace function public.get_developer_billing_summary()
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
stable
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_used integer:=0;
  v_month date:=date_trunc('month',now())::date;
begin
  if v_user is null then raise exception 'Unauthorized'; end if;
  if not private.developer_mode_active(v_user) then raise exception 'DEVELOPER_MODE_DISABLED'; end if;

  select coalesce(u.usage_count,0) into v_used
    from (select 1) seed
    left join public.billing_usage_monthly u
      on u.user_id=v_user and u.month_start=v_month and u.feature='smart_document';

  return query select
    'pro'::text,
    'active'::text,
    null::integer,
    v_used,
    null::integer,
    null::integer,
    null::timestamptz,
    null::timestamptz,
    false,
    'paid'::text,
    null::timestamptz,
    null::timestamptz,
    true;
end
$$;

revoke all on function public.get_developer_billing_summary() from public,anon;
grant execute on function public.get_developer_billing_summary() to authenticated,service_role;

create or replace function public.check_developer_document_quota()
returns table(allowed boolean, plan text, monthly_limit integer, used integer, remaining integer)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_used integer:=0;
  v_month date:=date_trunc('month',now())::date;
begin
  if v_user is null then raise exception 'Unauthorized'; end if;
  if not private.developer_mode_active(v_user) then raise exception 'DEVELOPER_MODE_DISABLED'; end if;

  select coalesce(u.usage_count,0) into v_used
    from (select 1) seed
    left join public.billing_usage_monthly u
      on u.user_id=v_user and u.month_start=v_month and u.feature='smart_document';

  return query select true,'pro'::text,null::integer,v_used,null::integer;
end
$$;

revoke all on function public.check_developer_document_quota() from public,anon;
grant execute on function public.check_developer_document_quota() to authenticated,service_role;

create or replace function public.record_developer_document_usage()
returns table(plan text, monthly_limit integer, used integer, remaining integer)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_used integer:=0;
  v_month date:=date_trunc('month',now())::date;
begin
  if v_user is null then raise exception 'Unauthorized'; end if;
  if not private.developer_mode_active(v_user) then raise exception 'DEVELOPER_MODE_DISABLED'; end if;

  -- Deliberately no INSERT/UPDATE: preview activity must not mutate production billing usage.
  select coalesce(u.usage_count,0) into v_used
    from (select 1) seed
    left join public.billing_usage_monthly u
      on u.user_id=v_user and u.month_start=v_month and u.feature='smart_document';

  return query select 'pro'::text,null::integer,v_used,null::integer;
end
$$;

revoke all on function public.record_developer_document_usage() from public,anon;
grant execute on function public.record_developer_document_usage() to authenticated,service_role;

comment on table public.developer_mode_sessions is
  'TEMPORARY QA-only Developer Mode sessions. Never a production entitlement source; remove after development phase.';
