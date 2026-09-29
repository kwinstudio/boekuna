
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
grant usage on schema private to service_role;

create or replace function private.current_user_has_verified_mfa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from auth.mfa_factors
    where user_id = (select auth.uid())
      and status = 'verified'::auth.factor_status
  );
$function$;

revoke all on function private.current_user_has_verified_mfa() from public;
grant execute on function private.current_user_has_verified_mfa() to authenticated;
grant execute on function private.current_user_has_verified_mfa() to service_role;

drop policy if exists mfa_guard_profiles on public.profiles;
create policy mfa_guard_profiles on public.profiles as restrictive for all to authenticated
using (((select auth.jwt()->>'aal') = 'aal2') or not (select private.current_user_has_verified_mfa()))
with check (((select auth.jwt()->>'aal') = 'aal2') or not (select private.current_user_has_verified_mfa()));

drop policy if exists mfa_guard_ledger_state on public.ledger_state;
create policy mfa_guard_ledger_state on public.ledger_state as restrictive for all to authenticated
using (((select auth.jwt()->>'aal') = 'aal2') or not (select private.current_user_has_verified_mfa()))
with check (((select auth.jwt()->>'aal') = 'aal2') or not (select private.current_user_has_verified_mfa()));

drop policy if exists mfa_guard_documents on public.documents;
create policy mfa_guard_documents on public.documents as restrictive for all to authenticated
using (((select auth.jwt()->>'aal') = 'aal2') or not (select private.current_user_has_verified_mfa()))
with check (((select auth.jwt()->>'aal') = 'aal2') or not (select private.current_user_has_verified_mfa()));

drop policy if exists mfa_guard_ledger_revisions on public.ledger_revisions;
create policy mfa_guard_ledger_revisions on public.ledger_revisions as restrictive for all to authenticated
using (((select auth.jwt()->>'aal') = 'aal2') or not (select private.current_user_has_verified_mfa()))
with check (((select auth.jwt()->>'aal') = 'aal2') or not (select private.current_user_has_verified_mfa()));

drop policy if exists mfa_guard_storage on storage.objects;
create policy mfa_guard_storage on storage.objects as restrictive for all to authenticated
using (((select auth.jwt()->>'aal') = 'aal2') or not (select private.current_user_has_verified_mfa()))
with check (((select auth.jwt()->>'aal') = 'aal2') or not (select private.current_user_has_verified_mfa()));

drop function if exists public.current_user_has_verified_mfa();
