import fs from 'node:fs';
import assert from 'node:assert/strict';

const marketing=fs.readFileSync('.github/workflows/boekuna-marketing.yml','utf8');
const app=fs.readFileSync('.github/workflows/boekuna-app.yml','utf8');
const backend=fs.readFileSync('.github/workflows/boekuna-backend.yml','utf8');

for(const required of [
  'public/*/index.html',
  'public/assets/site.css',
  'public/assets/site.js',
  'public/assets/favicon.svg',
  'scripts/build-marketing.mjs',
  'marketing-pages.test.mjs',
  'marketing-onepage-browser.test.mjs'
])assert.ok(marketing.includes(required),'marketing workflow missing '+required);

assert.ok(marketing.includes('marketing-app-non-regression.test.mjs'),'marketing workflow must protect the product app artifact');
assert.ok(!marketing.includes('ocr-production-hardening.test.py'),'marketing workflow must not run OCR backend regression');
assert.ok(!marketing.includes('billing-source.test.mjs'),'marketing workflow must not run billing backend regression');

for(const required of ['kwinest/index.html','scripts/build-app.mjs','browser-smoke.test.mjs'])assert.ok(app.includes(required),'app workflow missing '+required);
assert.ok(!app.includes('marketing-onepage-browser.test.mjs'),'app workflow must not run marketing browser QA');

for(const required of ['"supabase/**"','"kwinest/docprocessor/**"','ocr-production-hardening.test.py'])assert.ok(backend.includes(required),'backend workflow missing '+required);
assert.ok(!backend.includes('marketing-onepage-browser.test.mjs'),'backend workflow must not run marketing visuals');

console.log('BOEKUNA split CI scopes: PASS');
