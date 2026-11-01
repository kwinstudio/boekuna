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

/** Toetsen van het bedragtoetsenbord, inclusief + − × voor optellen in de app zelf. */
export const OPERATORS = ['+', '−', '×'] as const;

export function calcInput(current: string, key: string): string {
  const lastOp = Math.max(...OPERATORS.map((o) => current.lastIndexOf(o)));
  const head = current.slice(0, lastOp + 1);
  const tail = current.slice(lastOp + 1);
  if ((OPERATORS as readonly string[]).includes(key)) {
    if (!current) return current;
    if ((OPERATORS as readonly string[]).includes(current.slice(-1))) return current.slice(0, -1) + key;
    if (current.length > 60) return current;
    return current + key;
  }
  if (key === 'back') return current.slice(0, -1);
  return head + keypadInput(tail, key);
}

/** Rekent "12,50+7×2" uit naar centen (× gaat voor + en −). Geeft null bij een onvolledige som. */
export function evalAmount(expr: string): number | null {
  if (!expr) return null;
  const tokens = expr.split(/([+−×])/).filter((x) => x !== '');
  if (!tokens.length || (OPERATORS as readonly string[]).includes(tokens[tokens.length - 1])) {
    return tokens.length > 1 ? evalAmount(tokens.slice(0, -1).join('')) : null;
  }
  // Eerst vermenigvuldigen (factor is een gewoon getal), dan optellen/aftrekken.
  const terms: { sign: number; cents: number }[] = [];
  let sign = 1;
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk === '+' || tk === '−') {
      sign = tk === '+' ? 1 : -1;
      continue;
    }
    if (tk === '×') continue;
    const v = parseMoney(tk);
    if (v === null) return null;
    if (tokens[i - 1] === '×' && terms.length) {
      const prev = terms[terms.length - 1];
      prev.cents = Math.round((prev.cents * v) / 100);
    } else terms.push({ sign, cents: v });
  }
  const total = terms.reduce((s, x) => s + x.sign * x.cents, 0);
  return total;
}

export function isExpression(expr: string) {
  return /[+−×]/.test(expr.replace(/[+−×]$/, ''));
}
