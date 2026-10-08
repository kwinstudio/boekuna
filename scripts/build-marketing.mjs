import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..'),source=path.join(root,'public'),target=path.join(root,'dist','marketing');
const preserved=['index.html','404.html','privacy/index.html','voorwaarden/index.html','support/index.html','account-verwijderen/index.html','assets/baseline.css','assets/favicon.svg','robots.txt','sitemap.xml'];
const retiredRoutes=['functies','assistent','scanner','prijzen','veiligheid','faq','facturen','bonnen','btw','bank','rapportages','mobiel','hoe-het-werkt'];
for(const rel of preserved){const file=path.join(source,rel);if(!fs.existsSync(file))throw new Error('Missing clean marketing source: '+rel)}
for(const slug of retiredRoutes)if(fs.existsSync(path.join(source,slug,'index.html')))throw new Error('Retired marketing source content still exists: '+slug);
fs.rmSync(target,{recursive:true,force:true});
for(const rel of preserved){const from=path.join(source,rel),to=path.join(target,rel);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to)}
function retiredHolding(){return '<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><meta name="theme-color" content="#FFFFFF"><title>Boekuna — nieuwe website in ontwikkeling</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/baseline.css"></head><body><a class="skip-link" href="#main">Naar inhoud</a><main class="holding" id="main"><div class="holding-inner"><a class="holding-mark" href="/" aria-label="Boekuna">BOEKUNA</a><h1>Nieuwe website in ontwikkeling.</h1><p>Deze oude BOEKUNA-pagina is verwijderd. De nieuwe website wordt vanaf nul opgebouwd.</p><div class="holding-actions"><a class="btn" href="/">Naar home</a><a class="btn primary" href="https://app.boekuna.nl/?login=1">Inloggen</a></div><nav class="holding-links" aria-label="Publieke informatie"><a href="/privacy/">Privacy</a><a href="/voorwaarden/">Voorwaarden</a><a href="/support/">Support</a></nav></div></main></body></html>'}
for(const slug of retiredRoutes){const dir=path.join(target,slug);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'index.html'),retiredHolding())}
for(const forbidden of ['assets/site.css','assets/site.js','assets/editorial-marketing.css','assets/editorial-marketing.js','assets/premium-marketing.css','assets/premium-marketing.js','assets/onepage.css','assets/marketing.js','assets/marketing-people','assets/stories','assets/product','manifest.webmanifest'])if(fs.existsSync(path.join(target,forbidden)))throw new Error('Obsolete marketing artifact leaked into build: '+forbidden);
const home=fs.readFileSync(path.join(target,'index.html'),'utf8');
if(!home.includes('<meta name="robots" content="index,follow">'))throw new Error('Public landing page must be indexable');
if(!home.includes('Boekhouden zonder gedoe'))throw new Error('BOEKUNA V3 landing page missing');
if(!home.includes('https://app.boekuna.nl/?login=1'))throw new Error('Holding page must link to isolated app login');
if(['editorial-hero','editorial-pricing','project-grid','audience-grid'].some(token=>home.includes(token)))throw new Error('Old marketing homepage structure returned');
console.log('Marketing V3 landing build complete:',path.relative(root,target),'with',retiredRoutes.length,'retired route holdings');
