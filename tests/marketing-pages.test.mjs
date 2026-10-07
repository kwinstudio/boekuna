import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const source=path.join(root,'public');
const retired=['functies','assistent','scanner','prijzen','veiligheid','faq','facturen','bonnen','btw','bank','rapportages','mobiel','hoe-het-werkt'];
const preserved=['privacy','voorwaarden','support','account-verwijderen'];

const home=fs.readFileSync(path.join(source,'index.html'),'utf8');
assert.match(home,/<meta name="robots" content="noindex,follow">/i,'Holding page must be noindex,follow');
assert.ok(home.includes('Nieuwe website in ontwikkeling.'),'Holding copy missing');
assert.ok(home.includes('https://app.boekuna.nl/?login=1'),'Holding login handoff missing');
for(const old of ['editorial-hero','editorial-pricing','project-grid','audience-grid','Uploaden.<br>Controleren. Klaar.']){
  assert.equal(home.includes(old),false,'Old marketing homepage content remains: '+old);
}
assert.ok(home.includes('/assets/baseline.css'),'Holding page must use only the clean baseline stylesheet');
assert.equal(/<script\b/i.test(home),false,'Holding page must not ship marketing runtime JavaScript');

for(const slug of retired){
  assert.equal(fs.existsSync(path.join(source,slug,'index.html')),false,'Retired marketing source page must be removed: '+slug);
}
for(const slug of preserved){
  const file=path.join(source,slug,'index.html');
  assert.ok(fs.existsSync(file),'Preserved public route missing: '+slug);
  const html=fs.readFileSync(file,'utf8');
  assert.ok(html.includes('/assets/baseline.css'),slug+': clean baseline stylesheet missing');
  assert.equal(/\/assets\/(?:site|editorial-marketing|premium-marketing|onepage)\.css/.test(html),false,slug+': old marketing stylesheet still active');
  assert.equal(/\/assets\/(?:site|editorial-marketing|premium-marketing|marketing)\.js/.test(html),false,slug+': old marketing runtime still active');
}
const terms=fs.readFileSync(path.join(source,'voorwaarden','index.html'),'utf8');
for(const detail of ['Kwinest','74542893','NL002477565B57','support@boekuna.nl'])assert.ok(terms.includes(detail),'Required business detail missing '+detail);

const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
assert.ok(!Array.isArray(vercel.redirects)||vercel.redirects.length===0,'Retired permanent marketing redirects must be removed');
const securityHeaders=(vercel.headers||[]).flatMap(rule=>rule.headers||[]);
for(const key of ['X-Content-Type-Options','Referrer-Policy','X-Frame-Options','Permissions-Policy']){
  assert.ok(securityHeaders.some(header=>header.key===key), 'Security header missing: '+key);
}
const support=fs.readFileSync(path.join(source,'support','index.html'),'utf8');
assert.ok(support.includes('id="supportForm"'),'Support form must remain operational');
assert.ok(support.includes('/rest/v1/support_requests'),'Support storage endpoint must remain present');
const deletion=fs.readFileSync(path.join(source,'account-verwijderen','index.html'),'utf8');
assert.ok(deletion.includes('id="deleteRequestForm"'),'Account deletion request form must remain operational');
assert.ok(deletion.includes('/rest/v1/support_requests'),'Account deletion request endpoint must remain present');

const sitemap=fs.readFileSync(path.join(source,'sitemap.xml'),'utf8');
assert.equal(sitemap.includes('https://boekuna.nl/</loc>'),false,'Noindex holding root must not be in sitemap');
for(const slug of preserved)assert.ok(sitemap.includes('https://boekuna.nl/'+slug+'/'), 'Sitemap missing preserved route '+slug);
for(const slug of retired)assert.equal(sitemap.includes('https://boekuna.nl/'+slug+'/'),false,'Retired route remains in sitemap '+slug);

const build=spawnSync(process.execPath,['scripts/build-marketing.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,'Marketing build failed: '+(build.stderr||build.stdout));
const dist=path.join(root,'dist','marketing');

for(const file of ['index.html','404.html','robots.txt','sitemap.xml','assets/baseline.css','assets/favicon.svg']){
  assert.ok(fs.existsSync(path.join(dist,file)),'Built baseline missing '+file);
}
for(const slug of preserved)assert.ok(fs.existsSync(path.join(dist,slug,'index.html')),'Built preserved route missing '+slug);
for(const slug of retired){
  const file=path.join(dist,slug,'index.html');
  assert.ok(fs.existsSync(file),'Built retired route holding missing '+slug);
  const html=fs.readFileSync(file,'utf8');
  assert.match(html,/<meta name="robots" content="noindex,follow">/i,slug+': retired route must be noindex');
  assert.ok(html.includes('Nieuwe website in ontwikkeling.'),slug+': retired route must use holding response');
}
for(const obsolete of [
  'assets/site.css','assets/site.js','assets/editorial-marketing.css','assets/editorial-marketing.js',
  'assets/premium-marketing.css','assets/premium-marketing.js','assets/onepage.css','assets/marketing.js',
  'assets/marketing-people','assets/stories','assets/product','manifest.webmanifest'
]){
  assert.equal(fs.existsSync(path.join(dist,obsolete)),false,'Obsolete/publicly unsafe marketing artifact shipped: '+obsolete);
}
console.log('BOEKUNA marketing clean-slate static QA: PASS');