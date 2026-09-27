import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');

function replaceLast(source,needle,replacement){
  const i=source.lastIndexOf(needle);
  if(i<0)throw new Error('Missing bootstrap marker: '+needle);
  return source.slice(0,i)+replacement+source.slice(i+needle.length);
}

let appHtml=original.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
appHtml=replaceLast(appHtml,'initAuth();',String.raw`
currentUser=TEST_USER;
const stored=localStorage.getItem(userDataKey());
if(stored){
  state=normalizeState(JSON.parse(stored));
}else{
  state=structuredClone(DEFAULT);
  for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
  state.company={...state.company,name:'Invoice Status QA BV',tradeName:'Invoice QA',contactName:'QA',email:'qa@example.test',phone:'0101234567',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',invoicePrefix:(new Date().getFullYear()+'-'),paymentDays:14,kor:false};
  state.contacts=[{id:'c1',type:'customer',name:'Zelfde Klant BV',contactPerson:'QA Contact',email:'klant@example.test',address:'Klantstraat 2',postal:'3012BB',city:'Rotterdam',vat:'NL100000001B01'}];
  state.meta.nextInvoice=5;
  localStorage.setItem(userDataKey(),JSON.stringify(state));
}
enterApp();
`);

const server=http.createServer((req,res)=>{
  if(req.url?.startsWith('/manifest.webmanifest')){res.writeHead(200,{'content-type':'application/manifest+json'});return res.end('{}')}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(appHtml);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {port}=server.address();
const base=`http://127.0.0.1:${port}`;

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(String(e)));

async function createDraft({label,status='draft'}={}){
  await page.evaluate(()=>newInvoice());
  await page.locator('#invoiceForm [name="customerId"]').selectOption('c1');
  await page.locator('#invoiceForm [name="status"]').selectOption(status);
  await page.locator('#invoiceLines [data-k="desc"]').fill(label||'QA werkzaamheden');
  await page.locator('#invoiceLines [data-k="qty"]').fill('1');
  await page.locator('#invoiceLines [data-k="unit"]').fill('100');
  await page.locator('#invoiceLines [data-k="vat"]').selectOption('21');
  await page.evaluate(()=>{updateInvoiceCustomer();calcInvoiceForm();updateInvoiceCheck()});
  const conceptNumber=await page.locator('#invoiceForm [name="number"]').inputValue();
  await page.evaluate(()=>reviewInvoice());
  await page.getByRole('heading',{name:status==='draft'?'Concept opslaan':'Laatste controle vóór opslaan'}).waitFor();
  await page.evaluate(()=>finalSaveInvoice());
  await page.waitForTimeout(20);
  return {conceptNumber,id:await page.evaluate(()=>state.invoices[0].id),number:await page.evaluate(()=>state.invoices[0].number)};
}

async function editDraftAndSave(id,status){
  await page.evaluate(id=>editInvoice(id),id);
  await page.locator('#invoiceForm').waitFor();
  if(status)await page.locator('#invoiceForm [name="status"]').selectOption(status);
  await page.evaluate(()=>reviewInvoice());
  await page.getByRole('heading',{name:'Laatste controle vóór opslaan'}).waitFor();
  await page.evaluate(()=>finalSaveInvoice());
  await page.waitForTimeout(20);
}

try{
  await page.goto(base+'/app',{waitUntil:'domcontentloaded'});

  // 1. Existing finalized-number draft reproduces the production edge case.
  const currentYear=await page.evaluate(()=>new Date().getFullYear());
  const finalizedDraftId='existing-finalized-draft';
  await page.evaluate(({id,year})=>{
    state.meta.nextInvoice=6;
    state.invoices=[{
      id,number:year+'-0005',numberManaged:true,numberFinalized:true,kind:'invoice',
      customerId:'c1',issueDate:today(),supplyDate:today(),dueDate:today(),
      paymentDays:14,status:'draft',taxTreatment:'standard',reference:'',
      paymentReference:year+'-0005',discountType:'none',discountValue:0,notes:'',
      payments:[],lines:[{desc:'Bestaande factuur',qty:1,unit:100,vat:21,unitLabel:'stuk'}]
    }];
    localStorage.setItem(userDataKey(),JSON.stringify(state));
    navigate('invoices');
  },{id:finalizedDraftId,year:currentYear});

  const beforeFinalized=await page.evaluate(id=>({count:state.invoices.length,id:state.invoices[0].id,number:state.invoices[0].number,next:state.meta.nextInvoice,status:state.invoices[0].status}),finalizedDraftId);
  await editDraftAndSave(finalizedDraftId,'paid');
  const afterFinalized=await page.evaluate(id=>{
    const i=state.invoices.find(x=>x.id===id);
    return {count:state.invoices.length,id:i?.id,number:i?.number,next:state.meta.nextInvoice,status:i?.status};
  },finalizedDraftId);
  assert.deepEqual(afterFinalized,{
    count:beforeFinalized.count,
    id:beforeFinalized.id,
    number:beforeFinalized.number,
    next:beforeFinalized.next,
    status:'paid'
  },'Finalized-number draft -> paid must update the same record without reserving a new number');

  // 2. Existing draft save without status change keeps identity and concept number.
  const unfinalizedId='existing-concept';
  await page.evaluate(id=>{
    state.invoices.unshift({
      id,number:'CONCEPT-EXISTING',numberManaged:true,numberFinalized:false,kind:'invoice',
      customerId:'c1',issueDate:today(),supplyDate:today(),dueDate:today(),
      paymentDays:14,status:'draft',taxTreatment:'standard',reference:'',
      paymentReference:'CONCEPT-EXISTING',discountType:'none',discountValue:0,notes:'',
      payments:[],lines:[{desc:'Concept blijft concept',qty:1,unit:50,vat:21,unitLabel:'stuk'}]
    });
    localStorage.setItem(userDataKey(),JSON.stringify(state));
    navigate('invoices');
  },unfinalizedId);
  const beforeDraft=await page.evaluate(id=>{const i=state.invoices.find(x=>x.id===id);return {count:state.invoices.length,number:i.number,next:state.meta.nextInvoice}},unfinalizedId);
  await editDraftAndSave(unfinalizedId,'draft');
  const afterDraft=await page.evaluate(id=>{const i=state.invoices.find(x=>x.id===id);return {count:state.invoices.length,id:i.id,number:i.number,next:state.meta.nextInvoice,status:i.status}},unfinalizedId);
  assert.equal(afterDraft.count,beforeDraft.count);
  assert.equal(afterDraft.id,unfinalizedId);
  assert.equal(afterDraft.number,beforeDraft.number);
  assert.equal(afterDraft.next,beforeDraft.next);
  assert.equal(afterDraft.status,'draft');

  // 3. Concept -> sent reserves exactly one new number and keeps the invoice ID.
  const conceptToSentId='concept-to-sent';
  await page.evaluate(id=>{
    state.invoices.unshift({
      id,number:'CONCEPT-TO-SENT',numberManaged:true,numberFinalized:false,kind:'invoice',
      customerId:'c1',issueDate:today(),supplyDate:today(),dueDate:today(),
      paymentDays:14,status:'draft',taxTreatment:'standard',reference:'',
      paymentReference:'CONCEPT-TO-SENT',discountType:'none',discountValue:0,notes:'',
      payments:[],lines:[{desc:'Naar verzonden',qty:1,unit:75,vat:21,unitLabel:'stuk'}]
    });
    localStorage.setItem(userDataKey(),JSON.stringify(state));
    navigate('invoices');
  },conceptToSentId);
  const nextBeforeSent=await page.evaluate(()=>state.meta.nextInvoice);
  await editDraftAndSave(conceptToSentId,'sent');
  const sentResult=await page.evaluate(id=>{const i=state.invoices.find(x=>x.id===id);return {id:i.id,number:i.number,status:i.status,finalized:i.numberFinalized,next:state.meta.nextInvoice}},conceptToSentId);
  assert.equal(sentResult.id,conceptToSentId);
  assert.equal(sentResult.status,'sent');
  assert.equal(sentResult.finalized,true);
  assert.equal(sentResult.next,nextBeforeSent+1);
  assert.ok(!sentResult.number.startsWith('CONCEPT-'));

  // 4. Concept -> paid also reserves once, not twice, and keeps identity.
  const conceptToPaidId='concept-to-paid';
  await page.evaluate(id=>{
    state.invoices.unshift({
      id,number:'CONCEPT-TO-PAID',numberManaged:true,numberFinalized:false,kind:'invoice',
      customerId:'c1',issueDate:today(),supplyDate:today(),dueDate:today(),
      paymentDays:14,status:'draft',taxTreatment:'standard',reference:'',
      paymentReference:'CONCEPT-TO-PAID',discountType:'none',discountValue:0,notes:'',
      payments:[],lines:[{desc:'Direct betaald',qty:1,unit:80,vat:21,unitLabel:'stuk'}]
    });
    localStorage.setItem(userDataKey(),JSON.stringify(state));
    navigate('invoices');
  },conceptToPaidId);
  const nextBeforePaid=await page.evaluate(()=>state.meta.nextInvoice);
  await editDraftAndSave(conceptToPaidId,'paid');
  const paidDirect=await page.evaluate(id=>{const i=state.invoices.find(x=>x.id===id);return {id:i.id,number:i.number,status:i.status,finalized:i.numberFinalized,next:state.meta.nextInvoice}},conceptToPaidId);
  assert.equal(paidDirect.id,conceptToPaidId);
  assert.equal(paidDirect.status,'paid');
  assert.equal(paidDirect.finalized,true);
  assert.equal(paidDirect.next,nextBeforePaid+1);

  // 5. Sent/open -> paid follows the supported payment-registration workflow; ID/number stay stable.
  const sentId=conceptToSentId;
  const sentBeforePayment=await page.evaluate(id=>{const i=state.invoices.find(x=>x.id===id);return {id:i.id,number:i.number,count:state.invoices.length}},sentId);
  await page.evaluate(id=>registerPayment(id),sentId);
  await page.locator('#paymentForm [name="amount"]').fill('90.75');
  await page.evaluate(id=>savePayment(id),sentId);
  const sentAfterPayment=await page.evaluate(id=>{const i=state.invoices.find(x=>x.id===id);return {id:i.id,number:i.number,count:state.invoices.length,status:i.status,effective:invoiceEffectiveStatus(i),outstanding:invoiceOutstanding(i)}},sentId);
  assert.equal(sentAfterPayment.id,sentBeforePayment.id);
  assert.equal(sentAfterPayment.number,sentBeforePayment.number);
  assert.equal(sentAfterPayment.count,sentBeforePayment.count);
  assert.equal(sentAfterPayment.status,'paid');
  assert.equal(sentAfterPayment.effective,'paid');
  assert.equal(sentAfterPayment.outstanding,0);

  // 6. Paid/final invoices remain immutable through the editor: no unsupported backward status edit.
  await page.evaluate(id=>editInvoice(id),sentId);
  await page.locator('.toast').filter({hasText:'definitieve factuur blijft ongewijzigd'}).waitFor();
  assert.equal(await page.locator('#invoiceForm').count(),0,'Paid/final invoice must not reopen in mutable editor');

  // 7. Two different concepts for the same customer finalize to distinct sequential numbers.
  const seqStart=await page.evaluate(()=>state.meta.nextInvoice);
  for(const [idx,id] of ['seq-a','seq-b'].entries()){
    await page.evaluate(({id,idx})=>{
      state.invoices.unshift({
        id,number:'CONCEPT-SEQ-'+idx,numberManaged:true,numberFinalized:false,kind:'invoice',
        customerId:'c1',issueDate:today(),supplyDate:today(),dueDate:today(),
        paymentDays:14,status:'draft',taxTreatment:'standard',reference:'',
        paymentReference:'CONCEPT-SEQ-'+idx,discountType:'none',discountValue:0,notes:'',
        payments:[],lines:[{desc:'Sequentieel '+idx,qty:1,unit:20+idx,vat:21,unitLabel:'stuk'}]
      });
      localStorage.setItem(userDataKey(),JSON.stringify(state));
      navigate('invoices');
    },{id,idx});
    await editDraftAndSave(id,'sent');
  }
  const seq=await page.evaluate(()=>['seq-a','seq-b'].map(id=>{const i=state.invoices.find(x=>x.id===id);return {id:i.id,number:i.number,status:i.status}}));
  assert.equal(new Set(seq.map(x=>x.number)).size,2,'Two finalized invoices must never receive the same number');
  assert.equal(await page.evaluate(()=>state.meta.nextInvoice),seqStart+2,'Exactly two sequence numbers must be consumed');

  // 8. A real second record with the same number must still be rejected.
  await page.evaluate(()=>{
    const src=state.invoices.find(x=>x.id==='existing-concept');
    state.invoices.unshift({...structuredClone(src),id:'real-duplicate-record'});
    navigate('invoices');
  });
  await page.evaluate(()=>editInvoice('existing-concept'));
  await page.locator('#invoiceForm').waitFor();
  const duplicateCheck=await page.evaluate(()=>invoiceChecks(collectInvoiceDraft()));
  assert.ok(duplicateCheck.errors.some(x=>x.label==='Uniek factuurnummer'),'A different invoice with the same number must remain blocked');
  await page.evaluate(()=>{state.invoices=state.invoices.filter(x=>x.id!=='real-duplicate-record');closeModal();save()});

  // 9. Refresh/reopen keeps the same IDs, numbers and statuses.
  const snapshotBeforeRefresh=await page.evaluate(()=>state.invoices.filter(x=>['existing-finalized-draft','concept-to-sent','concept-to-paid','seq-a','seq-b'].includes(x.id)).map(x=>({id:x.id,number:x.number,status:x.status})).sort((a,b)=>a.id.localeCompare(b.id)));
  await page.reload({waitUntil:'domcontentloaded'});
  const snapshotAfterRefresh=await page.evaluate(()=>state.invoices.filter(x=>['existing-finalized-draft','concept-to-sent','concept-to-paid','seq-a','seq-b'].includes(x.id)).map(x=>({id:x.id,number:x.number,status:x.status})).sort((a,b)=>a.id.localeCompare(b.id)));
  assert.deepEqual(snapshotAfterRefresh,snapshotBeforeRefresh,'Refresh must preserve invoice identity, number and status');

  // 10. Mobile exact edge case: finalized-number draft -> sent, no extra number reservation.
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{
    state.invoices.unshift({
      id:'mobile-finalized-draft',number:(new Date().getFullYear())+'-0999',numberManaged:true,numberFinalized:true,kind:'invoice',
      customerId:'c1',issueDate:today(),supplyDate:today(),dueDate:today(),
      paymentDays:14,status:'draft',taxTreatment:'standard',reference:'',
      paymentReference:(new Date().getFullYear())+'-0999',discountType:'none',discountValue:0,notes:'',
      payments:[],lines:[{desc:'Mobiel',qty:1,unit:35,vat:21,unitLabel:'stuk'}]
    });
    save();navigate('invoices');
  });
  const mobileBefore=await page.evaluate(()=>({next:state.meta.nextInvoice,count:state.invoices.length}));
  await editDraftAndSave('mobile-finalized-draft','sent');
  const mobileAfter=await page.evaluate(()=>{const i=state.invoices.find(x=>x.id==='mobile-finalized-draft');return {id:i.id,number:i.number,status:i.status,next:state.meta.nextInvoice,count:state.invoices.length}});
  assert.equal(mobileAfter.id,'mobile-finalized-draft');
  assert.match(mobileAfter.number,/^\d{4}-0999$/);
  assert.equal(mobileAfter.status,'sent');
  assert.equal(mobileAfter.next,mobileBefore.next);
  assert.equal(mobileAfter.count,mobileBefore.count);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'Mobile invoice edit must not introduce page overflow');

  assert.deepEqual(pageErrors,[],'Browser page errors: '+pageErrors.join(' | '));
  console.log('Invoice status edit regression: PASS (self-duplicate fix, identity preservation, finalized draft, concept->sent/paid, payment workflow, sequential uniqueness, refresh, mobile)');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
