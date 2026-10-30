#!/usr/bin/env node
// App Store Connect helper for Lootjes. The API key stays inside the CI runner; nothing secret is printed.
//   node scripts/asc.mjs preflight   -> registers the bundle ID if needed, finds the app, next build number
//   node scripts/asc.mjs testflight  -> waits for processing, answers compliance, internal group + testers
import crypto from 'node:crypto';
import fs from 'node:fs';

const BUNDLE_ID = 'nl.zichtwerfstudio.lootjes';
const APP_NAME = 'Lootjes';
const GROUP_NAME = 'Kwin test';
const TEMPLATE_GROUP_APP_BUNDLE = 'nl.zichtwerfstudio.fotoswipe'; // copy internal testers from here
const mode = process.argv[2] || 'preflight';

const keyId = (process.env.ASC_KEY_ID || '').trim();
const issuerId = (process.env.ASC_ISSUER_ID || '').trim();
function normalizeKey(raw) {
  let key = String(raw || '').trim().replace(/\\n/g, '\n');
  if (key && !key.includes('PRIVATE KEY') && /^[A-Za-z0-9+/=\s]+$/.test(key)) {
    const bytes = Buffer.from(key.replace(/\s+/g, ''), 'base64');
    const text = bytes.toString('utf8').trim();
    if (text.includes('PRIVATE KEY')) key = text;
    else if (bytes[0] === 0x30 && bytes.length > 64) key = `-----BEGIN PRIVATE KEY-----\n${bytes.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;
  }
  return key ? `${key}\n` : '';
}
const p8 = normalizeKey(process.env.ASC_KEY_P8);
const out = (k, v) => process.env.GITHUB_OUTPUT && fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
const note = (m) => console.log(`::notice title=Lootjes ASC::${m}`);
const warn = (m) => console.log(`::warning title=Lootjes ASC::${m}`);
const fail = (m) => { console.log(`::error title=Lootjes ASC::${m}`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!keyId || !issuerId || !p8.includes('PRIVATE KEY')) fail('App Store Connect API key secrets are missing.');
const b64url = (v) => Buffer.from(v).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: issuerId, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: p8, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64url(sig)}`;
}
if (process.env.ASC_KEY_OUT) fs.writeFileSync(process.env.ASC_KEY_OUT, p8, { mode: 0o600 });

async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok) {
    let d; try { d = JSON.parse(t).errors?.map((e) => `${e.code}: ${e.detail || e.title}`).join('; '); } catch { d = t.slice(0, 300); }
    const err = new Error(`${r.status} ${method} ${path.split('?')[0]}: ${d}`); err.status = r.status; throw err;
  }
  return t ? JSON.parse(t) : {};
}

async function findApp(bundle) {
  const res = await api(`/v1/apps?filter[bundleId]=${bundle}&fields[apps]=bundleId,name,sku`);
  return (res.data || []).find((a) => a.attributes.bundleId === bundle);
}

if (mode === 'preflight') {
  // 1. Bundle ID (the API can register it; creating the app record itself is web-only).
  let bundles = await api(`/v1/bundleIds?filter[identifier]=${BUNDLE_ID}&fields[bundleIds]=identifier,seedId,platform`);
  let bundle = (bundles.data || []).find((b) => b.attributes.identifier === BUNDLE_ID);
  if (!bundle) {
    const created = await api('/v1/bundleIds', { method: 'POST', body: { data: { type: 'bundleIds', attributes: { identifier: BUNDLE_ID, name: APP_NAME, platform: 'IOS' } } } });
    bundle = created.data;
    note(`Registered bundle ID ${BUNDLE_ID}.`);
  }
  const teamId = bundle.attributes.seedId;
  out('team_id', teamId);

  const app = await findApp(BUNDLE_ID);
  if (!app) {
    out('app_exists', 'false');
    warn(`No App Store Connect app for ${BUNDLE_ID} yet. Create it once at App Store Connect > Apps > + (bundle ID ${BUNDLE_ID}); the next run uploads automatically.`);
    process.exit(0);
  }
  const builds = await api(`/v1/builds?filter[app]=${app.id}&fields[builds]=version&limit=200`);
  const highest = (builds.data || []).reduce((m, b) => Math.max(m, parseInt(String(b.attributes.version), 10) || 0), 0);
  out('app_exists', 'true');
  out('app_id', app.id);
  out('next_build', String(highest + 1));
  note(`App ${app.id} "${app.attributes.name}" found; next build ${highest + 1}.`);
  process.exit(0);
}

