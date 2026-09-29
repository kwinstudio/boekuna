import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync(new URL("../kwinest/index.html",import.meta.url),"utf8");
const invoiceAi=fs.readFileSync(new URL("../supabase/functions/analyze-invoice/index.ts",import.meta.url),"utf8");
const processor=fs.readFileSync(new URL("../kwinest/docprocessor/app.py",import.meta.url),"utf8");
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
assert.ok(invoiceAi.includes('DOCUMENT_PROCESSOR_URL+"/verify"'),"PASS 2 must route through the configured document processor verification endpoint");
assert.ok(/if\(body\?\.reviewMode==="verify"\)return \{ok:true,kind:"user"(?:,user)?\};/.test(invoiceAi),"PASS 2 must not consume a second user smart-document quota unit");
assert.ok(invoiceAi.includes("storedDocumentInput(req,safe(data.clientRef,240))"),"PASS 2 must retrieve the saved original under the authenticated user's RLS");
assert.ok(invoiceAi.includes("claimVerificationJob(req,data)"),"PASS 2 must claim an idempotent server-side job before provider work");
assert.ok(processor.includes('@app.post("/verify")'),"The document processor must expose a dedicated independent verification endpoint");
for(const origin of [
  "https://boekuna-boekhouding.onrender.com",
  "https://kwinest-boekhouding.onrender.com",
  "https://boekuna.nl",
  "https://www.boekuna.nl",
  "https://boekuna-qa-staging.onrender.com"
]){
  assert.ok(processor.includes(origin),`Document processor CORS must allow the trusted app origin: ${origin}`);
}
assert.ok(processor.includes("allow_origins=sorted(ALLOWED_ORIGINS)"),"Document processor preflight must use the explicit trusted origin set");
assert.ok(processor.includes("origin not in ALLOWED_ORIGINS"),"Document processor route auth must use the same explicit trusted origin set");
assert.ok(!processor.includes('allow_origins=["*"]'),"Document processor must never use wildcard CORS origins");
assert.ok(processor.includes("SUPPORTED_IMAGE_MIME_TYPES"),"Processor must publish an explicit supported image MIME allowlist");
assert.ok(processor.includes("ext in SUPPORTED_IMAGE_EXTENSIONS or c in SUPPORTED_IMAGE_MIME_TYPES"),"Processor extraction must use the explicit image allowlist instead of accepting arbitrary image/* types");
assert.ok(html.includes("const DOCUMENT_IMAGE_MIME_TYPES="),"Frontend must share an explicit image MIME allowlist");
assert.ok(!html.includes('id="receiptPhotoFile" accept="image/*'),"Receipt picker must not advertise unsupported arbitrary image types");
assert.ok(!html.includes('id="receiptCameraFile" accept="image/*'),"Camera picker must use the same production image allowlist");
assert.ok(html.includes("DOCUMENT_IMAGE_MIME_TYPES.includes(String(file.type||'').toLowerCase())"),"Frontend validation must enforce the explicit supported MIME allowlist");
const frontendImageMimeMatch=html.match(/const DOCUMENT_IMAGE_MIME_TYPES=\[([^\]]+)\]/);
const processorImageMimeMatch=processor.match(/SUPPORTED_IMAGE_MIME_TYPES = frozenset\(\{([^}]+)\}\)/);
assert.ok(frontendImageMimeMatch&&processorImageMimeMatch,"Frontend and processor image MIME allowlists must be statically readable for drift checks");
const parseQuotedSet=s=>new Set([...s.matchAll(/["']([^"']+)["']/g)].map(m=>m[1]));
const frontendImageMimes=parseQuotedSet(frontendImageMimeMatch[1]);
const processorImageMimes=parseQuotedSet(processorImageMimeMatch[1]);
assert.deepEqual([...frontendImageMimes].sort(),[...processorImageMimes].sort(),"Frontend and processor image MIME allowlists must remain identical");
const frontendExtMatch=html.match(/const DOCUMENT_UPLOAD_EXTENSIONS=\[([^\]]+)\]/);
const processorExtMatch=processor.match(/SUPPORTED_DOCUMENT_EXTENSIONS = \(([^)]+)\)/);
assert.ok(frontendExtMatch&&processorExtMatch,"Document extension allowlists must be statically readable for drift checks");
const frontendExts=parseQuotedSet(frontendExtMatch[1]);
const processorExts=new Set([...parseQuotedSet(processorExtMatch[1])].map(x=>x.replace(/^\./,'')));
assert.deepEqual([...frontendExts].sort(),[...processorExts].sort(),"Frontend and processor document extension allowlists must remain identical");
assert.match(html,/const DOCUMENT_MAX_SIZE_MB=15;/,"Frontend max-size fallback must stay centralized");
assert.match(processor,/MAX_BYTES = int\(os\.getenv\("MAX_FILE_BYTES", str\(15 \* 1024 \* 1024\)\)\)/,"Processor default max size must match the frontend fallback");

