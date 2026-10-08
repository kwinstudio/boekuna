// Persist a Stripe subscription through the monotonic server-side writer.
// Shared by billing-webhook and billing-sync so both derive plan and interval the same way.
import { canonicalPlan, isPaidPlan, resolveStripePlan } from "./pricing.mjs";

export type StripeStateInput = {
  userId: string;
  subscription: any;
  customerId?: string;
  fallbackPlan?: string;
  status: string;
  currentPeriodEnd: string | null;
  eventCreated: number;
  eventId: string;
};

export function planForSubscription(subscription: any, fallbackPlan?: string) {
  const resolved = resolveStripePlan(subscription);
  if (resolved) return resolved;
  // Unknown price: never downgrade or fail a paying customer. Keep what we knew.
  const known = canonicalPlan(fallbackPlan);
  return { plan: isPaidPlan(known) ? known : "zzp", interval: "", amount: NaN, source: "fallback", priceRef: "" };
}

export async function applyStripeState(admin: any, input: StripeStateInput) {
  const sub = input.subscription;
  const resolved = planForSubscription(sub, input.fallbackPlan);
  const args = {
    p_user_id: input.userId,
    p_stripe_customer_id: String(input.customerId || sub?.customer || ""),
    p_stripe_subscription_id: String(sub?.id || ""),
    p_plan: resolved.plan,
    p_status: input.status,
    p_current_period_end: input.currentPeriodEnd,
    p_cancel_at_period_end: !!sub?.cancel_at_period_end,
    p_event_created: input.eventCreated,
    p_event_id: input.eventId,
  };
  const { data, error } = await admin.rpc("apply_stripe_subscription_state_v2", {
    ...args,
    p_billing_interval: resolved.interval || null,
    p_stripe_price_id: resolved.priceRef || null,
    p_unit_amount_cents: Number.isFinite(resolved.amount) ? resolved.amount : null,
  });
  // Deploy-order safety: if the Pricing V2 migration is not applied yet, use the
  // pre-V2 writer with its legacy keys (only ZZP and Pro existed then).
  if (error && (error.code === "PGRST202" || /apply_stripe_subscription_state_v2/.test(String(error.message || "")))) {
    const legacyPlan = resolved.plan === "zzp" ? "boekuna" : resolved.plan;
    const legacy = await admin.rpc("apply_stripe_subscription_state", { ...args, p_plan: legacyPlan });
    if (legacy.error) throw legacy.error;
    return { applied: legacy.data === true, ...resolved };
  }
  if (error) throw error;
  return { applied: data === true, ...resolved };
}