if (mode === 'testflight') {
  const app = await findApp(BUNDLE_ID);
  if (!app) fail('App record missing.');
  const target = process.env.TARGET_BUILD;
  let build;
  for (let i = 0; i < 45; i++) {
    const res = await api(`/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=5&fields[builds]=version,processingState,usesNonExemptEncryption`);
    build = (res.data || []).find((b) => !target || b.attributes.version === target);
    if (build && build.attributes.processingState !== 'PROCESSING') break;
    await sleep(60_000);
  }
  if (!build) fail(`Build ${target} not found after waiting.`);
  note(`Build ${build.attributes.version}: ${build.attributes.processingState}`);
  if (build.attributes.processingState !== 'VALID') fail(`Build is ${build.attributes.processingState}.`);

  if (build.attributes.usesNonExemptEncryption == null) {
    await api(`/v1/builds/${build.id}`, { method: 'PATCH', body: { data: { type: 'builds', id: build.id, attributes: { usesNonExemptEncryption: false } } } }).catch((e) => warn(e.message));
  }

  // What to Test.
  const text = process.env.WHAT_TO_TEST || '';
  if (text) {
    try {
      const locs = await api(`/v1/builds/${build.id}/betaBuildLocalizations`);
      if (locs.data?.length) {
        await api(`/v1/betaBuildLocalizations/${locs.data[0].id}`, { method: 'PATCH', body: { data: { type: 'betaBuildLocalizations', id: locs.data[0].id, attributes: { whatsNew: text } } } });
      } else {
        await api('/v1/betaBuildLocalizations', { method: 'POST', body: { data: { type: 'betaBuildLocalizations', attributes: { locale: 'nl-NL', whatsNew: text }, relationships: { build: { data: { type: 'builds', id: build.id } } } } } });
      }
    } catch (e) { warn(`What to Test: ${e.message}`); }
  }

  // Internal group, created on first run, with the same testers as Fotoswipe's group.
  let groups = (await api(`/v1/apps/${app.id}/betaGroups?limit=50&fields[betaGroups]=name,isInternalGroup,hasAccessToAllBuilds`)).data || [];
  let group = groups.find((g) => g.attributes.isInternalGroup);
  if (!group) {
    group = (await api('/v1/betaGroups', { method: 'POST', body: { data: { type: 'betaGroups', attributes: { name: GROUP_NAME, isInternalGroup: true, hasAccessToAllBuilds: true }, relationships: { app: { data: { type: 'apps', id: app.id } } } } } })).data;
    note(`Created internal TestFlight group "${GROUP_NAME}".`);
  }
  const existing = new Set(((await api(`/v1/betaGroups/${group.id}/betaTesters?limit=200&fields[betaTesters]=email`)).data || []).map((t) => (t.attributes.email || '').toLowerCase()));
  try {
    const fs2 = await findApp(TEMPLATE_GROUP_APP_BUNDLE);
    const tg = fs2 && ((await api(`/v1/apps/${fs2.id}/betaGroups?limit=50&fields[betaGroups]=name,isInternalGroup`)).data || []).filter((g) => g.attributes.isInternalGroup);
    for (const g of tg || []) {
      const testers = (await api(`/v1/betaGroups/${g.id}/betaTesters?limit=200&fields[betaTesters]=email,firstName,lastName`)).data || [];
      for (const t of testers) {
        const email = (t.attributes.email || '').toLowerCase();
        if (!email || existing.has(email)) continue;
        await api(`/v1/betaGroups/${group.id}/relationships/betaTesters`, { method: 'POST', body: { data: [{ type: 'betaTesters', id: t.id }] } })
          .then(() => { existing.add(email); note('Added an internal tester from the Fotoswipe group.'); })
          .catch((e) => warn(`Tester not added: ${e.message}`));
      }
    }
  } catch (e) { warn(`Copying testers: ${e.message}`); }
  const ga = (await api(`/v1/betaGroups/${group.id}?fields[betaGroups]=hasAccessToAllBuilds`)).data.attributes;
  if (!ga.hasAccessToAllBuilds) {
    await api(`/v1/betaGroups/${group.id}/relationships/builds`, { method: 'POST', body: { data: [{ type: 'builds', id: build.id }] } }).catch((e) => warn(e.message));
  }
  await sleep(20_000);
  const detail = await api(`/v1/builds/${build.id}/buildBetaDetail`).catch(() => null);
  const state = detail?.data?.attributes?.internalBuildState;
  note(`Build ${build.attributes.version} internal TestFlight state: ${state}; testers in group: ${existing.size}.`);
  if (state !== 'IN_BETA_TESTING') warn(`Internal state is ${state}, expected IN_BETA_TESTING.`);
}
