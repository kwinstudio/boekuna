import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PAGE_FILES} from './marketing-site/build.mjs';
import {redirectPage} from './marketing-site/pages/legal.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..'),source=path.join(root,'public'),target=path.join(root,'dist','marketing');
const pages=PAGE_FILES.filter(f=>f!=='index.html'&&f!=='404.html').map(f=>f.replace(/\/index\.html$/,''));
// Old URLs that moved. Each gets a small noindex page that forwards to its new home.
const movedRoutes={assistent:'/functies/',scanner:'/slim-scannen/',mobiel:'/functies/',contact:'/support/'};
const fixed=['robots.txt','sitemap.xml','favicon.ico','assets/apple-touch-icon.png','assets/favicon.svg','assets/boekuna-favicon.svg','assets/boekuna-symbol.svg','assets/site/og-boekuna.png','assets/site/site.js','assets/fonts/LICENSE-Inter.txt','assets/fonts/LICENSE-SpaceGrotesk.txt'];
// Copy every page plus every /assets/ file the pages and stylesheets reference, nothing else.
const assetRefs=new Set();
const collect=text=>{for(const m of text.matchAll(/\/(assets\/[A-Za-z0-9_\-./]+?\.(?:css|js|webp|png|svg|woff2|ico|jpg))\b/g))assetRefs.add(m[1])};
for(const rel of PAGE_FILES){const file=path.join(source,rel);if(!fs.existsSync(file))throw new Error('Missing marketing page, run node scripts/marketing-site/build.mjs: '+rel);collect(fs.readFileSync(file,'utf8'))}
for(const css of ['assets/baseline.css','assets/site/site.css'])collect(fs.readFileSync(path.join(source,css),'utf8'));
const preserved=[...new Set([...PAGE_FILES,...fixed,...assetRefs])].sort();
for(const rel of preserved){const file=path.join(source,rel);if(!fs.existsSync(file))throw new Error('Missing clean marketing source: '+rel)}
for(const slug of Object.keys(movedRoutes))if(fs.existsSync(path.join(source,slug,'index.html')))throw new Error('Moved marketing route still has its own source page: '+slug);
fs.rmSync(target,{recursive:true,force:true});
for(const rel of preserved){const from=path.join(source,rel),to=path.join(target,rel);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to)}
for(const [slug,to] of Object.entries(movedRoutes)){const dir=path.join(target,slug);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'index.html'),redirectPage(to))}
for(const forbidden of ['assets/site.css','assets/site.js','assets/editorial-marketing.css','assets/editorial-marketing.js','assets/premium-marketing.css','assets/premium-marketing.js','assets/onepage.css','assets/marketing.js','assets/landing-v4.css','assets/marketing-people','assets/stories','assets/product','manifest.webmanifest','oauth'])if(fs.existsSync(path.join(target,forbidden)))throw new Error('Obsolete marketing artifact leaked into build: '+forbidden);
const home=fs.readFileSync(path.join(target,'index.html'),'utf8');
if(!home.includes('<meta name="robots" content="index,follow">'))throw new Error('Public landing page must be indexable');
if(!/^Boekhouden/.test((home.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)||[,''])[1].replace(/<[^>]+>/g,'').trim()))throw new Error('Homepage H1 must say what Boekuna is');
if(!home.includes('/assets/site/site.css'))throw new Error('Site styles missing');
if(!fs.readFileSync(path.join(target,'functies','index.html'),'utf8').includes('/assets/site/app-desktop-dashboard.webp'))throw new Error('Real app screenshot missing from the features page');
for(const p of pages){const html=fs.readFileSync(path.join(target,p,'index.html'),'utf8');if(!html.includes('<meta name="robots" content="index,follow">')||!html.includes('KVK 74542893'))throw new Error('Public page incomplete: '+p)}
for(const f of fs.readdirSync(path.join(target,'assets/site')))if(f.endsWith('.webp')&&fs.statSync(path.join(target,'assets/site',f)).size>120000)throw new Error('Marketing image exceeds budget: '+f);
if(!home.includes('https://app.boekuna.nl/?login=1'))throw new Error('Landing page must link to isolated app login');
if(!home.includes('https://app.boekuna.nl/?register=1'))throw new Error('Landing page must link to the app sign-up');
if(['editorial-hero','editorial-pricing','project-grid'].some(token=>home.includes(token)))throw new Error('Old marketing homepage structure returned');
// Preview URLs are publicly viewable but must not compete with the canonical marketing domain.
// This flag is configured exclusively on the isolated Render preview service.
if(process.env.BOEKUNA_MARKETING_PREVIEW==='1'){
  const marker='<meta name="robots" content="index,follow">';
  if(!home.includes(marker))throw new Error('Indexable robots marker missing for preview transform');
  for(const p of ['',...pages]){const f=path.join(target,p,'index.html');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(marker,'<meta name="robots" content="noindex,nofollow">'))}
}
console.log('Marketing build complete:',path.relative(root,target),'with',pages.length+1,'pages,',assetRefs.size,'assets and',Object.keys(movedRoutes).length,'moved routes');
