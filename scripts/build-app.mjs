import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const target=path.join(root,'dist','app');
const appSource=path.join(root,'kwinest','index.html');
const manifestSource=path.join(root,'public','manifest.webmanifest');
const assetsSource=path.join(root,'public','assets');

for(const file of [appSource,manifestSource,assetsSource]){
  if(!fs.existsSync(file))throw new Error('Missing app build source: '+path.relative(root,file));
}

fs.rmSync(target,{recursive:true,force:true});
fs.mkdirSync(target,{recursive:true});
fs.copyFileSync(appSource,path.join(target,'index.html'));
fs.copyFileSync(manifestSource,path.join(target,'manifest.webmanifest'));
fs.cpSync(assetsSource,path.join(target,'assets'),{recursive:true});

console.log('App build complete:',path.relative(root,target));
