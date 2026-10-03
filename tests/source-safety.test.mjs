import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync(new URL("../kwinest/index.html",import.meta.url),"utf8");
const invoiceAi=fs.readFileSync(new URL("../supabase/functions/analyze-invoice/index.ts",import.meta.url),"utf8");
const processor=fs.readFileSync(new URL("../kwinest/docprocessor/app.py",import.meta.url),"utf8");
const brandSymbol=fs.readFileSync(new URL("../public/assets/boekuna-symbol.svg",import.meta.url),"utf8");
const brandManifest=fs.readFileSync(new URL("../public/manifest.webmanifest",import.meta.url),"utf8");
const brandMarketing=fs.readFileSync(new URL("../public/assets/marketing.js",import.meta.url),"utf8");
const sendInvoice=fs.readFileSync(new URL("../supabase/functions/send-invoice/index.ts",import.meta.url),"utf8");
const emailConnection=fs.readFileSync(new URL("../supabase/functions/email-connection/index.ts",import.meta.url),"utf8");
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
assert.ok(html.includes("const EXTERNAL_AI_REVIEW_ENABLED=false;"),"External AI review must be disabled by default in the client");
assert.ok(html.includes("manualReviewNeeded=fileSaved&&!EXTERNAL_AI_REVIEW_ENABLED"),"Uncertain documents must fall back to manual review while external AI is disabled");
assert.ok(html.includes("manualReviewNeeded?'needs_review':'verified'"),"Disabled AI must never make an uncertain document look independently verified");
assert.ok(processor.includes('EXTERNAL_AI_ENABLED = os.getenv("BOOKUNA_ENABLE_EXTERNAL_AI", "")'),"Processor external AI must be opt-in only");
assert.ok(invoiceAi.includes('Deno.env.get("BOOKUNA_ENABLE_EXTERNAL_AI")'),"Edge AI review must be opt-in only");
assert.ok(invoiceAi.includes('internal_code:"AI_TEMPORARILY_DISABLED"'),"Disabled AI endpoint must fail closed without provider calls");
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
assert.ok(html.includes("invoiceSendChecks(draft,invoice.id)"),"Native invoice send validation must explicitly exclude its own identity");
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
const authFlowStart=html.indexOf("function showAuth(mode='login'");
const authFlowEnd=html.indexOf("async function logoutUser",authFlowStart);
assert.ok(authFlowStart>=0&&authFlowEnd>authFlowStart,"Auth flow source boundaries must be present");
const authFlowSource=html.slice(authFlowStart,authFlowEnd);
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
assert.ok(html.includes("documentProcessorXhr(fd,processingItem)"),"User-selected document uploads must use the progress-aware authenticated XHR path");
assert.ok(html.includes("xhr.open('POST',DOCUMENT_PROCESSOR_URL+'/analyze',true)"),"Progress-aware uploads must target the promoted production processor");
assert.ok(html.includes("const headers=await apiAuthHeaders({},forceRefresh)"),"Progress-aware uploads must use account-scoped auth headers");
assert.ok(!html.includes("DOCUMENT_PROCESSOR_BETA"),"Retired OCR beta routing must not remain in production source");
assert.ok(!html.includes("boekuna-pr58-ocr-staging.onrender.com"),"Retired OCR staging endpoint must not remain in production source");
assert.ok(!html.includes("activeDocumentProcessorUrl()"),"All accounts must use the production document processor directly");
assert.ok(html.includes("async function fetchWithAuthRetry"),"Authenticated processor requests must refresh and retry expired sessions");
assert.ok(html.includes('id="boekuna-upload-bootstrap"'),"Upload bootstrap must exist independently of the main app initialization");
assert.ok(html.includes("input.dataset.uploadBound='true'"),"Upload controls must be explicitly bound after the main script");
for(const id of ["invoicePdfFile"]){
  assert.ok(html.includes(`['${id}'`),`${id} must be registered in the isolated upload bootstrap`);
}
assert.ok(!html.includes('id="receiptCameraFile"')&&!html.includes('id="receiptPhotoFile"'),"Scan must share one native file picker");
assert.ok(html.includes("async function startSelectedDocumentUpload"),"Selected documents must enter one shared, user-visible upload pipeline");
assert.ok(html.includes("pendingPdfImport=null"),"Document import state must be declared before cleanup/use");
assert.ok(html.includes("pendingUploadKind='auto'"),"Upload mode state must be declared explicitly");
assert.ok(html.includes("function setImportProgress(title,msg,sub='')"),"Unknown-duration processing must be indeterminate rather than time-faked");
assert.ok(html.includes("xhr.upload.onprogress"),"Document uploads must expose browser-reported byte progress");
assert.ok(html.includes("DOCUMENT_PROCESSING_TRANSITIONS"),"Document processing must use one explicit state machine");
assert.ok(html.includes("DOCUMENT_PROCESSING_LONG_WAIT_MS=15000"),"Long-wait UX must have an explicit threshold");
assert.ok(html.includes("DOCUMENT_PROCESSING_TIMEOUT_MS=120000"),"Document processing must retain a watchdog timeout");
assert.ok(!financialFlow.includes(",28,2"),"Financial processing must not expose fake 28% progress");
assert.ok(!financialFlow.includes(",48,3"),"Financial processing must not expose fake 48% progress");
assert.ok(!financialFlow.includes(",66,4"),"Financial processing must not expose fake 66% progress");
assert.ok(!financialFlow.includes(",98,6"),"Financial processing must not expose fake 98% progress");
assert.ok(html.includes('id="importProgressMessage"'),"Upload progress must use the compact loading state");
assert.ok(html.includes("const browserStructurePromise="),"PDF client inspection should start in parallel with server processing");
assert.ok(html.includes("serverReviewed=serverProc.reviewComplete===true||!!serverProc.ai||serverProc.fastPath==='deterministic'"),"Frontend must respect the processor's completed local-first AI/no-AI decision");
assert.ok(html.includes("confidenceScore||0)<82"),"Uncertain scans must still be identified for manual or future independent verification");
assert.ok(html.includes("d.mixedRates&&Number(d.fieldConfidence?.vatLines||0)<85"),"Mixed VAT alone must not force review when trusted VAT lines are strong");
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
const storePrivacy=fs.readFileSync(new URL("../store/privacy-data-safety.md",import.meta.url),"utf8");
const support=fs.readFileSync(new URL("../public/support/index.html",import.meta.url),"utf8");
const deletion=fs.readFileSync(new URL("../public/account-verwijderen/index.html",import.meta.url),"utf8");
const deleteAccountEdge=fs.readFileSync(new URL("../supabase/functions/delete-account/index.ts",import.meta.url),"utf8");
const analyzeInvoiceEdge=fs.readFileSync(new URL("../supabase/functions/analyze-invoice/index.ts",import.meta.url),"utf8");
assert.ok(privacy.includes("Boekuna is een product van Kwinest"),"Privacy policy must identify the product/operator");
assert.ok(privacy.includes("momenteel geen externe AI-provider"),"Privacy policy must state that external AI is disabled in the current production document flow");
assert.ok(privacy.includes("niet naar OpenAI of een andere externe AI-provider gestuurd"),"Privacy policy must state that current production does not send document data to external AI");
assert.ok(privacy.includes("privacybeleid vóór activering bijgewerkt"),"Privacy policy must require disclosure before any future external-AI reactivation");
assert.ok(storePrivacy.includes("External AI processing is currently disabled in production"),"Store privacy disclosure must match the production external-AI state");
assert.ok(storePrivacy.includes("does not send document text, uploaded documents/images or scan results"),"Store privacy disclosure must state that document data is not sent to external AI");
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
assert.ok(!html.includes("Documentprocessor v2"),"Document review must not expose stale hardcoded processor version copy");
assert.ok(html.includes("Boekuna documentherkenning"),"Document review must use version-independent recognition copy");
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


