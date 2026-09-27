import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const ALLOWED_ORIGIN="https://boekuna-boekhouding.onrender.com";
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false}});
const cors={"access-control-allow-origin":ALLOWED_ORIGIN,"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"authorization,apikey,content-type","vary":"Origin"};
const j=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}});
const safe=(v:any,n=500)=>String(v??"").slice(0,n);
const email=(v:any)=>{const s=safe(v,240).trim();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)?s:""};
const num=(v:any)=>Number.isFinite(Number(v))?Number(v):0;
const money=(v:any)=>new Intl.NumberFormat("nl-NL",{style:"currency",currency:"EUR"}).format(num(v));
const dateNL=(v:any)=>{if(!v)return "—";try{return new Intl.DateTimeFormat("nl-NL",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(String(v)+"T12:00:00"))}catch{return safe(v,40)}};

async function userFrom(req:Request){
  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer ")) return null;
  const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data,error}=await sb.auth.getUser();
  if(error||!data.user)return null;
  return {user:data.user,token:auth.slice(7)};
}
async function quota(token:string,feature:string){
  const r=await fetch(Deno.env.get("SUPABASE_URL")!+"/functions/v1/consume-quota",{method:"POST",headers:{Authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({feature})});
  const out=await r.json().catch(()=>({}));
  return !!(r.ok&&out.allowed);
}
function toCents(v:any){const n=num(v);return Math.round((n+(n>=0?Number.EPSILON:-Number.EPSILON))*100)}
function roundMoney(v:any){return toCents(v)/100}
function taxTreatment(invoice:any){return String(invoice?.taxTreatment||"standard")}
function zeroVatTreatment(v:any){return ["kor","reverse","icp","exempt"].includes(String(v||"standard"))}
function lineNet(l:any){return roundMoney(num(l?.qty)*num(l?.unit))}
function discountBase(invoice:any){return roundMoney((Array.isArray(invoice?.lines)?invoice.lines:[]).reduce((s:number,l:any)=>roundMoney(s+lineNet(l)),0))}
function discountAmount(invoice:any){
  const base=Math.max(0,discountBase(invoice)),type=String(invoice?.discountType||"none"),value=Math.max(0,num(invoice?.discountValue));
  if(type==="percent")return roundMoney(Math.min(base,base*Math.min(100,value)/100));
  if(type==="fixed")return roundMoney(Math.min(base,value));
  return 0;
}
function allocateDiscountCents(amounts,discountCents){
 const total=amounts.reduce((sum,value)=>sum+value,0),discount=Math.min(Math.max(0,discountCents),Math.max(0,total));
 if(!discount||total<=0)return amounts.slice();
 const target=total-discount,parts=amounts.map((value,index)=>{const scaled=value*target/total;return {index,cents:Math.floor(scaled),remainder:scaled-Math.floor(scaled)}});
 let remainder=target-parts.reduce((sum,part)=>sum+part.cents,0);
 const order=parts.slice().sort((a,b)=>b.remainder-a.remainder||a.index-b.index);
 for(let index=0;index<remainder;index++)order[index%order.length].cents++;
 return parts.map(part=>part.cents);
}
function discountFactor(invoice:any){const base=discountBase(invoice);return base>0?(base-discountAmount(invoice))/base:1}
function discountedLineNet(invoice:any,l:any){const lines=Array.isArray(invoice?.lines)?invoice.lines:[],index=lines.indexOf(l);if(index<0)return roundMoney(lineNet(l)*discountFactor(invoice));return allocateDiscountCents(lines.map((line:any)=>toCents(lineNet(line))),toCents(discountAmount(invoice)))[index]/100}
function discountedLineVat(invoice:any,l:any){return zeroVatTreatment(taxTreatment(invoice))?0:roundMoney(discountedLineNet(invoice,l)*num(l?.vat)/100)}
function calc(invoice:any){
  const sign=invoice?.kind==="credit"?-1:1;
  const lines=Array.isArray(invoice?.lines)?invoice.lines:[];
  const net=invoice?.importedTotals?.net!=null
    ? roundMoney(Math.abs(num(invoice.importedTotals.net))*sign)
    : roundMoney(lines.reduce((s:number,l:any)=>roundMoney(s+discountedLineNet(invoice,l)),0)*sign);
  const vat=zeroVatTreatment(taxTreatment(invoice))
    ? 0
    : invoice?.importedTotals?.vat!=null
      ? roundMoney(Math.abs(num(invoice.importedTotals.vat))*sign)
      : roundMoney(lines.reduce((s:number,l:any)=>roundMoney(s+discountedLineVat(invoice,l)),0)*sign);
  const gross=invoice?.importedTotals?.gross!=null
    ? roundMoney(Math.abs(num(invoice.importedTotals.gross))*sign)
    : roundMoney(net+vat);
  const paid=(Array.isArray(invoice?.payments)?invoice.payments:[]).reduce((s:number,p:any)=>roundMoney(s+Math.abs(roundMoney(p.amount))),0);
  return {lines,net,vat,gross,paid,outstanding:Math.max(0,roundMoney(Math.abs(gross)-paid)),sign,discount:discountAmount(invoice)};
}
async function pdfBytes(data:any){
  const {company={},customer={},invoice={}}=data; const c=calc(invoice);
  const pdf=await PDFDocument.create(); const regular=await pdf.embedFont(StandardFonts.Helvetica); const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const accentHex=String(company?.invoiceDesign?.accentColor||"#17382f").replace("#","");
  const ar=parseInt(accentHex.slice(0,2)||"17",16)/255,ag=parseInt(accentHex.slice(2,4)||"38",16)/255,ab=parseInt(accentHex.slice(4,6)||"2f",16)/255;
  const accent=rgb(ar,ag,ab), ink=rgb(.09,.14,.12), muted=rgb(.4,.46,.43);
  let page=pdf.addPage([595.28,841.89]); let y=790;
  const text=(t:string,x:number,yy:number,size=10,font=regular,color=ink)=>page.drawText(safe(t,1000),{x,y:yy,size,font,color,maxWidth:500});
  text(safe(company.tradeName||company.name,120).toUpperCase(),46,y,9,bold,accent); text(invoice.kind==="credit"?"CREDITFACTUUR":"FACTUUR",46,y-34,26,bold,ink);
  text(safe(invoice.number,80),410,y,12,bold,ink); text(dateNL(invoice.issueDate),410,y-18,9,regular,muted);
  page.drawLine({start:{x:46,y:y-52},end:{x:549,y:y-52},thickness:1.5,color:accent}); y-=82;
  text("VAN",46,y,7,bold,muted); text(safe(company.name,120),46,y-17,10,bold); text(safe(company.address,120),46,y-34,9); text((safe(company.postal,30)+" "+safe(company.city,80)).trim(),46,y-48,9);
  text("FACTUUR AAN",310,y,7,bold,muted); text(safe(customer.name,120),310,y-17,10,bold); text(safe(customer.address,120),310,y-34,9); text((safe(customer.postal,30)+" "+safe(customer.city,80)).trim(),310,y-48,9);
  y-=90;
  text("Omschrijving",46,y,8,bold,muted); text("Aantal",330,y,8,bold,muted); text("Btw",410,y,8,bold,muted); text("Bedrag",480,y,8,bold,muted);
  page.drawLine({start:{x:46,y:y-10},end:{x:549,y:y-10},thickness:1,color:accent}); y-=30;
  for(const l of c.lines){
    if(y<170){page=pdf.addPage([595.28,841.89]);y=790}
    text(safe(l.desc||"",180),46,y,9,regular); text(String(num(l.qty)),330,y,9); text(zeroVatTreatment(taxTreatment(invoice))?"0%":String(num(l.vat))+"%",410,y,9); text(money(discountedLineNet(invoice,l)*c.sign),480,y,9,bold);
    y-=24;
  }
  y-=10; page.drawLine({start:{x:330,y:y+8},end:{x:549,y:y+8},thickness:.7,color:rgb(.85,.88,.86)});
  text(c.discount>0?"Subtotaal na korting":"Subtotaal",330,y,9,regular,muted); text(money(c.net),470,y,9,bold); y-=20;
  if(c.discount>0){text("Korting (inbegrepen)",330,y,9,regular,muted); text(money(c.discount),470,y,9,bold); y-=20;}
  text(zeroVatTreatment(taxTreatment(invoice))?"Btw ("+taxTreatment(invoice)+")":"Btw",330,y,9,regular,muted); text(money(c.vat),470,y,9,bold); y-=24;
  text(invoice.kind==="credit"?"Totaal credit":"Totaal",330,y,11,bold,ink); text(money(c.gross),470,y,11,bold,ink); y-=38;
  if(company?.invoiceDesign?.showPaymentBlock!==false){
    page.drawRectangle({x:46,y:y-54,width:503,height:54,color:accent});
    text(invoice.kind==="credit"?"CREDIT / VERREKENING":"BETALEN AAN",58,y-17,7,bold,rgb(1,1,1));
    text(invoice.kind==="credit"?"Wordt verrekend of terugbetaald":safe(company.iban,80),58,y-34,10,bold,rgb(1,1,1));
    text("REFERENTIE",330,y-17,7,bold,rgb(1,1,1)); text(safe(invoice.paymentReference||invoice.number,80),330,y-34,10,bold,rgb(1,1,1));
  }
  return await pdf.save();
}
function htmlMail(data:any){
  const {company={},customer={},invoice={},subject="",message=""}=data;const c=calc(invoice);
  const accent=String(company?.emailTemplate?.accentColor||"#17382f");
  const esc=(s:any)=>safe(s,12000).replace(/[&<>"']/g,(x)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]||x));
  return `<!doctype html><html><body style="margin:0;background:#f2f4f3;font-family:Arial,sans-serif;color:#1c2924"><div style="padding:30px 14px"><div style="max-width:640px;margin:auto;background:#fff;border:1px solid #e0e6e3;border-radius:16px;overflow:hidden"><div style="height:7px;background:${accent}"></div><div style="padding:30px"><div style="font-size:12px;color:${accent};font-weight:700;text-transform:uppercase">${esc(company?.emailTemplate?.senderName||company.tradeName||company.name||"Administratie")}</div><h1 style="font-size:22px;margin:7px 0 22px">${esc(subject)}</h1><div style="font-size:15px;line-height:1.7">${esc(message).replace(/\n/g,"<br>")}</div><div style="margin-top:24px;border:1px solid #e1e7e4;border-radius:12px;padding:16px"><b>${esc(invoice.number)}</b><div style="margin-top:8px">Klant: ${esc(customer.name)}</div><div>Bedrag: <b>${esc(money(c.gross))}</b></div><div>Vervaldatum: ${esc(dateNL(invoice.dueDate))}</div></div></div></div></div></body></html>`;
}

function bytesToBase64(bytes:Uint8Array){
  let binary="";
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
  return btoa(binary);
}
function utf8Base64(value:string){return bytesToBase64(new TextEncoder().encode(value))}
function base64Url(value:string){return utf8Base64(value).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function encodedHeader(value:string){return "=?UTF-8?B?"+utf8Base64(value)+"?="}
async function integrationSecret(name:string){
  const env=Deno.env.get(name);if(env)return env;
  const {data}=await admin.rpc("get_integration_secret",{p_name:name.toLowerCase()});
  return typeof data==="string"&&data?data:null;
}
async function mailboxConnection(userId:string){
  const {data,error}=await admin.rpc("get_email_connection_secret",{p_user_id:userId});
  if(error)throw error;
  const row=Array.isArray(data)?data[0]:data;
  return row&&row.status==="connected"&&row.refresh_token?row:null;
}
async function providerCredentials(provider:string){
  if(provider==="google")return {clientId:await integrationSecret("GOOGLE_MAIL_CLIENT_ID"),clientSecret:await integrationSecret("GOOGLE_MAIL_CLIENT_SECRET")};
  if(provider==="microsoft")return {clientId:await integrationSecret("MICROSOFT_MAIL_CLIENT_ID"),clientSecret:await integrationSecret("MICROSOFT_MAIL_CLIENT_SECRET")};
  return {clientId:null,clientSecret:null};
}
async function refreshMailboxToken(conn:any,userId:string){
  const cfg=await providerCredentials(conn.provider);
  if(!cfg.clientId||!cfg.clientSecret)throw new Error("MAIL_PROVIDER_NOT_CONFIGURED");
  let endpoint="",scope="";
  if(conn.provider==="google")endpoint="https://oauth2.googleapis.com/token";
  else if(conn.provider==="microsoft"){endpoint="https://login.microsoftonline.com/common/oauth2/v2.0/token";scope="openid profile email offline_access User.Read Mail.Send";}
  else throw new Error("MAIL_PROVIDER_UNSUPPORTED");
  const body=new URLSearchParams({client_id:cfg.clientId,client_secret:cfg.clientSecret,refresh_token:conn.refresh_token,grant_type:"refresh_token"});
  if(scope)body.set("scope",scope);
  const r=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});
  const out=await r.json().catch(()=>({}));
  if(!r.ok||!out.access_token){
    await admin.from("email_connections").update({status:"error",last_error:"Herautorisatie nodig",updated_at:new Date().toISOString()}).eq("user_id",userId);
    throw new Error("MAILBOX_REAUTH_REQUIRED");
  }
  if(out.refresh_token&&out.refresh_token!==conn.refresh_token){
    await admin.rpc("set_email_connection_secret",{p_user_id:userId,p_provider:conn.provider,p_email:conn.email,p_refresh_token:out.refresh_token,p_scopes:conn.scopes||[]});
    conn.refresh_token=out.refresh_token;
  }
  return out.access_token as string;
}
function buildMime(opts:{from:string;senderName:string;to:string;cc?:string;subject:string;text:string;html:string;filename:string;pdf:Uint8Array}){
  const mixed="mix_"+crypto.randomUUID().replace(/-/g,"");
  const alt="alt_"+crypto.randomUUID().replace(/-/g,"");
  const lines=[
    "From: "+encodedHeader(opts.senderName)+" <"+opts.from+">",
    "To: "+opts.to,
    ...(opts.cc?["Cc: "+opts.cc]:[]),
    "Subject: "+encodedHeader(opts.subject),
    "Date: "+new Date().toUTCString(),
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="'+mixed+'"',
    "",
    "--"+mixed,
    'Content-Type: multipart/alternative; boundary="'+alt+'"',
    "",
    "--"+alt,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    utf8Base64(opts.text),
    "--"+alt,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    utf8Base64(opts.html),
    "--"+alt+"--",
    "--"+mixed,
    'Content-Type: application/pdf; name="'+opts.filename+'"',
    "Content-Transfer-Encoding: base64",
    'Content-Disposition: attachment; filename="'+opts.filename+'"',
    "",
    bytesToBase64(opts.pdf).replace(/(.{76})/g,"$1\r\n"),
    "--"+mixed+"--",
    ""
  ];
  return lines.join("\r\n");
}
async function sendFromMailbox(conn:any,userId:string,data:any,to:string,subject:string,message:string,pdf:Uint8Array,sender:string){
  const accessToken=await refreshMailboxToken(conn,userId);
  const companyReply=email(data.company?.email);
  const cc=data.ccSelf&&companyReply&&companyReply!==to&&companyReply!==conn.email?companyReply:"";
  const filename=(data.invoice?.kind==="credit"?"Creditfactuur":"Factuur")+"-"+safe(data.invoice?.number,80).replace(/[^a-zA-Z0-9._-]/g,"-")+".pdf";
  const mime=buildMime({from:conn.email,senderName:sender,to,cc,subject,text:message,html:htmlMail({...data,subject,message}),filename,pdf});
  if(conn.provider==="google"){
    const r=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{method:"POST",headers:{Authorization:"Bearer "+accessToken,"content-type":"application/json"},body:JSON.stringify({raw:base64Url(mime)})});
    const out=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(out?.error?.message||"GMAIL_SEND_FAILED");
    return {id:out.id||"",provider:"google",from:conn.email};
  }
  if(conn.provider==="microsoft"){
    const r=await fetch("https://graph.microsoft.com/v1.0/me/sendMail",{method:"POST",headers:{Authorization:"Bearer "+accessToken,"content-type":"text/plain"},body:utf8Base64(mime)});
    if(!r.ok){const out=await r.json().catch(()=>({}));throw new Error(out?.error?.message||"MICROSOFT_SEND_FAILED")}
    return {id:"",provider:"microsoft",from:conn.email};
  }
  throw new Error("MAIL_PROVIDER_UNSUPPORTED");
}
async function resendConfig(){
  return {apiKey:await integrationSecret("RESEND_API_KEY"),fromEmail:await integrationSecret("INVOICE_FROM_EMAIL")};
}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin")||"";
  if(origin && origin!==ALLOWED_ORIGIN)return j({ok:false,error:"ORIGIN_NOT_ALLOWED"},403);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  const auth=await userFrom(req);if(!auth)return j({ok:false,error:"UNAUTHORIZED"},401);

  if(req.method==="GET"){
    let conn:any=null;try{conn=await mailboxConnection(auth.user.id)}catch{}
    if(conn?.provider==="google"){
      const cfg=await providerCredentials("google");
      return j({ok:true,configured:!!(cfg.clientId&&cfg.clientSecret),provider:"google",ownMailbox:true,email:conn.email,status:conn.status});
    }
    return j({ok:true,configured:false,provider:"google",ownMailbox:false,email:""});
  }

  if(req.method!=="POST")return j({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  if(!(await quota(auth.token,"invoice_email")))return j({ok:false,error:"E-mailquotum bereikt. Probeer het later opnieuw."},429);

  let conn:any=null;try{conn=await mailboxConnection(auth.user.id)}catch(e){console.error("mailbox connection",e)}
  if(!conn||conn.provider!=="google"){
    return j({ok:false,error:"Koppel eerst je eigen Gmail bij Instellingen. Facturen worden alleen vanuit de Gmail van de ondernemer verzonden.",code:"GMAIL_NOT_CONNECTED"},409);
  }

  const data=await req.json().catch(()=>null);if(!data)return j({ok:false,error:"INVALID_JSON"},400);
  const to=email(data.to||data.customer?.email);if(!to)return j({ok:false,error:"Ongeldig e-mailadres."},400);if(/@example\.com$/i.test(to))return j({ok:false,error:"Dit is een demo-e-mailadres. Vul een echt klantadres in."},400);
  const subject=safe(data.subject,240).replace(/[\r\n]/g," ").trim(),message=safe(data.message,12000).trim();if(!subject||!message)return j({ok:false,error:"Onderwerp en bericht zijn verplicht."},400);
  const pdf=await pdfBytes(data);const sender=safe(data.company?.emailTemplate?.senderName||data.company?.tradeName||data.company?.name||"Administratie",100).replace(/[<>\r\n"]/g," ");

  try{
    const sent=await sendFromMailbox(conn,auth.user.id,data,to,subject,message,pdf,sender);
    return j({ok:true,id:sent.id||"",sentAt:new Date().toISOString(),provider:"google",from:sent.from,ownMailbox:true});
  }catch(e){
    const code=e instanceof Error?e.message:"MAILBOX_SEND_FAILED";
    console.error("gmail send failed",code);
    if(code==="MAILBOX_REAUTH_REQUIRED")return j({ok:false,error:"Je Gmail-koppeling is verlopen. Koppel Gmail opnieuw bij Instellingen.",code},409);
    if(code==="MAIL_PROVIDER_NOT_CONFIGURED")return j({ok:false,error:"De Gmail-koppeling is nog niet volledig geconfigureerd door Boekuna.",code},503);
    return j({ok:false,error:"Versturen vanuit je eigen Gmail is mislukt. Controleer de Gmail-koppeling bij Instellingen.",code},502);
  }
});
