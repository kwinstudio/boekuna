/** Bedragen zijn altijd gehele centen. */

const fmtCache = new Map<string, Intl.NumberFormat>();

function formatter(locale: string, currency: string) {
  const key = `${locale}|${currency}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 });
    fmtCache.set(key, f);
  }
  return f;
}

export function formatMoney(cents: number, currency = 'EUR', locale = 'nl-NL'): string {
  return formatter(locale, currency).format(cents / 100).replace(/ /g, ' ');
}

/** "54,5" of "54.50" → 5450. Geeft null bij ongeldige invoer. */
export function parseMoney(input: string): number | null {
  const s = input.trim().replace(/\s/g, '').replace(/^€/, '');
  if (!s) return null;
  // Laatste komma/punt is het decimaalteken als er hooguit 2 cijfers achter staan.
  const m = s.match(/^(\d{1,9}(?:[.,]\d{3})*|\d+)(?:[.,](\d{1,2}))?$/);
  if (!m) return null;
  const whole = m[1].replace(/[.,]/g, '');
  const frac = (m[2] ?? '').padEnd(2, '0');
  const cents = parseInt(whole, 10) * 100 + parseInt(frac || '0', 10);
  return Number.isFinite(cents) ? cents : null;
}

/** Bedrag als invoertekst voor het cijferpad: 5450 → "54,50". */
export function centsToInput(cents: number): string {
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  return frac === 0 ? String(whole) : `${whole},${String(frac).padStart(2, '0')}`;
}

/** Cijferpad-invoer bijwerken: houdt max. 2 decimalen en max. 9 cijfers voor de komma. */
export function keypadInput(current: string, key: string): string {
  if (key === 'back') return current.slice(0, -1);
  if (key === ',') {
    if (current.includes(',')) return current;
    return (current || '0') + ',';
  }
  if (!/^\d$/.test(key)) return current;
  const [whole, frac] = current.split(',');
  if (frac !== undefined) {
    if (frac.length >= 2) return current;
    return current + key;
  }
  if (whole === '0') return key;
  if (whole.length >= 9) return current;
  return current + key;
}

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'DKK', 'SEK', 'NOK', 'PLN', 'CZK', 'CAD', 'AUD', 'THB', 'TRY'];