assert.ok(html.includes('id="boekuna-native-email-share"'),"Native invoice email-app handoff module must be present");
assert.ok(html.includes("navigator.share({title:prepared.subject,text:prepared.body,files:[prepared.file]})"),"Native handoff must use Web Share with the PDF file");
assert.ok(html.includes("navigator.canShare({files:[file]})"),"Native handoff must feature-detect file sharing");
assert.ok(html.includes("new File([buffer],invoiceShareFilename(invoice,customer),{type:'application/pdf'})"),"Shared invoice must be an application/pdf File");
assert.ok(html.includes("Voeg de PDF handmatig als bijlage toe"),"Desktop fallback must truthfully require manual attachment");
assert.ok(html.includes("Heb je de factuur verzonden?"),"Handoff must require explicit delivery confirmation");
assert.ok(html.includes("Ja, markeer als verzonden"),"Manual sent confirmation action must be explicit");
assert.ok(!html.includes("if(i.status==='draft')i.status='sent'"),"Opening/sending through an email app must never auto-mutate financial invoice status");
assert.ok(!html.includes("Gmail koppelen"),"Mailbox connection CTA must be absent from the user-visible app");
assert.ok(
  html.includes("Geen koppeling nodig")||html.includes("Boekuna maakt PDF en bericht klaar; jij verstuurt zelf."),
  "Settings must explain that invoice sending does not require a mailbox connection"
);
assert.ok(
  html.includes("Boekuna vraagt geen toegang tot Gmail, Outlook of je inbox")||
    (html.includes("Eigen e-mailapp")&&html.includes("Boekuna maakt PDF en bericht klaar; jij verstuurt zelf.")),
  "Settings must preserve the no-mailbox-access privacy boundary"
);
const nativeEmailModule=html.slice(html.indexOf('<script id="boekuna-native-email-share">'),html.indexOf('</script>',html.indexOf('<script id="boekuna-native-email-share">')));
assert.ok(!nativeEmailModule.includes("email-connection"),"Native invoice handoff must not call the mailbox OAuth endpoint");
assert.ok(!nativeEmailModule.includes("google_mail_client"),"Native invoice handoff must not depend on Gmail client credentials");
assert.ok(sendInvoice.includes('data.action==="render_pdf"'),"Invoice edge route must expose authenticated PDF rendering");
assert.ok(sendInvoice.includes('"content-type":"application/pdf"'),"PDF handoff must return application/pdf");
assert.ok(sendInvoice.includes("MAILBOX_SEND_DISABLED"),"Direct provider mailbox sending must be disabled");
const sendOriginsStart=sendInvoice.indexOf("const ALLOWED_ORIGINS");
const sendOriginsEnd=sendInvoice.indexOf("]);",sendOriginsStart);
assert.ok(sendOriginsStart>=0&&sendOriginsEnd>sendOriginsStart,"send-invoice explicit origin allowlist must be statically readable");
const sendOrigins=sendInvoice.slice(sendOriginsStart,sendOriginsEnd);
assert.ok(sendOrigins.includes("https://app.boekuna.nl"),"send-invoice allowlist must explicitly trust the production app origin");
assert.ok(!sendOrigins.includes("*"),"send-invoice CORS must not use wildcard origins");
assert.ok(sendInvoice.includes('ALLOWED_ORIGINS.has(origin)?{"access-control-allow-origin":origin}:{}'),"Untrusted origins must not receive a reflected or fallback ACAO value");
assert.ok(!sendInvoice.includes("gmail.googleapis.com"),"send-invoice must not contain Gmail API direct-send code");
assert.ok(!sendInvoice.includes("graph.microsoft.com"),"send-invoice must not contain Microsoft direct-send code");
assert.ok(!sendInvoice.includes("get_email_connection_secret"),"send-invoice must not read mailbox OAuth secrets");
assert.ok(!sendInvoice.includes("SUPABASE_SERVICE_ROLE_KEY"),"native invoice PDF handoff must not need service-role privileges");
assert.ok(emailConnection.includes("MAILBOX_CONNECTION_DISABLED"),"New mailbox OAuth connections must be disabled server-side");
assert.ok(!emailConnection.includes('scope: "openid email https://www.googleapis.com/auth/gmail.send"'),"Disabled mailbox connection route must no longer initiate Gmail send scope");
assert.ok(!html.includes("async function loginWithGoogle()"),"Google account login must remain unavailable");
assert.ok(!html.includes("signInWithOAuth"),"Production app must not expose OAuth account login");

