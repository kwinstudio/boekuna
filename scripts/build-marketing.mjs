import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const source=path.join(root,'public');
const target=path.join(root,'dist','marketing');
const cacheDir=path.join(root,'.cache','marketing-fonts');
const siteChunkDir=path.join(root,'marketing-site','chunks');

const SPACE_GROTESK_COMMIT='9710da1eacb3be272583c3224dcb70f9da6eadbb';
const SPACE_GROTESK_URL='https://raw.githubusercontent.com/google/fonts/'+SPACE_GROTESK_COMMIT+'/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf';
const SPACE_GROTESK_LICENSE_URL='https://raw.githubusercontent.com/google/fonts/'+SPACE_GROTESK_COMMIT+'/ofl/spacegrotesk/OFL.txt';
const SITE_ARCHIVE_SHA256='976cc0dd8d8a9d6f7fd3ce4a3dc54221b1b8f28237ff1fd5bc02b77a0a205cfe';

const retained=[
  'privacy/index.html',
  'voorwaarden/index.html',
  'support/index.html',
  'account-verwijderen/index.html',
  'assets/onepage.css',
  'assets/marketing.js',
  'assets/boekuna-marketing-favicon.svg',
  'assets/marketing-editorial/InterVariable.woff2',
  'assets/marketing-editorial/Inter-LICENSE.txt',
  'assets/boekuna-og-1200x630.png'
];
for(const file of retained.map(file=>path.join(source,file))){
  if(!fs.existsSync(file))throw new Error('Missing retained marketing source: '+path.relative(root,file));
}
if(!fs.existsSync(siteChunkDir))throw new Error('Missing uploaded multipage site chunks');

const chunkNames=fs.readdirSync(siteChunkDir).filter(name=>/^\d\d\.b64$/.test(name)).sort();
if(chunkNames.length!==8)throw new Error('Expected 8 multipage site archive chunks, found '+chunkNames.length);
const archiveBase64=chunkNames.map(name=>fs.readFileSync(path.join(siteChunkDir,name),'utf8').trim()).join('');
const archive=Buffer.from(archiveBase64,'base64');
const archiveHash=crypto.createHash('sha256').update(archive).digest('hex');
if(archiveHash!==SITE_ARCHIVE_SHA256)throw new Error('Uploaded multipage site archive hash mismatch: '+archiveHash);

async function cacheRemote(url,name){
  fs.mkdirSync(cacheDir,{recursive:true});
  const file=path.join(cacheDir,name);
  if(fs.existsSync(file)&&fs.statSync(file).size>1000)return file;
  const response=await fetch(url,{redirect:'follow'});
  if(!response.ok)throw new Error('Could not fetch pinned marketing font asset '+name+': HTTP '+response.status);
  const buffer=Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(file,buffer);
  return file;
}

const [spaceGrotesk,spaceLicense]=await Promise.all([
  cacheRemote(SPACE_GROTESK_URL,'SpaceGrotesk-Variable.ttf'),
  cacheRemote(SPACE_GROTESK_LICENSE_URL,'SpaceGrotesk-LICENSE.txt')
]);

fs.rmSync(target,{recursive:true,force:true});
fs.mkdirSync(path.dirname(target),{recursive:true});
fs.cpSync(source,target,{recursive:true});

// Marketing and product remain separate deployable surfaces.
fs.rmSync(path.join(target,'manifest.webmanifest'),{force:true});
for(const asset of [
  'mobile-polish-round-2.css',
  'mobile-polish-round-2.js',
  'mobile-product.css',
  'mobile-product.js',
  'document-review-v2.css',
  'document-review-v2.js',
  'marketing.css',
  'marketing-editorial.css',
  'marketing-editorial.js'
])fs.rmSync(path.join(target,'assets',asset),{force:true});

// Self-host the same pinned fonts used by the uploaded multipage website.
const fontsDir=path.join(target,'assets','fonts');
fs.mkdirSync(fontsDir,{recursive:true});
fs.copyFileSync(spaceGrotesk,path.join(fontsDir,'SpaceGrotesk-Variable.ttf'));
fs.copyFileSync(spaceLicense,path.join(fontsDir,'SpaceGrotesk-LICENSE.txt'));
fs.copyFileSync(path.join(source,'assets','marketing-editorial','InterVariable.woff2'),path.join(fontsDir,'InterVariable.woff2'));
fs.copyFileSync(path.join(source,'assets','marketing-editorial','Inter-LICENSE.txt'),path.join(fontsDir,'Inter-LICENSE.txt'));

// Reconstruct the user-supplied static website from the reviewed immutable archive.
const archiveDir=path.join(root,'.cache','marketing-site');
fs.mkdirSync(archiveDir,{recursive:true});
const archiveFile=path.join(archiveDir,'boekuna-website.tar.gz');
fs.writeFileSync(archiveFile,archive);

const listing=spawnSync('tar',['-tzf',archiveFile],{encoding:'utf8'});
if(listing.status!==0)throw new Error('Could not inspect multipage site archive: '+listing.stderr);
const entries=listing.stdout.split(/\r?\n/).filter(Boolean);
for(const entry of entries){
  const normalized=entry.replace(/^\.\//,'');
  if(path.isAbsolute(normalized)||normalized.split('/').includes('..'))throw new Error('Unsafe archive path: '+entry);
}
const extract=spawnSync('tar',['-xzf',archiveFile,'-C',target],{encoding:'utf8'});
if(extract.status!==0)throw new Error('Could not extract multipage site archive: '+extract.stderr);

// Legal/support endpoints are intentionally retained from the production source tree.
const requiredPages=[
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
  'account-verwijderen/index.html'
];
for(const file of requiredPages){
  if(!fs.existsSync(path.join(target,file)))throw new Error('Built marketing page missing: '+file);
}
for(const file of ['site.css','site.js','favicon.svg']){
  if(!fs.existsSync(path.join(target,'assets',file)))throw new Error('Built multipage asset missing: '+file);
}
for(const font of ['SpaceGrotesk-Variable.ttf','InterVariable.woff2']){
  if(!fs.existsSync(path.join(fontsDir,font)))throw new Error('Built marketing font missing: '+font);
}

const home=fs.readFileSync(path.join(target,'index.html'),'utf8');
const assistant=fs.readFileSync(path.join(target,'assistent','index.html'),'utf8');
const runtime=fs.readFileSync(path.join(target,'assets','site.js'),'utf8');
const prices=fs.readFileSync(path.join(target,'prijzen','index.html'),'utf8')+runtime;
if(!home.includes('Je bent ondernemer.')||!home.includes('Geen boekhouder.'))throw new Error('Multipage homepage proposition missing');
if(!home.includes('https://app.boekuna.nl/?login=1')||!home.includes('https://app.boekuna.nl/?register=1'))throw new Error('Marketing-to-app auth handoff missing');
for(const price of ['€0','€9,95','€19,95'])if(!prices.includes(price))throw new Error('Current price missing: '+price);
for(const stale of ['€6,95','€14,95'])if(prices.includes(stale))throw new Error('Stale price remains: '+stale);
if(!/binnenkort/i.test(assistant)||!/Nog niet/i.test(runtime))throw new Error('Personal Assistant must remain clearly marked as not live');
if(/accounts\.google\.com|Doorgaan met Google|gmail\.send/i.test(home+runtime))throw new Error('Google login/mailbox OAuth must remain disabled on marketing site');

console.log(
  'Marketing multipage build complete:',
  path.relative(root,target),
  'archive',archiveHash.slice(0,12),
  'pages',requiredPages.length,
  'with retained legal/support endpoints and local Space Grotesk + Inter fonts'
);
