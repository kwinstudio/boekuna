import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const marketingScript=path.join(root,'scripts','build-marketing.mjs');
const appScript=path.join(root,'scripts','build-app.mjs');
assert.ok(fs.existsSync(marketingScript));
assert.ok(fs.existsSync(appScript));
for(const dir of ['dist/marketing','dist/app'])fs.rmSync(path.join(root,dir),{recursive:true,force:true});

const marketing=spawnSync(process.execPath,[marketingScript],{cwd:root,encoding:'utf8'});
assert.equal(marketing.status,0,'marketing build failed: '+marketing.stderr+'\n'+marketing.stdout);
for(const route of ['','functies','assistent','scanner','prijzen','veiligheid','faq','privacy','support','voorwaarden','account-verwijderen'])assert.ok(fs.existsSync(path.join(root,'dist','marketing',route,'index.html')),'marketing route missing '+(route||'/'));
assert.ok(fs.existsSync(path.join(root,'dist','marketing','assets','site.css')),'new marketing CSS missing');
assert.ok(fs.existsSync(path.join(root,'dist','marketing','assets','site.js')),'new marketing JS missing');
assert.ok(!fs.existsSync(path.join(root,'dist','marketing','manifest.webmanifest')),'marketing must not publish app PWA manifest');
assert.ok(!fs.existsSync(path.join(root,'dist','marketing','site-bundle')),'deployment must not expose source bundle parts');
const marketingIndex=fs.readFileSync(path.join(root,'dist','marketing','index.html'),'utf8');
assert.ok(marketingIndex.includes('Je bent ondernemer.'),'new marketing proposition missing');
assert.ok(marketingIndex.includes('/assets/site.css'),'multipage stylesheet missing');
assert.ok(marketingIndex.includes('https://app.boekuna.nl/?register=1'),'registration CTA must cross to app host');
assert.ok(!marketingIndex.includes('id="mainApp"'),'marketing artifact must not contain authenticated app runtime');
const assistant=fs.readFileSync(path.join(root,'dist','marketing','assistent','index.html'),'utf8');
assert.ok(assistant.includes('Binnenkort'),'assistant page must not imply unreleased assistant is live');

const app=spawnSync(process.execPath,[appScript],{cwd:root,encoding:'utf8'});
assert.equal(app.status,0,'app build failed: '+app.stderr);
assert.ok(fs.existsSync(path.join(root,'dist','app','index.html')),'app root missing');
assert.ok(fs.existsSync(path.join(root,'dist','app','manifest.webmanifest')),'app manifest missing');
assert.ok(fs.existsSync(path.join(root,'dist','app','assets','financial-correction.js')),'app financial runtime missing');
assert.ok(!fs.existsSync(path.join(root,'dist','app','assets','site.js')),'app build must not ship marketing site runtime');
const appIndex=fs.readFileSync(path.join(root,'dist','app','index.html'),'utf8');
assert.ok(appIndex.includes('id="mainApp"'),'app artifact must retain product runtime');
assert.ok(appIndex.includes('https://boekuna.nl/privacy/'),'app legal links must remain on marketing host');

console.log('BOEKUNA split build boundaries: PASS');
