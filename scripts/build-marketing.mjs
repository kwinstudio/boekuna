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

const retiredRedirects={
  'functies':'/#product',
  'facturen':'/#product',
  'scanner':'/#product',
  'btw-bank':'/#product',
  'rapportages':'/#product',
  'hoe-het-werkt':'/#hoe-het-werkt',
  'voor-ondernemers':'/#waarom',
  'prijzen':'/#prijzen',
  'faq':'/#faq',
  'over':'/#waarom',
  'contact':'/#contact',
  'veiligheid':'/#veiligheid'
};
for(const [slug,destination] of Object.entries(retiredRedirects)){
  const dir=path.join(target,slug);
  fs.rmSync(dir,{recursive:true,force:true});
  fs.mkdirSync(dir,{recursive:true});
  const safeDestination=JSON.stringify(destination);
  const html='<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<meta name="robots" content="noindex,follow"><link rel="canonical" href="https://boekuna.nl/">'
    +'<meta http-equiv="refresh" content="0;url='+destination+'"><title>Doorsturen | Boekuna</title></head>'
    +'<body><main><p>Deze pagina staat nu op de <a href="'+destination+'">Boekuna-homepage</a>.</p></main>'
    +'<script>location.replace('+safeDestination+');</script></body></html>';
  fs.writeFileSync(path.join(dir,'index.html'),html);
}

const home=fs.readFileSync(path.join(target,'index.html'),'utf8');
if(home.includes('/assets/homepage.')||home.includes('/assets/marketing-editorial.'))throw new Error('One-page homepage still loads legacy marketing runtime');
if(home.includes('/assets/product/'))throw new Error('One-page homepage must not reference product screenshots');

for(const [slug,destination] of Object.entries(retiredRedirects)){
  const redirect=fs.readFileSync(path.join(target,slug,'index.html'),'utf8');
  if(!redirect.includes('location.replace('+JSON.stringify(destination)+')'))throw new Error('Generated redirect missing runtime target: '+slug);
  if(!redirect.includes('content="0;url='+destination+'"'))throw new Error('Generated redirect missing no-JS target: '+slug);
}
console.log('Marketing one-page build complete:',path.relative(root,target),'with',Object.keys(retiredRedirects).length,'retired-route redirects');
