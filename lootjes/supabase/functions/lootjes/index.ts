// Lootjes API. One endpoint, JSON {action, ...}. No accounts: the organizer holds an
// admin token, every participant holds a personal token. Only hashes are stored.
// The draw happens here on the server, so nobody — also not the organizer — sees who drew whom.
import { createClient } from "npm:@supabase/supabase-js@2";
import { draw } from "./draw.ts";
import { ITEM_ACTIONS, itemsAction, migrateText, shopItems, wishItems } from "./items.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
const bad = (code: string, msg: string, status = 400) => new ApiError(status, code, msg);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function randomToken(bytes = 24): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O/1/I/L
function joinCode(): string {
  const b = new Uint8Array(7);
  crypto.getRandomValues(b);
  return [...b].map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
}
async function hash(token: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`lt1:${token}`));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const str = (v: unknown, max: number, field: string, min = 1): string => {
  const s = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (s.length < min || s.length > max) throw bad("invalid", `${field} moet ${min}-${max} tekens zijn.`);
  return s;
};
const optText = (v: unknown, max: number): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") throw bad("invalid", "Ongeldige tekst.");
  const s = v.trim();
  if (s.length > max) throw bad("invalid", `Maximaal ${max} tekens.`);
  return s || null;
};
const optDate = (v: unknown): string | null => {
  if (!v) return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad("invalid", "Ongeldige datum.");
  return v;
};
const optBudget = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw bad("invalid", "Ongeldig budget.");
  return n;
};

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) {
    console.error(error);
    const e = error as { code?: string };
    if (e.code === "23505") throw bad("duplicate", "Die naam staat al in de groep.", 409);
    throw bad("server", "Er ging iets mis. Probeer het opnieuw.", 500);
  }
  return data;
}

const ctx = { db, must, bad };

async function rateLimit(key: string, max: number, windowSec: number) {
  const now = Date.now();
  const { data } = await db.from("lt_rate").select("window_start,hits").eq("key", key).maybeSingle();
  if (data && now - new Date(data.window_start).getTime() < windowSec * 1000) {
    if (data.hits >= max) throw bad("rate", "Even rustig aan. Probeer het zo opnieuw.", 429);
    await db.from("lt_rate").update({ hits: data.hits + 1 }).eq("key", key);
  } else {
    await db.from("lt_rate").upsert({ key, window_start: new Date(now).toISOString(), hits: 1 });
  }
}

type Group = {
  id: string; join_code: string; name: string; occasion: string; event_date: string | null;
  budget_cents: number | null; note: string | null; poems: boolean; join_open: boolean;
  drawn_at: string | null; previous_group_id: string | null; created_at: string;
};
type Member = {
  id: string; group_id: string; name: string; is_organizer: boolean; joined_self: boolean;
  wishlist: string; wishlist_updated_at: string | null; link_sent_at: string | null;
  first_opened_at: string | null; last_seen_at: string | null; created_at: string;
};
const GROUP_COLS = "id,join_code,name,occasion,event_date,budget_cents,note,poems,join_open,drawn_at,previous_group_id,created_at";
const MEMBER_COLS = "id,group_id,name,is_organizer,joined_self,wishlist,wishlist_updated_at,link_sent_at,first_opened_at,last_seen_at,created_at";

const publicGroup = (g: Group) => ({
  id: g.id, joinCode: g.join_code, name: g.name, occasion: g.occasion, eventDate: g.event_date,
  budgetCents: g.budget_cents, note: g.note, poems: g.poems, joinOpen: g.join_open, drawnAt: g.drawn_at,
});

async function groupByAdmin(adminToken: unknown): Promise<Group> {
  if (typeof adminToken !== "string" || adminToken.length < 20) throw bad("auth", "Geen toegang.", 401);
  const g = await must(db.from("lt_groups").select(GROUP_COLS).eq("admin_token_hash", await hash(adminToken)).maybeSingle());
  if (!g) throw bad("auth", "Deze groep bestaat niet meer of de link klopt niet.", 404);
  return g as Group;
}
async function memberByToken(token: unknown): Promise<{ me: Member; group: Group }> {
  if (typeof token !== "string" || token.length < 20) throw bad("auth", "Deze link klopt niet.", 401);
  const me = await must(db.from("lt_members").select(MEMBER_COLS).eq("token_hash", await hash(token)).maybeSingle());
  if (!me) throw bad("auth", "Deze link klopt niet of je bent uit de groep gehaald.", 404);
  const group = await must(db.from("lt_groups").select(GROUP_COLS).eq("id", (me as Member).group_id).single());
  return { me: me as Member, group: group as Group };
}
async function members(groupId: string): Promise<Member[]> {
  return (await must(db.from("lt_members").select(MEMBER_COLS).eq("group_id", groupId).order("created_at"))) as Member[];
}
async function exclusions(groupId: string): Promise<Array<[string, string]>> {
  const rows = (await must(db.from("lt_exclusions").select("a,b").eq("group_id", groupId))) as { a: string; b: string }[];
  return rows.map((r) => [r.a, r.b]);
}

