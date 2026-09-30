import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const DOCUMENT_PROCESSOR_URL=(Deno.env.get("DOCUMENT_PROCESSOR_URL")||"https://kwinest-docprocessor.onrender.com").replace(/\/$/,"");
const EXTERNAL_AI_ENABLED=["1","true","yes","on"].includes((Deno.env.get("BOOKUNA_ENABLE_EXTERNAL_AI")||"").trim().toLowerCase());
const ALLOWED_ORIGINS = new Set([
  "https://boekuna-boekhouding.onrender.com",
  "https://kwinest-boekhouding.onrender.com",
  "https://boekuna-qa-staging.onrender.com",
  "https://boekuna-render-link-qa.onrender.com",
  "https://boekuna.nl",
  "https://www.boekuna.nl",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);
const cors = (req: Request) => {
  const origin = req.headers.get("origin") || "";
  return {
    "access-control-allow-origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://app.boekuna.nl",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,apikey,content-type,x-kwinest-test-mode",
    "vary": "Origin"
  };
};
const j=(req:Request,body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"content-type":"application/json","cache-control":"no-store"}});
const safe=(v:any,n=1000)=>String(v??"").slice(0,n);
const parseJson=(t:string)=>{let raw=String(t||"").trim();if(raw.startsWith("\`\`\`"))raw=raw.replace(/^\`\`\`(?:json)?/i,"").replace(/\`\`\`$/,"").trim();const a=raw.indexOf("{"),b=raw.lastIndexOf("}");if(a>=0&&b>a)raw=raw.slice(a,b+1);return JSON.parse(raw)};
const outputText=(x:any)=>{if(typeof x?.output_text==="string")return x.output_text;for(const item of x?.output||[])if(item?.type==="message")for(const c of item.content||[])if(c?.type==="output_text"&&c.text)return c.text;return ""};

const PUBLIC_ERRORS:any={
  DOCUMENT_PDF_UNREADABLE:{category:"document",retryable:false},
  DOCUMENT_IMAGE_UNREADABLE:{category:"document",retryable:false},
  DOCUMENT_UNSUPPORTED_TYPE:{category:"document",retryable:false},
  DOCUMENT_TOO_LARGE:{category:"document",retryable:false},
  AUTH_SESSION_EXPIRED:{category:"auth",retryable:false},
  DOCUMENT_LIMIT_REACHED:{category:"entitlement",retryable:false},
  ACCOUNT_READ_ONLY:{category:"entitlement",retryable:false},
  RATE_LIMITED:{category:"temporary",retryable:true},
  PROCESSING_TIMEOUT:{category:"temporary",retryable:true},
  PROCESSOR_UNAVAILABLE:{category:"temporary",retryable:true},
  PERMISSION_DENIED:{category:"permission",retryable:false},
  INVALID_REQUEST:{category:"request",retryable:false},
  UNKNOWN:{category:"temporary",retryable:true},
};
const PUBLIC_ERROR_CODES=new Set(Object.keys(PUBLIC_ERRORS));
const newReferenceId=()=>{
  const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",bytes=crypto.getRandomValues(new Uint8Array(6));
  return "BK-"+Array.from(bytes,b=>alphabet[b%alphabet.length]).join("");
};
const sanitizeLog=(value:any,n=500)=>String(value??"")
  .replace(/Bearer\s+[A-Za-z0-9._~+\-/=]+/gi,"Bearer [REDACTED]")
  .replace(/\b(?:sk(?:[-_](?:live|test|proj))?|sb_secret|sb_publishable)[-_][A-Za-z0-9_-]+\b/gi,"[REDACTED_KEY]")
  .replace(/(authorization|api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+/gi,"$1=[REDACTED]")
  .slice(0,n);
const safePublicContext=(value:any)=>{
  const out:any={};if(!value||typeof value!=="object")return out;
  for(const k of ["max_size_mb","max_pages","monthly_limit","remaining","retry_after_seconds","supported_extensions","supported_mime_types"]){
    if(value[k]!==undefined)out[k]=value[k];
  }
  return out;
};
const fail=(req:Request,code:string,status:number,internal:any={})=>{
  if(!PUBLIC_ERROR_CODES.has(code))code="UNKNOWN";
  const spec=PUBLIC_ERRORS[code],reference_id=String(internal.reference_id||newReferenceId()).slice(0,32);
  console.error(JSON.stringify({
    event:"document_ai_error",reference_id,timestamp:new Date().toISOString(),route:"analyze-invoice",
    stage:internal.stage||"unknown",internal_code:internal.internal_code||code,public_code:code,
    http_status:status,retryable:spec.retryable,processing_state:internal.state||"no_changes",
    user_ref:internal.user_ref||null,file_mime:internal.file_mime||null,file_ext:internal.file_ext||null,file_size:internal.file_size||null,
    provider:internal.provider||null,provider_status:internal.provider_status??null,
    provider_code:sanitizeLog(internal.provider_code,120)||null,provider_request_id:sanitizeLog(internal.provider_request_id,120)||null,
    internal_error:sanitizeLog(internal.internal_error)||null,
  }));
  return j(req,{ok:false,error:{
    code,category:spec.category,retryable:spec.retryable,reference_id,
    context:safePublicContext(internal.context),state:internal.state||"no_changes"
  }},status);
};
const upstreamPublicCode=(out:any,fallback="PROCESSOR_UNAVAILABLE")=>{
  const code=String(out?.error?.code||"");
  return PUBLIC_ERROR_CODES.has(code)?code:fallback;
};

async function sha256(value:string){
  const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function authUser(req:Request){
  const h=req.headers.get("authorization")||"";
  if(!h.startsWith("Bearer "))return null;
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:h}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await sb.auth.getUser();
  return !error&&data.user?{user:data.user,token:h.slice(7)}:null;
}
function bytesToBase64(bytes:Uint8Array){
 let bin="";const chunk=0x8000;
 for(let i=0;i<bytes.length;i+=chunk)bin+=String.fromCharCode(...bytes.subarray(i,i+chunk));
 return btoa(bin);
}
async function storedDocumentInput(req:Request,clientRef:string){
 if(!clientRef)return {ok:false,kind:"missing",internal_code:"CLIENT_REF_MISSING"} as any;
 const user=await authUser(req);if(!user)return {ok:false,kind:"auth",internal_code:"AUTH_SESSION_INVALID"} as any;
 const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:"Bearer "+user.token}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:meta,error}=await sb.from("documents").select("storage_path,name,mime_type").eq("user_id",user.user.id).eq("client_ref",clientRef).maybeSingle();
 if(error)return {ok:false,kind:"unavailable",state:"unknown_state",internal_code:"DOCUMENT_METADATA_READ_FAILED",internal_error:error.message} as any;
 if(!meta?.storage_path)return {ok:false,kind:"missing",state:"unknown_state",internal_code:"ORIGINAL_DOCUMENT_NOT_FOUND"} as any;
 const {data:blob,error:downloadError}=await sb.storage.from("kwinest-documents").download(meta.storage_path);
 if(downloadError)return {ok:false,kind:"unavailable",state:"stored_unprocessed",internal_code:"DOCUMENT_STORAGE_DOWNLOAD_FAILED",internal_error:downloadError.message} as any;
 if(!blob)return {ok:false,kind:"unavailable",state:"stored_unprocessed",internal_code:"DOCUMENT_STORAGE_EMPTY_RESPONSE"} as any;
 try{
   const bytes=new Uint8Array(await blob.arrayBuffer());
   return {ok:true,fileName:safe(meta.name||"document",160),mimeType:safe(meta.mime_type||blob.type||"application/octet-stream",120).toLowerCase(),base64:bytesToBase64(bytes)};
 }catch(e){
   return {ok:false,kind:"unavailable",state:"stored_unprocessed",internal_code:"DOCUMENT_STORAGE_READ_FAILED",internal_error:e} as any;
 }
}

function adminDb(){
 return createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function claimVerificationJob(req:Request,data:any){
 if(data?.reviewMode!=="verify"||!data?.clientRef)return {kind:"none"} as any;
 const auth=await authUser(req);if(!auth)return {kind:"none"} as any;
 const userId=auth.user.id,documentRef=safe(data.clientRef,240),version=Math.max(1,Number(data.verificationVersion||1)||1),admin=adminDb(),now=new Date();
 const fresh={user_id:userId,document_ref:documentRef,verification_version:version,status:"running",attempts:1,started_at:now.toISOString(),updated_at:now.toISOString()};
 const {data:inserted,error:insertError}=await admin.from("document_verification_jobs").insert(fresh).select("*").maybeSingle();
 if(!insertError&&inserted)return {kind:"run",userId,documentRef,version,attempts:1};
 if(insertError?.code!=="23505")throw insertError;
 const {data:existing,error:readError}=await admin.from("document_verification_jobs").select("*").eq("user_id",userId).eq("document_ref",documentRef).eq("verification_version",version).maybeSingle();
 if(readError||!existing)throw readError||new Error("VERIFICATION_JOB_NOT_FOUND");
 if(existing.status==="completed"&&existing.result)return {kind:"cached",result:existing.result};
 const updatedAt=Date.parse(existing.updated_at||existing.started_at||"")||0,stale=Date.now()-updatedAt>2*60*1000,attempts=Number(existing.attempts||0);
 if(existing.status==="running"&&!stale)return {kind:"in_progress"};
 if(attempts>=2)return {kind:"exhausted"};
 const next=attempts+1;
 const {data:claimed,error:claimError}=await admin.from("document_verification_jobs").update({status:"running",attempts:next,last_error:null,started_at:now.toISOString(),updated_at:now.toISOString()}).eq("user_id",userId).eq("document_ref",documentRef).eq("verification_version",version).eq("attempts",attempts).select("*").maybeSingle();
 if(claimError)throw claimError;
 return claimed?{kind:"run",userId,documentRef,version,attempts:next}:{kind:"in_progress"}
}
async function finishVerificationJob(claim:any,result:any,errorMessage=""){
 if(!claim||claim.kind!=="run")return;
 const admin=adminDb(),now=new Date().toISOString();
 await admin.from("document_verification_jobs").update(errorMessage?{status:"failed",last_error:safe(errorMessage,500),updated_at:now}:{status:"completed",result,last_error:null,completed_at:now,updated_at:now}).eq("user_id",claim.userId).eq("document_ref",claim.documentRef).eq("verification_version",claim.version).eq("attempts",claim.attempts);
}

async function allowRequest(req:Request,body:any){
  const user=await authUser(req);
  if(user){
    const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:"Bearer "+user.token}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:canOperate,error:entitlementError}=await sb.rpc("can_operate_bookkeeping");
    if(entitlementError)return {ok:false,kind:"unavailable",user};
    if(canOperate!==true)return {ok:false,kind:"read_only",user};
    if(body?.reviewMode==="verify")return {ok:true,kind:"user",user};
    try{
      const q=await fetch(Deno.env.get("SUPABASE_URL")!+"/functions/v1/consume-quota",{method:"POST",headers:{Authorization:"Bearer "+user.token,"content-type":"application/json"},body:JSON.stringify({feature:"invoice_ai"}),signal:AbortSignal.timeout(12000)});
      const o=await q.json().catch(()=>({}));
      if(q.ok&&o?.allowed===true)return {ok:true,kind:"user",user};
      const code=String(o?.error?.code||"");
      if(code==="ACCOUNT_READ_ONLY")return {ok:false,kind:"read_only",user};
      if(code==="RATE_LIMITED")return {ok:false,kind:"rate_limited",user,upstream:o?.error};
      if(code==="AUTH_SESSION_EXPIRED")return {ok:false,kind:"auth_expired",user};
      return {ok:false,kind:"unavailable",user,upstream:o?.error};
    }catch(e){
      return {ok:false,kind:e instanceof DOMException&&e.name==="TimeoutError"?"timeout":"unavailable",user,internal_error:e};
    }
  }
  const origin=req.headers.get("origin")||"";
  const test=req.headers.get("x-kwinest-test-mode")==="1" && body?.testMode===true;
  if(!test || !ALLOWED_ORIGINS.has(origin))return {ok:false,kind:"none"};
  const ip=(req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")||"unknown").split(",")[0].trim();
  const hash=await sha256(ip+"|kwinest-invoice-ai");
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await admin.rpc("consume_anonymous_ai_quota",{p_client_hash:hash});
  if(error)return {ok:false,kind:"unavailable",internal_error:error.message};
  return {ok:data===true,kind:data===true?"test":"rate_limited"};
}

function promptFor(data:any){
 const verify=data?.reviewMode==="verify";
 const modeInstruction=verify
  ? "DIT IS EEN ONAFHANKELIJKE TWEEDE CONTROLE. Bepaal alle velden opnieuw uit de originele bron. Je krijgt bewust geen waarden uit PASS 1 als antwoordhint. Probeer eerdere herkenning niet te bevestigen of te corrigeren; rapporteer uitsluitend wat je zelf uit het document kunt onderbouwen.\\n\\n"
  : "DIT IS DE EERSTE EXTRACTIEPASS. Lokale herkenning mag alleen als zwakke hint worden gebruikt en mag zichtbaar documentbewijs nooit overrulen.\\n\\n";
 const priorHint=verify?"":("Lokale herkenning (hint, nooit waarheid):\\n"+JSON.stringify(data.localGuess||{}).slice(0,10000)+"\\n\\n");
 return (
"Je bent een Nederlandse boekhoudkundige document-extractor. Lees het ORIGINELE document en de beschikbare PDF/OCR-tekst.\\n"+
"Je taak is niet gokken maar controleren. Als een veld niet betrouwbaar uit het document volgt, geef een lege waarde en verlaag de fieldConfidence.\\n\\n"+
modeInstruction+
"BELANGRIJKE REGELS:\\n"+
"- Onderscheid leverancier, klant en het eigen bedrijf. Eigen bedrijf: "+JSON.stringify(data.company||{}).slice(0,7000)+"\\n"+
"- Bij self-billing (factuur uitgereikt door afnemer) bepaal de richting correct.\\n"+
"- Factuurbedrag/omzet is NOOIT automatisch gelijk aan netto bankuitbetaling.\\n"+
"- Factoringkosten, platformkosten, commissie, inhoudingen en betaalproviderkosten moeten in adjustments.\\n"+
"- Voorbeeld: factuur 187,55; factoringkosten 6,58; uitbetaling 180,97 => gross=187.55, adjustments gross=6.58, payout=180.97.\\n"+
"- Controleer altijd net + vat = gross binnen afronding.\\n"+
"- Bij gemengde btw-tarieven: mixedRates=true; forceer geen enkel algemeen btw-tarief.\\n"+
"- Gebruik datums als ISO YYYY-MM-DD.\\n"+
"- lineItems bevatten alleen echte factuurregels, nooit totalen, btw-regels of betalingsregels.\\n"+
"- Geef confidence en fieldConfidence 0-100 op basis van zichtbaar bewijs.\\n"+
"- Voeg warnings toe voor elk onzeker veld of intern probleem dat je zelf in deze analyse ziet.\\n"+
"- Geen markdown, geen tekst buiten JSON.\\n\\n"+
"Geef exact één JSON-object met velden type, party, email, phone, vatId, kvk, address, postal, city, iban, invoiceNumber, issueDate, dueDate, paymentReference, description, net, vatAmount, gross, vatRate, payout, selfBilling, status, mixedRates, lineItems, adjustments, adjustmentParty, confidence, fieldConfidence, warnings, reasoningSummary.\\n"+
"lineItems: [{desc,qty,unit,vat,total}]. adjustments: [{net,vat,gross,vatRate,counterparty}].\\n\\n"+
priorHint+
"PDF/OCR-tekst:\\n"+safe(data.extractedText,30000)
 );
}
const outputSchema={"type":"object","additionalProperties":false,"properties":{"documentType":{"type":"string","enum":["purchase_invoice","sale_invoice","credit_invoice","receipt","bank_document","other","unknown"]},"type":{"type":"string","enum":["sale","purchase","unknown"]},"party":{"anyOf":[{"type":"string"},{"type":"null"}]},"email":{"anyOf":[{"type":"string"},{"type":"null"}]},"phone":{"anyOf":[{"type":"string"},{"type":"null"}]},"vatId":{"anyOf":[{"type":"string"},{"type":"null"}]},"kvk":{"anyOf":[{"type":"string"},{"type":"null"}]},"address":{"anyOf":[{"type":"string"},{"type":"null"}]},"postal":{"anyOf":[{"type":"string"},{"type":"null"}]},"city":{"anyOf":[{"type":"string"},{"type":"null"}]},"country":{"anyOf":[{"type":"string"},{"type":"null"}]},"iban":{"anyOf":[{"type":"string"},{"type":"null"}]},"invoiceNumber":{"anyOf":[{"type":"string"},{"type":"null"}]},"issueDate":{"anyOf":[{"type":"string"},{"type":"null"}]},"dueDate":{"anyOf":[{"type":"string"},{"type":"null"}]},"paymentReference":{"anyOf":[{"type":"string"},{"type":"null"}]},"description":{"anyOf":[{"type":"string"},{"type":"null"}]},"orderNumber":{"anyOf":[{"type":"string"},{"type":"null"}]},"currency":{"anyOf":[{"type":"string"},{"type":"null"}]},"paymentTermDays":{"anyOf":[{"type":"number"},{"type":"null"}]},"net":{"anyOf":[{"type":"number"},{"type":"null"}]},"vatAmount":{"anyOf":[{"type":"number"},{"type":"null"}]},"gross":{"anyOf":[{"type":"number"},{"type":"null"}]},"vatRate":{"anyOf":[{"type":"number"},{"type":"null"}]},"payout":{"anyOf":[{"type":"number"},{"type":"null"}]},"discount":{"anyOf":[{"type":"number"},{"type":"null"}]},"shipping":{"anyOf":[{"type":"number"},{"type":"null"}]},"selfBilling":{"type":"boolean"},"status":{"type":"string","enum":["open","sent","paid","draft","cancelled","credit","unknown"]},"mixedRates":{"type":"boolean"},"vatLines":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"rate":{"anyOf":[{"type":"number"},{"type":"null"}]},"taxableAmount":{"anyOf":[{"type":"number"},{"type":"null"}]},"vatAmount":{"anyOf":[{"type":"number"},{"type":"null"}]}},"required":["rate","taxableAmount","vatAmount"]}},"lineItems":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"desc":{"anyOf":[{"type":"string"},{"type":"null"}]},"qty":{"anyOf":[{"type":"number"},{"type":"null"}]},"unit":{"anyOf":[{"type":"number"},{"type":"null"}]},"vat":{"anyOf":[{"type":"number"},{"type":"null"}]},"total":{"anyOf":[{"type":"number"},{"type":"null"}]}},"required":["desc","qty","unit","vat","total"]}},"adjustments":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"net":{"anyOf":[{"type":"number"},{"type":"null"}]},"vat":{"anyOf":[{"type":"number"},{"type":"null"}]},"gross":{"anyOf":[{"type":"number"},{"type":"null"}]},"vatRate":{"anyOf":[{"type":"number"},{"type":"null"}]},"counterparty":{"anyOf":[{"type":"string"},{"type":"null"}]}},"required":["net","vat","gross","vatRate","counterparty"]}},"adjustmentParty":{"anyOf":[{"type":"string"},{"type":"null"}]},"confidence":{"type":"number","minimum":0,"maximum":100},"fieldConfidence":{"type":"object","additionalProperties":false,"properties":{"party":{"type":"number","minimum":0,"maximum":100},"email":{"type":"number","minimum":0,"maximum":100},"phone":{"type":"number","minimum":0,"maximum":100},"vatId":{"type":"number","minimum":0,"maximum":100},"kvk":{"type":"number","minimum":0,"maximum":100},"address":{"type":"number","minimum":0,"maximum":100},"postal":{"type":"number","minimum":0,"maximum":100},"city":{"type":"number","minimum":0,"maximum":100},"country":{"type":"number","minimum":0,"maximum":100},"iban":{"type":"number","minimum":0,"maximum":100},"invoiceNumber":{"type":"number","minimum":0,"maximum":100},"issueDate":{"type":"number","minimum":0,"maximum":100},"dueDate":{"type":"number","minimum":0,"maximum":100},"paymentReference":{"type":"number","minimum":0,"maximum":100},"description":{"type":"number","minimum":0,"maximum":100},"net":{"type":"number","minimum":0,"maximum":100},"vatAmount":{"type":"number","minimum":0,"maximum":100},"gross":{"type":"number","minimum":0,"maximum":100},"vatRate":{"type":"number","minimum":0,"maximum":100},"payout":{"type":"number","minimum":0,"maximum":100},"currency":{"type":"number","minimum":0,"maximum":100},"orderNumber":{"type":"number","minimum":0,"maximum":100},"paymentTermDays":{"type":"number","minimum":0,"maximum":100}},"required":["party","email","phone","vatId","kvk","address","postal","city","country","iban","invoiceNumber","issueDate","dueDate","paymentReference","description","net","vatAmount","gross","vatRate","payout","currency","orderNumber","paymentTermDays"]},"warnings":{"type":"array","items":{"type":"string"}},"reasoningSummary":{"type":"string"}},"required":["documentType","type","party","email","phone","vatId","kvk","address","postal","city","country","iban","invoiceNumber","issueDate","dueDate","paymentReference","description","orderNumber","currency","paymentTermDays","net","vatAmount","gross","vatRate","payout","discount","shipping","selfBilling","status","mixedRates","vatLines","lineItems","adjustments","adjustmentParty","confidence","fieldConfidence","warnings","reasoningSummary"]};

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  const configured=EXTERNAL_AI_ENABLED && !!(Deno.env.get("OPENAI_API_KEY")||Deno.env.get("AI_GATEWAY_API_KEY"));
  if(req.method==="GET")return j(req,{ok:true,service:"invoice-ai-review",configured,model:"gpt-5.6-sol"});
  if(req.method!=="POST")return fail(req,"INVALID_REQUEST",405,{stage:"request",internal_code:"METHOD_NOT_ALLOWED"});
  const origin=req.headers.get("origin")||"";
  if(origin && !ALLOWED_ORIGINS.has(origin))return fail(req,"PERMISSION_DENIED",403,{stage:"request",internal_code:"ORIGIN_NOT_ALLOWED",internal_error:origin});

  const data=await req.json().catch(()=>null);
  if(!data)return fail(req,"INVALID_REQUEST",400,{stage:"request",internal_code:"INVALID_JSON"});
  const sourceName=safe(data.fileName||"document",160);
  const mime=safe(data.mimeType||(data.pdfBase64?"application/pdf":""),120).toLowerCase();
  const fileExt=(sourceName.match(/\.[A-Za-z0-9]+$/)?.[0]||"").toLowerCase();
  const common={file_mime:mime||null,file_ext:fileExt||null,file_size:Number(data.fileSize||0)||null};
  if(!EXTERNAL_AI_ENABLED)return fail(req,"PROCESSOR_UNAVAILABLE",503,{...common,stage:"ai_provider",internal_code:"AI_TEMPORARILY_DISABLED",state:data.reviewMode==="verify"?"stored_unprocessed":"no_changes"});

  const allowed=await allowRequest(req,data);
  const userRef=allowed?.user?.user?.id?String(allowed.user.user.id):null;
  if(!allowed.ok){
    if(allowed.kind==="none"||allowed.kind==="auth_expired")return fail(req,"AUTH_SESSION_EXPIRED",401,{...common,stage:"auth",internal_code:"AUTH_SESSION_INVALID",user_ref:userRef});
    if(allowed.kind==="read_only")return fail(req,"ACCOUNT_READ_ONLY",403,{...common,stage:"entitlement",internal_code:"ENTITLEMENT_READ_ONLY",user_ref:userRef});
    if(allowed.kind==="rate_limited")return fail(req,"RATE_LIMITED",429,{...common,stage:"rate_limit",internal_code:"AI_RATE_LIMIT",user_ref:userRef,context:allowed?.upstream?.context||{}});
    if(allowed.kind==="timeout")return fail(req,"PROCESSING_TIMEOUT",504,{...common,stage:"rate_limit",internal_code:"QUOTA_CHECK_TIMEOUT",internal_error:allowed.internal_error,user_ref:userRef});
    return fail(req,"PROCESSOR_UNAVAILABLE",503,{...common,stage:"entitlement",internal_code:"ENTITLEMENT_OR_QUOTA_UNAVAILABLE",internal_error:allowed.internal_error,user_ref:userRef});
  }

  const verify=data.reviewMode==="verify";
  let verificationClaim:any={kind:"none"};
  try{
    verificationClaim=await claimVerificationJob(req,data);
  }catch(e){
    return fail(req,"PROCESSOR_UNAVAILABLE",503,{...common,stage:"verification_job",internal_code:"VERIFICATION_JOB_ERROR",internal_error:e,user_ref:userRef,state:"unknown_state"});
  }
  if(verificationClaim.kind==="cached")return j(req,verificationClaim.result);
  if(verificationClaim.kind==="in_progress")return fail(req,"RATE_LIMITED",409,{...common,stage:"verification_job",internal_code:"VERIFICATION_IN_PROGRESS",user_ref:userRef,state:"stored_unprocessed",context:{retry_after_seconds:15}});
  if(verificationClaim.kind==="exhausted")return fail(req,"PROCESSOR_UNAVAILABLE",503,{...common,stage:"verification_job",internal_code:"VERIFICATION_RETRY_LIMIT",user_ref:userRef,state:"stored_unprocessed"});

  if(verify){
    const stored=await storedDocumentInput(req,safe(data.clientRef,240));
    if(!stored?.ok){
      const ref=newReferenceId(),missing=stored?.kind==="missing",auth=stored?.kind==="auth";
      const publicCode=auth?"AUTH_SESSION_EXPIRED":(missing?"INVALID_REQUEST":"PROCESSOR_UNAVAILABLE");
      const status=auth?401:(missing?422:503);
      await finishVerificationJob(verificationClaim,null,publicCode+"|"+ref);
      return fail(req,publicCode,status,{
        ...common,stage:"storage",internal_code:stored?.internal_code||"ORIGINAL_DOCUMENT_UNAVAILABLE",
        internal_error:stored?.internal_error,user_ref:userRef,state:String(stored?.state||"unknown_state"),reference_id:ref
      });
    }
    try{
      const bytes=Uint8Array.from(atob(stored.base64),c=>c.charCodeAt(0));
      const form=new FormData();
      form.append("file",new Blob([bytes],{type:stored.mimeType||"application/octet-stream"}),stored.fileName||"document");
      form.append("company_json",JSON.stringify(data.company||{}));
      const auth=req.headers.get("authorization")||"";
      const rr=await fetch(DOCUMENT_PROCESSOR_URL+"/verify",{
        method:"POST",
        headers:{Authorization:auth,Origin:"https://boekuna-boekhouding.onrender.com"},
        body:form,
        signal:AbortSignal.timeout(70000)
      });
      const out=await rr.json().catch(()=>({}));
      if(!rr.ok||!out?.ok){
        const code=upstreamPublicCode(out);
        const ref=String(out?.error?.reference_id||newReferenceId());
        await finishVerificationJob(verificationClaim,null,code+"|"+ref);
        return fail(req,code,rr.status>=400?rr.status:503,{
          ...common,stage:"processor_verify",internal_code:"DOCUMENT_PROCESSOR_"+code,user_ref:userRef,state:"stored_unprocessed",
          reference_id:ref,context:out?.error?.context||{},provider_status:rr.status
        });
      }
      const processing=out?.data?.processing||{};
      const response={ok:true,processor:true,model:processing.aiModel||"gpt-5.6-sol",data:out.data,usage:processing.aiUsage||null,pass:"verify"};
      await finishVerificationJob(verificationClaim,response);
      return j(req,response);
    }catch(e){
      const isTimeout=e instanceof DOMException&&e.name==="TimeoutError";
      const ref=newReferenceId();
      await finishVerificationJob(verificationClaim,null,(isTimeout?"PROCESSING_TIMEOUT":"PROCESSOR_UNAVAILABLE")+"|"+ref);
      return fail(req,isTimeout?"PROCESSING_TIMEOUT":"PROCESSOR_UNAVAILABLE",isTimeout?504:503,{
        ...common,stage:"processor_verify",internal_code:isTimeout?"DOCUMENT_PROCESSOR_TIMEOUT":"DOCUMENT_PROCESSOR_UNREACHABLE",
        internal_error:e,user_ref:userRef,state:"stored_unprocessed",reference_id:ref
      });
    }
  }

  const openaiKey=Deno.env.get("OPENAI_API_KEY");
  const gatewayKey=Deno.env.get("AI_GATEWAY_API_KEY");
  if(!openaiKey&&!gatewayKey)return fail(req,"PROCESSOR_UNAVAILABLE",503,{...common,stage:"ai_provider",internal_code:"AI_PROVIDER_NOT_CONFIGURED",user_ref:userRef});
  const content:any[]=[{type:"input_text",text:promptFor(data)}];
  const raw=String(data.fileBase64||data.pdfBase64||"");
  if(raw){
    const dataPrefix=/^data:[^;]+;base64,/i.exec(raw)?.[0]||"";
    const b64=dataPrefix?raw.slice(dataPrefix.length):raw;
    const supportedImages=new Set(["image/png","image/jpeg","image/webp","image/gif"]);
    const supportedFiles=new Set(["application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","text/csv","application/csv","text/plain"]);
    if(supportedImages.has(mime))content.push({type:"input_image",image_url:`data:${mime};base64,${b64}`,detail:"high"});
    else if(supportedFiles.has(mime))content.push({type:"input_file",filename:sourceName,file_data:`data:${mime};base64,${b64}`});
  }
  const direct=!!openaiKey;
  const endpoint=direct?(Deno.env.get("OPENAI_RESPONSES_URL")||"https://api.openai.com/v1/responses"):"https://ai-gateway.vercel.sh/v1/responses";
  const key=direct?openaiKey!:gatewayKey!;
  const model=direct?"gpt-5.6-sol":"openai/gpt-5.6-sol";
  const provider=direct?"openai":"vercel_ai_gateway";
  const payload={model,input:[{role:"user",content}],reasoning:{effort:verify?"medium":"low"},text:{format:{type:"json_schema",name:"invoice_extraction",schema:outputSchema,strict:true}},max_output_tokens:5000,store:false};
  let rr:Response,out:any;
  try{
    rr=await fetch(endpoint,{method:"POST",headers:{Authorization:"Bearer "+key,"content-type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(65000)});
    out=await rr.json().catch(()=>({}));
  }catch(e){
    const isTimeout=e instanceof DOMException&&e.name==="TimeoutError";
    const ref=newReferenceId();
    await finishVerificationJob(verificationClaim,null,(isTimeout?"PROCESSING_TIMEOUT":"PROCESSOR_UNAVAILABLE")+"|"+ref);
    return fail(req,isTimeout?"PROCESSING_TIMEOUT":"PROCESSOR_UNAVAILABLE",isTimeout?504:503,{
      ...common,stage:"ai_provider",internal_code:isTimeout?"AI_PROVIDER_TIMEOUT":"AI_PROVIDER_UNREACHABLE",
      internal_error:e,user_ref:userRef,provider,state:"no_changes",reference_id:ref
    });
  }
  if(!rr.ok){
    const providerCode=safe(out?.error?.code||out?.code,120);
    const providerMessage=sanitizeLog(out?.error?.message||out?.message,300);
    const providerRequestId=rr.headers.get("x-request-id")||rr.headers.get("openai-request-id")||"";
    const isTimeout=[408,504].includes(rr.status);
    const ref=newReferenceId();
    await finishVerificationJob(verificationClaim,null,(isTimeout?"PROCESSING_TIMEOUT":"PROCESSOR_UNAVAILABLE")+"|"+ref);
    return fail(req,isTimeout?"PROCESSING_TIMEOUT":"PROCESSOR_UNAVAILABLE",isTimeout?504:503,{
      ...common,stage:"ai_provider",internal_code:"AI_PROVIDER_HTTP_ERROR",internal_error:providerMessage,user_ref:userRef,
      provider,provider_status:rr.status,provider_code:providerCode,provider_request_id:providerRequestId,reference_id:ref
    });
  }
  try{
    const parsed=parseJson(outputText(out));
    const response={ok:true,model,data:parsed,usage:out.usage||null,pass:data.reviewMode==="verify"?"verify":"extract"};
    await finishVerificationJob(verificationClaim,response);
    return j(req,response);
  }catch(e){
    const ref=newReferenceId();
    await finishVerificationJob(verificationClaim,null,"PROCESSOR_UNAVAILABLE|"+ref);
    return fail(req,"PROCESSOR_UNAVAILABLE",502,{
      ...common,stage:"ai_response",internal_code:"AI_RESPONSE_INVALID",internal_error:e,user_ref:userRef,
      provider,provider_status:rr.status,provider_request_id:rr.headers.get("x-request-id")||"",reference_id:ref
    });
  }
});