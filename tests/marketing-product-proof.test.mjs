import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const productDir=path.join(root,'public','assets','product');
const proof=JSON.parse(fs.readFileSync(path.join(productDir,'capture-proof.json'),'utf8'));
assert.equal(proof.demoDataset,'permanent-fictive-marketing-v1','Capture library must remain fictive QA data');
assert.equal(proof.viewportMobile,'390x844');

const retainedQaAssets=[
 'boekuna-dashboard-desktop.webp','boekuna-invoices-desktop.webp','boekuna-documents-desktop.webp','boekuna-vat-desktop.webp',
 'boekuna-dashboard-mobile.webp','boekuna-invoices-mobile.webp','boekuna-documents-mobile.webp','boekuna-vat-mobile.webp',
 'boekuna-dashboard-overview-crop.webp','boekuna-dashboard-action-center-crop.webp','boekuna-invoices-list-crop.webp',
 'boekuna-documents-upload-crop.webp','boekuna-documents-workflow-crop.webp','boekuna-vat-summary-crop.webp',
 'boekuna-reports-primary-crop.webp','boekuna-contacts-list-crop.webp','boekuna-services-list-crop.webp',
 'boekuna-company-settings-group-crop.webp'
];
for(const name of retainedQaAssets){
  assert.ok(fs.existsSync(path.join(productDir,name)),'QA capture may remain in repository but is missing: '+name);
}

const app=fs.readFileSync(path.join(root,'kwinest','index.html'),'utf8');
assert.ok(!app.includes('/assets/product/'),'Root public marketing source must not reference product screenshots');
for(const fake of [
  'class=\\"product-proof','class=\\"product-crop','class=\\"product-mobile',
  '<div class=\\"kz-browser','<div class=\\"kz-phone','<div class=\\"kz-app-phone'
]){
  assert.ok(!app.includes(fake),'Root marketing still renders screenshot/fake UI marker: '+fake);
}
assert.ok(app.includes('/assets/marketing-visuals.css'),'Root page must load the abstract visual system');
assert.ok(app.includes('bv-home-hero'),'Root page must render the new screenshot-free hero');
assert.ok(app.includes('data-bv-stepper'),'Root page must include the abstract documentflow');
assert.ok(app.includes('Geen neptelefoon of appmockup'),'Mobile section must explicitly use the abstract composition');

const slugs=['account-verwijderen','btw-bank','contact','facturen','faq','functies','hoe-het-werkt','over','prijzen','privacy','rapportages','scanner','support','veiligheid','voor-ondernemers','voorwaarden'];
for(const slug of slugs){
  const html=fs.readFileSync(path.join(root,'public',slug,'index.html'),'utf8');
  assert.ok(!html.includes('/assets/product/'),slug+': no product screenshots may render publicly');
  assert.ok(!html.includes('product-crop'),slug+': old crop component still present');
  assert.ok(!html.includes('product-mobile'),slug+': old mobile screenshot component still present');
  assert.ok(!html.includes('<div class="mk-window">'),slug+': fake window mockup still present');
}

const visualCss=fs.readFileSync(path.join(root,'public','assets','marketing-visuals.css'),'utf8');
assert.ok(!/url\([^)]*assets\/product/i.test(visualCss),'Abstract CSS must not smuggle screenshots in as backgrounds');

const reviewDesktop=path.join(productDir,'boekuna-document-review-desktop.webp');
const reviewMobile=path.join(productDir,'boekuna-document-review-mobile.webp');
if(fs.existsSync(reviewDesktop)||fs.existsSync(reviewMobile)){
  assert.equal(proof.processorStatus,'real-processor-confirmed','Review captures may exist only after real processor confirmation');
}else{
  assert.equal(proof.processorStatus,'blocked-no-dedicated-account','Absent processor review must stay explicitly blocked, never fabricated');
}

console.log('Marketing screenshot removal QA: PASS ('+retainedQaAssets.length+' QA-only capture assets retained, 0 public references)');
