-- Bonnen mailen (Kwin 2026-11-04, UI-trucs 18).
-- Every account with bookkeeping (ZZP, Pro, trial) can get its own address on the inbound domain,
-- e.g. kwinstudio-3f9a1c7e5b2d@bon.boekuna.nl. The edge function inbound-mail stores the attachments
-- of a mail sent there as documents; the app's normal processing does the rest.
-- The random part of the address is the secret: "Nieuw adres" revokes the old one at once.

create table if not exists public.inbound_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_part text not null,
  company_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint inbound_addresses_local_part_key unique (local_part),
  constraint inbound_addresses_local_part_format check (local_part ~ '^[a-z0-9][a-z0-9-]{4,62}[a-z0-9]$')
);
create unique index if not exists inbound_addresses_one_active_idx
  on public.inbound_addresses(user_id) where revoked_at is null;

alter table public.inbound_addresses enable row level security;
drop policy if exists inbound_addresses_select_own on public.inbound_addresses;
create policy inbound_addresses_select_own on public.inbound_addresses
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.inbound_addresses from anon, authenticated;
grant select on public.inbound_addresses to authenticated;

-- One row per mail and address: makes a replayed webhook harmless and keeps a per-day limit.
-- Only the outcome is kept here; sender and subject live on the user's own document.
create table if not exists public.inbound_mail_events (
  id uuid primary key default gen_random_uuid(),
  email_id text not null,
  local_part text not null,
  user_id uuid references auth.users(id) on delete cascade,
  outcome text not null default 'received',
  files integer not null default 0,
  created_at timestamptz not null default now(),
  constraint inbound_mail_events_once unique (email_id, local_part),
  constraint inbound_mail_events_outcome check (outcome in ('received','stored','no_files','unknown_address','not_entitled','limited','failed'))
);
create index if not exists inbound_mail_events_user_created_idx
  on public.inbound_mail_events(user_id, created_at desc);

alter table public.inbound_mail_events enable row level security;
drop policy if exists inbound_mail_events_select_own on public.inbound_mail_events;
create policy inbound_mail_events_select_own on public.inbound_mail_events
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.inbound_mail_events from anon, authenticated;
grant select on public.inbound_mail_events to authenticated;

-- "Kwin Studio" -> "kwinstudio-3f9a1c7e5b2d": a readable start and 48 random bits.
create or replace function private.inbound_local_part(p_hint text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  base text := left(regexp_replace(translate(lower(coalesce(p_hint, '')),
    'àáâãäåèéêëìíîïòóôõöùúûüýÿñç', 'aaaaaaeeeeiiiiooooouuuuyync'), '[^a-z0-9]+', '', 'g'), 20);
  tail text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
begin
  if length(base) < 2 then base := 'bon'; end if;
  return base || '-' || tail;
end
$$;
revoke all on function private.inbound_local_part(text) from public, anon, authenticated;

-- The signed-in user's address. Creates one when asked and the plan has bookkeeping;
-- p_rotate revokes the current address first. Each call refreshes the company details the
-- processor uses to tell a purchase from a sale.
create or replace function public.inbound_address_mine(
  p_hint text default '',
  p_company jsonb default '{}'::jsonb,
  p_create boolean default false,
  p_rotate boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  found text;
  company jsonb := jsonb_build_object(
    'name', left(coalesce(p_company->>'name', ''), 160),
    'tradeName', left(coalesce(p_company->>'tradeName', ''), 160),
    'kvk', left(coalesce(p_company->>'kvk', ''), 40),
    'vat', left(coalesce(p_company->>'vat', ''), 40));
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if (p_create or p_rotate) and private.entitlement_state_for_user(uid) <> 'paid' then
    raise exception 'PLAN_REQUIRED' using errcode = '42501';
  end if;
  if p_rotate then
    update public.inbound_addresses set revoked_at = now() where user_id = uid and revoked_at is null;
  end if;
  update public.inbound_addresses set company_context = company
    where user_id = uid and revoked_at is null returning local_part into found;
  if found is not null or not (p_create or p_rotate) then return found; end if;
  for attempt in 1..5 loop
    begin
      insert into public.inbound_addresses(user_id, local_part, company_context)
        values (uid, private.inbound_local_part(p_hint), company)
        returning local_part into found;
      return found;
    exception when unique_violation then
      -- A parallel call made the address first: return that one.
      select local_part into found from public.inbound_addresses where user_id = uid and revoked_at is null;
      if found is not null then return found; end if;
    end;
  end loop;
  raise exception 'ADDRESS_CREATE_FAILED';
end
$$;
revoke all on function public.inbound_address_mine(text, jsonb, boolean, boolean) from public, anon;
grant execute on function public.inbound_address_mine(text, jsonb, boolean, boolean) to authenticated;

-- For the edge function only: who an active address belongs to and whether that account may add documents.
create or replace function public.inbound_mail_target(p_local_part text)
returns table(user_id uuid, entitled boolean, company_context jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id, private.entitlement_state_for_user(a.user_id) = 'paid', a.company_context
  from public.inbound_addresses a
  where a.local_part = lower(p_local_part) and a.revoked_at is null
$$;
revoke all on function public.inbound_mail_target(text) from public, anon, authenticated;
grant execute on function public.inbound_mail_target(text) to service_role;

-- For the edge function only: the Resend API key and the webhook signing secret, kept in
-- Supabase Vault under inbound_mail_resend_api_key and inbound_mail_webhook_secret, so they are
-- never in the repo. Edge function secrets with the same purpose win when they are set.
create or replace function public.inbound_mail_secrets()
returns table(resend_api_key text, webhook_secret text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query select
    (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'inbound_mail_resend_api_key' order by s.updated_at desc limit 1),
    (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'inbound_mail_webhook_secret' order by s.updated_at desc limit 1);
end
$$;
revoke all on function public.inbound_mail_secrets() from public, anon, authenticated;
grant execute on function public.inbound_mail_secrets() to service_role;
