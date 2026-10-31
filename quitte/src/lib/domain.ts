import { formatMoney } from './money';
import { numberLocale, t } from './i18n';
import type { Entry, ListState } from './types';

export function money(cents: number, currency = 'EUR') {
  return formatMoney(cents, currency, numberLocale);
}

export function nameOf(view: ListState, id: string, me?: string | null): string {
  if (me && id === me) return t('you');
  return view.members.find((m) => m.id === id)?.name ?? '?';
}

/** "Jij betaalde", "Sanne betaalde", "Sanne en Daan betaalden". */
export function payerLine(e: Entry, view: ListState, me?: string | null): string {
  const names = e.payers.map((p) => nameOf(view, p.m, me));
  if (e.kind === 'transfer') {
    return t('transferLine', { from: names[0], to: nameOf(view, e.shares[0]?.m ?? '', me) });
  }
  if (e.kind === 'income') {
    return t(names.length > 1 ? 'receivedMany' : 'receivedOne', { names: joinNames(names) });
  }
  return t(names.length > 1 ? 'paidMany' : 'paidOne', { names: joinNames(names) });
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} ${t('and')} ${names[names.length - 1]}`;
}

export function myShare(e: Entry, me?: string | null): number {
  if (!me) return 0;
  return e.shares.filter((p) => p.m === me).reduce((s, p) => s + p.a, 0);
}

export function activeMembers(view: ListState) {
  return view.members.filter((m) => !m.deleted);
}
