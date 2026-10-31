import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('TestFlight verification rejects an empty group instead of reporting success', () => {
  const code = `
    const crypto = await import('node:crypto');
    process.env.ASC_KEY_ID = 'test'; process.env.ASC_ISSUER_ID = 'test';
    process.env.ASC_KEY_P8 = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey;
    process.env.TARGET_BUILD = '1'; process.argv[2] = 'testflight';
    globalThis.setTimeout = (fn) => { fn(); return 0; };
    globalThis.fetch = async (url, options) => {
      const path = new URL(url).pathname;
      let data = [];
      if (path === '/v1/apps') data = [{ id: 'app', attributes: { bundleId: url.includes('fotoswipe') ? 'nl.zichtwerfstudio.fotoswipe' : 'nl.zichtwerf.quitte' } }];
      if (path === '/v1/builds') data = [{ id: 'build', attributes: { version: '1', processingState: 'VALID', usesNonExemptEncryption: false } }];
      if (path === '/v1/builds/build') data = { id: 'build', attributes: { usesNonExemptEncryption: false } };
      if (path.endsWith('/betaGroups')) data = [{ id: 'group', attributes: { name: 'Kwin test', isInternalGroup: true, hasAccessToAllBuilds: true } }];
      if (path === '/v1/betaGroups/group') data = { id: 'group', attributes: { hasAccessToAllBuilds: true } };
      if (path.endsWith('/buildBetaDetail')) data = { attributes: { internalBuildState: 'READY_FOR_BETA_TESTING' } };
      return new Response(JSON.stringify({ data }), { status: 200 });
    };
    await import('./asc.mjs');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: new URL('.', import.meta.url), encoding: 'utf8' });
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stdout, /has no testers/);
});
