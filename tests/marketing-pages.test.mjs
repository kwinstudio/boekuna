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
  assert.ok(html.includes('/assets/onepage.css?v=20261003green1'),slug+': retained endpoint must use current design system');
  assert.ok(html.includes('/assets/boekuna-marketing-favicon.svg'),slug+': retained endpoint must use marketing favicon');
  assert.ok(!html.includes('/assets/marketing.css'),slug+': legacy marketing.css must not remain active');
  assert.ok(!html.includes('/assets/marketing-editorial.css'),slug+': legacy editorial CSS must not remain active');
  assert.ok(!html.includes('/assets/marketing-editorial.js'),slug+': legacy editorial runtime must not remain active');
}
for(const slug of retired)assert.ok(!fs.existsSync(path.join(publicDir,slug,'index.html')),'Retired marketing route source must stay removed: '+slug);

const notFound=fs.readFileSync(path.join(publicDir,'404.html'),'utf8');
assert.ok(notFound.includes('/assets/onepage.css?v=20261003green1'),'404 must use current design system');
assert.ok(notFound.includes('/#product'),'404 product link must return to the one-page product section');
assert.equal(/marketing-editorial|\/assets\/marketing\.css/.test(notFound),false,'404 must not load retired marketing assets');

const home=fs.readFileSync(path.join(publicDir,'index.html'),'utf8');
assert.ok(home.includes('BOEKHOUDEN VOOR ZELFSTANDIGEN'),'Hero eyebrow missing');
assert.ok(home.includes('Je bent ondernemer.<br>Geen boekhouder.'),'One-page proposition missing');
assert.ok(home.includes('Boekuna doet het voorwerk. Jij houdt de controle.'),'Product promise missing');
for(const id of ['product','hoe-het-werkt','inzicht','prijzen','faq'])assert.ok(home.includes('id="'+id+'"'),'Missing one-page anchor '+id);
assert.ok(home.includes('Alles wat je nodig hebt.<br>Niet alles wat mogelijk is.'),'Approved feature headline missing');
assert.ok(home.includes('Weet waar je staat.'),'Approved insight headline missing');
assert.ok(home.includes('Geen verrassingen.<br>Ook niet in de prijs.'),'Approved pricing headline missing');
assert.ok(home.includes('Je administratie kan eenvoudiger.'),'Approved final CTA missing');
assert.ok(home.includes('https://app.boekuna.nl/?login=1'),'Login must cross to product host');
assert.ok(home.includes('https://app.boekuna.nl/?register=1'),'Registration must use free flow');
assert.ok(home.includes('/assets/product/boekuna-dashboard-desktop-960.webp'),'Real dashboard proof missing');
assert.ok(home.includes('/assets/product/boekuna-document-review-desktop-960.webp'),'Real document-review proof missing');
for(const price of ['€0','€9,95','€19,95'])assert.ok(home.includes(price),'Current product price missing: '+price);
for(const stale of ['€6,95','€14,95','Binnenkort beschikbaar'])assert.equal(home.includes(stale),false,'Stale pricing copy remains: '+stale);
assert.ok(/Direct indienen[^<]{0,80}nog niet live/i.test(home),'VAT filing limitation must remain explicit');
assert.ok(/live PSD2-bankkoppeling[^<]{0,80}nog niet actief/i.test(home),'Live-bank limitation must remain explicit');
assert.equal(/accounts\.google\.com|Doorgaan met Google|gmail\.send/i.test(home),false,'Google login/mailbox OAuth must not be reintroduced on homepage');