assert.ok(processor.includes('if not independent:'),"Independent PASS 2 must omit the primary heuristic answer from model context");
assert.ok(processor.includes('This is an INDEPENDENT SECOND VERIFICATION.'),"PASS 2 must use an explicitly independent verification instruction");
assert.ok(processor.includes('"store":False'),"OpenAI Responses must disable response storage for document analysis");
assert.ok(processor.includes('OPENAI_RESPONSES_URL = os.getenv'),"The OpenAI endpoint must be configurable for approved regional processing");
assert.ok(html.includes("status:fileSaved?(verificationNeeded?'pending':'verified')"),"Document verification state must persist after the original is safely stored");
assert.ok(html.includes("if(v.status==='needs_review')toast('Extra controle: controleer '+doc.name+' nog even')"),"Users should only be proactively notified for relevant verification differences");
assert.ok(html.includes("DOCUMENT_VERIFICATION_MAX_ATTEMPTS=2"),"Background verification retries must be finite");
assert.ok(html.includes("PASS 2 may not silently mutate")===false,"Production source must not contain test-only verification mutation text");
const financialFlow=html.slice(html.indexOf("async function processFinancialDocument"),html.indexOf("const DOCUMENT_VERIFICATION_VERSION"));
assert.ok(!financialFlow.includes("reviewMode:'verify'"),"PASS 2 must never block the first review screen");
assert.ok(financialFlow.includes("showPdfImportReview(parsed)"),"PASS 1 must still open the normal review screen");

