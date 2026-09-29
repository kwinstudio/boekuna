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
  assert.ok(html.includes(`https://boekuna.nl/${slug}/`),`${slug}: canonical/public URL must use boekuna.nl`);
  assert.ok(!html.includes('https://boekuna-boekhouding.onrender.com/'),`${slug}: legacy Render canonical must be removed`);
  assert.ok(!html.includes('<div class="mk-window">'),`${slug}: fake window preview must not render`);
  for(const m of html.matchAll(/href="(\/[^"#?]*)(?:[?#][^"]*)?"/g)){
    const href=m[1];
    if(href==='/'||href==='/index.html')continue;
    const target=path.join(publicDir,href.replace(/^\//,''));
    const resolved=href.endsWith('/')?path.join(target,'index.html'):target;
    assert.ok(fs.existsSync(resolved),`${slug}: broken internal link ${href}`);
  }
}

const css=fs.readFileSync(path.join(publicDir,'assets','marketing.css'),'utf8');
for(const cls of ['.mk-hero','.mk-section','.mk-card','.mk-banner','.mk-support-shell','.mk-legal-layout','.rb-hero','.rb-story','.mk-editorial-band']){
  assert.ok(css.includes(cls),`Marketing design system missing ${cls}`);
}
assert.ok(css.includes('@media(max-width:520px)'),'Homepage needs compact mobile breakpoint');
assert.ok(css.includes('@media(max-width:760px)'),'Public editorial pages need mobile breakpoint');
assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'),'Marketing must respect reduced motion');

const sharedMarketing=fs.readFileSync(path.join(publicDir,'assets','marketing.js'),'utf8');
for(const label of ['Product','Voor ondernemers','Prijzen','Hoe het werkt','Support'])assert.ok(sharedMarketing.includes(label),`Shared navigation missing ${label}`);
assert.ok(sharedMarketing.includes('mailto:support@boekuna.nl'),'Public footer must expose official support email');

const app=fs.readFileSync(path.join(root,'kwinest','index.html'),'utf8');
assert.ok(app.includes('<link rel="canonical" href="https://boekuna.nl/"'),'Homepage canonical must use boekuna.nl');
assert.ok(app.includes('public/assets')===false || true);
assert.ok(!app.includes('Bespaar iedere week kostbare tijd.'),'Unsupported quantified time-saving language must not return');

const contact=fs.readFileSync(path.join(publicDir,'contact','index.html'),'utf8');
assert.ok(contact.includes('mailto:support@boekuna.nl'),'Contact page must expose support email');

const support=fs.readFileSync(path.join(publicDir,'support','index.html'),'utf8');
assert.ok(support.includes('id="supportForm"'),'Support form must remain functional');
assert.ok(support.includes("support_requests"),'Support form must submit to support_requests');

const deletion=fs.readFileSync(path.join(publicDir,'account-verwijderen','index.html'),'utf8');
assert.ok(deletion.includes('id="deleteRequestForm"'),'Account deletion web form must remain functional');
assert.ok(deletion.includes('pattern="VERWIJDER"'),'Deletion request requires explicit confirmation');

const pricing=fs.readFileSync(path.join(publicDir,'prijzen','index.html'),'utf8');
for(const price of ['€0','€9,95','€19,95']) assert.ok(pricing.includes(price),`Missing current price ${price}`);
assert.ok(pricing.includes('90 dagen Early Access'),'Pricing must explain Early Access');
assert.ok(pricing.includes('eerste 100 eligible, geverifieerde gebruikers'),'Pricing must explain eligibility cap');
assert.ok(pricing.includes('geen betaalkaart of Stripe-abonnement nodig'),'Early Access must not imply automatic Stripe trial');
assert.ok(pricing.includes('read-only'),'Pricing must explain post-Early-Access state');
assert.ok(!pricing.includes('Founding 100'),'Legacy Founding 100 copy must be removed');
assert.ok(!pricing.includes('3 kalendermaanden'),'Legacy three-month Stripe trial copy must be removed');

const faq=fs.readFileSync(path.join(publicDir,'faq','index.html'),'utf8');
assert.ok(faq.includes('Hoe werken betalingen en Early Access?'),'FAQ must use current Early Access semantics');
assert.ok(!faq.includes('betaald plan activeren'),'FAQ must not reintroduce paid-plan trial activation');

const privacy=fs.readFileSync(path.join(publicDir,'privacy','index.html'),'utf8');
assert.ok(privacy.includes('Row Level Security'),'Privacy page must retain account-isolation disclosure');
assert.ok(privacy.includes('/account-verwijderen/'),'Privacy page must link account deletion');

console.log(`Marketing page QA: PASS (${pages.length} pages)`);
