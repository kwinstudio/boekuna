import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { loadEdge } from './production-code.mjs';

const drawn=[];
const mockClient={auth:{getUser:async()=>({data:{user:{id:'qa'}},error:null})},rpc:async()=>({data:null,error:null})};
const {edge}=loadEdge({
  StandardFonts,rgb,
  PDFDocument:{async create(){const pdf=await PDFDocument.create();const add=pdf.addPage.bind(pdf);pdf.addPage=(...args)=>{const p=add(...args.map(a=>Array.isArray(a)?Array.from(a):a)),draw=p.drawText.bind(p);p.drawText=(t,o)=>{drawn.push(String(t));return draw(t,o)};return p};return pdf}},
  Deno:{serve:()=>{},env:{get:key=>({SUPABASE_URL:'https://test.invalid',SUPABASE_ANON_KEY:'x',SUPABASE_SERVICE_ROLE_KEY:'y'})[key]}},
  createClient:()=>mockClient,
  fetch:async()=>new Response('{}',{status:500})
});

drawn.length=0;
const mixedInvoice={id:'m',number:'MIX-1',kind:'invoice',taxTreatment:'standard',issueDate:'2026-09-29',dueDate:'2026-10-13',paymentReference:'REF-MIX',lines:[{qty:1,unit:100,vat:9,desc:'Café & Müller'},{qty:1,unit:100,vat:21,desc:"Diensten ë é 'test'"}],vatLines:[{rate:9,taxableAmount:100,vatAmount:9},{rate:21,taxableAmount:100,vatAmount:21}],payments:[]};
const mixedPdf=await edge.pdfBytes({invoice:mixedInvoice,company:{name:'Müller & Zonen B.V.',tradeName:'Müller',iban:'NL91ABNA0417164300',address:'Straat 1',postal:'1000AA',city:'Amsterdam'},customer:{name:"Café d'Été & Co",address:'Kade 2',postal:'2000BB',city:'Utrecht'}});
const loaded=await PDFDocument.load(mixedPdf);
assert.equal(loaded.getPageCount(),1);
const size=loaded.getPage(0).getSize();
assert.ok(Math.abs(size.width-595.28)<0.1&&Math.abs(size.height-841.89)<0.1,'A4 dimensions');
assert.ok(drawn.includes('Vervaldatum 13-10-2026'));
assert.ok(drawn.includes('REF-MIX'));
assert.ok(drawn.some(x=>x.startsWith('Btw 9% over ')));
assert.ok(drawn.some(x=>x.startsWith('Btw 21% over ')));
assert.ok(drawn.includes('Café & Müller'));
assert.ok(drawn.includes("Diensten ë é 'test'"));
assert.ok(drawn.includes('Pagina 1 / 1'));

drawn.length=0;
const longInvoice={id:'long',number:'LONG-1',kind:'invoice',taxTreatment:'standard',issueDate:'2026-09-29',dueDate:'2026-10-13',paymentReference:'LONG',lines:Array.from({length:55},(_,i)=>({qty:1,unit:10+i/100,vat:i%2?9:21,desc:'Lange regel '+(i+1)+' Café Müller met extra omschrijving'})),payments:[]};
const longPdf=await edge.pdfBytes({invoice:longInvoice,company:{name:'Een zeer lange bedrijfsnaam voor regressietest B.V.',iban:'NL91ABNA0417164300'},customer:{name:'Ook een bijzonder lange klantnaam voor de regressietest B.V.'}});
const longLoaded=await PDFDocument.load(longPdf);
assert.ok(longLoaded.getPageCount()>1,'55 lines must paginate');
assert.ok(drawn.filter(x=>x==='Omschrijving').length>=2,'table header repeats');
for(let i=1;i<=longLoaded.getPageCount();i++)assert.ok(drawn.includes('Pagina '+i+' / '+longLoaded.getPageCount()),'page numbering '+i);

console.log('03A PR59 PDF QA: PASS',JSON.stringify({mixed_pages:loaded.getPageCount(),long_pages:longLoaded.getPageCount(),headers:drawn.filter(x=>x==='Omschrijving').length}));
