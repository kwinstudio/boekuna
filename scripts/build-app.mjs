import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveReleaseProfile,isReleaseFeatureEnabled} from './release-profile.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const target=path.join(root,'dist','app');
const appSource=path.join(root,'kwinest','index.html');
const manifestSource=path.join(root,'public','manifest.webmanifest');
const assetsSource=path.join(root,'public','assets');
const appFontCache=path.join(root,'.cache','app-fonts');
const SPACE_GROTESK_COMMIT='9710da1eacb3be272583c3224dcb70f9da6eadbb';
const SPACE_GROTESK_URL='https://raw.githubusercontent.com/google/fonts/'+SPACE_GROTESK_COMMIT+'/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf';
const releaseProfile=resolveReleaseProfile();
const releaseFeatures=releaseProfile.features;
const assistantFlag=String(process.env.BOEKUNA_ASSISTANT_ENABLED??'true').trim().toLowerCase();
const assistantRequested=!['0','false','no','off'].includes(assistantFlag);
const assistantEnabled=isReleaseFeatureEnabled(releaseFeatures,'personalAssistant')&&assistantRequested;

async function cacheAppFont(url,name){
  fs.mkdirSync(appFontCache,{recursive:true});
  const file=path.join(appFontCache,name);
  if(fs.existsSync(file)&&fs.statSync(file).size>1000)return file;
  const response=await fetch(url,{redirect:'follow'});
  if(!response.ok)throw new Error('Could not fetch pinned app font '+name+': HTTP '+response.status);
  fs.writeFileSync(file,Buffer.from(await response.arrayBuffer()));
  return file;
}
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
  'document-intelligence.js',
  ...(assistantEnabled?['personal-insights.js','personal-assistant-qna.js','personal-insights-ui.js']:[]),
  'personal-insights.css',
  'document-review-v2.js',
  'document-review-v2.css',
  'kvk-company-lookup.js',
  'kvk-company-lookup.css',
  'mobile-polish-round-2.css',
  'mobile-polish-round-2.js',
  'mobile-product.css',
  'mobile-product.js',
  ...(isReleaseFeatureEnabled(releaseFeatures,'developerMode')?['developer-mode.js']:[])
];

for(const file of [appSource,manifestSource,assetsSource]){
  if(!fs.existsSync(file))throw new Error('Missing app build source: '+path.relative(root,file));
}

const spaceGroteskFont=await cacheAppFont(SPACE_GROTESK_URL,'SpaceGrotesk-Variable.ttf');
const interFontSource=path.join(assetsSource,'marketing-editorial','InterVariable.woff2');
if(!fs.existsSync(interFontSource))throw new Error('Missing app Inter font source');

let appHtml=fs.readFileSync(appSource,'utf8');

const devFlag=String(process.env.BOEKUNA_DEV_MODE||'').trim().toLowerCase();
const developerModeEnabled=isReleaseFeatureEnabled(releaseFeatures,'developerMode')&&['1','true','yes','on'].includes(devFlag);
const deploymentEnvironment=String(process.env.BOEKUNA_DEPLOYMENT_ENV||'production').trim().toLowerCase();
const developerAllowedOrigins=String(process.env.BOEKUNA_DEV_ALLOWED_ORIGINS||'').split(',').map(v=>v.trim().replace(/\/$/,'')).filter(Boolean);
const productionOrigins=new Set([
  'https://app.boekuna.nl',
  'https://boekuna.nl',
  'https://www.boekuna.nl',
  'https://boekuna-boekhouding.onrender.com',
  'https://kwinest-boekhouding.onrender.com'
]);
const kvkPreview=process.env.BOEKUNA_KVK_PREVIEW==='true';
if(kvkPreview){
  if(developerModeEnabled||!['preview','staging'].includes(deploymentEnvironment))throw new Error('KVK preview requires an isolated preview build without Developer Mode');
  const previewUrl=String(process.env.BOEKUNA_SUPABASE_URL||'').replace(/\/$/,'');
  const previewKey=String(process.env.BOEKUNA_SUPABASE_PUBLISHABLE_KEY||'');
  if(previewUrl!=='https://ozisiotrzeubwbffnxyr.supabase.co'||!previewKey)throw new Error('KVK preview requires the approved isolated Supabase project and publishable key');
  const marker='window.BOEKUNA_KVK_PREVIEW=false;';
  if(!appHtml.includes(marker))throw new Error('KVK preview marker missing');
  appHtml=appHtml.replace(marker,'window.BOEKUNA_KVK_PREVIEW=true;');
  appHtml=appHtml.replace("const SUPABASE_URL='https://vuwfyhtejsxhdfyvkkeq.supabase.co';",'const SUPABASE_URL='+JSON.stringify(previewUrl)+';');
  appHtml=appHtml.replace("const SUPABASE_PUBLISHABLE_KEY='sb_publishable_miAZ6CBZShVcmmNwlnEDgA_aGw1X4aP';",'const SUPABASE_PUBLISHABLE_KEY='+JSON.stringify(previewKey)+';');
}
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

