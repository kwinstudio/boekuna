#!/usr/bin/env node
// Checks TestFlight processing for Fotoswipe and makes the newest build available to internal groups.
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

async function listBuilds() {
  const res = await api(`/v1/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=10&fields[builds]=version,processingState,uploadedDate,expired,expirationDate,usesNonExemptEncryption,preReleaseVersion,buildBetaDetail&include=preReleaseVersion,buildBetaDetail&fields[preReleaseVersions]=version&fields[buildBetaDetails]=internalBuildState,externalBuildState,autoNotifyEnabled`);
  const inc = Object.fromEntries((res.included || []).map((x) => [`${x.type}:${x.id}`, x]));
  return res.data.map((b) => ({
    id: b.id,
    build: b.attributes.version,
    version: inc[`preReleaseVersions:${b.relationships?.preReleaseVersion?.data?.id}`]?.attributes?.version,
    processing: b.attributes.processingState,
    uploaded: b.attributes.uploadedDate,
    expired: b.attributes.expired,
    encryption: b.attributes.usesNonExemptEncryption,
    detailId: b.relationships?.buildBetaDetail?.data?.id,
    internal: inc[`buildBetaDetails:${b.relationships?.buildBetaDetail?.data?.id}`]?.attributes?.internalBuildState,
    external: inc[`buildBetaDetails:${b.relationships?.buildBetaDetail?.data?.id}`]?.attributes?.externalBuildState,
  }));
}

let builds = await listBuilds();
for (const b of builds) note(`Build ${b.version} (${b.build}): processing=${b.processing}, internal=${b.internal}, external=${b.external}, expired=${b.expired}, uploaded=${b.uploaded}`);
if (!builds.length) fail('No builds found for the app.');

let target = TARGET ? builds.find((b) => b.build === TARGET) : builds[0];
if (!target) fail(`Build ${TARGET} not found in App Store Connect.`);

const deadline = Date.now() + WAIT_MIN * 60_000;
while (target.processing === 'PROCESSING' && Date.now() < deadline) {
  await sleep(60_000);
  builds = await listBuilds();
  target = builds.find((b) => b.id === target.id);
}
note(`Target build ${target.version} (${target.build}): processing=${target.processing}, internal=${target.internal}`);
if (target.processing !== 'VALID') fail(`Build ${target.build} is ${target.processing}, not VALID. It cannot be tested until Apple finishes processing.`);
if (target.expired) fail(`Build ${target.build} is expired.`);

// Export compliance: answer only if Apple still asks (the Info.plist already declares no non-exempt encryption).
if (target.encryption === null || target.encryption === undefined) {
  try {
    await api(`/v1/builds/${target.id}`, { method: 'PATCH', body: { data: { type: 'builds', id: target.id, attributes: { usesNonExemptEncryption: false } } } });
    note('Export compliance answered: no non-exempt encryption (matches Info.plist).');
  } catch (e) { warn(`Could not set export compliance: ${e.message}`); }
}

// What to Test text, only when none exists yet.
try {
  const locs = await api(`/v1/builds/${target.id}/betaBuildLocalizations`);
  const text = process.env.WHAT_TO_TEST || '';
  if (text && !(locs.data || []).some((l) => (l.attributes.whatsNew || '').trim())) {
    if (locs.data?.length) {
      await api(`/v1/betaBuildLocalizations/${locs.data[0].id}`, { method: 'PATCH', body: { data: { type: 'betaBuildLocalizations', id: locs.data[0].id, attributes: { whatsNew: text } } } });
    } else {
      const appLocs = await api(`/v1/apps/${APP_ID}/betaAppLocalizations`);
      const locale = appLocs.data?.[0]?.attributes?.locale || 'nl-NL';
      await api('/v1/betaBuildLocalizations', { method: 'POST', body: { data: { type: 'betaBuildLocalizations', attributes: { locale, whatsNew: text }, relationships: { build: { data: { type: 'builds', id: target.id } } } } } });
    }
    note('"What to Test" text added for testers.');
  }
} catch (e) { warn(`Could not set "What to Test": ${e.message}`); }

// Internal groups.
const groups = (await api(`/v1/apps/${APP_ID}/betaGroups?limit=50&fields[betaGroups]=name,isInternalGroup,hasAccessToAllBuilds,publicLinkEnabled`)).data || [];
if (!groups.length) warn('No TestFlight groups exist for this app.');
for (const g of groups) {
  const a = g.attributes;
  const testers = await api(`/v1/betaGroups/${g.id}/betaTesters?limit=200&fields[betaTesters]=state`).catch(() => ({ data: [] }));
  const groupBuilds = await api(`/v1/betaGroups/${g.id}/builds?limit=200&fields[builds]=version`).catch(() => ({ data: [] }));
  let has = a.hasAccessToAllBuilds || (groupBuilds.data || []).some((b) => b.id === target.id);
  if (a.isInternalGroup && !has) {
    try {
      await api(`/v1/betaGroups/${g.id}/relationships/builds`, { method: 'POST', body: { data: [{ type: 'builds', id: target.id }] } });
      has = true;
      note(`Build ${target.build} added to internal group "${a.name}".`);
    } catch (e) { warn(`Could not add build ${target.build} to group "${a.name}": ${e.message}`); }
  }
  const states = (testers.data || []).reduce((m, t) => ((m[t.attributes.state] = (m[t.attributes.state] || 0) + 1), m), {});
  note(`Group "${a.name}" (${a.isInternalGroup ? 'internal' : 'external'}): allBuilds=${a.hasAccessToAllBuilds}, build ${target.build} assigned=${has}, testers=${(testers.data || []).length} ${JSON.stringify(states)}`);
}

// Final state.
await sleep(15_000);
builds = await listBuilds();
target = builds.find((b) => b.id === target.id);
note(`FINAL build ${target.version} (${target.build}): processing=${target.processing}, internal=${target.internal}, external=${target.external}`);
if (target.internal !== 'IN_BETA_TESTING') warn(`Internal state is ${target.internal}, expected IN_BETA_TESTING.`);
