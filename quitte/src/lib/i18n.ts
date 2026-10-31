import { getLocales } from 'expo-localization';
import { nl, en } from './strings';

const loc = getLocales()[0];
export const lang: 'nl' | 'en' = loc?.languageCode === 'nl' ? 'nl' : 'en';
/** Locale voor bedragen en datums. Nederlands formaat voor NL, anders de systeemtaal. */
export const numberLocale = lang === 'nl' ? 'nl-NL' : (loc?.languageTag ?? 'en-GB');

export type StringKey = keyof typeof nl;
const dict: Record<StringKey, string> = lang === 'nl' ? nl : en;

export function t(key: StringKey, vars?: Record<string, string | number>): string {
  let s = dict[key] ?? nl[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function plural(n: number, one: StringKey, many: StringKey, vars?: Record<string, string | number>) {
  return t(n === 1 ? one : many, { n, ...vars });
}

const dayFmt = new Intl.DateTimeFormat(numberLocale, { weekday: 'long', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat(numberLocale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function isoDay(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "Vandaag", "Gisteren" of "vrijdag 10 okt". */
export function dayLabel(iso: string): string {
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (iso === isoDay(today)) return t('today');
  if (iso === isoDay(y)) return t('yesterday');
  const [yy, mm, dd] = iso.split('-').map(Number);
  const s = dayFmt.format(new Date(yy, mm - 1, dd));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function timeLabel(iso: string): string {
  return timeFmt.format(new Date(iso));
}

export { isoDay };
