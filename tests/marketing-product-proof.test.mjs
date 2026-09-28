import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const productDir=path.join(root,'public','assets','product');
const proofPath=path.join(productDir,'capture-proof.json');
assert.ok(fs.existsSync(proofPath),'Real-product capture proof must exist');
const proof=JSON.parse(fs.readFileSync(proofPath,'utf8'));
assert.equal(proof.demoDataset,'permanent-fictive-marketing-v1','All captures must use the permanent fictive marketing dataset');
assert.equal(proof.viewportDesktop,'1440x960');
assert.equal(proof.viewportMobile,'390x844');

const required=[
  ['boekuna-dashboard-desktop.webp',1440,960],
  ['boekuna-invoices-desktop.webp',1440,960],
  ['boekuna-documents-desktop.webp',1440,960],
  ['boekuna-vat-desktop.webp',1440,960],
  ['boekuna-contacts-desktop.webp',1440,960],
  ['boekuna-services-desktop.webp',1440,960],
  ['boekuna-company-settings-desktop.webp',1440,960],
  ['boekuna-reports-desktop.webp',1440,960],
  ['boekuna-dashboard-mobile.webp',390,844],
  ['boekuna-invoices-mobile.webp',390,844],
  ['boekuna-documents-mobile.webp',390,844],
  ['boekuna-dashboard-overview-crop.webp',1120,631,'boekuna-dashboard-desktop.webp'],
  ['boekuna-dashboard-action-center-crop.webp',650,488,'boekuna-dashboard-desktop.webp'],
  ['boekuna-invoices-list-crop.webp',760,468,'boekuna-invoices-desktop.webp'],
  ['boekuna-documents-upload-crop.webp',760,468,'boekuna-documents-desktop.webp'],
  ['boekuna-documents-workflow-crop.webp',680,425,'boekuna-documents-desktop.webp'],
  ['boekuna-vat-summary-crop.webp',760,468,'boekuna-vat-desktop.webp'],
  ['boekuna-reports-primary-crop.webp',760,468,'boekuna-reports-desktop.webp'],
  ['boekuna-contacts-list-crop.webp',760,422,'boekuna-contacts-desktop.webp'],
  ['boekuna-services-list-crop.webp',760,422,'boekuna-services-desktop.webp'],
  ['boekuna-company-settings-group-crop.webp',760,533,'boekuna-company-settings-desktop.webp']
];
const byName=new Map((proof.assets||[]).map(a=>[a.name,a]));
for(const [name,width,height,derivedFrom] of required){
  const file=path.join(productDir,name);
  assert.ok(fs.existsSync(file),`Missing real product screenshot: ${name}`);
  const stat=fs.statSync(file);
  assert.ok(stat.size>10000,`${name} is unexpectedly small`);
  assert.ok(stat.size<600000,`${name} is too large for normal marketing delivery`);
  const p=byName.get(name);
  assert.ok(p,`${name} missing from capture proof`);
  assert.equal(p.width,width,`${name} width mismatch`);
  assert.equal(p.height,height,`${name} height mismatch`);
  if(derivedFrom){
    assert.equal(p.derivedFrom,derivedFrom,`${name} must remain traceable to its real master capture`);
    assert.ok(p.extract&&Number.isInteger(p.extract.left)&&Number.isInteger(p.extract.top),`${name} must record physical crop coordinates`);
  }
}

