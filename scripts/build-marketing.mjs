import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const source=path.join(root,'public');
const target=path.join(root,'dist','marketing');

const required=[
  'index.html',
  'privacy/index.html',
  'voorwaarden/index.html',
  'support/index.html',
  'account-verwijderen/index.html',
  'assets/onepage.css',
  'assets/marketing.js'
].map(file=>path.join(source,file));
for(const file of required)if(!fs.existsSync(file))throw new Error('Missing marketing source: '+path.relative(root,file));

fs.rmSync(target,{recursive:true,force:true});
fs.mkdirSync(path.dirname(target),{recursive:true});
fs.cpSync(source,target,{recursive:true});

fs.rmSync(path.join(target,'manifest.webmanifest'),{force:true});
fs.rmSync(path.join(target,'assets','product'),{recursive:true,force:true});
for(const asset of ['mobile-polish-round-2.css','mobile-polish-round-2.js'])fs.rmSync(path.join(target,'assets',asset),{force:true});

for(const removed of ['functies','facturen','scanner','btw-bank','rapportages','hoe-het-werkt','voor-ondernemers','prijzen','faq','over','contact','veiligheid']){
  if(fs.existsSync(path.join(target,removed)))throw new Error('Obsolete active marketing route still present: '+removed);
}
const home=fs.readFileSync(path.join(target,'index.html'),'utf8');
if(home.includes('/assets/homepage.')||home.includes('/assets/marketing-editorial.'))throw new Error('One-page homepage still loads legacy marketing runtime');
if(home.includes('/assets/product/'))throw new Error('One-page homepage must not reference product screenshots');
console.log('Marketing one-page build complete:',path.relative(root,target));