const css=fs.readFileSync(path.join(publicDir,'assets','onepage.css'),'utf8');
const expectedTokens={
  '--brand-charcoal':'#1B1F23',
  '--brand-green':'#63D471',
  '--surface-soft':'#F6F7F8',
  '--text-muted':'#8A949C',
  '--white':'#FFFFFF'
};
for(const [token,value] of Object.entries(expectedTokens))assert.ok(css.includes(token+':'+value),token+' must equal '+value);
const hex=[...new Set(css.match(/#[0-9A-Fa-f]{6}\b/g)||[])].sort();
assert.deepEqual(hex,Object.values(expectedTokens).sort(),'Brand CSS must centralize every literal six-digit color in the five source-of-truth tokens');
assert.ok(css.includes('font-family:"Space Grotesk"'),'Space Grotesk font face missing');
assert.ok(css.includes('font-family:"Inter"'),'Inter font face missing');
assert.ok(css.includes('/assets/fonts/SpaceGrotesk-Variable.ttf'),'Space Grotesk must be self-hosted by built marketing artifact');
assert.ok(css.includes('/assets/fonts/InterVariable.woff2'),'Inter must be self-hosted by built marketing artifact');
assert.equal((css.match(/(?:linear|radial)-gradient\(/g)||[]).length,0,'One-page design must not use decorative gradients');
assert.equal(/backdrop-filter/i.test(css),false,'One-page design must not use glassmorphism backdrop filters');
assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'),'Reduced-motion handling missing');

const redirects=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8')).redirects;
const expected={
  '/functies/':'/#product','/facturen/':'/#product','/scanner/':'/#product','/btw-bank/':'/#product','/rapportages/':'/#product',
  '/hoe-het-werkt/':'/#hoe-het-werkt','/voor-ondernemers/':'/#product','/prijzen/':'/#prijzen','/faq/':'/#faq',
  '/over/':'/#product','/contact/':'/support/','/veiligheid/':'/privacy/'
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
assert.ok(privacy.includes('OAuth is momenteel niet actief'),'Privacy must state mailbox OAuth is inactive');
assert.equal(/gmail\.send|Google API Services User Data Policy/i.test(privacy),false,'Retired Gmail OAuth disclosure must be removed');
const terms=fs.readFileSync(path.join(publicDir,'voorwaarden','index.html'),'utf8');
assert.ok(terms.includes('Geen automatische belastingaangifte'),'Tax-filing limitation must remain in terms');
for(const required of ['Kwinest','Arica 139, 2903 PD Capelle aan den IJssel','74542893','NL002477565B57','support@boekuna.nl'])assert.ok(terms.includes(required),'Verified business detail missing from terms: '+required);
assert.ok(home.includes('/voorwaarden/#bedrijfsgegevens'),'Homepage footer must link to public business details');

for(const file of ['index.html','privacy/index.html','voorwaarden/index.html','support/index.html','account-verwijderen/index.html']){
  const html=fs.readFileSync(path.join(publicDir,file),'utf8');
  assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(html),file+': runtime Google Fonts forbidden');
  assert.ok(!/<script[^>]+src=["']https?:\/\//i.test(html),file+': third-party runtime script forbidden');
}

const build=spawnSync(process.execPath,['scripts/build-marketing.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,'Marketing build failed: '+build.stderr);
const dist=path.join(root,'dist','marketing');
for(const [source,destination] of Object.entries(expected)){
  const slug=source.replaceAll('/','');
  const file=path.join(dist,slug,'index.html');
  assert.ok(fs.existsSync(file),'Generated artifact must shadow retired route '+source);
  const redirect=fs.readFileSync(file,'utf8');
  assert.ok(redirect.includes('location.replace('+JSON.stringify(destination)+')'),'Generated runtime redirect missing for '+source);
  assert.ok(redirect.includes('content="0;url='+destination+'"'),'Generated no-JS redirect missing for '+source);
  assert.ok(redirect.includes('name="robots" content="noindex,follow"'),'Retired route must be noindex: '+source);
}
for(const font of ['SpaceGrotesk-Variable.ttf','InterVariable.woff2'])assert.ok(fs.existsSync(path.join(dist,'assets','fonts',font)),'Generated artifact missing local font '+font);
assert.ok(!fs.existsSync(path.join(dist,'manifest.webmanifest')),'Marketing artifact must not ship app PWA manifest');
for(const legacy of ['marketing.css','marketing-editorial.css','marketing-editorial.js'])assert.ok(!fs.existsSync(path.join(dist,'assets',legacy)),'Generated artifact must not ship '+legacy);

console.log('BOEKUNA one-page static QA: PASS');
