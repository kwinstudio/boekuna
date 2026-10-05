import fs from 'node:fs';
import assert from 'node:assert/strict';

const migrationPath='supabase/migrations/20261005223000_tester_access_entitlement.sql';
assert.ok(fs.existsSync(migrationPath),'90-day tester entitlement migration must exist');

const migration=fs.readFileSync(migrationPath,'utf8');
const provider=fs.readFileSync('supabase/migrations/20260930093553_provider_agnostic_billing_entitlements.sql','utf8');
const checkout=fs.readFileSync('supabase/functions/billing-checkout/index.ts','utf8');
const html=fs.readFileSync('kwinest/index.html','utf8');

for(const fragment of [
  'public.grant_tester_access',
  'public.revoke_tester_access',
  "interval '90 days'",
  'from auth.users',
  'email_confirmed_at is not null',
  'public.apply_subscription_entitlement',
  "'tester'",
  "'boekuna'",
  'access_source text',
  'access_ends_at timestamptz',
  "provider='tester'"
]){
  assert.ok(migration.toLowerCase().includes(fragment.toLowerCase()),'tester migration missing contract: '+fragment);
}

assert.ok(migration.includes('from public,anon,authenticated'),
  'tester grant/revoke RPCs must not be client-executable');
assert.ok(migration.includes('to service_role'),
  'tester grant/revoke RPCs must be restricted to trusted server/admin code');
assert.ok(!migration.toLowerCase().includes('early_access_claims'),
  'tester access must not revive retired Early Access claims');
assert.ok(!migration.toLowerCase().includes('reserve_founding_offer'),
  'tester access must not revive Founding 100 allocation');

assert.ok(provider.includes('e.valid_until > now()'),
  'provider-neutral entitlement must enforce expiry server-side');
assert.ok(!checkout.includes('trial_end'),
  'tester access must not be implemented as a Stripe trial');

for(const fragment of [
  'access_source',
  'Boekuna · Tester',
  'automatisch terug naar Gratis',
  'Geen kaart gekoppeld'
]){
  assert.ok(html.includes(fragment),'billing UI must distinguish tester access: '+fragment);
}

console.log('BOEKUNA 90-day tester access contract: PASS');
