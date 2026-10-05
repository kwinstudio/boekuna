-- Normalize legacy internal-access billing rows and validate the Stripe identity invariant.
-- Product access remains provider-neutral through internal_access_grants/billing_entitlements.

begin;

update public.billing_accounts b
set plan='free',
    status='free',
    current_period_end=null,
    cancel_at_period_end=false,
    updated_at=now()
where b.status='active'
  and (b.stripe_customer_id is null or b.stripe_subscription_id is null or b.current_period_end is null)
  and exists (
    select 1
    from public.internal_access_grants g
    where g.user_id=b.user_id
      and g.active=true
  );

alter table public.billing_accounts
  validate constraint billing_active_requires_stripe_identity;

commit;
