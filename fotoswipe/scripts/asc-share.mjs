#!/usr/bin/env node
// Sets up a public TestFlight link for friends: tester info, review contact, external group, build, beta review.
// Reads the API key from the environment only; prints no secret material.
// Results are emitted as GitHub annotations so they are visible without reading raw logs.
import crypto from 'node:crypto';

const APP_ID = '6827907455';
const TARGET = (process.env.TARGET_BUILD || '').trim();
const WAIT_MIN = Number(process.env.WAIT_MINUTES || 30);
const keyId = (process.env.ASC_KEY_ID || '').trim();
const issuerId = (process.env.ASC_ISSUER_ID || '').trim();
let p8 = String(process.env.ASC_KEY_P8 || '').trim().replace(/\\n/g, '\n');
if (p8 && !p8.includes('PRIVATE KEY')) {
  const bytes = Buffer.from(p8.replace(/\s+/g, ''), 'base64');
  const text = bytes.toString('utf8').trim();
  p8 = text.includes('PRIVATE KEY') ? text
    : `-----BEGIN PRIVATE KEY-----\n${bytes.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;
}
p8 += '\n';

const note = (m) => console.log(`::notice title=Fotoswipe TestFlight::${m}`);
const warn = (m) => console.log(`::warning title=Fotoswipe TestFlight::${m}`);
const fail = (m) => { console.log(`::error title=Fotoswipe TestFlight::${m}`); process.exit(1); };

const b64url = (v) => Buffer.from(v).toString('base64url');
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const b = b64url(JSON.stringify({ iss: issuerId, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' }));
  const s = crypto.sign('sha256', Buffer.from(`${h}.${b}`), { key: p8, dsaEncoding: 'ieee-p1363' });
  return `${h}.${b}.${b64url(s)}`;
}
async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method, headers: { Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) {
    let d; try { d = JSON.parse(t).errors?.map((e) => `${e.code}: ${e.detail || e.title}`).join('; '); } catch { d = t.slice(0, 300); }
    const err = new Error(`${r.status} ${method} ${path.split('?')[0]}: ${d}`); err.status = r.status; throw err;
  }
  return t ? JSON.parse(t) : {};
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


if (!keyId || !issuerId || !p8.includes('PRIVATE KEY')) fail('App Store Connect API key secrets are missing.');
const T = (process.env.TARGET_BUILD || '').trim();
const EMAIL = 'k.phetmanee@gmail.com';
const parts = [];

// 1. What testers see in TestFlight, and where their feedback goes.
const text = {
  'nl-NL': 'Fotoswipe helpt je je fotorol op te ruimen: rechts is bewaren, links is wegleggen. Pas na jouw controle en bevestiging wordt er iets verwijderd. Probeer Slim opruimen, de Reiskaart en de widget, en stuur feedback via TestFlight.',
  'en-US': 'Fotoswipe helps you clean up your camera roll: swipe right to keep, left to set aside. Nothing is deleted until you review and confirm. Try Smart Clean, the Travel Map and the widget, and send feedback through TestFlight.',
};
const locs = (await api(`/v1/apps/${APP_ID}/betaAppLocalizations?limit=20`)).data;
for (const [locale, description] of Object.entries(text)) {
  const attributes = { description, feedbackEmail: EMAIL, marketingUrl: 'https://fotoswipe.onrender.com', privacyPolicyUrl: 'https://fotoswipe.onrender.com/privacy.html' };
  const loc = locs.find((l) => l.attributes.locale === locale);
  try {
    if (loc) await api(`/v1/betaAppLocalizations/${loc.id}`, { method: 'PATCH', body: { data: { type: 'betaAppLocalizations', id: loc.id, attributes } } });
    else await api('/v1/betaAppLocalizations', { method: 'POST', body: { data: { type: 'betaAppLocalizations', attributes: { locale, ...attributes }, relationships: { app: { data: { type: 'apps', id: APP_ID } } } } } });
    parts.push(`tester text ${locale} ok`);
  } catch (e) { parts.push(`tester text ${locale}: ${e.message}`); }
}

// 2. Contact for Apple's beta review: keeps what is already filled in.
const detail = (await api(`/v1/apps/${APP_ID}/betaAppReviewDetail`)).data;
const a = detail.attributes || {};
const want = {
  contactEmail: a.contactEmail || EMAIL,
  contactFirstName: a.contactFirstName || '',
  contactLastName: a.contactLastName || '',
  contactPhone: a.contactPhone || '',
  demoAccountRequired: false,
  notes: 'No account needed. Grant photo access when asked. Swiping never deletes anything by itself; deletion happens only after review and confirmation in the iOS dialog. Everything runs on-device.',
};
const missing = ['contactFirstName', 'contactLastName', 'contactPhone'].filter((k) => !want[k]);
try {
  await api(`/v1/betaAppReviewDetails/${detail.id}`, { method: 'PATCH', body: { data: { type: 'betaAppReviewDetails', id: detail.id, attributes: Object.fromEntries(Object.entries(want).filter(([, v]) => v !== '')) } } });
} catch (e) { parts.push(`review contact: ${e.message}`); }
parts.push(missing.length ? `review contact MISSING ${missing.join(', ')}` : 'review contact ok');

// 3. External group with a public link (max 100), and the build in it.
const groups = (await api(`/v1/apps/${APP_ID}/betaGroups?limit=20`)).data;
let group = groups.find((g) => !g.attributes.isInternalGroup);
if (!group) group = (await api('/v1/betaGroups', { method: 'POST', body: { data: { type: 'betaGroups', attributes: { name: 'Vrienden' }, relationships: { app: { data: { type: 'apps', id: APP_ID } } } } } })).data;
try {
  group = (await api(`/v1/betaGroups/${group.id}`, { method: 'PATCH', body: { data: { type: 'betaGroups', id: group.id,
    attributes: { publicLinkEnabled: true, publicLinkLimitEnabled: true, publicLinkLimit: 100, feedbackEnabled: true } } } })).data;
} catch (e) { parts.push(`public link: ${e.message}`); }
const builds = (await api(`/v1/builds?filter[app]=${APP_ID}&filter[version]=${T}&fields[builds]=version,processingState`)).data;
const build = builds.find((b) => b.attributes.processingState === 'VALID');
if (!build) fail(`Build ${T} not found or not processed.`);
try { await api(`/v1/betaGroups/${group.id}/relationships/builds`, { method: 'POST', body: { data: [{ type: 'builds', id: build.id }] } }); parts.push(`build ${T} in group "${group.attributes.name}"`); }
catch (e) { parts.push(`add build: ${e.message}`); }

// 4. Beta App Review: needed once for external testers. Not the App Store.
if (!missing.length) {
  try {
    await api('/v1/betaAppReviewSubmissions', { method: 'POST', body: { data: { type: 'betaAppReviewSubmissions', relationships: { build: { data: { type: 'builds', id: build.id } } } } } });
    parts.push('submitted for beta review');
  } catch (e) { parts.push(`beta review: ${e.message}`); }
} else parts.push('beta review NOT submitted (contact missing)');
const fresh = await api(`/v1/builds/${build.id}?include=buildBetaDetail&fields[buildBetaDetails]=externalBuildState`);
const state = (fresh.included || [])[0]?.attributes?.externalBuildState;
note(`SHARE ${parts.join(' | ')} | external state ${state} | public link ${group.attributes.publicLink || 'none yet'}`);
