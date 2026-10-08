-- Account deletion must never leave a Stripe subscription running.
--
-- delete-account claims a closure row first, cancels every chargeable Stripe
-- subscription, and only then deletes data and the auth user. The row has no foreign
-- key to auth.users on purpose: it outlives the account so that
--   * billing-checkout refuses new checkouts while a deletion is in progress, and
--   * billing-webhook recognises late Stripe events for a deleted account and cancels
--     instead of failing on the missing user.
-- It holds only pseudonymous Stripe ids and timestamps (no e-mail, no name). Boekuna
-- keeps it as part of its own billing records (fiscal retention, AWR art. 52: 7 years).
-- Service role only: no grants for anon/authenticated.

create table if not exists public.account_closures (
  user_id uuid primary key,
  state text not null default 'pending' check (state in ('pending','billing_closed','completed','failed')),
  stripe_customer_id text null check (stripe_customer_id is null or stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  canceled_subscription_ids text[] not null default '{}',
  attempts integer not null default 1 check (attempts between 1 and 100),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  billing_closed_at timestamptz null,
  completed_at timestamptz null,
  last_error text null check (last_error is null or char_length(last_error) <= 1000)
);

alter table public.account_closures enable row level security;
revoke all on table public.account_closures from public, anon, authenticated;
grant select, insert, update on table public.account_closures to service_role;

-- Atomically claim (or re-claim) a closure. Returns claimed=false while another
-- request is still working on the same account (fresh 'pending' row), so double
-- clicks and retries cannot run two deletions at once. A failed or stale attempt
-- may be retried. Also returns the stored Stripe identity to close.
create or replace function public.begin_account_closure(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean := false;
  v_state text;
  v_customer text;
  v_subscription text;
  v_status text;
begin
  if p_user_id is null then
    raise exception 'INVALID_USER';
  end if;

  insert into public.account_closures(user_id, state)
  values (p_user_id, 'pending')
  on conflict (user_id) do nothing;
  if found then
    v_claimed := true;
  else
    update public.account_closures
       set state = 'pending',
           attempts = least(100, attempts + 1),
           updated_at = now(),
           last_error = null
     where user_id = p_user_id
       and (state = 'failed' or (state = 'pending' and updated_at < now() - interval '10 minutes'));
    v_claimed := found;
  end if;

  select state into v_state from public.account_closures where user_id = p_user_id;
  select stripe_customer_id, stripe_subscription_id, status
    into v_customer, v_subscription, v_status
    from public.billing_accounts where user_id = p_user_id;

  return jsonb_build_object(
    'claimed', v_claimed,
    'state', v_state,
    'stripe_customer_id', v_customer,
    'stripe_subscription_id', v_subscription,
    'subscription_status', v_status
  );
end
$$;

revoke all on function public.begin_account_closure(uuid) from public, anon, authenticated;
grant execute on function public.begin_account_closure(uuid) to service_role;
