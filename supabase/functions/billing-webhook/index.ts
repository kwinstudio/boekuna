import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}})}
async function stripeGet(path:string){
 const key=Deno.env.get("STRIPE_SECRET_KEY")||"";
 if(!key)throw new Error("STRIPE_NOT_CONFIGURED");
 const r=await fetch("https://api.stripe.com/v1"+path,{headers:{Authorization:"Bearer "+key}});
 const body=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(String(body?.error?.message||"Stripe request failed"));
 return body;
}
function ts(v:any){return v?new Date(Number(v)*1000).toISOString():null}
function normalizedStatus(v:any){
 const s=String(v||"");
 return ["trialing","active","past_due","canceled","incomplete","incomplete_expired","unpaid","paused"].includes(s)?s:"incomplete";
}

Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json({ok:false,error:"Method not allowed"},405);
 try{
  const raw=await req.json().catch(()=>null);
  const eventId=String(raw?.id||"");
  if(!/^evt_/.test(eventId))return json({ok:false,error:"Invalid Stripe event"},400);

  // Authenticate the event by retrieving it from Stripe with our account secret.
  const event=await stripeGet("/events/"+encodeURIComponent(eventId));
  const url=Deno.env.get("SUPABASE_URL")!;
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});

  const {data:already}=await admin.from("billing_events").select("stripe_event_id").eq("stripe_event_id",event.id).maybeSingle();
  if(already)return json({ok:true,duplicate:true});

  const type=String(event.type||"");
  const obj=event?.data?.object||{};

  async function resolveUserId(){
    const metaUser=String(obj?.metadata?.user_id||obj?.client_reference_id||"");
    if(metaUser)return metaUser;
    const subId=String(obj?.subscription||obj?.id||"");
    if(subId.startsWith("sub_")){
      const {data}=await admin.from("billing_accounts").select("user_id").eq("stripe_subscription_id",subId).maybeSingle();
      if(data?.user_id)return String(data.user_id);
    }
    const cust=String(obj?.customer||"");
    if(cust){
      const {data}=await admin.from("billing_accounts").select("user_id").eq("stripe_customer_id",cust).maybeSingle();
      if(data?.user_id)return String(data.user_id);
    }
    return "";
  }

  if(type==="checkout.session.completed"){
    const userId=String(obj.client_reference_id||obj?.metadata?.user_id||"");
    const subId=String(obj.subscription||"");
    if(userId&&subId){
      const sub=await stripeGet("/subscriptions/"+encodeURIComponent(subId));
      const plan=String(sub?.metadata?.plan||obj?.metadata?.plan||"boekuna");
      const founderNumber=Number(sub?.metadata?.founder_number||obj?.metadata?.founder_number||0)||null;
      const row={
        user_id:userId,
        stripe_customer_id:String(obj.customer||sub.customer||"")||null,
        stripe_subscription_id:subId,
        plan:plan==="pro"?"pro":"boekuna",
        status:normalizedStatus(sub.status),
        founder_number:founderNumber,
        trial_end:ts(sub.trial_end),
        current_period_end:ts(sub.current_period_end),
        cancel_at_period_end:!!sub.cancel_at_period_end,
        updated_at:new Date().toISOString()
      };
      const {error}=await admin.from("billing_accounts").upsert(row,{onConflict:"user_id"});if(error)throw error;
      if(founderNumber){
        await admin.from("founding_offer_claims").update({status:"activated",activated_at:new Date().toISOString(),reserved_until:null,checkout_session_id:String(obj.id||""),updated_at:new Date().toISOString()}).eq("user_id",userId);
      }
    }
  }else if(["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"].includes(type)){
    const userId=await resolveUserId();
    if(userId){
      const plan=String(obj?.metadata?.plan||"");
      const existing=await admin.from("billing_accounts").select("plan,founder_number").eq("user_id",userId).maybeSingle();
      const currentPlan=plan==="pro"?"pro":plan==="boekuna"?"boekuna":String(existing.data?.plan||"boekuna");
      const founderNumber=Number(obj?.metadata?.founder_number||existing.data?.founder_number||0)||null;
      const row={
        user_id:userId,
        stripe_customer_id:String(obj.customer||"")||null,
        stripe_subscription_id:String(obj.id||"")||null,
        plan:currentPlan,
        status:normalizedStatus(obj.status),
        founder_number:founderNumber,
        trial_end:ts(obj.trial_end),
        current_period_end:ts(obj.current_period_end),
        cancel_at_period_end:!!obj.cancel_at_period_end,
        updated_at:new Date().toISOString()
      };
      const {error}=await admin.from("billing_accounts").upsert(row,{onConflict:"user_id"});if(error)throw error;
    }
  }else if(["invoice.paid","invoice.payment_failed"].includes(type)){
    const subId=String(obj.subscription||obj?.parent?.subscription_details?.subscription||"");
    if(subId){
      const sub=await stripeGet("/subscriptions/"+encodeURIComponent(subId));
      const {data:account}=await admin.from("billing_accounts").select("user_id,plan,founder_number").eq("stripe_subscription_id",subId).maybeSingle();
      const userId=String(sub?.metadata?.user_id||account?.user_id||"");
      if(userId){
        await admin.from("billing_accounts").upsert({
          user_id:userId,
          stripe_customer_id:String(sub.customer||"")||null,
          stripe_subscription_id:subId,
          plan:String(sub?.metadata?.plan||account?.plan||"boekuna")==="pro"?"pro":"boekuna",
          status:normalizedStatus(sub.status),
          founder_number:Number(sub?.metadata?.founder_number||account?.founder_number||0)||null,
          trial_end:ts(sub.trial_end),
          current_period_end:ts(sub.current_period_end),
          cancel_at_period_end:!!sub.cancel_at_period_end,
          updated_at:new Date().toISOString()
        },{onConflict:"user_id"});
      }
    }
  }

  const {error:eventError}=await admin.from("billing_events").insert({stripe_event_id:event.id,event_type:type});
  if(eventError&&eventError.code!=="23505")throw eventError;
  return json({ok:true});
 }catch(e){
  return json({ok:false,error:String(e?.message||e)},500);
 }
});