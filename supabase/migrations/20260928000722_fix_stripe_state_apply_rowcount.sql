
create or replace function public.apply_stripe_subscription_state(
  p_user_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_plan text,
  p_status text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_event_created bigint,
  p_event_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer := 0;
begin
  if p_plan not in ('boekuna','pro') then
    raise exception 'INVALID_PLAN';
  end if;
  if p_status not in ('free','trialing','active','past_due','canceled','incomplete','incomplete_expired','unpaid','paused') then
    raise exception 'INVALID_STATUS';
  end if;
  if p_event_created is null or p_event_created < 0 then
    raise exception 'INVALID_EVENT_TIME';
  end if;

  insert into public.billing_accounts(
    user_id,stripe_customer_id,stripe_subscription_id,
    plan,status,trial_end,current_period_end,cancel_at_period_end,
    last_stripe_event_created,last_stripe_event_id,updated_at
  )
  values(
    p_user_id,nullif(p_stripe_customer_id,''),nullif(p_stripe_subscription_id,''),
    p_plan,p_status,null,p_current_period_end,coalesce(p_cancel_at_period_end,false),
    p_event_created,nullif(p_event_id,''),now()
  )
  on conflict(user_id) do update set
    stripe_customer_id=excluded.stripe_customer_id,
    stripe_subscription_id=excluded.stripe_subscription_id,
    plan=excluded.plan,
    status=excluded.status,
    trial_end=null,
    current_period_end=excluded.current_period_end,
    cancel_at_period_end=excluded.cancel_at_period_end,
    last_stripe_event_created=excluded.last_stripe_event_created,
    last_stripe_event_id=excluded.last_stripe_event_id,
    updated_at=now()
  where excluded.last_stripe_event_created >= public.billing_accounts.last_stripe_event_created;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end
$$;

revoke all on function public.apply_stripe_subscription_state(uuid,text,text,text,text,timestamptz,boolean,bigint,text) from public,anon,authenticated;
grant execute on function public.apply_stripe_subscription_state(uuid,text,text,text,text,timestamptz,boolean,bigint,text) to service_role;
