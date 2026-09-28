import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ERROR_META:any={
  AUTH_SESSION_EXPIRED:{category:"auth",retryable:false},
  ACCOUNT_READ_ONLY:{category:"entitlement",retryable:false},
  RATE_LIMITED:{category:"temporary",retryable:true},
  PROCESSOR_UNAVAILABLE:{category:"temporary",retryable:true},
  INVALID_REQUEST:{category:"request",retryable:false},
  UNKNOWN:{category:"temporary",retryable:true},
};
const newReferenceId=()=>{
  const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",bytes=crypto.getRandomValues(new Uint8Array(6));
  return "BK-"+Array.from(bytes,b=>alphabet[b%alphabet.length]).join("");
};
const sanitize=(value:any,n=400)=>String(value??"")
  .replace(/Bearer\s+[A-Za-z0-9._~+\-/=]+/gi,"Bearer [REDACTED]")
  .replace(/\b(?:sk(?:[-_](?:live|test|proj))?|sb_secret|sb_publishable)[-_][A-Za-z0-9_-]+\b/gi,"[REDACTED_KEY]")
  .slice(0,n);
const fail=(code:string,status:number,internal:any={})=>{
  const spec=ERROR_META[code]||ERROR_META.UNKNOWN,reference_id=newReferenceId();
  console.error(JSON.stringify({
    event:"quota_error",reference_id,timestamp:new Date().toISOString(),route:"consume-quota",
    internal_code:internal.internal_code||code,http_status:status,retryable:spec.retryable,
    provider_status:internal.provider_status??null,provider_code:sanitize(internal.provider_code,120)||null,
    internal_error:sanitize(internal.internal_error)||null,user_ref:internal.user_ref||null,
  }));
  return new Response(JSON.stringify({ok:false,error:{code,category:spec.category,retryable:spec.retryable,reference_id,context:internal.context||{},state:"no_changes"}}),{
    status,headers:{"content-type":"application/json","cache-control":"no-store"}
  });
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return fail("INVALID_REQUEST",405,{internal_code:"METHOD_NOT_ALLOWED"});
  const authHeader=req.headers.get("Authorization")||"";
  if(!authHeader.startsWith("Bearer ")) return fail("AUTH_SESSION_EXPIRED",401,{internal_code:"AUTH_HEADER_MISSING"});

  const url=Deno.env.get("SUPABASE_URL")!;
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient=createClient(url,anonKey,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await userClient.auth.getUser();
  if(userError||!userData.user) return fail("AUTH_SESSION_EXPIRED",401,{internal_code:"AUTH_SESSION_INVALID",internal_error:userError?.message});
  const userRef=userData.user.id;

  const {data:canOperate,error:entitlementError}=await userClient.rpc("can_operate_bookkeeping");
  if(entitlementError) return fail("PROCESSOR_UNAVAILABLE",503,{internal_code:"ENTITLEMENT_CHECK_FAILED",internal_error:entitlementError.message,user_ref:userRef});
  if(canOperate!==true) return fail("ACCOUNT_READ_ONLY",403,{internal_code:"ENTITLEMENT_READ_ONLY",user_ref:userRef});

  const body=await req.json().catch(()=>null);
  const feature=String(body?.feature||"");
  const limit=feature==="invoice_ai"?40:feature==="invoice_email"?120:0;
  if(!limit) return fail("INVALID_REQUEST",400,{internal_code:"UNKNOWN_QUOTA_FEATURE",user_ref:userRef});

  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const windowStart=new Date();
  windowStart.setUTCMinutes(0,0,0);
  const windowIso=windowStart.toISOString();

  const {data:existing,error:readError}=await admin.from("api_usage")
    .select("request_count")
    .eq("user_id",userRef)
    .eq("feature",feature)
    .eq("window_start",windowIso)
    .maybeSingle();
  if(readError) return fail("PROCESSOR_UNAVAILABLE",503,{internal_code:"QUOTA_READ_FAILED",internal_error:readError.message,user_ref:userRef});

  const next=Number(existing?.request_count||0)+1;
  const {error:writeError}=await admin.from("api_usage").upsert({
    user_id:userRef,feature,window_start:windowIso,request_count:next
  },{onConflict:"user_id,feature,window_start"});
  if(writeError) return fail("PROCESSOR_UNAVAILABLE",503,{internal_code:"QUOTA_WRITE_FAILED",internal_error:writeError.message,user_ref:userRef});

  await admin.from("api_usage").delete().eq("user_id",userRef).lt("window_start",new Date(Date.now()-48*3600*1000).toISOString());

  if(next>limit) return fail("RATE_LIMITED",429,{internal_code:"HOURLY_RATE_LIMIT",user_ref:userRef,context:{retry_after_seconds:3600}});
  return new Response(JSON.stringify({ok:true,allowed:true,remaining:Math.max(0,limit-next)}),{
    status:200,headers:{"content-type":"application/json","cache-control":"no-store"}
  });
});
