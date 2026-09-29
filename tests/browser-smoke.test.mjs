import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
const financialCorrectionSource=fs.readFileSync(new URL('../public/assets/financial-correction.js',import.meta.url),'utf8');
fs.mkdirSync('tests/artifacts',{recursive:true});

function replaceLast(source,needle,replacement){
  const i=source.lastIndexOf(needle);
  if(i<0)throw new Error('Missing bootstrap marker: '+needle);
  return source.slice(0,i)+replacement+source.slice(i+needle.length);
}

const authHtml=replaceLast(
  original,
  'initAuth();',
  "showAuth(new URL(location.href).searchParams.get('register')==='1'?'register':'login');"
);

let appHtml=original.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
appHtml=replaceLast(appHtml,'initAuth();',`
currentUser=TEST_USER;
state=structuredClone(DEFAULT);
for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
state.company={...state.company,name:'QA Test BV',tradeName:'Boekuna QA',contactName:'QA',email:'qa@example.test',phone:'0101234567',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300',invoicePrefix:'2026-',paymentDays:14,kor:false};
enterApp();
`);

const mime={'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
const publicRoot=new URL('../public/',import.meta.url);
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(pathname.startsWith('/assets/')||pathname==='/favicon.ico'){
    const relative=pathname.replace(/^\//,'');
    const file=new URL(relative,publicRoot);
    try{
      if(fs.existsSync(file)){
        const ext=path.extname(file.pathname);
        res.writeHead(200,{'content-type':mime[ext]||'application/octet-stream','cache-control':'no-store'});
        return fs.createReadStream(file).pipe(res);
      }
    }catch{}
  }
  if(pathname==='/manifest.webmanifest'){res.writeHead(200,{'content-type':'application/manifest+json'});return res.end('{}')}
  const body=pathname.startsWith('/auth')?authHtml:appHtml;
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(body);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {port}=server.address();
const base=`http://127.0.0.1:${port}`;

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(String(e)));

try{
  // Registration + login rendering without touching real Auth.
  await page.goto(base+'/auth?register=1',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Maak je gratis account'}).waitFor();
  assert.equal(await page.locator('#authForm input[name="password"]').getAttribute('minlength'),'12');
  assert.equal(await page.locator('#authForm input[name="confirm"]').count(),0,'Registration must not ask for password confirmation');
  assert.equal(await page.locator('#authForm input[name="companyName"]').count(),0,'Registration must not collect company data');
  assert.equal(await page.locator('#authForm input').count(),2,'Registration must contain only email and password inputs');

  await page.goto(base+'/auth?login=1',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Inloggen'}).waitFor();
  assert.equal(await page.locator('#loginPassword').getAttribute('minlength'),null,'Login must not block legacy short passwords');
  assert.ok(await page.getByText('Nog geen account? Gratis starten').count(),'Login must expose registration');
  assert.equal(await page.locator('.auth-root').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(18, 59, 58)','Login must use Calm Control brand primary');
  await page.screenshot({path:'tests/artifacts/brand-login-1440.png',fullPage:true});

  // Daily-use browser flow on the exact production UI source, with auth/network isolated.
  await page.goto(base+'/app',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor();
  await page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim()==='#123B3A');
  assert.equal(await page.locator('#mainApp .sidebar').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(18, 59, 58)','Sidebar must use Calm Control brand primary');
  assert.equal(await page.locator('.mobile-menu').evaluate(el=>getComputedStyle(el).display),'none');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'Desktop page must not create global horizontal overflow');
  await page.screenshot({path:'tests/artifacts/brand-dashboard-1440.png',fullPage:true});

  await page.evaluate(()=>newContact());
  await page.locator('#contactForm [name="name"]').fill('QA Klant BV');
  await page.locator('#contactForm [name="email"]').fill('klant@example.test');
  await page.locator('#contactForm [name="address"]').fill('Klantstraat 2');
  await page.locator('#contactForm [name="postal"]').fill('3012BB');
  await page.locator('#contactForm [name="city"]').fill('Rotterdam');
  await page.evaluate(()=>saveContact(''));
  assert.equal(await page.evaluate(()=>state.contacts.length),1);

  await page.evaluate(()=>newService());
  await page.locator('#serviceForm [name="name"]').fill('QA Consultancy');
  await page.locator('#serviceForm [name="price"]').fill('10');
  await page.locator('#serviceForm [name="vat"]').selectOption('21');
  await page.evaluate(()=>saveService(''));
  assert.equal(await page.evaluate(()=>state.services.length),1);

  await page.evaluate(()=>newInvoice());
  await page.evaluate(()=>reviewInvoice());
  await page.locator('.toast').filter({hasText:'punt(en) controleren'}).waitFor();

  const customerId=await page.evaluate(()=>state.contacts[0].id);
  await page.locator('#invoiceForm [name="customerId"]').selectOption(customerId);
  await page.locator('#invoiceForm [name="status"]').selectOption('sent');
  await page.locator('#invoiceLines [data-k="desc"]').fill('QA werkzaamheden');
  await page.locator('#invoiceLines [data-k="qty"]').fill('3');
  await page.locator('#invoiceLines [data-k="unit"]').fill('10');
  await page.locator('#invoiceLines [data-k="vat"]').selectOption('21');
  await page.evaluate(()=>{updateInvoiceCustomer();calcInvoiceForm();updateInvoiceCheck()});
  const totals=await page.locator('#formTotals').innerText();
  assert.match(totals,/30,00/,'Invoice net total must be €30.00');
  assert.match(totals,/6,30/,'Invoice VAT must be €6.30');
  assert.match(totals,/36,30/,'Invoice gross total must be €36.30');

  await page.evaluate(()=>reviewInvoice());
  await page.getByRole('heading',{name:'Laatste controle vóór opslaan'}).waitFor();
  await page.evaluate(()=>finalSaveInvoice());
  assert.equal(await page.evaluate(()=>state.invoices.length),1);
  assert.equal(await page.evaluate(()=>invoiceNet(state.invoices[0])),30);
  assert.equal(await page.evaluate(()=>invoiceVat(state.invoices[0])),6.3);
  assert.equal(await page.evaluate(()=>invoiceGross(state.invoices[0])),36.3);
  assert.ok(await page.evaluate(()=>!String(state.invoices[0].number).startsWith('CONCEPT-')),'Final invoice must receive a final number');

  const downloadPromise=page.waitForEvent('download');
  await page.evaluate(()=>exportInvoicesCSV());
  const csv=await downloadPromise;
  assert.match(csv.suggestedFilename(),/^verkoopfacturen-\d{4}\.csv$/);

  const invoiceId=await page.evaluate(()=>state.invoices[0].id);
  const popupPromise=page.waitForEvent('popup');
  await page.evaluate(id=>printInvoice(id),invoiceId);
  const popup=await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  assert.match(await popup.locator('body').innerText(),/36,30/,'Printable invoice must show the same gross total');
  await popup.close();

  // Native e-mail app handoff: the production helper must share the authoritative
  // PDF without claiming successful delivery before explicit confirmation.
  await page.evaluate(()=>{
    const originalFetch=window.fetch.bind(window);
    window.fetch=async (input,init={})=>{
      const target=String(input);
      if(target.includes('/send-invoice')&&init?.method==='POST'){
        const body=JSON.parse(String(init.body||'{}'));
        if(body.action==='render_pdf'){
          return new Response(new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31,0x2e,0x37,0x0a,0x25,0x51,0x41,0x0a]),{
            status:200,headers:{'content-type':'application/pdf'}
          });
        }
      }
      return originalFetch(input,init);
    };
    window.__invoiceShareCalls=[];
    Object.defineProperty(navigator,'canShare',{configurable:true,value:data=>!!data?.files?.length});
    Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{
      window.__invoiceShareCalls.push({
        title:data.title,text:data.text,
        files:data.files.map(file=>({name:file.name,type:file.type,size:file.size}))
      });
    }});
  });

  const helperContract=await page.evaluate(()=>({
    valid:isInvoiceShareEmail('klant+facturen@example.nl'),
    invalid:isInvoiceShareEmail('klant@example.nl\r\nBcc:evil@example.nl'),
    filename:invoiceShareFilename(
      {kind:'invoice',number:'2026/0041\r\nBcc:evil'},
      {name:'Jänsen / ../ Bouw B.V.'}
    ),
    creditFilename:invoiceShareFilename({kind:'credit',number:'CR/2026-7'},{name:'Café Noord'}),
    mailto:buildInvoiceMailto(
      'klant+facturen@example.nl',
      'Factuur 2026/0041\r\nBcc:evil@example.nl',
      'Regel één\nBedrag € 121,00'
    ),
    creditSubject:invoiceMailSubject(
      {kind:'credit',number:'CR-7',dueDate:'2026-10-13',paymentReference:'CR-7',lines:[{qty:1,unit:100,vat:21}]},
      {name:'Café Noord',contactPerson:''}
    )
  }));
  assert.equal(helperContract.valid,true);
  assert.equal(helperContract.invalid,false,'CRLF/header-injected recipient must be rejected');
  assert.match(helperContract.filename,/^Factuur-2026-0041-Bcc-evil-Jansen-Bouw-BV\.pdf$/);
  assert.match(helperContract.creditFilename,/^Creditnota-CR-2026-7-Cafe-Noord\.pdf$/);
  assert.ok(!/[\r\n/]/.test(helperContract.filename),'Filename must be path/header safe');
  assert.ok(helperContract.mailto.startsWith('mailto:klant%2Bfacturen%40example.nl?subject='));
  assert.ok(!/[\r\n]/.test(helperContract.mailto),'mailto URI must not contain raw CR/LF');
  assert.match(helperContract.mailto,/%E2%82%AC/,'Euro sign must be URI encoded');
  assert.match(helperContract.creditSubject,/^Creditfactuur CR-7/,'Credit notes need credit-specific copy');

  await page.evaluate(id=>openSendInvoice(id),invoiceId);
  if((await page.evaluate(()=>window.__invoiceShareCalls.length))===0){
    await page.getByRole('button',{name:'Kies je e-mailapp'}).click();
  }
  await page.getByRole('heading',{name:'Heb je de factuur verzonden?'}).waitFor();
  let shareState=await page.evaluate(id=>({
    call:window.__invoiceShareCalls.at(-1),
    invoice:state.invoices.find(x=>x.id===id)
  }),invoiceId);
  assert.equal(shareState.call.files[0].type,'application/pdf');
  assert.match(shareState.call.files[0].name,/^Factuur-2026-\d{4}-QA-Klant-BV\.pdf$/);
  assert.match(shareState.call.title,/^Factuur /);
  assert.match(shareState.call.text,/QA Test BV|Boekuna QA/);
  assert.equal(shareState.invoice.lastSentAt,undefined,'Opening native share must not mark the invoice sent');
  assert.equal(await page.getByRole('button',{name:'Nee, nog niet'}).count(),1,'Confirmation must expose an explicit not-sent action');
  await page.evaluate(()=>invoiceShareNotSent());
  assert.equal(await page.evaluate(()=>state.invoices[0]?.lastSentAt),undefined,'Declining confirmation must not record delivery');

  await page.evaluate(()=>{
    Object.defineProperty(navigator,'share',{configurable:true,value:async ()=>{
      throw new DOMException('cancelled','AbortError');
    }});
  });
  await page.evaluate(()=>sharePreparedInvoice());
  await page.locator('.toast').filter({hasText:'Delen geannuleerd'}).waitFor();
  assert.equal(await page.evaluate(()=>state.invoices[0]?.lastSentAt),undefined,'Cancelled share must leave invoice unchanged');

  await page.evaluate(()=>{
    Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false});
  });
  const fallbackDownload=page.waitForEvent('download');
  const shareInvoiceId=await page.evaluate(()=>state.invoices[0]?.id);
  assert.ok(shareInvoiceId,'Share QA invoice must remain present');
  await page.evaluate(id=>openSendInvoice(id),shareInvoiceId);
  const fallbackFile=await fallbackDownload;
  assert.match(fallbackFile.suggestedFilename(),/^Factuur-2026-\d{4}-QA-Klant-BV\.pdf$/);
  await page.getByRole('heading',{name:'Factuur klaar om te versturen'}).waitFor();
  const fallbackText=await page.locator('.modal').innerText();
  assert.match(fallbackText,/Voeg de PDF handmatig als bijlage toe/);
  assert.match(fallbackText,/geen toegang tot je mailbox/i);
  assert.equal(await page.evaluate(()=>state.invoices[0]?.lastSentAt),undefined,'Fallback download must not mark sent');
  await page.evaluate(()=>closeModal());

  await page.evaluate(()=>{
    Object.defineProperty(navigator,'canShare',{configurable:true,value:data=>!!data?.files?.length});
    Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{
      window.__invoiceShareCalls.push({title:data.title,text:data.text,files:data.files.map(file=>({name:file.name,type:file.type,size:file.size}))});
    }});
  });
  await page.evaluate(()=>sharePreparedInvoice());
  await page.getByRole('heading',{name:'Heb je de factuur verzonden?'}).waitFor();
  const statusBeforeConfirm=await page.evaluate(()=>state.invoices[0]?.status);
  assert.equal(await page.getByRole('button',{name:'Ja, markeer als verzonden'}).count(),1,'Confirmation must expose an explicit sent action');
  await page.evaluate(()=>confirmInvoiceShareSent(state.invoices[0].id,'native_share'));
  shareState=await page.evaluate(()=>{
    const invoice=state.invoices[0];
    return {status:invoice.status,lastSentAt:invoice.lastSentAt,lastSentTo:invoice.lastSentTo,lastShareChannel:invoice.lastShareChannel,history:invoice.sendHistory||[],audit:state.audit||[]};
  });
  assert.equal(shareState.status,statusBeforeConfirm,'Manual delivery confirmation must not change financial invoice status');
  assert.ok(shareState.lastSentAt,'Explicit user confirmation must record delivery time');
  assert.equal(shareState.lastSentTo,'klant@example.test');
  assert.equal(shareState.lastShareChannel,'native_share');
  assert.equal(shareState.history.at(-1).confirmedByUser,true);
  assert.equal(shareState.history.at(-1).provider,'manual-email-app');
  assert.ok(shareState.audit.some(e=>e.action==='Factuur verzending bevestigd'));
  assert.ok(!JSON.stringify(shareState.audit).includes('Regel één'),'Audit trail must not contain complete email body');

  for(const width of [320,360,375,390,393,430,768,1024,1280,1440]){
    await page.setViewportSize({width,height:900});
    await page.evaluate(()=>showInvoiceShareConfirmation(state.invoices[0].id,'native_share'));
    const box=await page.locator('.modal').boundingBox();
    assert.ok(box&&box.width<=width+0.5,'Share confirmation modal must fit '+width+'px');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'Share flow must not overflow at '+width+'px');
    await page.evaluate(()=>closeModal());
  }

  // P1 regression: invoice status transitions must preserve identity and only
  // reserve a final number on the first definitive transition.
  await page.evaluate(()=>{
    state.invoices=[];
    state.audit=[];
    state.meta.nextInvoice=50;
    save();
  });
  const invoiceQaCustomerId=await page.evaluate(()=>state.contacts[0].id);
  const makeDraft=async (label,status='draft')=>page.evaluate(({label,status,customerId})=>({
    number:'CONCEPT-'+label,
    customerId,
    customer:getContact(customerId),
    issueDate:today(),
    supplyDate:today(),
    dueDate:today(),
    paymentDays:0,
    status,
    taxTreatment:'standard',
    reference:'',
    paymentReference:'CONCEPT-'+label,
    discountType:'none',
    discountValue:0,
    notes:'',
    lines:[{desc:'QA '+label,qty:1,unitLabel:'uur',unit:100,vat:21}]
  }),{label,status,customerId:invoiceQaCustomerId});
  const snap=()=>page.evaluate(()=>({count:state.invoices.length,next:Number(state.meta.nextInvoice||0),invoices:state.invoices.map(i=>({id:i.id,number:i.number,status:i.status,numberFinalized:!!i.numberFinalized}))}));

  // Concept -> Verzonden.
  let qaDraft=await makeDraft('A');
  await page.evaluate(d=>{editingInvoiceId=null;pendingInvoiceDraft=d},qaDraft);
  await page.evaluate(()=>finalSaveInvoice());
  let qaSnap=await snap();
  const qaAId=qaSnap.invoices[0].id;
  const qaABefore={...qaSnap.invoices[0],count:qaSnap.count,next:qaSnap.next};
  await page.evaluate(id=>{const i=state.invoices.find(x=>x.id===id);editingInvoiceId=id;pendingInvoiceDraft={...structuredClone(i),customer:getContact(i.customerId),paymentDays:i.paymentDays||0,status:'sent'}},qaAId);
  await page.evaluate(()=>finalSaveInvoice());
  qaSnap=await snap();
  const qaA=qaSnap.invoices.find(i=>i.id===qaAId);
  assert.equal(qaA.id,qaABefore.id,'Concept -> Verzonden must preserve invoice ID');
  assert.notEqual(qaA.number,qaABefore.number,'First definitive transition must replace concept number');
  assert.equal(qaA.status,'sent');
  assert.equal(qaSnap.count,qaABefore.count,'Concept -> Verzonden must not create a duplicate record');
  assert.equal(qaSnap.next,qaABefore.next+1,'Concept -> Verzonden must reserve exactly one number');

  // Concept -> Betaald directly.
  qaDraft=await makeDraft('B');
  await page.evaluate(d=>{editingInvoiceId=null;pendingInvoiceDraft=d},qaDraft);
  await page.evaluate(()=>finalSaveInvoice());
  qaSnap=await snap();
  const qaBId=qaSnap.invoices.find(i=>i.number==='CONCEPT-B').id;
  const qaBBefore={...qaSnap.invoices.find(i=>i.id===qaBId),count:qaSnap.count,next:qaSnap.next};
  await page.evaluate(id=>{const i=state.invoices.find(x=>x.id===id);editingInvoiceId=id;pendingInvoiceDraft={...structuredClone(i),customer:getContact(i.customerId),paymentDays:i.paymentDays||0,status:'paid'}},qaBId);
  await page.evaluate(()=>finalSaveInvoice());
  qaSnap=await snap();
  const qaB=qaSnap.invoices.find(i=>i.id===qaBId);
  assert.equal(qaB.id,qaBBefore.id,'Concept -> Betaald must preserve invoice ID');
  assert.notEqual(qaB.number,qaBBefore.number,'Concept -> Betaald must reserve one final number');
  assert.equal(qaB.status,'paid');
  assert.equal(qaSnap.count,qaBBefore.count,'Concept -> Betaald must not create a duplicate record');
  assert.equal(qaSnap.next,qaBBefore.next+1,'Concept -> Betaald must reserve exactly one number');

  // Verzonden -> Betaald through the real payment modal; number/sequence stay unchanged.
  const qaANumber=qaA.number,qaPaymentNext=qaSnap.next,qaPaymentCount=qaSnap.count;
  await page.evaluate(id=>registerPayment(id),qaAId);
  await page.locator('#paymentForm [name="amount"]').fill('121');
  await page.evaluate(id=>savePayment(id),qaAId);
  qaSnap=await snap();
  const qaAPaid=qaSnap.invoices.find(i=>i.id===qaAId);
  assert.equal(qaAPaid.status,'paid');
  assert.equal(qaAPaid.number,qaANumber,'Payment flow must preserve the final invoice number');
  assert.equal(qaSnap.next,qaPaymentNext,'Payment flow must not reserve a new invoice number');
  assert.equal(qaSnap.count,qaPaymentCount,'Payment flow must not duplicate the invoice');

  // Re-saving an unchanged concept preserves ID/number and consumes no sequence.
  qaDraft=await makeDraft('C');
  await page.evaluate(d=>{editingInvoiceId=null;pendingInvoiceDraft=d},qaDraft);
  await page.evaluate(()=>finalSaveInvoice());
  qaSnap=await snap();
  const qaCId=qaSnap.invoices.find(i=>i.number==='CONCEPT-C').id;
  const qaCBefore={...qaSnap.invoices.find(i=>i.id===qaCId),count:qaSnap.count,next:qaSnap.next};
  await page.evaluate(id=>{const i=state.invoices.find(x=>x.id===id);editingInvoiceId=id;pendingInvoiceDraft={...structuredClone(i),customer:getContact(i.customerId),paymentDays:i.paymentDays||0,status:'draft'}},qaCId);
  await page.evaluate(()=>finalSaveInvoice());
  qaSnap=await snap();
  const qaCResaved=qaSnap.invoices.find(i=>i.id===qaCId);
  assert.equal(qaCResaved.id,qaCBefore.id);
  assert.equal(qaCResaved.number,qaCBefore.number);
  assert.equal(qaSnap.next,qaCBefore.next,'Concept resave must not reserve an invoice number');
  assert.equal(qaSnap.count,qaCBefore.count,'Concept resave must not duplicate the record');

  // Two concepts finalized sequentially receive distinct numbers exactly once.
  qaDraft=await makeDraft('D');
  await page.evaluate(d=>{editingInvoiceId=null;pendingInvoiceDraft=d},qaDraft);
  await page.evaluate(()=>finalSaveInvoice());
  qaSnap=await snap();
  const qaDId=qaSnap.invoices.find(i=>i.number==='CONCEPT-D').id;
  const qaTwoBeforeNext=qaSnap.next,qaTwoBeforeCount=qaSnap.count;
  await page.evaluate(id=>{const i=state.invoices.find(x=>x.id===id);editingInvoiceId=id;pendingInvoiceDraft={...structuredClone(i),customer:getContact(i.customerId),paymentDays:i.paymentDays||0,status:'sent'}},qaCId);
  await page.evaluate(()=>finalSaveInvoice());
  await page.evaluate(id=>{const i=state.invoices.find(x=>x.id===id);editingInvoiceId=id;pendingInvoiceDraft={...structuredClone(i),customer:getContact(i.customerId),paymentDays:i.paymentDays||0,status:'sent'}},qaDId);
  await page.evaluate(()=>finalSaveInvoice());
  qaSnap=await snap();
  const qaC=qaSnap.invoices.find(i=>i.id===qaCId),qaD=qaSnap.invoices.find(i=>i.id===qaDId);
  assert.notEqual(qaC.number,qaD.number,'Sequential finalization must produce distinct invoice numbers');
  assert.equal(qaSnap.next,qaTwoBeforeNext+2,'Two finalizations must consume exactly two sequence values');
  assert.equal(qaSnap.count,qaTwoBeforeCount,'Sequential finalization must not duplicate records');

  // Negative uniqueness: own number is allowed for the same ID; another record is rejected.
  const duplicateCheck=await page.evaluate(({sameId,otherId,number})=>{
    const same=invoiceNumberAvailable(number,sameId);
    const other=invoiceNumberAvailable(number,otherId);
    const candidate={...structuredClone(state.invoices.find(x=>x.id===otherId)),number,customer:getContact(state.invoices.find(x=>x.id===otherId).customerId),status:'draft'};
    const errors=invoiceDraftChecks(candidate,otherId).errors.map(x=>x.label);
    return {same,other,errors};
  },{sameId:qaCId,otherId:qaDId,number:qaC.number});
  assert.equal(duplicateCheck.same,true,'An invoice must not conflict with its own number');
  assert.equal(duplicateCheck.other,false,'A different invoice must conflict with the same number');
  assert.ok(duplicateCheck.errors.includes('Uniek factuurnummer'),'Duplicate candidate must be rejected by invoice validation');

  await page.evaluate(()=>setImportProgress('Document verwerken','Document analyseren…','qa.pdf'));
  const processingModal=await page.locator('.modal').innerText();
  assert.doesNotMatch(processingModal,/\b(?:28|48|66|98)%\b/,'Indeterminate processing must never expose staged fake percentages');
  assert.equal(await page.locator('.processing-indeterminate').count(),1,'Unknown-duration processing must use an indeterminate progress indicator');
  await page.evaluate(()=>showUploadError(createUploadError('DOCUMENT_TOO_LARGE','',413,{context:{max_size_mb:15},state:'not_saved'})));
  const uploadError=await page.locator('.modal').innerText();
  assert.match(uploadError,/Bestand te groot/);
  assert.match(uploadError,/Verklein of comprimeer/);
  assert.doesNotMatch(uploadError,/DOCUMENT_TOO_LARGE/,'End users must not see internal document error codes');
  assert.equal(await page.locator('.modal a[href="mailto:support@boekuna.nl"]').count(),1,'Upload error must offer the official support email');
  await page.evaluate(()=>{closeModal();navigate('settings')});
  await page.getByRole('heading',{name:'Instellingen'}).waitFor();
  assert.equal(await page.locator('a[href="mailto:support@boekuna.nl"]').count(),1,'Settings must expose the official support email');

  // Mobile viewport: navigation, modal sizing and no page-level horizontal overflow.
  await page.setViewportSize({width:390,height:844});
  await page.goto(base+'/app',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor();
  assert.notEqual(await page.locator('.mobile-menu').evaluate(el=>getComputedStyle(el).display),'none');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'Mobile page must not create global horizontal overflow');
  await page.screenshot({path:'tests/artifacts/brand-dashboard-390.png',fullPage:true});
  await page.locator('#mobileMenu').click();
  assert.ok(await page.locator('#sidebar').evaluate(el=>el.classList.contains('open')),'Mobile menu must set the sidebar open state');
  await page.waitForTimeout(260);
  const sidebarLeft=await page.locator('#sidebar').evaluate(el=>Math.round(el.getBoundingClientRect().left));
  assert.ok(Math.abs(sidebarLeft)<=1,'Mobile menu must finish opening the sidebar');
  await page.evaluate(()=>newContact());
  const modalBox=await page.locator('.modal').boundingBox();
  assert.ok(modalBox && modalBox.width<=390.5,'Mobile modal must fit viewport width');

  // Live pre-launch availability smoke test.
  const live=await browser.newPage({viewport:{width:1280,height:800}});
  const response=await live.goto('https://boekuna-boekhouding.onrender.com/?login=1',{waitUntil:'domcontentloaded',timeout:45000});
  assert.ok(response && response.ok(),'Live Render build must answer successfully');
  await live.getByRole('heading',{name:'Inloggen'}).waitFor({timeout:15000});
  assert.match(await live.title(),/Boekuna/);
  await live.close();

  assert.deepEqual(pageErrors,[],'Browser page errors: '+pageErrors.join(' | '));
  console.log('Boekuna browser smoke: PASS (auth, CRUD, invoice integrity, native email share/fallback/cancel/confirmation, responsive layout, live availability)');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
