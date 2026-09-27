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
  assert.ok(html.includes(`https://boekuna-boekhouding.onrender.com/${slug}/`),`${slug}: canonical/public URL metadata missing`);

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

const support=fs.readFileSync(path.join(publicDir,'support','index.html'),'utf8');
assert.ok(support.includes('id="supportForm"'),'Support form must remain functional');
assert.ok(support.includes("support_requests"),'Support form must submit to support_requests');

const deletion=fs.readFileSync(path.join(publicDir,'account-verwijderen','index.html'),'utf8');
assert.ok(deletion.includes('id="deleteRequestForm"'),'Account deletion web form must remain functional');
assert.ok(deletion.includes('pattern="VERWIJDER"'),'Deletion request requires explicit confirmation');

const pricing=fs.readFileSync(path.join(publicDir,'prijzen','index.html'),'utf8');
for(const price of ['€0','€9,95','€19,95']) assert.ok(pricing.includes(price),`Missing current price ${price}`);
for(const oldPrice of ['€29,95']) assert.ok(!pricing.includes(oldPrice),`Legacy price must be removed: ${oldPrice}`);
assert.ok(pricing.includes('Founding 100'),'Pricing must explain the Founding 100 offer');
assert.ok(pricing.includes('3 kalendermaanden'),'Founding offer must be 3 calendar months');
assert.ok(pricing.includes('Stripe Checkout'),'Paid subscriptions must explain the Stripe checkout flow');

const privacy=fs.readFileSync(path.join(publicDir,'privacy','index.html'),'utf8');
assert.ok(privacy.includes('Row Level Security'),'Privacy page must retain account-isolation disclosure');
assert.ok(privacy.includes('/account-verwijderen/'),'Privacy page must link account deletion');

const terms=fs.readFileSync(path.join(publicDir,'voorwaarden','index.html'),'utf8');
assert.ok(terms.includes('Geen automatische belastingaangifte'),'Terms must retain tax-filing limitation');

console.log(`Marketing page QA: PASS (${pages.length} pages)`);
