import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL=Deno.env.get("SUPABASE_URL")||"";
const ANON=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const PROCESSOR=(Deno.env.get("DOCUMENT_PROCESSOR_URL")||"https://kwinest-docprocessor.onrender.com").replace(/\/$/,"");
const APP_ORIGIN=(Deno.env.get("APP_URL")||"https://boekuna-boekhouding.onrender.com").replace(/\/$/,"");
const ALLOWED=new Set([
  "https://boekuna.nl",
  "https://www.boekuna.nl",
  "https://boekuna-boekhouding.onrender.com",
  "https://boekuna-qa-staging.onrender.com",
  "https://boekuna-document-background-preview.onrender.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);
const MAX_BODY=64*1024;
const STALE_MS=10*60*1000;
const ACTIVE=new Set(["received","queued","processing","validating"]);
const RETRYABLE_CODES=new Set(["PROCESSOR_UNAVAILABLE","PROCESSING_TIMEOUT","RATE_LIMITED","NETWORK_ERROR","UNKNOWN"]);

function cors(req:Request){
  const origin=req.headers.get("origin")||"";
  return {
    "access-control-allow-origin":ALLOWED.has(origin)?origin:APP_ORIGIN,
    "access-control-allow-methods":"POST,OPTIONS",
    "access-control-allow-headers":"authorization,apikey,content-type",
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
  return {user:data.user,auth};
}
function admin(){return createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}})}
function confidence(raw:unknown){
  const n=Number(raw);
  if(!Number.isFinite(n))return null;
  return n<=1?n*100:n;
}
function reviewAssessment(data:any){
  const financial=new Set(["purchase_invoice","sales_invoice","sale_invoice","credit_invoice","receipt"]).has(String(data?.documentType||""));
  if(!financial)return {fields:[],message:""};
  const fields:string[]=[];
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
async function processJob(jobId:string,authHeader:string){
  const sb=admin();
  const now=new Date().toISOString();
  const {data:claimed,error:claimError}=await sb.from("document_processing_jobs")
    .update({state:"processing",phase:"read",started_at:now,updated_at:now})
    .eq("id",jobId).eq("state","queued").lt("attempt",3).select("*").maybeSingle();
  if(claimError||!claimed)return;
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
      response=await fetch(PROCESSOR+"/analyze",{method:"POST",headers:{Authorization:authHeader,Origin:APP_ORIGIN},body:form,signal:controller.signal});
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
  }
}
function run(jobId:string,auth:string){EdgeRuntime.waitUntil(processJob(jobId,auth))}
async function enqueue(req:Request,a:{user:any,auth:string},body:any){
  const sb=admin(),clientRef=clean(body.client_ref,120),batchId=clean(body.batch_id,120),kind=clean(body.kind||"auto",32);
  if(!clientRef||!batchId)return out(req,{ok:false,error:{code:"INVALID_REQUEST"}},400);
  const {data:doc,error}=await sb.from("documents").select("id,user_id,client_ref").eq("user_id",a.user.id).eq("client_ref",clientRef).maybeSingle();
  if(error||!doc)return out(req,{ok:false,error:{code:"DOCUMENT_NOT_FOUND"}},404);
  const company=body.company&&typeof body.company==="object"?body.company:{};
  const {data:existing}=await sb.from("document_processing_jobs").select("*").eq("user_id",a.user.id).eq("document_id",doc.id).maybeSingle();
  if(existing){
    if(existing.state==="queued")run(existing.id,a.auth);
    return out(req,{ok:true,job:existing,idempotent:true});
  }
  const {data:job,error:insertError}=await sb.from("document_processing_jobs").insert({
    user_id:a.user.id,document_id:doc.id,client_ref:clientRef,batch_id:batchId,requested_kind:kind,state:"queued",phase:"queued",
    company_context:{name:clean(company.name,160),tradeName:clean(company.tradeName,160),kvk:clean(company.kvk,40),vat:clean(company.vat,40)}
  }).select("*").single();
  if(insertError||!job)return out(req,{ok:false,error:{code:"JOB_CREATE_FAILED"}},500);
  run(job.id,a.auth);
  return out(req,{ok:true,job},202);
}
async function retry(req:Request,a:{user:any,auth:string},body:any){
  const sb=admin(),jobId=clean(body.job_id,80);
  const {data:job}=await sb.from("document_processing_jobs").select("*").eq("id",jobId).eq("user_id",a.user.id).maybeSingle();
  if(!job)return out(req,{ok:false,error:{code:"JOB_NOT_FOUND"}},404);
  if(!["failed","review_required"].includes(job.state))return out(req,{ok:false,error:{code:"JOB_NOT_RETRYABLE",state:job.state}},409);
  if(Number(job.attempt||0)>=Number(job.max_attempts||3))return out(req,{ok:false,error:{code:"RETRY_LIMIT_REACHED"}},409);
  const {data:reset,error}=await sb.from("document_processing_jobs").update({
    state:"queued",phase:"queued",result:null,review_fields:[],review_message:null,error_code:null,error_reference:null,error_retryable:false,
    started_at:null,completed_at:null,updated_at:new Date().toISOString()
  }).eq("id",job.id).eq("user_id",a.user.id).select("*").single();
  if(error||!reset)return out(req,{ok:false,error:{code:"JOB_RETRY_FAILED"}},500);
  run(job.id,a.auth);
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
async function resume(req:Request,a:{user:any,auth:string}){
  const sb=admin(),threshold=new Date(Date.now()-STALE_MS).toISOString();
  const {data:queued}=await sb.from("document_processing_jobs").select("*").eq("user_id",a.user.id).eq("state","queued").lt("attempt",3).limit(3);
  const {data:stale}=await sb.from("document_processing_jobs").select("*").eq("user_id",a.user.id).in("state",["processing","validating"]).lt("updated_at",threshold).lt("attempt",3).limit(3);
  for(const job of stale||[]){
    const {data:reset}=await sb.from("document_processing_jobs").update({state:"queued",phase:"queued",updated_at:new Date().toISOString()}).eq("id",job.id).in("state",["processing","validating"]).select("id").maybeSingle();
    if(reset)run(job.id,a.auth);
  }
  for(const job of queued||[])run(job.id,a.auth);
  return out(req,{ok:true,resumed:(queued?.length||0)+(stale?.length||0)});
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST")return out(req,{ok:false,error:{code:"METHOD_NOT_ALLOWED"}},405);
  if(!URL||!ANON||!SERVICE)return out(req,{ok:false,error:{code:"SERVER_NOT_CONFIGURED"}},503);
  const a=await actor(req);
  if(!a)return out(req,{ok:false,error:{code:"AUTH_SESSION_EXPIRED"}},401);
  try{
    const body=await jsonBody(req),action=clean(body.action||"enqueue",40);
    if(action==="enqueue")return await enqueue(req,a,body);
    if(action==="retry")return await retry(req,a,body);
    if(action==="resolve")return await resolveReview(req,a,body);
    if(action==="resume")return await resume(req,a);
    return out(req,{ok:false,error:{code:"INVALID_ACTION"}},400);
  }catch(err:any){
    const code=clean(err?.message||"INVALID_REQUEST",80);
    return out(req,{ok:false,error:{code}},code==="REQUEST_TOO_LARGE"?413:400);
  }
});
