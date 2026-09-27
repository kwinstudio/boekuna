import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('kwinest/index.html');
const processor=read('kwinest/docprocessor/app.py');
const checkout=read('supabase/functions/billing-checkout/index.ts');
const portal=read('supabase/functions/billing-portal/index.ts');
const webhook=read('supabase/functions/billing-webhook/index.ts');
const sync=read('supabase/functions/billing-sync/index.ts');
const migration=read('supabase/migrations/20260927_boekuna_subscription_billing.sql');
const unlimitedMigration=read('supabase/migrations/20260927_align_unlimited_plan_quota.sql');
const pricing=read('public/prijzen/index.html');
const privacy=read('public/privacy/index.html');
const terms=read('public/voorwaarden/index.html');

for(const file of [checkout,portal,webhook,sync,html]){
  assert.ok(!/sk_(?:live|test)_[A-Za-z0-9]+/.test(file),'Stripe secret key must never be committed or exposed client-side');
}
assert.ok(checkout.includes('amount:995'),'Boekuna monthly price must be €9.95');
assert.ok(checkout.includes('amount:1995'),'Unlimited monthly price must be €19.95');
assert.ok(checkout.includes('addCalendarMonthsUnix(3)'),'Founding offer must end after 3 calendar months');
assert.ok(checkout.includes('payment_method_collection'),'Checkout must collect a payment method before a free trial');
assert.ok(checkout.includes('tax_behavior]","exclusive'),'Public ex-VAT prices must be tax-exclusive in Checkout');
assert.ok(checkout.includes('reserve_founding_offer'),'Founding 100 allocation must be server-side');
assert.ok(checkout.includes('{CHECKOUT_SESSION_ID}'),'Checkout success must carry a server-verifiable session reference');
assert.ok(checkout.includes('expires_at'),'Abandoned Founding checkout sessions must expire');
assert.ok(portal.includes('/billing_portal/sessions'),'Paid users need Stripe Customer Portal management');
assert.ok(webhook.includes('verifyStripeSignature'),'Webhook events must verify the Stripe signature before processing');
assert.ok(webhook.includes('stripe-signature'),'Webhook must require the Stripe-Signature header');
assert.ok(webhook.includes('ageSeconds > 300'),'Webhook signature verification must reject replayed events outside the tolerance window');
assert.ok(webhook.includes('billing_events'),'Webhook handling must be idempotent');
assert.ok(webhook.includes('checkout.session.completed'),'Checkout completion must activate billing state');
assert.ok(webhook.includes('customer.subscription.updated'),'Subscription changes must sync back to Boekuna');
assert.ok(sync.includes('/checkout/sessions/'),'Successful checkout must be directly syncable even before webhook delivery');
assert.ok(sync.includes('client_reference_id'),'Billing sync must verify checkout ownership');
assert.ok(unlimitedMigration.includes("when 'pro' then null"),"Unlimited must have no monthly smart-document quota");
assert.ok(unlimitedMigration.includes("v_limit is null or v_used < v_limit"),"Unlimited quota check must remain allowed without a limit");
assert.ok(migration.includes("when 'boekuna' then 100"),'Boekuna quota must be 100');
assert.ok(migration.includes('else 10'),'Free quota must be 10');
assert.ok(migration.includes('between 1 and 100'),'Founding offer must be capped at 100');
assert.ok(migration.includes("interval '75 minutes'"),'Abandoned founder reservations should release quickly');
assert.ok(processor.includes('billing_quota_status(request)'),'Document processor must check plan allowance');
assert.ok(processor.includes('record_billing_usage(request)'),'Successful smart documents must consume monthly usage');
assert.ok(processor.includes('HTTPException(402'),'Quota exhaustion must block server processing');
assert.ok(html.includes("startSubscription('boekuna')"),'Frontend must offer Boekuna checkout');
assert.ok(html.includes("startSubscription('pro')"),'Frontend must offer Pro checkout');
assert.ok(html.includes('Beheer abonnement'),'Paid users must be able to reach subscription management');
assert.ok(html.includes("Number(err?.status||0)===402"),'Client fallback must not bypass a quota rejection');
for(const value of ['Gratis','€9,95','€19,95','3 kalendermaanden'])assert.ok(pricing.includes(value),`Pricing missing ${value}`);
for(const legacy of ['€29,95','Eerste 30 dagen'])assert.ok(!pricing.includes(legacy),`Legacy pricing/promo still present: ${legacy}`);
assert.ok(privacy.includes('Stripe'),'Privacy policy must disclose Stripe');
assert.ok(terms.includes('Founding 100'),'Terms must document the Founding 100 trial');
assert.ok(terms.includes('maandelijks door'),'Terms must explain recurring billing');

console.log('Boekuna billing source tests: PASS');
