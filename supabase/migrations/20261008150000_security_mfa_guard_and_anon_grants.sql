-- Compliance hardening (audit 2026-10-08, P1-008).
-- 1. The same RESTRICTIVE MFA guard that already protects documents, ledger_state, ledger_revisions,
--    profiles and storage.objects now also covers the newer financial tables. A user with a verified
--    MFA factor needs an aal2 session; users without MFA are unaffected. Own-row policies stay as is.
-- 2. anon never needs these tables (RLS already returned nothing), so the leftover default grants go.
do $migration$
declare
  t text;
  guard text := '((select auth.jwt()->>''aal'') = ''aal2'') or not (select private.current_user_has_verified_mfa())';
begin
  foreach t in array array[
    'bank_imports','bank_transactions','transaction_matches',
    'document_validation_results','document_duplicate_fingerprints',
    'invoice_sequences','feedback_reports','email_connections'
  ] loop
    if to_regclass('public.'||t) is null then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', 'mfa_guard_'||t, t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (%s) with check (%s)',
      'mfa_guard_'||t, t, guard, guard);
  end loop;

  foreach t in array array['documents','ledger_state','ledger_revisions','profiles','email_connections'] loop
    if to_regclass('public.'||t) is not null then
      execute format('revoke all on public.%I from anon', t);
    end if;
  end loop;
end
$migration$;
