import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync(new URL("../kwinest/index.html",import.meta.url),"utf8");
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);

assert.ok(scripts.length>=1,"Expected inline JavaScript");
for(const [idx,script] of scripts.entries()){
  assert.doesNotThrow(()=>new Function(script),`Inline script ${idx+1} must compile`);
}

assert.ok(html.includes("const TEST_MODE_NO_AUTH=false;"),"Production auth must not be bypassed");
assert.ok(!html.includes("contacts:structuredClone(DEMO_CUSTOMERS)"),"Demo customers must not be production defaults");
assert.ok(!html.includes("year===2026"),"VAT period logic must not hardcode 2026");
assert.ok(!html.includes("year === 2026"),"VAT period logic must not hardcode 2026");
assert.ok(!html.includes("publish-kwinest-site"),"Legacy publish endpoint must not be called from the frontend");
assert.ok(!html.includes("if(Math.abs(diff)>.01){if(diff<0)lines.push(jl('2300'"),"Journal imbalance must not be silently posted to account 2300");
assert.ok(html.includes("function validateJournalEntry(entry)"),"Journal validation is required");
assert.ok(html.includes("function bankFingerprint(t)"),"Bank fingerprint deduplication is required");
assert.ok(html.includes("function txInvoiceEvidence(t,i)"),"Confidence-based invoice matching is required");
assert.ok(html.includes("async function reserveFinalInvoiceNumber"),"Server-side invoice number reservation is required");
assert.ok(html.includes("function invoiceNumberAvailable(number,excludeId='')"),"Invoice uniqueness checks must support excluding the invoice being edited");
assert.ok(html.includes("function runDocumentVerification(id)"),"Independent document verification worker is required");
assert.ok(html.includes("status:fileSaved?(verificationNeeded?'pending':'verified')"),"Document verification state must persist after the original is safely stored");
assert.ok(html.includes("if(v.status==='needs_review')toast('Extra controle: controleer '+doc.name+' nog even')"),"Users should only be proactively notified for relevant verification differences");
assert.ok(html.includes("DOCUMENT_VERIFICATION_MAX_ATTEMPTS=2"),"Background verification retries must be finite");
assert.ok(html.includes("PASS 2 may not silently mutate")===false,"Production source must not contain test-only verification mutation text");
const financialFlow=html.slice(html.indexOf("async function processFinancialDocument"),html.indexOf("const DOCUMENT_VERIFICATION_VERSION"));
assert.ok(!financialFlow.includes("reviewMode:'verify'"),"PASS 2 must never block the first review screen");
assert.ok(financialFlow.includes("showPdfImportReview(parsed)"),"PASS 1 must still open the normal review screen");

