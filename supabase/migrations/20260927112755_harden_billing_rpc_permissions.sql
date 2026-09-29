alter function public.billing_plan_limit(text) set search_path = public;

revoke all on function public.billing_effective_plan(uuid) from public, anon, authenticated;
grant execute on function public.billing_effective_plan(uuid) to service_role;

revoke all on function public.check_document_quota() from public, anon;
grant execute on function public.check_document_quota() to authenticated, service_role;

revoke all on function public.record_document_usage() from public, anon;
grant execute on function public.record_document_usage() to authenticated, service_role;

revoke all on function public.get_billing_summary() from public, anon;
grant execute on function public.get_billing_summary() to authenticated, service_role;

revoke all on function public.reserve_founding_offer(uuid) from public, anon, authenticated;
grant execute on function public.reserve_founding_offer(uuid) to service_role;