type ThreadRow = { giver_id: string; block_to_receiver: boolean; block_to_giver: boolean };
/// The assignment behind a chat thread, seen from member `meId`.
async function threadFor(meId: string, groupId: string, thread: unknown): Promise<{ giverId: string; direction: "to_receiver" | "to_giver"; row: ThreadRow }> {
  const cols = "giver_id,block_to_receiver,block_to_giver";
  if (thread === "myLootje") {
    const row = (await must(db.from("lt_assignments").select(cols).eq("group_id", groupId).eq("giver_id", meId).maybeSingle())) as ThreadRow | null;
    if (!row) throw bad("not_found", "Geen lootje gevonden.", 404);
    return { giverId: meId, direction: "to_receiver", row };
  }
  const row = (await must(db.from("lt_assignments").select(cols).eq("group_id", groupId).eq("receiver_id", meId).maybeSingle())) as ThreadRow | null;
  if (!row) throw bad("not_found", "Geen Sint gevonden.", 404);
  return { giverId: row.giver_id, direction: "to_giver", row };
}

async function newMember(groupId: string, name: string, opts: { organizer?: boolean; self?: boolean } = {}) {
  const token = randomToken();
  const row = await must(
    db.from("lt_members").insert({
      group_id: groupId, name, token_hash: await hash(token),
      is_organizer: !!opts.organizer, joined_self: !!opts.self,
    }).select(MEMBER_COLS).single(),
  );
  return { member: row as Member, token };
}

async function adminView(g: Group) {
  const ms = await members(g.id);
  const ex = await exclusions(g.id);
  const asg = g.drawn_at
    ? ((await must(db.from("lt_assignments").select("giver_id,gift_ready").eq("group_id", g.id))) as { giver_id: string; gift_ready: boolean }[])
    : [];
  const ready = new Map(asg.map((a) => [a.giver_id, a.gift_ready]));
  const wishRows = (await must(db.from("lt_wish_items").select("member_id").eq("group_id", g.id))) as { member_id: string }[];
  const withItems = new Set(wishRows.map((w) => w.member_id));
  // Integrity check the organizer can see without seeing any pair:
  // everyone gives exactly one gift and receives exactly one gift.
  let check: { members: number; givers: number; receivers: number; ok: boolean } | null = null;
  if (g.drawn_at) {
    const recv = (await must(db.from("lt_assignments").select("receiver_id").eq("group_id", g.id))) as { receiver_id: string }[];
    const memberIds = new Set(ms.map((m) => m.id));
    const givers = new Set(asg.map((a) => a.giver_id));
    const receivers = new Set(recv.map((r) => r.receiver_id));
    const ok = givers.size === ms.length && receivers.size === ms.length && recv.length === ms.length &&
      [...givers].every((x) => memberIds.has(x)) && [...receivers].every((x) => memberIds.has(x));
    check = { members: ms.length, givers: givers.size, receivers: receivers.size, ok };
  }
  return {
    check,
    group: publicGroup(g),
    members: ms.map((m) => ({
      id: m.id, name: m.name, isOrganizer: m.is_organizer, joinedSelf: m.joined_self,
      hasWishlist: m.wishlist.trim().length > 0 || withItems.has(m.id), linkSentAt: m.link_sent_at,
      openedAt: m.first_opened_at, lastSeenAt: m.last_seen_at, giftReady: ready.get(m.id) ?? false,
    })),
    exclusions: ex,
  };
}

