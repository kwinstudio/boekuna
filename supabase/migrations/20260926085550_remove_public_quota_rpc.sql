
drop function if exists public.consume_api_quota(text);
revoke all on public.api_usage from anon;
revoke insert, update, delete on public.api_usage from authenticated;
grant select on public.api_usage to authenticated;
