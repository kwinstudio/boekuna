import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  FIRST_RELEASE_FEATURES,
  FULL_FEATURES,
  resolveReleaseProfile,
  isReleaseFeatureEnabled
} from '../scripts/release-profile.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

const core=['dashboard','invoices','expenses','documents','bankImport','vatOverview','simpleReports','settings','contacts'];
const disabled=[
  'personalAssistant','timeTracking','mileage','projects','quotes','recurringInvoices',
  'inventory','advancedCRM','bookings','psd2','peppol','vatSubmission','advancedReports',
  'advancedDocumentExceptions','foreignVatAdvancedUX','developerMode','googleIntegration'
];

for(const feature of core)assert.equal(FIRST_RELEASE_FEATURES[feature],true,feature+' must stay enabled');
for(const feature of disabled)assert.equal(FIRST_RELEASE_FEATURES[feature],false,feature+' must fail closed');
assert.equal(isReleaseFeatureEnabled(FIRST_RELEASE_FEATURES,'missingFlag'),false,'Undefined features must fail closed');
assert.equal(resolveReleaseProfile('unexpected-value').name,'first-release','Unknown release profile must fail closed');
assert.equal(resolveReleaseProfile('').name,'first-release','Empty release profile must fail closed');
for(const feature of Object.keys(FIRST_RELEASE_FEATURES))assert.equal(FULL_FEATURES[feature],true,'Full QA profile must preserve '+feature);

const run=spawnSync(process.execPath,['scripts/build-app.mjs'],{
  cwd:root,
  encoding:'utf8',
  env:{
    ...process.env,
    BOEKUNA_RELEASE_PROFILE:'first-release',
    BOEKUNA_ASSISTANT_ENABLED:'true',
    BOEKUNA_DEV_MODE:'true',
    BOEKUNA_DEPLOYMENT_ENV:'production'
  }
});
assert.equal(run.status,0,'First-release app build must succeed:\n'+run.stdout+'\n'+run.stderr);

const dist=path.join(root,'dist','app');
const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
const assets=path.join(dist,'assets');

for(const page of ['insights','control','cashflow','ledger','bookings','hours','services']){
  assert.equal(html.includes('data-page="'+page+'"'),false,'Disabled page must be absent from navigation: '+page);
}
for(const page of ['dashboard','invoices','expenses','bank','vat','reports','documents','contacts','settings']){
  assert.ok(html.includes('data-page="'+page+'"'),'Core page must remain in navigation: '+page);
}

assert.match(html,/const releaseFallback=\{[^\n]*"insights":"dashboard"/,'Direct disabled navigation must use the release fallback map');
assert.match(html,/"control":"dashboard"/,'Control route must be gated');
assert.match(html,/"cashflow":"reports"/,'Cashflow route must be gated to reports');
assert.match(html,/"ledger":"reports"/,'Ledger route must be gated to reports');
assert.match(html,/"bookings":"dashboard"/,'Bookings route must be gated');
assert.match(html,/"hours":"dashboard"/,'Hours route must be gated');
assert.match(html,/"services":"invoices"/,'Service catalog route must be gated');
assert.match(html,/const releaseRenderFallback=\{[^\n]*"bookings":"dashboard"/,'Direct render state must use the same fail-closed release map');

for(const asset of ['personal-insights.js','personal-assistant-qna.js','personal-insights-ui.js','developer-mode.js']){
  assert.equal(fs.existsSync(path.join(assets,asset)),false,'Disabled runtime asset must not ship: '+asset);
}
for(const asset of ['document-intelligence.js','document-review-v2.js','financial-correction.js']){
  assert.ok(fs.existsSync(path.join(assets,asset)),'Core document/accounting asset must remain: '+asset);
}

const quickStart=html.indexOf('function quickMenu(){');
const quickEnd=html.indexOf('function nextInvoiceNumber()',quickStart);
assert.ok(quickStart>=0&&quickEnd>quickStart,'Quick menu must remain present');
const quick=html.slice(quickStart,quickEnd);
for(const label of ['Scannen','Factuur','Kosten boeken','Banktransactie','Relatie'])assert.ok(quick.includes(label),'Core quick action missing: '+label);
for(const forbidden of ['newService()','newBooking()','newSettlement()','Gemengde afrekening'])assert.equal(quick.includes(forbidden),false,'Disabled quick action leaked: '+forbidden);

assert.equal(html.includes('name="peppolId"'),false,'Peppol edit controls must be hidden');
assert.equal(html.includes('E-factuur / Peppol ID'),false,'Peppol labels must be hidden');
assert.ok(html.includes("peppolId:existing?.peppolId||''"),'Existing contact Peppol data must be preserved');
assert.ok(html.includes("'bankAccountName','invoicePrefix']"),'Profile save list must exclude hidden Peppol field');
assert.equal(html.includes('<select name="taxTreatment" id="taxTreatment">'),false,'Advanced VAT treatment selector must be hidden');
assert.ok(html.includes('<input type="hidden" name="taxTreatment" id="taxTreatment"'),'Authoritative VAT treatment value must remain');

for(const guard of [
  "function newBooking(){if(!releaseFeatureEnabled(\"bookings\"))return;",
  "function saveBooking(){if(!releaseFeatureEnabled(\"bookings\"))return;",
  "function newHour(){if(!releaseFeatureEnabled(\"timeTracking\"))return;",
  "function saveHour(){if(!releaseFeatureEnabled(\"timeTracking\"))return;",
  "function newMileage(){if(!releaseFeatureEnabled(\"mileage\"))return;",
  "function saveMileage(){if(!releaseFeatureEnabled(\"mileage\"))return;",
  "function newSettlement(){if(!releaseFeatureEnabled(\"advancedDocumentExceptions\"))return;"
])assert.ok(html.includes(guard),'Disabled direct function must fail closed: '+guard);

assert.equal(html.includes("key:'bookings',priority:3"),false,'Dashboard must not surface booking reminders');
assert.equal(html.includes("category==='bookings'"),false,'Release attention worklist must not surface booking actions');

for(const coreFunction of ['function renderDashboard()','function renderInvoices()','function renderExpenses()','function renderBank()','function renderVat()','function renderReports()','function renderDocuments()','function renderContacts()']){
  assert.ok(html.includes(coreFunction),'Core implementation must remain: '+coreFunction);
}
assert.ok(html.includes('const BOEKUNA_RELEASE_PROFILE=Object.freeze('),'Generated app must expose immutable release profile');
assert.match(html,/"name":"first-release"/,'Generated app must declare first-release profile');

const restore=spawnSync(process.execPath,['scripts/build-app.mjs'],{
  cwd:root,
  encoding:'utf8',
  env:{...process.env,BOEKUNA_RELEASE_PROFILE:'full',BOEKUNA_DEV_MODE:'false'}
});
assert.equal(restore.status,0,'Full QA artifact must remain buildable after the Release 1 contract:\n'+restore.stdout+'\n'+restore.stderr);

console.log('First release scope contract: PASS');
