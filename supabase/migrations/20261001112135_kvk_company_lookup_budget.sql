-- Cost reservations are atomic across Edge Function instances. No query/name/
-- address is stored. Limits include unsuccessful upstream requests, conservatively.
create schema if not exists private;
create table if not exists private.kvk_lookup_counters (
  scope text not null,
  action text not null check (action in ('all','search','profile')),
  window_start timestamptz not null,
  request_count integer not null check (request_count >= 0),
  primary key (scope, action, window_start)
);
alter table private.kvk_lookup_counters enable row level security;
revoke all on private.kvk_lookup_counters from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.kvk_lookup_counters to service_role;
create policy kvk_counters_service_only on private.kvk_lookup_counters
  for all to service_role using (true) with check (true);

create or replace function public.consume_kvk_lookup_budget(p_user_id uuid, p_action text)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_user text := 'user:' || p_user_id::text;
  v_scope text[];
  v_action text[];
  v_start timestamptz[];
  v_end timestamptz[];
  v_limit integer[];
  v_count integer;
  v_retry integer := 0;
  i integer;
begin
  if p_user_id is null or p_action not in ('search','profile') then
    raise exception 'INVALID_KVK_BUDGET_REQUEST';
  end if;
  -- One bounded global lock also prevents parallel requests by the same user
  -- passing different windows before another transaction reserves its budget.
  perform pg_catalog.pg_advisory_xact_lock(20261001, 116);
  delete from private.kvk_lookup_counters where window_start < v_now - interval '32 days';
  v_scope := array[v_user,v_user,'global','global'];
  v_action := array[p_action,p_action,'all','all'];
  v_start := array[date_trunc('minute',v_now,'UTC'),date_trunc('day',v_now,'UTC'),date_trunc('second',v_now,'UTC'),date_trunc('month',v_now,'UTC')];
  v_end := array[v_start[1]+interval '1 minute',v_start[2]+interval '1 day',v_start[3]+interval '1 second',v_start[4]+interval '1 month'];
  v_limit := array[case when p_action='search' then 20 else 5 end,case when p_action='search' then 200 else 40 end,50,290000];
  if p_action='profile' then
    v_scope := array_append(v_scope,'global');
    v_action := array_append(v_action,'profile');
    v_start := array_append(v_start,date_trunc('month',v_now,'UTC'));
    v_end := array_append(v_end,v_start[5]+interval '1 month');
    -- At the reviewed tariff this is at most EUR 20/month of profile calls.
    v_limit := array_append(v_limit,1000);
  end if;
  for i in 1..array_length(v_scope,1) loop
    select request_count into v_count from private.kvk_lookup_counters
      where scope=v_scope[i] and action=v_action[i] and window_start=v_start[i];
    if coalesce(v_count,0)>=v_limit[i] then
      v_retry := greatest(v_retry,ceil(extract(epoch from (v_end[i]-v_now)))::integer);
    end if;
  end loop;
  if v_retry>0 then return jsonb_build_object('allowed',false,'retry_after_seconds',v_retry); end if;
  for i in 1..array_length(v_scope,1) loop
    insert into private.kvk_lookup_counters(scope,action,window_start,request_count)
      values(v_scope[i],v_action[i],v_start[i],1)
      on conflict(scope,action,window_start) do update
      set request_count=private.kvk_lookup_counters.request_count+1;
  end loop;
  return jsonb_build_object('allowed',true);
end;
$$;
revoke all on function public.consume_kvk_lookup_budget(uuid,text) from public, anon, authenticated;
grant execute on function public.consume_kvk_lookup_budget(uuid,text) to service_role;
