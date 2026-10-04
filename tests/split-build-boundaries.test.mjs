import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const marketingScript=path.join(root,'scripts','build-marketing.mjs');
const appScript=path.join(root,'scripts','build-app.mjs');

assert.ok(fs.existsSync(marketingScript),'marketing must have an explicit independent build script');
assert.ok(fs.existsSync(appScript),'product app must have an explicit independent build script');

for(const dir of ['dist/marketing','dist/app'])fs.rmSync(path.join(root,dir),{recursive:true,force:true});

const marketing=spawnSync(process.execPath,[marketingScript],{cwd:root,encoding:'utf8'});
assert.equal(marketing.status,0,'marketing build failed: '+(marketing.stderr||marketing.stdout));
const m=path.join(root,'dist','marketing');
for(const file of [
  'index.html','functies/index.html','assistent/index.html','scanner/index.html','prijzen/index.html',
  'veiligheid/index.html','faq/index.html','privacy/index.html','voorwaarden/index.html',
  'support/index.html','account-verwijderen/index.html','assets/site.css','assets/site.js'
])assert.ok(fs.existsSync(path.join(m,file)),'marketing build missing '+file);
assert.ok(!fs.existsSync(path.join(m,'manifest.webmanifest')),'marketing build must not publish app-only PWA manifest');
const marketingIndex=fs.readFileSync(path.join(m,'index.html'),'utf8');
assert.ok(marketingIndex.includes('Je bent ondernemer.'),'marketing root must expose multipage proposition');
assert.ok(marketingIndex.includes('Geen boekhouder.'),'marketing root must expose second proposition line');
assert.ok(marketingIndex.includes('https://app.boekuna.nl/?register=1'),'marketing registration CTA must cross to product host');
assert.ok(marketingIndex.includes('/assets/site.css'),'marketing root must use multipage stylesheet');
assert.ok(marketingIndex.includes('/assets/site.js'),'marketing root must use multipage runtime');
assert.ok(!marketingIndex.includes('id="mainApp"'),'marketing artifact must not contain authenticated app runtime');

const app=spawnSync(process.execPath,[appScript],{cwd:root,encoding:'utf8'});
assert.equal(app.status,0,'app build failed: '+(app.stderr||app.stdout));
const a=path.join(root,'dist','app');
assert.ok(fs.existsSync(path.join(a,'index.html')),'app build must produce root index.html');
assert.ok(fs.existsSync(path.join(a,'manifest.webmanifest')),'app build must carry its PWA manifest');
assert.ok(fs.existsSync(path.join(a,'assets','financial-correction.js')),'app build must carry financial correction runtime');
assert.ok(!fs.existsSync(path.join(a,'assets','site.js')),'app build must not ship multipage marketing runtime');
assert.ok(!fs.existsSync(path.join(a,'assets','marketing.js')),'app build must not ship legacy marketing runtime');
const appIndex=fs.readFileSync(path.join(a,'index.html'),'utf8');
assert.ok(appIndex.includes('id="mainApp"'),'app artifact must contain product runtime');
assert.ok(!appIndex.includes('function showLanding'),'app artifact must not contain legacy marketing homepage flow');
assert.ok(!appIndex.includes('function marketingNav'),'app artifact must not bundle legacy marketing navigation');
assert.ok(!appIndex.includes('function showMarketingPage'),'app artifact must not bundle legacy marketing page renderer');
assert.ok(!appIndex.includes("else showLanding();"),'logged-out app root must not fall back to marketing');
assert.ok(appIndex.includes("else showAuth('login');"),'logged-out app root must render authentication');
assert.ok(appIndex.includes('https://boekuna.nl/privacy/'),'app legal links must point to public marketing host');
assert.ok(appIndex.includes('https://boekuna.nl/voorwaarden/'),'app terms link must point to public marketing host');

console.log('BOEKUNA split build boundaries: PASS (multipage marketing + isolated product app)');
