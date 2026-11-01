// Verstuurt rustige pushmeldingen via Apple Push Notification service (APNs).
// Wordt aangeroepen door een databasetrigger met alleen een lijst-id. De functie claimt zelf de
// nog niet verstuurde activiteit, dus een losse aanroep kan niets verzinnen of dubbel versturen.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   APNS_KEY_P8  – inhoud van het .p8-bestand (APNs Auth Key)
//   APNS_KEY_ID  – Key ID van die sleutel (10 tekens)
//   APNS_TEAM_ID – optioneel, standaard 4PUWX9ZXQL
import { createClient } from 'npm:@supabase/supabase-js@2';

const TOPIC = Deno.env.get('APNS_TOPIC') ?? 'nl.zichtwerf.quitte';
const HOST = Deno.env.get('APNS_HOST') ?? 'https://api.push.apple.com';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let cached: { jwt: string; at: number } | null = null;

async function providerToken(p8: string, keyId: string, teamId: string) {
  // Apple: hetzelfde token maximaal een uur hergebruiken; wij vernieuwen na 50 minuten.
  if (cached && Date.now() - cached.at < 50 * 60 * 1000) return cached.jwt;
  const pem = p8.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const iat = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const head = b64url(enc.encode(JSON.stringify({ alg: 'ES256', kid: keyId })));
  const claims = b64url(enc.encode(JSON.stringify({ iss: teamId, iat })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${claims}`));
  cached = { jwt: `${head}.${claims}.${b64url(sig)}`, at: Date.now() };
  return cached.jwt;
}

/** Stille uren: tussen 22:00 en 08:00 lokale tijd geen meldingen. */
function isQuiet(tz: string) {
  try {
    const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(new Date()));
    return h >= 22 || h < 8;
  } catch {
    return false;
  }
}

type Row = { actor: string; summary: string; device: string | null };

function bodyFor(rows: Row[], lang: string) {
  const actors = [...new Set(rows.map((r) => r.actor).filter(Boolean))];
  if (rows.length === 1) return `${rows[0].actor ? rows[0].actor + ': ' : ''}${rows[0].summary}`;
  const who = actors.length === 1 ? actors[0] : actors.slice(0, 2).join(lang === 'en' ? ' and ' : ' en ');
  const n = rows.length;
  const first = rows[0].summary;
  return lang === 'en' ? `${who}: ${first} and ${n - 1} more` : `${who}: ${first} en nog ${n - 1}`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const p8 = Deno.env.get('APNS_KEY_P8');
  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID') ?? '4PUWX9ZXQL';
  if (!p8 || !keyId) return json({ ok: false, reason: 'not_configured' });

  let list: string | undefined;
  try {
    list = (await req.json())?.list;
  } catch {
    /* leeg */
  }
  if (!list || !/^[0-9a-f-]{36}$/i.test(list)) return json({ error: 'bad_list' }, 400);

  const { data: rows, error } = await db.rpc('quitte__claim_push', { p_list: list });
  if (error) return json({ error: 'claim' }, 500);
  const items = (rows ?? []) as Row[];
  if (!items.length) return json({ ok: true, sent: 0 });

  const [{ data: meta }, { data: devices }] = await Promise.all([
    db.from('quitte_lists').select('name, archived').eq('id', list).maybeSingle(),
    db
      .from('quitte_devices')
      .select('device_id, apns_token, lang, tz, quiet, muted, push_on')
      .eq('list_id', list)
      .not('apns_token', 'is', null),
  ]);
  if (!meta || meta.archived) return json({ ok: true, sent: 0 });

  const senders = new Set(items.map((r) => r.device).filter(Boolean));
  const targets = (devices ?? []).filter(
    (d) => d.push_on && !d.muted && !senders.has(d.device_id) && !(d.quiet && isQuiet(d.tz)),
  );
  if (!targets.length) return json({ ok: true, sent: 0 });

  const jwt = await providerToken(p8, keyId, teamId);
  // Eén token kan bij meerdere lijsten horen; per token één melding.
  const seen = new Set<string>();
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    targets.map(async (d) => {
      if (seen.has(d.apns_token)) return;
      seen.add(d.apns_token);
      const payload = {
        aps: {
          alert: { title: meta.name, body: bodyFor(items, d.lang) },
          sound: 'default',
          'thread-id': list,
          'mutable-content': 0,
        },
        list,
        body: { list },
      };
      try {
        const r = await fetch(`${HOST}/3/device/${d.apns_token}`, {
          method: 'POST',
          headers: {
            authorization: `bearer ${jwt}`,
            'apns-topic': TOPIC,
            'apns-push-type': 'alert',
            'apns-priority': '10',
            'apns-collapse-id': `l-${list}`.slice(0, 64),
            'content-type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (r.ok) sent++;
        else {
          const reason = (await r.json().catch(() => ({})))?.reason ?? String(r.status);
          if (r.status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered') dead.push(d.apns_token);
          if (r.status === 403) cached = null;
          console.log('apns', r.status, reason);
        }
      } catch (e) {
        console.log('apns fetch', String(e));
      }
    }),
  );
  if (dead.length) await db.from('quitte_devices').update({ apns_token: null }).in('apns_token', dead);
  return json({ ok: true, sent });
});
