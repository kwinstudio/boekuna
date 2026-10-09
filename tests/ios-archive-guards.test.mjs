import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const bin=fs.mkdtempSync(path.join(os.tmpdir(),'boekuna-archive-guards-'));
try{
 fs.writeFileSync(path.join(bin,'uname'),'#!/bin/sh\nprintf "Darwin\\n"\n',{mode:0o755});
 fs.writeFileSync(path.join(bin,'git'),'#!/bin/sh\nprintf "%s" "$QA_GIT_STATUS"\n',{mode:0o755});
 const cases=[
  [{DEVELOPMENT_TEAM:''},/set DEVELOPMENT_TEAM/],
  [{DEVELOPMENT_TEAM:'bad'},/10-character/],
  [{DEVELOPMENT_TEAM:'ABCD123456',BUILD_NUMBER:''},/BUILD_NUMBER/],
  [{DEVELOPMENT_TEAM:'ABCD123456',BUILD_NUMBER:'0'},/BUILD_NUMBER/],
  [{DEVELOPMENT_TEAM:'ABCD123456',BUILD_NUMBER:'1',UPLOAD_TO_TESTFLIGHT:'yes'},/must be 0 or 1/],
  [{DEVELOPMENT_TEAM:'ABCD123456',BUILD_NUMBER:'1',UPLOAD_TO_TESTFLIGHT:'0',QA_GIT_STATUS:'?? ios/Boekuna/Assets.xcassets/untracked-resource.png'},/commit or remove non-ignored/]
 ];
 for(const [vars,expected] of cases){
  const r=spawnSync('bash',['ios/scripts/archive.sh'],{env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,BUILD_NUMBER:'',UPLOAD_TO_TESTFLIGHT:'0',QA_GIT_STATUS:'',...vars},encoding:'utf8'});
  assert.equal(r.status,2);assert.match(r.stderr,expected);
 }
 console.log('PASS archive refuses missing/invalid signing identity, invalid build numbers, invalid upload flag and untracked source inputs');
}finally{fs.rmSync(bin,{recursive:true,force:true})}
