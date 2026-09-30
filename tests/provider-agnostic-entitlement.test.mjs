import fs from 'node:fs';
import assert from 'node:assert/strict';

const migrationPath='supabase/migrations/20260930093553_provider_agnostic_billing_entitlements.sql';
assert.ok(fs.existsSync(migrationPath),'provider-agnostic entitlement migration must exist');
const sql=fs.readFileSync(migrationPath,'utf8');

for(const fragment of [
  'create table if not exists public.billing_entitlements',
  'provider text not null',
  'external_subscription_ref text',
  'plan text not null',
  'provider_status text not null',
  'access_state text not null',
  'valid_until timestamptz',
  'provider_event_created bigint not null default 0',
  'enable row level security',
  'revoke all on table public.billing_entitlements from public,anon,authenticated',
  'grant select,insert,update,delete on table public.billing_entitlements to service_role',
  'create or replace function public.apply_subscription_entitlement',
  "p_provider='stripe'",
  'from public.billing_entitlements e',
  'private.entitlement_state_for_user',
  'public.billing_effective_plan'
]){
  assert.ok(sql.toLowerCase().includes(fragment.toLowerCase()),'migration missing provider-agnostic contract: '+fragment);
}

assert.ok(sql.includes("select b.user_id,'stripe'"),'migration must backfill existing Stripe subscriptions into the generic entitlement layer');
assert.ok(sql.includes('public.apply_stripe_subscription_state'),'Stripe writer must remain the existing provider integration boundary');
assert.ok(sql.includes('public.apply_subscription_entitlement'),'Stripe writer must also synchronize the generic entitlement boundary');
assert.ok(!/drop\s+table\s+(if\s+exists\s+)?public\.billing_accounts/i.test(sql),'migration must not drop legacy Stripe billing state');
assert.ok(!/drop\s+column/i.test(sql),'migration must be additive and non-destructive');

const billing=fs.readFileSync('tests/billing-source.test.mjs','utf8');
assert.ok(billing.includes('provider-agnostic')||billing.includes('billing_entitlements'),
  'billing regressions must explicitly cover provider-agnostic entitlement semantics');

console.log('BOEKUNA provider-agnostic entitlement contract: PASS');
