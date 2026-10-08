// Stripe side of account deletion, shared by delete-account and billing-webhook.
//
// Rule: an account is only deleted after every Stripe subscription that could still
// charge the user is cancelled. Nothing in here deletes data; callers decide what to
// do when a step throws (delete-account stops and deletes nothing).
//
// Dependency-free on purpose so tests/account-closure.test.mjs can run it under Node.

export type StripeRequest = (
  method: "GET" | "POST" | "DELETE",
  path: string,
  params?: URLSearchParams,
  idempotencyKey?: string,
) => Promise<any>;

// Statuses where Stripe can still (re)charge the customer. `incomplete` can still
// become active when the first payment completes.
export const CHARGEABLE_SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "paused",
  "incomplete",
];

export function isChargeable(status: unknown) {
  return CHARGEABLE_SUBSCRIPTION_STATUSES.includes(String(status || ""));
}

export function stripeRequestWithKey(key: string, fetchImpl: typeof fetch = fetch): StripeRequest {
  return async (method, path, params, idempotencyKey) => {
    if (!key) throw new Error("STRIPE_NOT_CONFIGURED");
    const headers: Record<string, string> = { Authorization: "Bearer " + key };
    let url = "https://api.stripe.com/v1" + path;
    let body: URLSearchParams | undefined;
    if (method === "GET") {
      if (params && [...params.keys()].length) url += (url.includes("?") ? "&" : "?") + params.toString();
    } else {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = params || new URLSearchParams();
    }
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const r = await fetchImpl(url, { method, headers, body });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error("STRIPE:" + String(json?.error?.message || "Stripe request failed")) as Error & {
        status?: number;
        code?: string;
      };
      err.status = r.status;
      err.code = String(json?.error?.code || "");
      throw err;
    }
    return json;
  };
}

// Cancel one subscription immediately (no proration, no final invoice: Stripe's
// defaults). Already-ended subscriptions count as done. Throws when Stripe cannot
// confirm the subscription has stopped.
export async function cancelSubscriptionNow(stripe: StripeRequest, subscriptionId: string) {
  const id = encodeURIComponent(subscriptionId);
  try {
    const sub = await stripe("DELETE", "/subscriptions/" + id);
    if (!isChargeable(sub?.status)) return String(sub?.status || "canceled");
  } catch (_cancelError) {
    // Fall through: confirm the real state below (e.g. it was already cancelled).
  }
  const current = await stripe("GET", "/subscriptions/" + id);
  if (isChargeable(current?.status)) throw new Error("STRIPE_SUBSCRIPTION_STILL_ACTIVE");
  return String(current?.status || "canceled");
}

export type ClosureInput = {
  userId: string;
  customerId?: string | null;
  subscriptionId?: string | null;
};

export type ClosureResult = {
  customerId: string;
  canceledSubscriptionIds: string[];
  expiredCheckoutSessionIds: string[];
  searchSkipped: boolean;
};

// Stop every way Stripe could still bill this Boekuna user:
// 1. expire open Checkout sessions of the customer, so nothing can start after deletion;
// 2. cancel the stored subscription and every other chargeable subscription of the
//    customer or with this user's id in its metadata.
export async function closeStripeBilling(stripe: StripeRequest, input: ClosureInput): Promise<ClosureResult> {
  const userId = String(input.userId || "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("INVALID_USER");
  let customerId = String(input.customerId || "");
  const candidates = new Set<string>();
  const expired: string[] = [];
  let searchSkipped = false;

  if (input.subscriptionId) candidates.add(String(input.subscriptionId));

  if (customerId) {
    const sessions = await stripe(
      "GET",
      "/checkout/sessions",
      new URLSearchParams({ customer: customerId, status: "open", limit: "100" }),
    );
    for (const session of sessions?.data || []) {
      if (!session?.id) continue;
      await stripe("POST", "/checkout/sessions/" + encodeURIComponent(session.id) + "/expire");
      expired.push(String(session.id));
    }
    const subs = await stripe(
      "GET",
      "/subscriptions",
      new URLSearchParams({ customer: customerId, status: "all", limit: "100" }),
    );
    for (const sub of subs?.data || []) if (sub?.id && isChargeable(sub.status)) candidates.add(String(sub.id));
  }

  // Subscriptions whose webhook never reached us (or that sit on a second customer)
  // still carry metadata.user_id. Stripe search is eventually consistent and is a
  // best-effort extra: the billing-webhook guard cancels anything it misses.
  try {
    const found = await stripe(
      "GET",
      "/subscriptions/search",
      new URLSearchParams({ query: `metadata['user_id']:'${userId}'`, limit: "100" }),
    );
    for (const sub of found?.data || []) {
      if (!sub?.id || !isChargeable(sub.status)) continue;
      if (String(sub?.metadata?.user_id || "") !== userId) continue;
      candidates.add(String(sub.id));
      if (!customerId && sub.customer) customerId = String(sub.customer);
    }
  } catch (_searchError) {
    searchSkipped = true;
  }

  const canceled: string[] = [];
  for (const id of candidates) {
    await cancelSubscriptionNow(stripe, id);
    canceled.push(id);
  }
  return { customerId, canceledSubscriptionIds: canceled, expiredCheckoutSessionIds: expired, searchSkipped };
}
