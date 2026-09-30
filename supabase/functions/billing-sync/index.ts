import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_URL=(Deno.env.get("APP_URL")||"https://app.boekuna.nl").replace(/\/$/,"");
const ALLOWED_ORIGINS=new Set([
  APP_URL,
  "https://boekuna-boekhouding.onrender.com",
  "https://boekuna.nl",
  "https://www.boekuna.nl",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);
function corsHeaders(req:Request){
  const origin=req.headers.get("origin")||"";
  return {
    "Access-Control-Allow-Origin":ALLOWED_ORIGINS.has(origin)?origin:APP_URL,
    "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods":"POST,OPTIONS",
    "Content-Type":"application/json",
    "Vary":"Origin"
  };
}
function json(req:Request,data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:corsHeaders(req)})}
async function userAndAdmin(req:Request){
  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer "))throw new Error("UNAUTHORIZED");
  const url=Deno.env.get("SUPABASE_URL")!;
  const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await userClient.auth.getUser();
  if(error||!data.user)throw new Error("UNAUTHORIZED");
  return {user:data.user,admin:createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}})};
}
async function stripeGet(path:string){
  const key=Deno.env.get("STRIPE_SECRET_KEY")||"";
  if(!key)throw new Error("STRIPE_NOT_CONFIGURED");
  const r=await fetch("https://api.stripe.com/v1"+path,{headers:{Authorization:"Bearer "+key}});
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error("STRIPE:"+String(body?.error?.message||"Stripe request failed"));
  return body;
}
function ts(v:any){return v?new Date(Number(v)*1000).toISOString():null}
function periodEnd(sub:any){return ts(sub?.items?.data?.[0]?.current_period_end||sub?.current_period_end)}
function normalizedStatus(v:any){
  const s=String(v||"");
  return ["trialing","active","past_due","canceled","incomplete","incomplete_expired","unpaid","paused"].includes(s)?s:"incomplete";
}

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin")||"";
 if(origin&&!ALLOWED_ORIGINS.has(origin))return json(req,{ok:false,error:"ORIGIN_NOT_ALLOWED"},403);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders(req)});
 if(req.method!=="POST")return json(req,{ok:false,error:"Method not allowed"},405);
 try{
  const {user,admin}=await userAndAdmin(req);
  const input=await req.json().catch(()=>({}));
  const sessionId=String(input?.session_id||"").trim();
  let session:any=null,sub:any=null;

  if(sessionId){
    if(!sessionId.startsWith("cs_"))return json(req,{ok:false,error:"Ongeldige checkoutreferentie."},400);
    session=await stripeGet("/checkout/sessions/"+encodeURIComponent(sessionId)+"?expand%5B%5D=subscription");
    const owner=String(session?.client_reference_id||session?.metadata?.user_id||"");
    if(owner!==user.id)return json(req,{ok:false,error:"Deze checkout hoort niet bij dit account."},403);
    sub=session?.subscription;
    if(typeof sub==="string")sub=await stripeGet("/subscriptions/"+encodeURIComponent(sub));
  }else{
    const {data:account,error}=await admin.from("billing_accounts")
      .select("stripe_subscription_id").eq("user_id",user.id).maybeSingle();
    if(error)throw error;
    if(!account?.stripe_subscription_id)return json(req,{ok:true,synced:false,reason:"free"});
    sub=await stripeGet("/subscriptions/"+encodeURIComponent(String(account.stripe_subscription_id)));
  }

  if(!sub?.id)return json(req,{ok:false,error:"Stripe-abonnement kon niet worden gevonden."},409);
  const owner=String(sub?.metadata?.user_id||session?.client_reference_id||"");
  if(owner&&owner!==user.id)return json(req,{ok:false,error:"Dit abonnement hoort niet bij dit account."},403);

  const {data:existing,error:existingError}=await admin.from("billing_accounts")
    .select("plan").eq("user_id",user.id).maybeSingle();
  if(existingError)throw existingError;
  const planRaw=String(sub?.metadata?.plan||session?.metadata?.plan||existing?.plan||"boekuna");
  const plan=planRaw==="pro"?"pro":"boekuna";
  const status=normalizedStatus(sub.status);
  const watermark=Math.floor(Date.now()/1000);
  const syncId="sync:"+String(session?.id||sub.id)+":"+String(watermark);
  const {data:applied,error:applyError}=await admin.rpc("apply_stripe_subscription_state",{
    p_user_id:user.id,
    p_stripe_customer_id:String(session?.customer||sub?.customer||""),
    p_stripe_subscription_id:String(sub.id),
    p_plan:plan,
    p_status:status,
    p_current_period_end:periodEnd(sub),
    p_cancel_at_period_end:!!sub.cancel_at_period_end,
    p_event_created:watermark,
    p_event_id:syncId
  });
  if(applyError)throw applyError;

  return json(req,{ok:true,synced:true,applied:applied===true,plan,status,currentPeriodEnd:periodEnd(sub),cancelAtPeriodEnd:!!sub.cancel_at_period_end});
 }catch(e){
  const m=String(e?.message||e);
  if(m==="UNAUTHORIZED")return json(req,{ok:false,error:"Je sessie is verlopen. Log opnieuw in."},401);
  if(m==="STRIPE_NOT_CONFIGURED")return json(req,{ok:false,error:"Stripe is nog niet volledig geconfigureerd.",code:"STRIPE_NOT_CONFIGURED"},503);
  return json(req,{ok:false,error:m.replace(/^STRIPE:/,"")||"Abonnementsstatus kon niet worden gesynchroniseerd."},500);
 }
});