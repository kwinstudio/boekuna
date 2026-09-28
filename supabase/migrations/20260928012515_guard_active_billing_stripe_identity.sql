
alter table public.billing_accounts
  add constraint billing_active_requires_stripe_identity
  check (
    status <> 'active'
    or (
      stripe_customer_id is not null
      and stripe_subscription_id is not null
      and current_period_end is not null
    )
  ) not valid;
