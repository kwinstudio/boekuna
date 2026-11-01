// Herinnering om terug te betalen: als jij al een week iemand geld schuldig bent, één rustige
// lokale melding (10:00). Werkt zonder server of sleutels; verdwijnt vanzelf zodra je quitte staat.
import { Platform } from 'react-native';
import { listTransfers } from './balances';
import { money, partyName } from './domain';
import { t } from './i18n';
import { getState, updateLocal, viewOf } from './store';

const WEEK = 7 * 864e5;
const ID = (listId: string) => `nudge-${listId}`;

function at10(ms: number) {
  const d = new Date(ms);
  if (d.getHours() >= 10) d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d;
}

/** Wat ik in een lijst nog moet betalen (in centen) en aan wie het meest. */
export function myDebt(listId: string): { cents: number; to: string | null } {
  const local = getState().lists[listId];
  const view = viewOf(local);
  if (!local || !view || !local.me) return { cents: 0, to: null };
  const { transfers, rep } = listTransfers(view.entries, view.members, view.list.settings);
  const meParty = rep.get(local.me) ?? local.me;
  const mine = transfers.filter((x) => x.from === meParty).sort((a, b) => b.amount - a.amount);
  return { cents: mine.reduce((s, x) => s + x.amount, 0), to: mine[0] ? partyName(view, mine[0].to, local.me) : null };
}

let running = false;
export async function refreshNudges() {
  if (Platform.OS === 'web' || running) return;
  running = true;
  try {
    const N = await import('expo-notifications');
    const perm = await N.getPermissionsAsync();
    const enabled = perm.granted && getState().profile.payNudge !== false;
    const scheduled = new Set((await N.getAllScheduledNotificationsAsync()).map((n) => n.identifier));
    for (const local of Object.values(getState().lists)) {
      const { cents, to } = local.demo || local.base.list.archived ? { cents: 0, to: null } : myDebt(local.id);
      if (cents <= 0 || !to) {
        if (local.owedSince) updateLocal(local.id, { owedSince: null });
        if (scheduled.has(ID(local.id))) await N.cancelScheduledNotificationAsync(ID(local.id));
        continue;
      }
      const since = local.owedSince ?? Date.now();
      if (!local.owedSince) updateLocal(local.id, { owedSince: since });
      if (!enabled) {
        if (scheduled.has(ID(local.id))) await N.cancelScheduledNotificationAsync(ID(local.id));
        continue;
      }
      const when = at10(Math.max(since + WEEK, Date.now() + 36e5));
      const view = viewOf(local)!;
      await N.scheduleNotificationAsync({
        identifier: ID(local.id),
        content: {
          title: view.list.name,
          body: t('nudgeBody', { name: to, amount: money(cents, view.list.currency) }),
          data: { kind: 'nudge', list: view.list.id },
        },
        trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: when },
      });
    }
  } catch {
    /* meldingen zijn een extraatje */
  } finally {
    running = false;
  }
}
