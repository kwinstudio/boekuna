-- Kwin 2026-11-01 ("slechte reviews concurrenten" 10): a failed subscription payment no longer locks
-- someone out straight away. Stripe status past_due gives 14 days of 'grace' access (or less, when the paid
-- period ends sooner) while Stripe retries the payment. Everything else is unchanged from
-- 20261008170000_pricing_v2_plans_and_intervals.sql (section 7).

create or replace function public.apply_stripe_subscription_state_v2(
  p_user_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_plan text,
  p_status text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_event_created bigint,
  p_event_id text,
  p_billing_interval text,
  p_stripe_price_id text,
  p_unit_amount_cents integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_valid_until timestamptz;
  v_rows integer := 0;
  v_access_state text;
  v_plan text;
  v_interval text := nullif(lower(btrim(coalesce(p_billing_interval,''))),'');
  v_price text := nullif(btrim(coalesce(p_stripe_price_id,'')),'');
begin
  if lower(btrim(coalesce(p_plan,''))) not in ('boekuna','zzp','pro','business') then
    raise exception 'INVALID_PLAN';
  end if;
  v_plan := private.canonical_plan(p_plan);
  if v_interval is not null and v_interval not in ('month','year') then
    raise exception 'INVALID_INTERVAL';
  end if;
  if p_unit_amount_cents is not null and p_unit_amount_cents < 0 then
    raise exception 'INVALID_AMOUNT';
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
    billing_interval,stripe_price_id,unit_amount_cents,
    last_stripe_event_created,last_stripe_event_id,updated_at
  )
  values(
    p_user_id,nullif(p_stripe_customer_id,''),nullif(p_stripe_subscription_id,''),
    v_plan,p_status,null,p_current_period_end,coalesce(p_cancel_at_period_end,false),
    v_interval,v_price,p_unit_amount_cents,
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
    -- A pre-V2 writer passes no interval/price: keep what is known.
    billing_interval=coalesce(excluded.billing_interval,public.billing_accounts.billing_interval),
    stripe_price_id=coalesce(excluded.stripe_price_id,public.billing_accounts.stripe_price_id),
    unit_amount_cents=coalesce(excluded.unit_amount_cents,public.billing_accounts.unit_amount_cents),
    last_stripe_event_created=excluded.last_stripe_event_created,
    last_stripe_event_id=excluded.last_stripe_event_id,
    updated_at=now()
  where excluded.last_stripe_event_created >= public.billing_accounts.last_stripe_event_created;

  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    v_access_state:=case
      when p_status='active'
       and p_current_period_end is not null
       and p_current_period_end > now()
        then 'active'
      -- A failed renewal (past_due) keeps access for 14 days while Stripe retries: no lock-out, no fee.
      when p_status='past_due'
        then 'grace'
      else 'inactive'
    end;
    v_valid_until:=case
      when v_access_state='grace'
        then least(coalesce(p_current_period_end,now()+interval '14 days'),now()+interval '14 days')
      else p_current_period_end
    end;

    perform public.apply_subscription_entitlement(
      p_user_id,'stripe',p_stripe_customer_id,p_stripe_subscription_id,
      v_plan,p_status,v_access_state,v_valid_until,p_cancel_at_period_end,
      p_event_created,p_event_id
    );

    update public.billing_entitlements e
       set billing_interval=coalesce(v_interval,e.billing_interval),
           price_ref=coalesce(v_price,e.price_ref)
     where e.user_id=p_user_id
       and e.provider='stripe'
       and e.provider_event_created=p_event_created;

    if v_price is not null and v_interval is not null and nullif(p_stripe_subscription_id,'') is not null then
      insert into public.billing_subscription_prices(
        provider,external_subscription_ref,price_ref,user_id,plan,billing_interval,unit_amount_cents
      )
      values('stripe',p_stripe_subscription_id,v_price,p_user_id,v_plan,v_interval,p_unit_amount_cents)
      on conflict(provider,external_subscription_ref,price_ref) do update set
        last_seen_at=now();
    end if;
  end if;

  return v_rows > 0;
end
$$;

revoke all on function public.apply_stripe_subscription_state_v2(uuid,text,text,text,text,timestamptz,boolean,bigint,text,text,text,integer)
  from public,anon,authenticated;
grant execute on function public.apply_stripe_subscription_state_v2(uuid,text,text,text,text,timestamptz,boolean,bigint,text,text,text,integer)
  to service_role;
