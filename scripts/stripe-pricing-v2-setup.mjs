#!/usr/bin/env node
// Boekuna Pricing V2: create the Stripe Products, the six recurring Prices and the
// Customer Portal configuration. Idempotent: existing lookup keys are reused.
// Prices are incl. btw (TAX_BEHAVIOR). A price that still has the old tax behaviour
// is replaced: the new price takes over its lookup key and the old one is archived.
// With STRIPE_PORTAL_CONFIGURATION_ID set, that portal configuration is updated in
// place, so the Supabase secret stays the same.
//
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-pricing-v2-setup.mjs            # dry run
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-pricing-v2-setup.mjs --apply    # test mode
//
// Live mode needs both --apply and --live, and is only for after a successful test-mode
// release check and Kwin's explicit go. It creates prices; it never touches existing
// subscriptions, customers or payments.
import { CURRENCY, PLANS, INTERVALS, TAX_BEHAVIOR, lookupKey, sellablePlans } from '../supabase/functions/_shared/pricing.mjs';

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
  zzp: 'Boekhouding met kosten, bonnetjes, btw-overzicht, bankimport en rapporten. 100 slimme documenten per maand.',
  pro: 'Alles van ZZP, zonder documentlimiet en met herstelpunten.',
};

// Only plans that are sellable get Stripe products and prices. Business stays
// unconfigured until existing features justify it (docs/billing/pricing-v2.md).
const switchable = sellablePlans(process.env.BILLING_SELLABLE_PLANS);
const prices = {};
for (const plan of switchable) {
  if (!DESCRIPTIONS[plan]) throw new Error(`No product description for ${plan}; add one with only existing features.`);
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
    const sameTerms = found && found.unit_amount === amount && found.currency === CURRENCY && found.recurring?.interval === interval;
    if (found && sameTerms && found.tax_behavior === TAX_BEHAVIOR) {
      console.log(`OK ${lk} = ${found.id}`);
      prices[lk] = found.id;
      continue;
    }
    // Same amount with the old tax behaviour (excl. btw) is the one known case to replace.
    // Anything else is unexpected: stop rather than move a lookup key off a wrong price.
    if (found && !(sameTerms && found.tax_behavior === 'exclusive')) {
      throw new Error(`Price ${lk} exists with different terms (${found.id}). Fix it in Stripe; never reuse a wrong price.`);
    }
    console.log(`${apply ? 'Create' : 'Would create'} ${lk}: ${amount} ${CURRENCY} / ${interval}, incl. btw${found ? ` (replaces ${found.id})` : ''}`);
    if (apply) {
      const p = await stripe('POST', '/prices', {
        product: productId, currency: CURRENCY, unit_amount: String(amount), tax_behavior: TAX_BEHAVIOR,
        'recurring[interval]': interval, 'recurring[interval_count]': '1', lookup_key: lk,
        ...(found ? { transfer_lookup_key: 'true' } : {}),
        nickname: `${PLANS[plan].name} ${interval === 'year' ? 'jaarlijks' : 'maandelijks'}`,
        'metadata[boekuna_plan]': plan, 'metadata[boekuna_interval]': interval,
      });
      prices[lk] = p.id;
      // Archiving only stops new use of the old price; existing subscriptions keep it.
      if (found) await stripe('POST', `/prices/${found.id}`, { active: 'false' });
    }
  }
}

// Customer Portal (see docs/billing/pricing-v2.md, "Wisselen en proratie"):
// - only sellable plans are offered for switching;
// - upgrades apply at once with proration on the next invoice (no surprise charge);
// - downgrades and year->month apply at the end of the paid period;
// - cancellation at period end, no refund of the running period.
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
const portalId = (process.env.STRIPE_PORTAL_CONFIGURATION_ID || '').trim();
if (apply && portalId) {
  const cfg = await stripe('POST', `/billing_portal/configurations/${portalId}`, portal);
  console.log(`Portal configuration ${cfg.id} updated; STRIPE_PORTAL_CONFIGURATION_ID stays the same.`);
} else if (apply) {
  const cfg = await stripe('POST', '/billing_portal/configurations', portal);
  console.log(`Portal configuration ${cfg.id}: set STRIPE_PORTAL_CONFIGURATION_ID=${cfg.id} on the billing-portal Edge Function.`);
} else {
  console.log('Would create portal configuration for plans:', switchable.join(', '));
  console.log('Dry run only. Re-run with --apply (test key) to create.');
}
