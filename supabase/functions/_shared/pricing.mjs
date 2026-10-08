// Boekuna Pricing V2: the single server-side source of truth for plans and prices.
// Imported by the billing Edge Functions (Deno) and by the Node regression tests.
// All amounts are integer euro cents, excluding VAT. Never trust amounts from a client.

export const CURRENCY = "eur";

// Product identity is separate from the billing interval.
// plan = start | zzp | pro | business, interval = month | year.
export const PLANS = Object.freeze({
  start: Object.freeze({ id: "start", name: "Start", rank: 0, paid: false, prices: Object.freeze({}) }),
  zzp: Object.freeze({
    id: "zzp", name: "ZZP", rank: 1, paid: true,
    prices: Object.freeze({ month: 995, year: 9950 }),
  }),
  pro: Object.freeze({
    id: "pro", name: "Pro", rank: 2, paid: true,
    prices: Object.freeze({ month: 1995, year: 19950 }),
  }),
  business: Object.freeze({
    id: "business", name: "Business", rank: 3, paid: true,
    prices: Object.freeze({ month: 3495, year: 34950 }),
  }),
});

export const INTERVALS = Object.freeze(["month", "year"]);
export const PAID_PLAN_IDS = Object.freeze(["zzp", "pro", "business"]);

// Plans that may be bought right now. Pro and Business stay behind this flag
// until their distinguishing features work in production (see docs/billing/pricing-v2.md).
// Override per environment with BILLING_SELLABLE_PLANS="zzp,pro".
export const DEFAULT_SELLABLE_PLANS = Object.freeze(["zzp"]);

// The public word "onbeperkt" stays off until measured processing costs support it.
export const UNLIMITED_CLAIM_RELEASED = false;

// Storage keys from before Pricing V2. Existing rows keep them; readers map them.
export const LEGACY_PLAN_ALIASES = Object.freeze({
  free: "start",
  gratis: "start",
  boekuna: "zzp",
  unlimited: "pro",
});

export function canonicalPlan(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (key in PLANS) return key;
  return LEGACY_PLAN_ALIASES[key] || "";
}

export function isPaidPlan(raw) {
  return PAID_PLAN_IDS.includes(canonicalPlan(raw));
}

export function normalizeInterval(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "month" || v === "monthly" || v === "maand") return "month";
  if (v === "year" || v === "yearly" || v === "annual" || v === "jaar") return "year";
  return "";
}

export function priceCents(plan, interval) {
  const p = PLANS[canonicalPlan(plan)];
  const i = normalizeInterval(interval);
  if (!p || !p.paid || !i) return null;
  return p.prices[i] ?? null;
}

// Stripe lookup keys for the six official recurring prices. Created by
// scripts/stripe-pricing-v2-setup.mjs (test mode first, live only after a go).
export function lookupKey(plan, interval) {
  const p = canonicalPlan(plan), i = normalizeInterval(interval);
  if (!isPaidPlan(p) || !i) return "";
  return `boekuna_${p}_${i}_v2`;
}

export function parseLookupKey(key) {
  const m = /^boekuna_(zzp|pro|business)_(month|year)_v2$/.exec(String(key || ""));
  return m ? { plan: m[1], interval: m[2] } : null;
}

export function sellablePlans(envValue) {
  const raw = String(envValue ?? "").trim();
  if (!raw) return [...DEFAULT_SELLABLE_PLANS];
  return raw.split(",").map(canonicalPlan).filter((p) => PAID_PLAN_IDS.includes(p));
}

// Resolve plan and interval for a Stripe subscription from the price the
// customer actually pays. Metadata alone is not enough: a Customer Portal
// switch changes the price but leaves subscription metadata untouched.
export function resolveStripePlan(subscription) {
  const item = subscription?.items?.data?.[0] || {};
  const price = item.price || item.plan || {};
  const interval = normalizeInterval(price?.recurring?.interval || price?.interval);
  const intervalCount = Number(price?.recurring?.interval_count || price?.interval_count || 1);
  const amount = Number(price?.unit_amount ?? price?.amount ?? NaN);
  const currency = String(price?.currency || "").toLowerCase();

  const byKey = parseLookupKey(price?.lookup_key);
  if (byKey) return { ...byKey, amount, source: "lookup_key", priceRef: String(price?.id || "") };

  const metaPlan = canonicalPlan(price?.metadata?.boekuna_plan || price?.product?.metadata?.boekuna_plan);
  if (isPaidPlan(metaPlan) && interval) {
    return { plan: metaPlan, interval, amount, source: "price_metadata", priceRef: String(price?.id || "") };
  }

  // Pre-V2 subscriptions were inline monthly prices of 995 ("Boekuna") and
  // 1995 ("Unlimited"); those amounts equal the V2 ZZP and Pro monthly prices.
  if (currency === CURRENCY && intervalCount === 1 && interval && Number.isFinite(amount)) {
    for (const id of PAID_PLAN_IDS) {
      if (PLANS[id].prices[interval] === amount) {
        return { plan: id, interval, amount, source: "amount", priceRef: String(price?.id || "") };
      }
    }
  }

  const subPlan = canonicalPlan(subscription?.metadata?.plan);
  if (isPaidPlan(subPlan)) {
    return { plan: subPlan, interval: interval || "month", amount, source: "subscription_metadata", priceRef: String(price?.id || "") };
  }
  return null;
}

// Display helpers shared with tests (Dutch formatting, comma decimals).
export function formatEuro(cents) {
  const v = (Number(cents) / 100).toFixed(2).replace(".", ",");
  return "€ " + v;
}

// Average per month for a yearly price, for secondary display only.
// Rounded half up to whole cents; never used to charge anything.
export function yearlyMonthlyEquivalentCents(plan) {
  const y = priceCents(plan, "year");
  return y == null ? null : Math.round(y / 12);
}
