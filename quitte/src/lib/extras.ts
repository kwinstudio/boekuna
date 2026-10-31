// Extra functies: foto's, wisselkoersen, PDF, maandoverzicht-melding, Apple-backup en verplaatsen.
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Platform, Share } from 'react-native';
import { computeBreakdown, type Transfer } from './balances';
import { categoryById } from './categories';
import { money, nameOf } from './domain';
import { dayLabel, t } from './i18n';
import { nowIso, todayIso, uuid } from './ids';
import { addJoinedList, enqueue, getState, setProfile } from './store';
import { supabase } from './supabase';
import { fetchState, syncList } from './sync';
import type { Entry, ListState, Part } from './types';

// ---- Foto's -----------------------------------------------------------------

/** Kies of maak een foto, verklein naar max. 1600px JPEG. */
export async function pickPhoto(source: 'camera' | 'library'): Promise<string | null> {
  const perm =
    source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, allowsEditing: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const resize = (a.width ?? 0) > 1600 ? [{ resize: { width: 1600 } }] : [];
  const out = await ImageManipulator.manipulateAsync(a.uri, resize, { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG });
  return out.uri;
}

/** Uploadt een lokale foto naar de privé-opslag van de lijst. Geeft het opslagpad terug. */
export async function uploadPhoto(token: string, entryId: string, uri: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('quitte', { body: { action: 'photo_upload', token, entryId } });
  if (error || !data?.path) throw new Error('upload');
  const body = await (await fetch(uri)).arrayBuffer();
  const up = await supabase.storage.from('quitte-photos').uploadToSignedUrl(data.path, data.uploadToken, body, { contentType: 'image/jpeg' });
  if (up.error) throw up.error;
  return data.path as string;
}

const urlCache = new Map<string, { url: string; exp: number }>();

