import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const source=path.join(root,'public');
const dist=path.join(root,'dist','marketing');
const build=spawnSync(process.execPath,['scripts/build-marketing.mjs'],{encoding:'utf8'});
assert.equal(build.status,0,build.stderr||build.stdout);

const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  const file=path.join(dir,entry.name);
  return entry.isDirectory()?walk(file):[file];
});
const rel=file=>path.relative(root,file).replaceAll(path.sep,'/');
const textFiles=walk(source).filter(file=>/\.(html|css|js)$/i.test(file));
for(const file of textFiles){
  const body=fs.readFileSync(file,'utf8');
  assert.ok(!body.includes('/assets/product/'),rel(file)+': public marketing source must not reference product screenshots');
  assert.ok(!/\.(webp|jpg|jpeg|avif)(\?|#|["')\s>])/i.test(body),rel(file)+': public marketing source must not reference content-image formats');
}

for(const file of walk(dist).filter(file=>/\.(html|css|js)$/i.test(file))){
  const body=fs.readFileSync(file,'utf8');
  assert.ok(!body.includes('/assets/product/'),rel(file)+': generated marketing build must not reference product screenshots');
}
assert.ok(!fs.existsSync(path.join(dist,'assets','product')),'Generated marketing artifact must exclude the product capture library');
assert.ok(fs.existsSync(path.join(source,'assets','product','capture-proof.json')),'Internal product capture evidence should remain in source for QA/history');

const htmlFiles=walk(dist).filter(file=>file.endsWith('.html'));
for(const file of htmlFiles){
  const html=fs.readFileSync(file,'utf8');
  assert.equal((html.match(/<picture\b/gi)||[]).length,0,rel(file)+': content picture element must not remain');
  const imageTags=[...html.matchAll(/<img\b[^>]*>/gi)].map(match=>match[0]);
  for(const tag of imageTags){
    const src=(tag.match(/\bsrc=["']([^"']+)["']/i)||[])[1]||'';
    assert.ok(/\/assets\/(boekuna-|favicon-|apple-touch-icon)/.test(src),rel(file)+': non-brand image remains: '+src);
  }
}

console.log('Marketing no-content-image QA: PASS ('+htmlFiles.length+' generated HTML files; product captures excluded from dist; brand assets retained)');