for(const forbidden of ['showLanding(','function marketingNav','function showMarketingPage','goMarketingPage(','lastMarketingPage']){
  if(appHtml.includes(forbidden))throw new Error('App-only build still contains legacy marketing runtime: '+forbidden);
}
if(!appHtml.includes("else if(wantsRegister)showAuth('register');else showAuth('login');")){
  throw new Error('App-only auth fallback was not rewritten');
}

// App-only progressive document review layer. Keep the combined rollback source untouched.
// This legacy source contains literal </head> and </body> strings inside templates,
// so injection must target the final document closing tags, never the first match.
function injectBeforeLast(html,marker,content){
  const index=html.lastIndexOf(marker);
  if(index<0)throw new Error('Missing app document marker: '+marker);
  return html.slice(0,index)+content+html.slice(index);
}
appHtml=injectBeforeLast(appHtml,'</head>','<link rel="stylesheet" href="/assets/document-review-v2.css?v=20261004c">\n');
appHtml=injectBeforeLast(appHtml,'</body>','<script src="/assets/document-review-v2.js?v=20261004c"></script>\n');
// The real head precedes the app body; later </head> tokens belong to print templates.
const mobileHeadBoundary='</head>\n<body>';
if(!appHtml.includes(mobileHeadBoundary))throw new Error('Mobile app head boundary changed');
appHtml=appHtml.replace(mobileHeadBoundary,'<link rel="stylesheet" href="/assets/personal-insights.css?v=20261004c">\n<link rel="stylesheet" href="/assets/mobile-product.css?v=20261003a" media="(max-width:820px)">\n'+mobileHeadBoundary);
const assistantRuntimeMarker='\n<script>\nconst USERS_KEY=';
if(!appHtml.includes(assistantRuntimeMarker))throw new Error('Assistant app runtime marker changed');

function removeBuiltSourceLine(marker,label='Release gate'){
  const lines=appHtml.split('\n');
  const matches=[];
  lines.forEach((line,index)=>{if(line.includes(marker))matches.push(index)});
  if(matches.length!==1)throw new Error(label+' marker changed: '+marker);
  lines.splice(matches[0],1);
  appHtml=lines.join('\n');
}
function removeBuiltRange(startMarker,endMarker,label='Release gate'){
  const startIndex=appHtml.indexOf(startMarker);
  const endIndex=appHtml.indexOf(endMarker,startIndex);
  if(startIndex<0||endIndex<0||endIndex<=startIndex)throw new Error(label+' range changed');
  appHtml=appHtml.slice(0,startIndex)+appHtml.slice(endIndex);
}
function guardBuiltFunction(signature,feature){
  const marker=signature+'{';
  if(!appHtml.includes(marker))throw new Error('Release function marker changed: '+signature);
  appHtml=appHtml.replace(marker,marker+"if(!releaseFeatureEnabled("+JSON.stringify(feature)+"))return;");
}

const disabledPageFallbacks={};
function disableBuiltPage(pageName,fallback){
  removeBuiltSourceLine('data-page="'+pageName+'"','Release navigation');
  disabledPageFallbacks[pageName]=fallback;
}
if(!isReleaseFeatureEnabled(releaseFeatures,'personalAssistant'))disableBuiltPage('insights','dashboard');
if(!isReleaseFeatureEnabled(releaseFeatures,'advancedReports')){
  disableBuiltPage('control','dashboard');
  disableBuiltPage('cashflow','reports');
  disableBuiltPage('ledger','reports');
}
if(!isReleaseFeatureEnabled(releaseFeatures,'bookings'))disableBuiltPage('bookings','dashboard');
if(!isReleaseFeatureEnabled(releaseFeatures,'timeTracking')||!isReleaseFeatureEnabled(releaseFeatures,'mileage'))disableBuiltPage('hours','dashboard');
if(!isReleaseFeatureEnabled(releaseFeatures,'serviceCatalog'))disableBuiltPage('services','invoices');

