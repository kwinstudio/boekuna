import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors={
  "access-control-allow-origin":"*",
  "access-control-allow-methods":"GET,OPTIONS",
  "access-control-allow-headers":"authorization,apikey,content-type"
};

Deno.serve((req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="GET")return new Response(JSON.stringify({ok:false,error:"METHOD_NOT_ALLOWED"}),{status:405,headers:{...cors,"content-type":"application/json"}});
  const openaiDirectConfigured=!!Deno.env.get("OPENAI_API_KEY");
  const aiGatewayConfigured=!!Deno.env.get("AI_GATEWAY_API_KEY");
  return new Response(JSON.stringify({
    ok:true,
    cloudConfigured:true,
    authMode:"supabase",
    emailConfigured:!!(Deno.env.get("RESEND_API_KEY")&&Deno.env.get("INVOICE_FROM_EMAIL")),
    emailProvider:"resend",
    stripeConfigured:!!Deno.env.get("STRIPE_SECRET_KEY"),
    aiAuthPresent:openaiDirectConfigured||aiGatewayConfigured,
    openaiDirectConfigured,
    aiGatewayConfigured,
    independentDocumentReviewConfigured:openaiDirectConfigured,
    aiModel:"gpt-5.6-sol",
    bankProvider:false,
    peppolProvider:false
  }),{status:200,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}});
});