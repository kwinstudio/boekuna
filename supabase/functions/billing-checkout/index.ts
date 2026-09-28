import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_URL=(Deno.env.get("APP_URL")||"https://boekuna-boekhouding.onrender.com").replace(/\/$/,"");
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
    "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
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
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  return {user:data.user,admin};
}
async function stripePost(path:string,params:URLSearchParams,idempotencyKey?:string){
  const key=Deno.env.get("STRIPE_SECRET_KEY")||"";
  if(!key)throw new Error("STRIPE_NOT_CONFIGURED");
  const headers:Record<string,string>={Authorization:"Bearer "+key,"Content-Type":"application/x-www-form-urlencoded"};
  if(idempotencyKey)headers["Idempotency-Key"]=idempotencyKey;
  const r=await fetch("https://api.stripe.com/v1"+path,{method:"POST",headers,body:params});
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error("STRIPE:"+String(body?.error?.message||"Stripe request failed"));
  return body;
}

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin")||"";
 if(origin&&!ALLOWED_ORIGINS.has(origin))return json(req,{ok:false,error:"ORIGIN_NOT_ALLOWED"},403);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders(req)});
 if(req.method!=="POST")return json(req,{ok:false,error:"Method not allowed"},405);
 try{
  const {user,admin}=await userAndAdmin(req);
  const input=await req.json().catch(()=>({}));
  const plan=String(input.plan||"");
  const config={
    boekuna:{name:"Boekuna",amount:995,limit:100},
    pro:{name:"Boekuna Unlimited",amount:1995,limit:null}
  } as const;
  if(!(plan in config))return json(req,{ok:false,error:"Kies Boekuna of Unlimited."},400);

  const {data:account}=await admin.from("billing_accounts")
    .select("stripe_customer_id,stripe_subscription_id,status,plan")
    .eq("user_id",user.id).maybeSingle();
  if(account?.stripe_subscription_id&&["trialing","active","past_due","unpaid","paused","incomplete"].includes(String(account.status||""))){
    return json(req,{ok:false,error:"Er bestaat al een Stripe-abonnement voor dit account. Beheer of herstel dit via Abonnement in Boekuna.",code:"EXISTING_SUBSCRIPTION"},409);
  }

  const chosen=config[plan as keyof typeof config];

  const p=new URLSearchParams();
  p.set("mode","subscription");
  p.set("success_url",APP_URL+"/?login=1&billing=success&session_id={CHECKOUT_SESSION_ID}");
  p.set("cancel_url",APP_URL+"/?login=1&billing=cancelled");
  p.set("client_reference_id",user.id);
  p.set("locale","nl");
  p.set("expires_at",String(Math.floor(Date.now()/1000)+3600));
  p.set("payment_method_collection","always");
  p.set("billing_address_collection","required");
  p.set("tax_id_collection[enabled]","true");
  p.set("automatic_tax[enabled]","true");
  p.set("line_items[0][price_data][currency]","eur");
  p.set("line_items[0][price_data][unit_amount]",String(chosen.amount));
  p.set("line_items[0][price_data][tax_behavior]","exclusive");
  p.set("line_items[0][price_data][recurring][interval]","month");
  p.set("line_items[0][price_data][product_data][name]",chosen.name);
  p.set("line_items[0][price_data][product_data][description]",chosen.limit===null?"Onbeperkte slimme documentverwerkingen per maand":chosen.limit+" slimme documentverwerkingen per maand");
  p.set("line_items[0][price_data][product_data][tax_code]","txcd_10103001");
  p.set("line_items[0][quantity]","1");
  p.set("metadata[user_id]",user.id);
  p.set("metadata[plan]",plan);
  p.set("subscription_data[metadata][user_id]",user.id);
  p.set("subscription_data[metadata][plan]",plan);
  p.set("custom_text[submit][message]",chosen.name+" wordt na jouw expliciete bevestiging als betaald maandabonnement geactiveerd. Maandelijks opzegbaar. Toepasselijke btw wordt in Checkout berekend.");
  if(account?.stripe_customer_id)p.set("customer",String(account.stripe_customer_id));
  else if(user.email)p.set("customer_email",user.email);

  // Server-side dedupe for double-clicks, refreshes and concurrent requests.
  // The 10-minute bucket keeps retries stable without blocking a genuinely new attempt later.
  const checkoutBucket=Math.floor(Date.now()/(10*60*1000));
  const idempotencyKey="boekuna-checkout:"+user.id+":"+plan+":"+checkoutBucket;
  const session=await stripePost("/checkout/sessions",p,idempotencyKey);
  if(!session?.url)throw new Error("STRIPE:Geen checkout-URL ontvangen");
  return json(req,{ok:true,url:session.url,plan});
 }catch(e){
  const m=String(e?.message||e);
  if(m==="UNAUTHORIZED")return json(req,{ok:false,error:"Je sessie is verlopen. Log opnieuw in."},401);
  if(m==="STRIPE_NOT_CONFIGURED")return json(req,{ok:false,error:"Betalingen zijn technisch voorbereid maar Stripe is nog niet met een geheime productiesleutel verbonden.",code:"STRIPE_NOT_CONFIGURED"},503);
  return json(req,{ok:false,error:m.replace(/^STRIPE:/,"")||"Checkout kon niet worden gestart."},500);
 }
});