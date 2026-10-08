// Mandatory invoice content (art. 35a Wet OB 1968, Handelsregisterbesluit art. 20) on every
// invoice output: the print/PDF document (invoiceDocumentHtml) with every optional block
// switched off, and the PDF that is actually shared (send-invoice pdfBytes).
// All companies, customers and numbers are fictional.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { loadApp, loadEdge, financialNames, appSource } from './production-code.mjs';

const money=n=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(Number(n||0));
const num=n=>new Intl.NumberFormat('nl-NL',{maximumFractionDigits:2}).format(Number(n||0));
const dateNL=d=>d?new Intl.DateTimeFormat('nl-NL',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(d+'T12:00:00')):'—';
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const clean=s=>s.replace(/<style[\s\S]*?<\/style>/g,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;| | /g,' ').replace(/\s+/g,' ');
const eur=n=>money(n).replace(/ | /g,' ');

const COMPANY={name:'Voorbeeld Studio B.V.',address:'Fictiefstraat 1',postal:'1234 AB',city:'Voorbeeldstad',country:'Nederland',kvk:'00000000',vat:'NL000000000B00',iban:'NL00TEST0000000000',email:'factuur@voorbeeld.test',kor:false};
const CUSTOMER={id:'c1',name:'Fictieve Klant B.V.',address:'Klantlaan 2',postal:'5678 CD',city:'Klantdorp',vat:'NL999999999B99',email:'klant@voorbeeld.test'};
const WORST_LAYOUT={layout:'modern',accentColor:'#17382f',showVatBreakdown:false,showPaymentBlock:false,showContactDetails:false};
const ORIGINAL={id:'inv-1',number:'2026-0001',kind:'invoice',issueDate:'2026-08-01',supplyDate:'2026-08-01',dueDate:'2026-08-15',status:'sent',taxTreatment:'standard',lines:[{desc:'Advies',qty:2,unit:100,vat:21}],payments:[]};

const app=loadApp([...financialNames,'treatmentNote','invoiceCreditOrigin','invoiceCreditNote','invoiceVatRows','invoiceVatRowLabel','invoiceDocumentHtml','companyRequirementsForInvoice','requirement','invoiceDraftChecks','invoiceFinalChecks','invoiceNumberAvailable'],{money,num,dateNL,esc,Intl});
function setCompany(extra={}){app.state.company={...COMPANY,...extra};app.state.invoices=[ORIGINAL]}
function invoice(extra){return {id:'inv-x',number:'2026-0099',customerId:'c1',kind:'invoice',issueDate:'2026-09-10',supplyDate:'2026-09-08',dueDate:'2026-09-24',status:'sent',taxTreatment:'standard',paymentReference:'',reference:'',payments:[],...extra}}
const html=(i,c=CUSTOMER)=>clean(app.invoiceDocumentHtml(i,c,WORST_LAYOUT));

// Shared PDF (server) with captured text.
const drawn=[];
const {edge}=loadEdge({StandardFonts,rgb,PDFDocument:{async create(){const pdf=await PDFDocument.create();const addPage=pdf.addPage.bind(pdf);pdf.addPage=(...a)=>{const page=addPage(...a.map(x=>Array.isArray(x)?Array.from(x):x)),drawText=page.drawText.bind(page);page.drawText=(t,o)=>{drawn.push(t);return drawText(t,o)};return page};return pdf}}});
async function pdfText(i,extra={}){drawn.length=0;const bytes=await edge.pdfBytes({company:{...app.state.company,invoiceDesign:WORST_LAYOUT},customer:CUSTOMER,invoice:{...i,...extra}});assert.ok(bytes.length>1000);return drawn.join(' | ').replace(/ | /g,' ')}

function mustContainAll(text,tokens,label){for(const t of tokens)assert.ok(text.includes(t),`${label}: missing "${t}"\n${text.slice(0,1500)}`)}
const PARTY_TOKENS=['Voorbeeld Studio B.V.','Fictiefstraat 1','KVK 00000000','Btw-id NL000000000B00','Fictieve Klant B.V.','Klantlaan 2'];

