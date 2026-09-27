import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_URL=(Deno.env.get("APP_URL")||"https://boekuna-boekhouding.onrender.com").replace(/\/$/,"");
const corsHeaders={
  "Access-Control-Allow-Origin":APP_URL,
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
  "Content-Type":"application/json"
};
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:corsHeaders})}
async function userAndAdmin(req:Request){
  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer "))throw new Error("UNAUTHORIZED");
  const url=Deno.env.get("SUPABASE_URL")!;
  const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await userClient.auth.getUser();
  if(error||!data.user)throw new Error("UNAUTHORIZED");
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  return {user:data.user,admin};
}
async function stripePost(path:string,params:URLSearchParams){
  const key=Deno.env.get("STRIPE_SECRET_KEY")||"";
  if(!key)throw new Error("STRIPE_NOT_CONFIGURED");
  const r=await fetch("https://api.stripe.com/v1"+path,{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/x-www-form-urlencoded"},body:params});
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error("STRIPE:"+String(body?.error?.message||"Stripe request failed"));
  return body;
}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders});
 if(req.method!=="POST")return json({ok:false,error:"Method not allowed"},405);
 try{
  const {user,admin}=await userAndAdmin(req);
  const {data:account,error}=await admin.from("billing_accounts").select("stripe_customer_id").eq("user_id",user.id).maybeSingle();
  if(error)throw error;
  if(!account?.stripe_customer_id)return json({ok:false,error:"Er is nog geen Stripe-klant aan dit account gekoppeld."},409);
  const p=new URLSearchParams();
  p.set("customer",String(account.stripe_customer_id));
  p.set("return_url",APP_URL+"/?login=1&billing=portal-return");
  const session=await stripePost("/billing_portal/sessions",p);
  return json({ok:true,url:session.url});
 }catch(e){
  const m=String(e?.message||e);
  if(m==="UNAUTHORIZED")return json({ok:false,error:"Je sessie is verlopen. Log opnieuw in."},401);
  if(m==="STRIPE_NOT_CONFIGURED")return json({ok:false,error:"Stripe is nog niet volledig geconfigureerd.",code:"STRIPE_NOT_CONFIGURED"},503);
  return json({ok:false,error:m.replace(/^STRIPE:/,"")||"Abonnementbeheer kon niet worden geopend."},500);
 }
});