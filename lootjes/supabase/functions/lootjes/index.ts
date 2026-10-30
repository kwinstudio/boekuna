// Lootjes API. One endpoint, JSON {action, ...}. No accounts: the organizer holds an
// admin token, every participant holds a personal token. Only hashes are stored.
// The draw happens here on the server, so nobody — also not the organizer — sees who drew whom.
import { createClient } from "npm:@supabase/supabase-js@2";
import { draw } from "./draw.ts";

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
  return {
    group: publicGroup(g),
    members: ms.map((m) => ({
      id: m.id, name: m.name, isOrganizer: m.is_organizer, joinedSelf: m.joined_self,
      hasWishlist: m.wishlist.trim().length > 0, linkSentAt: m.link_sent_at,
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
  await must(db.from("lt_assignments").insert(
    [...result.ok.pairs].map(([giver, receiver]) => ({ group_id: g.id, giver_id: giver, receiver_id: receiver })),
  ));
  await must(db.from("lt_groups").update({ drawn_at: new Date().toISOString(), join_open: false, updated_at: new Date().toISOString() }).eq("id", g.id));
  return { repeatedLastYear: result.ok.repeatedLastYear };
}

async function handle(body: Record<string, unknown>, ip: string) {
  const action = String(body.action ?? "");
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
      if (g.drawn_at || !g.join_open) throw bad("closed", "Aanmelden is gesloten: er is al getrokken.", 409);
      if ((await members(g.id)).length >= 60) throw bad("full", "Deze groep is vol.", 409);
      const { member, token } = await newMember(g.id, str(body.name, 40, "Je naam"), { self: true });
      return { token, member: { id: member.id, name: member.name } };
    }

    case "me": {
      const { me, group } = await memberByToken(body.token);
      const now = new Date().toISOString();
      await db.from("lt_members").update({ last_seen_at: now, ...(me.first_opened_at ? {} : { first_opened_at: now }) }).eq("id", me.id);
      const ms = await members(group.id);
      let receiver: { id: string; name: string; wishlist: string; wishlistUpdatedAt: string | null } | null = null;
      let giftReady = false;
      let messages: { id: string; thread: "myLootje" | "mySint"; fromMe: boolean; body: string; createdAt: string }[] = [];
      if (group.drawn_at) {
        const mine = (await must(db.from("lt_assignments").select("receiver_id,gift_ready").eq("group_id", group.id).eq("giver_id", me.id).maybeSingle())) as { receiver_id: string; gift_ready: boolean } | null;
        if (mine) {
          const r = ms.find((m) => m.id === mine.receiver_id);
          if (r) receiver = { id: r.id, name: r.name, wishlist: r.wishlist, wishlistUpdatedAt: r.wishlist_updated_at };
          giftReady = mine.gift_ready;
        }
        const sint = (await must(db.from("lt_assignments").select("giver_id").eq("group_id", group.id).eq("receiver_id", me.id).maybeSingle())) as { giver_id: string } | null;
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
        receiver, giftReady, messages,
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
      let giverId: string;
      let direction: string;
      if (body.thread === "myLootje") {
        giverId = me.id; direction = "to_receiver";
      } else {
        const sint = (await must(db.from("lt_assignments").select("giver_id").eq("group_id", group.id).eq("receiver_id", me.id).maybeSingle())) as { giver_id: string } | null;
        if (!sint) throw bad("not_found", "Geen Sint gevonden.", 404);
        giverId = sint.giver_id; direction = "to_giver";
      }
      await must(db.from("lt_messages").insert({ group_id: group.id, giver_id: giverId, direction, body: text }));
      return { ok: true };
    }

    case "leave": {
      // A participant removes themselves (only before the draw).
      const { me, group } = await memberByToken(body.token);
      if (group.drawn_at) throw bad("drawn", "Er is al getrokken. Vraag de organisator om je eruit te halen.", 409);
      await must(db.from("lt_members").delete().eq("id", me.id));
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
