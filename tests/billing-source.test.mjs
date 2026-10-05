import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('kwinest/index.html');
const processor=read('kwinest/docprocessor/app.py');
const checkout=read('supabase/functions/billing-checkout/index.ts');
const portal=read('supabase/functions/billing-portal/index.ts');
const webhook=read('supabase/functions/billing-webhook/index.ts');
const sync=read('supabase/functions/billing-sync/index.ts');
const consume=read('supabase/functions/consume-quota/index.ts');
const analyze=read('supabase/functions/analyze-invoice/index.ts');
const migration=read('supabase/migrations/20260927111024_add_boekuna_billing_founders_and_monthly_quota.sql');
const unlimitedMigration=read('supabase/migrations/20260927190619_align_unlimited_plan_quota.sql');
const retiredOfferMigration=read('supabase/migrations/20260929122626_retire_first_100_early_access.sql');
const retiredOfferRpcHardening=read('supabase/migrations/20260929123036_reharden_retired_offer_billing_plan_rpc.sql');
const activeBillingGuardMigration=read('supabase/migrations/20260928012515_guard_active_billing_stripe_identity.sql');
const providerEntitlementMigration=read('supabase/migrations/20260930093553_provider_agnostic_billing_entitlements.sql');\nconst portalCapabilityMigration=read('supabase/migrations/20261005165000_expose_billing_portal_capability.sql');
const pricing=read('public/index.html');
const privacy=read('public/privacy/index.html');
const terms=read('public/voorwaarden/index.html');

for(const file of [checkout,portal,webhook,sync,consume,analyze,html]){
  assert.ok(!/sk_(?:live|test)_[A-Za-z0-9]+/.test(file),'Stripe secret key must never be committed or exposed client-side');
}

assert.ok(checkout.includes('amount:995'),'Boekuna monthly price must be €9.95');
assert.ok(checkout.includes('amount:1995'),'Unlimited monthly price must be €19.95');
assert.ok(checkout.includes('{CHECKOUT_SESSION_ID}'),'Checkout success must carry a server-verifiable session reference');
assert.ok(checkout.includes('mode","subscription'),'Checkout must explicitly create paid subscriptions');
assert.ok(checkout.includes('Idempotency-Key'),'Checkout must use Stripe idempotency for concurrent/double-click retries');
assert.ok(checkout.includes('boekuna-checkout:'),'Checkout idempotency key must be scoped to Boekuna user and plan');
assert.ok(checkout.includes('const stableExpiresAt=checkoutBucket*(10*60)+3600'),'Checkout expiry must stay stable inside the idempotency bucket');
assert.ok(checkout.includes('const payloadFingerprint=await shortSha256(p.toString())'),'Checkout idempotency must fingerprint the actual deterministic Stripe payload');
assert.ok(checkout.includes('":"+payloadFingerprint'),'Checkout idempotency key must change when Checkout parameters change');
assert.ok(checkout.includes('account?.stripe_subscription_id&&['),'Only a real Stripe subscription id may block a fresh checkout');
for(const legacy of ['addCalendarMonthsUnix','reserve_founding_offer','subscription_data[trial_end]','founder_number','Eerste 100-aanbod']){
  assert.ok(!checkout.includes(legacy),`Checkout must not contain legacy automatic-trial behavior: ${legacy}`);
}

assert.ok(portal.includes('/billing_portal/sessions'),'Paid users need Stripe Customer Portal management');\nassert.ok(portal.includes('stripe_customer_id'),'Billing portal must require a real Stripe customer identity');
assert.ok(webhook.includes('verifyStripeSignature'),'Webhook events must verify the Stripe signature before processing');
assert.ok(webhook.includes('stripe-signature'),'Webhook must require the Stripe-Signature header');
assert.ok(webhook.includes('Stripe event environment mismatch'),'Webhook must reject test/live environment mismatches');
assert.ok(webhook.includes('ageSeconds > 300'),'Webhook signature verification must reject replayed events outside the tolerance window');
assert.ok(webhook.includes('status: "processing"'),'Webhook must claim an event before side effects');
assert.ok(webhook.includes('status: "processed"'),'Webhook must mark completed events');
assert.ok(webhook.includes('status: "failed"'),'Failed webhook processing must remain retryable');
assert.ok(webhook.includes('apply_stripe_subscription_state'),'Webhook must use the monotonic Stripe state writer');
assert.ok(webhook.includes('checkout.session.completed'),'Checkout completion must be synchronized');
assert.ok(webhook.includes('customer.subscription.updated'),'Subscription changes must sync back to Boekuna');
assert.ok(webhook.includes('customer.subscription.deleted'),'Subscription cancellation must sync back to Boekuna');
assert.ok(webhook.includes('invoice.paid'),'Successful recurring payments must sync');
assert.ok(webhook.includes('invoice.payment_failed'),'Failed recurring payments must sync');
assert.ok(sync.includes('/checkout/sessions/'),'Successful checkout must be directly syncable even before webhook delivery');
assert.ok(sync.includes('client_reference_id'),'Billing sync must verify checkout ownership');
assert.ok(sync.includes('apply_stripe_subscription_state'),'Direct sync must use the same server-side Stripe state writer');

