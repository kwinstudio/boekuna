import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const ALLOWED_ORIGINS=new Set([
  "https://app.boekuna.nl",
  "https://boekuna-boekhouding.onrender.com",
  "https://boekuna.nl",
  "https://www.boekuna.nl",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);
const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const cors=(req:Request)=>{
  const origin=req.headers.get("origin")||"";
  return {
    ...(ALLOWED_ORIGINS.has(origin)?{"access-control-allow-origin":origin}:{}),
    "access-control-allow-methods":"GET,POST,OPTIONS",
    "access-control-allow-headers":"authorization,apikey,content-type",
    "vary":"Origin"
  };
};
const j=(req:Request,body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"content-type":"application/json","cache-control":"no-store"}});
const safe=(v:any,n=500)=>String(v??"").slice(0,n);
const email=(v:any)=>{const s=safe(v,240).trim();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)?s:""};
const num=(v:any)=>Number.isFinite(Number(v))?Number(v):0;
const money=(v:any)=>new Intl.NumberFormat("nl-NL",{style:"currency",currency:"EUR"}).format(num(v));
const dateNL=(v:any)=>{if(!v)return "—";try{return new Intl.DateTimeFormat("nl-NL",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(String(v)+"T12:00:00"))}catch{return safe(v,40)}};

