import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const source=path.join(root,'public');
const target=path.join(root,'dist','marketing');
const cacheDir=path.join(root,'.cache','marketing-fonts');

const SPACE_GROTESK_COMMIT='9710da1eacb3be272583c3224dcb70f9da6eadbb';
const SPACE_GROTESK_URL='https://raw.githubusercontent.com/google/fonts/'+SPACE_GROTESK_COMMIT+'/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf';
const SPACE_GROTESK_LICENSE_URL='https://raw.githubusercontent.com/google/fonts/'+SPACE_GROTESK_COMMIT+'/ofl/spacegrotesk/OFL.txt';

const required=[
  'index.html',
  'functies/index.html',
  'assistent/index.html',
  'scanner/index.html',
  'prijzen/index.html',
  'veiligheid/index.html',
  'faq/index.html',
  'privacy/index.html',
  'voorwaarden/index.html',
  'support/index.html',
  'account-verwijderen/index.html',
  'assets/site.css',
  'assets/site.js',
  'assets/favicon.svg',
  'assets/boekuna-og-1200x630.png',
  'assets/marketing-editorial/InterVariable.woff2',
  'assets/marketing-editorial/Inter-LICENSE.txt',
  'robots.txt',
  'sitemap.xml'
].map(file=>path.join(source,file));

for(const file of required){
  if(!fs.existsSync(file))throw new Error('Missing marketing source: '+path.relative(root,file));
}

async function cacheRemote(url,name){
  fs.mkdirSync(cacheDir,{recursive:true});
  const file=path.join(cacheDir,name);
  if(fs.existsSync(file)&&fs.statSync(file).size>1000)return file;
  const response=await fetch(url,{redirect:'follow'});
  if(!response.ok)throw new Error('Could not fetch pinned font asset '+name+': HTTP '+response.status);
  fs.writeFileSync(file,Buffer.from(await response.arrayBuffer()));
  return file;
}

const [spaceGrotesk,spaceLicense]=await Promise.all([
  cacheRemote(SPACE_GROTESK_URL,'SpaceGrotesk-Variable.ttf'),
  cacheRemote(SPACE_GROTESK_LICENSE_URL,'SpaceGrotesk-LICENSE.txt')
]);

fs.rmSync(target,{recursive:true,force:true});
fs.mkdirSync(path.dirname(target),{recursive:true});
fs.cpSync(source,target,{recursive:true});

// Repair old public destinations in the marketing artifact only. Legal/support
// sources are also used by the app and remain byte-for-byte unchanged.
for(const page of ['404.html','support/index.html']){
  const file=path.join(target,page);
  fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll('href="/#faq"','href="/faq/"').replaceAll('href="/#product"','href="/functies/"'));
}

// Release 1 keeps the upcoming assistant page as roadmap information, but does not
// present it as a current primary product capability.
const featurePages=['facturen','bonnen','btw','bank','rapportages','mobiel','hoe-het-werkt'];
const releaseMarketingPages=['index.html','functies/index.html','assistent/index.html','scanner/index.html','prijzen/index.html','veiligheid/index.html','faq/index.html',...featurePages.map(slug=>slug+'/index.html')];
for(const page of releaseMarketingPages){
  const file=path.join(target,page);
  let html=fs.readFileSync(file,'utf8');
  html=html
    .replace(/\s*<a href="\/assistent\/"><span class="ico">[\s\S]*?<strong>Persoonlijke assistent<\/strong><span class="d">Wat jij vandaag moet weten<\/span><\/span><\/a>/g,'')
    .replace(/\s*<a href="\/assistent\/" data-nav="assistent"[^>]*>Assistent<\/a>/g,'')
    .replace(/\s*<a href="\/assistent\/">Persoonlijke assistent<\/a>/g,'')
    .replace(/<li><a href="\/assistent\/">Assistent<\/a><\/li>/g,'');
  fs.writeFileSync(file,html);
}

// Product screenshot captures are internal QA/history only and are not shipped on the public website.
fs.rmSync(path.join(target,'assets','stories'),{recursive:true,force:true});

// The public marketing host is not the installable product app.
fs.rmSync(path.join(target,'manifest.webmanifest'),{force:true});

for(const asset of ['personal-insights.css','personal-insights.js','personal-insights-ui.js','personal-assistant-qna.js']){
  fs.rmSync(path.join(target,'assets',asset),{force:true});
}

