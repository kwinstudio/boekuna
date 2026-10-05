import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const source=path.join(root,'public');
const dist=path.join(root,'dist','marketing');
const build=spawnSync(process.execPath,['scripts/build-marketing.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,build.stderr||build.stdout);

const sourceHome=fs.readFileSync(path.join(source,'index.html'),'utf8');
const builtHome=fs.readFileSync(path.join(dist,'index.html'),'utf8');

// The minimal homepage uses authentic screenshots; the scanner retains the interactive demo.
for(const image of ['bon-controleren.webp','facturen.webp','overzicht.webp','overzicht-mobiel.webp']){
 assert.ok(sourceHome.includes('/assets/stories/'+image),'Authentic product screenshot missing: '+image);
 assert.ok(builtHome.includes('/assets/stories/'+image));
}
assert.ok(fs.readFileSync(path.join(dist,'scanner/index.html'),'utf8').includes('id="flowline"'));
assert.equal(/ondernemer-werkplek|\/assets\/product\//.test(sourceHome),false,'No portraits or stale screenshots');

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
  assert.equal(/https?:\/\/[^"'\s>]+\.(?:webp|png|jpg|jpeg|avif)/i.test(withoutApprovedSocialPreview),false,
    rel(file)+': remote content image forbidden');
}

// Historical captures can remain source-side for QA/history, but the marketing proof no longer
// depends on any specific screenshot filename or count.
assert.ok(fs.existsSync(path.join(source,'assets','product','capture-proof.json')),
  'Internal product capture evidence should remain available for QA/history');

console.log('Marketing product-proof QA: PASS (authentic screenshots, retained scanner interaction, first-party image safety)');
