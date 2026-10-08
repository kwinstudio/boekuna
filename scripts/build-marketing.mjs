import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..'),source=path.join(root,'public'),target=path.join(root,'dist','marketing');
const preserved=['index.html','404.html','privacy/index.html','voorwaarden/index.html','support/index.html','account-verwijderen/index.html','assets/baseline.css','assets/favicon.svg','assets/boekuna-symbol.svg','assets/boekuna-favicon.svg','assets/landing-v4.css','assets/site/site.css','assets/site/site.js','assets/site/app-desktop-dashboard.webp','assets/site/app-desktop-invoices.webp','assets/site/app-desktop-review.webp','assets/site/app-desktop-vat.webp','assets/site/app-mobile-dashboard.webp','assets/site/app-mobile-invoices.webp','assets/site/app-mobile-review.webp','assets/site/app-mobile-vat.webp','assets/site/foto-kapper.webp','assets/site/foto-vakman.webp','assets/site/foto-bloemist.webp','assets/site/foto-creatief.webp','robots.txt','sitemap.xml'];
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
if(!home.includes('Boekhouden'))throw new Error('BOEKUNA V4 landing page missing');
if(!home.includes('/assets/landing-v4.css'))throw new Error('V4 styles missing');
if(!home.includes('/assets/site/app-desktop-dashboard.webp'))throw new Error('Real app screenshot missing from landing page');
for(const f of fs.readdirSync(path.join(target,'assets/site')))if(f.endsWith('.webp')&&fs.statSync(path.join(target,'assets/site',f)).size>120000)throw new Error('Marketing image exceeds budget: '+f);
if(!home.includes('https://app.boekuna.nl/?login=1'))throw new Error('Landing page must link to isolated app login');
if(['editorial-hero','editorial-pricing','project-grid'].some(token=>home.includes(token)))throw new Error('Old marketing homepage structure returned');
// Preview URLs are publicly viewable but must not compete with the canonical marketing domain.
// This flag is configured exclusively on the isolated Render preview service.
if(process.env.BOEKUNA_MARKETING_PREVIEW==='1'){
  const marker='<meta name="robots" content="index,follow">';
  if(!home.includes(marker))throw new Error('V3 indexable robots marker missing for preview transform');
  fs.writeFileSync(path.join(target,'index.html'),home.replace(marker,'<meta name="robots" content="noindex,nofollow">'));
}
console.log('Marketing V4 landing build complete:',path.relative(root,target),'with',retiredRoutes.length,'retired route holdings');
