import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const dist=path.join(root,'dist','marketing');
const build=spawnSync(process.execPath,['scripts/build-marketing.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,build.stderr||build.stdout);

const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  const file=path.join(dir,entry.name);
  return entry.isDirectory()?walk(file):[file];
});
const rel=file=>path.relative(root,file).replaceAll(path.sep,'/');

const sitePages=['index.html','functies/index.html','assistent/index.html','scanner/index.html','prijzen/index.html','veiligheid/index.html','faq/index.html'];
for(const name of sitePages){
  const file=path.join(dist,name);
  const html=fs.readFileSync(file,'utf8');
  assert.ok(html.includes('https://boekuna.nl/assets/boekuna-og-1200x630.png'),name+': approved social preview missing');
  for(const tag of [...html.matchAll(/<img\b[^>]*>/gi)].map(match=>match[0])){
    const src=(tag.match(/\bsrc=["']([^"']+)["']/i)||[])[1]||'';
    assert.ok(src.startsWith('/assets/'),rel(file)+': content images must be first-party: '+src);
    const alt=(tag.match(/\balt=["']([^"']*)["']/i)||[])[1];
    assert.ok(alt!==undefined&&alt.trim(),rel(file)+': content image needs useful alt text: '+src);
  }
  const withoutApprovedPreview=html.replaceAll('https://boekuna.nl/assets/boekuna-og-1200x630.png','');
  assert.equal(/https?:\/\/[^"'\s>]+\.(?:webp|png|jpg|jpeg|avif|svg)/i.test(withoutApprovedPreview),false,name+': remote content image forbidden');
}

for(const file of walk(dist).filter(file=>file.endsWith('.html'))){
  const html=fs.readFileSync(file,'utf8');
  assert.equal(/<script[^>]+src=["']https?:\/\//i.test(html),false,rel(file)+': external runtime script forbidden');
}

assert.ok(fs.existsSync(path.join(dist,'assets','site.css')),'Multipage stylesheet missing');
assert.ok(fs.existsSync(path.join(dist,'assets','site.js')),'Multipage runtime missing');
assert.ok(fs.existsSync(path.join(dist,'assets','favicon.svg')),'Multipage favicon missing');
assert.ok(fs.existsSync(path.join(dist,'assets','boekuna-og-1200x630.png')),'Approved social preview asset missing');

console.log('Marketing multipage asset and first-party proof QA: PASS');
