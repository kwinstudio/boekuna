import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const root=process.cwd();
const baseRef=process.env.BOOKUNA_BASE_REF || (process.env.GITHUB_BASE_REF ? 'origin/'+process.env.GITHUB_BASE_REF : 'origin/main');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'boekuna-app-base-'));

const runBuild=cwd=>execFileSync(process.execPath,['scripts/build-app.mjs'],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});
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

  runBuild(tmp);
  const base=digestTree(path.join(tmp,'dist','app'));

  runBuild(root);
  const current=digestTree(path.join(root,'dist','app'));

  assert.deepEqual(current,base,'Marketing-only change altered the generated app artifact relative to '+baseRef);
  console.log('Marketing app non-regression: PASS ('+Object.keys(current).length+' app artifact files byte-identical to '+baseRef+')');
}finally{
  fs.rmSync(tmp,{recursive:true,force:true});
}
