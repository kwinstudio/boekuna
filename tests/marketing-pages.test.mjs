import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const build=spawnSync(process.execPath,['scripts/build-marketing.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,'Marketing build failed: '+(build.stderr||build.stdout));
const dist=path.join(root,'dist','marketing');

const multipage={
  'index.html':'Je bent ondernemer.',
  'functies/index.html':'Alle functies op een rij.',
  'assistent/index.html':'Een assistent die jouw administratie kent.',
  'scanner/index.html':'Upload je bon.',
  'prijzen/index.html':'Eerlijke prijzen. Begin gratis.',
  'veiligheid/index.html':'Je administratie verdient serieuze beveiliging.',
  'faq/index.html':'Waar kunnen we mee helpen?'
};
for(const [file,needle] of Object.entries(multipage)){
  const full=path.join(dist,file);
  assert.ok(fs.existsSync(full),'Missing multipage route: '+file);
  const html=fs.readFileSync(full,'utf8');
  assert.equal((html.match(/<h1\b/gi)||[]).length,1,file+': must have exactly one h1');
  assert.ok(html.includes(needle),file+': expected headline missing');
  assert.ok(html.includes('/assets/site.css'),file+': multipage stylesheet missing');
  assert.ok(html.includes('/assets/site.js'),file+': multipage runtime missing');
  assert.ok(html.includes('/assets/favicon.svg'),file+': multipage favicon missing');
  assert.ok(html.includes('https://app.boekuna.nl/?login=1'),file+': login handoff missing');
  assert.ok(html.includes('https://app.boekuna.nl/?register=1'),file+': registration handoff missing');
  assert.equal(/accounts\.google\.com|Doorgaan met Google|gmail\.send/i.test(html),false,file+': Google auth/mail OAuth must remain off');
  assert.equal(/<script[^>]+src=["']https?:\/\//i.test(html),false,file+': third-party runtime script forbidden');
  assert.equal(/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(html),false,file+': remote font runtime forbidden');
}

const retained=['privacy','voorwaarden','support','account-verwijderen'];
for(const slug of retained){
  const file=path.join(dist,slug,'index.html');
  assert.ok(fs.existsSync(file),'Missing retained endpoint: '+slug);
  const html=fs.readFileSync(file,'utf8');
  assert.equal((html.match(/<h1\b/gi)||[]).length,1,slug+': retained endpoint must keep exactly one h1');
}

const runtime=fs.readFileSync(path.join(dist,'assets','site.js'),'utf8');
const css=fs.readFileSync(path.join(dist,'assets','site.css'),'utf8');
for(const price of ['€0','€9,95','€19,95'])assert.ok(runtime.includes(price),'Current price missing: '+price);
for(const stale of ['€6,95','€14,95'])assert.equal(runtime.includes(stale),false,'Stale price remains: '+stale);
assert.ok(runtime.includes('https://app.boekuna.nl/?register=1&plan=boekuna'),'Boekuna checkout handoff missing');
assert.ok(runtime.includes('https://app.boekuna.nl/?register=1&plan=pro'),'Unlimited checkout handoff missing');
assert.ok(/Is de persoonlijke assistent al live\?/i.test(runtime),'Assistant availability FAQ missing');
assert.ok(/Nog niet\./i.test(runtime),'Assistant must be explicitly not live');
const assistant=fs.readFileSync(path.join(dist,'assistent','index.html'),'utf8');
assert.ok(/BINNENKORT/i.test(assistant),'Assistant hero must be marked upcoming');
assert.ok(/wordt gebouwd/i.test(assistant),'Assistant copy must not imply production availability');

for(const token of ['--ink:#1B1F23','--green:#63D471','--muted-2:#8A949C'])assert.ok(css.includes(token),'Brand token missing: '+token);
assert.ok(css.includes('/assets/fonts/SpaceGrotesk-Variable.ttf'),'Space Grotesk must be local');
assert.ok(css.includes('/assets/fonts/InterVariable.woff2'),'Inter must be local');
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'),'Reduced-motion handling missing');
assert.ok(fs.existsSync(path.join(dist,'assets','fonts','SpaceGrotesk-Variable.ttf')),'Built Space Grotesk missing');
assert.ok(fs.existsSync(path.join(dist,'assets','fonts','InterVariable.woff2')),'Built Inter missing');
assert.ok(!fs.existsSync(path.join(dist,'manifest.webmanifest')),'Marketing artifact must not ship app PWA manifest');

const sitemap=fs.readFileSync(path.join(dist,'sitemap.xml'),'utf8');
for(const url of [
  'https://boekuna.nl/','https://boekuna.nl/functies/','https://boekuna.nl/assistent/',
  'https://boekuna.nl/scanner/','https://boekuna.nl/prijzen/','https://boekuna.nl/veiligheid/',
  'https://boekuna.nl/faq/','https://boekuna.nl/support/','https://boekuna.nl/privacy/',
  'https://boekuna.nl/voorwaarden/','https://boekuna.nl/account-verwijderen/'
])assert.ok(sitemap.includes(url),'Sitemap missing '+url);

const redirects=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8')).redirects;
const expected={
  '/facturen/':'/functies/',
  '/btw-bank/':'/functies/',
  '/rapportages/':'/functies/',
  '/hoe-het-werkt/':'/functies/',
  '/voor-ondernemers/':'/',
  '/over/':'/',
  '/contact/':'/support/'
};
for(const [source,destination] of Object.entries(expected)){
  const rule=redirects.find(row=>row.source===source);
  assert.ok(rule,'Legacy redirect missing for '+source);
  assert.equal(rule.destination,destination,'Wrong legacy redirect '+source);
  assert.equal(rule.permanent,true,'Legacy redirect must be permanent '+source);
}
for(const live of ['/functies/','/assistent/','/scanner/','/prijzen/','/veiligheid/','/faq/']){
  assert.equal(redirects.some(row=>row.source===live),false,'Real multipage route must not be redirected: '+live);
}

const support=fs.readFileSync(path.join(dist,'support','index.html'),'utf8');
assert.ok(support.includes('id="supportForm"'),'Support form must remain functional');
assert.ok(support.includes('support_requests'),'Support form contract must remain intact');
const deletion=fs.readFileSync(path.join(dist,'account-verwijderen','index.html'),'utf8');
assert.ok(deletion.includes('id="deleteRequestForm"'),'Account deletion form must remain functional');
assert.ok(deletion.includes('pattern="VERWIJDER"'),'Deletion confirmation must remain intact');
const privacy=fs.readFileSync(path.join(dist,'privacy','index.html'),'utf8');
assert.ok(privacy.includes('Row Level Security'),'Privacy account-isolation disclosure must remain');
assert.ok(privacy.includes('OAuth is momenteel niet actief'),'Privacy must state mailbox OAuth is inactive');
const terms=fs.readFileSync(path.join(dist,'voorwaarden','index.html'),'utf8');
for(const required of ['Kwinest','74542893','NL002477565B57','support@boekuna.nl'])assert.ok(terms.includes(required),'Verified business detail missing: '+required);

console.log('BOEKUNA multipage static QA: PASS');
