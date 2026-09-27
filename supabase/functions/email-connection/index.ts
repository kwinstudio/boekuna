import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const ALLOWED_ORIGINS = new Set([
  "https://boekuna-boekhouding.onrender.com",
  "https://boekuna.nl",
  "https://www.boekuna.nl",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "access-control-allow-origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://boekuna-boekhouding.onrender.com",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,apikey,content-type",
    "vary": "Origin"
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "content-type": "application/json", "cache-control": "no-store" }
  });
}
function safeReturnUrl(value: unknown) {
  try {
    const u = new URL(String(value || ""));
    if (ALLOWED_ORIGINS.has(u.origin)) return u.origin + "/";
  } catch {}
  return "https://boekuna-boekhouding.onrender.com/";
}
async function userFrom(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const sb = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false }
  });
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
async function secret(name: string) {
  const env = Deno.env.get(name);
  if (env) return env;
  const { data } = await admin.rpc("get_integration_secret", { p_name: name.toLowerCase() });
  return typeof data === "string" && data ? data : null;
}
async function config(provider: "google" | "microsoft") {
  if (provider === "google") {
    return {
      clientId: await secret("GOOGLE_MAIL_CLIENT_ID"),
      clientSecret: await secret("GOOGLE_MAIL_CLIENT_SECRET")
    };
  }
  return {
    clientId: await secret("MICROSOFT_MAIL_CLIENT_ID"),
    clientSecret: await secret("MICROSOFT_MAIL_CLIENT_SECRET")
  };
}
function callbackUrl(provider: string) {
  return "https://boekuna.nl/oauth/" + encodeURIComponent(provider) + "/callback";
}
function oauthErrorRedirect(returnUrl: string, code: string) {
  const u = new URL(returnUrl);
  u.searchParams.set("mail_error", code);
  return Response.redirect(u.toString(), 302);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });

  const url = new URL(req.url);
  const callbackProvider = url.searchParams.get("callback");

  if (req.method === "GET" && (callbackProvider === "google" || callbackProvider === "microsoft")) {
    const provider = callbackProvider as "google" | "microsoft";
    const state = url.searchParams.get("state") || "";
    const code = url.searchParams.get("code") || "";
    const providerError = url.searchParams.get("error") || "";

    const { data: stateRow } = await admin
      .from("email_oauth_states")
      .select("state,user_id,provider,return_url,expires_at")
      .eq("state", state)
      .maybeSingle();

    const returnUrl = safeReturnUrl(stateRow?.return_url);
    if (!stateRow || stateRow.provider !== provider || new Date(stateRow.expires_at).getTime() < Date.now()) {
      return oauthErrorRedirect(returnUrl, "state_invalid");
    }
    await admin.from("email_oauth_states").delete().eq("state", state);
    if (providerError || !code) return oauthErrorRedirect(returnUrl, "permission_denied");

    const cfg = await config(provider);
    if (!cfg.clientId || !cfg.clientSecret) return oauthErrorRedirect(returnUrl, "provider_not_configured");

    try {
      let token: any;
      let mailbox = "";
      let scopes: string[] = [];

      if (provider === "google") {
        const body = new URLSearchParams({
          code,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: callbackUrl(provider),
          grant_type: "authorization_code"
        });
        const tr = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body
        });
        token = await tr.json();
        if (!tr.ok || !token.refresh_token || !token.access_token) throw new Error("GOOGLE_TOKEN_EXCHANGE_FAILED");

        const ur = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
          headers: { Authorization: "Bearer " + token.access_token }
        });
        const profile = await ur.json();
        if (!ur.ok || !profile.email) throw new Error("GOOGLE_PROFILE_FAILED");
        mailbox = String(profile.email).toLowerCase();
        scopes = String(token.scope || "").split(" ").filter(Boolean);
      } else {
        const scope = "openid profile email offline_access User.Read Mail.Send";
        const body = new URLSearchParams({
          code,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: callbackUrl(provider),
          grant_type: "authorization_code",
          scope
        });
        const tr = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body
        });
        token = await tr.json();
        if (!tr.ok || !token.refresh_token || !token.access_token) throw new Error("MICROSOFT_TOKEN_EXCHANGE_FAILED");

        const ur = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
          headers: { Authorization: "Bearer " + token.access_token }
        });
        const profile = await ur.json();
        if (!ur.ok) throw new Error("MICROSOFT_PROFILE_FAILED");
        mailbox = String(profile.mail || profile.userPrincipalName || "").toLowerCase();
        if (!mailbox.includes("@")) throw new Error("MICROSOFT_EMAIL_MISSING");
        scopes = String(token.scope || scope).split(" ").filter(Boolean);
      }

      const { error } = await admin.rpc("set_email_connection_secret", {
        p_user_id: stateRow.user_id,
        p_provider: provider,
        p_email: mailbox,
        p_refresh_token: token.refresh_token,
        p_scopes: scopes
      });
      if (error) throw error;

      const out = new URL(returnUrl);
      out.searchParams.set("mail_connected", provider);
      return Response.redirect(out.toString(), 302);
    } catch (e) {
      console.error("mail oauth callback", e);
      return oauthErrorRedirect(returnUrl, "connection_failed");
    }
  }

  const user = await userFrom(req);
  if (!user) return json(req, { ok: false, error: "UNAUTHORIZED" }, 401);

  if (req.method === "GET") {
    await admin.from("email_oauth_states").delete().lt("expires_at", new Date().toISOString());
    const [{ data: connection }, googleCfg, microsoftCfg] = await Promise.all([
      admin.from("email_connections")
        .select("provider,email,status,connected_at,updated_at,last_error")
        .eq("user_id", user.id)
        .maybeSingle(),
      config("google"),
      config("microsoft")
    ]);
    return json(req, {
      ok: true,
      connection: connection || null,
      providers: {
        google: { configured: !!(googleCfg.clientId && googleCfg.clientSecret) },
        microsoft: { configured: !!(microsoftCfg.clientId && microsoftCfg.clientSecret) }
      }
    });
  }

  if (req.method !== "POST") return json(req, { ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");

  if (action === "disconnect") {
    const { error } = await admin.rpc("delete_email_connection_secret", { p_user_id: user.id });
    if (error) return json(req, { ok: false, error: "DISCONNECT_FAILED" }, 500);
    return json(req, { ok: true });
  }

  if (action === "start") {
    const provider = String(body?.provider || "") as "google" | "microsoft";
    if (provider !== "google" && provider !== "microsoft") return json(req, { ok: false, error: "INVALID_PROVIDER" }, 400);

    const cfg = await config(provider);
    if (!cfg.clientId || !cfg.clientSecret) {
      return json(req, { ok: false, error: "PROVIDER_NOT_CONFIGURED", provider }, 503);
    }

    const state = crypto.randomUUID() + "-" + crypto.randomUUID();
    const returnUrl = safeReturnUrl(body?.returnUrl);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error } = await admin.from("email_oauth_states").insert({
      state,
      user_id: user.id,
      provider,
      return_url: returnUrl,
      expires_at: expiresAt
    });
    if (error) return json(req, { ok: false, error: "OAUTH_STATE_FAILED" }, 500);

    let authorizationUrl = "";
    if (provider === "google") {
      const q = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: callbackUrl(provider),
        response_type: "code",
        scope: "openid email https://www.googleapis.com/auth/gmail.send",
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state
      });
      authorizationUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + q.toString();
    } else {
      const q = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: callbackUrl(provider),
        response_type: "code",
        response_mode: "query",
        scope: "openid profile email offline_access User.Read Mail.Send",
        state
      });
      authorizationUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?" + q.toString();
    }

    return json(req, { ok: true, authorizationUrl });
  }

  return json(req, { ok: false, error: "UNKNOWN_ACTION" }, 400);
});
