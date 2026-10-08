import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const app=read('kwinest/index.html');
const marketing=read('public/index.html');
const manifest=read('public/manifest.webmanifest');
const workflow=read('.github/workflows/boekuna-integrity.yml');
const checkout=read('supabase/functions/billing-checkout/index.ts');
const portal=read('supabase/functions/billing-portal/index.ts');
const analyze=read('supabase/functions/analyze-invoice/index.ts');

const retainedPublicPages=['account-verwijderen','privacy','support','voorwaarden'];
const retiredMarketingRoutes=['functies','assistent','scanner','prijzen','veiligheid','faq','facturen','bonnen','btw','bank','rapportages','mobiel','hoe-het-werkt'];
for(const slug of retainedPublicPages)assert.ok(fs.existsSync(path.join(root,'public',slug,'index.html')),'retained public page missing: '+slug);
for(const slug of retiredMarketingRoutes)assert.ok(!fs.existsSync(path.join(root,'public',slug,'index.html')),'retired marketing source page unexpectedly restored: '+slug);

assert.ok(app.includes('function enterApp()'),'product-app entry logic must remain');
assert.ok(marketing.includes('<meta name="robots" content="index,follow">'),'public root must be an indexable landing page');
assert.ok(marketing.includes('Boekhouden zonder gedoe'),'public landing copy missing');
assert.ok(marketing.includes('https://app.boekuna.nl/?login=1'),'marketing login must cross to isolated product host');
assert.equal(marketing.includes('/assets/marketing.js'),false,'retired marketing JS returned');
assert.equal(marketing.includes('boekuna-boekhouding.onrender.com'),false,'landing page must not publish legacy Render host');

const parsedManifest=JSON.parse(manifest);
assert.equal(parsedManifest.start_url,'/?login=1&app=1','app PWA entry must remain unchanged');
for(const source of [checkout,portal]){
  assert.ok(source.includes('https://boekuna-boekhouding.onrender.com'),'billing functions must retain legacy production origin during rollback window');
  assert.ok(source.includes('https://app.boekuna.nl'),'billing functions must allow isolated product origin');
  assert.ok(source.includes('Deno.env.get("APP_URL")||"https://app.boekuna.nl"'),'billing APP_URL must default to isolated product host');
}
assert.ok(analyze.includes('"https://boekuna.nl"'),'document API must retain public Boekuna origin during transition');
assert.ok(analyze.includes('"https://app.boekuna.nl"'),'document API must allow isolated product origin');
assert.ok(workflow.includes('node tests/browser-smoke.test.mjs'),'integrity workflow must contain app/browser regression');
assert.ok(workflow.includes('node tests/marketing-pages.test.mjs'),'integrity workflow must contain marketing regression');
console.log('BOEKUNA split characterization: PASS');
