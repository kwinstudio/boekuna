import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const productDir=path.join(root,'public','assets','product');
const proof=JSON.parse(fs.readFileSync(path.join(productDir,'capture-proof.json'),'utf8'));
assert.equal(proof.demoDataset,'permanent-fictive-marketing-v1');
assert.equal(proof.viewportDesktop,'1440x960');
assert.equal(proof.viewportMobile,'390x844');
assert.equal(proof.processorStatus,'real-processor-confirmed','Document review marketing proof requires a confirmed real processor run');
assert.equal(proof.sourceRef,'marketing/moneybird-inspired-rebuild-20260929','Rebuild captures must originate from the current marketing branch');

const required=[
 ['boekuna-dashboard-desktop.webp',1440,960],['boekuna-invoices-desktop.webp',1440,960],
 ['boekuna-documents-desktop.webp',1440,960],['boekuna-vat-desktop.webp',1440,960],
 ['boekuna-reports-desktop.webp',1440,960],['boekuna-dashboard-mobile.webp',390,844],
 ['boekuna-invoices-mobile.webp',390,844],['boekuna-document-review-desktop-960.webp',960,640],
 ['boekuna-document-review-mobile.webp',390,844],['boekuna-dashboard-overview-crop.webp',1120,631,'boekuna-dashboard-desktop.webp'],
 ['boekuna-invoices-list-crop.webp',760,468,'boekuna-invoices-desktop.webp'],
 ['boekuna-vat-summary-crop.webp',760,468,'boekuna-vat-desktop.webp'],
 ['boekuna-reports-primary-crop.webp',760,468,'boekuna-reports-desktop.webp']
];
const byName=new Map((proof.assets||[]).map(a=>[a.name,a]));
for(const [name,width,height,derivedFrom] of required){
 const file=path.join(productDir,name);assert.ok(fs.existsSync(file),`Missing product capture ${name}`);
 const stat=fs.statSync(file);assert.ok(stat.size>10000&&stat.size<600000,`${name} marketing asset size out of bounds`);
 const p=byName.get(name);assert.ok(p,`${name} missing from capture proof`);assert.equal(p.width,width);assert.equal(p.height,height);
 if(derivedFrom)assert.equal(p.derivedFrom,derivedFrom,`${name} crop provenance mismatch`);
}

for(const [name,max] of [['boekuna-ondernemer.webp',90000],['boekuna-bon-mobiel.webp',90000]]){
 const p=path.join(root,'public','assets','editorial',name);assert.ok(fs.existsSync(p),`Missing editorial asset ${name}`);
 assert.ok(fs.statSync(p).size<max,`${name} should remain lightweight`);
}

const app=fs.readFileSync(path.join(root,'kwinest','index.html'),'utf8');
for(const fake of ['<div class=\\"kz-browser\\"','<div class=\\"kz-phone\\"','<div class=\\"kz-doc-card\\"','<div class=\\"kz-alerts\\"','<div class=\\"kz-app-phone\\"','<div class=\\"kz-workflow-preview\\"']){
 assert.ok(!app.includes(fake),`Homepage renders reconstructed product UI: ${fake}`);
}
for(const requiredPath of [
 '/assets/editorial/boekuna-ondernemer.webp','/assets/editorial/boekuna-bon-mobiel.webp',
 '/assets/product/boekuna-dashboard-overview-crop.webp','/assets/product/boekuna-invoices-list-crop.webp',
 '/assets/product/boekuna-document-review-desktop-960.webp','/assets/product/boekuna-document-review-mobile.webp',
 '/assets/product/boekuna-vat-summary-crop.webp','/assets/product/boekuna-dashboard-mobile.webp'
]) assert.ok(app.includes(requiredPath),`Homepage missing intended evidence ${requiredPath}`);

const homepageProductImages=[...app.matchAll(/src="\/assets\/product\/([^"]+)/g)].map(m=>m[1]);
assert.ok(homepageProductImages.length<=6,`Homepage may contain at most six product visuals, found ${homepageProductImages.length}`);
assert.ok(!homepageProductImages.includes('boekuna-dashboard-desktop.webp'),'Homepage must not load full Dashboard master');
assert.ok(!homepageProductImages.includes('boekuna-documents-desktop.webp'),'Homepage must not load full Documents master');
assert.ok(!app.includes('klanttestimonial'),'Homepage must not imply generated editorial people are customers');
assert.ok(app.includes('Editoriale context, geen klanttestimonial.'),'Generated human context must be explicitly framed as editorial');

const pageExpectations={
 'facturen':'boekuna-invoices-list-crop.webp','scanner':'boekuna-document-review-desktop-960.webp',
 'btw-bank':'boekuna-vat-summary-crop.webp','functies':'boekuna-dashboard-overview-crop.webp',
 'voor-ondernemers':'boekuna-dashboard-overview-crop.webp','rapportages':'boekuna-reports-primary-crop.webp',
 'hoe-het-werkt':'boekuna-document-review-desktop-960.webp'
};
for(const [slug,asset] of Object.entries(pageExpectations)){
 const html=fs.readFileSync(path.join(root,'public',slug,'index.html'),'utf8');
 assert.ok(html.includes('/assets/product/'+asset),`${slug} must use targeted real product capture`);
 assert.ok(!html.includes('product-screenshot'),`${slug} must not use legacy screenshot wrapper`);
 assert.ok(!html.includes('<div class="mk-window">'),`${slug} must not render fake product window`);
}
const scanner=fs.readFileSync(path.join(root,'public','scanner','index.html'),'utf8');
assert.ok(scanner.includes('boekuna-document-review-mobile.webp'));
assert.ok(scanner.includes('/assets/editorial/boekuna-bon-mobiel.webp'));
assert.ok(scanner.includes('uitlezen → controleren → opslaan'));

console.log(`Marketing product proof QA: PASS (${required.length} capture checks; processor=${proof.processorStatus})`);
