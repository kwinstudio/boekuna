import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const root=process.cwd();
const baseRef=process.env.BOOKUNA_BASE_REF || (process.env.GITHUB_BASE_REF ? 'origin/'+process.env.GITHUB_BASE_REF : 'origin/main');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'boekuna-app-base-'));

const runBuild=(cwd,surface)=>execFileSync(process.execPath,['scripts/build-'+surface+'.mjs'],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  const file=path.join(dir,entry.name);
  return entry.isDirectory()?walk(file):[file];
});
const digestTree=dir=>Object.fromEntries(walk(dir).sort().map(file=>[
  path.relative(dir,file).replaceAll(path.sep,'/'),
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
]));

try{
  const archive=execFileSync('git',['archive',baseRef],{cwd:root,maxBuffer:64*1024*1024});
  execFileSync('tar',['-x','-C',tmp],{input:archive,maxBuffer:64*1024*1024});

  // Shared split tests also trigger this gate for app PRs. Compare the surface
  // that must remain unchanged; intentional app changes still have app CI.
  const appChanged=['kwinest/index.html','scripts/build-app.mjs','public/manifest.webmanifest','public/assets/document-review-v2.js','public/assets/document-review-v2.css'].some(file=>!fs.readFileSync(path.join(root,file)).equals(fs.readFileSync(path.join(tmp,file))));
  const surface=appChanged?'marketing':'app';
  for(const cwd of [tmp,root])for(const target of ['app','marketing'])runBuild(cwd,target);
  const base=digestTree(path.join(tmp,'dist',surface));

  const current=digestTree(path.join(root,'dist',surface));

  assert.deepEqual(current,base,(appChanged?'App change altered the generated marketing':'Marketing-only change altered the generated app')+' artifact relative to '+baseRef);
  console.log('Split surface non-regression: PASS ('+Object.keys(current).length+' '+surface+' artifact files byte-identical to '+baseRef+'; both builds passed)');
}finally{
  fs.rmSync(tmp,{recursive:true,force:true});
}
