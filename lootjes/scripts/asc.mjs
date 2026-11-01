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

  // Universal Links (invite links open the app) need the Associated Domains capability on the App ID.
  const caps = await api(`/v1/bundleIds/${bundle.id}/bundleIdCapabilities`).catch((e) => { warn(`Capabilities: ${e.message}`); return { data: [] }; });
  if (!(caps.data || []).some((c) => c.attributes.capabilityType === 'ASSOCIATED_DOMAINS')) {
    await api('/v1/bundleIdCapabilities', { method: 'POST', body: { data: { type: 'bundleIdCapabilities', attributes: { capabilityType: 'ASSOCIATED_DOMAINS' }, relationships: { bundleId: { data: { type: 'bundleIds', id: bundle.id } } } } } })
      .then(() => note('Enabled Associated Domains on the App ID.'))
      .catch((e) => warn(`Associated Domains: ${e.message}`));
  }

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

// ---------- store: App Store listing (texts, categories, age rating, screenshots). Never submits. ----------
if (mode === 'store') {
  const listing = JSON.parse(fs.readFileSync(new URL('../store/listing.json', import.meta.url)));
  const shotsDir = process.env.STORE_DIR || '';
  const app = await findApp(BUNDLE_ID);
  if (!app) fail('App record missing.');
  const appMeta = (await api(`/v1/apps/${app.id}?fields[apps]=primaryLocale,name`)).data.attributes;
  note(`App "${appMeta.name}", primary language ${appMeta.primaryLocale}.`);

  // App info (subtitle, privacy URL, categories, age rating) - the editable one.
  const infos = (await api(`/v1/apps/${app.id}/appInfos`)).data || [];
  const info = infos.find((i) => ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'WAITING_FOR_REVIEW'].includes(i.attributes.appStoreState || i.attributes.state)) || infos[0];
  await api(`/v1/appInfos/${info.id}`, { method: 'PATCH', body: { data: { type: 'appInfos', id: info.id, relationships: {
    primaryCategory: { data: { type: 'appCategories', id: listing.categories.primary } },
    secondaryCategory: { data: { type: 'appCategories', id: listing.categories.secondary } },
  } } } }).then(() => note('Categories set.')).catch((e) => warn(`Categories: ${e.message}`));

  const infoLocs = (await api(`/v1/appInfos/${info.id}/appInfoLocalizations?limit=50`)).data || [];
  for (const [locale, t] of Object.entries(listing.locales)) {
    const attrs = { subtitle: t.subtitle, privacyPolicyUrl: listing.privacyUrl };
    const ex = infoLocs.find((l) => l.attributes.locale === locale);
    const p = ex
      ? api(`/v1/appInfoLocalizations/${ex.id}`, { method: 'PATCH', body: { data: { type: 'appInfoLocalizations', id: ex.id, attributes: attrs } } })
      : api('/v1/appInfoLocalizations', { method: 'POST', body: { data: { type: 'appInfoLocalizations', attributes: { locale, name: appMeta.name, ...attrs }, relationships: { appInfo: { data: { type: 'appInfos', id: info.id } } } } } });
    await p.then(() => note(`App info ${locale} set.`)).catch((e) => warn(`App info ${locale}: ${e.message}`));
  }

  // Age rating: no objectionable content. The in-app shop browser only opens the listed shops,
  // so there is no unrestricted web access.
  try {
    const ar = (await api(`/v1/appInfos/${info.id}/ageRatingDeclaration`)).data;
    const none = ['alcoholTobaccoOrDrugUseOrReferences', 'contests', 'gamblingSimulated', 'horrorOrFearThemes', 'matureOrSuggestiveThemes',
      'medicalOrTreatmentInformation', 'profanityOrCrudeHumor', 'sexualContentGraphicAndNudity', 'sexualContentOrNudity',
      'violenceCartoonOrFantasy', 'violenceRealistic', 'violenceRealisticProlongedGraphicOrSadistic'];
    const attrs = Object.fromEntries(none.map((k) => [k, 'NONE']));
    Object.assign(attrs, { gambling: false, unrestrictedWebAccess: false, lootBox: false });
    await api(`/v1/ageRatingDeclarations/${ar.id}`, { method: 'PATCH', body: { data: { type: 'ageRatingDeclarations', id: ar.id, attributes: attrs } } });
    note('Age rating answers set (no objectionable content).');
  } catch (e) { warn(`Age rating: ${e.message}. Fill it in by hand in App Store Connect.`); }

  // Version 1.0 texts.
  const versions = (await api(`/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=10`)).data || [];
  let version = versions.find((v) => ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'].includes(v.attributes.appStoreState || v.attributes.appVersionState));
  if (!version) {
    version = (await api('/v1/appStoreVersions', { method: 'POST', body: { data: { type: 'appStoreVersions', attributes: { platform: 'IOS', versionString: '1.0' }, relationships: { app: { data: { type: 'apps', id: app.id } } } } } })).data;
    note('Created version 1.0.');
  }
  await api(`/v1/appStoreVersions/${version.id}`, { method: 'PATCH', body: { data: { type: 'appStoreVersions', id: version.id, attributes: { copyright: listing.copyright } } } })
    .catch((e) => warn(`Copyright: ${e.message}`));
  const vLocs = (await api(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=50`)).data || [];
  const isFirst = versions.length <= 1;
  for (const [locale, t] of Object.entries(listing.locales)) {
    const attrs = { description: t.description, keywords: t.keywords, promotionalText: t.promotionalText, supportUrl: listing.supportUrl, marketingUrl: listing.marketingUrl };
    if (!isFirst) attrs.whatsNew = t.whatsNew;
    let loc = vLocs.find((l) => l.attributes.locale === locale);
    try {
      if (loc) await api(`/v1/appStoreVersionLocalizations/${loc.id}`, { method: 'PATCH', body: { data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes: attrs } } });
      else loc = (await api('/v1/appStoreVersionLocalizations', { method: 'POST', body: { data: { type: 'appStoreVersionLocalizations', attributes: { locale, ...attrs }, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } } })).data;
      note(`Store text ${locale} set.`);
    } catch (e) { warn(`Store text ${locale}: ${e.message}`); continue; }

    // Screenshots: replace the set for iPhone 6.9" and iPad 13".
    if (!shotsDir) continue;
    for (const [kind, displayType] of [['iphone', 'APP_IPHONE_67'], ['ipad', 'APP_IPAD_PRO_3GEN_129']]) {
      const files = fs.existsSync(`${shotsDir}/${locale}`) ? fs.readdirSync(`${shotsDir}/${locale}`).filter((f) => f.startsWith(`${kind}-`)).sort() : [];
      if (!files.length) { warn(`No ${kind} screenshots for ${locale}.`); continue; }
      try {
        const sets = (await api(`/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=50`)).data || [];
        let set = sets.find((s) => s.attributes.screenshotDisplayType === displayType);
        if (!set) set = (await api('/v1/appScreenshotSets', { method: 'POST', body: { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: displayType }, relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } } } } })).data;
        const old = (await api(`/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`)).data || [];
        for (const o of old) await api(`/v1/appScreenshots/${o.id}`, { method: 'DELETE' });
        for (const f of files) {
          const buf = fs.readFileSync(`${shotsDir}/${locale}/${f}`);
          const res = (await api('/v1/appScreenshots', { method: 'POST', body: { data: { type: 'appScreenshots', attributes: { fileName: f, fileSize: buf.length }, relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } } } } })).data;
          for (const op of res.attributes.uploadOperations) {
            const headers = Object.fromEntries((op.requestHeaders || []).map((h) => [h.name, h.value]));
            const r = await fetch(op.url, { method: op.method, headers, body: buf.subarray(op.offset, op.offset + op.length) });
            if (!r.ok) throw new Error(`upload part ${r.status}`);
          }
          const md5 = crypto.createHash('md5').update(buf).digest('hex');
          await api(`/v1/appScreenshots/${res.id}`, { method: 'PATCH', body: { data: { type: 'appScreenshots', id: res.id, attributes: { uploaded: true, sourceFileChecksum: md5 } } } });
        }
        note(`${files.length} ${kind} screenshots uploaded for ${locale}.`);
      } catch (e) { warn(`Screenshots ${kind} ${locale}: ${e.message}`); }
    }
  }
  note('Store listing updated. Nothing was submitted for review.');
}