function pdfFilename(data:any){
  const invoice=data?.invoice||{},customer=data?.customer||{};
  const clean=(value:any,max=72)=>String(value??"")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\./g,"").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").replace(/-+/g,"-").slice(0,max);
  const label=invoice.kind==="credit"?"Creditnota":"Factuur";
  const number=clean(invoice.number,80)||"zonder-nummer";
  const party=clean(customer.name,72);
  return [label,number,party].filter(Boolean).join("-")+".pdf";
}

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
  const sourceVatLines=Array.isArray(invoice?.vatLines)?invoice.vatLines:[];
  let vatGroups:any[]=[];
  if(sourceVatLines.length){
    vatGroups=sourceVatLines.map((v:any)=>({
      rate:num(v.rate),taxable:roundMoney(num(v.taxableAmount??v.net??0)*sign),vat:roundMoney(num(v.vatAmount??v.vat??0)*sign)
    }));
  }else if(!zeroVatTreatment(taxTreatment(invoice))){
    const groups=new Map<number,{rate:number,taxable:number,vat:number}>();
    for(const line of lines){
      const rate=num(line?.vat),current=groups.get(rate)||{rate,taxable:0,vat:0};
      current.taxable=roundMoney(current.taxable+discountedLineNet(invoice,line)*sign);
      current.vat=roundMoney(current.vat+discountedLineVat(invoice,line)*sign);
      groups.set(rate,current);
    }
    vatGroups=[...groups.values()].sort((a,b)=>a.rate-b.rate);
  }
  return {lines,net,vat,gross,paid,outstanding:Math.max(0,roundMoney(Math.abs(gross)-paid)),sign,discount:discountAmount(invoice),vatGroups};
}
// Same legends as treatmentNote() in the app (tests/invoice-legal-content.test.mjs keeps them equal).
const TREATMENT_NOTES:Record<string,string>={
  reverse:"Btw verlegd",
  icp:"Intracommunautaire levering/dienst · 0% btw",
  exempt:"Btw-vrijstelling van toepassing",
  kor:"Kleineondernemersregeling (KOR) · geen btw in rekening gebracht"
};
function creditNote(invoice:any){
  if(invoice?.kind!=="credit")return "";
  const number=safe(invoice?.creditForNumber,80).trim();
  if(number)return "Creditfactuur voor factuur "+number+(invoice?.creditForDate?" van "+dateNL(invoice.creditForDate):"");
  const reference=safe(invoice?.reference,160).trim();
  return reference?"Creditfactuur · "+reference:"";
}
function wrapText(value:string,font:any,size:number,width:number){
  const words=safe(value,2000).replace(/\s+/g," ").trim().split(" ");
  const lines:string[]=[];let current="";
  for(const word of words){
    const next=current?current+" "+word:word;
    if(current&&font.widthOfTextAtSize(next,size)>width){lines.push(current);current=word}else current=next;
  }
  if(current)lines.push(current);
  return lines.length?lines:[""];
}
async function pdfBytes(data:any){
  const {company={},customer={},invoice={}}=data; const c=calc(invoice);
  const pdf=await PDFDocument.create(); const regular=await pdf.embedFont(StandardFonts.Helvetica); const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const accentHex=String(company?.invoiceDesign?.accentColor||"#17382f").replace("#","");
  const ar=parseInt(accentHex.slice(0,2)||"17",16)/255,ag=parseInt(accentHex.slice(2,4)||"38",16)/255,ab=parseInt(accentHex.slice(4,6)||"2f",16)/255;
  const accent=rgb(ar,ag,ab), ink=rgb(.09,.14,.12), muted=rgb(.4,.46,.43);
  const zeroVat=zeroVatTreatment(taxTreatment(invoice));
  let page=pdf.addPage([595.28,841.89]); let y=790;
  const text=(t:string,x:number,yy:number,size=10,font=regular,color=ink)=>page.drawText(safe(t,1000),{x,y:yy,size,font,color,maxWidth:500});
  const right=(t:string,xRight:number,yy:number,size=9,font=regular,color=ink)=>{const v=safe(t,200);page.drawText(v,{x:xRight-font.widthOfTextAtSize(v,size),y:yy,size,font,color})};
  const newPage=()=>{page=pdf.addPage([595.28,841.89]);y=790};
  const tableHeader=()=>{text("Omschrijving",46,y,8,bold,muted);text("Aantal",300,y,8,bold,muted);right("Prijs excl. btw",425,y,8,bold,muted);right("Btw",465,y,8,bold,muted);right("Bedrag",549,y,8,bold,muted);page.drawLine({start:{x:46,y:y-10},end:{x:549,y:y-10},thickness:1,color:accent});y-=30;};
  text(safe(company.tradeName||company.name,120).toUpperCase(),46,y,9,bold,accent); text(invoice.kind==="credit"?"CREDITFACTUUR":"FACTUUR",46,y-34,26,bold,ink);
  text(safe(invoice.number,80),410,y,12,bold,ink); text("Factuurdatum "+dateNL(invoice.issueDate),410,y-18,8,regular,muted);text("Leverdatum "+dateNL(invoice.supplyDate||invoice.issueDate),410,y-32,8,regular,muted);text("Vervaldatum "+dateNL(invoice.dueDate),410,y-46,8,regular,muted);
  page.drawLine({start:{x:46,y:y-58},end:{x:549,y:y-58},thickness:1.5,color:accent}); y-=88;
  const party=(label:string,x:number,p:any)=>{
    let yy=y;text(label,x,yy,7,bold,muted);yy-=17;text(safe(p.name,120),x,yy,10,bold);yy-=17;
    for(const lineText of [safe(p.address,120),(safe(p.postal,30)+" "+safe(p.city,80)).trim(),p.kvk?"KVK "+safe(p.kvk,30):"",p.vat?"Btw-id "+safe(p.vat,40):""]){if(!lineText)continue;text(lineText,x,yy,9);yy-=14}
    return yy;
  };
  y=Math.min(party("VAN",46,company),party("FACTUUR AAN",310,customer))-16;
  const legend=[creditNote(invoice),TREATMENT_NOTES[taxTreatment(invoice)]||""].filter(Boolean);
  tableHeader();
  for(const l of c.lines){
    const descLines=wrapText(String(l.desc||""),regular,9,240);
    if(y-descLines.length*12<170){newPage();tableHeader()}
    descLines.forEach((d,index)=>text(d,46,y-index*12,9,regular));
    text(String(num(l.qty)),300,y,9); right(money(num(l.unit)),425,y,9); right(zeroVat?"0%":String(num(l.vat))+"%",465,y,9); right(money(discountedLineNet(invoice,l)*c.sign),549,y,9,bold);
    y-=Math.max(24,descLines.length*12+12);
  }
  const vatGroups=zeroVat?[]:(c.vatGroups||[]).filter((g:any)=>Math.abs(g.taxable)>0.004||Math.abs(g.vat)>0.004);
  if(y<190+vatGroups.length*18+legend.length*14){newPage()}
  y-=10; page.drawLine({start:{x:330,y:y+8},end:{x:549,y:y+8},thickness:.7,color:rgb(.85,.88,.86)});
  text(c.discount>0?"Subtotaal na korting":"Subtotaal excl. btw",330,y,9,regular,muted); right(money(c.net),549,y,9,bold); y-=20;
  if(c.discount>0){text("Korting (inbegrepen)",330,y,9,regular,muted); right(money(c.discount),549,y,9,bold); y-=20;}
  if(vatGroups.length){
    for(const group of vatGroups){text("Btw "+String(num(group.rate))+"% over "+money(group.taxable),330,y,9,regular,muted);right(money(group.vat),549,y,9,bold);y-=18}
  }else if(!zeroVat&&Math.abs(c.vat)>0.004){
    text("Btw",330,y,9,regular,muted); right(money(c.vat),549,y,9,bold); y-=20;
  }
  text(invoice.kind==="credit"?"Totaal credit":"Totaal",330,y,11,bold,ink); right(money(c.gross),549,y,11,bold,ink); y-=30;
  for(const line of legend){text(line,46,y,9,bold,ink);y-=14}
  if(legend.length)y-=8;
  if(company?.invoiceDesign?.showPaymentBlock!==false){
    page.drawRectangle({x:46,y:y-54,width:503,height:54,color:accent});
    text(invoice.kind==="credit"?"CREDIT / VERREKENING":"BETALEN AAN",58,y-17,7,bold,rgb(1,1,1));
    text(invoice.kind==="credit"?"Wordt verrekend of terugbetaald":safe(company.iban,80),58,y-34,10,bold,rgb(1,1,1));
    text("REFERENTIE",330,y-17,7,bold,rgb(1,1,1)); text(safe(invoice.paymentReference||invoice.number,80),330,y-34,10,bold,rgb(1,1,1));
  }
  const footer=[safe(company.name,120),company.kvk?"KVK "+safe(company.kvk,30):"",company.vat?"Btw-id "+safe(company.vat,40):""].filter(Boolean).join(" · ");
  const pages=pdf.getPages();
  pages.forEach((p:any,i:number)=>{p.drawText(footer,{x:46,y:40,size:7,font:regular,color:muted,maxWidth:500});p.drawText("Pagina "+String(i+1)+" / "+String(pages.length),{x:46,y:28,size:7,font:regular,color:muted})});
  return await pdf.save();
}
function htmlMail(data:any){
  const {company={},customer={},invoice={},subject="",message=""}=data;const c=calc(invoice);
  const accent=String(company?.emailTemplate?.accentColor||"#17382f");
  const esc=(s:any)=>safe(s,12000).replace(/[&<>"']/g,(x)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]||x));
  return `<!doctype html><html><body style="margin:0;background:#f2f4f3;font-family:Arial,sans-serif;color:#1c2924"><div style="padding:30px 14px"><div style="max-width:640px;margin:auto;background:#fff;border:1px solid #e0e6e3;border-radius:16px;overflow:hidden"><div style="height:7px;background:${accent}"></div><div style="padding:30px"><div style="font-size:12px;color:${accent};font-weight:700;text-transform:uppercase">${esc(company?.emailTemplate?.senderName||company.tradeName||company.name||"Administratie")}</div><h1 style="font-size:22px;margin:7px 0 22px">${esc(subject)}</h1><div style="font-size:15px;line-height:1.7">${esc(message).replace(/\n/g,"<br>")}</div><div style="margin-top:24px;border:1px solid #e1e7e4;border-radius:12px;padding:16px"><b>${esc(invoice.number)}</b><div style="margin-top:8px">Klant: ${esc(customer.name)}</div><div>Bedrag: <b>${esc(money(c.gross))}</b></div><div>Vervaldatum: ${esc(dateNL(invoice.dueDate))}</div></div></div></div></div></body></html>`;
}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin")||"";
  if(origin && !ALLOWED_ORIGINS.has(origin))return j(req,{ok:false,error:"ORIGIN_NOT_ALLOWED"},403);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  const auth=await userFrom(req);if(!auth)return j(req,{ok:false,error:"UNAUTHORIZED"},401);

  if(req.method==="GET"){
    return j(req,{ok:true,configured:false,ownMailbox:false,disabled:true,delivery:"native-email-app"});
  }

  if(req.method!=="POST")return j(req,{ok:false,error:"METHOD_NOT_ALLOWED"},405);
  const data=await req.json().catch(()=>null);if(!data)return j(req,{ok:false,error:"INVALID_JSON"},400);

  if(data.action==="render_pdf"){
    const invoice=data.invoice||{};
    if(!invoice.id||!String(invoice.number||"").trim()||invoice.status==="draft"||(invoice.numberManaged&&!invoice.numberFinalized)){
      return j(req,{ok:false,error:"De factuur moet definitief zijn voordat je haar kunt delen.",code:"INVOICE_NOT_FINAL"},409);
    }
    try{
      const pdf=await pdfBytes(data);
      return new Response(pdf,{status:200,headers:{
        ...cors(req),
        "content-type":"application/pdf",
        "content-disposition":`attachment; filename="${pdfFilename(data)}"`,
        "cache-control":"no-store",
        "x-content-type-options":"nosniff"
      }});
    }catch(e){
      console.error("invoice pdf render failed",e instanceof Error?e.message:"PDF_RENDER_FAILED");
      return j(req,{ok:false,error:"De definitieve factuur-PDF kon niet worden gemaakt.",code:"PDF_RENDER_FAILED"},500);
    }
  }

  // Direct mailbox delivery is deliberately disabled. The supported product
  // path is authenticated PDF rendering followed by a user-controlled email-app handoff.
  return j(req,{ok:false,error:"Mailboxverzending is uitgeschakeld. Gebruik Versturen via e-mail in Boekuna.",code:"MAILBOX_SEND_DISABLED"},410);
});