assert.ok(brandSymbol.includes('fill="#1C6461"'),"Final approved Boekuna B mark colour must remain #1C6461");
assert.ok(!brandSymbol.includes("M18,22 H30 A12,12"),"Legacy offset-frame symbol must not return");
assert.ok(brandManifest.includes("/assets/boekuna-app-icon-maskable-512.png"),"PWA manifest must expose a maskable final-logo icon");
assert.ok(brandMarketing.includes("/assets/boekuna-og-1200x630.png"),"Public metadata must use the final-logo social preview");
const unifiedEmailModule=html.slice(html.indexOf('<script id="boekuna-unified-email-handoff-v2">'),html.indexOf('</script>',html.indexOf('<script id="boekuna-unified-email-handoff-v2">')));
assert.ok(unifiedEmailModule.length>1000,"Unified email handoff module must be present");
assert.ok(unifiedEmailModule.includes("function prepareEmailHandoffFromComposer()"),"Invoice/reminder/follow-up must share one handoff preparation flow");
assert.ok(unifiedEmailModule.includes("function finalizeDraftAndSend(id)"),"Draft invoice must support finalize + send in one action");
assert.ok(unifiedEmailModule.includes("window.openSendInvoice=openInvoiceComposer"),"Unified composer must override the legacy native-share global send alias");
assert.ok(unifiedEmailModule.includes("Definitief maken en versturen"),"Draft send CTA must be explicit");
assert.ok(html.includes('<option value="sent">Definitief / openstaand</option>'),"Invoice editor must not label finalization as already sent");
assert.ok(unifiedEmailModule.includes("function buildGmailComposeUrl(to,subject,body)"),"Desktop Gmail web compose route must exist");
assert.ok(unifiedEmailModule.includes("function buildEmailHandoffEmlFile()"),"Desktop Outlook route must build an RFC822 draft");
assert.ok(unifiedEmailModule.includes("'X-Unsent: 1'"),"Outlook draft must be explicitly marked unsent");
assert.ok(unifiedEmailModule.includes("'Content-Type: application/pdf; name=\"'+attachmentName+'\"'"),"Desktop Outlook draft must embed the invoice PDF");
assert.ok(unifiedEmailModule.includes("'Content-Disposition: attachment; filename=\"'+attachmentName+'\"'"),"Desktop Outlook draft must mark the PDF as an attachment");
assert.ok(unifiedEmailModule.includes("'Content-Transfer-Encoding: base64'"),"Desktop Outlook draft must encode MIME body and attachment safely");
assert.ok(unifiedEmailModule.includes("mailtoCompatibilityText(handoff.subject)"),"Windows mailto fallback must use compatibility-safe text");
assert.ok(unifiedEmailModule.includes("replace(/€/g,'EUR ')"),"Windows mailto fallback must avoid Outlook euro mojibake");
assert.ok(unifiedEmailModule.includes("Outlook met PDF"),"Desktop handoff must expose the attachment-preserving Outlook route");
assert.ok(!unifiedEmailModule.includes("De factuur vindt u als PDF in de bijlage."),"Default message body must not falsely claim an attachment before handoff");

