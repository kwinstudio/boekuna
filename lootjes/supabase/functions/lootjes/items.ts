// Wishlist items and the giver's private shopping list.
// The receiver only ever sees their own wishlist; nobody but the giver sees the shopping list.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type WishItem = {
  id: string; title: string; url: string | null; imageUrl: string | null;
  priceCents: number | null; note: string | null; position: number;
};
export type ShopItem = {
  id: string; title: string; priceCents: number | null; bought: boolean; wishItemId: string | null; position: number;
};

type Ctx = {
  db: SupabaseClient;
  must: <T>(p: PromiseLike<{ data: T; error: unknown }>) => Promise<T>;
  bad: (code: string, msg: string, status?: number) => Error;
};

const WISH_COLS = "id,title,url,image_url,price_cents,note,position";
const SHOP_COLS = "id,title,price_cents,bought,wish_item_id,position";

type WishRow = { id: string; title: string; url: string | null; image_url: string | null; price_cents: number | null; note: string | null; position: number };
type ShopRow = { id: string; title: string; price_cents: number | null; bought: boolean; wish_item_id: string | null; position: number };

export const wishOut = (r: WishRow): WishItem => ({
  id: r.id, title: r.title, url: r.url, imageUrl: r.image_url, priceCents: r.price_cents, note: r.note, position: r.position,
});
export const shopOut = (r: ShopRow): ShopItem => ({
  id: r.id, title: r.title, priceCents: r.price_cents, bought: r.bought, wishItemId: r.wish_item_id, position: r.position,
});

function cleanTitle(v: unknown, bad: Ctx["bad"]): string {
  const s = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (!s || s.length > 160) throw bad("invalid", "Geef de wens een naam (max. 160 tekens).");
  return s;
}
function cleanUrl(v: unknown, httpsOnly = false): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  try {
    const u = new URL(v.trim());
    if (u.protocol !== "https:" && (httpsOnly || u.protocol !== "http:")) return null;
    const s = u.toString();
    return s.length <= 1000 ? s : null;
  } catch { return null; }
}
function cleanPrice(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? n : null;
}
function cleanNote(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, 300) : null;
}

