import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const APP='https://boekuna-boekhouding.onrender.com/index.html';
const EMAIL=process.env.BOOKUNA_MARKETING_CAPTURE_EMAIL||'';
const PASSWORD=process.env.BOOKUNA_MARKETING_CAPTURE_PASSWORD||'';
const TARGET_SHA='16a30d819ae34bbcb39826975785552722787f96';
assert.ok(EMAIL&&PASSWORD,'Dedicated production QA credentials required');

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(String(e)));
let originalState=null;

try{
  await page.goto(APP+'?login=1&qa=invoice-status-'+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('#loginEmail').waitFor({timeout:30000});
  await page.locator('#loginEmail').fill(EMAIL);
  await page.locator('#loginPassword').fill(PASSWORD);
  await page.locator('#authForm button[type="submit"]').click();
  await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor({timeout:60000});

  originalState=await page.evaluate(()=>structuredClone(state));
  const qa=await page.evaluate(()=>{
    const stamp=Date.now().toString(36).toUpperCase();
    const contactId='qa-status-contact-'+stamp;
    const invoiceId='qa-status-invoice-'+stamp;
    const number='QA-STATUS-'+stamp;
    state.contacts.unshift({
      id:contactId,type:'customer',name:'QA Status Test BV',contactPerson:'QA',
      email:'qa-status@example.test',phone:'',address:'Teststraat 1',
      postal:'3011AA',city:'Rotterdam',country:'Nederland',
      kvk:'12345678',vat:'NL123456789B01'
    });
    state.invoices.unshift({
      id:invoiceId,number,numberManaged:true,numberFinalized:true,kind:'invoice',
      customerId:contactId,issueDate:today(),supplyDate:today(),dueDate:today(),
      paymentDays:0,status:'draft',taxTreatment:'standard',reference:'',
      paymentReference:number,discountType:'none',discountValue:0,notes:'QA release regression',
      payments:[],lines:[{desc:'QA status regression',qty:1,unit:10,vat:21,unitLabel:'stuk'}]
    });
    save();
    return {contactId,invoiceId,number,count:state.invoices.length,next:Number(state.meta.nextInvoice||0)};
  });

  await page.evaluate(()=>syncCloudStateNow());
  await page.evaluate(()=>navigate('invoices'));
  await page.locator('#pageTitle').filter({hasText:'Verkoop'}).waitFor();

  await page.evaluate(id=>editInvoice(id),qa.invoiceId);
  await page.locator('#invoiceForm').waitFor();
  await page.locator('#invoiceForm [name="status"]').selectOption('paid');
  await page.evaluate(()=>reviewInvoice());
  await page.getByRole('heading',{name:'Laatste controle vóór opslaan'}).waitFor();
  await page.evaluate(()=>finalSaveInvoice());

  const after=await page.evaluate(id=>{
    const i=state.invoices.find(x=>x.id===id);
    return {id:i?.id||null,number:i?.number||null,status:i?.status||null,count:state.invoices.length,next:Number(state.meta.nextInvoice||0)};
  },qa.invoiceId);

  assert.deepEqual(after,{id:qa.invoiceId,number:qa.number,status:'paid',count:qa.count,next:qa.next},
    'finalized-number draft -> paid must mutate the same invoice without reserving or duplicating');

  await page.evaluate(()=>syncCloudStateNow());
  await page.reload({waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor({timeout:60000});
  const reopened=await page.evaluate(id=>{
    const i=state.invoices.find(x=>x.id===id);
    return {id:i?.id||null,number:i?.number||null,status:i?.status||null,count:state.invoices.length,next:Number(state.meta.nextInvoice||0)};
  },qa.invoiceId);
  assert.deepEqual(reopened,after,'invoice identity/number/status must survive production cloud sync + reload');

  console.log('LIVE_INVOICE_STATUS '+JSON.stringify({targetSha:TARGET_SHA,before:qa,after,reopened}));
  assert.deepEqual(pageErrors,[],'browser page errors: '+pageErrors.join(' | '));
  console.log('03A LIVE INVOICE STATUS IDENTITY: PASS');
}finally{
  try{
    if(originalState&&!page.isClosed()){
      await page.evaluate(async original=>{
        state=normalizeState(original);
        localStorage.setItem(userDataKey(),JSON.stringify(state));
        await syncCloudStateNow();
      },originalState);
      console.log('QA cleanup: original dedicated-account ledger restored');
    }
  }catch(e){console.error('QA cleanup failed '+String(e));}
  await browser.close();
}
