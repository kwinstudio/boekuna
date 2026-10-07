import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL=Deno.env.get("SUPABASE_URL")||"";
const ANON=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const PROCESSOR=(Deno.env.get("DOCUMENT_PROCESSOR_URL")||"https://kwinest-docprocessor.onrender.com").replace(/\/$/,"");
const APP_ORIGIN=(Deno.env.get("APP_URL")||"https://app.boekuna.nl").replace(/\/$/,"");
const ALLOWED=new Set([
  "https://boekuna.nl",
  "https://www.boekuna.nl",
  "https://boekuna-boekhouding.onrender.com",
  "https://boekuna-qa-staging.onrender.com",
  "https://boekuna-pr6-de1c73cb.onrender.com",
  "https://boekuna-document-background-preview.onrender.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);
const PRODUCTION_ORIGINS=new Set([
  "https://app.boekuna.nl",
  "https://boekuna.nl",
  "https://www.boekuna.nl",
  "https://boekuna-boekhouding.onrender.com",
  "https://kwinest-boekhouding.onrender.com"
]);
const MAX_BODY=64*1024;
const STALE_MS=10*60*1000;
const PROCESSING_CONCURRENCY=1;
const EXECUTION_MODE=Deno.env.get("DOCUMENT_EXECUTION_MODE")||"legacy";
const WORKFLOW_SLUG=Deno.env.get("DOCUMENT_WORKFLOW_SLUG")||"";
const WORKFLOW_API_KEY=Deno.env.get("RENDER_API_KEY")||"";
const WORKFLOW_RECOVERY_ENABLED=Deno.env.get("DOCUMENT_WORKFLOW_RECOVERY_ENABLED")==="true";
const ACTIVE=new Set(["received","queued","processing","validating"]);
const RETRYABLE_CODES=new Set(["PROCESSOR_UNAVAILABLE","PROCESSING_TIMEOUT","RATE_LIMITED","NETWORK_ERROR","UNKNOWN"]);

function cors(req:Request){
  const origin=req.headers.get("origin")||"";
  return {
    "access-control-allow-origin":ALLOWED.has(origin)?origin:APP_ORIGIN,
    "access-control-allow-methods":"POST,OPTIONS",
    "access-control-allow-headers":"authorization,apikey,content-type,x-boekuna-dev-session",
    "access-control-allow-credentials":"true",
    "vary":"Origin"
  };
}
function out(req:Request,body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...cors(req),"content-type":"application/json","cache-control":"no-store"}});
}
function clean(v:unknown,n=160){return String(v??"").replace(/[\r\n\t]+/g," ").trim().slice(0,n)}
function ref(){return crypto.randomUUID().slice(0,8)}
async function jsonBody(req:Request){
  const declared=Number(req.headers.get("content-length")||0);
  if(declared>MAX_BODY)throw new Error("REQUEST_TOO_LARGE");
  const raw=await req.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_BODY)throw new Error("REQUEST_TOO_LARGE");
  try{return JSON.parse(raw||"{}")}catch{throw new Error("INVALID_JSON")}
}
async function actor(req:Request){
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return null;
  const userClient=createClient(URL,ANON,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await userClient.auth.getUser();
  if(error||!data.user)return null;
  const assurance=await userClient.auth.mfa.getAuthenticatorAssuranceLevel();
  const mfaRequired=!assurance.error&&assurance.data?.nextLevel==="aal2"&&assurance.data?.currentLevel!=="aal2";
  return {user:data.user,auth,mfaRequired};
}
function admin(){return createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}})}
async function backgroundActor(req:Request,jobIdRaw:unknown){
  const auth=req.headers.get("authorization")||"";
  const jobId=clean(jobIdRaw,80);
  if(!auth.startsWith("Bearer ")||!jobId)return null;
  const userClient=createClient(URL,ANON,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await userClient.auth.getUser();
  if(userError||!userData?.user?.id)return null;
  const {data,error}=await userClient.from("document_processing_jobs").select("id,user_id").eq("id",jobId).eq("user_id",userData.user.id).maybeSingle();
  if(error||!data?.user_id||data.user_id!==userData.user.id)return null;
  return {user:userData.user,auth,mfaRequired:false};
}
type DeveloperContext={token:string,origin:string,userId:string};
async function validateDeveloperContext(req:Request,a:{user:any,auth:string}):Promise<DeveloperContext|null>{
  const token=clean(req.headers.get("x-boekuna-dev-session")||"",512);
  const origin=(req.headers.get("origin")||"").trim().replace(/\/$/,"");
  if(!token)return null;
  if(!origin||!ALLOWED.has(origin)||PRODUCTION_ORIGINS.has(origin))return null;
  const scoped=createClient(URL,ANON,{
    global:{headers:{Authorization:a.auth,"X-Boekuna-Dev-Session":token,Origin:origin}},
    auth:{persistSession:false,autoRefreshToken:false}
  });
  const {data,error}=await scoped.rpc("check_developer_document_quota");
  if(error)return null;
  const row=Array.isArray(data)?data[0]:data;
  if(!row?.allowed)return null;
  return {token,origin,userId:String(a.user.id||"")};
}
function confidence(raw:unknown){
  const n=Number(raw);
  if(!Number.isFinite(n))return null;
  return n<=1?n*100:n;
}
function reviewAssessment(data:any){
  const financial=new Set(["purchase_invoice","sales_invoice","sale_invoice","credit_invoice","receipt"]).has(String(data?.documentType||""));
  if(!financial)return {fields:["documentType"],message:"Controleer het documenttype. Dit document kan niet automatisch worden geboekt."};
  const fields:string[]=Array.isArray(data?.processing?.reviewRouting?.fields)?[...data.processing.reviewRouting.fields]:[];
  if(data?.processing?.anomalyCodes?.length)fields.push("document");
  if(data?.processing?.bookingAllowed===false)fields.push("documentType");
  if(data?.amounts?.accountingVatTreatment==="review_required")fields.push("vatTreatment");
  const c=data?.confidence||{},a=data?.amounts||{},inv=data?.invoice||{};
  const total=confidence(c.total),vat=confidence(c.vatTotal),date=confidence(c.invoiceDate),party=Math.max(confidence(c.supplierName)||0,confidence(c.customerName)||0);
  if(a.total==null||total==null||total<85)fields.push("gross");
  if(a.vatTotal==null||vat==null||vat<80)fields.push("vatAmount");
  if(!inv.invoiceDate||date==null||date<75)fields.push("issueDate");
  if(party<70)fields.push("party");
  const vatLines=Array.isArray(a.vatLines)?a.vatLines:[],rates=[...new Set(vatLines.map((x:any)=>Number(x?.rate)).filter(Number.isFinite))];
  const vatLineConfidence=confidence(c.vatLines);
  if(rates.length>1&&(vatLineConfidence==null||vatLineConfidence<85))fields.push("vatLines");
  if(rates.length===0)fields.push("vatRate");
  const warnings=Array.isArray(data?.warnings)?data.warnings:[];
  if(warnings.length&&!fields.length)fields.push("document");
  const unique=[...new Set(fields)];
  const label:Record<string,string>={gross:"totaal",vatAmount:"btw-bedrag",issueDate:"datum",party:"leverancier",vatLines:"btw-verdeling",vatRate:"btw-tarief",document:"documentgegevens"};
  return {fields:unique,message:unique.length?"Controleer "+unique.map(x=>label[x]||x).join(", ")+".":""};
}
async function markFailed(sb:any,jobId:string,code:string,status=500,reference=""){
  const retryable=RETRYABLE_CODES.has(code)||status===429||status>=500;
  await sb.from("document_processing_jobs").update({
    state:"failed",phase:"complete",error_code:clean(code,80)||"UNKNOWN",error_reference:clean(reference,80),
    error_retryable:retryable,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()
  }).eq("id",jobId);
}
async function processJob(jobId:string,authHeader:string,developer:DeveloperContext|null=null){
  const sb=admin();
  const now=new Date().toISOString();
  const {data:claimed,error:claimError}=await sb.from("document_processing_jobs")
    .update({state:"processing",phase:"read",started_at:now,updated_at:now})
    .eq("id",jobId).eq("execution_mode","legacy").eq("state","queued").lt("attempt",3).select("*").maybeSingle();
  if(claimError||!claimed)return;
  const jobDeveloper=developer?.userId===String(claimed.user_id)?developer:null;
  await sb.from("document_processing_jobs").update({attempt:Number(claimed.attempt||0)+1,updated_at:new Date().toISOString()}).eq("id",jobId);
  try{
    const {data:doc,error:docError}=await sb.from("documents").select("id,user_id,name,mime_type,storage_path").eq("id",claimed.document_id).eq("user_id",claimed.user_id).maybeSingle();
    if(docError||!doc)throw Object.assign(new Error("DOCUMENT_NOT_FOUND"),{code:"DOCUMENT_NOT_FOUND",status:404});
    const {data:blob,error:storageError}=await sb.storage.from("kwinest-documents").download(doc.storage_path);
    if(storageError||!blob)throw Object.assign(new Error("DOCUMENT_NOT_FOUND"),{code:"DOCUMENT_NOT_FOUND",status:404});
    const form=new FormData();
    form.append("file",blob,doc.name||"document");
    const company=claimed.company_context&&typeof claimed.company_context==="object"?claimed.company_context:{};
    form.append("company_json",JSON.stringify({
      name:clean(company.name,160),tradeName:clean(company.tradeName,160),kvk:clean(company.kvk,40),vat:clean(company.vat,40)
    }));
    form.append("existing_json","[]");
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),125000);
    let response:Response;
    try{
      const processorHeaders:Record<string,string>={Authorization:authHeader,Origin:jobDeveloper?.origin||APP_ORIGIN,"X-Boekuna-Processing-Job":jobId};
      if(jobDeveloper?.token)processorHeaders["X-Boekuna-Dev-Session"]=jobDeveloper.token;
      response=await fetch(PROCESSOR+"/analyze",{method:"POST",headers:processorHeaders,body:form,signal:controller.signal});
    }finally{clearTimeout(timer)}
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload?.ok){
      const pe=payload?.error&&typeof payload.error==="object"?payload.error:{};
      const code=clean(pe.code||((response.status===429)?"RATE_LIMITED":response.status===504?"PROCESSING_TIMEOUT":"PROCESSOR_UNAVAILABLE"),80);
      await markFailed(sb,jobId,code,response.status,clean(pe.reference_id||pe.referenceId||"",80));
      return;
    }
    await sb.from("document_processing_jobs").update({state:"validating",phase:"validate",updated_at:new Date().toISOString()}).eq("id",jobId);
    const data=payload.data&&typeof payload.data==="object"?payload.data:{};
    const assessment=reviewAssessment(data);
    const state=assessment.fields.length?"review_required":"ready";
    await sb.from("document_processing_jobs").update({
      state,phase:"complete",result:{analysis:data},review_fields:assessment.fields,review_message:assessment.message,
      error_code:null,error_reference:null,error_retryable:false,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()
    }).eq("id",jobId);
  }catch(err:any){
    const isAbort=err?.name==="AbortError";
    await markFailed(sb,jobId,isAbort?"PROCESSING_TIMEOUT":clean(err?.code||"PROCESSOR_UNAVAILABLE",80),Number(err?.status||503),"");
  }finally{
    EdgeRuntime.waitUntil(triggerNext(authHeader,jobId,jobDeveloper));
  }
}
function run(jobId:string,auth:string,developer:DeveloperContext|null=null){EdgeRuntime.waitUntil(processJob(jobId,auth,developer))}
async function kickUser(userId:string,authHeader:string,developer:DeveloperContext|null=null){
  const sb=admin();
  const scopedDeveloper=developer?.userId===String(userId)?developer:null;
  if(EXECUTION_MODE==="workflow"&&!scopedDeveloper){
    if(!WORKFLOW_SLUG||!WORKFLOW_API_KEY||!WORKFLOW_RECOVERY_ENABLED)throw new Error("WORKFLOW_NOT_CONFIGURED");
    const {data:jobs,error}=await sb.from("document_processing_jobs").select("batch_id")
      .eq("user_id",userId).eq("execution_mode","workflow").eq("state","queued").limit(50);
    if(error)throw new Error("JOB_DISPATCH_FAILED");
    const batches=[...new Set((jobs||[]).map((j:any)=>String(j.batch_id)))];
    for(const batch of batches)EdgeRuntime.waitUntil(dispatchWorkflowBatch(sb,userId,batch));
    return jobs?.length||0;
  }
  const {count}=await sb.from("document_processing_jobs").select("id",{count:"exact",head:true}).eq("user_id",userId).in("state",["processing","validating"]);
  const slots=Math.max(0,PROCESSING_CONCURRENCY-Number(count||0));
  if(!slots)return 0;
  const {data:queued}=await sb.from("document_processing_jobs").select("id").eq("user_id",userId).eq("execution_mode","legacy").eq("state","queued").lt("attempt",3).order("created_at",{ascending:true}).limit(slots);
  for(const job of queued||[])run(job.id,authHeader,scopedDeveloper);
  return queued?.length||0;
}
async function dispatchWorkflowBatch(sb:any,userId:string,batchId:string){
  try{
    const response=await fetch("https://api.render.com/v1/task-runs",{
      method:"POST",headers:{Authorization:"Bearer "+WORKFLOW_API_KEY,"content-type":"application/json"},
      body:JSON.stringify({task:WORKFLOW_SLUG+"/process_batch",input:[batchId]}),signal:AbortSignal.timeout(10000)
    });
    if(!response.ok)return; // Durable recovery owns retries; never retry OCR here.
    const task=await response.json();
    if(task?.id)await sb.from("document_processing_jobs").update({workflow_run_id:clean(task.id,120)})
      .eq("user_id",userId).eq("batch_id",batchId).eq("execution_mode","workflow").eq("state","queued");
  }catch(_){} // No secrets, file contents or provider error bodies in logs.
}
async function triggerNext(authHeader:string,jobId:string,developer:DeveloperContext|null=null){
  try{
    const headers:Record<string,string>={Authorization:authHeader,apikey:ANON,"content-type":"application/json"};
    if(developer?.token){
      headers["X-Boekuna-Dev-Session"]=developer.token;
      headers.Origin=developer.origin
    }
    await fetch(URL+"/functions/v1/document-processing",{
      method:"POST",
      headers,
      body:JSON.stringify({action:"run_next",job_id:jobId})
    });
  }catch(_){}
}
async function enqueue(req:Request,a:{user:any,auth:string},body:any,developer:DeveloperContext|null=null){
  const sb=admin(),clientRef=clean(body.client_ref,120),batchId=clean(body.batch_id,120),kind=clean(body.kind||"auto",32);
  if(!clientRef||!batchId)return out(req,{ok:false,error:{code:"INVALID_REQUEST"}},400);
  const executionMode=developer?"legacy":EXECUTION_MODE;
  if(!["legacy","workflow"].includes(executionMode))return out(req,{ok:false,error:{code:"WORKFLOW_NOT_CONFIGURED"}},503);
  if(executionMode==="workflow"&&(!WORKFLOW_SLUG||!WORKFLOW_API_KEY||!WORKFLOW_RECOVERY_ENABLED))return out(req,{ok:false,error:{code:"WORKFLOW_NOT_CONFIGURED"}},503);
  const {data:doc,error}=await sb.from("documents").select("id,user_id,client_ref,name,mime_type,metadata").eq("user_id",a.user.id).eq("client_ref",clientRef).maybeSingle();
  if(error||!doc)return out(req,{ok:false,error:{code:"DOCUMENT_NOT_FOUND"}},404);
  const company=body.company&&typeof body.company==="object"?body.company:{};
  const {data:existing}=await sb.from("document_processing_jobs").select("*").eq("user_id",a.user.id).eq("document_id",doc.id).maybeSingle();
  if(existing){
    if(existing.state==="queued")await kickUser(a.user.id,a.auth,developer);
    return out(req,{ok:true,job:existing,idempotent:true});
  }
  const {data:job,error:insertError}=await sb.from("document_processing_jobs").insert({
    user_id:a.user.id,document_id:doc.id,client_ref:clientRef,batch_id:batchId,file_name:clean(doc.name,260)||"document",mime_type:clean(doc.mime_type,160)||"application/octet-stream",size_bytes:Math.max(0,Number(doc.metadata?.size||0)),requested_kind:kind,state:"queued",phase:"queued",execution_mode:executionMode,
    company_context:{name:clean(company.name,160),tradeName:clean(company.tradeName,160),kvk:clean(company.kvk,40),vat:clean(company.vat,40)}
  }).select("*").single();
  if(insertError||!job){
    // Concurrent deliveries can lose the unique insert race. Return the winner.
    const {data:winner}=await sb.from("document_processing_jobs").select("*").eq("user_id",a.user.id).eq("document_id",doc.id).maybeSingle();
    if(winner)return out(req,{ok:true,job:winner,idempotent:true});
    return out(req,{ok:false,error:{code:"JOB_CREATE_FAILED"}},500);
  }
  await kickUser(a.user.id,a.auth,developer);
  return out(req,{ok:true,job},202);
}
async function retry(req:Request,a:{user:any,auth:string},body:any,developer:DeveloperContext|null=null){
  const sb=admin(),jobId=clean(body.job_id,80);
  const {data:job}=await sb.from("document_processing_jobs").select("*").eq("id",jobId).eq("user_id",a.user.id).maybeSingle();
  if(!job)return out(req,{ok:false,error:{code:"JOB_NOT_FOUND"}},404);
  if(!["failed","review_required"].includes(job.state))return out(req,{ok:false,error:{code:"JOB_NOT_RETRYABLE",state:job.state}},409);
  if(Number(job.attempt||0)>=Number(job.max_attempts||3))return out(req,{ok:false,error:{code:"RETRY_LIMIT_REACHED"}},409);
  const {data:reset,error}=await sb.from("document_processing_jobs").update({
    state:"queued",phase:"queued",result:null,review_fields:[],review_message:null,error_code:null,error_reference:null,error_retryable:false,
    started_at:null,completed_at:null,lease_token:null,lease_expires_at:null,next_attempt_at:new Date().toISOString(),updated_at:new Date().toISOString()
  }).eq("id",job.id).eq("user_id",a.user.id).eq("state",job.state).eq("attempt",job.attempt).select("*").single();
  if(error||!reset)return out(req,{ok:false,error:{code:"JOB_RETRY_FAILED"}},500);
  await kickUser(a.user.id,a.auth,developer);
  return out(req,{ok:true,job:reset},202);
}
async function resolveReview(req:Request,a:{user:any,auth:string},body:any){
  const sb=admin(),jobId=clean(body.job_id,80);
  const {data:job}=await sb.from("document_processing_jobs").select("id,state").eq("id",jobId).eq("user_id",a.user.id).maybeSingle();
  if(!job)return out(req,{ok:false,error:{code:"JOB_NOT_FOUND"}},404);
  if(job.state!=="review_required")return out(req,{ok:false,error:{code:"JOB_NOT_REVIEWABLE",state:job.state}},409);
  const at=new Date().toISOString();
  const {data:resolved,error}=await sb.from("document_processing_jobs").update({
    state:"ready",phase:"complete",review_fields:[],review_message:null,resolved_at:at,updated_at:at
  }).eq("id",jobId).eq("user_id",a.user.id).eq("state","review_required").select("*").maybeSingle();
  if(error||!resolved)return out(req,{ok:false,error:{code:"JOB_RESOLVE_FAILED"}},409);
  return out(req,{ok:true,job:resolved});
}
async function repairMissingJobs(userId:string,executionMode=EXECUTION_MODE){
  const sb=admin();
  const {data:docs,error}=await sb.from("documents")
    .select("id,user_id,client_ref,name,mime_type,metadata,document_processing_jobs(id)")
    .eq("user_id",userId)
    .contains("metadata",{processing:true})
    .is("document_processing_jobs",null)
    .order("created_at",{ascending:true})
    .limit(20);
  if(error||!docs?.length)return 0;
  const ids=docs.map((d:any)=>d.id);
  const {data:existing}=await sb.from("document_processing_jobs").select("document_id").eq("user_id",userId).in("document_id",ids);
  const known=new Set((existing||[]).map((x:any)=>String(x.document_id)));
  const missing=docs.filter((d:any)=>!known.has(String(d.id))).map((doc:any)=>{
    const meta=doc.metadata&&typeof doc.metadata==="object"?doc.metadata:{};
    const company=meta.company_context&&typeof meta.company_context==="object"?meta.company_context:{};
    return {
      user_id:userId,document_id:doc.id,client_ref:clean(doc.client_ref,120),
      batch_id:clean(meta.batch_id||("recovered-"+doc.id),120),
      file_name:clean(doc.name,260)||"document",
      mime_type:clean(doc.mime_type,160)||"application/octet-stream",
      size_bytes:Math.max(0,Number(meta.size||0)),
      requested_kind:clean(meta.requested_kind||"auto",32),
      state:"queued",phase:"queued",execution_mode:executionMode,
      company_context:{name:clean(company.name,160),tradeName:clean(company.tradeName,160),kvk:clean(company.kvk,40),vat:clean(company.vat,40)}
    };
  });
  if(!missing.length)return 0;
  const {error:insertError}=await sb.from("document_processing_jobs").upsert(missing,{onConflict:"user_id,document_id",ignoreDuplicates:true});
  if(insertError)return 0;
  return missing.length;
}
async function resume(req:Request,a:{user:any,auth:string},developer:DeveloperContext|null=null){
  const sb=admin(),threshold=new Date(Date.now()-STALE_MS).toISOString();
  await repairMissingJobs(a.user.id,developer?"legacy":EXECUTION_MODE);
  const {data:queued}=await sb.from("document_processing_jobs").select("*").eq("user_id",a.user.id).eq("state","queued").lt("attempt",3).limit(3);
  const {data:stale}=await sb.from("document_processing_jobs").select("*").eq("user_id",a.user.id).eq("execution_mode","legacy").in("state",["processing","validating"]).lt("updated_at",threshold).lt("attempt",3).limit(3);
  for(const job of stale||[]){
    await sb.from("document_processing_jobs").update({state:"queued",phase:"queued",updated_at:new Date().toISOString()}).eq("id",job.id).in("state",["processing","validating"]);
  }
  const started=await kickUser(a.user.id,a.auth,developer);
  return out(req,{ok:true,resumed:(queued?.length||0)+(stale?.length||0),started});
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST")return out(req,{ok:false,error:{code:"METHOD_NOT_ALLOWED"}},405);
  if(!URL||!ANON||!SERVICE)return out(req,{ok:false,error:{code:"SERVER_NOT_CONFIGURED"}},503);
  try{
    const body=await jsonBody(req),action=clean(body.action||"enqueue",40);
    if(action==="run_next"){
      const a=await backgroundActor(req,body.job_id);
      if(!a)return out(req,{ok:false,error:{code:"AUTH_SESSION_EXPIRED"}},401);
      const developer=await validateDeveloperContext(req,a);
      const started=await kickUser(a.user.id,a.auth,developer);return out(req,{ok:true,started});
    }
    const a=await actor(req);
    if(!a)return out(req,{ok:false,error:{code:"AUTH_SESSION_EXPIRED"}},401);
    if(a.mfaRequired)return out(req,{ok:false,error:{code:"MFA_REQUIRED"}},403);
    const developer=await validateDeveloperContext(req,a);
    if(action==="enqueue")return await enqueue(req,a,body,developer);
    if(action==="retry")return await retry(req,a,body,developer);
    if(action==="resolve"||action==="resolve_review")return await resolveReview(req,a,body);
    if(action==="resume")return await resume(req,a,developer);
    return out(req,{ok:false,error:{code:"INVALID_ACTION"}},400);
  }catch(err:any){
    const code=clean(err?.message||"INVALID_REQUEST",80);
    return out(req,{ok:false,error:{code}},code==="REQUEST_TOO_LARGE"?413:400);
  }
});
