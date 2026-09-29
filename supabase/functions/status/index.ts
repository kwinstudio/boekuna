import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors={
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"GET,OPTIONS",
  "access-control-allow-headers":"authorization,apikey,content-type"
};
const PROCESSOR_URL=(Deno.env.get("DOCUMENT_PROCESSOR_URL")||"https://kwinest-docprocessor.onrender.com").replace(/\/$/,"");
const EXTERNAL_AI_ENABLED=["1","true","yes","on"].includes((Deno.env.get("BOOKUNA_ENABLE_EXTERNAL_AI")||"").trim().toLowerCase());

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="GET")return new Response(JSON.stringify({ok:false,error:"METHOD_NOT_ALLOWED"}),{status:405,headers:{...cors,"content-type":"application/json"}});
  let processor:any={};
  try{
    const r=await fetch(PROCESSOR_URL+"/health",{signal:AbortSignal.timeout(12000)});
    if(r.ok)processor=await r.json().catch(()=>({}));
  }catch(_){}
  const openaiDirectConfigured=EXTERNAL_AI_ENABLED&&!!Deno.env.get("OPENAI_API_KEY");
  const aiGatewayConfigured=EXTERNAL_AI_ENABLED&&!!Deno.env.get("AI_GATEWAY_API_KEY");
  return new Response(JSON.stringify({
    ok:true,cloudConfigured:true,authMode:"supabase",
    emailConfigured:!!(Deno.env.get("RESEND_API_KEY")&&Deno.env.get("INVOICE_FROM_EMAIL")),emailProvider:"resend",
    stripeConfigured:!!Deno.env.get("STRIPE_SECRET_KEY"),
    externalAiEnabled:EXTERNAL_AI_ENABLED,
    aiAuthPresent:EXTERNAL_AI_ENABLED&&(!!processor.aiConfigured||openaiDirectConfigured||aiGatewayConfigured),
    openaiDirectConfigured,aiGatewayConfigured,
    documentProcessorConfigured:!!processor.ok,
    documentProcessorAiConfigured:!!processor.aiConfigured,
    independentDocumentReviewConfigured:!!processor.verificationConfigured,
    ocrConfigured:!!processor.ocrAvailable,
    ocrModel:processor.ocrModel||null,
    aiModel:"gpt-5.6-sol",bankProvider:false,peppolProvider:false
  }),{status:200,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}});
});