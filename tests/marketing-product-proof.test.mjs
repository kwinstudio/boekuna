import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const build=spawnSync(process.execPath,['scripts/build-marketing.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,'Marketing build failed: '+(build.stderr||build.stdout));
const dist=path.join(root,'dist','marketing');
const home=fs.readFileSync(path.join(dist,'index.html'),'utf8');
assert.ok(home.includes('Boekhouden zonder boekhoudtaal.'),'Landing hero copy missing');
assert.ok(home.includes('Zo simpel kan het zijn.'),'Landing closing line missing');
assert.match(home,/<meta name="robots" content="index,follow">/i);
assert.ok([...home.matchAll(/<img\b[^>]*>/gi)].every(m=>/src="\/assets\/site\//.test(m[0])&&/\balt="[^"]+"/.test(m[0])&&/\bwidth="\d+"/.test(m[0])),'Images are first-party, sized and described');
// Every image the landing references ships with the build and stays inside the transfer budget.
for(const m of home.matchAll(/(?:src|srcset)="([^"]+)"/g))for(const part of m[1].split(',')){const url=part.trim().split(' ')[0];if(!url.startsWith('/assets/site/'))continue;const file=path.join(dist,url);assert.ok(fs.existsSync(file),'Referenced image missing from build: '+url);assert.ok(fs.statSync(file).size<120000,'Image too large: '+url)}
assert.ok(home.includes('foto-studio.webp'),'People photo must be on the landing');
// Decision 2026-10-16 (Kwin): the homepage sells the feeling, so no app screens there; the photo is labelled honestly.
assert.equal(home.includes('/assets/site/app-desktop-dashboard'),false,'Homepage shows no app screens');
assert.ok(home.includes('Foto ter illustratie, geen klant van Boekuna'),'Landing photo labeled honestly');
assert.ok(fs.readFileSync(path.join(dist,'functies','index.html'),'utf8').includes('voorbeeldgegevens van een fictief bedrijf'),'App screenshots must be labeled honestly');
assert.equal((home.match(/<script\b(?! type="application\/ld\+json")/gi)||[]).length,1,'Landing uses one first-party script (structured data aside)');
for(const token of ['editorial-hero','project-grid','editorial-pricing','product-marquee'])assert.equal(home.includes(token),false,'Old presentation returned: '+token);
for(const old of ['assets/stories','assets/product','assets/marketing-people','assets/site.css','assets/site.js','assets/editorial-marketing.css','assets/premium-marketing.css','assets/onepage.css','assets/marketing.js','assets/landing-v4.css'])assert.equal(fs.existsSync(path.join(dist,old)),false,'Old public marketing asset returned: '+old);
const css=fs.readFileSync(path.join(dist,'assets','baseline.css'),'utf8');
for(const token of ['#1B1F23','#63D471','#F6F7F8','#8A949C','#FFFFFF'])assert.ok(css.includes(token),'Canonical BOEKUNA token missing '+token);
assert.equal(css.includes('#E7FE55'),false,'Retired lime token returned');
assert.equal(css.includes('#BFE7EC'),false,'Retired cyan token returned');
console.log('Marketing asset QA: PASS (canonical palette, no old site runtime)');
