import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(p,'utf8');
const full=read('.github/workflows/boekuna-integrity.yml');
const marketingPath='.github/workflows/boekuna-marketing.yml';
const appPath='.github/workflows/boekuna-app.yml';
const backendPath='.github/workflows/boekuna-backend.yml';

for(const p of [marketingPath,appPath,backendPath]){
  assert.ok(fs.existsSync(p),'missing scoped CI workflow: '+p);
}
assert.ok(full.includes('workflow_dispatch:'),'full integrity gate must be manually dispatchable');
assert.ok(full.includes('docs/SPLIT_FULL_GATE.md'),'full PR gate must use an explicit marker instead of every application diff');
assert.ok(!full.includes('      - "kwinest/**"'),'full gate must not run on every app-only PR change');
assert.ok(!full.includes('      - "tests/**"'),'full gate must not run on every test-only PR change');

const marketing=read(marketingPath);
for(const s of ['"public/index.html"','"public/*/index.html"','public/assets/marketing.js','scripts/build-marketing.mjs','marketing-pages.test.mjs','marketing-product-proof.test.mjs','marketing-editorial-responsive.test.mjs']){
  assert.ok(marketing.includes(s),'marketing workflow missing '+s);
}
assert.ok(!marketing.includes('ocr-production-hardening.test.py'),'marketing workflow must not run OCR backend regression');
assert.ok(!marketing.includes('billing-source.test.mjs'),'marketing workflow must not run billing backend regression');

const app=read(appPath);
for(const s of ['kwinest/index.html','scripts/build-app.mjs','browser-smoke.test.mjs','auth-progressive-onboarding.test.mjs','production-integrity.test.mjs']){
  assert.ok(app.includes(s),'app workflow missing '+s);
}
assert.ok(!app.includes('marketing-product-proof.test.mjs'),'app workflow must not run marketing-only visual proof');
assert.ok(!app.includes('ocr-production-hardening.test.py'),'app workflow must not install/run OCR backend regression');

const backend=read(backendPath);
for(const s of ['"supabase/**"','"kwinest/docprocessor/**"','billing-source.test.mjs','provider-agnostic-entitlement.test.mjs','ocr-production-hardening.test.py']){
  assert.ok(backend.includes(s),'backend workflow missing '+s);
}
assert.ok(!backend.includes('marketing-editorial-responsive.test.mjs'),'backend workflow must not run marketing visuals');
assert.ok(!backend.includes('browser-smoke.test.mjs'),'backend workflow must not run product UI browser smoke');

console.log('BOEKUNA split CI scopes: PASS');
