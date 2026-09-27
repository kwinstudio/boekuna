import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://boekuna-boekhouding.onrender.com",
  "https://boekuna.nl",
  "https://www.boekuna.nl",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);
const cors = (req: Request) => {
  const origin = req.headers.get("origin") || "";
  return {
    "access-control-allow-origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://boekuna-boekhouding.onrender.com",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,apikey,content-type,x-kwinest-test-mode",
    "vary": "Origin"
  };
};
const j=(req:Request,body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"content-type":"application/json","cache-control":"no-store"}});
const safe=(v:any,n=1000)=>String(v??"").slice(0,n);
const parseJson=(t:string)=>{let raw=String(t||"").trim();if(raw.startsWith("\`\`\`"))raw=raw.replace(/^\`\`\`(?:json)?/i,"").replace(/\`\`\`$/,"").trim();const a=raw.indexOf("{"),b=raw.lastIndexOf("}");if(a>=0&&b>a)raw=raw.slice(a,b+1);return JSON.parse(raw)};
const outputText=(x:any)=>{if(typeof x?.output_text==="string")return x.output_text;for(const item of x?.output||[])if(item?.type==="message")for(const c of item.content||[])if(c?.type==="output_text"&&c.text)return c.text;return ""};

async function sha256(value:string){
  const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function authUser(req:Request){
  const h=req.headers.get("authorization")||"";
  if(!h.startsWith("Bearer "))return null;
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:h}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await sb.auth.getUser();
  return !error&&data.user?{user:data.user,token:h.slice(7)}:null;
}
async function allowRequest(req:Request,body:any){
  const user=await authUser(req);
  if(user){
    const q=await fetch(Deno.env.get("SUPABASE_URL")!+"/functions/v1/consume-quota",{method:"POST",headers:{Authorization:"Bearer "+user.token,"content-type":"application/json"},body:JSON.stringify({feature:"invoice_ai"})});
    const o=await q.json().catch(()=>({}));
    return {ok:!!(q.ok&&o.allowed),kind:"user"};
  }
  const origin=req.headers.get("origin")||"";
  const test=req.headers.get("x-kwinest-test-mode")==="1" && body?.testMode===true;
  if(!test || !ALLOWED_ORIGINS.has(origin))return {ok:false,kind:"none"};
  const ip=(req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")||"unknown").split(",")[0].trim();
  const hash=await sha256(ip+"|kwinest-invoice-ai");
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await admin.rpc("consume_anonymous_ai_quota",{p_client_hash:hash});
  return {ok:!error&&data===true,kind:"test"};
}

function promptFor(data:any){
 const verify=data?.reviewMode==="verify";
 const modeInstruction=verify
  ? "DIT IS EEN ONAFHANKELIJKE TWEEDE CONTROLE. Bepaal alle velden opnieuw uit de originele bron. Je krijgt bewust geen waarden uit PASS 1 als antwoordhint. Probeer eerdere herkenning niet te bevestigen of te corrigeren; rapporteer uitsluitend wat je zelf uit het document kunt onderbouwen.\\n\\n"
  : "DIT IS DE EERSTE EXTRACTIEPASS. Lokale herkenning mag alleen als zwakke hint worden gebruikt en mag zichtbaar documentbewijs nooit overrulen.\\n\\n";
 const priorHint=verify?"":("Lokale herkenning (hint, nooit waarheid):\\n"+JSON.stringify(data.localGuess||{}).slice(0,10000)+"\\n\\n");
 return (
"Je bent een Nederlandse boekhoudkundige document-extractor. Lees het ORIGINELE document en de beschikbare PDF/OCR-tekst.\\n"+
"Je taak is niet gokken maar controleren. Als een veld niet betrouwbaar uit het document volgt, geef een lege waarde en verlaag de fieldConfidence.\\n\\n"+
modeInstruction+
"BELANGRIJKE REGELS:\\n"+
"- Onderscheid leverancier, klant en het eigen bedrijf. Eigen bedrijf: "+JSON.stringify(data.company||{}).slice(0,7000)+"\\n"+
"- Bij self-billing (factuur uitgereikt door afnemer) bepaal de richting correct.\\n"+
"- Factuurbedrag/omzet is NOOIT automatisch gelijk aan netto bankuitbetaling.\\n"+
"- Factoringkosten, platformkosten, commissie, inhoudingen en betaalproviderkosten moeten in adjustments.\\n"+
"- Voorbeeld: factuur 187,55; factoringkosten 6,58; uitbetaling 180,97 => gross=187.55, adjustments gross=6.58, payout=180.97.\\n"+
"- Controleer altijd net + vat = gross binnen afronding.\\n"+
"- Bij gemengde btw-tarieven: mixedRates=true; forceer geen enkel algemeen btw-tarief.\\n"+
"- Gebruik datums als ISO YYYY-MM-DD.\\n"+
"- lineItems bevatten alleen echte factuurregels, nooit totalen, btw-regels of betalingsregels.\\n"+
"- Geef confidence en fieldConfidence 0-100 op basis van zichtbaar bewijs.\\n"+
"- Voeg warnings toe voor elk onzeker veld of intern probleem dat je zelf in deze analyse ziet.\\n"+
"- Geen markdown, geen tekst buiten JSON.\\n\\n"+
"Geef exact één JSON-object met velden type, party, email, phone, vatId, kvk, address, postal, city, iban, invoiceNumber, issueDate, dueDate, paymentReference, description, net, vatAmount, gross, vatRate, payout, selfBilling, status, mixedRates, lineItems, adjustments, adjustmentParty, confidence, fieldConfidence, warnings, reasoningSummary.\\n"+
"lineItems: [{desc,qty,unit,vat,total}]. adjustments: [{net,vat,gross,vatRate,counterparty}].\\n\\n"+
priorHint+
"PDF/OCR-tekst:\\n"+safe(data.extractedText,30000)
 );
}
const outputSchema={"type":"object","additionalProperties":false,"properties":{"documentType":{"type":"string","enum":["purchase_invoice","sale_invoice","credit_invoice","receipt","bank_document","other","unknown"]},"type":{"type":"string","enum":["sale","purchase","unknown"]},"party":{"anyOf":[{"type":"string"},{"type":"null"}]},"email":{"anyOf":[{"type":"string"},{"type":"null"}]},"phone":{"anyOf":[{"type":"string"},{"type":"null"}]},"vatId":{"anyOf":[{"type":"string"},{"type":"null"}]},"kvk":{"anyOf":[{"type":"string"},{"type":"null"}]},"address":{"anyOf":[{"type":"string"},{"type":"null"}]},"postal":{"anyOf":[{"type":"string"},{"type":"null"}]},"city":{"anyOf":[{"type":"string"},{"type":"null"}]},"country":{"anyOf":[{"type":"string"},{"type":"null"}]},"iban":{"anyOf":[{"type":"string"},{"type":"null"}]},"invoiceNumber":{"anyOf":[{"type":"string"},{"type":"null"}]},"issueDate":{"anyOf":[{"type":"string"},{"type":"null"}]},"dueDate":{"anyOf":[{"type":"string"},{"type":"null"}]},"paymentReference":{"anyOf":[{"type":"string"},{"type":"null"}]},"description":{"anyOf":[{"type":"string"},{"type":"null"}]},"orderNumber":{"anyOf":[{"type":"string"},{"type":"null"}]},"currency":{"anyOf":[{"type":"string"},{"type":"null"}]},"paymentTermDays":{"anyOf":[{"type":"number"},{"type":"null"}]},"net":{"anyOf":[{"type":"number"},{"type":"null"}]},"vatAmount":{"anyOf":[{"type":"number"},{"type":"null"}]},"gross":{"anyOf":[{"type":"number"},{"type":"null"}]},"vatRate":{"anyOf":[{"type":"number"},{"type":"null"}]},"payout":{"anyOf":[{"type":"number"},{"type":"null"}]},"discount":{"anyOf":[{"type":"number"},{"type":"null"}]},"shipping":{"anyOf":[{"type":"number"},{"type":"null"}]},"selfBilling":{"type":"boolean"},"status":{"type":"string","enum":["open","sent","paid","draft","cancelled","credit","unknown"]},"mixedRates":{"type":"boolean"},"vatLines":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"rate":{"anyOf":[{"type":"number"},{"type":"null"}]},"taxableAmount":{"anyOf":[{"type":"number"},{"type":"null"}]},"vatAmount":{"anyOf":[{"type":"number"},{"type":"null"}]}},"required":["rate","taxableAmount","vatAmount"]}},"lineItems":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"desc":{"anyOf":[{"type":"string"},{"type":"null"}]},"qty":{"anyOf":[{"type":"number"},{"type":"null"}]},"unit":{"anyOf":[{"type":"number"},{"type":"null"}]},"vat":{"anyOf":[{"type":"number"},{"type":"null"}]},"total":{"anyOf":[{"type":"number"},{"type":"null"}]}},"required":["desc","qty","unit","vat","total"]}},"adjustments":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"net":{"anyOf":[{"type":"number"},{"type":"null"}]},"vat":{"anyOf":[{"type":"number"},{"type":"null"}]},"gross":{"anyOf":[{"type":"number"},{"type":"null"}]},"vatRate":{"anyOf":[{"type":"number"},{"type":"null"}]},"counterparty":{"anyOf":[{"type":"string"},{"type":"null"}]}},"required":["net","vat","gross","vatRate","counterparty"]}},"adjustmentParty":{"anyOf":[{"type":"string"},{"type":"null"}]},"confidence":{"type":"number","minimum":0,"maximum":100},"fieldConfidence":{"type":"object","additionalProperties":false,"properties":{"party":{"type":"number","minimum":0,"maximum":100},"email":{"type":"number","minimum":0,"maximum":100},"phone":{"type":"number","minimum":0,"maximum":100},"vatId":{"type":"number","minimum":0,"maximum":100},"kvk":{"type":"number","minimum":0,"maximum":100},"address":{"type":"number","minimum":0,"maximum":100},"postal":{"type":"number","minimum":0,"maximum":100},"city":{"type":"number","minimum":0,"maximum":100},"country":{"type":"number","minimum":0,"maximum":100},"iban":{"type":"number","minimum":0,"maximum":100},"invoiceNumber":{"type":"number","minimum":0,"maximum":100},"issueDate":{"type":"number","minimum":0,"maximum":100},"dueDate":{"type":"number","minimum":0,"maximum":100},"paymentReference":{"type":"number","minimum":0,"maximum":100},"description":{"type":"number","minimum":0,"maximum":100},"net":{"type":"number","minimum":0,"maximum":100},"vatAmount":{"type":"number","minimum":0,"maximum":100},"gross":{"type":"number","minimum":0,"maximum":100},"vatRate":{"type":"number","minimum":0,"maximum":100},"payout":{"type":"number","minimum":0,"maximum":100},"currency":{"type":"number","minimum":0,"maximum":100},"orderNumber":{"type":"number","minimum":0,"maximum":100},"paymentTermDays":{"type":"number","minimum":0,"maximum":100}},"required":["party","email","phone","vatId","kvk","address","postal","city","country","iban","invoiceNumber","issueDate","dueDate","paymentReference","description","net","vatAmount","gross","vatRate","payout","currency","orderNumber","paymentTermDays"]},"warnings":{"type":"array","items":{"type":"string"}},"reasoningSummary":{"type":"string"}},"required":["documentType","type","party","email","phone","vatId","kvk","address","postal","city","country","iban","invoiceNumber","issueDate","dueDate","paymentReference","description","orderNumber","currency","paymentTermDays","net","vatAmount","gross","vatRate","payout","discount","shipping","selfBilling","status","mixedRates","vatLines","lineItems","adjustments","adjustmentParty","confidence","fieldConfidence","warnings","reasoningSummary"]};

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  const configured=!!(Deno.env.get("OPENAI_API_KEY")||Deno.env.get("AI_GATEWAY_API_KEY"));
  if(req.method==="GET")return j(req,{ok:true,service:"invoice-ai-review",configured,model:"gpt-5.6-sol"});
  if(req.method!=="POST")return j(req,{ok:false,error:"METHOD_NOT_ALLOWED"},405);
  const origin=req.headers.get("origin")||"";
  if(origin && !ALLOWED_ORIGINS.has(origin))return j(req,{ok:false,error:"ORIGIN_NOT_ALLOWED"},403);

  const data=await req.json().catch(()=>null);
  if(!data)return j(req,{ok:false,error:"INVALID_JSON"},400);
  const allowed=await allowRequest(req,data);
  if(!allowed.ok)return j(req,{ok:false,error:allowed.kind==="none"?"UNAUTHORIZED":"AI_RATE_LIMIT"},allowed.kind==="none"?401:429);

  const openaiKey=Deno.env.get("OPENAI_API_KEY");
  const gatewayKey=Deno.env.get("AI_GATEWAY_API_KEY");
  const verify=data.reviewMode==="verify";
  if(verify&&!openaiKey)return j(req,{ok:false,error:"INDEPENDENT_REVIEW_PROVIDER_NOT_CONFIGURED"},503);
  if(!openaiKey&&!gatewayKey)return j(req,{ok:false,error:"AI_PROVIDER_NOT_CONFIGURED"},503);

  const content:any[]=[{type:"input_text",text:promptFor(data)}];
  const raw=String(data.fileBase64||data.pdfBase64||"");
  const mime=safe(data.mimeType||(data.pdfBase64?"application/pdf":""),120).toLowerCase();
  if(raw && raw.length<3800000){
    const dataPrefix=/^data:[^;]+;base64,/i.exec(raw)?.[0]||"";
    const b64=dataPrefix?raw.slice(dataPrefix.length):raw;
    const supportedImages=new Set(["image/png","image/jpeg","image/webp","image/gif"]);
    if(supportedImages.has(mime)){
      content.push({type:"input_image",image_url:`data:${mime};base64,${b64}`,detail:"high"});
    }else if(mime){
      content.push({type:"input_file",filename:safe(data.fileName||"document",160),file_data:`data:${mime};base64,${b64}`});
    }
  }

  const direct=!!openaiKey;
  const endpoint=direct?(Deno.env.get("OPENAI_RESPONSES_URL")||"https://api.openai.com/v1/responses"):"https://ai-gateway.vercel.sh/v1/responses";
  const key=direct?openaiKey!:gatewayKey!;
  const model=direct?"gpt-5.6-sol":"openai/gpt-5.6-sol";
  const payload={model,input:[{role:"user",content}],reasoning:{effort:verify?"medium":"low"},text:{format:{type:"json_schema",name:"invoice_extraction",schema:outputSchema,strict:true}},max_output_tokens:5000,store:false};
  const rr=await fetch(endpoint,{method:"POST",headers:{Authorization:"Bearer "+key,"content-type":"application/json"},body:JSON.stringify(payload)});
  const out=await rr.json().catch(()=>({}));
  if(!rr.ok)return j(req,{ok:false,error:out?.error?.message||out?.message||"AI_SERVICE_ERROR"},rr.status);
  try{
    const parsed=parseJson(outputText(out));
    return j(req,{ok:true,model,data:parsed,usage:out.usage||null,pass:data.reviewMode==="verify"?"verify":"extract"});
  }catch(e){
    return j(req,{ok:false,error:"AI_RESPONSE_INVALID"},502);
  }
});