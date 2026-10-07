import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';

const root=process.cwd(),baseRef=process.env.BOOKUNA_BASE_REF||(process.env.GITHUB_BASE_REF?'origin/'+process.env.GITHUB_BASE_REF:'origin/main');
const gitDir=execFileSync('git',['rev-parse','--absolute-git-dir'],{cwd:root,encoding:'utf8'}).trim();
const archive=execFileSync('git',['archive',baseRef],{cwd:root,maxBuffer:64*1024*1024});
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'boekuna-split-contract-'));
const runner=path.join(root,'tests','marketing-app-non-regression.test.mjs');
function reset(){fs.rmSync(fixture,{recursive:true,force:true});fs.mkdirSync(fixture);execFileSync('tar',['-x','-C',fixture],{input:archive,maxBuffer:64*1024*1024})}
function run(){return spawnSync(process.execPath,[runner],{cwd:fixture,env:{...process.env,GIT_DIR:gitDir,BOOKUNA_BASE_REF:baseRef},encoding:'utf8',maxBuffer:8*1024*1024})}
function drift(file){fs.appendFileSync(path.join(fixture,file),'\n/* Deliberate non-regression probe. */\n')}
try{
 reset();fs.appendFileSync(path.join(fixture,'public/index.html'),'\n<!-- Deliberate marketing-only fixture -->\n');let result=run();assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/app artifact files byte-identical/);
 drift('public/assets/brand-v2.css');result=run();assert.notEqual(result.status,0,'A marketing change must fail if it alters a shared app asset');assert.match(result.stderr,/Marketing-only change altered the generated app artifact/);
 // An app-only change may touch the app source, its app-only assets and the app build script together.
 reset();for(const file of ['kwinest/index.html','scripts/build-app.mjs',...fs.readdirSync(path.join(root,'kwinest/app-assets')).map(name=>'kwinest/app-assets/'+name)])fs.copyFileSync(path.join(root,file),path.join(fixture,file));fs.appendFileSync(path.join(fixture,'kwinest/index.html'),'\n<!-- Deliberate app-only fixture -->\n');result=run();assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/marketing artifact files byte-identical/);
 fs.appendFileSync(path.join(fixture,'public/index.html'),'\n<!-- Deliberate forbidden marketing drift -->\n');result=run();assert.notEqual(result.status,0,'An app change must fail if the public artifact also changes');assert.match(result.stderr,/App change altered the generated marketing artifact/);
 console.log('Split surface contract: PASS (marketing-only/app-only accepted; app/shared-asset and mixed marketing drift rejected)');
}finally{fs.rmSync(fixture,{recursive:true,force:true})}
