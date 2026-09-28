import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok:false, error:"Method not allowed" }), { status:405, headers:{ "content-type":"application/json" } });
  }
  const authHeader=req.headers.get("Authorization")||"";
  if(!authHeader.startsWith("Bearer ")){
    return new Response(JSON.stringify({ ok:false, error:"Unauthorized" }), { status:401, headers:{ "content-type":"application/json" } });
  }

  const url=Deno.env.get("SUPABASE_URL")!;
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient=createClient(url,anonKey,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await userClient.auth.getUser();
  if(userError||!userData.user){
    return new Response(JSON.stringify({ ok:false, error:"Unauthorized" }), { status:401, headers:{ "content-type":"application/json" } });
  }

  const {data:canOperate,error:entitlementError}=await userClient.rpc("can_operate_bookkeeping");
  if(entitlementError){
    return new Response(JSON.stringify({ ok:false, error:"ENTITLEMENT_CHECK_FAILED" }), { status:503, headers:{ "content-type":"application/json" } });
  }
  if(canOperate!==true){
    return new Response(JSON.stringify({ ok:false, allowed:false, error:"ACCOUNT_READ_ONLY" }), { status:402, headers:{ "content-type":"application/json" } });
  }

  const body=await req.json().catch(()=>({}));
  const feature=String(body.feature||"");
  const limit=feature==="invoice_ai"?40:feature==="invoice_email"?120:0;
  if(!limit){
    return new Response(JSON.stringify({ ok:false, allowed:false }), { status:400, headers:{ "content-type":"application/json" } });
  }

  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const windowStart=new Date();
  windowStart.setUTCMinutes(0,0,0);
  const windowIso=windowStart.toISOString();

  const {data:existing,error:readError}=await admin.from("api_usage")
    .select("request_count")
    .eq("user_id",userData.user.id)
    .eq("feature",feature)
    .eq("window_start",windowIso)
    .maybeSingle();
  if(readError){
    return new Response(JSON.stringify({ ok:false, error:readError.message }), { status:500, headers:{ "content-type":"application/json" } });
  }

  const next=Number(existing?.request_count||0)+1;
  const {error:writeError}=await admin.from("api_usage").upsert({
    user_id:userData.user.id,
    feature,
    window_start:windowIso,
    request_count:next
  },{onConflict:"user_id,feature,window_start"});
  if(writeError){
    return new Response(JSON.stringify({ ok:false, error:writeError.message }), { status:500, headers:{ "content-type":"application/json" } });
  }

  await admin.from("api_usage").delete().eq("user_id",userData.user.id).lt("window_start",new Date(Date.now()-48*3600*1000).toISOString());

  return new Response(JSON.stringify({ ok:true, allowed:next<=limit, remaining:Math.max(0,limit-next) }), {
    status:200, headers:{ "content-type":"application/json" }
  });
});