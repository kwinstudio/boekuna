import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const source=path.join(root,'public');
// Old URLs that moved: each builds to a noindex page that forwards to its new home.
const moved={assistent:'/functies/',scanner:'/slim-scannen/',mobiel:'/functies/',contact:'/support/'};
const retired=Object.keys(moved);
const pages=['functies','facturen','bonnen','slim-scannen','btw','bank','rapportages','hoe-het-werkt','zzp','prijzen','veiligheid','faq','over-ons','kennisbank','kennisbank/administratie-bijhouden-zzp','kennisbank/factuur-eisen','kennisbank/btw-aangifte-per-kwartaal','kennisbank/kleineondernemersregeling','kennisbank/bewaarplicht','kennisbank/zakelijke-kosten-en-btw'];
const preserved=['privacy','voorwaarden','support','account-verwijderen'];

const home=fs.readFileSync(path.join(source,'index.html'),'utf8');
assert.match(home,/<meta name="robots" content="index,follow">/i,'Landing page must be indexable');
assert.equal((home.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)||[,''])[1].replace(/<[^>]+>/g,'').trim(),'Boekhouden zonder boekhoudtaal.','Homepage H1 must say Boekuna is bookkeeping software');
assert.ok(home.includes("Online boekhoudprogramma voor zzp'ers"),'Hero must name the product category and audience');
assert.ok(home.includes('Zo simpel kan het zijn.'),'Closing line from Kwin\'s website direction missing');
assert.ok(home.includes('https://app.boekuna.nl/?login=1'),'App login handoff missing');
assert.ok(home.includes('https://app.boekuna.nl/?register=1'),'App registration handoff missing');
assert.ok(home.includes('aria-label="Hoofdnavigatie"'),'Accessible primary navigation missing');
assert.ok(home.includes('class="mobile-nav"'),'Native mobile menu missing');
for(const section of ['id="waarom"','id="voor-wie"','id="functies"','id="cijfers"','id="tarieven"']){
  assert.ok(home.includes(section),'Landing section missing '+section);
}
for(const price of ['€ 0','€ 9,95','€ 99,50','€ 19,95','€ 199,50']){
  assert.ok(home.includes(price),'Verified public plan price missing '+price);
}
for(const oldPlan of ['€ 6,95','€ 14,95','Unlimited','documentchecks per maand']){
  assert.ok(!home.includes(oldPlan),'Stale historic plan price appeared '+oldPlan);
}
// The FAQ lives on /faq/ since the 2026-10-16 homepage redesign.
const faq=fs.readFileSync(path.join(source,'faq','index.html'),'utf8');
for(const q of ['Is Boekuna geschikt voor zzp','Kan ik gratis beginnen?','Heb ik boekhoudkennis nodig?','Hoe werkt het scannen van bonnetjes?','Kan ik facturen maken?','Kan ik mijn gegevens exporteren?','Kan ik Boekuna op mijn telefoon gebruiken?','Hoe veilig zijn mijn gegevens?','Kan ik mijn abonnement opzeggen?'])assert.ok(faq.includes(q),'FAQ question missing: '+q);
assert.equal(home.includes('/assets/site/app-desktop-dashboard'),false,'Homepage sells the feeling, app screens live on the feature pages');
assert.ok(home.includes('Foto ter illustratie, geen klant van Boekuna'),'Stock photos must not pose as customers');
for(const fake of ['aggregateRating','reviewCount','ratingValue','klanten gingen je voor','tevreden klanten'])assert.ok(!home.includes(fake),'No fake social proof: '+fake);
for(const claim of ['automatische bankkoppeling is nu beschikbaar','100% correcte herkenning','direct btw-aangifte indienen']){
  assert.ok(!home.toLowerCase().includes(claim),'Unverified feature claim: '+claim);
}

