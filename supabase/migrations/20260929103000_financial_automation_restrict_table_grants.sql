-- Restrict financial automation tables to read-only access for authenticated clients.
-- Forward-only hardening: RLS protects row visibility; table ACLs must also deny all mutation-capable privileges.
revoke all privileges on table
  public.bank_imports,
  public.bank_transactions,
  public.transaction_matches,
  public.document_duplicate_fingerprints,
  public.document_validation_results
from anon, authenticated;

grant select on table
  public.bank_imports,
  public.bank_transactions,
  public.transaction_matches,
  public.document_duplicate_fingerprints,
  public.document_validation_results
to authenticated;
