create or replace function public.consume_financial_automation_rate_limit(p_user_id uuid,p_action text,p_limit integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_window timestamptz:=date_trunc('hour',now());v_count integer;
begin
 if p_user_id is null or nullif(trim(p_action),'') is null or p_limit<1 or p_limit>5000 then raise exception 'INVALID_RATE_LIMIT_INPUT' using errcode='22023';end if;
 insert into public.api_usage(user_id,feature,window_start,request_count) values(p_user_id,'financial_automation:'||left(p_action,60),v_window,1)
 on conflict(user_id,feature,window_start) do update set request_count=public.api_usage.request_count+1 returning request_count into v_count;
 delete from public.api_usage where user_id=p_user_id and feature like 'financial_automation:%' and window_start<now()-interval '48 hours';
 return v_count<=p_limit;
end$$;
revoke all on function public.consume_financial_automation_rate_limit(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.consume_financial_automation_rate_limit(uuid,text,integer) to service_role;
