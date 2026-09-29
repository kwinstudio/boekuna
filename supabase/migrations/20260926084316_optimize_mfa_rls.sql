
drop policy if exists "mfa_guard_profiles" on public.profiles;
create policy "mfa_guard_profiles"
on public.profiles as restrictive for all to authenticated
using (
  ((select auth.jwt())->>'aal') = 'aal2'
  or not exists (
    select 1 from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  )
)
with check (
  ((select auth.jwt())->>'aal') = 'aal2'
  or not exists (
    select 1 from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  )
);

drop policy if exists "mfa_guard_ledger_state" on public.ledger_state;
create policy "mfa_guard_ledger_state"
on public.ledger_state as restrictive for all to authenticated
using (
  ((select auth.jwt())->>'aal') = 'aal2'
  or not exists (
    select 1 from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  )
)
with check (
  ((select auth.jwt())->>'aal') = 'aal2'
  or not exists (
    select 1 from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  )
);

drop policy if exists "mfa_guard_documents" on public.documents;
create policy "mfa_guard_documents"
on public.documents as restrictive for all to authenticated
using (
  ((select auth.jwt())->>'aal') = 'aal2'
  or not exists (
    select 1 from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  )
)
with check (
  ((select auth.jwt())->>'aal') = 'aal2'
  or not exists (
    select 1 from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  )
);

drop policy if exists "mfa_guard_ledger_revisions" on public.ledger_revisions;
create policy "mfa_guard_ledger_revisions"
on public.ledger_revisions as restrictive for all to authenticated
using (
  ((select auth.jwt())->>'aal') = 'aal2'
  or not exists (
    select 1 from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  )
)
with check (
  ((select auth.jwt())->>'aal') = 'aal2'
  or not exists (
    select 1 from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  )
);

drop policy if exists "mfa_guard_storage" on storage.objects;
create policy "mfa_guard_storage"
on storage.objects as restrictive for all to authenticated
using (
  ((select auth.jwt())->>'aal') = 'aal2'
  or not exists (
    select 1 from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  )
)
with check (
  ((select auth.jwt())->>'aal') = 'aal2'
  or not exists (
    select 1 from auth.mfa_factors
    where user_id = (select auth.uid()) and status = 'verified'
  )
);