const app=fs.readFileSync(path.join(root,'kwinest','index.html'),'utf8');
const homeStart=app.indexOf("if(page==='home'){"),homeEnd=app.indexOf("}else if(page==='features')",homeStart),home=app.slice(homeStart,homeEnd);
assert.ok(homeStart>=0&&homeEnd>homeStart,'Homepage source block must be detectable');
for(const fake of [
  '<div class=\\"kz-browser\\"',
  '<div class=\\"kz-phone\\"',
  '<div class=\\"kz-doc-card\\"',
  '<div class=\\"kz-alerts\\"',
  '<div class=\\"kz-app-phone\\"',
  '<div class=\\"kz-workflow-preview\\"'
]){
  assert.ok(!app.includes(fake),`Homepage still renders fake product UI: ${fake}`);
}
assert.ok(!home.includes('class="kz-hero-product-proof"'),'Homepage must not render the former desktop Dashboard hero proof');
assert.ok(home.includes('class="product-crop'),'Homepage must use semantic product-crop variants');
assert.ok(home.includes('class="product-mobile'),'Homepage must use semantic product-mobile variants');
assert.ok(!home.includes('class="product-screenshot'),'Legacy universal screenshot presentation must not be rendered on the homepage');
assert.ok(home.includes('/assets/product/boekuna-dashboard-mobile.webp'),'Hero/mobile product compositions must use the real responsive Dashboard capture');
assert.ok(home.includes('loading="eager" fetchpriority="high"'),'Hero mobile capture must not be lazy loaded');
assert.ok(home.includes('width="390" height="844"'),'Mobile capture must reserve real dimensions against CLS');
assert.ok(home.includes('/assets/product/boekuna-dashboard-overview-crop.webp'),'First product proof must use the real Dashboard editorial crop');
assert.ok(home.includes('/assets/product/boekuna-dashboard-action-center-crop.webp'),'More grip must use the distinct Dashboard action-center crop');
assert.ok(home.includes('/assets/product/boekuna-documents-upload-crop.webp'),'DocumentStory must start from the real Documents upload crop');
assert.ok(home.includes('/assets/product/boekuna-invoices-mobile.webp'),'Mobile rail must include the real Facturen mobile capture');
assert.ok(home.includes('/assets/product/boekuna-documents-mobile.webp'),'Mobile rail must include the real Documenten mobile capture');
assert.ok(!home.includes('data-kz-tab="rapportages"'),'Homepage product tabs must stay limited to Facturen, Documenten and Btw');
for(const key of ['facturen','documenten','btw'])assert.ok(home.includes('data-kz-tab="'+key+'"'),`Homepage product tab missing: ${key}`);
assert.ok(home.includes('role="tablist"'),'Homepage product controls must expose tablist semantics');
assert.ok(home.includes('role="tabpanel"'),'Homepage product detail must expose a real tabpanel');
assert.ok(home.includes('class="document-story reveal"'),'Homepage must contain the real-capture DocumentStory');
assert.equal((home.match(/data-story-step=/g)||[]).length,4,'DocumentStory must expose four step-content blocks');
assert.ok(home.includes('id="mobileProductRail"'),'Homepage must contain a dedicated mobile product rail');
assert.equal((home.match(/data-mobile-rail-card=/g)||[]).length,3,'Mobile rail must ship Dashboard, Facturen and Documenten only until real review capture exists');
assert.ok(!home.includes('boekuna-document-review-mobile.webp'),'Blocked review capture must not be referenced before processor confirmation');
assert.ok(!home.includes('Dit is geen desktopmockup in een telefoonframe'),'Technical mockup disclaimer must not appear in commercial copy');
assert.ok(!home.includes('OCR-reviewcapture beschikbaar'),'Internal capture-status language must never leak into marketing copy');

const homepageProductImages=[...home.matchAll(new RegExp('src="/assets/product/([^"]+)','g'))].map(m=>m[1]);
assert.ok(homepageProductImages.length<=8,`Homepage may contain at most eight rendered product visuals, found ${homepageProductImages.length}`);
assert.equal(homepageProductImages.filter(x=>x==='boekuna-dashboard-mobile.webp').length,2,'Dashboard mobile may appear only in hero and mobile product rail');
assert.equal(homepageProductImages.filter(x=>x==='boekuna-invoices-mobile.webp').length,1,'Invoices mobile must appear once in the mobile product rail');
assert.equal(homepageProductImages.filter(x=>x==='boekuna-documents-mobile.webp').length,1,'Documents mobile must appear once in the mobile product rail');
assert.ok(!homepageProductImages.includes('boekuna-dashboard-desktop.webp'),'Homepage must not load the full Dashboard master');
assert.ok(!homepageProductImages.includes('boekuna-documents-desktop.webp'),'Homepage must not load the full Documents master');
assert.ok(!homepageProductImages.includes('boekuna-vat-summary-crop.webp'),'Btw desktop crop must not be pre-rendered as a separate homepage visual');
assert.ok(!homepageProductImages.includes('boekuna-reports-primary-crop.webp'),'Rapportages desktop crop belongs on the feature page, not the homepage');
const dominantDesktopProofs=homepageProductImages.filter(x=>['boekuna-dashboard-overview-crop.webp','boekuna-dashboard-action-center-crop.webp'].includes(x));
assert.equal(dominantDesktopProofs.length,2,'Homepage must render exactly two dominant desktop/detail proofs');
assert.ok(home.includes('data-human-assets="pending-09"'),'Human photography dependency must remain explicit until binary 09 assets are repository-addressable');

