import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const marketingScript=path.join(root,'scripts','build-marketing.mjs');
const appScript=path.join(root,'scripts','build-app.mjs');

assert.ok(fs.existsSync(marketingScript),'marketing must have an explicit independent build script');
assert.ok(fs.existsSync(appScript),'product app must have an explicit independent build script');
assert.ok(fs.existsSync(path.join(root,'public','index.html')),'marketing must own a standalone public/index.html');

for(const dir of ['dist/marketing','dist/app']) fs.rmSync(path.join(root,dir),{recursive:true,force:true});

const marketing=spawnSync(process.execPath,[marketingScript],{cwd:root,encoding:'utf8'});
assert.equal(marketing.status,0,'marketing build failed: '+marketing.stderr);
assert.ok(fs.existsSync(path.join(root,'dist','marketing','index.html')),'marketing build must produce root index.html');
assert.ok(fs.existsSync(path.join(root,'dist','marketing','privacy','index.html')),'marketing build must retain privacy');
assert.ok(fs.existsSync(path.join(root,'dist','marketing','support','index.html')),'marketing build must retain support');
assert.ok(fs.existsSync(path.join(root,'dist','marketing','account-verwijderen','index.html')),'marketing build must retain account deletion');
assert.ok(!fs.existsSync(path.join(root,'dist','marketing','manifest.webmanifest')),'marketing build must not publish the app-only PWA manifest');
const marketingIndex=fs.readFileSync(path.join(root,'dist','marketing','index.html'),'utf8');
assert.ok(marketingIndex.includes('id="siteHeader"'),'marketing root must use the public marketing shell');
assert.ok(marketingIndex.includes('class="kz-hero"'),'marketing root must preserve the characterized pre-split homepage content');
assert.ok(marketingIndex.includes('Je bent ondernemer.<span>Geen boekhouder.</span>'),'marketing root must preserve the characterized hero message');
assert.ok(marketingIndex.includes('https://app.boekuna.nl/?register=1'),'marketing registration CTA must cross to the product host');
assert.ok(fs.existsSync(path.join(root,'dist','marketing','assets','homepage.css')),'marketing build must carry extracted homepage styles');
assert.ok(fs.existsSync(path.join(root,'dist','marketing','assets','homepage.js')),'marketing build must carry extracted homepage interactions');
assert.ok(!marketingIndex.includes('id="mainApp"'),'marketing artifact must not contain authenticated app runtime');

const app=spawnSync(process.execPath,[appScript],{cwd:root,encoding:'utf8'});
assert.equal(app.status,0,'app build failed: '+app.stderr);
assert.ok(fs.existsSync(path.join(root,'dist','app','index.html')),'app build must produce root index.html');
assert.ok(fs.existsSync(path.join(root,'dist','app','manifest.webmanifest')),'app build must carry its PWA manifest');
assert.ok(fs.existsSync(path.join(root,'dist','app','assets','financial-correction.js')),'app build must carry financial correction runtime');
assert.ok(!fs.existsSync(path.join(root,'dist','app','assets','marketing.js')),'app build must not ship marketing runtime assets');
assert.ok(!fs.existsSync(path.join(root,'dist','app','assets','homepage.js')),'app build must not ship marketing homepage runtime');
assert.ok(!fs.existsSync(path.join(root,'dist','app','assets','marketing.css')),'app build must not ship marketing stylesheet');
const appIndex=fs.readFileSync(path.join(root,'dist','app','index.html'),'utf8');
assert.ok(appIndex.includes('id="mainApp"'),'app artifact must contain product runtime');
assert.ok(!appIndex.includes('function showLanding'),'app artifact must not contain the legacy marketing homepage flow');
assert.ok(!appIndex.includes('function marketingNav'),'app artifact must not bundle the legacy marketing navigation runtime');
assert.ok(!appIndex.includes('function showMarketingPage'),'app artifact must not bundle the legacy marketing page renderer');
assert.ok(!appIndex.includes("else showLanding();"),'logged-out app root must not fall back to marketing');
assert.ok(appIndex.includes("else showAuth('login');"),'logged-out app root must render authentication');
assert.ok(appIndex.includes('https://boekuna.nl/privacy/'),'app auth/legal links must point to the public marketing host');
assert.ok(appIndex.includes('https://boekuna.nl/voorwaarden/'),'app terms link must point to the public marketing host');

console.log('BOEKUNA split build boundaries: PASS');