for(const old of ['editorial-hero','editorial-pricing','project-grid','Uploaden.<br>Controleren. Klaar.']){
  assert.equal(home.includes(old),false,'Old marketing homepage content remains: '+old);
}
assert.ok(home.includes('/assets/baseline.css'),'Marketing baseline stylesheet required');
assert.ok(home.includes('/assets/site/site.css'),'Site stylesheet missing');
assert.equal(home.includes('/assets/landing-v4.css'),false,'Old V4 landing stylesheet still active');
{const features=fs.readFileSync(path.join(source,'functies','index.html'),'utf8');assert.ok(features.includes('/assets/site/app-desktop-dashboard.webp'),'Real app screenshot missing');assert.ok(features.includes('voorbeeldgegevens van een fictief bedrijf'),'App screenshots must be clearly labeled as sample data');}
const scriptsOf=html=>[...html.matchAll(/<script\b[^>]*>/gi)].map(m=>m[0]).filter(t=>t!=='<script type="application/ld+json">');
for(const m of home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g))JSON.parse(m[1]);
assert.deepEqual(scriptsOf(home),['<script src="/assets/site/site.js" defer>'],'Only the deferred first-party site script (plus structured data)');
assert.ok(home.includes('"vatID":"NL002477565B57"'),'Organization structured data must use the real business details');

