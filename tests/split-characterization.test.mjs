import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const app=read('kwinest/index.html');
const marketing=read('public/assets/marketing.js');
const manifest=read('public/manifest.webmanifest');
const workflow=read('.github/workflows/boekuna-integrity.yml');
const checkout=read('supabase/functions/billing-checkout/index.ts');
const portal=read('supabase/functions/billing-portal/index.ts');
const analyze=read('supabase/functions/analyze-invoice/index.ts');

const retainedPublicPages=['account-verwijderen','privacy','support','voorwaarden'];
const multipageMarketingRoutes=[
  'functies','assistent','scanner','prijzen','veiligheid','faq',
  'facturen','bonnen','btw','bank','rapportages','mobiel','hoe-het-werkt'
];
const retiredOnePageRoutes=['btw-bank','contact','over','voor-ondernemers'];

for(const slug of retainedPublicPages){
  assert.ok(fs.existsSync(path.join(root,'public',slug,'index.html')), 'retained public page missing: '+slug);
}
for(const slug of multipageMarketingRoutes){
  assert.ok(fs.existsSync(path.join(root,'public',slug,'index.html')), 'multipage marketing page missing: '+slug);
}
for(const slug of retiredOnePageRoutes){
  assert.ok(!fs.existsSync(path.join(root,'public',slug,'index.html')), 'retired one-page route unexpectedly restored: '+slug);
}

assert.ok(app.includes('/* Public Boekuna landing page */'),
  'baseline app document must still contain the public marketing shell before the split');
assert.ok(app.includes('marketing-hero'),
  'baseline combined document must still include marketing hero styles/content');
assert.ok(app.includes('function enterApp()'),
  'baseline combined document must still contain product-app entry logic');

assert.ok(marketing.includes('https://app.boekuna.nl/?login=1'),
  'marketing login CTA must cross to the isolated product host');
assert.ok(!marketing.includes('href="/?login=1"'),
  'marketing runtime must no longer keep same-origin product login links');
assert.ok(marketing.includes("og.setAttribute('content','https://boekuna.nl/"),
  'marketing social metadata must publish the public host');
assert.ok(!marketing.includes('boekuna-boekhouding.onrender.com'),
  'marketing runtime must not publish the legacy Render host');

const parsedManifest=JSON.parse(manifest);
assert.equal(parsedManifest.start_url,'/?login=1&app=1',
  'baseline PWA entry must still point at the combined origin');

for(const source of [checkout,portal]){
  assert.ok(source.includes('https://boekuna-boekhouding.onrender.com'),
    'billing functions must retain the legacy production origin during the rollback window');
  assert.ok(source.includes('https://app.boekuna.nl'),
    'billing functions must allow the isolated product origin');
  assert.ok(source.includes('Deno.env.get("APP_URL")||"https://app.boekuna.nl"'),
    'billing APP_URL must default to the isolated product host');
}
assert.ok(analyze.includes('"https://boekuna.nl"'),
  'document API must retain the public Boekuna origin during transition');
assert.ok(analyze.includes('"https://app.boekuna.nl"'),
  'document API must allow the isolated product origin');

assert.ok(workflow.includes('node tests/browser-smoke.test.mjs'),
  'baseline workflow must contain app/browser regression');
assert.ok(workflow.includes('node tests/marketing-pages.test.mjs'),
  'baseline workflow must contain marketing regression');
assert.equal((workflow.match(/^jobs:/gm)||[]).length,1,
  'baseline workflow structure must remain readable');
assert.ok(workflow.includes('jobs:\n  test:'),
  'baseline workflow must still run one broad coupled test job');

console.log('BOEKUNA split characterization: PASS');
