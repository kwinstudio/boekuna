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
  const input=await req.json().catch(()=>({}));
  const plan=String(input.plan||"");
  const config={
    boekuna:{name:"Boekuna",amount:995,limit:100},
    pro:{name:"Boekuna Pro",amount:2000,limit:300}
  } as const;
  if(!(plan in config))return json({ok:false,error:"Kies Boekuna of Boekuna Pro."},400);

  const {data:account}=await admin.from("billing_accounts")
    .select("stripe_customer_id,stripe_subscription_id,status,plan")
    .eq("user_id",user.id).maybeSingle();
  if(account&&["trialing","active"].includes(String(account.status||""))){
    return json({ok:false,error:"Je hebt al een actief abonnement. Beheer of wijzig dit via Abonnement in Boekuna.",code:"ACTIVE_SUBSCRIPTION"},409);
  }

  const {data:offer,error:offerError}=await admin.rpc("reserve_founding_offer",{p_user_id:user.id});
  if(offerError)throw new Error("OFFER:"+offerError.message);
  const founder=Array.isArray(offer)?offer[0]:offer;
  const trialEligible=!!founder?.eligible;
  const founderNumber=founder?.founder_number?Number(founder.founder_number):null;
  const chosen=config[plan as keyof typeof config];

  const p=new URLSearchParams();
  p.set("mode","subscription");
  p.set("success_url",APP_URL+"/?login=1&billing=success");
  p.set("cancel_url",APP_URL+"/?login=1&billing=cancelled");
  p.set("client_reference_id",user.id);
  p.set("locale","nl");
  p.set("payment_method_collection","always");
  p.set("billing_address_collection","required");
  p.set("tax_id_collection[enabled]","true");
  p.set("automatic_tax[enabled]","true");
  p.set("line_items[0][price_data][currency]","eur");
  p.set("line_items[0][price_data][unit_amount]",String(chosen.amount));
  p.set("line_items[0][price_data][tax_behavior]","exclusive");
  p.set("line_items[0][price_data][recurring][interval]","month");
  p.set("line_items[0][price_data][product_data][name]",chosen.name);
  p.set("line_items[0][price_data][product_data][description]",chosen.limit+" slimme documentverwerkingen per maand");
  p.set("line_items[0][quantity]","1");
  p.set("metadata[user_id]",user.id);
  p.set("metadata[plan]",plan);
  p.set("subscription_data[metadata][user_id]",user.id);
  p.set("subscription_data[metadata][plan]",plan);
  if(founderNumber){
    p.set("metadata[founder_number]",String(founderNumber));
    p.set("subscription_data[metadata][founder_number]",String(founderNumber));
  }
  if(trialEligible){
    p.set("subscription_data[trial_period_days]","90");
    p.set("custom_text[submit][message]","Eerste 100-aanbod: vandaag €0. Na 90 dagen loopt "+chosen.name+" automatisch door voor €"+(chosen.amount/100).toFixed(2).replace(".",",")+" per maand, plus toepasselijke btw. Maandelijks opzegbaar.");
  }else{
    p.set("custom_text[submit][message]",chosen.name+" loopt maandelijks door en is maandelijks opzegbaar. Toepasselijke btw wordt in Checkout berekend.");
  }
  if(account?.stripe_customer_id)p.set("customer",String(account.stripe_customer_id));
  else if(user.email)p.set("customer_email",user.email);

  const session=await stripePost("/checkout/sessions",p);
  if(!session?.url)throw new Error("STRIPE:Geen checkout-URL ontvangen");
  if(founderNumber){
    await admin.from("founding_offer_claims").update({checkout_session_id:session.id,updated_at:new Date().toISOString()}).eq("user_id",user.id);
  }
  return json({ok:true,url:session.url,trialEligible,founderNumber,plan});
 }catch(e){
  const m=String(e?.message||e);
  if(m==="UNAUTHORIZED")return json({ok:false,error:"Je sessie is verlopen. Log opnieuw in."},401);
  if(m==="STRIPE_NOT_CONFIGURED")return json({ok:false,error:"Betalingen zijn technisch voorbereid maar Stripe is nog niet met een geheime productiesleutel verbonden.",code:"STRIPE_NOT_CONFIGURED"},503);
  return json({ok:false,error:m.replace(/^STRIPE:/,"").replace(/^OFFER:/,"")||"Checkout kon niet worden gestart."},500);
 }
});