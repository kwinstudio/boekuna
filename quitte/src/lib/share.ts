import * as Linking from 'expo-linking';
import { Share } from 'react-native';
import type { Transfer } from './balances';
import { money, nameOf, partyName } from './domain';
import { t } from './i18n';
import type { ListState } from './types';

export const WEB_BASE = 'https://quitte-app.vercel.app';

/** Uitnodigingslink: opent de app direct (universele link) of anders de webpagina. */
export function inviteLink(token: string) {
  return `${WEB_BASE}/j/${token}`;
}

export function appLink(token: string) {
  return Linking.createURL(`join/${token}`, { scheme: 'quitte' });
}

export function shareInvite(listName: string, token: string) {
  return Share.share({ message: t('inviteMessage', { name: listName, link: inviteLink(token), code: token }) }).catch(() => {});
}

function ibanLine(view: ListState, memberId: string) {
  const m = view.members.find((x) => x.id === memberId);
  return m?.iban ? t('ibanLine', { iban: m.iban, name: m.name }) : '';
}

/** Betaalverzoek / herinnering voor één betaling. */
export function shareRequest(view: ListState, tr: Transfer) {
  const msg = t('requestMessage', {
    from: partyName(view, tr.from),
    to: partyName(view, tr.to),
    amount: money(tr.amount, view.list.currency),
    list: view.list.name,
  });
  const iban = ibanLine(view, tr.to);
  return Share.share({ message: iban ? `${msg}\n${iban}` : msg }).catch(() => {});
}

export function shareOverview(view: ListState, transfers: Transfer[]) {
  const lines = transfers.map(
    (tr) => `• ${partyName(view, tr.from)} → ${partyName(view, tr.to)}: ${money(tr.amount, view.list.currency)}`,
  );
  const ibans = [...new Set(transfers.map((tr) => tr.to))].map((id) => ibanLine(view, id)).filter(Boolean);
  const body = transfers.length ? lines.join('\n') : t('everyoneSquare');
  const message = `${t('overviewTitle', { list: view.list.name })}\n\n${body}${ibans.length ? `\n\n${ibans.join('\n')}` : ''}`;
  return Share.share({ message }).catch(() => {});
}

/** CSV-export als tekst (puntkomma's, Excel-NL-vriendelijk). */
export function shareCsv(view: ListState) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const names = (parts: { m: string; a: number }[]) => parts.map((p) => `${nameOf(view, p.m)} ${(p.a / 100).toFixed(2)}`).join(' | ');
  const header = ['datum', 'soort', 'omschrijving', 'categorie', 'bedrag', 'betaald door', 'verdeeld over'].join(';');
  const rows = view.entries.map((e) =>
    [e.date, e.kind, esc(e.title), e.category ?? '', (e.amount / 100).toFixed(2).replace('.', ','), esc(names(e.payers)), esc(names(e.shares))].join(';'),
  );
  return Share.share({ message: [header, ...rows].join('\n'), title: `${view.list.name}.csv` }).catch(() => {});
}