/// Turns an old free-text wishlist into items: "- title (€ 12,50)" lines, a link on its own line belongs to the line above.
export function parseWishText(text: string): Array<{ title: string; url: string | null; priceCents: number | null }> {
  const out: Array<{ title: string; url: string | null; priceCents: number | null }> = [];
  const urlRe = /(https?:\/\/[^\s<>"]+)/i;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const url = line.match(urlRe)?.[1] ?? null;
    let title = line.replace(urlRe, "").replace(/^[-*•]\s*/, "").trim();
    let priceCents: number | null = null;
    const pm = title.match(/\(?\s*€\s*(\d+)(?:[.,](\d{1,2}))?\s*\)?/);
    if (pm) {
      priceCents = Number(pm[1]) * 100 + (pm[2] ? Number(pm[2].padEnd(2, "0")) : 0);
      title = title.replace(pm[0], "").trim();
    }
    if (!title && url && out.length && !out[out.length - 1].url) { out[out.length - 1].url = url; continue; }
    if (!title && url) { try { title = new URL(url).hostname.replace(/^www\./, ""); } catch { title = url; } }
    if (title) out.push({ title: title.slice(0, 160), url, priceCents });
  }
  return out.slice(0, 50);
}

export async function wishItems(ctx: Ctx, memberId: string): Promise<WishItem[]> {
  const rows = (await ctx.must(ctx.db.from("lt_wish_items").select(WISH_COLS).eq("member_id", memberId).order("position").order("created_at"))) as WishRow[];
  return rows.map(wishOut);
}

export async function shopItems(ctx: Ctx, giverId: string): Promise<ShopItem[]> {
  const rows = (await ctx.must(ctx.db.from("lt_shop_items").select(SHOP_COLS).eq("giver_id", giverId).order("position").order("created_at"))) as ShopRow[];
  return rows.map(shopOut);
}

/// One-time move of a free-text wishlist into items.
export async function migrateText(ctx: Ctx, me: { id: string; group_id: string; wishlist: string }): Promise<void> {
  if (!me.wishlist.trim()) return;
  const existing = await ctx.must(ctx.db.from("lt_wish_items").select("id").eq("member_id", me.id).limit(1));
  if ((existing as unknown[]).length === 0) {
    const parsed = parseWishText(me.wishlist);
    if (parsed.length) {
      await ctx.must(ctx.db.from("lt_wish_items").insert(parsed.map((p, i) => ({
        group_id: me.group_id, member_id: me.id, title: p.title, url: p.url, price_cents: p.priceCents, position: i,
      }))));
    }
  }
  await ctx.must(ctx.db.from("lt_members").update({ wishlist: "" }).eq("id", me.id));
}

async function touchWishlist(ctx: Ctx, memberId: string) {
  await ctx.must(ctx.db.from("lt_members").update({ wishlist_updated_at: new Date().toISOString() }).eq("id", memberId));
}

/// Shopping list complete (and not empty) => the gift counts as ready for the organizer.
async function syncGiftReady(ctx: Ctx, groupId: string, giverId: string) {
  const items = await shopItems(ctx, giverId);
  if (!items.length) return;
  const ready = items.every((i) => i.bought);
  await ctx.must(ctx.db.from("lt_assignments").update({ gift_ready: ready }).eq("group_id", groupId).eq("giver_id", giverId));
}

export async function itemsAction(
  ctx: Ctx, action: string, body: Record<string, unknown>,
  me: { id: string; group_id: string }, group: { id: string; drawn_at: string | null },
): Promise<unknown> {
  const { db, must, bad } = ctx;
  switch (action) {
    case "wishAdd": {
      const count = ((await must(db.from("lt_wish_items").select("id").eq("member_id", me.id))) as unknown[]).length;
      if (count >= 50) throw bad("full", "Maximaal 50 wensen.", 409);
      const row = await must(db.from("lt_wish_items").insert({
        group_id: me.group_id, member_id: me.id, title: cleanTitle(body.title, bad),
        url: cleanUrl(body.url), image_url: cleanUrl(body.imageUrl, true), price_cents: cleanPrice(body.priceCents),
        note: cleanNote(body.note), position: count,
      }).select(WISH_COLS).single());
      await touchWishlist(ctx, me.id);
      return { item: wishOut(row as WishRow) };
    }
    case "wishUpdate": {
      const patch: Record<string, unknown> = {};
      if ("title" in body) patch.title = cleanTitle(body.title, bad);
      if ("url" in body) patch.url = cleanUrl(body.url);
      if ("imageUrl" in body) patch.image_url = cleanUrl(body.imageUrl, true);
      if ("priceCents" in body) patch.price_cents = cleanPrice(body.priceCents);
      if ("note" in body) patch.note = cleanNote(body.note);
      const rows = await must(db.from("lt_wish_items").update(patch).eq("id", String(body.id)).eq("member_id", me.id).select(WISH_COLS));
      const r = (rows as WishRow[])[0];
      if (!r) throw bad("not_found", "Wens niet gevonden.", 404);
      await touchWishlist(ctx, me.id);
      return { item: wishOut(r) };
    }
    case "wishDelete": {
      await must(db.from("lt_wish_items").delete().eq("id", String(body.id)).eq("member_id", me.id));
      await touchWishlist(ctx, me.id);
      return { ok: true };
    }
    case "wishReorder": {
      const ids = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 50) : [];
      for (let i = 0; i < ids.length; i++) {
        await must(db.from("lt_wish_items").update({ position: i }).eq("id", ids[i]).eq("member_id", me.id));
      }
      return { ok: true };
    }
    case "shopAdd": {
      if (!group.drawn_at) throw bad("not_drawn", "Er is nog niet getrokken.", 409);
      const count = ((await must(db.from("lt_shop_items").select("id").eq("giver_id", me.id))) as unknown[]).length;
      if (count >= 50) throw bad("full", "Maximaal 50 boodschappen.", 409);
      let wishItemId: string | null = null;
      if (body.wishItemId) {
        // Only wishes of the person you drew can be linked.
        const a = (await must(db.from("lt_assignments").select("receiver_id").eq("group_id", group.id).eq("giver_id", me.id).maybeSingle())) as { receiver_id: string } | null;
        const w = a ? (await must(db.from("lt_wish_items").select("id").eq("id", String(body.wishItemId)).eq("member_id", a.receiver_id).maybeSingle())) : null;
        if (w) wishItemId = String(body.wishItemId);
      }
      const row = await must(db.from("lt_shop_items").insert({
        group_id: group.id, giver_id: me.id, wish_item_id: wishItemId, title: cleanTitle(body.title, bad),
        price_cents: cleanPrice(body.priceCents), position: count,
      }).select(SHOP_COLS).single());
      await syncGiftReady(ctx, group.id, me.id);
      return { item: shopOut(row as ShopRow) };
    }
    case "shopUpdate": {
      const patch: Record<string, unknown> = {};
      if ("title" in body) patch.title = cleanTitle(body.title, bad);
      if ("priceCents" in body) patch.price_cents = cleanPrice(body.priceCents);
      if ("bought" in body) patch.bought = body.bought === true;
      const rows = await must(db.from("lt_shop_items").update(patch).eq("id", String(body.id)).eq("giver_id", me.id).select(SHOP_COLS));
      const r = (rows as ShopRow[])[0];
      if (!r) throw bad("not_found", "Niet gevonden.", 404);
      await syncGiftReady(ctx, group.id, me.id);
      return { item: shopOut(r) };
    }
    case "shopDelete": {
      await must(db.from("lt_shop_items").delete().eq("id", String(body.id)).eq("giver_id", me.id));
      await syncGiftReady(ctx, group.id, me.id);
      return { ok: true };
    }
  }
  throw bad("unknown_action", "Onbekende actie.");
}

export const ITEM_ACTIONS = new Set(["wishAdd", "wishUpdate", "wishDelete", "wishReorder", "shopAdd", "shopUpdate", "shopDelete"]);
