#!/usr/bin/env node
// Fills the App Store listing for Fotoswipe from store/listing.json: name, subtitle, privacy URL, categories,
// copyright, description, keywords, promotional text, support/marketing URL, and selects a build.
// Never submits for review and never changes age rating, privacy labels, pricing or trader status.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const APP_ID = '6827907455';
const listing = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'store', 'listing.json'), 'utf8'));
const TARGET = (process.env.TARGET_BUILD || '').trim();
const keyId = (process.env.ASC_KEY_ID || '').trim();
const issuerId = (process.env.ASC_ISSUER_ID || '').trim();
let p8 = String(process.env.ASC_KEY_P8 || '').trim().replace(/\\n/g, '\n');
if (p8 && !p8.includes('PRIVATE KEY')) {
  const bytes = Buffer.from(p8.replace(/\s+/g, ''), 'base64');
  const text = bytes.toString('utf8').trim();
  p8 = text.includes('PRIVATE KEY') ? text : `-----BEGIN PRIVATE KEY-----\n${bytes.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;
}
p8 += '\n';
const lines = [];
const note = (m) => lines.push(m);
const flush = (level = 'notice') => { for (const l of lines.splice(0)) console.log(`::${level} title=Fotoswipe store::${l}`); };
const b64url = (v) => Buffer.from(v).toString('base64url');
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const b = b64url(JSON.stringify({ iss: issuerId, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' }));
  return `${h}.${b}.${b64url(crypto.sign('sha256', Buffer.from(`${h}.${b}`), { key: p8, dsaEncoding: 'ieee-p1363' }))}`;
}
async function api(p, { method = 'GET', body } = {}) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${p}`, { method, headers: { Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) {
    let d; try { d = JSON.parse(t).errors?.map((e) => `${e.code}: ${e.detail || e.title}`).join('; '); } catch { d = t.slice(0, 300); }
    const e = new Error(`${r.status} ${method} ${p.split('?')[0]}: ${d}`); e.status = r.status; throw e;
  }
  return t ? JSON.parse(t) : {};
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (e) => String(e.message || e).slice(0, 220);

const app = await api(`/v1/apps/${APP_ID}?fields[apps]=name,primaryLocale,bundleId`);
note(`App: "${app.data.attributes.name}", primary language ${app.data.attributes.primaryLocale}`);

// App info (name, subtitle, privacy URL, categories)
const infos = (await api(`/v1/apps/${APP_ID}/appInfos`)).data;
const info = infos.find((i) => !['READY_FOR_DISTRIBUTION', 'REPLACED_WITH_NEW_INFO'].includes(i.attributes.state || i.attributes.appStoreState)) || infos[0];
try {
  await api(`/v1/appInfos/${info.id}`, { method: 'PATCH', body: { data: { type: 'appInfos', id: info.id, relationships: {
    primaryCategory: { data: { type: 'appCategories', id: listing.primaryCategory } },
    secondaryCategory: { data: { type: 'appCategories', id: listing.secondaryCategory } } } } } });
  note(`Categories: ${listing.primaryCategory} / ${listing.secondaryCategory}`);
} catch (e) { note(`Categories not set: ${short(e)}`); }

const infoLocs = (await api(`/v1/appInfos/${info.id}/appInfoLocalizations?limit=50`)).data;
let chosenName = null;
for (const [locale, text] of Object.entries(listing.locales)) {
  let loc = infoLocs.find((l) => l.attributes.locale === locale);
  if (!loc) {
    try {
      loc = (await api('/v1/appInfoLocalizations', { method: 'POST', body: { data: { type: 'appInfoLocalizations',
        attributes: { locale, name: chosenName || listing.nameCandidates[0], subtitle: text.subtitle, privacyPolicyUrl: listing.privacyPolicyUrl },
        relationships: { appInfo: { data: { type: 'appInfos', id: info.id } } } } } })).data;
    } catch (e) { note(`${locale}: could not add language (${short(e)})`); continue; }
  }
  const candidates = chosenName ? [chosenName] : listing.nameCandidates;
  let done = false;
  for (const name of candidates) {
    try {
      await api(`/v1/appInfoLocalizations/${loc.id}`, { method: 'PATCH', body: { data: { type: 'appInfoLocalizations', id: loc.id,
        attributes: { name, subtitle: text.subtitle, privacyPolicyUrl: listing.privacyPolicyUrl } } } });
      chosenName = name; done = true; break;
    } catch (e) { if (e.status !== 409) { note(`${locale} name/subtitle: ${short(e)}`); break; } }
  }
  if (done) note(`${locale}: name "${chosenName}", subtitle "${text.subtitle}", privacy URL set`);
  else if (!chosenName) note(`${locale}: none of the names are available`);
}

// Version 1.0 listing
const versions = (await api(`/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=10`)).data;
let version = versions.find((v) => ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'].includes(v.attributes.appStoreState || v.attributes.appVersionState));
if (!version) {
  version = (await api('/v1/appStoreVersions', { method: 'POST', body: { data: { type: 'appStoreVersions',
    attributes: { platform: 'IOS', versionString: '1.0', copyright: listing.copyright },
    relationships: { app: { data: { type: 'apps', id: APP_ID } } } } } })).data;
}
try {
  await api(`/v1/appStoreVersions/${version.id}`, { method: 'PATCH', body: { data: { type: 'appStoreVersions', id: version.id, attributes: { copyright: listing.copyright } } } });
} catch (e) { note(`Copyright: ${short(e)}`); }
const verLocs = (await api(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=50`)).data;
const filled = [];
for (const [locale, text] of Object.entries(listing.locales)) {
  const attributes = { description: text.description, keywords: text.keywords, promotionalText: text.promotionalText,
                       supportUrl: listing.supportUrl, marketingUrl: listing.marketingUrl };
  try {
    const loc = verLocs.find((l) => l.attributes.locale === locale);
    if (loc) await api(`/v1/appStoreVersionLocalizations/${loc.id}`, { method: 'PATCH', body: { data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes } } });
    else await api('/v1/appStoreVersionLocalizations', { method: 'POST', body: { data: { type: 'appStoreVersionLocalizations',
      attributes: { locale, ...attributes }, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } } });
    filled.push(locale);
  } catch (e) { note(`${locale} description: ${short(e)}`); }
}
note(`Version ${version.attributes.versionString}: description, keywords, promo text, support and marketing URL set for ${filled.join(', ') || 'no language'}`);

// Select the build (waits for processing)
if (TARGET) {
  let build;
  for (let i = 0; i < 40 && !build; i++) {
    const res = await api(`/v1/builds?filter[app]=${APP_ID}&filter[version]=${TARGET}&fields[builds]=version,processingState`);
    build = res.data.find((b) => b.attributes.processingState === 'VALID');
    if (!build) await sleep(60_000);
  }
  if (build) {
    try {
      await api(`/v1/appStoreVersions/${version.id}/relationships/build`, { method: 'PATCH', body: { data: { type: 'builds', id: build.id } } });
      note(`Build ${TARGET} selected for version ${version.attributes.versionString} (not submitted)`);
    } catch (e) { note(`Build ${TARGET} not selected: ${short(e)}`); }
  } else note(`Build ${TARGET} not processed yet; select it later`);
}
flush();

// Screenshots (6.9-inch iPhone, 1320x2868) from store/screenshots/<locale>/1..5.png. Replaces the set only when asked.
if (process.env.UPLOAD_SCREENSHOTS === '1') {
  const freshLocs = (await api(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=50`)).data;
  // iPhone 6.9-inch and iPad 13-inch; languages without their own folder use the primary language's screenshots.
  const groups = [['screenshots', ['APP_IPHONE_67', 'APP_IPHONE_69']], ['screenshots-ipad', ['APP_IPAD_PRO_3GEN_129']]];
  for (const [folder, displayTypes] of groups) {
  const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'store', folder);
  for (const locale of Object.keys(listing.locales)) {
    const dir = path.join(root, locale);
    if (!fs.existsSync(dir)) continue;
    const loc = freshLocs.find((l) => l.attributes.locale === locale);
    if (!loc) { note(`${locale}: no version language for screenshots`); continue; }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
    let uploaded = 0, failed = '';
    for (const displayType of displayTypes) {
      try {
        const sets = (await api(`/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=50`)).data;
        let set = sets.find((s) => s.attributes.screenshotDisplayType === displayType);
        if (set) {
          const old = (await api(`/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`)).data;
          for (const shot of old) await api(`/v1/appScreenshots/${shot.id}`, { method: 'DELETE' });
        } else {
          set = (await api('/v1/appScreenshotSets', { method: 'POST', body: { data: { type: 'appScreenshotSets',
            attributes: { screenshotDisplayType: displayType },
            relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } } } } })).data;
        }
        for (const file of files) {
          const bytes = fs.readFileSync(path.join(dir, file));
          const shot = (await api('/v1/appScreenshots', { method: 'POST', body: { data: { type: 'appScreenshots',
            attributes: { fileName: `${locale}-${file}`, fileSize: bytes.length },
            relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } } } } })).data;
          for (const op of shot.attributes.uploadOperations) {
            const headers = Object.fromEntries((op.requestHeaders || []).map((h) => [h.name, h.value]));
            const res = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
            if (!res.ok) throw new Error(`upload part ${res.status}`);
          }
          const md5 = crypto.createHash('md5').update(bytes).digest('hex');
          await api(`/v1/appScreenshots/${shot.id}`, { method: 'PATCH', body: { data: { type: 'appScreenshots', id: shot.id,
            attributes: { uploaded: true, sourceFileChecksum: md5 } } } });
          uploaded++;
        }
        failed = '';
        note(`${locale}: ${uploaded} screenshots uploaded as ${displayType}`);
        break;
      } catch (e) { failed = short(e); uploaded = 0; }
    }
    if (failed) note(`${locale}: screenshots failed (${failed})`);
  }
  }
  await sleep(20_000);
  for (const locale of Object.keys(listing.locales)) {
    const loc = freshLocs.find((l) => l.attributes.locale === locale);
    if (!loc) continue;
    const sets = (await api(`/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?include=appScreenshots&limit=50`));
    const states = (sets.included || []).map((s) => s.attributes.assetDeliveryState?.state).filter(Boolean);
    note(`${locale}: screenshot states ${[...new Set(states)].join('/') || 'none'} (${states.length})`);
  }
  flush();
}
