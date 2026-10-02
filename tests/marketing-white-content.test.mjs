import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const source=path.join(root,'public');
const dist=path.join(root,'dist','marketing');
const build=spawnSync(process.execPath,['scripts/build-marketing.mjs'],{encoding:'utf8'});
assert.equal(build.status,0,build.stderr||build.stdout);

const routeFiles=[
  'index.html','account-verwijderen/index.html','btw-bank/index.html','contact/index.html',
  'facturen/index.html','faq/index.html','functies/index.html','hoe-het-werkt/index.html',
  'over/index.html','prijzen/index.html','privacy/index.html','rapportages/index.html',
  'scanner/index.html','support/index.html','veiligheid/index.html',
  'voor-ondernemers/index.html','voorwaarden/index.html'
];

for(const rel of routeFiles){
  const file=path.join(dist,rel);
  assert.ok(fs.existsSync(file),'Generated marketing route missing: '+rel);
  const html=fs.readFileSync(file,'utf8');
  assert.equal((html.match(/<h1\b/gi)||[]).length,1,rel+': exactly one h1');
  if(rel!=='index.html') assert.ok(/<link rel="canonical" href="https:\/\/boekuna\.nl\//.test(html),rel+': public canonical missing');
  assert.ok(html.includes('/assets/marketing.js?v=20261002premium'),rel+': premium shared runtime must be cache-busted');
  assert.ok(html.includes('/assets/marketing-editorial.css?v=20261002depth'),rel+': depth stylesheet must use the current cache key');
  assert.equal(/revolut/i.test(html),false,rel+': reference brand must not appear in production HTML');
  assert.equal(/<img[^>]+src=["']https?:\/\//i.test(html),false,rel+': content images must remain first-party');
}

const home=fs.readFileSync(path.join(dist,'index.html'),'utf8');
assert.ok(home.includes('Boekhouden zonder boekhoudtaal'),'Homepage proposition missing');
assert.ok(home.includes('Je bent ondernemer.'),'Homepage primary message missing');
assert.ok(home.includes('Geen boekhouder.'),'Homepage primary message second line missing');
assert.ok(home.includes('Uploaden. Herkennen. Controleren. Klaar.'),'Editorial workflow promise missing');
assert.equal((home.match(/class="photo-slot /g)||[]).length,3,'Homepage must expose three reusable photo slots');
assert.ok(home.includes('/assets/boekuna-editorial-workspace-placeholder.svg'),'Original temporary hero media missing');
assert.ok(/width="1200" height="1500"/.test(home),'Hero media intrinsic dimensions missing');
assert.ok(home.includes('prefers-reduced-motion')===false,'Reduced motion belongs in CSS, not inline homepage scripting');

const pricing=fs.readFileSync(path.join(dist,'prijzen','index.html'),'utf8');
for(const value of ['€0','€6,95','€9,95','€14,95']) assert.ok(pricing.includes(value),'Pricing truth missing '+value);
assert.ok(pricing.includes('Meest gekozen'),'Recommended Boekuna label missing');
assert.ok((pricing.match(/Binnenkort beschikbaar/g)||[]).length>=3,'Paid plans must stay non-transactional');
assert.equal(/href=["'][^"']*plan=/.test(pricing),false,'Marketing pricing must not expose paid checkout plan links');
assert.ok(pricing.includes('https://app.boekuna.nl/?register=1'),'Free plan must use registration flow');
assert.equal(/stripe/i.test(pricing),false,'Public pricing must not introduce Stripe checkout wiring');

const css=fs.readFileSync(path.join(dist,'assets','marketing-editorial.css'),'utf8');
for(const token of ['#FFFFFF','#111111','#FF9F1C','#FFBF69','#CBF3F0','#2EC4B6']) assert.ok(css.includes(token),'Approved palette token missing '+token);
assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'),'Reduced-motion override missing');
assert.equal(/(?:linear|radial)-gradient\(/i.test(css),false,'Premium rebuild must not use decorative gradients');
assert.equal(/revolut/i.test(css),false,'Reference brand must not appear in production CSS');

const js=fs.readFileSync(path.join(dist,'assets','marketing.js'),'utf8');
for(const label of ['Functies','Voor ondernemers','Prijzen','Over']) assert.ok(js.includes('>'+label+'</a>'),'Minimal desktop navigation missing '+label);
for(const group of ['Oplossingen','Voor ondernemers','Resources']) assert.ok(js.includes('<summary>'+group+'</summary>'),'Mobile hierarchy missing '+group);
assert.ok(js.includes('https://app.boekuna.nl/?login=1'),'Product login host missing');
assert.ok(js.includes('https://app.boekuna.nl/?register=1'),'Product registration host missing');
assert.equal(/revolut/i.test(js),false,'Reference brand must not appear in production JS');

const sitemap=fs.readFileSync(path.join(dist,'sitemap.xml'),'utf8');
const robots=fs.readFileSync(path.join(dist,'robots.txt'),'utf8');
assert.ok(sitemap.includes('https://boekuna.nl/'),'Sitemap must retain public host');
assert.ok(robots.includes('https://boekuna.nl'),'Robots must retain public sitemap host');
assert.equal(fs.existsSync(path.join(dist,'assets','product')),false,'Marketing artifact must not publish product screenshot library');

console.log('Premium marketing truth/SEO/safety gate: PASS ('+routeFiles.length+' routes; four-plan pricing; original media; no reference-brand production assets)');