const navigateMarker='async function navigate(p){';
if(!appHtml.includes(navigateMarker))throw new Error('Release navigation guard marker changed');
if(Object.keys(disabledPageFallbacks).length){
  appHtml=appHtml.replace(
    navigateMarker,
    navigateMarker+"\n const releaseFallback="+JSON.stringify(disabledPageFallbacks)+"[p];if(releaseFallback)p=releaseFallback;"
  );
}

if(assistantEnabled){
  appHtml=appHtml.replace(assistantRuntimeMarker,'\n<script src="/assets/personal-insights.js?v=20261004b"></script>\n<script src="/assets/personal-assistant-qna.js?v=20261004a"></script>\n<script src="/assets/personal-insights-ui.js?v=20261004c"></script>'+assistantRuntimeMarker);
}else{
  removeBuiltSourceLine('dashboard-ask-bookuna','Assistant disable');
  const summaryGridMarker='#mainApp .dashboard-summary-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));';
  if(!appHtml.includes(summaryGridMarker))throw new Error('Assistant summary-grid marker changed');
  appHtml=appHtml.replace(summaryGridMarker,'#mainApp .dashboard-summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));');
}

if(!isReleaseFeatureEnabled(releaseFeatures,'bookings')){
  removeBuiltSourceLine("if(upcoming.length)items.push({key:'bookings'","Release booking attention");
  const bookingAttention=" state.bookings.filter(b=>['planned','confirmed'].includes(b.status)&&daysUntil(b.date)>=0&&daysUntil(b.date)<=2&&!b.reminderSent).forEach(b=>add('booking-'+b.id,'bookings',b.title||b.description||b.service||'Afspraak',dateNL(b.date)+' · herinnering nog niet verstuurd',()=>openBookingAttention(b.id),'Open'));";
  if(!appHtml.includes(bookingAttention))throw new Error('Release booking worklist marker changed');
  appHtml=appHtml.replace(bookingAttention,'');
  for(const signature of ['function newBooking()','function saveBooking()','function markBookingReminder(id)','function completeBooking(id)','function markNoShow(id)','function invoiceFromBooking(id)'])guardBuiltFunction(signature,'bookings');
}
if(!isReleaseFeatureEnabled(releaseFeatures,'timeTracking')){
  for(const signature of ['function newHour()','function saveHour()'])guardBuiltFunction(signature,'timeTracking');
}
if(!isReleaseFeatureEnabled(releaseFeatures,'mileage')){
  for(const signature of ['function newMileage()','function saveMileage()'])guardBuiltFunction(signature,'mileage');
}
if(!isReleaseFeatureEnabled(releaseFeatures,'serviceCatalog')){
  for(const signature of ["function newService(editId='')","function editService(id)","function saveService(id='')","function deleteService(id)"])guardBuiltFunction(signature,'serviceCatalog');
  removeBuiltRange('<div class="invoice-service-picker">','<div id="invoiceLines">','Release service picker');
}
if(!isReleaseFeatureEnabled(releaseFeatures,'advancedReports')){
  for(const signature of ["function newPlannedCash(id='')","function editPlannedCash(id)","function savePlannedCash()","function deletePlannedCash(id)"])guardBuiltFunction(signature,'advancedReports');
  const attentionSingle=" if(rows.length===1){rows[0].action();return}";
  if(!appHtml.includes(attentionSingle))throw new Error('Release attention fallback marker changed');
  appHtml=appHtml.replace(attentionSingle,attentionSingle+"\n if(!releaseFeatureEnabled('advancedReports')){rows[0].action();return}");
  const attentionFooterStart=" const total=attentionRows().length,more=";
  const attentionFooterAt=appHtml.indexOf(attentionFooterStart);
  const openInfoAt=appHtml.indexOf(",openInfo=",attentionFooterAt);
  if(attentionFooterAt<0||openInfoAt<0)throw new Error('Release attention footer marker changed');
  appHtml=appHtml.slice(0,attentionFooterAt)+" const total=attentionRows().length,more=''"+appHtml.slice(openInfoAt);
}
if(!isReleaseFeatureEnabled(releaseFeatures,'advancedDocumentExceptions')){
  for(const signature of ['function newSettlement()','function saveSettlement()'])guardBuiltFunction(signature,'advancedDocumentExceptions');
}
if(
  !isReleaseFeatureEnabled(releaseFeatures,'bookings')||
  !isReleaseFeatureEnabled(releaseFeatures,'serviceCatalog')||
  !isReleaseFeatureEnabled(releaseFeatures,'advancedDocumentExceptions')
){
  const quickStart='function quickMenu(){';
  const quickEnd='function nextInvoiceNumber()';
  const startIndex=appHtml.indexOf(quickStart),endIndex=appHtml.indexOf(quickEnd,startIndex);
  if(startIndex<0||endIndex<0)throw new Error('Release quick-menu marker changed');
  const quickCore=`function quickMenu(){modal('Nieuw',\`<div class="quick-action-group"><div class="quick-action-heading">Dagelijks</div><div class="quick-action-grid"><button class="quick-action" onclick="closeModal();openUploadSourcePicker('auto')"><strong>Scannen</strong><span>Document of bon</span></button><button class="quick-action" onclick="closeModal();newInvoice()"><strong>Factuur</strong></button><button class="quick-action" onclick="closeModal();newExpense()"><strong>Kosten boeken</strong></button><button class="quick-action" onclick="closeModal();newTransaction()"><strong>Banktransactie</strong></button><button class="quick-action" onclick="closeModal();newContact()"><strong>Relatie</strong></button></div></div>\`)}\n`;
  appHtml=appHtml.slice(0,startIndex)+quickCore+appHtml.slice(endIndex);
}

