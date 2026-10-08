// The rounding fix (0.835 is 84 cents, not 83) must not move a cent on invoices that were already final before it:
// their total was sent to the customer, paid and declared. On the first load after the fix those invoices, and the
// credit notes made for them, keep the old rounding; drafts, copies and new invoices use the new rounding.
// (release audit 2026-10-08). The app page runs without login; nothing leaves the browser.
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {loadEdge} from './production-code.mjs';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
function replaceLast(source,needle,replacement){const i=source.lastIndexOf(needle);if(i<0)throw new Error('Missing '+needle);return source.slice(0,i)+replacement+source.slice(i+needle.length)}
// Start the page without signing in: these checks only call the bookkeeping functions.
const html=replaceLast(original,'initAuth();','window.__ready=true;');

// 22,50 at 21% is 4,725 btw: 4,73 with the new rounding, 4,72 as it was sent before. With 12,45 at 9% (1,12)
// the invoice was 40,79 and the customer paid 40,79.
const lines=[{desc:'Advies',qty:1,unit:22.5,vat:21},{desc:'Boek',qty:1,unit:12.45,vat:9}];
const invoice=(id,extra)=>({id,number:id.toUpperCase(),customerId:'c1',issueDate:'2026-09-01',supplyDate:'2026-09-01',dueDate:'2026-09-15',lines:structuredClone(lines),payments:[],...extra});
const before={
  meta:{nextInvoice:5},
  company:{name:'QA Testbedrijf'},
  contacts:[{id:'c1',name:'Klant BV'}],
  invoices:[
    invoice('paid',{status:'sent',payments:[{id:'p1',date:'2026-09-10',amount:40.79,method:'bank'}]}),
    invoice('open',{status:'sent'}),
    invoice('paidnopayment',{status:'paid',paidDate:'2026-09-12'}),
    invoice('draft',{status:'draft'})
  ]
};

const server=http.createServer((req,res)=>{
  if((req.url||'').split('?')[0]==='/app'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(html)}
  res.writeHead(404);res.end('');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
const pageErrors=[];
try{
  const page=await browser.newPage();
  page.on('pageerror',e=>pageErrors.push(String(e)));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/app`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__ready===true);

  const result=await page.evaluate(before=>{
    const amounts=i=>({gross:invoiceGross(i),vat:invoiceVat(i),net:invoiceNet(i),outstanding:invoiceOutstanding(i),vats:invoiceVatBreakdown(i),rounding:i.rounding});
    state=normalizeState(structuredClone(before));
    const find=id=>state.invoices.find(i=>i.id===id);
    const out={meta:state.meta.decimalRounding,paid:amounts(find('paid')),open:amounts(find('open')),draft:amounts(find('draft')),
      impliedPayment:find('paidnopayment').payments.map(p=>p.amount),paidNoPayment:amounts(find('paidnopayment'))};
    // A second load changes nothing.
    state=normalizeState(JSON.parse(JSON.stringify(state)));
    out.reload={paid:amounts(find('paid')),draft:amounts(find('draft'))};
    // Credit the unpaid legacy invoice in full: the credit uses the same cents, so both end at zero.
    const credit=createFullCreditDraft(find('open'),'QA credit');
    out.creditDraft=amounts(credit);
    Object.assign(credit,{status:'sent',number:'CR-QA-1',numberFinalized:true});
    out.creditFinal=amounts(credit);out.openAfterCredit=amounts(find('open'));
    // A copy of an old invoice is a new invoice: it gets the new rounding.
    try{duplicateInvoiceAsDraft('paid')}catch(e){}
    const copy=state.invoices.find(i=>i.status==='draft'&&i.id!=='draft'&&i.kind!=='credit');
    out.copy=copy?amounts(copy):null;
    // After the change: a new final invoice has no marker and uses the new rounding, also after a reload.
    state.invoices.push({...structuredClone(find('draft')),id:'new',number:'NEW',status:'sent'});
    state=normalizeState(JSON.parse(JSON.stringify(state)));
    out.newFinal=amounts(find('new'));
    return out;
  },before);

  assert.equal(result.meta,true,'the change is recorded once');
  // Old final invoices keep what was sent, paid and declared.
  assert.deepEqual(result.paid,{gross:40.79,vat:5.84,net:34.95,outstanding:0,vats:{9:1.12,21:4.72},rounding:'legacy'},'old paid invoice keeps its total and btw');
  assert.deepEqual(result.open,{gross:40.79,vat:5.84,net:34.95,outstanding:40.79,vats:{9:1.12,21:4.72},rounding:'legacy'},'old open invoice keeps its total');
  assert.deepEqual(result.impliedPayment,[40.79],'an old invoice marked paid gets the payment it was paid with');
  assert.equal(result.paidNoPayment.outstanding,0);
  assert.deepEqual(result.reload,{paid:result.paid,draft:result.draft},'a second load changes nothing');
  // Drafts were never sent: they use the new rounding.
  assert.deepEqual(result.draft,{gross:40.8,vat:5.85,net:34.95,outstanding:40.8,vats:{9:1.12,21:4.73},rounding:undefined},'a draft uses the new rounding');
  // The credit note of an old invoice credits exactly the old total.
  assert.equal(result.creditDraft.rounding,'legacy');
  assert.equal(result.creditDraft.gross,-40.79);
  assert.deepEqual(result.creditFinal.vats,{9:-1.12,21:-4.72},'the credit corrects exactly the btw that was declared');
  assert.equal(result.creditFinal.outstanding,0,'nothing stays open on the credit note');
  assert.equal(result.openAfterCredit.outstanding,0,'the credited invoice is settled');
  assert.ok(result.copy,'a copy was made');
  assert.equal(result.copy.rounding,undefined,'a copy does not inherit the old rounding');
  assert.equal(result.copy.gross,40.8);
  assert.equal(result.newFinal.rounding,undefined,'a new final invoice is not marked as old');
  assert.equal(result.newFinal.gross,40.8);
  assert.deepEqual(pageErrors,[]);

  // The PDF and mail from send-invoice show the same amounts as the app.
  const {edge}=loadEdge();
  const legacy=edge.calc({lines,rounding:'legacy'}),current=edge.calc({lines});
  assert.equal(legacy.gross,40.79,'send-invoice: old invoice total');
  assert.equal(legacy.vat,5.84);
  assert.equal(current.gross,40.8,'send-invoice: new invoice total');
  assert.equal(current.vat,5.85);
  assert.equal(edge.calc({lines:[{qty:1,unit:0.835,vat:0}]}).gross,0.84,'send-invoice: new rounding after an old invoice');
  console.log('Old final invoices keep their amounts after the rounding fix (app and send-invoice): PASS');
}finally{await browser.close();await new Promise(r=>server.close(r))}
