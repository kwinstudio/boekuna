import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

// Bonnen mailen (Kwin 2026-11-04, UI-trucs 18). Every account can have its own address on the
// inbound domain, e.g. kwinstudio-3f9a1c7e5b2d@bon.boekuna.nl. Resend receives the mail and calls
// this function with an email.received webhook (metadata only). The function looks up the account
// by the address, fetches the attachments from Resend and stores each one exactly like an upload
// from the app: a file in the private bucket plus a documents row marked for processing, and the
// queued processing job. The app runs that job with the user's own session, so the document quota,
// the processor and the review screen are the same as for a scanned receipt.
// No automatic reply ever goes back, so an unknown or revoked address tells a sender nothing.
//
// Betere logica (Kwin 2026-11-05), the way Dext, Expensify and Moneybird do it:
// - A mail without a pdf or photo is not dropped. When the mail itself is the receipt (a webshop or
//   Uber mail with the amounts in the text), it is saved as a pdf of the mail and processed the same way.
// - Gmail's forwarding confirmation is kept as a code and link the app shows, so automatic forwarding
//   from Gmail can be switched on. It never becomes a bon.
// - Every mail leaves an outcome with its subject, so the app can say what happened to it.
// - The processing job is created right away: an open app hears it and starts reading the bon.

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
const MAX_MAIL_TEXT = 20000; // characters of a mail body turned into a pdf
const MAX_MAIL_PAGES = 6;
const EXECUTION_MODE = Deno.env.get("DOCUMENT_EXECUTION_MODE") === "workflow" ? "workflow" : "legacy"; // same as document-processing
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

// One stored file: the private bucket plus a documents row, the same as an upload from the app.
async function saveDocument(sb: any, target: any, data: any, clientRef: string, name: string, type: string, bytes: Uint8Array, extra: Record<string, unknown> = {}) {
  const userId = String(target.user_id), emailId = clean(data.email_id, 80);
  const company = target.company_context && typeof target.company_context === "object" ? target.company_context : {};
  const path = `${userId}/${clientRef}-${safeStorageName(name)}`;
  const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: true });
  if (up.error) throw Object.assign(new Error("STORAGE_FAILED"), { retry: true });
  const ins = await sb.from("documents").insert({
    user_id: userId, client_ref: clientRef, name, kind: "document", mime_type: type, storage_path: path,
    metadata: {
      size: bytes.byteLength, batch_id: clean("mail-" + emailId, 120), processing: true, requested_kind: "auto", source: "mail",
      mail: { from: clean(data.from, 200), subject: clean(data.subject, 200), received_at: clean(data.created_at, 40), ...extra },
      company_context: { name: clean(company.name, 160), tradeName: clean(company.tradeName, 160), kvk: clean(company.kvk, 40), vat: clean(company.vat, 40) },
    },
  });
  if (ins.error && ins.error.code !== "23505") { await sb.storage.from(BUCKET).remove([path]); throw Object.assign(new Error("DOCUMENT_INSERT_FAILED"), { retry: true }); }
}

// The processing job, made right away (the same row document-processing's resume would make).
// An open app hears the new job and starts it with the user's own session; a closed app starts it
// when it opens. If this fails, that resume still makes the job from the document.
async function queueJob(sb: any, target: any, clientRef: string) {
  try {
    const userId = String(target.user_id);
    const { data: doc } = await sb.from("documents").select("id,name,mime_type,metadata").eq("user_id", userId).eq("client_ref", clientRef).maybeSingle();
    if (!doc?.id) return;
    const meta = doc.metadata && typeof doc.metadata === "object" ? doc.metadata : {};
    const company = meta.company_context && typeof meta.company_context === "object" ? meta.company_context : {};
    await sb.from("document_processing_jobs").insert({
      user_id: userId, document_id: doc.id, client_ref: clientRef, batch_id: clean(meta.batch_id || "mail", 120),
      file_name: clean(doc.name, 260) || "document", mime_type: clean(doc.mime_type, 160) || "application/octet-stream",
      size_bytes: Math.max(0, Number(meta.size || 0)), requested_kind: "auto", state: "queued", phase: "queued", execution_mode: EXECUTION_MODE,
      company_context: { name: clean(company.name, 160), tradeName: clean(company.tradeName, 160), kvk: clean(company.kvk, 40), vat: clean(company.vat, 40) },
    }); // a second delivery hits the unique (user_id, document_id) and changes nothing
  } catch (_) { /* resume repairs it */ }
}

