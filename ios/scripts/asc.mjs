#!/usr/bin/env node
// App Store Connect API check for the existing BOEKUNA app record.
// Reads the API key from the environment only; prints no secret material.
// Usage: node ios/scripts/asc.mjs   (writes team_id, next_build, app_name to $GITHUB_OUTPUT when set)
import crypto from 'node:crypto';
import fs from 'node:fs';

const APP_ID = process.env.ASC_APP_ID || '6819651528';
const BUNDLE_ID = 'nl.boekuna.app';
const keyId = (process.env.ASC_KEY_ID || '').trim();
const issuerId = (process.env.ASC_ISSUER_ID || '').trim();
// Accept the .p8 as pasted text, with escaped newlines, or base64-encoded.
function normalizeKey(raw) {
  let key = String(raw || '').trim().replace(/\\n/g, '\n');
  if (key && !key.includes('PRIVATE KEY') && /^[A-Za-z0-9+/=\s]+$/.test(key)) {
    const bytes = Buffer.from(key.replace(/\s+/g, ''), 'base64');
    const text = bytes.toString('utf8').trim();
    if (text.includes('PRIVATE KEY')) key = text;
    // Only the base64 body was pasted, without the BEGIN/END lines: rewrap the DER key.
    else if (bytes[0] === 0x30 && bytes.length > 64) key = `-----BEGIN PRIVATE KEY-----\n${bytes.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;
  }
  return key ? `${key}\n` : '';
}
const p8 = normalizeKey(process.env.ASC_KEY_P8 || (process.env.ASC_KEY_PATH ? fs.readFileSync(process.env.ASC_KEY_PATH, 'utf8') : ''));

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!keyId || !issuerId) fail('ASC_KEY_ID and ASC_ISSUER_ID are required.');
if (!/^[A-Z0-9]{10}$/.test(keyId)) fail(`ASC_KEY_ID must be the 10-character Key ID (letters and digits), got ${keyId.length} characters${/[a-z]/.test(keyId) ? ' with lowercase letters' : ''}${/[^A-Za-z0-9]/.test(keyId) ? ' with other symbols' : ''}.`);
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issuerId)) fail(`ASC_ISSUER_ID must be the Issuer ID (a UUID like 69a6de7e-...), got ${issuerId.length} characters.`);
if (!p8.includes('PRIVATE KEY')) {
  // Describe the shape of the value without revealing it.
  const raw = String(process.env.ASC_KEY_P8 || '');
  const shape = `${raw.length} characters, ${raw.split(/\r?\n/).length} line(s), `
    + (/^[A-Za-z0-9+/=\s]+$/.test(raw) ? 'only base64 characters' : 'not only base64 characters')
    + (/^[A-Z0-9]{10}$/.test(raw.trim()) ? ', looks like a Key ID' : '')
    + (/\.p8\s*$/i.test(raw) ? ', looks like a file name' : '');
  fail(`ASC_KEY_P8 does not contain a .p8 private key (-----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----). Value: ${shape}.`);
}

const b64url = (value) => Buffer.from(value).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: issuerId, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' }));
  const signature = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: p8, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64url(signature)}`;
}

let jwt;
try { jwt = token(); } catch { fail('ASC_KEY_P8 is not a valid App Store Connect .p8 private key.'); }
// Hand the normalized key to xcodebuild without echoing it.
if (process.env.ASC_KEY_OUT) fs.writeFileSync(process.env.ASC_KEY_OUT, p8, { mode: 0o600 });
async function api(path) {
  const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, { headers: { Authorization: `Bearer ${jwt}` } });
  const text = await response.text();
  if (!response.ok) {
    const detail = (() => { try { return JSON.parse(text).errors?.map((e) => e.detail || e.title).join('; '); } catch { return text.slice(0, 300); } })();
    fail(`App Store Connect ${response.status} on ${path.split('?')[0]}: ${detail}`);
  }
  return JSON.parse(text);
}

const app = await api(`/v1/apps/${APP_ID}?fields[apps]=bundleId,name,sku`);
if (app.data.attributes.bundleId !== BUNDLE_ID) {
  fail(`App ${APP_ID} has bundle ID ${app.data.attributes.bundleId}, expected ${BUNDLE_ID}.`);
}

const bundles = await api(`/v1/bundleIds?filter[identifier]=${BUNDLE_ID}&fields[bundleIds]=identifier,seedId,platform&limit=20`);
const bundle = bundles.data.find((b) => b.attributes.identifier === BUNDLE_ID);
if (!bundle) fail(`Bundle ID ${BUNDLE_ID} is not registered for this API key's team.`);
const teamId = bundle.attributes.seedId;
if (!/^[A-Z0-9]{10}$/.test(teamId || '')) fail('Could not read the Team ID from the registered bundle ID.');

const builds = await api(`/v1/builds?filter[app]=${APP_ID}&fields[builds]=version&limit=200`);
const highest = builds.data.reduce((max, b) => Math.max(max, Number.parseInt(String(b.attributes.version).split('.')[0], 10) || 0), 0);
const nextBuild = String(highest + 1);

console.log(`PASS App Store Connect: app ${APP_ID} "${app.data.attributes.name}" uses ${BUNDLE_ID}; team found; ${builds.data.length} existing build(s); next build number ${nextBuild}.`);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `team_id=${teamId}\nnext_build=${nextBuild}\napp_name=${app.data.attributes.name}\n`);
}