async function runDraw(g: Group) {
  const ms = await members(g.id);
  const ex = await exclusions(g.id);
  let lastYear = new Map<string, string>();
  if (g.previous_group_id) {
    // Map last year's pairs by name (members get new ids each year).
    const prev = await members(g.previous_group_id);
    const prevName = new Map(prev.map((m) => [m.id, m.name.toLowerCase()]));
    const nowId = new Map(ms.map((m) => [m.name.toLowerCase(), m.id]));
    const rows = (await must(db.from("lt_assignments").select("giver_id,receiver_id").eq("group_id", g.previous_group_id))) as { giver_id: string; receiver_id: string }[];
    for (const r of rows) {
      const giver = nowId.get(prevName.get(r.giver_id) ?? "");
      const receiver = nowId.get(prevName.get(r.receiver_id) ?? "");
      if (giver && receiver) lastYear.set(giver, receiver);
    }
  }
  const result = draw(ms.map((m) => m.id), ex, lastYear);
  if ("error" in result) {
    const e = result.error;
    if (e.kind === "tooFewPeople") throw bad("draw_too_few", "Je hebt minstens 3 mensen nodig.");
    if (e.kind === "nobodyLeft") {
      const name = ms.find((m) => m.id === e.person)?.name ?? "Iemand";
      throw bad("draw_nobody_left", `${name} mag niemand trekken. Haal een uitsluiting weg.`);
    }
    throw bad("draw_impossible", "Met deze uitsluitingen kan niet iedereen een lootje krijgen. Haal er een paar weg.");
  }
  await must(db.from("lt_assignments").delete().eq("group_id", g.id));
  await must(db.from("lt_messages").delete().eq("group_id", g.id));
  await must(db.from("lt_shop_items").delete().eq("group_id", g.id)); // shopping lists belong to the old draw
  await must(db.from("lt_assignments").insert(
    [...result.ok.pairs].map(([giver, receiver]) => ({ group_id: g.id, giver_id: giver, receiver_id: receiver })),
  ));
  await must(db.from("lt_groups").update({ drawn_at: new Date().toISOString(), join_open: false, updated_at: new Date().toISOString() }).eq("id", g.id));
  return { repeatedLastYear: result.ok.repeatedLastYear };
}


// ---------- Product search (bol.com Marketing Catalog API) ----------
// Needs BOL_CLIENT_ID + BOL_CLIENT_SECRET (free bol.com affiliate account > Open API).
// Optional BOL_SITE_ID turns product links into partner links (commission), clearly disclosed in the app.
let bolToken: { value: string; until: number } | null = null;
async function bolAccessToken(): Promise<string | null> {
  const id = Deno.env.get("BOL_CLIENT_ID"), secret = Deno.env.get("BOL_CLIENT_SECRET");
  if (!id || !secret) return null;
  if (bolToken && Date.now() < bolToken.until) return bolToken.value;
  const r = await fetch("https://login.bol.com/token?grant_type=client_credentials", {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, Accept: "application/json" },
  });
  if (!r.ok) { console.error("bol token", r.status, await r.text()); return null; }
  const j = await r.json();
  bolToken = { value: j.access_token, until: Date.now() + Math.max(30, (j.expires_in ?? 299) - 30) * 1000 };
  return bolToken.value;
}
function partnerLink(url: string): string {
  const site = Deno.env.get("BOL_SITE_ID");
  if (!site) return url;
  return `https://partner.bol.com/click/click?p=2&t=url&s=${encodeURIComponent(site)}&f=TXL&url=${encodeURIComponent(url)}&name=lootjes`;
}

