import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const publicDir=path.join(root,'public');
const pages=[
  'account-verwijderen','btw-bank','contact','facturen','faq','functies',
  'hoe-het-werkt','over','prijzen','privacy','rapportages','scanner',
  'support','veiligheid','voor-ondernemers','voorwaarden'
];

for(const slug of pages){
  const file=path.join(publicDir,slug,'index.html');
  assert.ok(fs.existsSync(file),`Missing public page: ${slug}`);
  const html=fs.readFileSync(file,'utf8');
  assert.ok(/<!doctype html>/i.test(html),`${slug}: missing doctype`);
  assert.equal((html.match(/<h1\b/gi)||[]).length,1,`${slug}: must have exactly one h1`);
  assert.ok(html.includes('id="siteHeader"'),`${slug}: shared header missing`);
  assert.ok(html.includes('id="siteFooter"'),`${slug}: shared footer missing`);
  assert.ok(html.includes('/assets/marketing.css'),`${slug}: shared CSS missing`);
  assert.ok(html.includes('/assets/marketing.js'),`${slug}: shared JS missing`);
  assert.ok(html.includes(`https://boekuna.nl/${slug}/`),`${slug}: canonical/public URL metadata missing`);

  for(const m of html.matchAll(/href="(\/[^"#?]*)(?:[?#][^"]*)?"/g)){
    const href=m[1];
    if(href==='/'||href==='/index.html')continue;
    const target=path.join(publicDir,href.replace(/^\//,''));
    const resolved=href.endsWith('/')?path.join(target,'index.html'):target;
    assert.ok(fs.existsSync(resolved),`${slug}: broken internal link ${href}`);
  }
}

const css=fs.readFileSync(path.join(publicDir,'assets','marketing.css'),'utf8');
for(const cls of ['.mk-hero','.mk-section','.mk-card','.mk-banner','.mk-support-shell','.mk-legal-layout']){
  assert.ok(css.includes(cls),`Marketing design system missing ${cls}`);
}
assert.ok(css.includes('@media(max-width:700px)'), 'Marketing pages need mobile breakpoint');
assert.ok(css.includes('.how-hero'), 'Product tour styling must remain present');

const sharedMarketing=fs.readFileSync(path.join(publicDir,'assets','marketing.js'),'utf8');
assert.ok(sharedMarketing.includes('mailto:support@boekuna.nl'),'Public footer must expose the official support email');
assert.ok(sharedMarketing.includes('https://app.boekuna.nl/?login=1'),'Public navigation login must cross to the product host');
assert.ok(!sharedMarketing.includes('href="/?login=1"'),'Public navigation must not keep same-origin product login links');
assert.ok(!sharedMarketing.includes('boekuna-boekhouding.onrender.com'),'Shared marketing runtime must not publish legacy Render metadata');

const publicRoot=fs.readFileSync(path.join(publicDir,'index.html'),'utf8');
assert.ok(publicRoot.includes('https://boekuna.nl/'),'Marketing root must use the public canonical host');
assert.ok(publicRoot.includes('https://app.boekuna.nl/?register=1'),'Marketing root registration must cross to the product host');

for(const publicFile of ['robots.txt','sitemap.xml']){
  const text=fs.readFileSync(path.join(publicDir,publicFile),'utf8');
  assert.ok(!text.includes('boekuna-boekhouding.onrender.com'),publicFile+' must not advertise the legacy Render host');
  assert.ok(text.includes('https://boekuna.nl'),publicFile+' must advertise the public host');
}

const contact=fs.readFileSync(path.join(publicDir,'contact','index.html'),'utf8');
assert.ok(contact.includes('mailto:support@boekuna.nl'),'Contact page must expose the official support email');

const support=fs.readFileSync(path.join(publicDir,'support','index.html'),'utf8');
assert.ok(support.includes('id="supportForm"'),'Support form must remain functional');
assert.ok(support.includes("support_requests"),'Support form must submit to support_requests');
assert.ok(support.includes('mailto:support@boekuna.nl'),'Support page and failure fallback must expose the official support email');

const deletion=fs.readFileSync(path.join(publicDir,'account-verwijderen','index.html'),'utf8');
assert.ok(deletion.includes('id="deleteRequestForm"'),'Account deletion web form must remain functional');
assert.ok(deletion.includes('pattern="VERWIJDER"'),'Deletion request requires explicit confirmation');

const pricing=fs.readFileSync(path.join(publicDir,'prijzen','index.html'),'utf8');
for(const price of ['€0','€6,95','€9,95','€14,95']) assert.ok(pricing.includes(price),`Missing public price ${price}`);
for(const oldPrice of ['€19,95','€29,95']) assert.ok(!pricing.includes(oldPrice),`Retired public marketing price must be removed: ${oldPrice}`);
for(const checks of ['10 slimme documentchecks','40 slimme documentchecks','100 slimme documentchecks','Geen maandlimiet']) assert.ok(pricing.includes(checks),`Pricing limit contract missing: ${checks}`);
assert.ok(pricing.includes('Meest gekozen'),'Boekuna must carry the Meest gekozen label');
assert.ok(pricing.includes('Nieuwe pakketten worden binnenkort beschikbaar'),'Pricing must disclose announced-plan availability');
assert.equal((pricing.match(/href=\"[^\"]*plan=/g)||[]).length,0,'Announced paid plans must not link to checkout/plan routes');
assert.ok((pricing.match(/Binnenkort beschikbaar/g)||[]).length>=3,'Pricing must show availability copy and three non-transactional paid CTAs');
assert.ok(pricing.includes('https://app.boekuna.nl/?register=1'),'Gratis CTA must use the existing free registration flow');
for(const retired of ['Early Access','eerste 100','Founding 100','3 kalendermaanden','90 dagen']){
  assert.ok(!pricing.toLowerCase().includes(retired.toLowerCase()),`Retired First-100 offer must be absent from pricing: ${retired}`);
}

const privacy=fs.readFileSync(path.join(publicDir,'privacy','index.html'),'utf8');
assert.ok(privacy.includes('Row Level Security'),'Privacy page must retain account-isolation disclosure');
assert.ok(privacy.includes('/account-verwijderen/'),'Privacy page must link account deletion');

const terms=fs.readFileSync(path.join(publicDir,'voorwaarden','index.html'),'utf8');
assert.ok(terms.includes('Geen automatische belastingaangifte'),'Terms must retain tax-filing limitation');
for(const retired of ['Early Access','eerste 100','Founding 100']){
  assert.ok(!terms.toLowerCase().includes(retired.toLowerCase()),`Retired First-100 offer must be absent from terms: ${retired}`);
}

console.log(`Marketing page QA: PASS (${pages.length} pages)`);


const marketingCssNative=fs.readFileSync(path.join(publicDir,'assets','marketing.css'),'utf8');
const homepageCssNative=fs.readFileSync(path.join(publicDir,'assets','homepage.css'),'utf8');
for(const [name,text] of [['marketing.css',marketingCssNative],['homepage.css',homepageCssNative]]){
  for(const legacy of ['#08A9C5','#00A8C6','#078DA7','#008FAA','#20292E','#202B33']) assert.ok(!text.toUpperCase().includes(legacy.toUpperCase()),name+' still contains legacy visual token '+legacy);
  assert.equal((text.match(/!important/g)||[]).length,0,name+' must not depend on legacy !important overrides');
  assert.equal((text.match(/(?:linear|radial)-gradient\(/g)||[]).length,0,name+' must not use decorative gradients');
}
assert.ok(marketingCssNative.includes('--brand-primary:#123B3A'),'Marketing CSS must natively define Calm Control primary');
assert.ok(marketingCssNative.includes('--bg-canvas:#F8F7F3'),'Marketing CSS must natively define Calm Control canvas');
assert.ok(sharedMarketing.includes('/assets/boekuna-logo-primary.svg'),'Shared marketing must use the official primary logo');
assert.ok(sharedMarketing.includes('/assets/boekuna-logo-compact.svg'),'Shared marketing must provide the official compact logo');
assert.ok(!sharedMarketing.includes('/assets/boekuna-symbol.svg'),'Shared marketing must not reconstruct the primary lockup from the symbol');
for(const label of ['Product','Voor wie','Prijzen','Ondersteuning']) assert.ok(sharedMarketing.includes(label),'Parity desktop navigation missing '+label);
assert.ok(!sharedMarketing.includes('>☰<'),'Mobile navigation must not use a glyph as its functional icon');
console.log('Calm Control native marketing regression: PASS');

const homePolish=fs.readFileSync(path.join(publicDir,'index.html'),'utf8');
assert.equal((homePolish.match(/class="photo-slot /g)||[]).length,3,'Homepage must contain exactly three reusable photo slots');
assert.ok(homePolish.includes('/assets/boekuna-editorial-workspace-placeholder.svg'),'Homepage must include the original temporary hero media');
for(const label of ['Product','Voor wie','Ondersteuning']) assert.ok(sharedMarketing.includes('<summary>'+label+'</summary>'),'Mobile menu group missing '+label);
const editorialCss=fs.readFileSync(path.join(publicDir,'assets','marketing-editorial.css'),'utf8');
for(const token of ['#FF9F1C','#FFBF69','#FFFFFF','#CBF3F0','#2EC4B6','#111111']) assert.ok(editorialCss.includes(token),'Approved palette token missing '+token);
assert.ok(editorialCss.includes('BOEKUNA_PRICING_POLISH_20261002'),'Pricing/photo-slot release CSS missing');
console.log('Four-tier pricing + photo-slot marketing contract: PASS');
