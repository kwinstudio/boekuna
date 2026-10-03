import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const publicDir=path.join(root,'public');
const retained=['privacy','voorwaarden','support','account-verwijderen'];
const retired=['functies','facturen','scanner','btw-bank','rapportages','hoe-het-werkt','voor-ondernemers','prijzen','faq','over','contact','veiligheid'];

for(const slug of retained){
  const file=path.join(publicDir,slug,'index.html');
  assert.ok(fs.existsSync(file),'Missing retained endpoint: '+slug);
  const html=fs.readFileSync(file,'utf8');
  assert.equal((html.match(/<h1\b/gi)||[]).length,1,slug+': must retain exactly one h1');
  assert.ok(html.includes('id="siteHeader"'),slug+': shared header mount missing');
  assert.ok(html.includes('id="siteFooter"'),slug+': shared footer mount missing');
  assert.ok(html.includes('/assets/onepage.css?v=20261003a'),slug+': retained endpoint must use current chrome layer');
  assert.ok(html.includes('/assets/boekuna-app-icon-180.png'),slug+': Apple Touch Icon must use official 180px PNG');
}
for(const slug of retired)assert.ok(!fs.existsSync(path.join(publicDir,slug,'index.html')),'Retired marketing route source must be removed: '+slug);

const home=fs.readFileSync(path.join(publicDir,'index.html'),'utf8');
assert.ok(home.includes('Je bent ondernemer.<br>Geen boekhouder.'),'One-page proposition missing');
for(const id of ['product','hoe-het-werkt','waarom','prijzen','faq','veiligheid','contact'])assert.ok(home.includes('id="'+id+'"'),'Missing one-page anchor '+id);
assert.ok(home.includes('https://app.boekuna.nl/?login=1'),'Login must cross to product host');
assert.ok(home.includes('https://app.boekuna.nl/?register=1'),'Registration must use existing free flow');
assert.ok(home.includes('/assets/boekuna-app-icon-180.png'),'Homepage Apple Touch Icon must use official PNG');
assert.ok(!home.includes('/assets/homepage.'),'Homepage must not load obsolete homepage runtime');
assert.ok(!home.includes('/assets/marketing-editorial.'),'Homepage must not load legacy editorial runtime');
assert.ok(!home.includes('/assets/product/'),'Homepage must not use product screenshots');
for(const price of ['€0','€6,95','€9,95','€14,95'])assert.ok(home.includes(price),'Current public price missing: '+price);
assert.equal((home.match(/Binnenkort beschikbaar/g)||[]).length,3,'Exactly three paid packages must remain announced/non-transactional');
assert.ok(/Direct indienen[^<]{0,80}nog niet live/i.test(home),'VAT filing limitation must remain explicit');
assert.ok(/live PSD2-bankkoppeling[^<]{0,80}nog niet actief/i.test(home),'Live-bank limitation must remain explicit');
assert.equal(/href=["'][^"']*plan=/.test(home),false,'One-page marketing must not expose paid checkout plan routes');
assert.equal(/stripe/i.test(home),false,'Homepage must not add Stripe checkout wiring');

const css=fs.readFileSync(path.join(publicDir,'assets','onepage.css'),'utf8');
for(const token of ['--color-brand:','--color-accent:','--color-accent-soft:','--color-background:','--color-surface:','--color-text:','--color-muted:','--color-border:','--color-success:'])assert.ok(css.includes(token),'Central design token missing '+token);
assert.equal((css.match(/(?:linear|radial)-gradient\(/g)||[]).length,0,'One-page design must not use decorative gradients');
assert.ok(!fs.existsSync(path.join(publicDir,'assets','homepage.css')),'Obsolete homepage.css must be removed');
assert.ok(!fs.existsSync(path.join(publicDir,'assets','homepage.js')),'Obsolete homepage.js must be removed');

const redirects=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8')).redirects;
const expected={
  '/functies/':'/#product','/facturen/':'/#product','/scanner/':'/#product','/btw-bank/':'/#product','/rapportages/':'/#product',
  '/hoe-het-werkt/':'/#hoe-het-werkt','/voor-ondernemers/':'/#waarom','/prijzen/':'/#prijzen','/faq/':'/#faq',
  '/over/':'/#waarom','/contact/':'/#contact','/veiligheid/':'/#veiligheid'
};
for(const [source,destination] of Object.entries(expected)){
  const rule=redirects.find(row=>row.source===source);
  assert.ok(rule,'Redirect missing for '+source);
  assert.equal(rule.destination,destination,'Wrong redirect for '+source);
  assert.equal(rule.permanent,true,'Old route redirect must be permanent: '+source);
}

const sitemap=fs.readFileSync(path.join(publicDir,'sitemap.xml'),'utf8');
for(const url of ['https://boekuna.nl/','https://boekuna.nl/privacy/','https://boekuna.nl/voorwaarden/','https://boekuna.nl/support/','https://boekuna.nl/account-verwijderen/'])assert.ok(sitemap.includes(url),'Sitemap missing retained URL '+url);
for(const slug of retired)assert.ok(!sitemap.includes('https://boekuna.nl/'+slug+'/'),'Sitemap must not advertise retired route '+slug);

const support=fs.readFileSync(path.join(publicDir,'support','index.html'),'utf8');
assert.ok(support.includes('id="supportForm"'),'Support form must remain functional');
assert.ok(support.includes('support_requests'),'Support form contract must remain intact');
const deletion=fs.readFileSync(path.join(publicDir,'account-verwijderen','index.html'),'utf8');
assert.ok(deletion.includes('id="deleteRequestForm"'),'Account deletion form must remain functional');
assert.ok(deletion.includes('pattern="VERWIJDER"'),'Deletion confirmation contract must remain intact');
const privacy=fs.readFileSync(path.join(publicDir,'privacy','index.html'),'utf8');
assert.ok(privacy.includes('Row Level Security'),'Privacy account-isolation disclosure must remain');
const terms=fs.readFileSync(path.join(publicDir,'voorwaarden','index.html'),'utf8');
assert.ok(terms.includes('Geen automatische belastingaangifte'),'Tax-filing limitation must remain in terms');

for(const file of ['index.html','privacy/index.html','voorwaarden/index.html','support/index.html','account-verwijderen/index.html']){
  const html=fs.readFileSync(path.join(publicDir,file),'utf8');
  assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(html),file+': external Google Fonts forbidden');
  assert.ok(!/<script[^>]+src=["']https?:\/\//i.test(html),file+': new third-party script forbidden');
}

const build=spawnSync(process.execPath,['scripts/build-marketing.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,'Marketing build failed: '+build.stderr);
const dist=path.join(root,'dist','marketing');
for(const slug of retired)assert.ok(!fs.existsSync(path.join(dist,slug,'index.html')),'Generated artifact must not contain retired route '+slug);
assert.ok(fs.existsSync(path.join(dist,'assets','onepage.css')),'Generated artifact missing onepage.css');
assert.ok(!fs.existsSync(path.join(dist,'manifest.webmanifest')),'Marketing artifact must not ship app PWA manifest');

console.log('BOEKUNA one-page static QA: PASS');
