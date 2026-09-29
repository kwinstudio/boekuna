revoke all on public.billing_accounts from anon, authenticated;
drop policy if exists "billing_accounts_select_own" on public.billing_accounts;

revoke all on public.billing_usage_monthly from anon, authenticated;
drop policy if exists "billing_usage_select_own" on public.billing_usage_monthly;

grant execute on function public.get_billing_summary() to authenticated;
grant execute on function public.check_document_quota() to authenticated;
grant execute on function public.record_document_usage() to authenticated;