assert.ok(!html.includes("add(!state.invoices.some(i=>i.number===draft.number),'Uniek factuurnummer'"),"Invoice edit validation must not flag its own number as a duplicate");
assert.ok(html.includes("function invoiceDraftChecks(draft,excludeId=editingInvoiceId||'')"),"Draft invoice validation must be separate");
assert.ok(html.includes("function invoiceFinalChecks(draft,excludeId=editingInvoiceId||'')"),"Final invoice validation must be separate");
assert.ok(html.includes("function invoiceSendChecks(draft,excludeId='')"),"Send validation must be separate");
assert.ok(html.includes("invoiceSendChecks(draft,i.id)"),"Existing invoice send validation must explicitly exclude its own identity");
assert.ok(html.includes("function saveCreditDraft"),"Partial credit flow is required");
assert.ok(html.includes("function correctExpense(id)"),"Booked expenses must use a correction entry instead of hard delete");
assert.ok(!html.includes("state.expenses=state.expenses.filter(x=>x.id!==id)"),"Booked expenses must not be hard deleted");
assert.ok(html.includes("actorId:String(currentUser?.id||'')"),"Financial audit events must record the acting user");
assert.ok(html.includes("function invoiceDiscountAmount(i)"),"Invoice discount calculation is required");
assert.ok(html.includes('name="discountType"'),"Invoice discount controls are required");
assert.ok(html.includes('minlength="12"'),"New/reset passwords must require at least 12 characters");
assert.ok(html.includes("Maak je gratis account"),"Signup must use the simplified account copy");
assert.ok(html.includes("auth.signUp({email,password:pw,options:{emailRedirectTo:AUTH_REDIRECT_URL}})"),"New signup must only send email/password and redirect configuration");
assert.ok(!html.includes("options:{data:{company},emailRedirectTo:AUTH_REDIRECT_URL}"),"Signup must not put the company object in Auth user metadata");
const authFlowSource=html.slice(html.indexOf("function showAuth(mode='login'"),html.indexOf("async function logoutUser()"));
assert.ok(!authFlowSource.includes('name="confirm"'),"Signup/recovery must not ask for password confirmation");
assert.ok(!authFlowSource.includes('name="companyName"'),"Signup must not collect company fields");
assert.ok(!html.includes('id="loginPassword" name="password" type="password" minlength='),"Login must not frontend-block legacy short passwords");
assert.ok(html.includes("auth.resend({type:'signup',email,options:{emailRedirectTo:AUTH_REDIRECT_URL}})"),"Signup verification resend must use Supabase resend");
assert.ok(html.includes("showVerificationState(email)"),"No-session signup must have a dedicated verification state");
assert.ok(html.includes("function mapAuthError(err,context='auth')"),"Auth errors must be mapped centrally");
assert.ok(html.includes("page='dashboard'"),"Authenticated users must enter on the dashboard");
assert.ok(!html.includes("page=needsProfile?'profile':'dashboard'"),"Profile completeness must not gate dashboard access");
assert.ok(!html.includes("Maak eerst je bedrijfsprofiel compleet voordat je een abonnement activeert."),"Accounting profile must not gate Stripe checkout");
assert.ok(html.includes("url.searchParams.get('register')==='1'"),"Registration must be directly addressable from the launch URL");
assert.ok(html.includes("showAuth('register')"),"Login must offer a route to create an account");
assert.ok(html.includes("function legacyUserForEmail(email)"),"Legacy local-account lookup must remain available");
assert.ok(html.includes("legacySnapshotForEmail(user.email)"),"Existing local administrations must remain migratable to cloud accounts");
assert.ok(html.includes("const hash=await hashPassword(pw,legacyUser.salt)"),"Legacy password verification must remain in the login migration path");
assert.ok(html.includes("async function requireMfaForUser(user)"),"MFA assurance-level gate must remain available");
assert.ok(html.includes("if(await requireMfaForUser(data.user))return;"),"Password login must still invoke the MFA gate before hydration");
assert.ok(html.includes("showMfaLoginChallenge()"),"MFA-enabled accounts must still render an authenticator challenge");
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
assert.ok(html.includes("fetchWithAuthRetry(activeDocumentProcessorUrl()+'/analyze'"),"Document processor requests must use authenticated retry through the account-scoped router");
assert.ok(html.includes("const DOCUMENT_PROCESSOR_BETA_URL='https://boekuna-pr58-ocr-staging.onrender.com';"),"OCR beta processor endpoint must be explicit");
assert.ok(html.includes("const DOCUMENT_PROCESSOR_BETA_USER_IDS=new Set(['d0323018-5346-475b-9c93-073d5d4fbab7']);"),"OCR beta must remain restricted to the approved Supabase user id");
assert.ok(html.includes("function activeDocumentProcessorUrl(){return currentUser?.id&&DOCUMENT_PROCESSOR_BETA_USER_IDS.has(String(currentUser.id))?DOCUMENT_PROCESSOR_BETA_URL:DOCUMENT_PROCESSOR_URL}"),"OCR beta routing must fall back to the stable processor for every non-beta account");
assert.ok(!html.includes("k.phetmanee@gmail.com"),"OCR beta authorization must not expose the account email in frontend source");
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
assert.ok(html.includes("serverReviewed=serverProc.reviewComplete===true||!!serverProc.ai||serverProc.fastPath==='deterministic'"),"Frontend must respect the processor's completed local-first AI/no-AI decision");
assert.ok(html.includes("confidenceScore||0)<82"),"Post-save independent AI verification must be limited to materially uncertain scans");
assert.ok(html.includes("d.mixedRates&&Number(d.fieldConfidence?.vatLines||0)<85"),"Mixed VAT alone must not force AI when trusted VAT lines are strong");
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
assert.ok(privacy.includes("originele geüploade document of de originele afbeelding"),"Privacy policy must disclose that independent AI verification can receive the original document/image");
assert.ok(privacy.includes("maximaal 30 dagen"),"Privacy policy must disclose standard OpenAI API abuse-monitoring retention without claiming ZDR");
assert.ok(privacy.includes("store:false"),"Privacy policy must distinguish Responses application-state storage from provider retention");
assert.ok(privacy.includes("niet dat AI-verwerking uitsluitend in de EU plaatsvindt"),"Privacy policy must not imply EU-only processing without verified production residency");
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
assert.ok(!html.slice(html.indexOf("async function startSubscription(plan)"),html.indexOf("async function openBillingPortal")).includes("profileEssentialsComplete"),"Subscription must not require a complete accounting profile");
assert.ok(html.includes("requirementsFor('invoice-finalize'"),"Invoice finalization must use function-specific company requirements");
assert.ok(html.includes("progressiveInvoiceProfileGate"),"Missing finalization data must use the progressive profile gate");
assert.ok(html.includes("AUTH_RETURN_INTENT_KEY"),"Progressive invoice return intent must survive navigation");
assert.ok(html.includes("resumeReturnIntentAfterProfile"),"Saving company details must return users to their draft invoice");
assert.ok(!html.includes("if(!profileEssentialsComplete(state.company))issues.push({severity:'bad'"),"Incomplete company data must not be a global red health error");
assert.ok(html.includes("EDGE_BASE+'/billing-checkout'"),"Checkout must be created server-side");
assert.ok(html.includes("EDGE_BASE+'/billing-portal'"),"Paid customers need subscription management");
assert.ok(html.includes("function renderBillingCard()"),"Settings must expose current plan and monthly usage");
assert.ok(html.includes("if(!['PROCESSOR_UNAVAILABLE','PROCESSING_TIMEOUT','UNKNOWN'].includes(code))throw err;"),"Only temporary processor failures may fall back to local document parsing");
assert.ok(!/sk_(?:live|test)_[A-Za-z0-9]+/.test(html),"Stripe secret keys must never be present in the browser source");
for(const code of ["DOCUMENT_PDF_UNREADABLE","DOCUMENT_IMAGE_UNREADABLE","DOCUMENT_UNSUPPORTED_TYPE","DOCUMENT_TOO_LARGE","AUTH_SESSION_EXPIRED","DOCUMENT_LIMIT_REACHED","ACCOUNT_READ_ONLY","RATE_LIMITED","PROCESSING_TIMEOUT","PROCESSOR_UNAVAILABLE","PERMISSION_DENIED","INVALID_REQUEST","UNKNOWN"]){
  assert.ok(html.includes(`${code}:[`)||html.includes(`'${code}':[`),`Stable document error code ${code} must have an explanation`);
}
assert.ok(html.includes("publicError.code||fallbackDocumentCode(r.status)"),"Document processor frontend adapter must prefer public error.code");
assert.ok(html.includes("return {code,title:info[0]"),"Upload product behavior must retain the stable code instead of replacing it with HTTP status");
assert.ok(!html.includes("j.detail||j.error"),"Frontend must not interpret raw processor detail strings");
assert.ok(!html.includes("json.error||`AI-controle mislukt"),"Frontend must not render raw AI provider errors");
assert.ok(analyzeInvoiceEdge.includes("PUBLIC_ERROR_CODES"),"AI edge route must enforce a public error-code allowlist");
assert.ok(analyzeInvoiceEdge.includes("reference_id"),"AI edge errors must include a support reference id");
assert.ok(analyzeInvoiceEdge.includes("provider_request_id"),"AI edge logs must preserve provider request ids internally");
assert.ok(!analyzeInvoiceEdge.includes("return j(req,{ok:false,error:message}"),"AI edge route must never return a raw provider message");
assert.ok(!analyzeInvoiceEdge.includes("out?.detail||out?.error"),"Verification proxy must never forward raw processor detail strings");
assert.ok(processor.includes("class BoekunaDocumentError"),"Processor must centralize safe document failures");
assert.ok(processor.includes("public_error_response"),"Processor must use one public error response builder");
assert.ok(processor.includes('"reference_id":reference_id'),"Processor failures must include a reference id");
assert.ok(!processor.includes('f"Deze foto kon niet worden geopend ({type(exc).__name__})'),"Image decoder exception types must never be returned publicly");
assert.ok(!processor.includes('f"Document kon niet worden verwerkt ({type(exc).__name__})'),"Document library exception types must never be returned publicly");

console.log("Boekuna source safety tests: PASS");
