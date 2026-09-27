import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { "content-type": "application/json" } });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
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
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  }

  const { data: aal, error: aalError } = await userClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError) {
    return new Response(JSON.stringify({ error: "MFA status could not be verified" }), { status: 401, headers: { "content-type": "application/json" } });
  }
  if (aal?.nextLevel === "aal2" && aal?.currentLevel !== "aal2") {
    return new Response(JSON.stringify({ error: "Two-step verification is required before deleting this account." }), { status: 403, headers: { "content-type": "application/json" } });
  }

  const userId = userData.user.id;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data: files, error: listError } = await admin.storage.from("kwinest-documents").list(userId, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" }
    });
    if (listError) {
      return new Response(JSON.stringify({ error: listError.message }), { status: 400, headers: { "content-type": "application/json" } });
    }
    if (!files?.length) break;

    const paths = files.map((file) => `${userId}/${file.name}`);
    const { error: removeError } = await admin.storage.from("kwinest-documents").remove(paths);
    if (removeError) {
      return new Response(JSON.stringify({ error: removeError.message }), { status: 400, headers: { "content-type": "application/json" } });
    }
    if (files.length < pageSize) break;
  }

  const { error: emailSecretError } = await admin.rpc("delete_email_connection_secret", { p_user_id: userId });
  if (emailSecretError) {
    return new Response(JSON.stringify({ error: "Connected mailbox credentials could not be removed" }), { status: 500, headers: { "content-type": "application/json" } });
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { "content-type": "application/json" } });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
});