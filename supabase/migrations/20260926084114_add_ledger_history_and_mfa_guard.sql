
create table if not exists public.ledger_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version bigint not null,
  state jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists ledger_revisions_user_created_idx
  on public.ledger_revisions(user_id, created_at desc);

alter table public.ledger_revisions enable row level security;

drop policy if exists "ledger_revisions_select_own" on public.ledger_revisions;
create policy "ledger_revisions_select_own"
on public.ledger_revisions for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "ledger_revisions_insert_own" on public.ledger_revisions;
create policy "ledger_revisions_insert_own"
on public.ledger_revisions for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "ledger_revisions_delete_own" on public.ledger_revisions;
create policy "ledger_revisions_delete_own"
on public.ledger_revisions for delete to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.save_ledger_state(
  p_expected_version bigint,
  p_state jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old_state jsonb;
  v_old_version bigint;
  v_new_version bigint;
begin
  select state, version
    into v_old_state, v_old_version
  from public.ledger_state
  where user_id = (select auth.uid())
    and version = p_expected_version
  for update;

  if not found then
    return null;
  end if;

  insert into public.ledger_revisions(user_id, version, state)
  values ((select auth.uid()), v_old_version, v_old_state);

  update public.ledger_state
  set state = p_state,
      version = version + 1,
      updated_at = now()
  where user_id = (select auth.uid())
  returning version into v_new_version;

  delete from public.ledger_revisions
  where user_id = (select auth.uid())
    and id not in (
      select id
      from public.ledger_revisions
      where user_id = (select auth.uid())
      order by created_at desc
      limit 25
    );

  return v_new_version;
end;
$$;

revoke all on function public.save_ledger_state(bigint,jsonb) from public;
revoke all on function public.save_ledger_state(bigint,jsonb) from anon;
grant execute on function public.save_ledger_state(bigint,jsonb) to authenticated;

create or replace function public.restore_ledger_revision(
  p_revision_id uuid,
  p_expected_version bigint
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_restore_state jsonb;
  v_current_state jsonb;
  v_current_version bigint;
  v_new_version bigint;
begin
  select state into v_restore_state
  from public.ledger_revisions
  where id = p_revision_id
    and user_id = (select auth.uid());

  if v_restore_state is null then
    return null;
  end if;

  select state, version
    into v_current_state, v_current_version
  from public.ledger_state
  where user_id = (select auth.uid())
    and version = p_expected_version
  for update;

  if not found then
    return null;
  end if;

  insert into public.ledger_revisions(user_id, version, state)
  values ((select auth.uid()), v_current_version, v_current_state);

  update public.ledger_state
  set state = v_restore_state,
      version = version + 1,
      updated_at = now()
  where user_id = (select auth.uid())
  returning version into v_new_version;

  return v_new_version;
end;
$$;

revoke all on function public.restore_ledger_revision(uuid,bigint) from public;
revoke all on function public.restore_ledger_revision(uuid,bigint) from anon;
grant execute on function public.restore_ledger_revision(uuid,bigint) to authenticated;

-- If a user has opted into MFA, require an aal2 session for financial data.
drop policy if exists "mfa_guard_profiles" on public.profiles;
create policy "mfa_guard_profiles"
on public.profiles as restrictive for all to authenticated
using (
  (select auth.jwt()->>'aal') = 'aal2'
  or not exists (
    select 1 from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  )
)
with check (
  (select auth.jwt()->>'aal') = 'aal2'
  or not exists (
    select 1 from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  )
);

drop policy if exists "mfa_guard_ledger_state" on public.ledger_state;
create policy "mfa_guard_ledger_state"
on public.ledger_state as restrictive for all to authenticated
using (
  (select auth.jwt()->>'aal') = 'aal2'
  or not exists (
    select 1 from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  )
)
with check (
  (select auth.jwt()->>'aal') = 'aal2'
  or not exists (
    select 1 from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  )
);

drop policy if exists "mfa_guard_documents" on public.documents;
create policy "mfa_guard_documents"
on public.documents as restrictive for all to authenticated
using (
  (select auth.jwt()->>'aal') = 'aal2'
  or not exists (
    select 1 from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  )
)
with check (
  (select auth.jwt()->>'aal') = 'aal2'
  or not exists (
    select 1 from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  )
);

drop policy if exists "mfa_guard_ledger_revisions" on public.ledger_revisions;
create policy "mfa_guard_ledger_revisions"
on public.ledger_revisions as restrictive for all to authenticated
using (
  (select auth.jwt()->>'aal') = 'aal2'
  or not exists (
    select 1 from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  )
)
with check (
  (select auth.jwt()->>'aal') = 'aal2'
  or not exists (
    select 1 from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  )
);

drop policy if exists "mfa_guard_storage" on storage.objects;
create policy "mfa_guard_storage"
on storage.objects as restrictive for all to authenticated
using (
  (select auth.jwt()->>'aal') = 'aal2'
  or not exists (
    select 1 from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  )
)
with check (
  (select auth.jwt()->>'aal') = 'aal2'
  or not exists (
    select 1 from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  )
);
