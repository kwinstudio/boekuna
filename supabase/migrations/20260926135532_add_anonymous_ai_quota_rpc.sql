
create or replace function public.consume_anonymous_ai_quota(p_client_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_client_count integer;
  v_global_count integer;
begin
  if p_client_hash is null or length(p_client_hash) < 16 then
    return false;
  end if;

  insert into public.anonymous_ai_usage(client_hash, feature, window_start, request_count)
  values (p_client_hash, 'invoice_ai', v_window, 1)
  on conflict (client_hash, feature, window_start)
  do update set request_count = public.anonymous_ai_usage.request_count + 1
  returning request_count into v_client_count;

  insert into public.anonymous_ai_usage(client_hash, feature, window_start, request_count)
  values ('__global__', 'invoice_ai', v_window, 1)
  on conflict (client_hash, feature, window_start)
  do update set request_count = public.anonymous_ai_usage.request_count + 1
  returning request_count into v_global_count;

  delete from public.anonymous_ai_usage
  where window_start < now() - interval '48 hours';

  return v_client_count <= 8 and v_global_count <= 60;
end;
$$;

revoke all on function public.consume_anonymous_ai_quota(text) from public, anon, authenticated;
grant execute on function public.consume_anonymous_ai_quota(text) to service_role;
