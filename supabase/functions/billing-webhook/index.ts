import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { cancelSubscriptionNow, isChargeable, stripeRequestWithKey } from "../_shared/account-closure.ts";
import { applyStripeState } from "../_shared/stripe-state.ts";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function stripeGet(path: string) {
  const key = Deno.env.get("STRIPE_SECRET_KEY") || "";
  if (!key) throw new Error("STRIPE_NOT_CONFIGURED");
  const r = await fetch("https://api.stripe.com/v1" + path, {
    headers: { Authorization: "Bearer " + key },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(String(body?.error?.message || "Stripe request failed"));
  return body;
}

function ts(v: any) {
  return v ? new Date(Number(v) * 1000).toISOString() : null;
}

function normalizedStatus(v: any) {
  const s = String(v || "");
  return ["trialing", "active", "past_due", "canceled", "incomplete", "incomplete_expired", "unpaid", "paused"].includes(s)
    ? s
    : "incomplete";
}

function periodEnd(subscription: any) {
  return ts(subscription?.items?.data?.[0]?.current_period_end || subscription?.current_period_end);
}

function constantTimeEqual(a: string, b: string) {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

async function hmacSha256Hex(secret: string, payload: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyStripeSignature(rawBody: string, signatureHeader: string, secret: string) {
  const parts = signatureHeader.split(",").map((p) => p.trim());
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2) || "";
  const signatures = parts
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3))
    .filter(Boolean);

  if (!timestamp || signatures.length === 0) return false;

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return false;

  // Stripe's standard replay-protection tolerance is 5 minutes.
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
  if (ageSeconds > 300) return false;

  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  return signatures.some((candidate) => constantTimeEqual(candidate, expected));
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET") || "";
    if (!webhookSecret) {
      return json({ ok: false, error: "STRIPE_WEBHOOK_NOT_CONFIGURED" }, 500);
    }

    const signature = req.headers.get("stripe-signature") || "";
    if (!signature) {
      return json({ ok: false, error: "Missing Stripe-Signature" }, 400);
    }

    const rawBody = await req.text();
    const signatureValid = await verifyStripeSignature(rawBody, signature, webhookSecret);
    if (!signatureValid) {
      return json({ ok: false, error: "Invalid Stripe signature" }, 400);
    }

    const event = JSON.parse(rawBody);
    const eventId = String(event?.id || "");
    if (!/^evt_/.test(eventId)) return json({ ok: false, error: "Invalid Stripe event" }, 400);

    // A valid signature alone is not enough: never mix test- and live-mode
    // Stripe events in the same billing state.
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
    const expectedLivemode = stripeKey.includes("_live_") ? true : stripeKey.includes("_test_") ? false : null;
    if (typeof event?.livemode !== "boolean") {
      return json({ ok: false, error: "Stripe event environment missing" }, 400);
    }
    if (expectedLivemode !== null && event.livemode !== expectedLivemode) {
      return json({ ok: false, error: "Stripe event environment mismatch" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

    const type = String(event.type || "");
    const obj = event?.data?.object || {};
    const eventCreated = Number(event?.created || 0);
    const startedAt = new Date().toISOString();

    // Atomically claim the Stripe event before side effects. Failed/stale claims
    // can be retried; processed or currently-processing duplicates are ignored.
    let claimed = false;
    const { error: claimInsertError } = await admin.from("billing_events").insert({
      stripe_event_id: event.id,
      event_type: type,
      event_created: eventCreated,
      status: "processing",
      attempts: 1,
      processing_started_at: startedAt,
      processed_at: null,
      completed_at: null,
      last_error: null,
    });

    if (!claimInsertError) {
      claimed = true;
    } else if (claimInsertError.code === "23505") {
      const { data: existingEvent, error: existingEventError } = await admin
        .from("billing_events")
        .select("status,attempts,processing_started_at")
        .eq("stripe_event_id", event.id)
        .maybeSingle();
      if (existingEventError) throw existingEventError;
      if (existingEvent?.status === "processed") return json({ ok: true, duplicate: true });

      const startedMs = Date.parse(String(existingEvent?.processing_started_at || "")) || 0;
      const stale = existingEvent?.status === "processing" && startedMs > 0 && Date.now() - startedMs > 10 * 60 * 1000;
      const retryable = existingEvent?.status === "failed" || stale;
      if (!retryable) return json({ ok: true, duplicate: true, processing: true });

      const previousAttempts = Math.max(1, Number(existingEvent?.attempts || 1));
      const { data: reclaimed, error: reclaimError } = await admin
        .from("billing_events")
        .update({
          status: "processing",
          attempts: Math.min(25, previousAttempts + 1),
          processing_started_at: startedAt,
          completed_at: null,
          last_error: null,
        })
        .eq("stripe_event_id", event.id)
        .eq("status", String(existingEvent?.status || "failed"))
        .eq("attempts", previousAttempts)
        .select("stripe_event_id")
        .maybeSingle();
      if (reclaimError) throw reclaimError;
      if (!reclaimed) return json({ ok: true, duplicate: true, processing: true });
      claimed = true;
    } else {
      throw claimInsertError;
    }

    async function resolveUserId(source: any) {
      const metaUser = String(source?.metadata?.user_id || source?.client_reference_id || "");
      if (metaUser) return metaUser;

      const subId = String(source?.subscription || source?.id || "");
      if (subId.startsWith("sub_")) {
        const { data } = await admin
          .from("billing_accounts")
          .select("user_id")
          .eq("stripe_subscription_id", subId)
          .maybeSingle();
        if (data?.user_id) return String(data.user_id);
      }

      const cust = String(source?.customer || "");
      if (cust) {
        const { data } = await admin
          .from("billing_accounts")
          .select("user_id")
          .eq("stripe_customer_id", cust)
          .maybeSingle();
        if (data?.user_id) return String(data.user_id);
      }
      return "";
    }

    // A deleted (or deleting-and-already-unbilled) account can still receive Stripe
    // events: retries, an open Checkout that completed afterwards, a renewal. Never
    // write state for it (the user row is gone) and never let it keep billing:
    // cancel any subscription that can still charge, then mark the event processed.
    async function closedAccountGuard(userId: string, subscriptionId: string, knownStatus?: string) {
      if (!userId) return false;
      const { data: closure, error: closureError } = await admin
        .from("account_closures")
        .select("state")
        .eq("user_id", userId)
        .maybeSingle();
      if (closureError) throw closureError;
      // 'pending' and 'failed' mean the user still exists and may keep using Boekuna.
      let closed = closure?.state === "billing_closed" || closure?.state === "completed";
      if (!closed) {
        const { data: found, error: lookupError } = await admin.auth.admin.getUserById(userId);
        if (lookupError && !/not.?found/i.test(lookupError.message)) throw lookupError;
        closed = !found?.user;
      }
      if (!closed) return false;
      if (subscriptionId.startsWith("sub_") && (knownStatus === undefined || isChargeable(knownStatus))) {
        await cancelSubscriptionNow(stripeRequestWithKey(Deno.env.get("STRIPE_SECRET_KEY") || ""), subscriptionId);
      }
      return true;
    }

    async function applySubscription(sub: any, userId: string) {
      if (!userId || !sub?.id) return false;
      if (await closedAccountGuard(userId, String(sub.id), String(sub?.status || ""))) return false;
      const metadataOwner = String(sub?.metadata?.user_id || "");
      if (metadataOwner && metadataOwner !== userId) throw new Error("STRIPE_OWNER_MISMATCH");

      const { data: existing, error: existingError } = await admin
        .from("billing_accounts")
        .select("plan")
        .eq("user_id", userId)
        .maybeSingle();
      if (existingError) throw existingError;

      // Plan and interval come from the price the customer pays (a Customer
      // Portal switch changes the price, not the subscription metadata).
      const result = await applyStripeState(admin, {
        userId,
        subscription: sub,
        fallbackPlan: String(sub?.metadata?.plan || existing?.plan || ""),
        status: normalizedStatus(sub?.status),
        currentPeriodEnd: periodEnd(sub),
        eventCreated,
        eventId: String(event.id),
      });
      return result.applied;
    }

    try {
      if (type === "checkout.session.completed") {
        const userId = String(obj?.client_reference_id || obj?.metadata?.user_id || "");
        const subId = String(obj?.subscription || "");
        if (userId && subId && await closedAccountGuard(userId, subId)) {
          // Account was deleted while this Checkout was open: subscription cancelled above.
        } else if (userId && subId) {
          const sub = await stripeGet("/subscriptions/" + encodeURIComponent(subId));
          await applySubscription(sub, userId);
        }
      } else if (["customer.subscription.created", "customer.subscription.updated"].includes(type)) {
        const userId = await resolveUserId(obj);
        if (userId && obj?.id) {
          // Stripe doesn't guarantee webhook ordering. Re-read the current
          // subscription and persist that current server-side truth.
          const currentSub = await stripeGet("/subscriptions/" + encodeURIComponent(String(obj.id)));
          await applySubscription(currentSub, userId);
        }
      } else if (type === "customer.subscription.deleted") {
        const userId = await resolveUserId(obj);
        if (userId) await applySubscription(obj, userId);
      } else if (["invoice.paid", "invoice.payment_failed"].includes(type)) {
        const subId = String(obj?.subscription || obj?.parent?.subscription_details?.subscription || "");
        if (subId) {
          const sub = await stripeGet("/subscriptions/" + encodeURIComponent(subId));
          const userId = String(sub?.metadata?.user_id || await resolveUserId({ subscription: subId, customer: sub?.customer }));
          if (userId) await applySubscription(sub, userId);
        }
      }

      const finishedAt = new Date().toISOString();
      const { error: processedError } = await admin
        .from("billing_events")
        .update({
          status: "processed",
          processed_at: finishedAt,
          completed_at: finishedAt,
          last_error: null,
        })
        .eq("stripe_event_id", event.id);
      if (processedError) throw processedError;

      return json({ ok: true });
    } catch (processingError) {
      if (claimed) {
        await admin
          .from("billing_events")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            last_error: String((processingError as any)?.message || processingError).slice(0, 1000),
          })
          .eq("stripe_event_id", event.id);
      }
      throw processingError;
    }
  } catch (e) {
    return json({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