assert.ok(html.includes("subjectInvoice:'Factuur {{factuurnummer}} · {{bedrijfsnaam}}'"),"Default invoice subject must be human-readable and not filename-like");
assert.ok(unifiedEmailModule.includes("Gmail openen"),"Mobile handoff must expose an explicit Gmail compose option");
assert.ok(unifiedEmailModule.includes("Andere e-mailapp openen"),"Mobile handoff must preserve a separate mailto route");
assert.ok(unifiedEmailModule.includes("PDF delen als bijlage"),"Attachment-first native sharing must remain available");
assert.ok(unifiedEmailModule.includes("de ontvangende app bepaalt zelf Aan en Onderwerp"),"Native share UX must disclose recipient/subject mapping limits");
assert.ok(unifiedEmailModule.includes("file:options.file||null"),"Returning to the composer must preserve the already prepared PDF");
assert.ok(unifiedEmailModule.includes("function ensureEmailHandoffPdfDownloaded()"),"Gmail/mailto PDF preparation must be idempotent");
assert.ok(unifiedEmailModule.includes("fileDownloaded:!!options.fileDownloaded"),"Download state must survive composer round-trips");
assert.ok(unifiedEmailModule.includes("new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'long',year:'numeric'})"),"Email dates must use readable Dutch long-month formatting");
assert.ok(unifiedEmailModule.includes("joinEmailSections"),"Email body must use one plain-text section formatter");
assert.ok(unifiedEmailModule.includes("window.buildInvoiceMailto(handoff.to,mailtoCompatibilityText(handoff.subject),mailtoCompatibilityText(handoff.body))"),"Desktop fallback email route must prefill recipient, subject and body through compatibility-safe mailto");
assert.ok(unifiedEmailModule.includes("window.downloadInvoiceShareFile(handoff.file)"),"Desktop handoff must explicitly prepare the PDF for manual attachment");
assert.ok(unifiedEmailModule.includes("navigator.share({title:handoff.subject,text:handoff.body,files:[handoff.file]})"),"Native file share must remain available as the attachment-first route");
assert.ok(unifiedEmailModule.includes("invoice.reminderCount=Number(invoice.reminderCount||0)+1"),"Reminder count must be recorded on explicit confirmation");
assert.ok(unifiedEmailModule.includes("invoice.reminderHistory=(invoice.reminderHistory||[]).concat([entry])"),"Reminder confirmations need auditable delivery metadata");
assert.ok(unifiedEmailModule.includes("if(!handoff||confirmBusy||handoff.confirmed)return"),"Duplicate delivery confirmation must be guarded");
assert.ok(unifiedEmailModule.includes("if(invoiceEffectiveStatus(invoice)==='paid'||toCents(invoiceOutstanding(invoice))<=0)"),"Paid invoices must not accept payment reminders");
assert.ok(unifiedEmailModule.includes("Factuur is nog niet vervallen"),"Pre-due reminder flow must redirect to a normal follow-up");
assert.ok(!unifiedEmailModule.includes("email-connection"),"Unified handoff must not revive mailbox OAuth");
assert.ok(!unifiedEmailModule.includes("gmail.googleapis.com"),"Unified handoff must not call Gmail send APIs");
const reminderDelegate=html.slice(html.indexOf("async function sendReminder(id)"),html.indexOf("function newPlannedCash"));
assert.ok(!reminderDelegate.includes("fetch(EDGE_BASE+'/send-invoice'"),"Legacy payment reminder must not directly call the disabled mailbox send route");
assert.ok(reminderDelegate.includes("prepareReminderHandoffFromForm"),"Legacy reminder entrypoint must delegate to the unified handoff");

console.log("Boekuna source safety tests: PASS");
