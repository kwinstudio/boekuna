revoke all on function public.billing_effective_plan(uuid) from public, anon, authenticated;
grant execute on function public.billing_effective_plan(uuid) to service_role;
