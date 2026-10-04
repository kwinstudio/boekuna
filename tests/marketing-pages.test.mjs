import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const src=path.join(root,'public');
const pages=[
  ['index.html','https://boekuna.nl/'],
  ['functies/index.html','https://boekuna.nl/functies/'],
  ['assistent/index.html','https://boekuna.nl/assistent/'],
  ['scanner/index.html','https://boekuna.nl/scanner/'],
  ['prijzen/index.html','https://boekuna.nl/prijzen/'],
  ['veiligheid/index.html','https://boekuna.nl/veiligheid/'],
  ['faq/index.html','https://boekuna.nl/faq/']
];

for(const [file,canonical] of pages){
  const full=path.join(src,file);
  assert.ok(fs.existsSync(full),'Missing multipage source '+file);
  const html=fs.readFileSync(full,'utf8');
  assert.equal((html.match(/<h1\b/gi)||[]).length,1,file+': exactly one h1 required');
  assert.ok(html.includes('<link rel="canonical" href="'+canonical+'">'),file+': canonical missing');
  assert.ok(html.includes('/assets/site.css'),file+': shared site.css missing');
  assert.ok(html.includes('/assets/site.js'),file+': shared site.js missing');
  assert.ok(html.includes('/assets/favicon.svg'),file+': favicon missing');
  assert.ok(html.includes('https://app.boekuna.nl/?'),file+': app handoff missing');
  assert.equal(/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(html),false,file+': remote fonts forbidden');
  assert.equal(/<script[^>]+src=["']https?:\/\//i.test(html),false,file+': remote scripts forbidden');
  assert.equal(/accounts\.google\.com|Doorgaan met Google|gmail\.send/i.test(html),false,file+': Google auth/mailbox OAuth forbidden');
}

const home=fs.readFileSync(path.join(src,'index.html'),'utf8');
for(const text of ['Je bent ondernemer.','Geen boekhouder.','Probeer Boekuna gratis','Bonnetje erin. Boekuna doet het voorwerk.']){
  assert.ok(home.includes(text),'Homepage copy missing: '+text);
}
for(const target of ['/#facturen','/#bonnen','/#btw','/#bank','/#rapportages']){
  assert.ok(home.includes('href="'+target+'"'),'Homepage feature anchor missing '+target);
}
assert.ok(home.includes('Binnenkort: je eigen assistent.'),'Upcoming assistant status must be explicit on homepage');

const assistant=fs.readFileSync(path.join(src,'assistent','index.html'),'utf8');
assert.ok(assistant.includes('Binnenkort'),'Assistant page must be clearly marked upcoming until product release');

const pricing=fs.readFileSync(path.join(src,'prijzen','index.html'),'utf8');
const js=fs.readFileSync(path.join(src,'assets','site.js'),'utf8');
for(const price of ['€0','€9,95','€19,95'])assert.ok(pricing.includes(price)||js.includes(price),'Current pricing missing '+price);
assert.equal(/€6,95|€14,95/.test(pricing+js),false,'Stale pricing must not return');
assert.ok(/btw-aangifte direct indienen[\s\S]{0,220}Nog niet/i.test(js),'Direct VAT filing limitation must remain');
assert.ok(/automatische bankkoppeling[\s\S]{0,220}Nog niet/i.test(js),'Live bank connection limitation must remain');
assert.equal(/accounts\.google\.com|Doorgaan met Google|gmail\.send/i.test(js),false,'Google auth/mailbox OAuth must remain absent');

const css=fs.readFileSync(path.join(src,'assets','site.css'),'utf8');
assert.ok(css.includes("font-family:'Space Grotesk'"),'Space Grotesk font face missing');
assert.ok(css.includes("font-family:'Inter'"),'Inter font face missing');
assert.ok(css.includes('/assets/fonts/SpaceGrotesk-Variable.ttf'),'Built Space Grotesk reference missing');
assert.ok(css.includes('/assets/fonts/InterVariable.woff2'),'Built Inter reference missing');
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'),'Reduced-motion handling missing');

for(const legal of ['privacy/index.html','voorwaarden/index.html','support/index.html','account-verwijderen/index.html']){
  assert.ok(fs.existsSync(path.join(src,legal)),'Required existing legal/support route missing '+legal);
}
const terms=fs.readFileSync(path.join(src,'voorwaarden','index.html'),'utf8');
for(const detail of ['Kwinest','74542893','NL002477565B57','support@boekuna.nl'])assert.ok(terms.includes(detail),'Verified business detail missing '+detail);

const sitemap=fs.readFileSync(path.join(src,'sitemap.xml'),'utf8');
for(const [,url] of pages)assert.ok(sitemap.includes(url),'Sitemap missing '+url);

const build=spawnSync(process.execPath,['scripts/build-marketing.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,'Marketing build failed: '+(build.stderr||build.stdout));
const dist=path.join(root,'dist','marketing');
for(const [file] of pages)assert.ok(fs.existsSync(path.join(dist,file)),'Built page missing '+file);
for(const legal of ['privacy/index.html','voorwaarden/index.html','support/index.html','account-verwijderen/index.html'])assert.ok(fs.existsSync(path.join(dist,legal)),'Built legal/support route missing '+legal);
for(const font of ['SpaceGrotesk-Variable.ttf','InterVariable.woff2'])assert.ok(fs.existsSync(path.join(dist,'assets','fonts',font)),'Built font missing '+font);
assert.ok(!fs.existsSync(path.join(dist,'manifest.webmanifest')),'Marketing artifact must not ship app PWA manifest');

for(const live of ['functies','assistent','scanner','prijzen','veiligheid','faq']){
  const built=fs.readFileSync(path.join(dist,live,'index.html'),'utf8');
  assert.ok(built.includes('/assets/site.css'),live+': live multipage route was overwritten by redirect');
}
for(const retired of ['facturen','btw-bank','rapportages','hoe-het-werkt','voor-ondernemers','over','contact']){
  const built=fs.readFileSync(path.join(dist,retired,'index.html'),'utf8');
  assert.ok(built.includes('location.replace('),retired+': legacy redirect missing');
}

console.log('BOEKUNA multipage static QA: PASS');
