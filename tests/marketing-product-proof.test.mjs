import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const source=path.join(root,'public');
const dist=path.join(root,'dist','marketing');
const build=spawnSync(process.execPath,['scripts/build-marketing.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,build.stderr||build.stdout);

const expectedProducts=[
  'boekuna-dashboard-desktop-960.webp',
  'boekuna-document-review-desktop-960.webp'
];
const home=fs.readFileSync(path.join(source,'index.html'),'utf8');
for(const name of expectedProducts){
  assert.ok(home.includes('/assets/product/'+name),'Homepage must use real product proof '+name);
  assert.ok(fs.existsSync(path.join(source,'assets','product',name)),'Source product capture missing '+name);
  assert.ok(fs.existsSync(path.join(dist,'assets','product',name)),'Built product capture missing '+name);
}
const builtProducts=fs.readdirSync(path.join(dist,'assets','product')).sort();
assert.deepEqual(builtProducts,expectedProducts.sort(),'Marketing artifact must contain only the two intentionally published product captures');

const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  const file=path.join(dir,entry.name);
  return entry.isDirectory()?walk(file):[file];
});
const rel=file=>path.relative(root,file).replaceAll(path.sep,'/');
for(const file of walk(dist).filter(file=>file.endsWith('.html'))){
  const html=fs.readFileSync(file,'utf8');
  for(const tag of [...html.matchAll(/<img\b[^>]*>/gi)].map(match=>match[0])){
    const src=(tag.match(/\bsrc=["']([^"']+)["']/i)||[])[1]||'';
    assert.ok(src.startsWith('/assets/'),rel(file)+': every image must be first-party: '+src);
    const alt=(tag.match(/\balt=["']([^"']*)["']/i)||[])[1];
    assert.ok(alt!==undefined&&alt.trim(),rel(file)+': content image needs useful alt text: '+src);
  }
  const withoutApprovedSocialPreview=html.replaceAll('https://boekuna.nl/assets/boekuna-og-1200x630.png','');
  assert.equal(/https?:\/\/[^"'\s>]+\.(?:webp|png|jpg|jpeg|avif)/i.test(withoutApprovedSocialPreview),false,rel(file)+': remote content image forbidden');
}
assert.ok(fs.existsSync(path.join(source,'assets','product','capture-proof.json')),'Internal product capture evidence should remain in source for QA/history');
assert.ok(!fs.existsSync(path.join(dist,'assets','product','capture-proof.json')),'Internal capture proof must not be published');

console.log('Marketing real-product-proof QA: PASS (two first-party product captures, curated artifact, useful alt text)');
