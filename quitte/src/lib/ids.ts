import * as Crypto from 'expo-crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function uuid(): string {
  return Crypto.randomUUID();
}

/** Geheime lijstcode: 26 tekens uit 57 symbolen ≈ 151 bits. Zonder verwarrende tekens (0/O, 1/l/I). */
export function newToken(): string {
  const bytes = Crypto.getRandomBytes(64);
  let out = '';
  for (let i = 0; i < bytes.length && out.length < 26; i++) {
    // Rejection sampling voorkomt een scheve verdeling.
    if (bytes[i] < 228) out += ALPHABET[bytes[i] % 57];
  }
  if (out.length < 26) return newToken();
  return out;
}

/** Haalt een code uit een gedeelde tekst of link (quitte://join/CODE of https://…/join/CODE). */
export function extractToken(text: string): string | null {
  const t = text.trim();
  const m = t.match(/join\/([A-Za-z0-9]{24,64})/) ?? t.match(/^([A-Za-z0-9]{24,64})$/) ?? t.match(/\b([A-Za-z0-9]{26})\b/);
  return m ? m[1] : null;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
