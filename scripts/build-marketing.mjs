import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const source=path.join(root,'public');
const target=path.join(root,'dist','marketing');

const required=[
  path.join(source,'index.html'),
  path.join(source,'privacy','index.html'),
  path.join(source,'support','index.html'),
  path.join(source,'account-verwijderen','index.html')
];
for(const file of required){
  if(!fs.existsSync(file))throw new Error('Missing marketing source: '+path.relative(root,file));
}

fs.rmSync(target,{recursive:true,force:true});
fs.mkdirSync(path.dirname(target),{recursive:true});
fs.cpSync(source,target,{recursive:true});

// The PWA manifest belongs to the authenticated product host, not the public site.
fs.rmSync(path.join(target,'manifest.webmanifest'),{force:true});

// Product captures remain in source for QA/evidence, but are not part of the public marketing artifact.
fs.rmSync(path.join(target,'assets','product'),{recursive:true,force:true});

const textExtensions=new Set(['.html','.css','.js']);
const stack=[target];
while(stack.length){
  const current=stack.pop();
  for(const entry of fs.readdirSync(current,{withFileTypes:true})){
    const file=path.join(current,entry.name);
    if(entry.isDirectory()){stack.push(file);continue;}
    if(!textExtensions.has(path.extname(entry.name)))continue;
    const body=fs.readFileSync(file,'utf8');
    if(body.includes('/assets/product/'))throw new Error('Marketing build still references product screenshots: '+path.relative(root,file));
  }
}

console.log('Marketing build complete:',path.relative(root,target));
