-- 14 dagen ZZP proberen (Kwin 2026-10-28, gebruikerssimulatie).
-- Every NEW account gets ZZP for 14 days: no card, no automatic payment, and
-- afterwards it is simply Start again. Existing accounts get nothing.
-- The trial is an ordinary entitlement row (provider 'trial'), so plan checks,
-- the document limit and get_billing_summary pick it up without changes.
-- A paid Stripe subscription ranks above it in get_billing_summary.
-- Turn it off: drop trigger on_auth_user_created_trial on auth.users;

create or replace function private.grant_signup_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.billing_entitlements(
      user_id,provider,plan,provider_status,access_state,valid_until,cancel_at_period_end
    ) values (
      new.id,'trial','zzp','trialing','active',now()+interval '14 days',false
    )
    on conflict (user_id,provider) do nothing;
  exception when others then
    -- A trial must never block a signup.
    raise warning 'grant_signup_trial failed for %: %',new.id,sqlerrm;
  end;
  return new;
end
$$;

revoke all on function private.grant_signup_trial() from public,anon,authenticated;

drop trigger if exists on_auth_user_created_trial on auth.users;
create trigger on_auth_user_created_trial
after insert on auth.users
for each row execute function private.grant_signup_trial();
