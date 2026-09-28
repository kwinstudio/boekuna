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
const migration=read('supabase/migrations/20260927_boekuna_subscription_billing.sql');
const unlimitedMigration=read('supabase/migrations/20260927_align_unlimited_plan_quota.sql');
const earlyAccessMigration=read('supabase/migrations/20260928000656_early_access_entitlement_state_machine.sql');
const pricing=read('public/prijzen/index.html');
const privacy=read('public/privacy/index.html');
const terms=read('public/voorwaarden/index.html');

for(const file of [checkout,portal,webhook,sync,consume,analyze,html]){
  assert.ok(!/sk_(?:live|test)_[A-Za-z0-9]+/.test(file),'Stripe secret key must never be committed or exposed client-side');
}

assert.ok(checkout.includes('amount:995'),'Boekuna monthly price must be €9.95');
assert.ok(checkout.includes('amount:1995'),'Unlimited monthly price must be €19.95');
assert.ok(checkout.includes('{CHECKOUT_SESSION_ID}'),'Checkout success must carry a server-verifiable session reference');
assert.ok(checkout.includes('mode","subscription'),'Checkout must explicitly create paid subscriptions');
for(const legacy of ['addCalendarMonthsUnix','reserve_founding_offer','subscription_data[trial_end]','founder_number','Eerste 100-aanbod']){
  assert.ok(!checkout.includes(legacy),`Checkout must not contain legacy automatic-trial behavior: ${legacy}`);
}

assert.ok(portal.includes('/billing_portal/sessions'),'Paid users need Stripe Customer Portal management');
assert.ok(webhook.includes('verifyStripeSignature'),'Webhook events must verify the Stripe signature before processing');
assert.ok(webhook.includes('stripe-signature'),'Webhook must require the Stripe-Signature header');
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
assert.ok(earlyAccessMigration.includes("then 'early_access_active'"),'EA state must be derived server-side');
assert.ok(earlyAccessMigration.includes("then 'expired_read_only'"),'Expired EA state must be derived server-side');
assert.ok(earlyAccessMigration.includes("when 'early_access_active' then 'boekuna'"),'EA must receive normal Boekuna plan entitlements');
assert.ok(earlyAccessMigration.includes("interval '90 days'"),'EA must last 90 days');
assert.ok(earlyAccessMigration.includes('claim_number between 1 and 100'),'EA claims must be capped at 100');
assert.ok(earlyAccessMigration.includes('pg_advisory_xact_lock'),'EA allocation must be serialized against race conditions');
assert.ok(earlyAccessMigration.includes('on delete set null'),'EA claim must survive Auth account deletion');
assert.ok(earlyAccessMigration.includes('early_access_identities'),'EA identity must survive re-registration without resetting');
assert.ok(earlyAccessMigration.includes('public.can_operate_bookkeeping()'),'Read-only must be enforced server-side');
assert.ok(earlyAccessMigration.includes('as restrictive for update to authenticated'),'Read-only RLS must guard direct update paths');
assert.ok(earlyAccessMigration.includes('last_stripe_event_created'),'Out-of-order Stripe events must be guarded by a monotonic watermark');

assert.ok(consume.includes('can_operate_bookkeeping'),'Quota edge function must block expired read-only users server-side');
assert.ok(consume.includes('ACCOUNT_READ_ONLY'),'Quota edge function needs an explicit read-only result');
assert.ok(analyze.includes('can_operate_bookkeeping'),'Invoice AI must enforce entitlement server-side');
assert.ok(processor.includes('billing_quota_status(request)'),'Document processor must check server-side plan allowance');
assert.ok(processor.includes('record_billing_usage(request)'),'Successful smart documents must consume monthly usage');

assert.ok(html.includes("startSubscription('boekuna')"),'Frontend must offer explicit Boekuna checkout');
assert.ok(html.includes("startSubscription('pro')"),'Frontend must offer explicit Unlimited checkout');
assert.ok(html.includes('entitlement_status'),'Frontend must render the server-side entitlement state');
assert.ok(html.includes('expired_read_only'),'Frontend must recognize read-only state');
assert.ok(!html.includes('Eerste 100 klanten met een betaald plan: eerste 3 kalendermaanden €0.'),'Legacy trial upsell must be gone');

for(const value of ['Gratis','€9,95','€19,95','90 dagen Early Access']) assert.ok(pricing.includes(value),`Pricing missing ${value}`);
for(const legacy of ['Founding 100','3 kalendermaanden gratis','proefperiode loopt 3 kalendermaanden']) assert.ok(!pricing.includes(legacy),`Legacy trial copy still present: ${legacy}`);
assert.ok(privacy.includes('Stripe'),'Privacy policy must disclose Stripe');
assert.ok(terms.includes('8a. Early Access'),'Terms must describe Early Access');
assert.ok(terms.includes('geen Stripe-abonnement'),'Terms must state that Early Access does not create a Stripe subscription');
assert.ok(terms.includes('geen automatische afschrijving'),'Terms must state that Early Access never auto-charges');

console.log('Boekuna billing source tests: PASS');
