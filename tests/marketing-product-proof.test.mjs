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
assert.ok(app.includes('class=\\"product-proof\\"'),'Homepage must use the semantic product-proof variant');
assert.ok(app.includes('class=\\"product-crop'),'Homepage must use semantic product-crop variants');
assert.ok(app.includes('class=\\"product-mobile\\"'),'Homepage must use the semantic product-mobile variant');
assert.ok(!app.includes('class=\\"product-screenshot'),'Legacy universal screenshot presentation must not be rendered on the homepage');
assert.ok(app.includes('/assets/product/boekuna-dashboard-overview-crop.webp'),'Homepage primary proof must use the real Dashboard editorial crop');
assert.ok(app.includes('loading=\\"eager\\" fetchpriority=\\"high\\"'),'Primary screenshot must not be lazy loaded');
assert.ok(app.includes('width=\\"1120\\" height=\\"631\\"'),'Primary crop must reserve dimensions against CLS');
assert.ok(app.includes('/assets/product/boekuna-dashboard-action-center-crop.webp'),'More grip must use a distinct Dashboard detail crop');
assert.ok(app.includes('/assets/product/boekuna-documents-workflow-crop.webp'),'Workflow must use its own real Documents crop');
assert.ok(app.includes('/assets/product/boekuna-dashboard-mobile.webp'),'Homepage must use the real responsive mobile Dashboard capture');
assert.ok(!app.includes('Dit is geen desktopmockup in een telefoonframe'),'Technical mockup disclaimer must not appear in commercial copy');

const pageExpectations={
  'facturen':'boekuna-invoices-list-crop.webp',
  'scanner':'boekuna-documents-upload-crop.webp',
  'btw-bank':'boekuna-vat-summary-crop.webp',
  'functies':'boekuna-dashboard-overview-crop.webp',
  'voor-ondernemers':'boekuna-dashboard-overview-crop.webp',
  'rapportages':'boekuna-reports-primary-crop.webp'
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

const reviewDesktop=path.join(productDir,'boekuna-document-review-desktop.webp');
const reviewMobile=path.join(productDir,'boekuna-document-review-mobile.webp');
if(fs.existsSync(reviewDesktop)||fs.existsSync(reviewMobile)){
  assert.equal(proof.processorStatus,'real-processor-confirmed','Document-review screenshots are allowed only after real processor confirmation');
  assert.ok(fs.existsSync(reviewDesktop)&&fs.existsSync(reviewMobile),'Desktop and mobile review captures must ship together');
}else{
  assert.equal(proof.processorStatus,'blocked-no-dedicated-account','Missing review assets must remain explicitly blocked, never faked');
}

console.log(`Marketing product proof QA: PASS (${required.length} verified real captures; processor=${proof.processorStatus})`);
