import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { closeStripeBilling, isChargeable, stripeRequestWithKey } from "../_shared/account-closure.ts";

// The app calls this function from the browser (app.boekuna.nl), so the browser first sends a CORS
// preflight. Without these headers it blocked the request and "Account verwijderen" did nothing.
const APP_URL = (Deno.env.get("APP_URL") || "https://app.boekuna.nl").replace(/\/$/, "");
const ALLOWED_ORIGINS = new Set([
  APP_URL,
  "https://boekuna-boekhouding.onrender.com",
  "https://boekuna.nl",
  "https://www.boekuna.nl",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : APP_URL,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "content-type": "application/json",
    "Vary": "Origin",
  };
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req);
  const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") {
    return reply(405, { error: "Method not allowed" });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return reply(401, { error: "Unauthorized" });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return reply(401, { error: "Unauthorized" });
  }

  const { data: aal, error: aalError } = await userClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError) {
    return reply(401, { error: "Je tweestapsverificatie kon niet worden gecontroleerd. Log opnieuw in en probeer het nog eens." });
  }
  if (aal?.nextLevel === "aal2" && aal?.currentLevel !== "aal2") {
    return reply(403, { error: "Bevestig eerst je tweestapsverificatie voordat je je account verwijdert." });
  }

  const userId = userData.user.id;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Claim the closure. A second request while one is running gets a 409, so a
  //    double click can never run two deletions side by side.
  const { data: claim, error: claimError } = await admin.rpc("begin_account_closure", { p_user_id: userId });
  if (claimError || !claim) {
    return reply(500, { error: "Verwijderen kon niet worden gestart. Er is niets verwijderd. Probeer het later opnieuw." });
  }
  if (!claim.claimed) {
    return reply(409, { error: "Je account wordt al verwijderd. Wacht even en ververs de pagina." });
  }
  const closure = admin.from("account_closures");
  const failClosure = async (message: string) => {
    await closure
      .update({ state: "failed", last_error: message.slice(0, 1000), updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  };

  // 2. Stop billing before any data is touched. If Stripe cannot confirm that every
  //    chargeable subscription is cancelled, nothing is deleted and the user can retry.
  const storedCustomer = String(claim.stripe_customer_id || "");
  const storedSubscription = String(claim.stripe_subscription_id || "");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
  const knownStripeLink = !!storedCustomer || (!!storedSubscription && isChargeable(claim.subscription_status));
  try {
    let customerId = storedCustomer;
    let canceled: string[] = [];
    if (knownStripeLink || stripeKey) {
      const result = await closeStripeBilling(stripeRequestWithKey(stripeKey), {
        userId,
        customerId: storedCustomer,
        subscriptionId: storedSubscription && isChargeable(claim.subscription_status) ? storedSubscription : "",
      });
      customerId = result.customerId;
      canceled = result.canceledSubscriptionIds;
    }
    const closedAt = new Date().toISOString();
    const { error: closedError } = await closure
      .update({
        state: "billing_closed",
        stripe_customer_id: /^cus_[A-Za-z0-9]+$/.test(customerId) ? customerId : null,
        canceled_subscription_ids: canceled,
        billing_closed_at: closedAt,
        updated_at: closedAt,
      })
      .eq("user_id", userId);
    if (closedError) throw closedError;
  } catch (billingError) {
    const message = String((billingError as any)?.message || billingError);
    await failClosure("billing: " + message);
    return reply(502, {
      error: "Je abonnement kon niet worden stopgezet, daarom is er niets verwijderd. Probeer het later opnieuw of mail support@boekuna.nl.",
    });
  }

  // 3. Billing is closed: remove documents, screenshots, mailbox secret and the account.
  const fail = async (status: number, message: string) => {
    await failClosure("data: " + message);
    return reply(status, { error: message });
  };

  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data: files, error: listError } = await admin.storage.from("kwinest-documents").list(userId, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" }
    });
    if (listError) {
      return await fail(400, listError.message);
    }
    if (!files?.length) break;

    const paths = files.map((file) => `${userId}/${file.name}`);
    const { error: removeError } = await admin.storage.from("kwinest-documents").remove(paths);
    if (removeError) {
      return await fail(400, removeError.message);
    }
    if (files.length < pageSize) break;
  }

  // Feedback screenshots live in <user id>/<report id>/screenshot.jpg; remove them before the
  // account (feedback rows themselves cascade with auth.users).
  const feedbackBucket = admin.storage.from("feedback-screenshots");
  while (true) {
    const { data: folders, error: folderError } = await feedbackBucket.list(userId, { limit: 100, offset: 0 });
    // Before the feedback migration is applied the bucket does not exist: nothing to remove.
    if (folderError && /not found/i.test(folderError.message)) break;
    if (folderError) {
      return await fail(400, folderError.message);
    }
    if (!folders?.length) break;
    const paths: string[] = [];
    for (const folder of folders) {
      const { data: files, error: fileError } = await feedbackBucket.list(`${userId}/${folder.name}`, { limit: 100 });
      if (fileError) {
        return await fail(400, fileError.message);
      }
      for (const file of files || []) paths.push(`${userId}/${folder.name}/${file.name}`);
    }
    if (!paths.length) break;
    const { error: removeFeedbackError } = await feedbackBucket.remove(paths);
    if (removeFeedbackError) {
      return await fail(400, removeFeedbackError.message);
    }
  }

  const { error: emailSecretError } = await admin.rpc("delete_email_connection_secret", { p_user_id: userId });
  if (emailSecretError) {
    return await fail(500, "Connected mailbox credentials could not be removed");
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error && !/not.?found/i.test(error.message)) {
    return await fail(400, error.message);
  }

  const doneAt = new Date().toISOString();
  await closure.update({ state: "completed", completed_at: doneAt, updated_at: doneAt, last_error: null }).eq("user_id", userId);

  return reply(200, { ok: true });
});