// ---------- Link preview for the web page (the iOS app reads previews on the device) ----------
function isPublicHttpUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const h = u.hostname.toLowerCase();
  // Block local/private targets (SSRF): IP literals, localhost, internal names.
  if (!h.includes(".") || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return null;
  if (/^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return null;
  if (u.port && u.port !== "80" && u.port !== "443") return null;
  return u;
}
function metaContent(html: string, keys: string[]): string | null {
  for (const k of keys) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*>`, "i");
    const tag = html.match(re)?.[0];
    const c = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    if (c) return c.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
  }
  return null;
}

async function handle(body: Record<string, unknown>, ip: string) {
  const action = String(body.action ?? "");
  if (ITEM_ACTIONS.has(action)) {
    const { me, group } = await memberByToken(body.token);
    await rateLimit(`items:${me.id}`, 300, 3600);
    return itemsAction(ctx, action, body, me, group);
  }
  switch (action) {
    case "createGroup": {
      await rateLimit(`create:${ip}`, 30, 3600);
      const name = str(body.name, 80, "Groepsnaam");
      const occasion = ["sinterklaas", "kerst", "anders"].includes(String(body.occasion)) ? String(body.occasion) : "sinterklaas";
      const organizerName = str(body.organizerName, 40, "Je naam");
      const participates = body.organizerParticipates !== false;
      const names = Array.isArray(body.members) ? body.members.map((n) => str(n, 40, "Naam")) : [];
      const seen = new Set<string>();
      for (const n of [participates ? organizerName : "", ...names].filter(Boolean)) {
        if (seen.has(n.toLowerCase())) throw bad("duplicate", `${n} staat er twee keer in. Maak de namen uniek.`);
        seen.add(n.toLowerCase());
      }
      if (names.length > 60) throw bad("invalid", "Maximaal 60 deelnemers.");
      const adminToken = randomToken(32);
      let group: Group | null = null;
      for (let i = 0; i < 5 && !group; i++) {
        const { data, error } = await db.from("lt_groups").insert({
          join_code: joinCode(), admin_token_hash: await hash(adminToken), name, occasion,
          event_date: optDate(body.eventDate), budget_cents: optBudget(body.budgetCents),
          note: optText(body.note, 500), poems: body.poems !== false,
          previous_group_id: null,
        }).select(GROUP_COLS).single();
        if (!error) group = data as Group;
        else if ((error as { code?: string }).code !== "23505") { console.error(error); throw bad("server", "Er ging iets mis.", 500); }
      }
      if (!group) throw bad("server", "Er ging iets mis.", 500);
      const created: { id: string; name: string; token: string; isOrganizer: boolean }[] = [];
      if (participates) {
        const { member, token } = await newMember(group.id, organizerName, { organizer: true });
        created.push({ id: member.id, name: member.name, token, isOrganizer: true });
      }
      for (const n of names) {
        const { member, token } = await newMember(group.id, n);
        created.push({ id: member.id, name: member.name, token, isOrganizer: false });
      }
      return { adminToken, group: publicGroup(group), members: created };
    }

    case "adminStatus":
      return adminView(await groupByAdmin(body.adminToken));

    case "updateGroup": {
      const g = await groupByAdmin(body.adminToken);
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if ("name" in body) patch.name = str(body.name, 80, "Groepsnaam");
      if ("eventDate" in body) patch.event_date = optDate(body.eventDate);
      if ("budgetCents" in body) patch.budget_cents = optBudget(body.budgetCents);
      if ("note" in body) patch.note = optText(body.note, 500);
      if ("poems" in body) patch.poems = body.poems !== false;
      if ("joinOpen" in body && !g.drawn_at) patch.join_open = body.joinOpen === true;
      await must(db.from("lt_groups").update(patch).eq("id", g.id));
      return adminView(await groupByAdmin(body.adminToken));
    }

    case "addMember": {
      const g = await groupByAdmin(body.adminToken);
      if (g.drawn_at) throw bad("drawn", "Er is al getrokken. Trek opnieuw om iemand toe te voegen.", 409);
      const { member, token } = await newMember(g.id, str(body.name, 40, "Naam"));
      return { member: { id: member.id, name: member.name, token, isOrganizer: false } };
    }

    case "renewMemberLink": {
      // A lost or leaked personal link: give that person a new one; the old link stops working.
      const g = await groupByAdmin(body.adminToken);
      const token = randomToken();
      const rows = await must(db.from("lt_members").update({ token_hash: await hash(token), first_opened_at: null, link_sent_at: null })
        .eq("id", String(body.memberId)).eq("group_id", g.id).select("id,name"));
      const m = (rows as { id: string; name: string }[])[0];
      if (!m) throw bad("not_found", "Deelnemer niet gevonden.", 404);
      return { member: { id: m.id, name: m.name, token, isOrganizer: false } };
    }

    case "removeMember": {
      const g = await groupByAdmin(body.adminToken);
      await must(db.from("lt_members").delete().eq("id", String(body.memberId)).eq("group_id", g.id));
      if (g.drawn_at) {
        // Someone dropped out after the draw: the only fair fix is a fresh draw.
        await must(db.from("lt_assignments").delete().eq("group_id", g.id));
        await must(db.from("lt_groups").update({ drawn_at: null }).eq("id", g.id));
      }
      return adminView(await groupByAdmin(body.adminToken));
    }

    case "markLinkSent": {
      const g = await groupByAdmin(body.adminToken);
      await must(db.from("lt_members").update({ link_sent_at: new Date().toISOString() }).eq("id", String(body.memberId)).eq("group_id", g.id));
      return { ok: true };
    }

    case "setExclusions": {
      const g = await groupByAdmin(body.adminToken);
      const ids = new Set((await members(g.id)).map((m) => m.id));
      const pairs = Array.isArray(body.exclusions) ? body.exclusions : [];
      const rows = new Map<string, { group_id: string; a: string; b: string }>();
      for (const p of pairs) {
        if (!Array.isArray(p) || p.length !== 2) continue;
        let [a, b] = p.map(String);
        if (a === b || !ids.has(a) || !ids.has(b)) continue;
        if (a > b) [a, b] = [b, a];
        rows.set(`${a}|${b}`, { group_id: g.id, a, b });
      }
      await must(db.from("lt_exclusions").delete().eq("group_id", g.id));
      if (rows.size) await must(db.from("lt_exclusions").insert([...rows.values()]));
      return adminView(g);
    }

    case "draw": {
      const g = await groupByAdmin(body.adminToken);
      if (g.drawn_at && body.redraw !== true) throw bad("drawn", "Er is al getrokken.", 409);
      await rateLimit(`draw:${g.id}`, 20, 3600);
      const r = await runDraw(g);
      return { ...(await adminView(await groupByAdmin(body.adminToken))), repeatedLastYear: r.repeatedLastYear };
    }

    case "nextYear": {
      // Same group again next year; last year's pairs are avoided automatically.
      const g = await groupByAdmin(body.adminToken);
      const ms = await members(g.id);
      const adminToken = randomToken(32);
      const ng = (await must(db.from("lt_groups").insert({
        join_code: joinCode(), admin_token_hash: await hash(adminToken), name: g.name, occasion: g.occasion,
        budget_cents: g.budget_cents, note: g.note, poems: g.poems, previous_group_id: g.id,
        event_date: optDate(body.eventDate),
      }).select(GROUP_COLS).single())) as Group;
      const created = [];
      const idMap = new Map<string, string>();
      for (const m of ms) {
        const { member, token } = await newMember(ng.id, m.name, { organizer: m.is_organizer });
        if (m.wishlist.trim()) {
          // Carry last year's wishlist over as a starting point (a common complaint elsewhere).
          await must(db.from("lt_members").update({ wishlist: m.wishlist, wishlist_updated_at: m.wishlist_updated_at }).eq("id", member.id));
        }
        const oldItems = await wishItems(ctx, m.id);
        if (oldItems.length) {
          await must(db.from("lt_wish_items").insert(oldItems.map((w) => ({
            group_id: ng.id, member_id: member.id, title: w.title, url: w.url, image_url: w.imageUrl,
            price_cents: w.priceCents, note: w.note, position: w.position,
          }))));
        }
        idMap.set(m.id, member.id);
        created.push({ id: member.id, name: member.name, token, isOrganizer: m.is_organizer });
      }
      const ex = await exclusions(g.id);
      const rows = ex.map(([a, b]) => [idMap.get(a)!, idMap.get(b)!].sort()).map(([a, b]) => ({ group_id: ng.id, a, b }));
      if (rows.length) await must(db.from("lt_exclusions").insert(rows));
      return { adminToken, group: publicGroup(ng), members: created };
    }

    case "deleteGroup": {
      const g = await groupByAdmin(body.adminToken);
      await must(db.from("lt_groups").update({ previous_group_id: null }).eq("previous_group_id", g.id));
      await must(db.from("lt_groups").delete().eq("id", g.id));
      return { ok: true };
    }

    case "groupByCode": {
      await rateLimit(`code:${ip}`, 120, 600);
      const code = String(body.joinCode ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const g = (await must(db.from("lt_groups").select(GROUP_COLS).eq("join_code", code).maybeSingle())) as Group | null;
      if (!g) throw bad("not_found", "Deze groep bestaat niet (meer).", 404);
      const ms = await members(g.id);
      return { group: publicGroup(g), memberNames: ms.map((m) => m.name) };
    }

    case "join": {
      await rateLimit(`join:${ip}`, 30, 600);
      const code = String(body.joinCode ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const g = (await must(db.from("lt_groups").select(GROUP_COLS).eq("join_code", code).maybeSingle())) as Group | null;
      if (!g) throw bad("not_found", "Deze groep bestaat niet (meer).", 404);
      if (g.drawn_at) throw bad("closed", "Aanmelden is gesloten: er is al getrokken.", 409);
      if (!g.join_open) throw bad("closed", "De organisator heeft het aanmelden gesloten.", 409);
      if ((await members(g.id)).length >= 60) throw bad("full", "Deze groep is vol.", 409);
      const { member, token } = await newMember(g.id, str(body.name, 40, "Je naam"), { self: true });
      return { token, member: { id: member.id, name: member.name } };
    }

    case "me": {
      const { me, group } = await memberByToken(body.token);
      if (me.wishlist.trim()) { await migrateText(ctx, me); me.wishlist = ""; }
      const now = new Date().toISOString();
      await db.from("lt_members").update({ last_seen_at: now, ...(me.first_opened_at ? {} : { first_opened_at: now }) }).eq("id", me.id);
      const ms = await members(group.id);
      let receiver: { id: string; name: string; wishlist: string; wishlistUpdatedAt: string | null; items: unknown[] } | null = null;
      let shop: unknown[] = [];
      let giftReady = false;
      let messages: { id: string; thread: "myLootje" | "mySint"; fromMe: boolean; body: string; createdAt: string }[] = [];
      let blocked = { mySint: false, myLootje: false };
      if (group.drawn_at) {
        const mine = (await must(db.from("lt_assignments").select("receiver_id,gift_ready").eq("group_id", group.id).eq("giver_id", me.id).maybeSingle())) as { receiver_id: string; gift_ready: boolean } | null;
        if (mine) {
          const r = ms.find((m) => m.id === mine.receiver_id);
          if (r) {
            if (r.wishlist.trim()) { await migrateText(ctx, r); r.wishlist = ""; }
            receiver = { id: r.id, name: r.name, wishlist: r.wishlist, wishlistUpdatedAt: r.wishlist_updated_at, items: await wishItems(ctx, r.id) };
          }
          giftReady = mine.gift_ready;
          shop = await shopItems(ctx, me.id);
        }
        const sint = (await must(db.from("lt_assignments").select("giver_id,block_to_receiver").eq("group_id", group.id).eq("receiver_id", me.id).maybeSingle())) as { giver_id: string; block_to_receiver: boolean } | null;
        const myRow = (await must(db.from("lt_assignments").select("block_to_giver").eq("group_id", group.id).eq("giver_id", me.id).maybeSingle())) as { block_to_giver: boolean } | null;
        blocked = { mySint: !!sint?.block_to_receiver, myLootje: !!myRow?.block_to_giver };
        const threads = [me.id, sint?.giver_id].filter(Boolean) as string[];
        const rows = (await must(db.from("lt_messages").select("id,giver_id,direction,body,created_at").eq("group_id", group.id).in("giver_id", threads).order("created_at"))) as { id: string; giver_id: string; direction: string; body: string; created_at: string }[];
        messages = rows.map((m) => {
          const thread = m.giver_id === me.id ? "myLootje" : "mySint";
          const fromMe = thread === "myLootje" ? m.direction === "to_receiver" : m.direction === "to_giver";
          return { id: m.id, thread, fromMe, body: m.body, createdAt: m.created_at };
        });
      }
      return {
        group: publicGroup(group),
        me: { id: me.id, name: me.name, wishlist: me.wishlist, isOrganizer: me.is_organizer, openedBefore: me.first_opened_at },
        memberNames: ms.map((m) => m.name),
        receiver, giftReady, messages, blocked,
        myItems: await wishItems(ctx, me.id), shopItems: shop,
      };
    }

    case "setWishlist": {
      const { me } = await memberByToken(body.token);
      const text = typeof body.wishlist === "string" ? body.wishlist.slice(0, 2000) : "";
      await must(db.from("lt_members").update({ wishlist: text, wishlist_updated_at: new Date().toISOString() }).eq("id", me.id));
      return { ok: true };
    }

    case "setGiftReady": {
      const { me, group } = await memberByToken(body.token);
      await must(db.from("lt_assignments").update({ gift_ready: body.ready === true }).eq("group_id", group.id).eq("giver_id", me.id));
      return { ok: true };
    }

    case "sendMessage": {
      const { me, group } = await memberByToken(body.token);
      if (!group.drawn_at) throw bad("not_drawn", "Er is nog niet getrokken.", 409);
      await rateLimit(`msg:${me.id}`, 40, 3600);
      const text = str(body.body, 500, "Bericht");
      const t = await threadFor(me.id, group.id, body.thread);
      // Blocked: the sender gets no hint (so blocking can't be detected and worked around).
      const blocked = t.direction === "to_receiver" ? t.row.block_to_receiver : t.row.block_to_giver;
      if (!blocked) await must(db.from("lt_messages").insert({ group_id: group.id, giver_id: t.giverId, direction: t.direction, body: text }));
      return { ok: true };
    }

    case "reportMessage": {
      // Report an anonymous message you received; it is kept for review by Zichtwerf Studio.
      const { me, group } = await memberByToken(body.token);
      await rateLimit(`report:${me.id}`, 20, 86400);
      const msg = (await must(db.from("lt_messages").select("id,giver_id,direction,body").eq("id", String(body.messageId)).eq("group_id", group.id).maybeSingle())) as { id: string; giver_id: string; direction: string; body: string } | null;
      if (!msg) throw bad("not_found", "Bericht niet gevonden.", 404);
      // Only messages sent TO you can be reported: from the person you drew, or from your Sint.
      let toMe = msg.giver_id === me.id && msg.direction === "to_giver";
      if (!toMe && msg.direction === "to_receiver") {
        const sint = await must(db.from("lt_assignments").select("giver_id").eq("group_id", group.id).eq("receiver_id", me.id).eq("giver_id", msg.giver_id).maybeSingle());
        toMe = sint !== null;
      }
      if (!toMe) throw bad("not_found", "Bericht niet gevonden.", 404);
      await must(db.from("lt_reports").insert({ group_id: group.id, message_id: msg.id, body: msg.body, reason: optText(body.reason, 300) }));
      return { ok: true };
    }

    case "setBlocked": {
      // Stop receiving messages in one thread (from your Sint, or from the person you drew).
      const { me, group } = await memberByToken(body.token);
      if (!group.drawn_at) throw bad("not_drawn", "Er is nog niet getrokken.", 409);
      const t = await threadFor(me.id, group.id, body.thread);
      // In "mySint" I am the receiver: block what the giver sends to me (to_receiver). In "myLootje" block to_giver.
      const col = body.thread === "myLootje" ? "block_to_giver" : "block_to_receiver";
      await must(db.from("lt_assignments").update({ [col]: body.blocked === true }).eq("group_id", group.id).eq("giver_id", t.giverId));
      return { ok: true, blocked: body.blocked === true };
    }

    case "leave": {
      // A participant removes themselves (only before the draw).
      const { me, group } = await memberByToken(body.token);
      if (group.drawn_at) throw bad("drawn", "Er is al getrokken. Vraag de organisator om je eruit te halen.", 409);
      await must(db.from("lt_members").delete().eq("id", me.id));
      return { ok: true };
    }

    case "searchProducts": {
      await rateLimit(`search:${ip}`, 120, 600);
      const q = str(body.query, 80, "Zoekterm", 2);
      const token = await bolAccessToken();
      if (!token) throw bad("search_unavailable", "Zoeken in de app is nog niet ingesteld.", 503);
      const url = new URL("https://api.bol.com/marketing/catalog/v1/products/search");
      url.searchParams.set("search-term", q);
      url.searchParams.set("country-code", body.country === "BE" ? "BE" : "NL");
      url.searchParams.set("page-size", "20");
      url.searchParams.set("include-image", "true");
      url.searchParams.set("include-offer", "true");
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "Accept-Language": "nl", Accept: "application/json" } });
      if (!r.ok) { console.error("bol search", r.status, await r.text()); throw bad("search_failed", "Zoeken lukt nu even niet. Probeer het zo opnieuw.", 502); }
      const j = await r.json();
      const results = (j.results ?? []).filter((p: { url?: string; title?: string }) => p.url && p.title).map((p: {
        ean?: string; title: string; url: string; image?: { url?: string }; offer?: { price?: number };
      }) => ({
        ean: p.ean ?? null, title: p.title, url: partnerLink(p.url),
        imageUrl: p.image?.url ?? null, price: typeof p.offer?.price === "number" ? Math.round(p.offer.price * 100) : null,
      }));
      return { results, partnerLinks: !!Deno.env.get("BOL_SITE_ID"), shop: "bol.com" };
    }

    case "searchStatus":
      return { available: !!(Deno.env.get("BOL_CLIENT_ID") && Deno.env.get("BOL_CLIENT_SECRET")), partnerLinks: !!Deno.env.get("BOL_SITE_ID") };

    case "linkPreview": {
      await rateLimit(`preview:${ip}`, 200, 600);
      const u = isPublicHttpUrl(String(body.url ?? ""));
      if (!u) throw bad("invalid", "Ongeldige link.");
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 5000);
        const r = await fetch(u, { signal: ctl.signal, redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; LootjesPreview/1.0)", Accept: "text/html" } });
        clearTimeout(timer);
        if (!isPublicHttpUrl(r.url)) return { title: null, imageUrl: null, site: u.hostname };
        const reader = r.body?.getReader();
        let html = "";
        if (reader) {
          const dec = new TextDecoder();
          while (html.length < 200_000) { const { done, value } = await reader.read(); if (done) break; html += dec.decode(value, { stream: true }); }
          reader.cancel().catch(() => {});
        }
        const title = metaContent(html, ["og:title", "twitter:title"]) ?? html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() ?? null;
        let image = metaContent(html, ["og:image", "twitter:image"]);
        let price: number | null = null;
        const metaPrice = metaContent(html, ["product:price:amount", "og:price:amount"]);
        if (metaPrice && !isNaN(Number(metaPrice.replace(",", ".")))) price = Math.round(Number(metaPrice.replace(",", ".")) * 100);
        if (price === null) {
          for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
            try {
              const walk = (o: unknown): number | null => {
                if (!o || typeof o !== "object") return null;
                const r = o as Record<string, unknown>;
                const offers = r.offers as Record<string, unknown> | Record<string, unknown>[] | undefined;
                const off = Array.isArray(offers) ? offers[0] : offers;
                const p = off && (off.price ?? off.lowPrice);
                if (p !== undefined && !isNaN(Number(p))) return Math.round(Number(p) * 100);
                for (const v of Object.values(r)) { const x = Array.isArray(v) ? v.map(walk).find((y) => y !== null) ?? null : walk(v); if (x !== null) return x; }
                return null;
              };
              price = walk(JSON.parse(m[1]));
              if (price !== null) break;
            } catch { /* ignore broken JSON-LD */ }
          }
        }
        if (image) { try { image = new URL(image, r.url).toString(); } catch { image = null; } }
        if (image && !image.startsWith("https://")) image = null;
        return { title: title?.slice(0, 160) ?? null, imageUrl: image, priceCents: price, site: new URL(r.url).hostname.replace(/^www\./, "") };
      } catch {
        return { title: null, imageUrl: null, site: u.hostname.replace(/^www\./, "") };
      }
    }

    case "diag": {
      // Anonymous crash/hang report from Apple MetricKit. No member or group data is accepted.
      await rateLimit(`diag:${ip}`, 30, 86400);
      const kind = ["crash", "hang", "cpu", "disk", "launch"].includes(String(body.kind)) ? String(body.kind) : "other";
      const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
      if (JSON.stringify(payload).length > 60000) throw bad("invalid", "Te groot.");
      await must(db.from("lt_diag").insert({
        app_version: String(body.appVersion ?? "?").slice(0, 40),
        os_version: String(body.osVersion ?? "?").slice(0, 80),
        kind, summary: typeof body.summary === "string" ? body.summary.slice(0, 500) : null, payload,
      }));
      if (Math.random() < 0.05) {
        await db.from("lt_diag").delete().lt("created_at", new Date(Date.now() - 90 * 86400_000).toISOString());
      }
      return { ok: true };
    }

    default:
      throw bad("unknown_action", "Onbekende actie.");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: { code: "method", message: "POST only" } }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    return json(await handle(body as Record<string, unknown>, ip));
  } catch (e) {
    if (e instanceof ApiError) return json({ error: { code: e.code, message: e.message } }, e.status);
    console.error(e);
    return json({ error: { code: "server", message: "Er ging iets mis. Probeer het opnieuw." } }, 500);
  }
});
