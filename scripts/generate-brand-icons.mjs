import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require=createRequire(new URL('../tests/package.json',import.meta.url));
const sharp=require('sharp');

const root=process.cwd();
const source=path.join(root,'public','assets','boekuna-app-icon.svg');
const sizes=[180,192,512,1024];

if(!fs.existsSync(source)) throw new Error('Missing app icon master: '+source);

for(const size of sizes){
  const out=path.join(root,'public','assets',`boekuna-app-icon-${size}.png`);
  await sharp(source,{density:384})
    .resize(size,size,{fit:'contain'})
    .png({compressionLevel:9,adaptiveFiltering:true,palette:true})
    .toFile(out);
  const stat=fs.statSync(out);
  if(stat.size<1000) throw new Error(`Generated icon is unexpectedly small: ${out}`);
  console.log(`Generated ${path.relative(root,out)} (${stat.size} bytes)`);
}