async function storeFor(sb: any, target: any, data: any, attachments: any[]) {
  const userId = String(target.user_id), emailId = clean(data.email_id, 80);
  let stored = 0;
  for (let i = 0; i < attachments.length; i++) {
    const a = attachments[i];
    const clientRef = clean(`mail-${emailId}-${clean(a.id, 40) || i}`, 120);
    const { data: existing } = await sb.from("documents").select("id").eq("user_id", userId).eq("client_ref", clientRef).maybeSingle();
    if (existing) { await queueJob(sb, target, clientRef); stored++; continue; } // a replayed webhook
    const file = await fetch(String(a.download_url || ""), { signal: AbortSignal.timeout(30000) });
    if (!file.ok) throw Object.assign(new Error("ATTACHMENT_DOWNLOAD_FAILED"), { retry: true });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES || bytes.byteLength === 0) continue;
    await saveDocument(sb, target, data, clientRef, fileName(a, i), a.content_type, bytes);
    await queueJob(sb, target, clientRef);
    stored++;
  }
  return stored;
}

// --- The mail itself -------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", euro: "€", copy: "©", reg: "®", trade: "™", hellip: "…",
  ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", bull: "•", middot: "·", times: "×", deg: "°",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", aacute: "á", agrave: "à", auml: "ä", iuml: "ï", iacute: "í", oacute: "ó",
  ouml: "ö", ocirc: "ô", uuml: "ü", uacute: "ú", ccedil: "ç", ntilde: "ñ", szlig: "ß", Eacute: "É", Euml: "Ë", Ouml: "Ö", Uuml: "Ü",
};
function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 && !(n >= 0xd800 && n < 0xe000) ? String.fromCodePoint(n) : " ";
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m;
  });
}
// Readable text from a mail's html: blocks and table rows on their own line, cells side by side.
export function htmlText(html: string) {
  const s = String(html || "").slice(0, 800_000)
    .replace(/<(head|style|script|title|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|thead|tbody|tfoot|section|article|header|footer|blockquote|center)\s*>/gi, "\n")
    .replace(/<\/(td|th)\s*>/gi, "   ")
    .replace(/<[^>]*>/g, "");
  return tidy(decodeEntities(s));
}
function tidy(s: string) {
  const lines = String(s || "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/[ \t\u00a0\u200b\u200c\u200d\ufeff]+/g, " ").trim());
  const out: string[] = [];
  for (const l of lines) if (l || (out.length && out[out.length - 1] !== "")) out.push(l);
  return out.join("\n").trim();
}
const MONEY = /(€|\beur\b|\beuro)\s*-?\d{1,7}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d{1,7}(?:[.,]\d{3})*[.,]\d{2}\s*(?:€|\beur\b)/i;
const RECEIPT_WORDS = /(totaal|total|te betalen|bedrag|btw|vat|factuur|invoice|kassabon|receipt|ontvangstbewijs|bestelling|order|betaling|payment|amount)/i;
// The text of a mail, from its plain-text part when that holds the amounts, otherwise from the html.
export function mailText(mail: any) {
  const text = tidy(String(mail?.text || "").slice(0, 400_000));
  const fromHtml = mail?.html ? htmlText(mail.html) : "";
  const pick = text && (MONEY.test(text) || !fromHtml) ? text : fromHtml || text;
  return pick.slice(0, MAX_MAIL_TEXT);
}
// Only a mail that reads like a receipt or invoice becomes a document: an amount in euro, or an
// amount next to a word like totaal, btw or factuur. "Test" or "zie bijlage" without the file does not.
export function looksLikeReceipt(text: string) {
  const t = String(text || "").slice(0, MAX_MAIL_TEXT);
  return MONEY.test(t) || (RECEIPT_WORDS.test(t) && /\b\d{1,7}[.,]\d{2}\b/.test(t));
}

// Gmail asks the forwarding address to confirm before it forwards anything ("(#123456789) Gmail
// Forwarding Confirmation"). Its code and link go to the app; the link only counts when it is Google's own.
export function gmailForwardConfirm(data: any, mail: any) {
  const from = String(mail?.from || data?.from || "").toLowerCase(), subject = String(mail?.subject || data?.subject || "");
  if (!from.includes("forwarding-noreply@google.com") && !/gmail.{0,30}(forwarding|doorstuur|weiterleitung|transfert)/i.test(subject)) return null;
  const text = String(mail?.text || "") + "\n" + (mail?.html ? htmlText(mail.html) : "");
  const hrefs = String(mail?.html || "").replace(/&amp;/gi, "&");
  const code = (subject.match(/\(#\s?(\d{6,12})\)/) || text.match(/(?:code|bevestigingscode)\D{0,24}(\d{6,12})/i) || [])[1] || "";
  const link = ((text + " " + hrefs).match(/https:\/\/(?:mail-settings|mail)\.google\.com\/mail\/[^\s"'<>]{4,600}/i) || [])[0] || "";
  const account = (subject.match(/([a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,120}\.[a-z]{2,24})/i) || [])[1] || "";
  if (!code && !link) return null;
  return { code, link, account: account.toLowerCase() };
}

// The standard pdf font knows WinAnsi only: accents stay, other characters get a plain twin or "?".
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const PDF_TEXT_SWAPS: Record<string, string> = { "Ł": "L", "ł": "l", "ı": "i", "Đ": "D", "đ": "d", "Ħ": "H", "ħ": "h", "→": "->", "←": "<-", "≤": "<=", "≥": ">=", "−": "-", "‐": "-", "‑": "-", "′": "'", "″": '"' };
const winAnsi = (ch: string) => { const c = ch.codePointAt(0) || 0; return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch); };
export function pdfText(value: unknown) {
  let out = "";
  for (const ch of String(value ?? "")) {
    if (winAnsi(ch)) { out += ch; continue; }
    if (PDF_TEXT_SWAPS[ch]) { out += PDF_TEXT_SWAPS[ch]; continue; }
    if (/\s/.test(ch)) { out += " "; continue; }
    const plain = ch.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    out += plain && [...plain].every(winAnsi) ? plain : "?";
  }
  return out;
}
function wrap(line: string, font: any, size: number, width: number) {
  const out: string[] = [];
  let current = "";
  for (let word of pdfText(line).split(" ")) {
    while (font.widthOfTextAtSize(word, size) > width) { // a long link: break it by characters
      const head = current ? current + " " : "";
      let lo = 0, hi = Math.min(word.length, 400);
      while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (font.widthOfTextAtSize(head + word.slice(0, mid), size) <= width) lo = mid; else hi = mid - 1; }
      if (!lo && current) { out.push(current); current = ""; continue; }
      const n = Math.max(1, lo);
      out.push(head + word.slice(0, n)); current = ""; word = word.slice(n);
    }
    const next = current ? current + " " + word : word;
    if (current && font.widthOfTextAtSize(next, size) > width) { out.push(current); current = word; } else current = next;
  }
  out.push(current);
  return out;
}
const MONTHS: Record<string, number> = {
  jan: 0, januari: 0, january: 0, feb: 1, februari: 1, february: 1, mrt: 2, maa: 2, maart: 2, mar: 2, march: 2, apr: 3, april: 3,
  mei: 4, may: 4, jun: 5, juni: 5, june: 5, jul: 6, juli: 6, july: 6, aug: 7, augustus: 7, august: 7, sep: 8, sept: 8, september: 8,
  okt: 9, oktober: 9, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const NL_MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
function amsterdam(d: Date, time = false) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((p) => [p.type, p.value]));
    const day = `${Number(parts.day)} ${NL_MONTHS[Number(parts.month) - 1]} ${parts.year}`;
    return time ? `${day}, ${parts.hour}:${parts.minute}` : day;
  } catch { return d.toISOString().slice(0, time ? 16 : 10).replace("T", " "); }
}
// "wo 4 nov 2026 om 16:53", "Wed, Nov 4, 2026 at 4:53 PM", "woensdag 4 november 2026 16:53" or
// "04-11-2026" as "4 november 2026". Never "2026 om 16:53": the processor reads "2026 OM" as a postcode.
export function mailDate(value: unknown, fallback?: unknown) {
  const v = String(value || "").toLowerCase();
  let m = v.match(/(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})/), day = 0, month = -1, year = 0;
  if (m && MONTHS[m[2]] !== undefined) { day = +m[1]; month = MONTHS[m[2]]; year = +m[3]; }
  else if ((m = v.match(/\b([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/)) && MONTHS[m[1]] !== undefined) { day = +m[2]; month = MONTHS[m[1]]; year = +m[3]; }
  else if ((m = v.match(/\b(\d{4})-(\d{2})-(\d{2})(?!\d)/))) { year = +m[1]; month = +m[2] - 1; day = +m[3]; }
  else if ((m = v.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?!\d)/))) { day = +m[1]; month = +m[2] - 1; year = +m[3]; }
  if (month >= 0 && day >= 1 && day <= 31 && year >= 2000 && year <= 2100) return `${day} ${NL_MONTHS[month]} ${year}`;
  const d = new Date(String(fallback || ""));
  return isNaN(d.getTime()) ? "" : amsterdam(d);
}

// A forwarded mail (Gmail, Apple Mail, Outlook; Dutch and English): the shop's own Van, Datum and
// Onderwerp from the forwarded block, and only the text below it. Whoever forwarded is never the supplier.
const FWD_MARK = /^(?:-{2,}\s*(?:doorgestuurd bericht|forwarded message|original message|oorspronkelijk bericht|origineel bericht)\s*-{2,}|begin (?:doorgestuurd bericht|forwarded message)\s*:?|_{8,})$/i;
const FWD_KEYS: Record<string, string> = {
  van: "from", from: "from", datum: "date", date: "date", verzonden: "date", sent: "date",
  onderwerp: "subject", subject: "subject", aan: "to", to: "to", cc: "to", "beantwoorden aan": "to", "reply-to": "to",
};
export function forwarded(text: string) {
  const lines = String(text || "").split("\n");
  for (let i = 0; i < Math.min(lines.length, 300); i++) {
    if (!FWD_MARK.test(lines[i])) continue;
    const head: Record<string, string> = {};
    let j = i + 1;
    while (j < lines.length && !lines[j]) j++;
    for (; j < lines.length && j < i + 20; j++) {
      const m = lines[j].match(/^([a-z][a-z -]{0,18}?)\s*:\s*(.*)$/i), key = m ? FWD_KEYS[m[1].toLowerCase()] : "";
      if (!key) break;
      if (!head[key]) head[key] = m![2].trim();
    }
    if (head.from) return { from: head.from, date: head.date || "", subject: head.subject || "", body: lines.slice(j).join("\n").trim() };
  }
  return null;
}

// "Klarna <noreply-nl@klarna.nl>" -> { name: "Klarna", address: "noreply-nl@klarna.nl" }
function sender(value: unknown) {
  const v = clean(value, 300), address = ((v.match(/<([^<>\s]+@[^<>\s]+)>/) || v.match(/([^\s<>"]+@[^\s<>"]+)/) || [])[1] || "").toLowerCase();
  const name = v.replace(/<[^>]*>/g, "").replace(/["']/g, "").trim();
  return { name: name && name.toLowerCase() !== address ? name : "", address, text: v };
}
// A payment provider's mail is about a payment to a shop: that shop is the supplier, not Klarna or PayPal.
const PAY_PROVIDERS = /(^|[.@])(klarna|paypal|afterpay|riverty|payin3|in3|tikkie|billink|mollie)\.[a-z.]{2,12}$/i;
const PAID_TO = /\b(?:betaling|betaald|bestelling|aankoop|aankopen|verzonden|gestuurd|payment|purchase|order|sent|paid)\s+(?:aan|bij|voor|to|at|with)\s+([^\s,!?:;()<>]{2,60}(?:\s+[^\s,!?:;()<>]{1,30}){0,3}?)(?=\s+(?:ontvangen|is|was|gelukt|voltooid|geslaagd|verwerkt|bevestigd|betaald|received|completed|confirmed|succeeded)\b|\s*[!?,:;(\n]|\.\s|\.?\s*$)/i;
// Someone's own mailbox: the person who mailed the bon, not the shop.
const PERSONAL_MAIL = /@(gmail|googlemail|hotmail|outlook|live|msn|icloud|me|mac|yahoo|ymail|aol|ziggo|kpnmail|kpnplanet|planet|home|hetnet|xs4all|telfort|chello|caiway|zeelandnet|proton|protonmail|pm|gmx|web)\.[a-z.]{2,8}$/i;
export function mailHeader(data: any, text: string) {
  const fwd = forwarded(text);
  const from = sender(fwd ? fwd.from : data?.from), subject = clean(fwd?.subject || data?.subject, 300).replace(/^(?:(?:fwd?|fw|doorst|tr|wg)\s*:\s*)+/i, "");
  const rows: [string, string][] = [];
  const merchant = PAY_PROVIDERS.test(from.address) ? ((subject + "\n" + (fwd ? fwd.body : text).slice(0, 2000)).match(PAID_TO) || [])[1] || "" : "";
  if (merchant) rows.push(["Van", merchant.replace(/\.$/, "")], ["Via", from.name || from.address]);
  else if (from.address && PERSONAL_MAIL.test(from.address)) rows.push(["Doorgestuurd door", from.text]);
  else if (from.text) rows.push(["Van", from.text]);
  const date = mailDate(fwd?.date, data?.created_at);
  if (date) rows.push(["Datum", date]);
  if (subject) rows.push(["Onderwerp", subject]);
  return { rows, body: fwd ? fwd.body : String(text || "") };
}

// Mails made from html tables put a label and its value on separate lines ("Totaal", "", "€ 43,63");
// the processor reads a total only as "Totaal: € 43,63". Images, bare links and rules are left out.
const AMOUNT_LINE = new RegExp(`^-?\\s*(?:${MONEY.source})\\s*$`, "i");
export function receiptLines(text: string) {
  const src = String(text || "").split("\n")
    .map((l) => l.replace(/\[(?:image|afbeelding)[^\]]*\]/gi, "").replace(/<(?:https?|mailto):[^>\s]*>/gi, "").trim())
    .filter((l) => !/^(?:[-_=*~.·•]\s*){5,}$/.test(l) && !/^(?:https?:\/\/|mailto:)\S+$/i.test(l) && l !== "." && l !== ",");
  const out: string[] = [];
  const label = (l: string) => l.length <= 40 && /^[\p{L}(]/u.test(l) && !/\d/.test(l) && !/[.!?,;]$/.test(l) && l.split(/\s+/).length <= 6;
  for (let i = 0; i < src.length; i++) {
    const l = src[i];
    if (l && label(l)) {
      let j = i + 1;
      while (j < src.length && !src[j]) j++;
      const v = src[j] || "", gap = j > i + 1;
      const valueLike = v.length <= 40 && /\d/.test(v) && v.split(/\s+/).length <= 6 && !label(v);
      if (v && (AMOUNT_LINE.test(v) || (gap && valueLike))) { out.push(`${l.replace(/:$/, "")}: ${v}`); i = j; continue; }
    }
    if (l || (out.length && out[out.length - 1] !== "")) out.push(l);
  }
  return out.join("\n").trim();
}

// A plain A4 pdf of the mail: who it is from, the date, the subject and the text, so the processor reads
// it like any other receipt and the 7-year archive keeps what was received.
export async function mailPdf(data: any, text: string) {
  const { rows, body } = mailHeader(data, text);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(pdfText(mailSubject(data) || "Mail"));
  pdf.setProducer("Boekuna"); pdf.setCreator("Boekuna, bonnen mailen");
  const W = 595.28, H = 841.89, M = 50, width = W - 2 * M, ink = rgb(0.1, 0.12, 0.11), muted = rgb(0.4, 0.44, 0.42);
  let page = pdf.addPage([W, H]), y = H - M, full = false;
  const put = (t: string, f = font, size = 10, color = ink) => {
    if (full) return;
    if (y < M) { if (pdf.getPageCount() >= MAX_MAIL_PAGES) { full = true; return; } page = pdf.addPage([W, H]); y = H - M; }
    if (t) page.drawText(t, { x: M, y, size, font: f, color });
    y -= size + 4;
  };
  for (const [label, value] of rows) for (const l of wrap(`${label}: ${value}`, bold, 9, width)) put(l, bold, 9, muted);
  y -= 8;
  for (const para of receiptLines(body.slice(0, MAX_MAIL_TEXT)).split("\n")) for (const l of wrap(para, font, 10, width)) put(l);
  const d = new Date(String(data?.created_at || ""));
  if (!isNaN(d.getTime())) { y -= 8; put(pdfText(`Naar Boekuna gemaild op ${amsterdam(d, true)}.`), font, 8, muted); }
  return await pdf.save();
}
function mailSubject(data: any) { return clean(data?.subject, 200).replace(/^(?:(?:fwd?|fw|doorst|tr|wg)\s*:\s*)+/i, ""); }
function mailFileName(data: any) {
  const subject = mailSubject(data).slice(0, 90).replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return (subject || "Bon uit mail") + ".pdf";
}
// The mail itself as the bon, when it has no usable attachment.
async function storeBody(sb: any, target: any, data: any, text: string) {
  const userId = String(target.user_id), emailId = clean(data.email_id, 80);
  const clientRef = clean(`mail-${emailId}-tekst`, 120);
  const { data: existing } = await sb.from("documents").select("id").eq("user_id", userId).eq("client_ref", clientRef).maybeSingle();
  if (!existing) await saveDocument(sb, target, data, clientRef, mailFileName(data), "application/pdf", await mailPdf(data, text), { body: true });
  await queueJob(sb, target, clientRef);
  return 1;
}

// The outcome of one mail for one address. detail (subject, Gmail code) needs migration
// 20261105140000; before that is run the outcome is still kept, without it.
async function record(sb: any, emailId: string, local: string, userId: string | null, outcome: string, files = 0, detail: Record<string, string> | null = null) {
  const patch: Record<string, unknown> = { outcome, files };
  if (userId) patch.user_id = userId;
  if (detail) patch.detail = detail;
  const res = await sb.from("inbound_mail_events").update(patch).eq("email_id", emailId).eq("local_part", local);
  if (res?.error && detail) {
    delete patch.detail;
    if (outcome === "forward_confirm") patch.outcome = "no_files";
    await sb.from("inbound_mail_events").update(patch).eq("email_id", emailId).eq("local_part", local);
  }
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
  let attachments: any[] | null = null, mail: any = null;
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
      const detail: Record<string, string> = { subject: clean(data.subject, 120) };
      if (!attachments) attachments = (await resend(`/emails/receiving/${encodeURIComponent(emailId)}/attachments`, resendKey))?.data || [];
      const { picked } = pickAttachments(attachments || []);
      const stored = picked.length ? await storeFor(sb, target, data, picked) : 0;
      if (stored) { await record(sb, emailId, local, target.user_id, "stored", stored, detail); outcomes.push("stored"); continue; }
      // No pdf or photo: the mail itself may be Gmail's forwarding check or the receipt.
      if (!mail) mail = (await resend(`/emails/receiving/${encodeURIComponent(emailId)}`, resendKey)) || {};
      const confirm = gmailForwardConfirm(data, mail);
      if (confirm) {
        await record(sb, emailId, local, target.user_id, "forward_confirm", 0, { ...detail, code: confirm.code, link: confirm.link.slice(0, 600), account: confirm.account.slice(0, 120) });
        outcomes.push("forward_confirm"); continue;
      }
      const text = mailText(mail);
      if (looksLikeReceipt(text)) {
        await storeBody(sb, target, data, text);
        await record(sb, emailId, local, target.user_id, "stored", 1, { ...detail, from_text: "1" });
        outcomes.push("stored_text"); continue;
      }
      await record(sb, emailId, local, target.user_id, "no_files", 0, detail);
      outcomes.push("no_files");
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