const fontsDir=path.join(target,'assets','fonts');
fs.mkdirSync(fontsDir,{recursive:true});
fs.copyFileSync(spaceGrotesk,path.join(fontsDir,'SpaceGrotesk-Variable.ttf'));
fs.copyFileSync(spaceLicense,path.join(fontsDir,'SpaceGrotesk-LICENSE.txt'));
fs.copyFileSync(path.join(source,'assets','marketing-editorial','InterVariable.woff2'),path.join(fontsDir,'InterVariable.woff2'));
fs.copyFileSync(path.join(source,'assets','marketing-editorial','Inter-LICENSE.txt'),path.join(fontsDir,'Inter-LICENSE.txt'));

const retiredRedirects={
  'btw-bank':'/btw/',
  'voor-ondernemers':'/',
  'over':'/',
  'contact':'/support/'
};

for(const [slug,destination] of Object.entries(retiredRedirects)){
  const dir=path.join(target,slug);
  fs.rmSync(dir,{recursive:true,force:true});
  fs.mkdirSync(dir,{recursive:true});
  const safeDestination=JSON.stringify(destination);
  const canonical=destination.startsWith('/#')?'https://boekuna.nl/':'https://boekuna.nl'+destination;
  const html='<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<meta name="robots" content="noindex,follow"><link rel="canonical" href="'+canonical+'">'
    +'<meta http-equiv="refresh" content="0;url='+destination+'"><title>Doorsturen | Boekuna</title></head>'
    +'<body><main><p>Deze pagina is verplaatst. <a href="'+destination+'">Ga verder</a>.</p></main>'
    +'<script>location.replace('+safeDestination+');</script></body></html>';
  fs.writeFileSync(path.join(dir,'index.html'),html);
}

// Editorial presentation belongs to marketing, never the shared product app.
function editorialPages(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())editorialPages(file);
    else if(entry.name.endsWith('.html')){
      let html=fs.readFileSync(file,'utf8').replaceAll('href="/assets/favicon.svg"','href="/assets/editorial-favicon.svg"');
      if(html.includes('id="mnav"')&&!html.includes('class="mnav-primary"')){
        html=html.replace(/(<nav class="mnav"[\s\S]*?<a href="https:\/\/app\.boekuna\.nl\/\?login=1">Inloggen<\/a>)([\s\S]*?<\/nav>)/,'$1\n  <a class="mnav-primary" href="https://app.boekuna.nl/?register=1">Probeer gratis</a>$2');
      }
      if(!html.includes('/assets/editorial-marketing.css'))html=html.replace('</head>','<link rel="stylesheet" href="/assets/editorial-marketing.css">\n</head>');
      if(html.includes('id="burger"')&&!html.includes('/assets/editorial-marketing.js'))html=html.replace('</body>','<script src="/assets/editorial-marketing.js" defer></script>\n</body>');
      fs.writeFileSync(file,html);
    }
  }
}
editorialPages(target);

const pages=['index.html','functies/index.html','assistent/index.html','scanner/index.html','prijzen/index.html','veiligheid/index.html','faq/index.html'];
for(const page of pages){
  const html=fs.readFileSync(path.join(target,page),'utf8');
  if(!html.includes('/assets/site.css'))throw new Error(page+': site.css missing');
  if(!html.includes('/assets/site.js'))throw new Error(page+': site.js missing');
  if(!html.includes('https://app.boekuna.nl/?'))throw new Error(page+': product CTA/login handoff missing');
  if(/accounts\.google\.com|gmail\.send|Doorgaan met Google/i.test(html))throw new Error(page+': forbidden Google auth/mailbox integration');
}

const home=fs.readFileSync(path.join(target,'index.html'),'utf8');
for(const claim of ['Boekhouden','boekhoudtaal.','Probeer Boekuna gratis']){
  if(!home.includes(claim))throw new Error('Homepage proposition missing: '+claim);
}

const assistant=fs.readFileSync(path.join(target,'assistent','index.html'),'utf8');
if(!assistant.includes('Binnenkort'))throw new Error('Assistant page must stay marked as upcoming until the feature is released');

for(const font of ['SpaceGrotesk-Variable.ttf','InterVariable.woff2']){
  if(!fs.existsSync(path.join(fontsDir,font)))throw new Error('Built marketing font missing: '+font);
}

console.log('Marketing multipage build complete:',path.relative(root,target),'with',pages.length,'product pages and',Object.keys(retiredRedirects).length,'legacy redirects');
