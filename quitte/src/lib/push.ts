// Pushmeldingen: toestemming vragen, het APNs-token per lijst registreren, dempen per lijst
// en bij een tik op een melding de juiste lijst openen. Het versturen gebeurt op de server
// (edge function quitte-push), gebundeld per lijst en nooit tussen 22:00 en 08:00.
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { lang } from './i18n';
import { getState, setProfile, updateLocal } from './store';
import { supabase } from './supabase';

const tz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Amsterdam';
  } catch {
    return 'Europe/Amsterdam';
  }
};

const syncedLists = () => Object.values(getState().lists).filter((l) => !l.demo && !l.needsCreate);

/** Of we het voorstel om meldingen aan te zetten (nog) mogen laten zien. */
export function shouldOfferPush() {
  const p = getState().profile;
  return Platform.OS === 'ios' && p.pushOn === undefined && !(p.pushAskedAt && Date.now() - p.pushAskedAt < 14 * 864e5);
}

export function snoozePushOffer() {
  setProfile({ pushAskedAt: Date.now() });
}

async function deviceToken(ask: boolean): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  const N = await import('expo-notifications');
  let perm = await N.getPermissionsAsync();
  if (!perm.granted && ask) perm = await N.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } });
  if (!perm.granted) return null;
  const tok = await N.getDevicePushTokenAsync();
  return typeof tok.data === 'string' ? tok.data : null;
}

/** Zet meldingen aan of uit. Geeft false terug als iOS geen toestemming geeft. */
export async function setPush(on: boolean): Promise<boolean> {
  if (!on) {
    setProfile({ pushOn: false });
    await registerAll();
    return true;
  }
  const token = await deviceToken(true).catch(() => null);
  if (!token) {
    setProfile({ pushAskedAt: Date.now() });
    return false;
  }
  setProfile({ pushOn: true, pushToken: token });
  await registerAll();
  return true;
}

export async function setQuietHours(on: boolean) {
  setProfile({ quietHours: on });
  await registerAll();
}

/** Registreert dit toestel bij alle gedeelde lijsten (of meldt het af als meldingen uit staan). */
export async function registerAll(onlyListId?: string) {
  const p = getState().profile;
  if (!p.deviceId || Platform.OS !== 'ios') return;
  let token = p.pushToken ?? null;
  if (p.pushOn) {
    // Het token kan na een herinstallatie of iOS-update veranderen.
    const fresh = await deviceToken(false).catch(() => null);
    if (fresh && fresh !== token) {
      token = fresh;
      setProfile({ pushToken: fresh });
    }
  }
  const lists = syncedLists().filter((l) => !onlyListId || l.id === onlyListId);
  await Promise.all(
    lists.map((l) =>
      supabase
        .rpc('quitte_push_register', {
          p_token: l.token,
          p_device: p.deviceId,
          p_member: l.me,
          p_apns: p.pushOn ? token : null,
          p_lang: lang,
          p_tz: tz(),
          p_quiet: p.quietHours !== false,
          p_push: !!p.pushOn,
        })
        .then(({ error }) => {
          if (!error && l.muted) return supabase.rpc('quitte_mute_list', { p_token: l.token, p_device: p.deviceId, p_muted: true });
        }),
    ),
  ).catch(() => {});
}

export async function setListMuted(listId: string, muted: boolean) {
  const l = getState().lists[listId];
  const device = getState().profile.deviceId;
  if (!l) return;
  updateLocal(listId, { muted });
  if (l.demo || l.needsCreate || !device) return;
  await registerAll(listId);
  await supabase.rpc('quitte_mute_list', { p_token: l.token, p_device: device, p_muted: muted });
}

export async function unregisterList(token: string) {
  const device = getState().profile.deviceId;
  if (!device) return;
  await supabase.rpc('quitte_unregister_device', { p_token: token, p_device: device });
}

/** Meldingen op de voorgrond tonen en een tik doorsturen naar de juiste lijst. */
export async function setupPushHandlers(): Promise<() => void> {
  if (Platform.OS === 'web') return () => {};
  const N = await import('expo-notifications');
  N.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  const openFrom = (data: Record<string, unknown> | undefined) => {
    const body = data?.body as Record<string, unknown> | undefined;
    const raw = data?.list ?? body?.list;
    const serverId = typeof raw === 'string' ? raw : null;
    if (!serverId) return;
    const local = Object.values(getState().lists).find((l) => l.base.list.id === serverId);
    if (local) router.push({ pathname: '/list/[id]', params: { id: local.id } });
  };
  const sub = N.addNotificationResponseReceivedListener((r) => openFrom(r.notification.request.content.data));
  const last = await N.getLastNotificationResponseAsync().catch(() => null);
  if (last) openFrom(last.notification.request.content.data);
  return () => sub.remove();
}