for(const slug of retired){
  assert.equal(fs.existsSync(path.join(source,slug,'index.html')),false,'Moved marketing route must not have its own source page: '+slug);
}
for(const slug of preserved){
  const file=path.join(source,slug,'index.html');
  assert.ok(fs.existsSync(file),'Preserved public route missing: '+slug);
  const html=fs.readFileSync(file,'utf8');
  assert.ok(html.includes('/assets/baseline.css'),slug+': clean baseline stylesheet missing');
  assert.equal(/\/assets\/(?:site|editorial-marketing|premium-marketing|onepage)\.css/.test(html),false,slug+': old marketing stylesheet still active');
  assert.equal(/\/assets\/(?:site|editorial-marketing|premium-marketing|marketing)\.js/.test(html),false,slug+': old marketing runtime still active');
}
for(const slug of pages){
  const html=fs.readFileSync(path.join(source,slug,'index.html'),'utf8');
  assert.match(html,/<meta name="robots" content="index,follow">/i,slug+': page must be indexable');
  assert.ok(html.includes('<link rel="canonical" href="https://boekuna.nl/'+slug+'/">'),slug+': canonical missing');
  assert.equal((html.match(/<h1\b/g)||[]).length,1,slug+': exactly one h1');
  for(const detail of ['Kwinest','KVK 74542893','NL002477565B57','support@boekuna.nl','href="/privacy/"','href="/voorwaarden/"'])assert.ok(html.includes(detail),slug+': footer business detail missing '+detail);
  assert.deepEqual(scriptsOf(html),['<script src="/assets/site/site.js" defer>'],slug+': only the deferred first-party site script');
  for(const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g))JSON.parse(m[1]);
  assert.ok(html.includes('/assets/fonts/onest-var-latin.woff2'),slug+': self-hosted font preload missing');
  assert.ok(html.includes('og-boekuna.png'),slug+': share image missing');
  if(slug.startsWith('kennisbank/')){assert.ok(html.includes('geen fiscaal advies'),slug+': disclaimer missing');assert.ok(/href="https:\/\/(www\.belastingdienst\.nl|ondernemersplein\.overheid\.nl)/.test(html),slug+': official source missing');assert.equal(html.includes('ondernemersplein.kvk.nl'),false,slug+': outdated Ondernemersplein URL')}
  for(const claim of ['automatische bankkoppeling is nu beschikbaar','100% correcte herkenning','direct btw-aangifte indienen','offertes maken','koppeling met je bank via psd2'])assert.ok(!html.toLowerCase().includes(claim),slug+': unverified feature claim '+claim);
  for(const m of html.matchAll(/<img\b[^>]*>/g))assert.match(m[0],/alt="[^"]+"/,slug+': image without alt text');
}
for(const detail of ['Kwinest','KVK 74542893','NL002477565B57'])assert.ok(home.includes(detail),'Home footer business detail missing '+detail);
const terms=fs.readFileSync(path.join(source,'voorwaarden','index.html'),'utf8');
for(const detail of ['Kwinest','74542893','NL002477565B57','support@boekuna.nl'])assert.ok(terms.includes(detail),'Required business detail missing '+detail);
for(const clause of ['Alleen voor ondernemers','Geen terugbetaling','Verwerkersovereenkomst','Nederlands recht','Rechtbank Rotterdam'])assert.ok(terms.includes(clause),'Terms clause missing: '+clause);

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
assert.equal(sitemap.includes('https://boekuna.nl/</loc>'),true,'Indexable V3 home must be in sitemap');
for(const slug of pages)assert.ok(sitemap.includes('https://boekuna.nl/'+slug+'/'),'Sitemap missing page '+slug);
for(const slug of preserved)assert.ok(sitemap.includes('https://boekuna.nl/'+slug+'/'), 'Sitemap missing preserved route '+slug);
for(const slug of retired)assert.equal(sitemap.includes('https://boekuna.nl/'+slug+'/'),false,'Retired route remains in sitemap '+slug);

// Pages are generated from scripts/marketing-site; the committed HTML must match the generator.
const gen=spawnSync(process.execPath,['scripts/marketing-site/build.mjs','--check'],{cwd:root,encoding:'utf8'});
assert.equal(gen.status,0,'Generated marketing pages are stale: '+(gen.stderr||gen.stdout));
assert.equal(fs.readFileSync(path.join(source,'robots.txt'),'utf8'),'User-agent: *\nAllow: /\n\nSitemap: https://boekuna.nl/sitemap.xml\n','robots.txt must allow crawling and point to the sitemap');
{const titles=new Set(),descriptions=new Set();
for(const slug of ['',...pages,...preserved]){
  const html=fs.readFileSync(path.join(source,slug,'index.html'),'utf8');
  const title=html.match(/<title>([^<]+)<\/title>/)?.[1],description=html.match(/<meta name="description" content="([^"]+)">/)?.[1];
  assert.ok(title&&title.length<=70,(slug||'home')+': title missing or longer than 70 characters: '+title);
  assert.ok(description&&description.length>=70&&description.length<=170,(slug||'home')+': meta description must be 70-170 characters');
  assert.ok(!titles.has(title)&&!descriptions.has(description),(slug||'home')+': duplicate title or description');
  titles.add(title);descriptions.add(description);
  for(const tag of ['property="og:title"','property="og:description"','property="og:url"','name="twitter:card"','lang="nl"'])assert.ok(html.includes(tag),(slug||'home')+': missing '+tag);
  for(const m of html.matchAll(/href="(\/[^"#?]*)"/g)){const target=m[1];if(target.startsWith('/assets/')||target==='/favicon.ico')continue;assert.ok(fs.existsSync(path.join(source,target,'index.html'))||target==='/',(slug||'home')+': internal link to missing page '+target)}
}}

const build=spawnSync(process.execPath,['scripts/build-marketing.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,'Marketing build failed: '+(build.stderr||build.stdout));
const dist=path.join(root,'dist','marketing');

for(const file of ['index.html','404.html','robots.txt','sitemap.xml','assets/baseline.css','favicon.ico','assets/favicon.svg','assets/site/site.css','assets/site/site.js','assets/site/app-desktop-dashboard.webp','assets/site/app-mobile-review.webp','assets/site/foto-studio.webp','assets/site/og-boekuna.png','assets/fonts/inter-var-latin.woff2','assets/boekuna-symbol.svg','assets/boekuna-favicon.svg']){
  assert.ok(fs.existsSync(path.join(dist,file)),'Built baseline missing '+file);
}
for(const f of fs.readdirSync(path.join(dist,'assets/site')).filter(f=>f.endsWith('.webp')))assert.ok(fs.statSync(path.join(dist,'assets/site',f)).size<120000,'Image exceeds marketing transfer budget: '+f);
for(const slug of [...preserved,...pages])assert.ok(fs.existsSync(path.join(dist,slug,'index.html')),'Built route missing '+slug);
for(const slug of retired){
  const file=path.join(dist,slug,'index.html');
  assert.ok(fs.existsSync(file),'Built moved-route page missing '+slug);
  const html=fs.readFileSync(file,'utf8');
  assert.match(html,/<meta name="robots" content="noindex,follow">/i,slug+': moved route must be noindex');
  assert.ok(html.includes('<meta http-equiv="refresh" content="0;url='+moved[slug]+'">'),slug+': moved route must forward to '+moved[slug]);
  assert.ok(html.includes('<link rel="canonical" href="https://boekuna.nl'+moved[slug]+'">'),slug+': moved route canonical must point to its new home');
}
for(const obsolete of [
  'assets/site.css','assets/site.js','assets/editorial-marketing.css','assets/editorial-marketing.js',
  'assets/premium-marketing.css','assets/premium-marketing.js','assets/onepage.css','assets/marketing.js',
  'assets/marketing-people','assets/stories','assets/product','manifest.webmanifest','assets/landing-v4.css','oauth'
]){
  assert.equal(fs.existsSync(path.join(dist,obsolete)),false,'Obsolete/publicly unsafe marketing artifact shipped: '+obsolete);
}
console.log('BOEKUNA marketing static QA: PASS');