// 1. 21% only.
{
  setCompany();
  const i=invoice({lines:[{desc:'Ontwerp',qty:2,unit:100,vat:21}]});
  const a=html(i),b=await pdfText(i);
  mustContainAll(a,[...PARTY_TOKENS,'2026-0099','Leverdatum','Btw 21% over '+eur(200),eur(42),eur(242),eur(100)],'A 21%');
  mustContainAll(b,[...PARTY_TOKENS,'2026-0099','Leverdatum','Btw 21% over '+eur(200),eur(42),eur(242),'Prijs excl. btw',eur(100)],'B 21%');
}
// 2. 9% only, per-line rounding (allowed when arithmetic and consistent, toelichting Stb. 2004, 267).
{
  setCompany();
  const i=invoice({lines:[{desc:'Boeken',qty:3,unit:19.99,vat:9}]});
  mustContainAll(html(i),['Btw 9% over '+eur(59.97),eur(5.40),eur(65.37)],'A 9%');
  const pinned=invoice({lines:Array.from({length:10},()=>({desc:'Kop koffie',qty:1,unit:2.38,vat:9}))});
  assert.equal(app.invoiceVat(pinned),2.10,'per-line rounding is the pinned rule: 10 × 0,21');
  assert.equal(app.invoiceGross(pinned),25.90);
}
// 3. Mixed 21/9/0: every rate with its base, sums match, no empty rows.
{
  setCompany();
  const i=invoice({lines:[{desc:'Uren',qty:1,unit:99.99,vat:21},{desc:'Boek',qty:1,unit:19.99,vat:9},{desc:'Export',qty:1,unit:10,vat:0}]});
  const rows=app.invoiceVatRows(i);
  assert.equal(JSON.stringify(rows.map(r=>[r.rate,r.base,r.vat])),JSON.stringify([[21,99.99,21],[9,19.99,1.8],[0,10,0]]));
  assert.equal(Math.round(rows.reduce((s,r)=>s+r.base,0)*100)/100,app.invoiceNet(i));
  assert.equal(Math.round((app.invoiceNet(i)+rows.reduce((s,r)=>s+r.vat,0))*100)/100,app.invoiceGross(i));
  const a=html(i),b=await pdfText(i);
  for(const t of ['Btw 21% over '+eur(99.99),'Btw 9% over '+eur(19.99),'Btw 0% over '+eur(10)]){assert.ok(a.includes(t),'A '+t);assert.ok(b.includes(t),'B '+t)}
}
// 4. The old layout switch can no longer hide VAT.
{
  setCompany();
  const i=invoice({lines:[{desc:'Ontwerp',qty:1,unit:500,vat:21}]});
  const off=clean(app.invoiceDocumentHtml(i,CUSTOMER,{...WORST_LAYOUT,showVatBreakdown:false}));
  const on=clean(app.invoiceDocumentHtml(i,CUSTOMER,{...WORST_LAYOUT,showVatBreakdown:true}));
  assert.ok(off.includes('Btw 21% over '+eur(500))&&off.includes(eur(105)),'VAT stays on the invoice with the switch off');
  assert.equal(off,on);
  const settings=fs.readFileSync('kwinest/app-assets/settings-center.js','utf8');
  assert.ok(!settings.includes('invoiceDesign.showVatBreakdown'),'the switch is gone from Instellingen');
}
// 5. KOR: legend, no VAT, no company VAT id needed; VAT lines are refused; KOR with VAT warns.
{
  setCompany({kor:true,vat:''});
  const i=invoice({taxTreatment:'kor',lines:[{desc:'Les',qty:1,unit:60,vat:0}]});
  const a=html(i),b=await pdfText(i);
  for(const t of [a,b]){assert.ok(t.includes('Kleineondernemersregeling (KOR)'));assert.ok(!/Btw \d+% over/.test(t),'no VAT rows under KOR')}
  const ok=app.invoiceFinalChecks({...i,customer:CUSTOMER},'inv-x');
  assert.equal(JSON.stringify(ok.errors.map(e=>e.label)),'[]');
  const bad=app.invoiceFinalChecks({...i,lines:[{desc:'Les',qty:1,unit:60,vat:21}],customer:CUSTOMER},'inv-x');
  assert.ok(bad.errors.some(e=>e.label==='Btw bij bijzondere regeling'));
  const standard=app.invoiceFinalChecks({...i,taxTreatment:'standard',lines:[{desc:'Les',qty:1,unit:60,vat:21}],customer:CUSTOMER},'inv-x');
  assert.ok(standard.warnings.some(w=>w.label==='KOR en btw'),'KOR company charging VAT gets a warning');
}
// 6. Reverse charge: legend and customer VAT id on both outputs; missing customer VAT id blocks.
{
  setCompany();
  const i=invoice({taxTreatment:'reverse',lines:[{desc:'Montage',qty:1,unit:800,vat:0}]});
  for(const t of [html(i),await pdfText(i)])mustContainAll(t,['Btw verlegd','Btw-id NL999999999B99','Btw-id NL000000000B00'],'reverse');
  const r=app.invoiceFinalChecks({...i,customer:{...CUSTOMER,vat:''}},'inv-x');
  assert.ok(r.errors.some(e=>e.label==='Btw-id klant'));
}
// 7. ICP: legend and both VAT ids, no VAT.
{
  setCompany();
  const i=invoice({taxTreatment:'icp',lines:[{desc:'Levering',qty:5,unit:40,vat:0}]});
  for(const t of [html(i),await pdfText(i)]){mustContainAll(t,['Intracommunautaire levering/dienst','Btw-id NL999999999B99','Btw-id NL000000000B00'],'icp');assert.ok(!/Btw \d+% over/.test(t))}
}
// 8. Exempt: legend, no VAT rows, company VAT id not required.
{
  setCompany({vat:''});
  const i=invoice({taxTreatment:'exempt',lines:[{desc:'Bijles',qty:2,unit:45,vat:0}]});
  for(const t of [html(i),await pdfText(i)]){assert.ok(t.includes('Btw-vrijstelling van toepassing'));assert.ok(!/Btw \d+% over/.test(t))}
  assert.ok(app.companyRequirementsForInvoice({taxTreatment:'exempt'}).every(x=>x.ok));
}
// 9. Credit note: refers to the original invoice even without the payment block; negative amounts.
{
  setCompany();
  const credit=invoice({id:'cr-1',number:'2026-0100',kind:'credit',creditFor:'inv-1',reference:'',lines:[{desc:'Advies',qty:2,unit:100,vat:21}]});
  const a=html(credit);
  mustContainAll(a,['CREDITFACTUUR','Creditfactuur voor factuur 2026-0001 van 01 aug 2026','Btw 21% over '+eur(-200),eur(-42),eur(-242)],'A credit');
  assert.ok(a.includes(eur(-200)),'credit line amounts are negative');
  // The app sends the original's number to the server; old clients fall back to the reference.
  const b=await pdfText(credit,{creditForNumber:'2026-0001',creditForDate:'2026-08-01'});
  mustContainAll(b,['CREDITFACTUUR','Creditfactuur voor factuur 2026-0001'],'B credit');
  const fallback=await pdfText({...credit,reference:'Credit op 2026-0001'});
  assert.ok(fallback.includes('Creditfactuur · Credit op 2026-0001'));
  const orphan=app.invoiceFinalChecks({...credit,creditFor:'missing',customer:CUSTOMER},'cr-1');
  assert.ok(orphan.errors.some(e=>e.label==='Originele factuur'),'a credit note without its original invoice is blocked');
  app.state.invoices=[ORIGINAL,{...credit}];
  const fromForm=app.invoiceFinalChecks({number:'2026-0100',customerId:'c1',customer:CUSTOMER,issueDate:'2026-09-10',supplyDate:'2026-09-10',dueDate:'2026-09-10',taxTreatment:'standard',paymentReference:'x',lines:credit.lines},'cr-1');
  assert.ok(!fromForm.errors.some(e=>e.label==='Originele factuur'),'editing a linked credit note passes');
}
// 10. Discount: discount row and bases after the allocated discount, sums consistent.
{
  setCompany();
  const i=invoice({discountType:'percent',discountValue:10,lines:[{desc:'Uren',qty:3,unit:33.33,vat:21},{desc:'Boek',qty:1,unit:10,vat:9}]});
  const rows=app.invoiceVatRows(i);
  assert.equal(Math.round(rows.reduce((s,r)=>s+r.base,0)*100)/100,app.invoiceNet(i));
  const a=html(i),b=await pdfText(i);
  mustContainAll(a,['Korting','Btw 21% over '+eur(rows[0].base),'Btw 9% over '+eur(rows[1].base)],'A discount');
  mustContainAll(b,['Korting','Btw 21% over '+eur(rows[0].base),'Btw 9% over '+eur(rows[1].base)],'B discount');
}
// 11. Imported mixed-rate invoice without a VAT split shows the original VAT, never a fake 0%.
{
  setCompany();
  const i=invoice({importedTotals:{net:100,vat:15,gross:115},lines:[{desc:'Geïmporteerde factuur',qty:1,unit:100,vat:0}]});
  const a=html(i);
  assert.ok(a.includes('Btw (volgens origineel document)')&&a.includes(eur(15)));
  assert.ok(!a.includes('Btw 0% over'));
}
// 12. KVK required for Dutch companies however the country is written.
for(const country of ['Nederland','NL','Netherlands']){
  setCompany({country,kvk:''});
  assert.ok(app.companyRequirementsForInvoice({taxTreatment:'standard'}).some(x=>x.key==='kvk'&&!x.ok),'KVK required for '+country);
}
// 13. Legends are the same text in the app and on the shared PDF.
{
  const edgeSource=fs.readFileSync('supabase/functions/send-invoice/index.ts','utf8');
  for(const key of ['reverse','icp','exempt','kor'])assert.ok(edgeSource.includes(JSON.stringify(app.treatmentNote(key))),'shared PDF legend for '+key);
  assert.ok(appSource.includes("invoice:invoiceWithCreditOrigin(invoice)"),'the app sends the original invoice number for credit notes');
}
console.log('Invoice legal content (print/PDF and shared PDF): PASS');
