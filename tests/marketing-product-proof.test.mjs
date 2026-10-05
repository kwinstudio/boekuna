import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const source=path.join(root,'public');
const build=spawnSync(process.execPath,['scripts/build-marketing.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,'Marketing build failed: '+(build.stderr||build.stdout));
const dist=path.join(root,'dist','marketing');

function htmlFiles(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())return htmlFiles(file);
    return entry.name.endsWith('.html')?[file]:[];
  });
}

for(const file of [...htmlFiles(source),...htmlFiles(dist)]){
  const html=fs.readFileSync(file,'utf8');
  assert.equal(/\/assets\/stories\//.test(html),false,path.relative(root,file)+': product screenshot reference returned');
  assert.equal(/class="product-stage detail-product"/.test(html),false,path.relative(root,file)+': screenshot stage returned');
}
const sourceHome=fs.readFileSync(path.join(source,'index.html'),'utf8');
const builtHome=fs.readFileSync(path.join(dist,'index.html'),'utf8');
for(const html of [sourceHome,builtHome]){
  assert.equal(/product-marquee|marquee-card|project-image/.test(html),false,'Homepage screenshot presentation returned');
  assert.ok(html.includes('/assets/boekuna-logo-lime.svg'),'Lime BOEKUNA logo missing');
}
assert.equal(fs.existsSync(path.join(dist,'assets','stories')),false,'Screenshot assets must not ship in public marketing artifact');

const css=fs.readFileSync(path.join(source,'assets','editorial-marketing.css'),'utf8');
for(const token of ['#E7FE55','#BFE7EC','#111111','#FFFFFF','#F6F6F3']){
  assert.ok(css.includes(token),'BOEKUNA identity token missing '+token);
}
assert.ok(fs.readFileSync(path.join(dist,'scanner/index.html'),'utf8').includes('id="flowline"'),'Functional scanner explainer must remain');

console.log('Marketing image-free brand QA: PASS (lime/cyan identity, no public screenshots, scanner explanation retained)');
