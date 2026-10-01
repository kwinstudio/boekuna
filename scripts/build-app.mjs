import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const target=path.join(root,'dist','app');
const appSource=path.join(root,'kwinest','index.html');
const manifestSource=path.join(root,'public','manifest.webmanifest');
const assetsSource=path.join(root,'public','assets');
const appAssets=[
  'boekuna-app-icon-180.png',
  'boekuna-app-icon-192.png',
  'boekuna-app-icon-512.png',
  'boekuna-app-icon-maskable-512.png',
  'boekuna-app-icon.svg',
  'boekuna-favicon.svg',
  'boekuna-symbol-reversed.svg',
  'boekuna-symbol.svg',
  'brand-v2.css',
  'favicon-32.png',
  'financial-correction.js',
  'developer-mode.js'
];

for(const file of [appSource,manifestSource,assetsSource]){
  if(!fs.existsSync(file))throw new Error('Missing app build source: '+path.relative(root,file));
}

let appHtml=fs.readFileSync(appSource,'utf8');

const devFlag=String(process.env.BOEKUNA_DEV_MODE||'').trim().toLowerCase();
const developerModeEnabled=['1','true','yes','on'].includes(devFlag);
const deploymentEnvironment=String(process.env.BOEKUNA_DEPLOYMENT_ENV||'production').trim().toLowerCase();
const developerAllowedOrigins=String(process.env.BOEKUNA_DEV_ALLOWED_ORIGINS||'').split(',').map(v=>v.trim().replace(/\/$/,'')).filter(Boolean);
const productionOrigins=new Set([
  'https://app.boekuna.nl',
  'https://boekuna.nl',
  'https://www.boekuna.nl',
  'https://boekuna-boekhouding.onrender.com',
  'https://kwinest-boekhouding.onrender.com'
]);
if(developerModeEnabled){
  if(!['development','preview','staging'].includes(deploymentEnvironment)){
    throw new Error('Refusing Developer Mode for production or unknown environment: '+deploymentEnvironment);
  }
  if(!developerAllowedOrigins.length||developerAllowedOrigins.some(origin=>productionOrigins.has(origin))){
    throw new Error('Developer Mode requires an explicit non-production origin allowlist');
  }
  const devSupabaseUrl=String(process.env.BOEKUNA_SUPABASE_URL||'').trim().replace(/\/$/,'');
  const devSupabaseKey=String(process.env.BOEKUNA_SUPABASE_PUBLISHABLE_KEY||'').trim();
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(devSupabaseUrl)||devSupabaseUrl==='https://vuwfyhtejsxhdfyvkkeq.supabase.co'){
    throw new Error('Developer Mode requires an explicit non-production Supabase project');
  }
  if(!devSupabaseKey)throw new Error('Developer Mode requires BOEKUNA_SUPABASE_PUBLISHABLE_KEY');
  const defaultConfig="window.BOEKUNA_DEV_MODE_CONFIG=Object.freeze({enabled:false,environment:'production',allowedOrigins:[]});";
  if(!appHtml.includes(defaultConfig))throw new Error('Developer Mode source marker missing');
  appHtml=appHtml.replace(defaultConfig,
    "window.BOEKUNA_DEV_MODE_CONFIG=Object.freeze({enabled:true,environment:"+JSON.stringify(deploymentEnvironment)+",allowedOrigins:"+JSON.stringify(developerAllowedOrigins)+"});");
  const prodUrl="const SUPABASE_URL='https://vuwfyhtejsxhdfyvkkeq.supabase.co';";
  const prodKey="const SUPABASE_PUBLISHABLE_KEY='sb_publishable_miAZ6CBZShVcmmNwlnEDgA_aGw1X4aP';";
  if(!appHtml.includes(prodUrl)||!appHtml.includes(prodKey))throw new Error('Supabase source markers changed');
  appHtml=appHtml.replace(prodUrl,"const SUPABASE_URL="+JSON.stringify(devSupabaseUrl)+";");
  appHtml=appHtml.replace(prodKey,"const SUPABASE_PUBLISHABLE_KEY="+JSON.stringify(devSupabaseKey)+";");
}

