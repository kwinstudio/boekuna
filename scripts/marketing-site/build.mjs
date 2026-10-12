// Generates the boekuna.nl pages in public/ from the page modules in this folder.
//   node scripts/marketing-site/build.mjs           write the pages
//   node scripts/marketing-site/build.mjs --check   fail if public/ is out of date
// The Render marketing build (scripts/build-marketing.mjs) only copies public/, so commit the output.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import home from './pages/home.mjs';
import {functies,facturen,bonnen,slimScannen,btw,bank,rapportages} from './pages/features.mjs';
import {hoeHetWerkt,zzp,prijzen,veiligheid,overOns,faq} from './pages/info.mjs';
import {kennisbank,article,ARTICLES} from './pages/kennisbank.mjs';
import {privacy,voorwaarden,support,accountVerwijderen,notFound} from './pages/legal.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const out=path.join(root,'public');
const LASTMOD='2026-10-12';

// route -> [html, sitemap priority or null when the page is not listed]
const pages=new Map([
  ['/',[home(),'1.0']],
  ['/functies/',[functies(),'0.9']],
  ['/facturen/',[facturen(),'0.9']],
  ['/bonnen/',[bonnen(),'0.9']],
  ['/slim-scannen/',[slimScannen(),'0.9']],
  ['/btw/',[btw(),'0.9']],
  ['/bank/',[bank(),'0.8']],
  ['/rapportages/',[rapportages(),'0.8']],
  ['/hoe-het-werkt/',[hoeHetWerkt(),'0.8']],
  ['/zzp/',[zzp(),'0.9']],
  ['/prijzen/',[prijzen(),'0.9']],
  ['/veiligheid/',[veiligheid(),'0.7']],
  ['/over-ons/',[overOns(),'0.6']],
  ['/faq/',[faq(),'0.7']],
  ['/kennisbank/',[kennisbank(),'0.7']],
  ...ARTICLES.map(a=>[`/kennisbank/${a.slug}/`,[article(a),'0.6']]),
  ['/support/',[support(),'0.5']],
  ['/privacy/',[privacy(),'0.3']],
  ['/voorwaarden/',[voorwaarden(),'0.3']],
  ['/account-verwijderen/',[accountVerwijderen(),'0.3']],
  ['/404.html',[notFound(),null]]
]);

const files=new Map();
for(const [route,[html]] of pages)files.set(route==='/404.html'?'404.html':path.join(route.slice(1),'index.html'),html);
files.set('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...pages].filter(([,[,p]])=>p).map(([route,[,p]])=>`  <url><loc>https://boekuna.nl${route}</loc><lastmod>${LASTMOD}</lastmod><priority>${p}</priority></url>`).join('\n')}\n</urlset>\n`);
files.set('robots.txt','User-agent: *\nAllow: /\n\nSitemap: https://boekuna.nl/sitemap.xml\n');

export const ROUTES=[...pages.keys()].filter(r=>r!=='/404.html');

export const PAGE_FILES=[...files.keys()].filter(f=>f.endsWith('.html'));

if(process.argv[1]===fileURLToPath(import.meta.url)){
const check=process.argv.includes('--check');
const stale=[];
for(const [rel,html] of files){
  const file=path.join(out,rel);
  const current=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;
  if(current===html)continue;
  if(check){stale.push(rel);continue}
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,html);
}
if(check&&stale.length){console.error('public/ is out of date, run node scripts/marketing-site/build.mjs:\n'+stale.join('\n'));process.exit(1)}
console.log(check?'Marketing pages up to date: '+files.size+' files':'Wrote '+files.size+' marketing files to public/');
}