/** Tijdelijke kijk-links voor foto's (1 uur geldig, gecachet). Lokale paden (file://) gaan direct. */
export function usePhotoUrls(token: string | undefined, paths: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.join('|');
  useEffect(() => {
    if (!token || !paths.length) return;
    let off = false;
    const now = Date.now();
    const known: Record<string, string> = {};
    const missing: string[] = [];
    for (const p of paths) {
      if (p.startsWith('file:') || p.startsWith('ph:')) known[p] = p;
      else {
        const c = urlCache.get(p);
        if (c && c.exp > now) known[p] = c.url;
        else missing.push(p);
      }
    }
    setUrls(known);
    if (!missing.length) return;
    supabase.functions
      .invoke('quitte', { body: { action: 'photo_urls', token, paths: missing } })
      .then(({ data }) => {
        if (off || !data?.urls) return;
        for (const [p, u] of Object.entries(data.urls as Record<string, string>)) urlCache.set(p, { url: u, exp: now + 50 * 60_000 });
        setUrls((s) => ({ ...s, ...data.urls }));
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [token, key]);
  return urls;
}

// ---- Wisselkoers --------------------------------------------------------------

/** Koers van `from` naar `to` (ECB-dagkoers via Frankfurter). */
export async function fetchRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1;
  try {
    const r = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
    if (!r.ok) return null;
    const j = await r.json();
    const v = j?.rates?.[to];
    return typeof v === 'number' && v > 0 ? v : null;
  } catch {
    return null;
  }
}

// ---- Herinneringen --------------------------------------------------------------

export type Tone = 'friendly' | 'short' | 'funny';

export function reminderText(view: ListState, tr: Transfer, tone: Tone) {
  const vars = {
    from: nameOf(view, tr.from),
    to: nameOf(view, tr.to),
    amount: money(tr.amount, view.list.currency),
    list: view.list.name,
  };
  const key = tone === 'short' ? 'remindShort' : tone === 'funny' ? 'remindFunny' : 'remindFriendly';
  let msg = t(key, vars);
  const m = view.members.find((x) => x.id === tr.to);
  if (m?.payLink) msg += `\n${t('payLinkLine', { link: m.payLink })}`;
  if (m?.iban) msg += `\n${t('ibanLine', { iban: m.iban, name: m.name })}`;
  return msg;
}

export function shareReminder(view: ListState, tr: Transfer, tone: Tone) {
  return Share.share({ message: reminderText(view, tr, tone) }).catch(() => {});
}

// ---- PDF ------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export async function sharePdf(view: ListState, transfers: Transfer[]) {
  const cur = view.list.currency;
  const bd = computeBreakdown(view.entries, view.members);
  const rows = view.entries
    .map((e) => {
      const title = e.kind === 'transfer' ? t('repayment') : e.title || t(`cat_${categoryById(e.category).id}` as never);
      const who = e.payers.map((p) => nameOf(view, p.m)).join(', ');
      const over = e.kind === 'transfer' ? nameOf(view, e.shares[0]?.m ?? '') : e.shares.map((p) => `${nameOf(view, p.m)} ${money(p.a, cur)}`).join(', ');
      return `<tr><td>${esc(e.date)}</td><td>${esc(title)}</td><td>${esc(who)}</td><td class="r">${esc(money(e.amount, cur))}</td><td class="s">${esc(over)}</td></tr>`;
    })
    .join('');
  const bal = view.members
    .filter((m) => !m.deleted || (bd[m.id]?.balance ?? 0) !== 0)
    .map((m) => {
      const b = bd[m.id]?.balance ?? 0;
      return `<tr><td>${esc(m.name)}</td><td class="r">${esc(money(bd[m.id]?.paid ?? 0, cur))}</td><td class="r">${esc(money(bd[m.id]?.share ?? 0, cur))}</td><td class="r ${b < 0 ? 'o' : b > 0 ? 'g' : ''}">${esc(money(b, cur))}</td></tr>`;
    })
    .join('');
  const tr = transfers.length
    ? transfers.map((x) => `<li>${esc(nameOf(view, x.from))} → ${esc(nameOf(view, x.to))}: <b>${esc(money(x.amount, cur))}</b></li>`).join('')
    : `<li>${esc(t('everyoneSquare'))}</li>`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1C1C1E;padding:28px;font-size:11px}
    h1{font-size:22px;margin:0 0 2px}h2{font-size:14px;margin:22px 0 8px}.sub{color:#636366;margin-bottom:12px}
    table{width:100%;border-collapse:collapse}td,th{padding:6px 4px;border-bottom:1px solid #E5E5EA;text-align:left;vertical-align:top}
    th{color:#636366;font-weight:600}.r{text-align:right;white-space:nowrap}.s{color:#636366}.o{color:#B42318}.g{color:#1B6E43}
    ul{padding-left:16px}li{margin:4px 0}.f{margin-top:24px;color:#8E8E93;font-size:10px}
  </style></head><body>
    <h1>${esc(view.list.name)}</h1><div class="sub">${esc(t('pdfMade', { date: dayLabel(todayIso()) }))}</div>
    <h2>${esc(t('howSquare'))}</h2><ul>${tr}</ul>
    <h2>${esc(t('tabBalances'))}</h2><table><tr><th>${esc(t('pdfName'))}</th><th class="r">${esc(t('pdfPaid'))}</th><th class="r">${esc(t('pdfShare'))}</th><th class="r">${esc(t('pdfBalance'))}</th></tr>${bal}</table>
    <h2>${esc(t('tabExpenses'))}</h2><table><tr><th>${esc(t('date'))}</th><th>${esc(t('description'))}</th><th>${esc(t('paidBy'))}</th><th class="r">${esc(t('pdfAmount'))}</th><th>${esc(t('splitOver'))}</th></tr>${rows}</table>
    <div class="f">Quitte</div></body></html>`;
  if (Platform.OS === 'web') return Print.printAsync({ html });
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: view.list.name });
}

// ---- Maandoverzicht op de 1e -------------------------------------------------------

export async function setMonthlyDigest(on: boolean): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const N = await import('expo-notifications');
  const all = await N.getAllScheduledNotificationsAsync();
  for (const n of all) if (n.content.data?.kind === 'monthly') await N.cancelScheduledNotificationAsync(n.identifier);
  if (!on) {
    setProfile({ monthlyDigest: false });
    return true;
  }
  const perm = await N.requestPermissionsAsync();
  if (!perm.granted) return false;
  await N.scheduleNotificationAsync({
    content: { title: t('monthlyTitle'), body: t('monthlyBody'), data: { kind: 'monthly' } },
    trigger: { type: N.SchedulableTriggerInputTypes.MONTHLY, day: 1, hour: 9, minute: 30 },
  });
  setProfile({ monthlyDigest: true });
  return true;
}

// ---- Apple-backup -------------------------------------------------------------------

function backupLists() {
  return Object.values(getState().lists)
    .filter((l) => !l.needsCreate)
    .map((l) => ({ token: l.token, me: l.me, name: l.base.list.name }));
}

async function appleToken(): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  const A = await import('expo-apple-authentication');
  if (!(await A.isAvailableAsync())) return null;
  const cred = await A.signInAsync({ requestedScopes: [] });
  return cred.identityToken ?? null;
}

/** Zet backup aan via Inloggen met Apple. */
export async function enableBackup(): Promise<boolean> {
  const identityToken = await appleToken();
  if (!identityToken) return false;
  const { data, error } = await supabase.functions.invoke('quitte', { body: { action: 'backup_save', identityToken, lists: backupLists() } });
  if (error || !data?.ok) return false;
  setProfile({ backupKey: data.key ?? getState().profile.backupKey, backupAt: Date.now() });
  return true;
}

/** Werkt de backup stil bij (na wijzigingen in de lijstenset). */
export async function autoBackup(removed: string[] = []) {
  const key = getState().profile.backupKey;
  if (!key) return;
  const { data } = await supabase.functions.invoke('quitte', { body: { action: 'backup_save', key, lists: backupLists(), removed } });
  if (data?.ok) setProfile({ backupAt: Date.now() });
}

/** Zet lijsten terug op een nieuwe telefoon. Geeft het aantal teruggezette lijsten. */
export async function restoreBackup(): Promise<number | null> {
  const identityToken = await appleToken();
  if (!identityToken) return null;
  const { data, error } = await supabase.functions.invoke('quitte', { body: { action: 'backup_restore', identityToken } });
  if (error || !data) return null;
  setProfile({ backupKey: data.key, backupAt: Date.now() });
  let n = 0;
  for (const l of (data.lists ?? []) as { token: string; me: string | null }[]) {
    try {
      const st = await fetchState(l.token);
      addJoinedList(l.token, st, l.me);
      n++;
    } catch {}
  }
  return n;
}

// ---- Dupliceren en verplaatsen ----------------------------------------------------------

export function duplicateEntry(listId: string, e: Entry, me: string | null) {
  const copy: Entry = {
    ...e,
    id: uuid(),
    date: todayIso(),
    batchId: null,
    photos: [],
    repeat: null,
    repeatNext: null,
    repeatParent: null,
    createdBy: me,
    updatedBy: me,
    createdAt: undefined,
    updatedAt: nowIso(),
  };
  enqueue(listId, { op: 'entry', data: copy, summary: t('actDuplicated', { title: e.title || t('noTitle') }) });
  syncList(listId);
  return copy.id;
}

/**
 * Verplaats naar een andere lijst. Personen worden op naam gekoppeld; wie niet bestaat wordt toegevoegd.
 * Bedrag blijft gelijk (valuta van de doellijst wordt aangenomen).
 */
export function moveEntry(fromId: string, toId: string, e: Entry) {
  const st = getState().lists;
  const from = st[fromId];
  const to = st[toId];
  if (!from || !to) return false;
  const src = from.base.members.concat();
  const dst = to.base.members.filter((m) => !m.deleted);
  const ts = nowIso();
  const newMembers: { id: string; name: string; updatedAt: string }[] = [];
  const map = new Map<string, string>();
  const resolve = (mid: string) => {
    if (map.has(mid)) return map.get(mid)!;
    const name = src.find((m) => m.id === mid)?.name ?? '?';
    const hit = (mid === from.me && to.me) ? dst.find((m) => m.id === to.me) : dst.find((m) => m.name.toLowerCase() === name.toLowerCase());
    const id = hit?.id ?? uuid();
    if (!hit) newMembers.push({ id, name, updatedAt: ts });
    map.set(mid, id);
    return id;
  };
  const remap = (parts: Part[]) => parts.map((p) => ({ m: resolve(p.m), a: p.a }));
  const moved: Entry = {
    ...e,
    id: uuid(),
    payers: remap(e.payers),
    shares: remap(e.shares),
    weights: e.weights ? Object.fromEntries(Object.entries(e.weights).map(([k, v]) => [resolve(k), v])) : null,
    batchId: null,
    photos: [],
    repeat: null,
    repeatNext: null,
    createdAt: undefined,
    updatedAt: ts,
  };
  enqueue(toId, [
    ...newMembers.map((m) => ({ op: 'member' as const, data: m, summary: t('actAddedMember', { name: m.name }) })),
    { op: 'entry' as const, data: moved, summary: t('actMovedIn', { title: e.title || t('noTitle'), list: from.base.list.name }) },
  ]);
  enqueue(fromId, { op: 'entry', data: { ...e, deleted: true, updatedAt: ts }, summary: t('actMovedOut', { title: e.title || t('noTitle'), list: to.base.list.name }) });
  syncList(toId);
  syncList(fromId);
  return true;
}