// Strangler step: keep the legacy combined source available for rollback while
// producing an app-only deploy artifact. These markers are intentionally strict:
// if the legacy document changes, fail the build rather than silently ship a
// partially stripped surface.
const marketingStart="let lastMarketingPage='home';";
const authStart="function showAuth(mode='login',prefillEmail=''){";
const start=appHtml.indexOf(marketingStart);
const end=appHtml.indexOf(authStart,start);
if(start<0||end<0||end<=start)throw new Error('Legacy marketing/auth boundary markers changed');
appHtml=appHtml.slice(0,start)+appHtml.slice(end);

// Product-host auth must link back to the public site, never re-render marketing.
appHtml=appHtml.replaceAll(
  'onclick="goMarketingPage(lastMarketingPage||\'home\')"',
  'onclick="location.href=\'https://boekuna.nl/\'"'
);

// Public/legal/product-information links leave the app origin.
const publicLinkMap=new Map([
  ['/privacy/','https://boekuna.nl/privacy/'],
  ['/voorwaarden/','https://boekuna.nl/voorwaarden/'],
  ['/support/','https://boekuna.nl/support/'],
  ['/account-verwijderen/','https://boekuna.nl/account-verwijderen/'],
  ['/prijzen/','https://boekuna.nl/prijzen/'],
  ['/hoe-het-werkt/','https://boekuna.nl/hoe-het-werkt/']
]);
for(const [from,to] of publicLinkMap){
  appHtml=appHtml.replaceAll('href="'+from+'"','href="'+to+'"');
  appHtml=appHtml.replaceAll("location.href='"+from+"'","location.href='"+to+"'");
}

// Logged-out, logout and auth-failure states stay on the product host and render auth.
appHtml=appHtml.replace(
  "else if(wantsRegister)showAuth('register');else if(wantsLogin)showAuth('login');else showLanding();",
  "else if(wantsRegister)showAuth('register');else showAuth('login');"
);
appHtml=appHtml.replaceAll("closeModal();showLanding()","closeModal();showAuth('login')");
appHtml=appHtml.replaceAll(
  "state=structuredClone(DEFAULT);showLanding()",
  "state=structuredClone(DEFAULT);showAuth('login')"
);
appHtml=appHtml.replace(
  "else if(wantsLogin||wantsRegister){showAuth(wantsRegister?'register':'login');authError(mapAuthError(err,'auth'))}else showLanding()",
  "else {showAuth(wantsRegister?'register':'login');authError(mapAuthError(err,'auth'))}"
);
appHtml=appHtml.replace(
  "window.addEventListener('popstate',()=>{if(document.getElementById('mainApp').style.display==='none')showLanding()});",
  "window.addEventListener('popstate',()=>{if(document.getElementById('mainApp').style.display==='none'){const u=new URL(location.href);showAuth(u.searchParams.get('register')==='1'?'register':'login')}});"
);

// Product host is not an SEO landing surface.
if(!appHtml.includes('name="robots"')){
  appHtml=appHtml.replace(
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />\n<meta name="robots" content="noindex,nofollow" />'
  );
}
appHtml=appHtml.replace(
  '<title>Boekuna — slim boekhouden voor ondernemers</title>',
  '<title>Boekuna — je administratie</title>'
);

for(const forbidden of ['function showLanding','function marketingNav','function showMarketingPage','goMarketingPage(','lastMarketingPage']){
  if(appHtml.includes(forbidden))throw new Error('App-only build still contains legacy marketing runtime: '+forbidden);
}
if(!appHtml.includes("else if(wantsRegister)showAuth('register');else showAuth('login');")){
  throw new Error('App-only auth fallback was not rewritten');
}

fs.rmSync(target,{recursive:true,force:true});
fs.mkdirSync(target,{recursive:true});
fs.writeFileSync(path.join(target,'index.html'),appHtml,'utf8');
fs.copyFileSync(manifestSource,path.join(target,'manifest.webmanifest'));
const appAssetsTarget=path.join(target,'assets');
fs.mkdirSync(appAssetsTarget,{recursive:true});
for(const asset of appAssets){
  const sourceFile=path.join(assetsSource,asset);
  if(!fs.existsSync(sourceFile))throw new Error('Missing app asset: '+asset);
  fs.copyFileSync(sourceFile,path.join(appAssetsTarget,asset));
}

console.log('App build complete:',path.relative(root,target));
