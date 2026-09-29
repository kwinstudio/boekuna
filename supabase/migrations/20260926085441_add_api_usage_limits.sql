
create table if not exists public.api_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (user_id, feature, window_start)
);

alter table public.api_usage enable row level security;

drop policy if exists "api_usage_select_own" on public.api_usage;
create policy "api_usage_select_own"
on public.api_usage for select to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.consume_api_quota(p_feature text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_limit integer;
  v_window timestamptz := date_trunc('hour', now());
  v_count integer;
begin
  if v_user is null then
    return false;
  end if;

  v_limit := case p_feature
    when 'invoice_ai' then 40
    when 'invoice_email' then 120
    else 0
  end;

  if v_limit = 0 then
    return false;
  end if;

  insert into public.api_usage(user_id, feature, window_start, request_count)
  values (v_user, p_feature, v_window, 1)
  on conflict (user_id, feature, window_start)
  do update set request_count = public.api_usage.request_count + 1
  returning request_count into v_count;

  delete from public.api_usage
  where user_id = v_user and window_start < now() - interval '48 hours';

  return v_count <= v_limit;
end;
$$;

revoke all on function public.consume_api_quota(text) from public;
revoke all on function public.consume_api_quota(text) from anon;
grant execute on function public.consume_api_quota(text) to authenticated;

revoke all on public.api_usage from anon;
grant select on public.api_usage to authenticated;