if(!isReleaseFeatureEnabled(releaseFeatures,'peppol')){
  const profilePeppol="<div class=\"field\"><label>Peppol / e-factuur ID</label><input name=\"peppolId\" value=\"${esc(c.peppolId||'')}\" placeholder=\"Optioneel\"></div>";
  const contactPeppol="<div class=\"field\"><label for=\"contactPeppol\">E-factuur / Peppol ID</label><input id=\"contactPeppol\" name=\"peppolId\" value=\"${esc(c?.peppolId||'')}\" placeholder=\"Optioneel\"></div>";
  for(const [needle,label] of [[profilePeppol,'profile'],[contactPeppol,'contact']]){
    if(!appHtml.includes(needle))throw new Error('Release Peppol '+label+' marker changed');
    appHtml=appHtml.replace(needle,'');
  }
  const profileKeys="['name','tradeName','contactName','email','phone','website','address','postal','city','country','kvk','vat','iban','bic','bankAccountName','peppolId','invoicePrefix']";
  const releaseProfileKeys="['name','tradeName','contactName','email','phone','website','address','postal','city','country','kvk','vat','iban','bic','bankAccountName','invoicePrefix']";
  if(!appHtml.includes(profileKeys))throw new Error('Release Peppol profile persistence marker changed');
  appHtml=appHtml.replace(profileKeys,releaseProfileKeys);
  const contactSave="peppolId:String(d.get('peppolId')||'').trim()";
  if(!appHtml.includes(contactSave))throw new Error('Release Peppol contact persistence marker changed');
  appHtml=appHtml.replace(contactSave,"peppolId:existing?.peppolId||''");
  const contactDisplay="${c.peppolId?\`<div class=\"help\">E-factuur: ${esc(c.peppolId)}</div>\`:''}";
  if(!appHtml.includes(contactDisplay))throw new Error('Release Peppol contact display marker changed');
  appHtml=appHtml.replace(contactDisplay,'');
}
if(!isReleaseFeatureEnabled(releaseFeatures,'foreignVatAdvancedUX')){
  const vatTreatmentField='<div class="field"><label>Btw-behandeling *</label><select name="taxTreatment" id="taxTreatment"><option value="standard" ${defaultTreatment===\'standard\'?\'selected\':\'\'}>Binnenland · normale btw</option><option value="reverse">Btw verlegd</option><option value="icp">EU · intracommunautair / 0%</option><option value="exempt">Btw-vrijgesteld</option><option value="kor" ${defaultTreatment===\'kor\'?\'selected\':\'\'}>KOR · geen btw</option></select><div class="help">Alleen aanpassen bij een bijzondere btw-situatie.</div></div>';
  if(!appHtml.includes(vatTreatmentField))throw new Error('Release foreign VAT invoice marker changed');
  appHtml=appHtml.replace(vatTreatmentField,'<input type="hidden" name="taxTreatment" id="taxTreatment" value="${esc(defaultTreatment)}">');
}

