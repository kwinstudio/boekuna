
-- Definitive Boekuna Early Access entitlement state machine.
-- Early Access is a Boekuna entitlement, never a Stripe trial.

create table if not exists public.early_access_campaign (
  id smallint primary key default 1 check (id = 1),
  max_claims smallint not null default 100 check (max_claims = 100),
  is_open boolean not null default true,
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.early_access_campaign(id,max_claims,is_open)
values (1,100,true)
on conflict (id) do nothing;

alter table public.early_access_campaign enable row level security;
revoke all on public.early_access_campaign from anon, authenticated;

create table if not exists public.early_access_claims (
  claim_number smallint primary key check (claim_number between 1 and 100),
  current_user_id uuid unique references auth.users(id) on delete set null,
  original_user_id uuid not null,
  started_at timestamptz not null,
  ends_at timestamptz not null,
  claimed_at timestamptz not null default now(),
  source text not null default 'verified_signup' check (source in ('verified_signup','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > started_at)
);

alter table public.early_access_claims enable row level security;
revoke all on public.early_access_claims from anon, authenticated;

create table if not exists public.early_access_identities (
  identity_hash text primary key,
  claim_number smallint not null references public.early_access_claims(claim_number) on delete restrict,
  first_seen_at timestamptz not null default now()
);

alter table public.early_access_identities enable row level security;
revoke all on public.early_access_identities from anon, authenticated;

-- Stripe mirror ordering / reconciliation watermark.
alter table public.billing_accounts
  add column if not exists last_stripe_event_created bigint not null default 0,
  add column if not exists last_stripe_event_id text;

-- Durable webhook processing state.
alter table public.billing_events
  add column if not exists event_created bigint,
  add column if not exists status text not null default 'processed',
  add column if not exists attempts integer not null default 1,
  add column if not exists processing_started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists last_error text;

alter table public.billing_events alter column processed_at drop not null;
alter table public.billing_events alter column processed_at drop default;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.billing_events'::regclass
      and conname='billing_events_status_check'
  ) then
    alter table public.billing_events
      add constraint billing_events_status_check
      check (status in ('processing','processed','failed'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.billing_events'::regclass
      and conname='billing_events_attempts_check'
  ) then
    alter table public.billing_events
      add constraint billing_events_attempts_check
      check (attempts between 1 and 25);
  end if;
end $$;

create or replace function private.ensure_early_access_claim(p_user_id uuid)
returns table(
  claim_number smallint,
  started_at timestamptz,
  ends_at timestamptz,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user auth.users%rowtype;
  v_email_hash text;
  v_existing_claim public.early_access_claims%rowtype;
  v_identity_claim smallint;
  v_next smallint;
  v_now timestamptz := clock_timestamp();
  v_kind text;
  v_eligible text;
begin
  perform pg_advisory_xact_lock(91827041);

  select * into v_user
  from auth.users
  where id = p_user_id;

  if not found
     or v_user.email is null
     or v_user.email_confirmed_at is null
     or coalesce(v_user.is_anonymous,false) then
    return;
  end if;

  -- Eligibility flags are server-controlled app_metadata, never user_metadata.
  v_kind := lower(coalesce(
    v_user.raw_app_meta_data->>'boekuna_account_type',
    v_user.raw_app_meta_data->>'account_type',
    ''
  ));
  v_eligible := lower(coalesce(v_user.raw_app_meta_data->>'early_access_eligible','true'));

  if v_kind in ('internal','test','demo')
     or v_eligible in ('false','0','no') then
    return;
  end if;

  v_email_hash := encode(
    extensions.digest(lower(trim(v_user.email)),'sha256'),
    'hex'
  );

  -- Same verified identity after account deletion/re-registration:
  -- relink the immutable original claim without restarting its dates.
  select i.claim_number into v_identity_claim
  from public.early_access_identities i
  where i.identity_hash = v_email_hash;

  if found then
    select * into v_existing_claim
    from public.early_access_claims c
    where c.claim_number = v_identity_claim
    for update;

    if v_existing_claim.current_user_id is null then
      update public.early_access_claims
      set current_user_id = p_user_id,
          updated_at = v_now
      where public.early_access_claims.claim_number = v_existing_claim.claim_number
        and current_user_id is null
      returning * into v_existing_claim;
    end if;

    if v_existing_claim.current_user_id = p_user_id then
      return query select
        v_existing_claim.claim_number,
        v_existing_claim.started_at,
        v_existing_claim.ends_at,
        false;
    end if;

    -- Identity is already attached to another live account.
    return;
  end if;

  -- Email change on an existing participant: preserve the claim and remember
  -- the new identity too, so neither old nor new email can restart Early Access.
  select * into v_existing_claim
  from public.early_access_claims c
  where c.current_user_id = p_user_id
  for update;

  if found then
    insert into public.early_access_identities(identity_hash,claim_number)
    values (v_email_hash,v_existing_claim.claim_number)
    on conflict (identity_hash) do nothing;

    return query select
      v_existing_claim.claim_number,
      v_existing_claim.started_at,
      v_existing_claim.ends_at,
      false;
    return;
  end if;

  perform 1
  from public.early_access_campaign
  where id=1
  for update;

  if not exists (
    select 1 from public.early_access_campaign
    where id=1 and is_open=true
  ) then
    return;
  end if;

  select s::smallint into v_next
  from generate_series(1,100) s
  where not exists (
    select 1 from public.early_access_claims c where c.claim_number=s
  )
  order by s
  limit 1;

  if v_next is null then
    update public.early_access_campaign
    set is_open=false,
        closed_at=coalesce(closed_at,v_now),
        updated_at=v_now
    where id=1;
    return;
  end if;

  insert into public.early_access_claims(
    claim_number,current_user_id,original_user_id,
    started_at,ends_at,claimed_at,source,updated_at
  )
  values (
    v_next,p_user_id,p_user_id,
    v_now,v_now + interval '90 days',v_now,'verified_signup',v_now
  )
  returning * into v_existing_claim;

  insert into public.early_access_identities(identity_hash,claim_number)
  values (v_email_hash,v_next);

  if v_next = 100 then
    update public.early_access_campaign
    set is_open=false,
        closed_at=v_now,
        updated_at=v_now
    where id=1;
  end if;

  return query select
    v_existing_claim.claim_number,
    v_existing_claim.started_at,
    v_existing_claim.ends_at,
    true;
end
$$;

revoke all on function private.ensure_early_access_claim(uuid) from public,anon,authenticated;
grant execute on function private.ensure_early_access_claim(uuid) to service_role;

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

create or replace function public.can_operate_bookkeeping()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    else private.entitlement_state_for_user(auth.uid()) <> 'expired_read_only'
  end
$$;

revoke all on function public.can_operate_bookkeeping() from public,anon;
grant execute on function public.can_operate_bookkeeping() to authenticated,service_role;

create or replace function public.billing_effective_plan(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case private.entitlement_state_for_user(p_user_id)
    when 'paid' then coalesce((
      select case when b.plan='pro' then 'pro' else 'boekuna' end
      from public.billing_accounts b
      where b.user_id=p_user_id
    ),'free')
    when 'early_access_active' then 'boekuna'
    else 'free'
  end
$$;

revoke all on function public.billing_effective_plan(uuid) from public,anon,authenticated;
grant execute on function public.billing_effective_plan(uuid) to service_role;

-- Safe public campaign status: no identity/user data.
create or replace function public.get_early_access_campaign_status()
returns table(is_open boolean, issued_claims integer, max_claims integer, closed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.is_open and count(e.claim_number) < c.max_claims,
    count(e.claim_number)::integer,
    c.max_claims::integer,
    c.closed_at
  from public.early_access_campaign c
  left join public.early_access_claims e on true
  where c.id=1
  group by c.id,c.is_open,c.max_claims,c.closed_at
$$;

revoke all on function public.get_early_access_campaign_status() from public;
grant execute on function public.get_early_access_campaign_status() to anon,authenticated,service_role;

-- Trigger is best-effort so an entitlement outage can never break Auth.
-- get_billing_summary below retries the claim on authenticated app load.
create or replace function private.handle_early_access_auth_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null then
    begin
      perform private.ensure_early_access_claim(new.id);
    exception when others then
      raise warning 'Early Access claim failed for auth user %: %',new.id,sqlerrm;
    end;
  end if;
  return new;
end
$$;

revoke all on function private.handle_early_access_auth_change() from public,anon,authenticated;

drop trigger if exists on_auth_user_early_access on auth.users;
create trigger on_auth_user_early_access
after insert or update of email,email_confirmed_at,raw_app_meta_data
on auth.users
for each row
execute function private.handle_early_access_auth_change();

-- Central, monotonic Stripe mirror update. Only service_role may call this.
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
  v_applied boolean := false;
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

  get diagnostics v_applied = row_count;
  return v_applied;
end
$$;

revoke all on function public.apply_stripe_subscription_state(uuid,text,text,text,text,timestamptz,boolean,bigint,text) from public,anon,authenticated;
grant execute on function public.apply_stripe_subscription_state(uuid,text,text,text,text,timestamptz,boolean,bigint,text) to service_role;

-- Billing summary keeps existing fields and adds explicit entitlement fields.
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
  can_operate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_plan text;
  v_billing_status text;
  v_entitlement text;
  v_limit integer;
  v_used integer;
  v_month date:=date_trunc('month',now())::date;
  v_claim integer;
  v_ea_start timestamptz;
  v_ea_end timestamptz;
  v_period timestamptz;
  v_cancel boolean;
begin
  if v_user is null then raise exception 'Unauthorized'; end if;

  -- Fallback claim path if the Auth trigger was temporarily unable to allocate.
  perform private.ensure_early_access_claim(v_user);

  v_entitlement:=private.entitlement_state_for_user(v_user);
  v_plan:=public.billing_effective_plan(v_user);

  select
    coalesce(b.status,'free'),
    b.current_period_end,
    coalesce(b.cancel_at_period_end,false)
  into v_billing_status,v_period,v_cancel
  from (select 1) seed
  left join public.billing_accounts b on b.user_id=v_user;

  select
    e.claim_number::integer,e.started_at,e.ends_at
  into v_claim,v_ea_start,v_ea_end
  from public.early_access_claims e
  where e.current_user_id=v_user;

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
    v_claim,
    null::timestamptz,
    v_period,
    v_cancel,
    v_entitlement,
    v_ea_start,
    v_ea_end,
    v_entitlement <> 'expired_read_only';
end
$$;

revoke all on function public.get_billing_summary() from public,anon;
grant execute on function public.get_billing_summary() to authenticated,service_role;

create or replace function public.check_document_quota()
returns table(allowed boolean, plan text, monthly_limit integer, used integer, remaining integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_plan text;
  v_limit integer;
  v_used integer;
  v_month date:=date_trunc('month',now())::date;
begin
  if v_user is null then raise exception 'Unauthorized'; end if;

  if private.entitlement_state_for_user(v_user)='expired_read_only' then
    return query select false,'free'::text,0,0,0;
    return;
  end if;

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
set search_path = ''
as $$
declare
  v_user uuid:=auth.uid();
  v_plan text;
  v_limit integer;
  v_used integer;
  v_month date:=date_trunc('month',now())::date;
begin
  if v_user is null then raise exception 'Unauthorized'; end if;
  if private.entitlement_state_for_user(v_user)='expired_read_only' then
    raise exception 'ACCOUNT_READ_ONLY' using errcode='42501';
  end if;

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

revoke all on function public.check_document_quota() from public,anon;
grant execute on function public.check_document_quota() to authenticated,service_role;
revoke all on function public.record_document_usage() from public,anon;
grant execute on function public.record_document_usage() to authenticated,service_role;

-- Explicit guards in RPC write paths.
create or replace function public.save_ledger_state(p_expected_version bigint, p_state jsonb)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_old_state jsonb;
  v_old_version bigint;
  v_new_version bigint;
begin
  if not public.can_operate_bookkeeping() then
    raise exception 'ACCOUNT_READ_ONLY' using errcode='42501';
  end if;

  select state, version into v_old_state, v_old_version
  from public.ledger_state
  where user_id=(select auth.uid()) and version=p_expected_version
  for update;

  if not found then return null; end if;

  insert into public.ledger_revisions(user_id,version,state)
  values ((select auth.uid()),v_old_version,v_old_state);

  update public.ledger_state
  set state=p_state,version=version+1,updated_at=now()
  where user_id=(select auth.uid())
  returning version into v_new_version;

  delete from public.ledger_revisions
  where user_id=(select auth.uid())
    and id not in (
      select id from public.ledger_revisions
      where user_id=(select auth.uid())
      order by created_at desc
      limit 25
    );

  return v_new_version;
end
$$;

create or replace function public.restore_ledger_revision(p_revision_id uuid,p_expected_version bigint)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_restore_state jsonb;
  v_current_state jsonb;
  v_current_version bigint;
  v_new_version bigint;
begin
  if not public.can_operate_bookkeeping() then
    raise exception 'ACCOUNT_READ_ONLY' using errcode='42501';
  end if;

  select state into v_restore_state
  from public.ledger_revisions
  where id=p_revision_id and user_id=(select auth.uid());

  if v_restore_state is null then return null; end if;

  select state,version into v_current_state,v_current_version
  from public.ledger_state
  where user_id=(select auth.uid()) and version=p_expected_version
  for update;

  if not found then return null; end if;

  insert into public.ledger_revisions(user_id,version,state)
  values ((select auth.uid()),v_current_version,v_current_state);

  update public.ledger_state
  set state=v_restore_state,version=version+1,updated_at=now()
  where user_id=(select auth.uid())
  returning version into v_new_version;

  return v_new_version;
end
$$;

create or replace function public.reserve_invoice_number(p_year integer,p_prefix text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_prefix text:=left(coalesce(nullif(trim(p_prefix),''),p_year::text||'-'),40);
  v_seed bigint:=1;
  v_num bigint;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if not public.can_operate_bookkeeping() then
    raise exception 'ACCOUNT_READ_ONLY' using errcode='42501';
  end if;
  if p_year < 2000 or p_year > 2100 then
    raise exception 'INVALID_YEAR' using errcode='22023';
  end if;

  select greatest(
    coalesce(nullif(ls.state->'meta'->>'nextInvoice','')::bigint,1),
    coalesce(max(
      case
        when left(inv.item->>'number',char_length(v_prefix))=v_prefix
         and substring(inv.item->>'number' from char_length(v_prefix)+1) ~ '^[0-9]+$'
        then substring(inv.item->>'number' from char_length(v_prefix)+1)::bigint
        else null
      end
    ),0)+1
  )
  into v_seed
  from public.ledger_state ls
  left join lateral jsonb_array_elements(coalesce(ls.state->'invoices','[]'::jsonb)) inv(item) on true
  where ls.user_id=v_uid
  group by ls.state;

  v_seed:=coalesce(v_seed,1);

  insert into public.invoice_sequences(user_id,book_year,prefix,next_number,updated_at)
  values(v_uid,p_year,v_prefix,v_seed+1,now())
  on conflict(user_id,book_year,prefix)
  do update set next_number=public.invoice_sequences.next_number+1,updated_at=now()
  returning next_number-1 into v_num;

  return v_prefix||lpad(v_num::text,4,'0');
end
$$;

-- Restrictive write guards: existing own-row + MFA policies stay in force.
drop policy if exists entitlement_guard_ledger_state_insert on public.ledger_state;
create policy entitlement_guard_ledger_state_insert
on public.ledger_state as restrictive for insert to authenticated
with check (public.can_operate_bookkeeping());

drop policy if exists entitlement_guard_ledger_state_update on public.ledger_state;
create policy entitlement_guard_ledger_state_update
on public.ledger_state as restrictive for update to authenticated
using (public.can_operate_bookkeeping())
with check (public.can_operate_bookkeeping());

drop policy if exists entitlement_guard_ledger_state_delete on public.ledger_state;
create policy entitlement_guard_ledger_state_delete
on public.ledger_state as restrictive for delete to authenticated
using (public.can_operate_bookkeeping());

drop policy if exists entitlement_guard_ledger_revisions_insert on public.ledger_revisions;
create policy entitlement_guard_ledger_revisions_insert
on public.ledger_revisions as restrictive for insert to authenticated
with check (public.can_operate_bookkeeping());

drop policy if exists entitlement_guard_ledger_revisions_delete on public.ledger_revisions;
create policy entitlement_guard_ledger_revisions_delete
on public.ledger_revisions as restrictive for delete to authenticated
using (public.can_operate_bookkeeping());

drop policy if exists entitlement_guard_documents_insert on public.documents;
create policy entitlement_guard_documents_insert
on public.documents as restrictive for insert to authenticated
with check (public.can_operate_bookkeeping());

drop policy if exists entitlement_guard_documents_update on public.documents;
create policy entitlement_guard_documents_update
on public.documents as restrictive for update to authenticated
using (public.can_operate_bookkeeping())
with check (public.can_operate_bookkeeping());

drop policy if exists entitlement_guard_documents_delete on public.documents;
create policy entitlement_guard_documents_delete
on public.documents as restrictive for delete to authenticated
using (public.can_operate_bookkeeping());

drop policy if exists entitlement_guard_invoice_sequences_insert on public.invoice_sequences;
create policy entitlement_guard_invoice_sequences_insert
on public.invoice_sequences as restrictive for insert to authenticated
with check (public.can_operate_bookkeeping());

drop policy if exists entitlement_guard_invoice_sequences_update on public.invoice_sequences;
create policy entitlement_guard_invoice_sequences_update
on public.invoice_sequences as restrictive for update to authenticated
using (public.can_operate_bookkeeping())
with check (public.can_operate_bookkeeping());

drop policy if exists entitlement_guard_storage_insert on storage.objects;
create policy entitlement_guard_storage_insert
on storage.objects as restrictive for insert to authenticated
with check (public.can_operate_bookkeeping());

drop policy if exists entitlement_guard_storage_update on storage.objects;
create policy entitlement_guard_storage_update
on storage.objects as restrictive for update to authenticated
using (public.can_operate_bookkeeping())
with check (public.can_operate_bookkeeping());

drop policy if exists entitlement_guard_storage_delete on storage.objects;
create policy entitlement_guard_storage_delete
on storage.objects as restrictive for delete to authenticated
using (public.can_operate_bookkeeping());

comment on table public.early_access_claims is
'Immutable Boekuna Early Access claims. Dates are independent of Stripe subscriptions and survive auth-user deletion via identity hashes.';

comment on table public.founding_offer_claims is
'LEGACY: old checkout-reserved Founding 100 Stripe trial model. Do not use for new Early Access entitlement.';
