import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Bonnen mailen (Kwin 2026-11-04, UI-trucs 18). Every account can have its own address on the
// inbound domain, e.g. kwinstudio-3f9a1c7e5b2d@bon.boekuna.nl. Resend receives the mail and calls
// this function with an email.received webhook (metadata only). The function looks up the account
// by the address, fetches the attachments from Resend and stores each one exactly like an upload
// from the app: a file in the private bucket plus a documents row marked for processing. The app's
// normal "resume" then creates the processing job with the user's own session, so the document
// quota, the processor and the review screen are the same as for a scanned receipt.
// No automatic reply ever goes back, so an unknown or revoked address tells a sender nothing.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// The Resend key and the webhook signing secret: edge secrets when set, otherwise Supabase Vault
// (inbound_mail_resend_api_key, inbound_mail_webhook_secret) through a service-only RPC. Without a
// stored signing secret the function asks Resend for the one of its own webhook, with the key.
const ENV_RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const ENV_WEBHOOK_SECRET = Deno.env.get("RESEND_INBOUND_WEBHOOK_SECRET") || "";
const DOMAINS = new Set(String(Deno.env.get("INBOUND_DOMAINS") || "bon.boekuna.nl").toLowerCase().split(",").map((d) => d.trim()).filter(Boolean));
const RESEND_API = (Deno.env.get("RESEND_API_URL") || "https://api.resend.com").replace(/\/$/, "");
const BUCKET = "kwinest-documents";
const MAX_BODY = 256 * 1024;
const MAX_FILES = 10;
const MAX_BYTES = 15 * 1024 * 1024; // same limit as the document processor
const MAX_MAILS_PER_DAY = 30; // per account; a leaked address cannot flood the books
const TOLERANCE_S = 5 * 60;
const PDF = new Set(["application/pdf", "application/x-pdf"]);
const IMAGES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif", "image/tiff", "image/bmp"]);
const EXT: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", tif: "image/tiff", tiff: "image/tiff", bmp: "image/bmp" };

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
function clean(v: unknown, n = 160) { return String(v ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, n); }
function b64(bytes: ArrayBuffer) { let s = ""; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b); return btoa(s); }
function unb64(s: string) { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function safeEqual(a: string, b: string) { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; }

// Resend signs webhooks the Svix way: HMAC-SHA256 over "id.timestamp.body" with the base64 secret after "whsec_".
export async function verifySignature(raw: string, headers: Headers, secret: string, now = Date.now()) {
  const id = headers.get("svix-id") || "", ts = headers.get("svix-timestamp") || "", sig = headers.get("svix-signature") || "";
  if (!id || !ts || !sig || !secret) return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > TOLERANCE_S) return false;
  const key = await crypto.subtle.importKey("raw", unb64(secret.replace(/^whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = b64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${raw}`)));
  return sig.split(" ").some((part) => { const [v, s] = part.split(","); return v === "v1" && !!s && safeEqual(s, expected); });
}

// The addresses on our inbound domain a mail was sent or forwarded to, as local parts ("kwin-abc+bon" -> "kwin-abc").
export function localParts(data: any, domains = DOMAINS) {
  const all = [data?.to, data?.cc, data?.received_for].flat().filter(Boolean).map((a: unknown) => String(a).toLowerCase());
  const out = new Set<string>();
  for (const a of all) {
    const m = a.match(/<?([^<>\s"]+)@([^<>\s"]+)>?$/);
    if (!m || !domains.has(m[2])) continue;
    const local = m[1].split("+")[0];
    if (/^[a-z0-9][a-z0-9-]{4,62}[a-z0-9]$/.test(local)) out.add(local);
  }
  return [...out];
}

function typeOf(a: any) {
  const type = String(a?.content_type || "").toLowerCase().split(";")[0].trim();
  if (PDF.has(type) || IMAGES.has(type)) return type === "image/jpg" ? "image/jpeg" : type === "application/x-pdf" ? "application/pdf" : type;
  const ext = String(a?.filename || "").toLowerCase().split(".").pop() || "";
  return type === "application/octet-stream" || !type ? EXT[ext] || "" : "";
}
// Which attachments are a receipt or invoice: PDFs and photos. Small inline pictures are logos in a mail signature.
export function pickAttachments(list: any[]) {
  const picked: any[] = [], skipped: string[] = [];
  for (const a of list || []) {
    const type = typeOf(a), size = Number(a?.size || 0), inline = String(a?.content_disposition || "").toLowerCase() === "inline";
    if (!type) { skipped.push("type"); continue; }
    if (size > MAX_BYTES) { skipped.push("size"); continue; }
    if (type.startsWith("image/") && size < (inline ? 50 * 1024 : 10 * 1024)) { skipped.push("small"); continue; }
    if (picked.length >= MAX_FILES) { skipped.push("count"); continue; }
    picked.push({ ...a, content_type: type });
  }
  return { picked, skipped };
}
export function safeStorageName(name: string) {
  return String(name || "bestand").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 140) || "bestand";
}
function fileName(a: any, i: number) {
  const name = clean(a?.filename, 200);
  if (name) return name;
  const ext = Object.entries(EXT).find(([, t]) => t === a.content_type)?.[0] || "pdf";
  return `bon-${i + 1}.${ext}`;
}

async function resend(path: string, key: string) {
  const r = await fetch(RESEND_API + path, { headers: { Authorization: "Bearer " + key }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Object.assign(new Error("RESEND_" + r.status), { retry: r.status === 429 || r.status >= 500 });
  return await r.json();
}

// The signing secret of the Resend webhook that points at this function.
async function ownWebhookSecret(key: string) {
  const self = (SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/inbound-mail").toLowerCase();
  const list = (await resend("/webhooks", key))?.data || [];
  const mine = list.filter((w: any) => String(w?.status || "enabled") === "enabled" && (w?.events || []).includes("email.received") && String(w?.endpoint || "").replace(/\/+$/, "").toLowerCase().endsWith("/functions/v1/inbound-mail"))
    .sort((a: any, b: any) => Number(String(b.endpoint).toLowerCase().startsWith(self)) - Number(String(a.endpoint).toLowerCase().startsWith(self)))[0];
  if (!mine?.id) return "";
  return String((await resend("/webhooks/" + encodeURIComponent(mine.id), key))?.signing_secret || "");
}

let cachedSecrets: { resendKey: string; webhookSecret: string } | null = null;
let lookupFailedAt = 0;
async function secrets(sb: any) {
  if (ENV_RESEND_API_KEY && ENV_WEBHOOK_SECRET) return { resendKey: ENV_RESEND_API_KEY, webhookSecret: ENV_WEBHOOK_SECRET };
  if (cachedSecrets) return cachedSecrets;
  if (Date.now() - lookupFailedAt < 60_000) return { resendKey: "", webhookSecret: "" }; // not on every request
  const { data, error } = await sb.rpc("inbound_mail_secrets");
  const row = Array.isArray(data) ? data[0] : data;
  const found = { resendKey: ENV_RESEND_API_KEY || String(row?.resend_api_key || ""), webhookSecret: ENV_WEBHOOK_SECRET || String(row?.webhook_secret || "") };
  if (!error && found.resendKey && !found.webhookSecret) found.webhookSecret = await ownWebhookSecret(found.resendKey).catch(() => "");
  if (!error && found.resendKey && found.webhookSecret) cachedSecrets = found;
  else lookupFailedAt = Date.now();
  return found;
}

async function storeFor(sb: any, target: any, data: any, attachments: any[]) {
  const userId = String(target.user_id), emailId = clean(data.email_id, 80);
  const company = target.company_context && typeof target.company_context === "object" ? target.company_context : {};
  let stored = 0;
  for (let i = 0; i < attachments.length; i++) {
    const a = attachments[i];
    const clientRef = clean(`mail-${emailId}-${clean(a.id, 40) || i}`, 120);
    const { data: existing } = await sb.from("documents").select("id").eq("user_id", userId).eq("client_ref", clientRef).maybeSingle();
    if (existing) { stored++; continue; } // a replayed webhook
    const name = fileName(a, i), path = `${userId}/${clientRef}-${safeStorageName(name)}`;
    const file = await fetch(String(a.download_url || ""), { signal: AbortSignal.timeout(30000) });
    if (!file.ok) throw Object.assign(new Error("ATTACHMENT_DOWNLOAD_FAILED"), { retry: true });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES || bytes.byteLength === 0) continue;
    const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: a.content_type, upsert: true });
    if (up.error) throw Object.assign(new Error("STORAGE_FAILED"), { retry: true });
    const ins = await sb.from("documents").insert({
      user_id: userId, client_ref: clientRef, name, kind: "document", mime_type: a.content_type, storage_path: path,
      metadata: {
        size: bytes.byteLength, batch_id: clean("mail-" + emailId, 120), processing: true, requested_kind: "auto", source: "mail",
        mail: { from: clean(data.from, 200), subject: clean(data.subject, 200), received_at: clean(data.created_at, 40) },
        company_context: { name: clean(company.name, 160), tradeName: clean(company.tradeName, 160), kvk: clean(company.kvk, 40), vat: clean(company.vat, 40) },
      },
    });
    if (ins.error && ins.error.code !== "23505") { await sb.storage.from(BUCKET).remove([path]); throw Object.assign(new Error("DOCUMENT_INSERT_FAILED"), { retry: true }); }
    stored++;
  }
  return stored;
}

async function record(sb: any, emailId: string, local: string, userId: string | null, outcome: string, files = 0) {
  const patch: Record<string, unknown> = { outcome, files };
  if (userId) patch.user_id = userId;
  await sb.from("inbound_mail_events").update(patch).eq("email_id", emailId).eq("local_part", local);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { ok: false });
  if (!SUPABASE_URL || !SERVICE_KEY) return reply(503, { ok: false, error: "NOT_CONFIGURED" });
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY) return reply(413, { ok: false });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { resendKey, webhookSecret } = await secrets(sb).catch(() => ({ resendKey: "", webhookSecret: "" }));
  if (!resendKey || !webhookSecret) return reply(503, { ok: false, error: "NOT_CONFIGURED" });
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY) return reply(413, { ok: false });
  if (!(await verifySignature(raw, req.headers, webhookSecret))) return reply(401, { ok: false });
  let event: any;
  try { event = JSON.parse(raw); } catch { return reply(400, { ok: false }); }
  if (event?.type !== "email.received") return reply(200, { ok: true, ignored: true });
  const data = event.data || {}, emailId = clean(data.email_id, 80);
  if (!emailId) return reply(200, { ok: true, ignored: true });
  const outcomes: string[] = [];
  let attachments: any[] | null = null;
  try {
    for (const local of localParts(data)) {
      // Claim this mail for this address once; a replay of a finished mail does nothing.
      const claim = await sb.from("inbound_mail_events").insert({ email_id: emailId, local_part: local, outcome: "received" });
      if (claim.error) {
        const { data: seen } = await sb.from("inbound_mail_events").select("outcome").eq("email_id", emailId).eq("local_part", local).maybeSingle();
        if (seen && !["received", "failed"].includes(String(seen.outcome))) { outcomes.push("duplicate"); continue; }
      }
      const { data: rows } = await sb.rpc("inbound_mail_target", { p_local_part: local });
      const target = Array.isArray(rows) ? rows[0] : rows;
      if (!target?.user_id) { await record(sb, emailId, local, null, "unknown_address"); outcomes.push("unknown_address"); continue; }
      if (!target.entitled) { await record(sb, emailId, local, target.user_id, "not_entitled"); outcomes.push("not_entitled"); continue; }
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { count } = await sb.from("inbound_mail_events").select("id", { count: "exact", head: true }).eq("user_id", target.user_id).eq("outcome", "stored").gte("created_at", since);
      if (Number(count || 0) >= MAX_MAILS_PER_DAY) { await record(sb, emailId, local, target.user_id, "limited"); outcomes.push("limited"); continue; }
      if (!attachments) attachments = (await resend(`/emails/receiving/${encodeURIComponent(emailId)}/attachments`, resendKey))?.data || [];
      const { picked } = pickAttachments(attachments || []);
      if (!picked.length) { await record(sb, emailId, local, target.user_id, "no_files"); outcomes.push("no_files"); continue; }
      const stored = await storeFor(sb, target, data, picked);
      await record(sb, emailId, local, target.user_id, stored ? "stored" : "no_files", stored);
      outcomes.push(stored ? "stored" : "no_files");
    }
  } catch (err: any) {
    // Only an outcome code in the logs: no addresses, names or file contents.
    console.log(JSON.stringify({ event: "inbound_mail_failed", code: clean(err?.message, 60) }));
    for (const local of localParts(data)) await record(sb, emailId, local, null, "failed").catch(() => {});
    return reply(err?.retry ? 500 : 200, { ok: false });
  }
  console.log(JSON.stringify({ event: "inbound_mail", outcomes }));
  return reply(200, { ok: true, outcomes });
});
