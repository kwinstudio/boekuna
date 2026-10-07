-- BOEKUNA 30-day tester invite-code access.
-- Replaces the abandoned, never-deployed tester draft.
-- Codes are one-time, hash-only at rest, and grant the normal Boekuna plan.
-- No Stripe customer, trial, coupon, payment method or automatic charge is created.

begin;

create table if not exists private.tester_invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash bytea not null unique,
  campaign text not null default 'manual',
  created_at timestamptz not null default now(),
  code_expires_at timestamptz,
  duration_days smallint not null default 30 check (duration_days = 30),
  status text not null default 'issued' check (status in ('issued','redeemed','expired','revoked')),
  redeemed_at timestamptz,
  redeemed_by_user_id uuid references auth.users(id) on delete set null,
  access_activated_at timestamptz,
  access_expires_at timestamptz,
  constraint tester_invite_codes_redeemed_shape check (
    (status='redeemed' and redeemed_at is not null and redeemed_by_user_id is not null
      and access_activated_at is not null and access_expires_at is not null)
    or
    (status<>'redeemed')
  )
);

create unique index if not exists tester_invite_codes_one_redemption_per_user_uidx
  on private.tester_invite_codes(redeemed_by_user_id)
  where redeemed_by_user_id is not null;

create index if not exists tester_invite_codes_campaign_idx
  on private.tester_invite_codes(campaign,created_at);

alter table private.tester_invite_codes enable row level security;
grant usage on schema private to service_role;
revoke all on table private.tester_invite_codes from public,anon,authenticated;
grant select,insert,update,delete on table private.tester_invite_codes to service_role;

comment on table private.tester_invite_codes is
  'Private one-time BOEKUNA tester invite-code inventory. Only SHA-256 code hashes are stored.';

create table if not exists private.tester_code_redemption_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  attempts integer not null check (attempts >= 0),
  updated_at timestamptz not null default now()
);

alter table private.tester_code_redemption_attempts enable row level security;
revoke all on table private.tester_code_redemption_attempts from public,anon,authenticated;
grant select,insert,update,delete on table private.tester_code_redemption_attempts to service_role;

create or replace function public.generate_tester_invite_codes(
  p_count integer,
  p_campaign text,
  p_duration_days integer default 30,
  p_code_expires_at timestamptz default null
)
returns table(
  code text,
  campaign text,
  duration_days integer,
  code_expires_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_campaign text:=left(coalesce(nullif(btrim(p_campaign),''),'manual'),80);
  v_alphabet constant text:='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_hash bytea;
  v_generated integer:=0;
  v_attempts integer:=0;
  i integer;
begin
  if p_count is null or p_count<1 or p_count>500 then
    raise exception 'INVALID_TESTER_CODE_COUNT';
  end if;
  if p_duration_days<>30 then
    raise exception 'INVALID_TESTER_CODE_DURATION';
  end if;
  if p_code_expires_at is not null and p_code_expires_at<=now() then
    raise exception 'INVALID_TESTER_CODE_EXPIRY';
  end if;

  while v_generated<p_count loop
    v_attempts:=v_attempts+1;
    if v_attempts>p_count*20 then
      raise exception 'TESTER_CODE_GENERATION_EXHAUSTED';
    end if;

    v_code:='BOEKUNA-';
    for i in 1..16 loop
      v_code:=v_code||substr(
        v_alphabet,
        (get_byte(extensions.gen_random_bytes(1),0)%32)+1,
        1
      );
    end loop;
    v_hash:=extensions.digest(convert_to(v_code,'UTF8'),'sha256');

    insert into private.tester_invite_codes(
      code_hash,campaign,code_expires_at,duration_days,status
    )
    values(v_hash,v_campaign,p_code_expires_at,30,'issued')
    on conflict(code_hash) do nothing;

    if found then
      v_generated:=v_generated+1;
      code:=v_code;
      campaign:=v_campaign;
      duration_days:=30;
      code_expires_at:=p_code_expires_at;
      return next;
    end if;
  end loop;
end
$$;

revoke all on function public.generate_tester_invite_codes(integer,text,integer,timestamptz)
  from public,anon,authenticated;
grant execute on function public.generate_tester_invite_codes(integer,text,integer,timestamptz)
  to service_role;

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
       and e.plan in ('boekuna','pro')
       and e.access_state in ('active','grace')
       and e.valid_until is not null
       and e.valid_until>v_now
  ) or exists (
    select 1
      from public.billing_accounts b
     where b.user_id=v_user
       and b.plan in ('boekuna','pro')
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

-- Extend the existing billing summary without changing Stripe semantics.
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
       case when e.provider='stripe' then 0 when e.provider='tester_code' then 1 else 2 end,
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
    v_access_ends_at,
    v_tester_access_used;
end
$$;

revoke all on function public.get_billing_summary() from public,anon;
grant execute on function public.get_billing_summary() to authenticated,service_role;

comment on function public.redeem_tester_invite_code(text) is
  'Authenticated one-time redemption of a hashed BOEKUNA invite code. Grants exactly 30 days of Boekuna access; no Stripe state.';
comment on function public.generate_tester_invite_codes(integer,text,integer,timestamptz) is
  'Service-role only. Generates unique high-entropy invite codes; plaintext is returned once and only SHA-256 hashes are stored.';

commit;
