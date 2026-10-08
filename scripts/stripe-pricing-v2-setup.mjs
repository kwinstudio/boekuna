#!/usr/bin/env node
// Boekuna Pricing V2: create the Stripe Products, the six recurring Prices and the
// Customer Portal configuration. Idempotent: existing lookup keys are reused.
//
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-pricing-v2-setup.mjs            # dry run
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-pricing-v2-setup.mjs --apply    # test mode
//
// Live mode needs both --apply and --live, and is only for after a successful test-mode
// release check and Kwin's explicit go. It creates prices; it never touches existing
// subscriptions, customers or payments.
import { CURRENCY, PLANS, PAID_PLAN_IDS, INTERVALS, lookupKey, sellablePlans } from '../supabase/functions/_shared/pricing.mjs';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const key = process.env.STRIPE_SECRET_KEY || '';
const live = key.startsWith('sk_live_') || key.startsWith('rk_live_');
if (!key) { console.error('STRIPE_SECRET_KEY is required.'); process.exit(1); }
if (live && !(apply && args.has('--live'))) { console.error('Refusing a live key without --apply --live.'); process.exit(1); }

async function stripe(method, path, params) {
  const body = params ? new URLSearchParams(params) : undefined;
  const url = 'https://api.stripe.com/v1' + path + (method === 'GET' && body ? '?' + body : '');
  const r = await fetch(url, { method, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' }, body: method === 'GET' ? undefined : body });
  const json = await r.json();
  if (!r.ok) throw new Error(`${method} ${path}: ${json?.error?.message || r.status}`);
  return json;
}

const DESCRIPTIONS = {
  zzp: 'Volledige basisboekhouding voor zelfstandigen.',
  pro: 'Meer boekhouding automatiseren.',
  business: 'Administratie voor groeiende ondernemingen.',
};

const prices = {};
for (const plan of PAID_PLAN_IDS) {
  const productId = `boekuna_${plan}`;
  let product = await stripe('GET', `/products/${productId}`).catch(() => null);
  if (!product) {
    console.log(`${apply ? 'Create' : 'Would create'} product ${productId}`);
    if (apply) product = await stripe('POST', '/products', {
      id: productId, name: `Boekuna ${PLANS[plan].name}`, description: DESCRIPTIONS[plan],
      tax_code: 'txcd_10103001', 'metadata[boekuna_plan]': plan,
    });
  }
  for (const interval of INTERVALS) {
    const lk = lookupKey(plan, interval);
    const amount = PLANS[plan].prices[interval];
    const found = (await stripe('GET', '/prices', { 'lookup_keys[]': lk, active: 'true', limit: '1' })).data?.[0];
    if (found) {
      const ok = found.unit_amount === amount && found.currency === CURRENCY && found.recurring?.interval === interval && found.tax_behavior === 'exclusive';
      if (!ok) throw new Error(`Price ${lk} exists with different terms (${found.id}). Fix it in Stripe; never reuse a wrong price.`);
      console.log(`OK ${lk} = ${found.id}`);
      prices[lk] = found.id;
      continue;
    }
    console.log(`${apply ? 'Create' : 'Would create'} ${lk}: ${amount} ${CURRENCY} / ${interval}, excl. btw`);
    if (apply) {
      const p = await stripe('POST', '/prices', {
        product: productId, currency: CURRENCY, unit_amount: String(amount), tax_behavior: 'exclusive',
        'recurring[interval]': interval, 'recurring[interval_count]': '1', lookup_key: lk,
        nickname: `${PLANS[plan].name} ${interval === 'year' ? 'jaarlijks' : 'maandelijks'}`,
        'metadata[boekuna_plan]': plan, 'metadata[boekuna_interval]': interval,
      });
      prices[lk] = p.id;
    }
  }
}

// Customer Portal (see docs/billing/pricing-v2.md, "Wisselen en proratie"):
// - only sellable plans are offered for switching;
// - upgrades apply at once with proration on the next invoice (no surprise charge);
// - downgrades and year->month apply at the end of the paid period;
// - cancellation at period end, no refund of the running period.
const switchable = sellablePlans(process.env.BILLING_SELLABLE_PLANS);
const portal = {
  'business_profile[headline]': 'Beheer je Boekuna-abonnement',
  'features[payment_method_update][enabled]': 'true',
  'features[invoice_history][enabled]': 'true',
  'features[customer_update][enabled]': 'true',
  'features[customer_update][allowed_updates][0]': 'address',
  'features[customer_update][allowed_updates][1]': 'tax_id',
  'features[subscription_cancel][enabled]': 'true',
  'features[subscription_cancel][mode]': 'at_period_end',
  'features[subscription_cancel][proration_behavior]': 'none',
  'features[subscription_update][enabled]': 'true',
  'features[subscription_update][default_allowed_updates][0]': 'price',
  'features[subscription_update][proration_behavior]': 'create_prorations',
  'features[subscription_update][schedule_at_period_end][conditions][0][type]': 'decreasing_item_amount',
  'features[subscription_update][schedule_at_period_end][conditions][1][type]': 'shortening_interval',
  'default_return_url': 'https://app.boekuna.nl/?login=1&billing=portal-return',
};
switchable.forEach((plan, i) => {
  portal[`features[subscription_update][products][${i}][product]`] = `boekuna_${plan}`;
  INTERVALS.forEach((interval, j) => {
    portal[`features[subscription_update][products][${i}][prices][${j}]`] = prices[lookupKey(plan, interval)] || `<${lookupKey(plan, interval)}>`;
  });
});
if (apply) {
  const cfg = await stripe('POST', '/billing_portal/configurations', portal);
  console.log(`Portal configuration ${cfg.id}: set STRIPE_PORTAL_CONFIGURATION_ID=${cfg.id} on the billing-portal Edge Function.`);
} else {
  console.log('Would create portal configuration for plans:', switchable.join(', '));
  console.log('Dry run only. Re-run with --apply (test key) to create.');
}