assert.ok(unlimitedMigration.includes("when 'pro' then null"),'Unlimited must have no monthly smart-document quota');
assert.ok(unlimitedMigration.includes("v_limit is null or v_used < v_limit"),'Unlimited quota check must remain allowed without a limit');
assert.ok(migration.includes("when 'boekuna' then 100"),'Boekuna quota must be 100');
assert.ok(migration.includes('else 10'),'Free quota must be 10');
assert.ok(retiredOfferMigration.includes("else 'free'"),'Retired offer entitlement must resolve non-paid users to free');
assert.ok(!retiredOfferMigration.includes("then 'early_access_active'"),'Retired offer migration must not grant Early Access');
assert.ok(!retiredOfferMigration.includes("then 'expired_read_only'"),'Retired offer migration must not create Early Access read-only states');
assert.ok(retiredOfferMigration.includes('drop trigger if exists on_auth_user_early_access'),'Automatic Early Access allocation trigger must be removed');
assert.ok(retiredOfferMigration.includes('drop function if exists public.reserve_founding_offer(uuid)'),'Legacy Founding 100 reservation API must be removed');
assert.ok(retiredOfferMigration.includes('drop function if exists private.ensure_early_access_claim(uuid)'),'Early Access claim allocator must be removed');
assert.ok(retiredOfferMigration.includes('null::integer'),'Billing summary must keep founder field null for backwards-compatible API shape');
assert.ok(retiredOfferMigration.includes('null::timestamptz'),'Billing summary must keep retired Early Access dates null');
assert.ok(retiredOfferRpcHardening.includes('from public, anon, authenticated'),'Retired-offer billing helper must not be directly executable by clients');
assert.ok(retiredOfferRpcHardening.includes('to service_role'),'Retired-offer billing helper must remain available to trusted server code');
assert.ok(activeBillingGuardMigration.includes('billing_active_requires_stripe_identity'),'Active billing rows must require real Stripe identity and period data');

// Provider-agnostic entitlement boundary: Stripe remains the web purchase provider,
// while product access reads a generic server-managed entitlement layer.
assert.ok(providerEntitlementMigration.includes('public.billing_entitlements'),'Provider-agnostic billing entitlement table must exist');
assert.match(providerEntitlementMigration,/perform\s+public\.apply_subscription_entitlement\([\s\S]*?['"]stripe['"]/i,'Stripe must map into the generic entitlement provider field');
assert.ok(providerEntitlementMigration.includes('public.apply_subscription_entitlement'),'Generic entitlement writer must be service-side');
assert.ok(providerEntitlementMigration.includes('from public.billing_entitlements e'),'Effective access must read provider-neutral entitlements');
assert.ok(providerEntitlementMigration.includes('public.apply_stripe_subscription_state'),'Current Stripe state writer must remain supported');
assert.ok(providerEntitlementMigration.includes("select b.user_id,'stripe'"),'Existing Stripe state must be backfilled safely');
assert.ok(!/drop\s+table\s+(if\s+exists\s+)?public\.billing_accounts/i.test(providerEntitlementMigration),'Provider migration must preserve legacy Stripe billing state');

assert.ok(consume.includes('can_operate_bookkeeping'),'Quota edge function must enforce server-side bookkeeping entitlement');
assert.ok(analyze.includes('can_operate_bookkeeping'),'Invoice AI must enforce entitlement server-side');
assert.ok(processor.includes('billing_quota_status(request)'),'Document processor must check server-side plan allowance');
assert.ok(processor.includes('record_billing_usage(request)'),'Successful smart documents must consume monthly usage');

assert.ok(html.includes("startSubscription('boekuna')"),'Frontend must offer explicit Boekuna checkout');
assert.ok(html.includes("startSubscription('pro')"),'Frontend must offer explicit Unlimited checkout');
assert.ok(html.includes('entitlement_status'),'Frontend must render the server-side entitlement state');\nassert.ok(html.includes('b.can_manage_subscription===true'),'Frontend must use the server-side Stripe portal capability');\nassert.ok(html.includes('Je toegang is actief. Er is geen Stripe-abonnement om hier te beheren.'),'Non-Stripe paid access must not show a broken Stripe portal action');\nassert.ok(portalCapabilityMigration.includes('can_manage_subscription boolean'),'Billing summary must expose portal capability explicitly');\nassert.ok(portalCapabilityMigration.includes("nullif(btrim(b.stripe_customer_id),'') is not null"),'Portal capability must require a real Stripe customer id');
for(const retired of ['early_access_active','expired_read_only','FOUNDING 100','Eerste 100','Early Access']){
  assert.ok(!html.includes(retired),`Retired First-100 state/copy must be absent from app UI: ${retired}`);
}

for(const value of ['Gratis','€9,95','€19,95']) assert.ok(pricing.includes(value),`Pricing missing ${value}`);
for(const stale of ['€6,95','€14,95','Binnenkort beschikbaar']) assert.ok(!pricing.includes(stale),`Retired public pricing copy still present: ${stale}`);
assert.ok(pricing.includes('register=1&plan=boekuna'),'Public Boekuna plan must hand off to the existing authenticated checkout intent');
assert.ok(pricing.includes('register=1&plan=pro'),'Public Unlimited plan must hand off to the existing authenticated checkout intent');
for(const retired of ['Founding 100','Eerste 100','Early Access','3 kalendermaanden gratis','90 dagen']){
  assert.ok(!pricing.toLowerCase().includes(retired.toLowerCase()),`Retired First-100 copy still present: ${retired}`);
}
assert.ok(privacy.includes('Stripe'),'Privacy policy must disclose Stripe');
assert.ok(!terms.includes('Early Access'),'Terms must not describe the retired Early Access offer');
assert.ok(!terms.includes('eerste 100'),'Terms must not describe the retired First-100 offer');

console.log('Boekuna billing source tests: PASS');
