import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require=createRequire(new URL('../tests/package.json',import.meta.url));
const sharp=require('sharp');
const root=process.cwd();
const assets=path.join(root,'public','assets');

async function render(source,name,width,height=width,fit='contain'){
  const input=path.join(assets,source);
  if(!fs.existsSync(input)) throw new Error('Missing brand source: '+input);
  const out=path.join(assets,name);
  await sharp(input,{density:512}).resize(width,height,{fit}).png({compressionLevel:9,adaptiveFiltering:true}).toFile(out);
  const stat=fs.statSync(out);
  if(stat.size<150) throw new Error('Generated asset is unexpectedly small: '+out);
  console.log('Generated '+path.relative(root,out)+' ('+stat.size+' bytes)');
}
for(const size of [180,192,512,1024]) await render('boekuna-app-icon.svg','boekuna-app-icon-'+size+'.png',size);
await render('boekuna-app-icon-maskable.svg','boekuna-app-icon-maskable-512.png',512);
for(const size of [16,32,48,64]) await render('boekuna-app-favicon.svg','favicon-'+size+'.png',size);
await render('boekuna-symbol.svg','boekuna-logo-master-1024.png',1024);
await render('boekuna-app-icon.svg','boekuna-social-avatar-1024.png',1024);
await render('boekuna-og-template.svg','boekuna-og-1200x630.png',1200,630,'fill');
await render('boekuna-app-icon.svg','apple-touch-icon.png',180);
