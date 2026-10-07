const CORE_FEATURES=Object.freeze({
  dashboard:true,
  invoices:true,
  expenses:true,
  documents:true,
  bankImport:true,
  vatOverview:true,
  simpleReports:true,
  settings:true,
  contacts:true
});

export const FIRST_RELEASE_FEATURES=Object.freeze({
  ...CORE_FEATURES,
  personalAssistant:false,
  timeTracking:false,
  mileage:false,
  projects:false,
  quotes:false,
  recurringInvoices:false,
  inventory:false,
  advancedCRM:false,
  bookings:false,
  psd2:false,
  peppol:false,
  vatSubmission:false,
  advancedReports:false,
  advancedDocumentExceptions:false,
  foreignVatAdvancedUX:false,
  developerMode:false,
  googleIntegration:false,
  serviceCatalog:false,
  savedServices:true
});

export const FULL_FEATURES=Object.freeze(
  Object.fromEntries(Object.keys(FIRST_RELEASE_FEATURES).map(key=>[key,true]))
);

export function resolveReleaseProfile(raw=process.env.BOEKUNA_RELEASE_PROFILE){
  const requested=String(raw||'first-release').trim().toLowerCase();
  if(requested==='full'||requested==='development'||requested==='test'){
    return Object.freeze({name:'full',features:FULL_FEATURES});
  }
  return Object.freeze({name:'first-release',features:FIRST_RELEASE_FEATURES});
}

export function isReleaseFeatureEnabled(features,key){
  return features?.[key]===true;
}