const releaseRuntime="const BOEKUNA_RELEASE_PROFILE=Object.freeze("+JSON.stringify({name:releaseProfile.name,features:releaseFeatures})+");\nfunction releaseFeatureEnabled(key){return BOEKUNA_RELEASE_PROFILE.features?.[key]===true}\n";
if(!appHtml.includes(assistantRuntimeMarker))throw new Error('Release runtime marker changed');
appHtml=appHtml.replace(assistantRuntimeMarker,'\n<script>\n'+releaseRuntime+'const USERS_KEY=');
appHtml=injectBeforeLast(appHtml,'</body>','<script src="/assets/mobile-product.js?v=20261003a"></script>\n');

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

// Document review is app-only. Keep the shared public/marketing copies byte-identical.
for(const asset of ['document-review-v2.js','document-review-v2.css']){
  const sourceFile=path.join(root,'kwinest','app-assets',asset);
  if(!fs.existsSync(sourceFile))throw new Error('Missing app-only review asset: '+asset);
  fs.copyFileSync(sourceFile,path.join(appAssetsTarget,asset));
}

// Assistant integration is app-only. Keep shared public mobile assets byte-identical
// to the marketing source and patch only the generated product artifact.
function patchBuiltAppAsset(asset,needle,replacement){
  const file=path.join(appAssetsTarget,asset);
  const source=fs.readFileSync(file,'utf8');
  const first=source.indexOf(needle);
  const second=first<0?-1:source.indexOf(needle,first+needle.length);
  if(first<0||second>=0)throw new Error('App-only asset patch marker changed: '+asset);
  fs.writeFileSync(file,source.slice(0,first)+replacement+source.slice(first+needle.length),'utf8');
}
if(assistantEnabled){
  patchBuiltAppAsset(
    'mobile-polish-round-2.js',
    "      +'</div></section>'\n      +'<section class=\"settings-group\"><h2 class=\"settings-group-label\">Beveiliging & privacy</h2><div class=\"settings-list\">'",
    "      +'</div></section>'\n      +renderAssistantSettingsSafe()\n      +'<section class=\"settings-group\"><h2 class=\"settings-group-label\">Beveiliging & privacy</h2><div class=\"settings-list\">'"
  );
  patchBuiltAppAsset(
    'mobile-product.js',
    "var titles=['Bedrijfsgegevens','Factuurinstellingen','Boekhouding','Beveiliging en privacy','Data en export','Abonnement en account','Account verwijderen'];",
    "var titles=['Bedrijfsgegevens','Factuurinstellingen','Boekhouding','Assistent & inzichten','Beveiliging en privacy','Data en export','Abonnement en account','Account verwijderen'];"
  );
  patchBuiltAppAsset(
    'mobile-product.js',
    "var descriptions=['Naam, adres en betaalgegevens','Factuurlayout en e-mailbericht','Fiscale instellingen en reserves','Je account beschermen','Download of herstel je administratie','Je plan en account beheren','Acties met extra bevestiging'];",
    "var descriptions=['Naam, adres en betaalgegevens','Factuurlayout en e-mailbericht','Fiscale instellingen en reserves','Persoonlijke tips en samenvattingen','Je account beschermen','Download of herstel je administratie','Je plan en account beheren','Acties met extra bevestiging'];"
  );
}
if(!isReleaseFeatureEnabled(releaseFeatures,'serviceCatalog')){
  patchBuiltAppAsset(
    'mobile-polish-round-2.js',
    '    deleteService=function(id){',
    "    deleteService=function(id){if(!releaseFeatureEnabled('serviceCatalog'))return;"
  );
}
if(!isReleaseFeatureEnabled(releaseFeatures,'advancedReports')){
  patchBuiltAppAsset(
    'mobile-polish-round-2.js',
    '    deletePlannedCash=function(id){',
    "    deletePlannedCash=function(id){if(!releaseFeatureEnabled('advancedReports'))return;"
  );
}
patchBuiltAppAsset(
  'mobile-product.css',
  "  #mainApp .dashboard-kpi-profit, #mainApp .dashboard-kpi:last-child { grid-column:1/-1!important; }",
  "  #mainApp .dashboard-kpi-profit { grid-column:1/-1!important; }"
);

fs.copyFileSync(interFontSource,path.join(appAssetsTarget,'app-InterVariable.woff2'));
fs.copyFileSync(spaceGroteskFont,path.join(appAssetsTarget,'app-SpaceGrotesk-Variable.ttf'));

console.log('App build complete:',path.relative(root,target),'with self-hosted Inter + Space Grotesk');
