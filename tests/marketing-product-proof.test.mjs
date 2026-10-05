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
  assert.ok(html.includes('class="logo brand-wordmark"'),'Canonical BOEKUNA wordmark missing');
  assert.ok(html.includes('content="#63D471"'),'Canonical BOEKUNA browser theme missing');
  assert.equal(/boekuna-logo-lime/.test(html),false,'Incorrect lime logo reference returned');
}
assert.equal(fs.existsSync(path.join(dist,'assets','stories')),false,'Screenshot assets must not ship in public marketing artifact');
assert.equal(fs.existsSync(path.join(dist,'assets','boekuna-logo-lime.svg')),false,'Incorrect lime logo asset must not ship');
assert.equal(fs.existsSync(path.join(dist,'assets','boekuna-logo-lime-reversed.svg')),false,'Incorrect reversed lime logo asset must not ship');

const css=fs.readFileSync(path.join(source,'assets','editorial-marketing.css'),'utf8');
for(const token of ['#1B1F23','#63D471','#F6F7F8','#8A949C','#FFFFFF']){
  assert.ok(css.includes(token),'Canonical BOEKUNA identity token missing '+token);
}
assert.equal(css.includes('#E7FE55'),false,'Incorrect lime token must not return');
assert.equal(css.includes('#BFE7EC'),false,'Incorrect cyan token must not return');
assert.ok(css.includes("'Space Grotesk'"),'Space Grotesk headline typography missing');
assert.ok(css.includes("'Inter'"),'Inter body typography missing');
assert.ok(fs.readFileSync(path.join(dist,'scanner/index.html'),'utf8').includes('id="flowline"'),'Functional scanner explainer must remain');

console.log('Marketing image-free brand QA: PASS (canonical BOEKUNA identity, no public screenshots, scanner explanation retained)');