for(const token of ['--motion-fast:140ms','--motion-ui:200ms','--motion-content:320ms','--motion-section:440ms','--ease-product:cubic-bezier(.2,.8,.2,1)']){
  assert.ok(app.includes(token),`Central motion token missing: ${token}`);
}
assert.ok(app.includes("window.matchMedia('(prefers-reduced-motion: reduce)').matches"),'JS-driven motion must respect prefers-reduced-motion centrally');
assert.ok(!app.includes('.kz-reveal'),'Legacy .kz-reveal architecture must be removed');
assert.ok(!app.includes('bookuna-reveal'),'Legacy .bookuna-reveal architecture must be removed');
assert.ok(!home.includes('id="kzProgress"'),'Homepage scroll progress bar must be removed when DocumentStory is present');
assert.ok(app.includes('translateY(-2px)'),'Interactive card hover must be capped at -2px');
assert.ok(!app.includes('translateY(-5px)'),'Legacy -5px card lift must be removed');
assert.ok(app.includes('scroll-snap-type:x mandatory'),'Mobile product interactions must use native mandatory horizontal snap');
assert.ok(app.includes('position:sticky;top:112px'),'Desktop DocumentStory must use a local sticky visual');
assert.ok(app.includes('@media(max-width:1023px)'),'DocumentStory must switch away from sticky below 1024px');
assert.ok(app.includes('class="faq-toggle"'),'FAQ must use native button triggers');
assert.ok(app.includes('class="faq-answer"'),'FAQ must expose controlled answer regions');
assert.ok(!app.includes("item.setAttribute('role','button')"),'FAQ semantics must not be retrofitted onto non-buttons');
assert.ok(!/gsap|framer-motion|anime\.js/i.test(app),'Marketing interactions must not add a heavy motion dependency');

const storySources=[
  'boekuna-documents-upload-crop.webp',
  'boekuna-documents-workflow-crop.webp',
  'boekuna-documents-desktop-960.webp',
  'boekuna-documents-mobile.webp'
];
for(const name of storySources){
  assert.ok(byName.has(name),`DocumentStory asset must be traceable to capture-proof.json: ${name}`);
}

const pageExpectations={
  'facturen':'boekuna-invoices-list-crop.webp',
  'scanner':'boekuna-documents-upload-crop.webp',
  'btw-bank':'boekuna-vat-summary-crop.webp',
  'functies':'boekuna-dashboard-overview-crop.webp',
  'voor-ondernemers':'boekuna-dashboard-overview-crop.webp',
  'rapportages':'boekuna-reports-primary-crop.webp',
  'hoe-het-werkt':'boekuna-documents-workflow-crop.webp'
};
for(const [slug,asset] of Object.entries(pageExpectations)){
  const html=fs.readFileSync(path.join(root,'public',slug,'index.html'),'utf8');
  assert.ok(html.includes('product-crop'),`${slug} must use the semantic product-crop pattern`);
  assert.ok(!html.includes('product-screenshot'),`${slug} must not use the legacy universal screenshot card`);
  assert.ok(html.includes('/assets/product/'+asset),`${slug} must use real targeted crop ${asset}`);
  assert.ok(!html.includes('<div class="mk-window">'),`${slug} must not render the old fake window preview`);
}
const scanner=fs.readFileSync(path.join(root,'public','scanner','index.html'),'utf8');
assert.ok(!scanner.includes('mk-product-demo'),'Scanner page must not render fake financial product cards');

const how=fs.readFileSync(path.join(root,'public','hoe-het-werkt','index.html'),'utf8');
for(const fake of ['how-hero-demo','how-demo-','how-flow-mini','how-equation','how-mobile-steps','how-result-grid','how-settlement']){
  assert.ok(!how.includes(fake),`Product tour must not render reconstructed product UI: ${fake}`);
}
assert.ok(how.includes('boekuna-company-settings-group-crop.webp'),'Progressive onboarding must use the real company-settings crop');

const features=fs.readFileSync(path.join(root,'public','functies','index.html'),'utf8');
assert.ok(features.includes('boekuna-contacts-list-crop.webp'),'Features page must show the real Relations crop');
assert.ok(features.includes('boekuna-services-list-crop.webp'),'Features page must show the real Services crop');

const reviewDesktop=path.join(productDir,'boekuna-document-review-desktop.webp');
const reviewMobile=path.join(productDir,'boekuna-document-review-mobile.webp');
if(fs.existsSync(reviewDesktop)||fs.existsSync(reviewMobile)){
  assert.equal(proof.processorStatus,'real-processor-confirmed','Document-review screenshots are allowed only after real processor confirmation');
  assert.ok(fs.existsSync(reviewDesktop)&&fs.existsSync(reviewMobile),'Desktop and mobile review captures must ship together');
}else{
  assert.equal(proof.processorStatus,'blocked-no-dedicated-account','Missing review assets must remain explicitly blocked, never faked');
}

console.log(`Marketing product proof QA: PASS (${required.length} verified real captures; processor=${proof.processorStatus})`);
