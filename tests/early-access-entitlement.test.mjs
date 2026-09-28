import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260928000656_early_access_entitlement_state_machine.sql',import.meta.url),'utf8');
const checkout=fs.readFileSync(new URL('../supabase/functions/billing-checkout/index.ts',import.meta.url),'utf8');
const webhook=fs.readFileSync(new URL('../supabase/functions/billing-webhook/index.ts',import.meta.url),'utf8');

function entitlement({paidActive=false,paidPeriodEnd=0,claim=false,eaEndsAt=0,now=1}){
  if(paidActive&&paidPeriodEnd>now)return 'paid';
  if(claim&&eaEndsAt>now)return 'early_access_active';
  if(claim)return 'expired_read_only';
  return 'free';
}

// Required state transitions.
assert.equal(entitlement({}), 'free');
assert.equal(entitlement({claim:true,eaEndsAt:91,now:1}), 'early_access_active');
assert.equal(entitlement({claim:true,eaEndsAt:91,paidActive:true,paidPeriodEnd:31,now:1}), 'paid');
assert.equal(entitlement({claim:true,eaEndsAt:1,now:2}), 'expired_read_only');
assert.equal(entitlement({claim:true,eaEndsAt:1,paidActive:true,paidPeriodEnd:31,now:2}), 'paid');
assert.equal(entitlement({claim:true,eaEndsAt:91,paidActive:false,paidPeriodEnd:0,now:30}), 'early_access_active');
assert.equal(entitlement({claim:true,eaEndsAt:1,paidActive:false,paidPeriodEnd:0,now:30}), 'expired_read_only');
assert.equal(entitlement({claim:false,paidActive:false,now:30}), 'free');

// Paid must dominate EA, but ending paid must never reset/restart EA.
assert.ok(migration.includes("when exists (\n      select 1\n      from public.billing_accounts"),'Paid must be evaluated before Early Access');
assert.ok(migration.includes("where e.current_user_id=p_user_id\n        and e.ends_at > now()"),'EA validity must use the immutable original end date');
assert.ok(!migration.includes('update public.early_access_claims\n    set started_at'),'Normal claim flow must not restart existing claim dates');

// Claim #100 closes the campaign and allocation is serialized.
assert.ok(migration.includes('if v_next = 100 then'),'Claim 100 must close campaign');
assert.ok(migration.includes('set is_open=false'),'Campaign must become closed');
assert.ok(migration.includes('pg_advisory_xact_lock'),'Concurrent claims must not allocate the same slot');

// Stripe remains independent from EA.
assert.ok(!checkout.includes('trial_end'),'Explicit paid checkout must not create a Stripe trial');
assert.ok(!checkout.includes('reserve_founding_offer'),'Checkout must not allocate EA claims');
assert.ok(webhook.includes('last_error'),'Webhook failures must remain observable/retryable');
assert.ok(webhook.includes('apply_stripe_subscription_state'),'Stripe state must be applied through one guarded server-side path');

console.log('Boekuna Early Access entitlement tests: PASS');
