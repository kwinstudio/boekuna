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
const distMarketing=path.join(root,'dist','marketing');
for(const route of ['','privacy','support','voorwaarden','account-verwijderen','functies','assistent','scanner','prijzen','veiligheid','faq','facturen','bonnen','btw','bank','rapportages','mobiel','hoe-het-werkt','over-ons']){
  assert.ok(fs.existsSync(path.join(distMarketing,route,'index.html')),'marketing route missing '+(route||'/'));
}
assert.ok(fs.existsSync(path.join(distMarketing,'assets','baseline.css')),'clean baseline stylesheet missing');
for(const old of ['site.css','site.js','editorial-marketing.css','editorial-marketing.js','premium-marketing.css','premium-marketing.js','onepage.css','marketing.js']){
  assert.ok(!fs.existsSync(path.join(distMarketing,'assets',old)),'retired marketing runtime shipped: '+old);
}
for(const oldDir of ['marketing-people','stories','product'])assert.ok(!fs.existsSync(path.join(distMarketing,'assets',oldDir)),'retired marketing media shipped: '+oldDir);
assert.ok(!fs.existsSync(path.join(distMarketing,'manifest.webmanifest')),'marketing must not publish app PWA manifest');
const marketingIndex=fs.readFileSync(path.join(distMarketing,'index.html'),'utf8');
assert.ok(marketingIndex.includes('Zo simpel kan het zijn'),'V3 public landing missing');
assert.ok(marketingIndex.includes('index,follow'),'V3 public landing should be indexable');
assert.ok(marketingIndex.includes('https://app.boekuna.nl/?login=1'),'login must cross to isolated app host');
assert.ok(!marketingIndex.includes('id="mainApp"'),'marketing artifact must not contain authenticated app runtime');

const app=spawnSync(process.execPath,[appScript],{cwd:root,encoding:'utf8'});
assert.equal(app.status,0,'app build failed: '+app.stderr);
const distApp=path.join(root,'dist','app');
assert.ok(fs.existsSync(path.join(distApp,'index.html')),'app root missing');
assert.ok(fs.existsSync(path.join(distApp,'manifest.webmanifest')),'app manifest missing');
assert.ok(fs.existsSync(path.join(distApp,'assets','financial-correction.js')),'app financial runtime missing');
assert.ok(!fs.existsSync(path.join(distApp,'assets','baseline.css')),'app build must not ship marketing clean-baseline CSS');
const appIndex=fs.readFileSync(path.join(distApp,'index.html'),'utf8');
assert.ok(appIndex.includes('id="mainApp"'),'app artifact must retain product runtime');
assert.ok(appIndex.includes('https://boekuna.nl/privacy/'),'app legal links must remain on public host');

console.log('BOEKUNA split build boundaries: PASS');