assert.ok(!html.includes("add(!state.invoices.some(i=>i.number===draft.number),'Uniek factuurnummer'"),"Invoice edit validation must not flag its own number as a duplicate");
assert.ok(html.includes("invoiceChecks({...i,customer:c,paymentDays:i.paymentDays||0},i.id)"),"Existing invoice validation must explicitly exclude its own identity");
assert.ok(html.includes("function saveCreditDraft"),"Partial credit flow is required");
assert.ok(html.includes("function correctExpense(id)"),"Booked expenses must use a correction entry instead of hard delete");
assert.ok(!html.includes("state.expenses=state.expenses.filter(x=>x.id!==id)"),"Booked expenses must not be hard deleted");
assert.ok(html.includes("actorId:String(currentUser?.id||'')"),"Financial audit events must record the acting user");
assert.ok(html.includes("function invoiceDiscountAmount(i)"),"Invoice discount calculation is required");
assert.ok(html.includes('name="discountType"'),"Invoice discount controls are required");
assert.ok(html.includes('minlength="12"'),"New/reset passwords must require at least 12 characters");
assert.ok(html.includes("const register=mode==='register';"),"Public registration mode must not be hard-disabled");
assert.ok(html.includes("const wantsRegister=url.searchParams.get('register')==='1';"),"Registration must be directly addressable from the launch URL");
assert.ok(html.includes("showAuth('register')"),"Login must offer a route to create an account");
assert.ok(!html.includes("publieke registratie nog niet geactiveerd"),"Launch source must not claim public registration is disabled");
assert.ok(!html.includes('id="globalSearch"'),"The misleading cross-app global search must stay removed");
assert.ok(!html.includes('placeholder="Zoeken…"'),"Dead generic search placeholders must not return on non-search pages");
assert.ok(!html.includes("search='te laat'"),"Invoice overdue filtering must never fall back to free-text search");
assert.ok(html.includes("const LIST_STATE_KEY='boekuna-list-state-v1';"),"Contextual list state must be session-persisted");
assert.ok(html.includes("function getListRows(name)"),"All contextual lists must share one search/filter/sort pipeline");
assert.ok(html.includes("function listToolbar(name,extraHtml=''"),"Relevant lists must use the shared ListToolbar");
assert.ok(html.includes("function invoiceListStatusMatch(i,status)"),"Invoice status filters must use business status logic");
assert.ok(html.includes("invoiceEffectiveStatus(i)==='overdue'"),"Overdue invoice filtering must use invoiceEffectiveStatus");
assert.ok(html.includes("function listNormalize(v)"),"List search must share normalized case/accent-insensitive matching");
assert.ok(html.includes("setTimeout(()=>{listPageState(name).query=String(value||'').trim();persistListState();render();focusListSearch(name,pos)},180)"),"List search must debounce while typing");
assert.ok(html.includes('aria-label="Zoekopdracht wissen"'),"Search clear controls must be accessible");
for(const placeholder of [
  "Zoek op factuurnummer, klant of bedrag",
  "Zoek op leverancier, factuurnummer of bedrag",
  "Zoek in transacties",
  "Zoek op naam, e-mail of plaats",
  "Zoek op bestand, leverancier of factuurnummer",
  "Zoek rekening, referentie of omschrijving"
]){
  assert.ok(html.includes(placeholder),`Missing contextual search placeholder: ${placeholder}`);
}
assert.ok(html.includes("source -> search -> filters -> sort")||html.includes("rows=rows.filter(item=>listMatchesFilters(name,item));"),"List pipeline must filter before sorting");
assert.ok(html.includes("return rows.slice().sort((a,b)=>listSortCompare(name,a,b))"),"List sorting must work on a copy instead of mutating source data");
assert.ok(html.includes("function clearListFilters(name)"),"Shared filter reset behavior is required");
assert.ok(html.includes("listState[name].query=keepQuery;listState[name].sort=keepSort"),"Clearing filters must preserve search and sort");
assert.ok(html.includes("role=\"dialog\" aria-modal=\"true\""),"Filter/sort dialogs must expose dialog semantics");
assert.ok(html.includes("if(e.key==='Tab')"),"Dialogs must trap keyboard focus");
assert.ok(html.includes("state.hours.slice().sort"),"Hours must default to newest date first");
assert.ok(html.includes("state.mileage.slice().sort"),"Mileage must default to newest date first");
assert.ok(html.includes("fetchWithAuthRetry(DOCUMENT_PROCESSOR_URL+'/analyze'"),"Document processor requests must use authenticated retry");
assert.ok(html.includes("async function fetchWithAuthRetry"),"Authenticated processor requests must refresh and retry expired sessions");
assert.ok(html.includes('id="boekuna-upload-bootstrap"'),"Upload bootstrap must exist independently of the main app initialization");
assert.ok(html.includes("input.dataset.uploadBound='true'"),"Upload controls must be explicitly bound after the main script");
for(const id of ["invoicePdfFile","receiptPhotoFile","receiptCameraFile"]){
  assert.ok(html.includes(`['${id}'`),`${id} must be registered in the isolated upload bootstrap`);
}
assert.ok(html.includes("async function startSelectedDocumentUpload"),"Selected documents must enter one shared, user-visible upload pipeline");
assert.ok(html.includes("pendingPdfImport=null"),"Document import state must be declared before cleanup/use");
assert.ok(html.includes("pendingUploadKind='auto'"),"Upload mode state must be declared explicitly");
assert.ok(html.includes("function setImportProgress(title,msg,sub='',percent=10,step=1)"),"Upload progress must expose real staged percentages");
assert.ok(html.includes('id="importProgressMessage"'),"Upload progress must use the compact loading state");
assert.ok(html.includes("const browserStructurePromise="),"PDF client inspection should start in parallel with server processing");
assert.ok(html.includes("serverReviewed=!!serverProc.ai||serverProc.fastPath==='deterministic'"),"Frontend must not repeat a completed server AI/deterministic review");
assert.ok(html.includes("function setDocumentReviewStep(step)"),"Mobile document review must have explicit step navigation");
for(const step of [1,2,3,4])assert.ok(html.includes(`data-review-step="${step}"`),`Mobile document review step ${step} must exist`);
assert.ok(html.includes("Stap 1 van 4 · Document"),"Mobile review must start with document inspection");
assert.ok(html.includes("<summary>Technische details</summary>"),"Technical OCR/AI details must stay collapsed in the main mobile flow");
assert.ok(html.includes("mobile-review-actions"),"Mobile review must provide dedicated previous/next/save actions");
assert.ok(html.includes("bad?.closest('[data-review-step]')"),"Invalid mobile review fields must route users back to the correct step");
assert.ok(!html.includes("steps=['Ontvangen','Valideren','Uitlezen / OCR','Herkennen','Controleren','Klaar']"),"Legacy six-step loading grid must stay removed");
assert.ok(html.includes('rel="manifest" href="/manifest.webmanifest"'),"Store/mobile build must expose the web app manifest");
for(const required of [
  "../public/manifest.webmanifest",
  "../public/privacy/index.html",
  "../public/support/index.html",
  "../public/account-verwijderen/index.html",
  "../store/app-store-connect.nl-NL.json",
  "../store/google-play.nl-NL.json",
  "../store/privacy-data-safety.md",
  "../store/review-notes.md",
  "../store/STORE_RELEASE_CHECKLIST.md"
]){
  assert.ok(fs.existsSync(new URL(required,import.meta.url)),`Store launch file missing: ${required}`);
}
const privacy=fs.readFileSync(new URL("../public/privacy/index.html",import.meta.url),"utf8");
const support=fs.readFileSync(new URL("../public/support/index.html",import.meta.url),"utf8");
const deletion=fs.readFileSync(new URL("../public/account-verwijderen/index.html",import.meta.url),"utf8");
const deleteAccountEdge=fs.readFileSync(new URL("../supabase/functions/delete-account/index.ts",import.meta.url),"utf8");
const analyzeInvoiceEdge=fs.readFileSync(new URL("../supabase/functions/analyze-invoice/index.ts",import.meta.url),"utf8");
assert.ok(privacy.includes("Boekuna is een product van Kwinest"),"Privacy policy must identify the product/operator");
assert.ok(support.includes("support_requests"),"Public support form must submit to the support intake");
assert.ok(deletion.includes("Online verwijderingsverzoek"),"Account deletion web resource must allow an external deletion request");
assert.ok(deleteAccountEdge.includes('admin.rpc("delete_email_connection_secret"'),"Account deletion must remove connected mailbox credentials from Vault before deleting the user");
assert.ok(deleteAccountEdge.indexOf('admin.rpc("delete_email_connection_secret"')<deleteAccountEdge.indexOf('admin.auth.admin.deleteUser(userId)'),"Mailbox credentials must be removed before the auth user is deleted");
for(const origin of ["https://boekuna-boekhouding.onrender.com","https://boekuna.nl","https://www.boekuna.nl"]){
  assert.ok(analyzeInvoiceEdge.includes(origin),`Invoice analysis CORS must allow production origin: ${origin}`);
}
assert.ok(analyzeInvoiceEdge.includes("!ALLOWED_ORIGINS.has(origin)"),"Invoice analysis must reject untrusted origins");
assert.ok(html.includes("function showUploadError(err,file=null)"),"Upload errors must render a user-facing explanation");
assert.ok(html.includes("function uploadErrorInfo(err)"),"Upload errors must be translated centrally");
assert.ok(html.includes("function startSubscription(plan)"),"Paid plans must start through the authenticated subscription flow");
assert.ok(html.includes("EDGE_BASE+'/billing-checkout'"),"Checkout must be created server-side");
assert.ok(html.includes("EDGE_BASE+'/billing-portal'"),"Paid customers need subscription management");
assert.ok(html.includes("function renderBillingCard()"),"Settings must expose current plan and monthly usage");
assert.ok(html.includes("Number(err?.status||0)===402"),"Quota errors must not fall back to local OCR and bypass billing limits");
assert.ok(!/sk_(?:live|test)_[A-Za-z0-9]+/.test(html),"Stripe secret keys must never be present in the browser source");
for(const code of ["400","401","402","403","408","413","415","422","429","500","502","503","504","NETWORK_ERROR","TIMEOUT","OCR_FAILED","PDF_READ_FAILED"]){
  assert.ok(html.includes(`'${code}':[`)||html.includes(` ${code}:[`),`Upload error code ${code} must have an explanation`);
}

console.log("Boekuna source safety tests: PASS");
