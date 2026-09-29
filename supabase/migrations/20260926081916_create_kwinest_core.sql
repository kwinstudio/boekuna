
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ledger_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'document',
  mime_type text,
  storage_path text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists documents_user_created_idx
  on public.documents(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.ledger_state enable row level security;
alter table public.documents enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
on public.profiles for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "ledger_select_own" on public.ledger_state;
create policy "ledger_select_own"
on public.ledger_state for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "ledger_insert_own" on public.ledger_state;
create policy "ledger_insert_own"
on public.ledger_state for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "ledger_update_own" on public.ledger_state;
create policy "ledger_update_own"
on public.ledger_state for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "ledger_delete_own" on public.ledger_state;
create policy "ledger_delete_own"
on public.ledger_state for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "documents_select_own" on public.documents;
create policy "documents_select_own"
on public.documents for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own"
on public.documents for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "documents_update_own" on public.documents;
create policy "documents_update_own"
on public.documents for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own"
on public.documents for delete to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists ledger_state_set_updated_at on public.ledger_state;
create trigger ledger_state_set_updated_at
before update on public.ledger_state
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(user_id, company)
  values (new.id, coalesce(new.raw_user_meta_data->'company', '{}'::jsonb))
  on conflict (user_id) do nothing;

  insert into public.ledger_state(user_id, state)
  values (new.id, '{}'::jsonb)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kwinest-documents',
  'kwinest-documents',
  false,
  20971520,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "storage_select_own" on storage.objects;
create policy "storage_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'kwinest-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "storage_insert_own" on storage.objects;
create policy "storage_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'kwinest-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "storage_update_own" on storage.objects;
create policy "storage_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'kwinest-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'kwinest-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "storage_delete_own" on storage.objects;
create policy "storage_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'kwinest-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
