import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

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

const browserType=(process.env.BOOKUNA_BROWSER||'chromium')==='webkit'?webkit:chromium;
const browser=await browserType.launch({headless:true});
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

  // Unified invoice/reminder/follow-up email handoff: authoritative PDF only,
  // explicit delivery confirmation, desktop mailto metadata and mobile file share.
  await page.evaluate(()=>{
    const originalFetch=window.fetch.bind(window);
    window.__pdfRenderCalls=0;
    window.__mailProviderAttempts=0;
    window.__invoiceShareCalls=[];
    window.fetch=async (input,init={})=>{
      const target=String(input);
      if(target.includes('/send-invoice')&&init?.method==='POST'){
        const body=JSON.parse(String(init.body||'{}'));
        if(body.action!=='render_pdf'){
          window.__mailProviderAttempts++;
          return new Response(JSON.stringify({ok:false,code:'MAILBOX_SEND_DISABLED'}),{status:410,headers:{'content-type':'application/json'}});
        }
        window.__pdfRenderCalls++;
        return new Response(new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31,0x2e,0x37,0x0a,0x25,0x51,0x41,0x0a]),{
          status:200,headers:{'content-type':'application/pdf'}
        });
      }
      return originalFetch(input,init);
    };
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
    mailto:buildInvoiceMailto(
      'klant+facturen@example.nl',
      'Factuur 2026/0041\r\nBcc:evil@example.nl',
      'Regel één\nBedrag € 121,00'
    ),
    gmail:buildGmailComposeUrl(
      'klant+facturen@example.nl',
      'Factuur 2026/0041\r\nBcc:evil@example.nl',
      'Regel één\nBedrag € 121,00'
    )
  }));
  assert.equal(helperContract.valid,true);
  assert.equal(helperContract.invalid,false,'CRLF/header-injected recipient must be rejected');
  assert.match(helperContract.filename,/^Factuur-2026-0041-Bcc-evil-Jansen-Bouw-BV\.pdf$/);
  assert.ok(!/[\r\n/]/.test(helperContract.filename),'Filename must be path/header safe');
  assert.ok(helperContract.mailto.startsWith('mailto:klant%2Bfacturen%40example.nl?subject='));
  assert.ok(!/[\r\n]/.test(helperContract.mailto),'mailto URI must not contain raw CR/LF');
  assert.match(helperContract.mailto,/%E2%82%AC/,'Euro sign must be URI encoded');
  assert.match(helperContract.gmail,/^https:\/\/mail\.google\.com\/mail\/\?view=cm&fs=1&to=/);
  assert.ok(!/[\r\n]/.test(helperContract.gmail),'Gmail compose URL must not contain raw CR/LF');

  // Physical iPhone/Gmail regression: native file sharing may attach the PDF but
  // Gmail is allowed to ignore the intended recipient/subject. The dedicated
  // Gmail compose path must therefore carry those fields explicitly.
  const physicalGmailFixture=await page.evaluate(()=>{
    const previousCompany=structuredClone(state.company);
    state.company={
      ...state.company,
      name:'Kwin Phetmanee',
      tradeName:'Kwin Phetmanee',
      contactName:'Kwin Phetmanee',
      email:'k.phetmanee@gmail.com',
      phone:'+31636052860',
      iban:'NL96INGB0751841897',
      emailTemplate:{
        ...state.company.emailTemplate,
        subjectInvoice:DEFAULT_EMAIL_TEMPLATE.subjectInvoice,
        bodyInvoice:DEFAULT_EMAIL_TEMPLATE.bodyInvoice
      }
    };
    const customer={id:'gmail-physical-customer',type:'customer',name:'Kwin Phetmanee',contactPerson:'Kwin Phetmanee',email:'customer@example.com',address:'Teststraat 8',postal:'3011AA',city:'Rotterdam'};
    const invoice={
      id:'gmail-physical-invoice',number:'2026-0008',numberManaged:true,numberFinalized:true,customerId:customer.id,
      issueDate:'2026-09-29',supplyDate:'2026-09-29',dueDate:'2026-10-13',paymentDays:14,
      status:'sent',taxTreatment:'standard',reference:'',paymentReference:'2026-0008',
      discountType:'none',discountValue:0,notes:'',
      lines:[{desc:'Werkzaamheden',qty:1,unitLabel:'stuk',unit:250,vat:21}],payments:[]
    };
    state.contacts.push(customer);
    state.invoices.push(invoice);
    save();
    return {invoiceId:invoice.id,customerId:customer.id,previousCompany};
  });
  await page.evaluate(id=>openSendInvoice(id),physicalGmailFixture.invoiceId);
  await page.getByRole('heading',{name:'Factuur versturen'}).waitFor();
  const physicalTo=await page.locator('#emailHandoffForm [name="to"]').inputValue();
  const physicalSubject=await page.locator('#emailHandoffForm [name="subject"]').inputValue();
  const physicalBody=await page.locator('#emailHandoffForm [name="message"]').inputValue();
  assert.equal(physicalTo,'customer@example.com');
  assert.equal(physicalSubject,'Factuur 2026-0008 · Kwin Phetmanee');
  assert.notEqual(physicalSubject,'Factuur-2026-0008-Kwin-Phetmanee');
  assert.match(physicalBody,/^Goedendag Kwin Phetmanee,\n\n/);
  assert.match(physicalBody,/Hierbij ontvangt u factuur 2026-0008 voor €[ \u00a0]302,50\./);
  assert.match(physicalBody,/Factuurdatum: 29 september 2026\nVervaldatum: 13 oktober 2026\nBedrag: €[ \u00a0]302,50/);
  assert.match(physicalBody,/NL96INGB0751841897 onder vermelding van 2026-0008/);
  assert.match(physicalBody,/Met vriendelijke groet,\nKwin Phetmanee\nk\.phetmanee@gmail\.com\n\+31636052860$/);
  const physicalGmailUrl=await page.evaluate(({to,subject,body})=>buildGmailComposeUrl(to,subject,body),{to:physicalTo,subject:physicalSubject,body:physicalBody});
  const parsedPhysicalGmail=new URL(physicalGmailUrl);
  assert.equal(parsedPhysicalGmail.searchParams.get('to'),'customer@example.com');
  assert.equal(parsedPhysicalGmail.searchParams.get('su'),'Factuur 2026-0008 · Kwin Phetmanee');
  assert.equal(parsedPhysicalGmail.searchParams.get('body'),physicalBody,'Gmail compose must retain the exact plain-text newlines');
  await page.evaluate(fixture=>{
    state.invoices=state.invoices.filter(x=>x.id!==fixture.invoiceId);
    state.contacts=state.contacts.filter(x=>x.id!==fixture.customerId);
    state.company=fixture.previousCompany;
    save();
    closeModal();
  },physicalGmailFixture);

  await page.evaluate(id=>openSendInvoice(id),invoiceId);
  const firstEmailModal=await page.locator('.modal').innerText();
  assert.match(firstEmailModal,/Factuur versturen/,'Expected invoice composer after openSendInvoice; got: '+firstEmailModal.slice(0,500));
  await page.getByRole('heading',{name:'Factuur versturen'}).waitFor();
  assert.equal(await page.locator('#emailHandoffForm [name="to"]').inputValue(),'klant@example.test');
  assert.match(await page.locator('#emailHandoffForm [name="subject"]').inputValue(),/^Factuur /);
  const composerBody=await page.locator('#emailHandoffForm [name="message"]').inputValue();
  assert.match(composerBody,/Factuurdatum:/);
  assert.match(composerBody,/Vervaldatum:/);
  assert.match(composerBody,/De factuur vindt u als PDF in de bijlage/);
  assert.match(composerBody,/Met vriendelijke groet,\nQA\nqa@example\.test\n0101234567$/,'Default email signature must use contact name plus available contact details');

  await page.evaluate(()=>prepareEmailHandoffFromComposer());
  await page.getByRole('heading',{name:'Hoe wilt u versturen'}).waitFor();
  let unified=await page.evaluate(()=>window.__boekunaEmailHandoffTestState());
  assert.equal(unified.mode,'invoice');
  assert.equal(unified.to,'klant@example.test');
  assert.equal(unified.file.type,'application/pdf');
  assert.match(unified.file.name,/^Factuur-2026-\d{4}-QA-Klant-BV\.pdf$/);
  assert.equal(await page.evaluate(()=>window.__pdfRenderCalls),1,'Invoice composer must render the PDF exactly once');
  assert.equal(await page.evaluate(id=>state.invoices.find(x=>x.id===id)?.lastSentAt,invoiceId),undefined);

  // Mobile choice must expose Gmail compose separately from attachment-first share.
  // Re-enter through the real composer -> prepare flow; the private chooser is
  // intentionally not exposed as a window API.
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'userAgentData',{configurable:true,value:{mobile:true}});
    reopenEmailHandoffComposer();
  });
  await page.getByRole('heading',{name:'Factuur versturen'}).waitFor();
  await page.evaluate(()=>prepareEmailHandoffFromComposer());
  await page.getByRole('heading',{name:'Hoe wilt u versturen'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__pdfRenderCalls),1,'Re-entering the composer must reuse the prepared PDF');
  const mobileHandoffText=await page.locator('.modal').innerText();
  assert.match(mobileHandoffText,/Gmail openen/);
  assert.match(mobileHandoffText,/PDF delen als bijlage/);
  assert.match(mobileHandoffText,/Andere e-mailapp openen/);
  assert.match(mobileHandoffText,/ontvangende app bepaalt zelf Aan en Onderwerp/);
  assert.equal(await page.getByRole('button',{name:'Gmail openen'}).evaluate(el=>el.classList.contains('primary')),true,'Gmail must be the primary explicit mobile compose option');
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'userAgentData',{configurable:true,value:{mobile:false}});
    reopenEmailHandoffComposer();
    window.__emailDownloadCalls=0;
    window.__gmailOpenCalls=[];
    window.__realDownloadInvoiceShareFile=window.downloadInvoiceShareFile;
    window.__realWindowOpen=window.open;
    window.downloadInvoiceShareFile=function(file){window.__emailDownloadCalls++;return !!file;};
    window.open=function(url){window.__gmailOpenCalls.push(String(url));return {closed:false};};
  });
  await page.getByRole('heading',{name:'Factuur versturen'}).waitFor();
  await page.evaluate(()=>prepareEmailHandoffFromComposer());
  await page.getByRole('heading',{name:'Hoe wilt u versturen'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__pdfRenderCalls),1,'Switching channel choice must not rerender the PDF');

  // Dedicated Gmail route downloads/prepares the PDF once, but fills To/Subject/Body
  // through Gmail compose instead of relying on native share field mapping.
  await page.evaluate(()=>openEmailHandoffGmail());
  await page.getByRole('heading',{name:'Hebt u de e-mail verzonden?'}).waitFor();
  let gmailRouteState=await page.evaluate(id=>{
    const invoice=state.invoices.find(x=>x.id===id);
    return {
      url:window.__boekunaLastGmailUrl,
      opens:window.__gmailOpenCalls.slice(),
      downloads:window.__emailDownloadCalls,
      handoff:window.__boekunaEmailHandoffTestState(),
      lastSentAt:invoice.lastSentAt
    };
  },invoiceId);
  const gmailRouteUrl=new URL(gmailRouteState.url);
  assert.equal(gmailRouteUrl.searchParams.get('to'),'klant@example.test');
  assert.match(gmailRouteUrl.searchParams.get('su'),/^Factuur /);
  assert.match(gmailRouteUrl.searchParams.get('body'),/\n\n/,'Gmail body must contain real paragraph breaks');
  assert.equal(gmailRouteState.opens.length,1,'One Gmail click must open only one compose target');
  assert.equal(gmailRouteState.downloads,1,'Gmail route must prepare/download the PDF once');
  assert.equal(gmailRouteState.handoff.fileDownloaded,true);
  assert.equal(gmailRouteState.lastSentAt,undefined,'Opening Gmail is not delivery');
  await page.evaluate(()=>emailHandoffNotSent());

  // Back to composer must preserve the prepared PDF; editing mail text alone may not
  // trigger another server render or another PDF download.
  await page.evaluate(()=>reopenEmailHandoffComposer());
  await page.locator('#emailHandoffForm [name="message"]').fill((await page.locator('#emailHandoffForm [name="message"]').inputValue())+'\n\nExtra controlezin.');
  await page.evaluate(()=>prepareEmailHandoffFromComposer());
  assert.equal(await page.evaluate(()=>window.__pdfRenderCalls),1,'Returning to the composer must reuse the prepared PDF');
  await page.evaluate(()=>openEmailHandoffGmail());
  await page.getByRole('heading',{name:'Hebt u de e-mail verzonden?'}).waitFor();
  gmailRouteState=await page.evaluate(()=>({
    opens:window.__gmailOpenCalls.slice(),
    downloads:window.__emailDownloadCalls,
    handoff:window.__boekunaEmailHandoffTestState()
  }));
  assert.equal(gmailRouteState.opens.length,2);
  assert.equal(gmailRouteState.downloads,1,'Reopening Gmail within the same handoff must not download the PDF twice');
  assert.equal(gmailRouteState.handoff.fileDownloaded,true);
  await page.evaluate(()=>{
    emailHandoffNotSent();
    window.open=window.__realWindowOpen;
    window.downloadInvoiceShareFile=window.__realDownloadInvoiceShareFile;
  });

  const desktopMailto=await page.evaluate(()=>emailHandoffMailtoUrl());
  assert.match(desktopMailto,/^mailto:klant%40example\.test\?subject=/);
  assert.match(decodeURIComponent(desktopMailto),/Factuur /);
  assert.ok(!/[\r\n]/.test(desktopMailto),'Desktop mailto must be header-safe');

  await page.evaluate(()=>shareEmailHandoffPdf());
  await page.getByRole('heading',{name:'Hebt u de e-mail verzonden?'}).waitFor();
  let shareState=await page.evaluate(id=>({
    call:window.__invoiceShareCalls.at(-1),
    invoice:state.invoices.find(x=>x.id===id)
  }),invoiceId);
  assert.equal(shareState.call.files[0].type,'application/pdf');
  assert.equal(shareState.invoice.lastSentAt,undefined,'Opening native share must not mark the invoice sent');
  await page.evaluate(()=>emailHandoffNotSent());
  assert.equal(await page.evaluate(id=>state.invoices.find(x=>x.id===id)?.lastSentAt,invoiceId),undefined,'Declining confirmation must not record delivery');

  await page.evaluate(()=>{
    Object.defineProperty(navigator,'share',{configurable:true,value:async ()=>{throw new DOMException('cancelled','AbortError')}});
  });
  await page.evaluate(id=>openSendInvoice(id),invoiceId);
  await page.evaluate(()=>prepareEmailHandoffFromComposer());
  await page.getByRole('heading',{name:'Hoe wilt u versturen'}).waitFor();
  await page.evaluate(()=>shareEmailHandoffPdf());
  await page.locator('.toast').filter({hasText:'Delen geannuleerd'}).waitFor();
  assert.equal(await page.evaluate(id=>state.invoices.find(x=>x.id===id)?.lastSentAt,invoiceId),undefined,'Cancelled native share must remain unsent');

  await page.evaluate(()=>{
    Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{
      window.__invoiceShareCalls.push({title:data.title,text:data.text,files:data.files.map(file=>({name:file.name,type:file.type,size:file.size}))});
    }});
  });
  await page.evaluate(id=>openSendInvoice(id),invoiceId);
  await page.evaluate(()=>prepareEmailHandoffFromComposer());
  await page.evaluate(()=>shareEmailHandoffPdf());
  await page.getByRole('heading',{name:'Hebt u de e-mail verzonden?'}).waitFor();
  const statusBeforeConfirm=await page.evaluate(id=>state.invoices.find(x=>x.id===id)?.status,invoiceId);
  await page.evaluate(()=>confirmEmailHandoff('native_share'));
  shareState=await page.evaluate(id=>{
    const invoice=state.invoices.find(x=>x.id===id);
    return {status:invoice.status,lastSentAt:invoice.lastSentAt,lastSentTo:invoice.lastSentTo,lastShareChannel:invoice.lastShareChannel,history:invoice.sendHistory||[],audit:state.audit||[]};
  },invoiceId);
  assert.equal(shareState.status,statusBeforeConfirm,'Delivery confirmation must not change financial invoice status');
  assert.ok(shareState.lastSentAt,'Explicit confirmation must record first invoice delivery');
  assert.equal(shareState.lastSentTo,'klant@example.test');
  assert.equal(shareState.lastShareChannel,'native_share');
  assert.equal(shareState.history.at(-1).confirmedByUser,true);
  assert.equal(shareState.history.at(-1).provider,'manual-email-app');

  const draftEmailId=await page.evaluate(customerId=>{
    const id=uid('i');
    const due=new Date();due.setDate(due.getDate()+14);
    state.invoices.unshift({
      id,number:'CONCEPT-EMAIL',numberManaged:true,numberFinalized:false,customerId,
      issueDate:today(),supplyDate:today(),dueDate:due.toISOString().slice(0,10),paymentDays:14,
      status:'draft',taxTreatment:'standard',reference:'',paymentReference:'CONCEPT-EMAIL',
      discountType:'none',discountValue:0,notes:'',
      lines:[{desc:'Concept direct verzenden',qty:1,unitLabel:'uur',unit:100,vat:21}]
    });
    save();return id;
  },customerId);
  const sequenceBefore=await page.evaluate(()=>Number(state.meta.nextInvoice||0));
  await page.evaluate(id=>openSendInvoice(id),draftEmailId);
  await page.getByRole('heading',{name:'Deze factuur is nog een concept'}).waitFor();
  await page.getByRole('button',{name:'Definitief maken en versturen'}).click();
  await page.getByRole('heading',{name:'Factuur versturen'}).waitFor();
  const finalizedDraft=await page.evaluate(id=>{
    const i=state.invoices.find(x=>x.id===id);
    return {id:i.id,number:i.number,status:i.status,numberFinalized:!!i.numberFinalized,lastSentAt:i.lastSentAt,next:Number(state.meta.nextInvoice||0)};
  },draftEmailId);
  assert.equal(finalizedDraft.id,draftEmailId,'Finalize + send must preserve invoice identity');
  assert.equal(finalizedDraft.status,'sent');
  assert.equal(finalizedDraft.numberFinalized,true);
  assert.ok(!String(finalizedDraft.number).startsWith('CONCEPT-'));
  assert.equal(finalizedDraft.next,sequenceBefore+1,'Finalize + send must reserve exactly one number');
  assert.equal(finalizedDraft.lastSentAt,undefined,'Opening the composer after finalization is not delivery');
  await page.evaluate(()=>closeModal());
  assert.equal(await page.evaluate(id=>state.invoices.find(x=>x.id===id)?.status,draftEmailId),'sent','Cancelling after finalization must not roll the invoice back to draft');

  await page.evaluate(id=>{
    const i=state.invoices.find(x=>x.id===id);
    const due=new Date();due.setDate(due.getDate()-5);
    i.dueDate=due.toISOString().slice(0,10);
    i.status='sent';
    i.payments=[];
    i.reminderCount=0;
    delete i.lastReminderAt;
    save();
  },invoiceId);
  await page.evaluate(id=>openReminder(id),invoiceId);
  await page.getByRole('heading',{name:'Betalingsherinnering'}).waitFor();
  assert.match(await page.locator('#emailHandoffForm [name="subject"]').inputValue(),/^Herinnering factuur /);
  assert.equal(await page.locator('#emailHandoffForm [name="attachPdf"]').isChecked(),true);
  await page.evaluate(()=>prepareEmailHandoffFromComposer());
  await page.getByRole('heading',{name:'Hoe wilt u versturen'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__mailProviderAttempts),0,'Reminder must never attempt direct provider delivery');
  assert.equal(await page.evaluate(id=>state.invoices.find(x=>x.id===id)?.reminderCount||0,invoiceId),0,'Preparing a reminder must not increment reminderCount');
  await page.evaluate(()=>shareEmailHandoffPdf());
  await page.getByRole('heading',{name:'Hebt u de e-mail verzonden?'}).waitFor();
  assert.equal(await page.evaluate(id=>state.invoices.find(x=>x.id===id)?.reminderCount||0,invoiceId),0,'Opening share sheet must not increment reminderCount');
  await page.evaluate(()=>confirmEmailHandoff('native_share'));
  let reminderState=await page.evaluate(id=>{
    const i=state.invoices.find(x=>x.id===id);
    return {count:i.reminderCount,last:i.lastReminderAt,history:i.reminderHistory||[],status:i.status};
  },invoiceId);
  assert.equal(reminderState.count,1);
  assert.ok(reminderState.last);
  assert.equal(reminderState.history.at(-1).confirmedByUser,true);
  assert.equal(reminderState.status,'sent','Reminder confirmation must not change invoice financial status');

  await page.evaluate(id=>openReminder(id),invoiceId);
  await page.getByRole('heading',{name:'Betalingsherinnering'}).waitFor();
  assert.match(await page.locator('#emailHandoffForm [name="subject"]').inputValue(),/^Tweede herinnering factuur /,'Second reminder should use the clearer template');
  await page.evaluate(()=>closeModal());

  await page.evaluate(id=>{
    const i=state.invoices.find(x=>x.id===id);
    const due=new Date();due.setDate(due.getDate()+5);
    i.dueDate=due.toISOString().slice(0,10);save();
  },invoiceId);
  await page.evaluate(id=>openReminder(id),invoiceId);
  await page.getByRole('heading',{name:'Factuur is nog niet vervallen'}).waitFor();
  await page.getByRole('button',{name:'Follow-up maken'}).click();
  await page.getByRole('heading',{name:'Follow-up sturen'}).waitFor();
  assert.match(await page.locator('#emailHandoffForm [name="subject"]').inputValue(),/^Follow-up factuur /);

  for(const width of [320,360,375,390,393,430,768,1024,1280,1440]){
    await page.setViewportSize({width,height:900});
    await page.evaluate(()=>showEmailHandoffConfirmation('native_share'));
    const box=await page.locator('.modal').boundingBox();
    assert.ok(box&&box.width<=width+0.5,'Unified email confirmation modal must fit '+width+'px');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'Unified email flow must not overflow at '+width+'px');
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

  // QA-only direct production-domain smoke for the physical iPhone/Gmail regression.
  // Uses fictive in-memory data and a mocked PDF helper; no authenticated production
  // customer/invoice records are read or mutated.
  const gmailLive=await browser.newPage({viewport:{width:390,height:844}});
  const gmailLiveResponse=await gmailLive.goto('https://boekuna.nl/?login=1',{waitUntil:'domcontentloaded',timeout:45000});
  assert.ok(gmailLiveResponse && gmailLiveResponse.ok(),'boekuna.nl must answer successfully');
  await gmailLive.getByRole('heading',{name:'Inloggen'}).waitFor({timeout:15000});
  assert.match(await gmailLive.title(),/Boekuna/);

  const productionContract=await gmailLive.evaluate(()=>({
    unified:!!document.querySelector('#boekuna-unified-email-handoff-v2'),
    gmail:typeof window.buildGmailComposeUrl==='function',
    send:typeof window.openSendInvoice==='function',
    noMailboxOauth:!document.documentElement.innerHTML.includes('Gmail koppelen'),
    defaultSubject:DEFAULT_EMAIL_TEMPLATE.subjectInvoice
  }));
  assert.equal(productionContract.unified,true);
  assert.equal(productionContract.gmail,true);
  assert.equal(productionContract.send,true);
  assert.equal(productionContract.noMailboxOauth,true);
  assert.equal(productionContract.defaultSubject,'Factuur {{factuurnummer}} · {{bedrijfsnaam}}');

  const fixture=await gmailLive.evaluate(()=>{
    currentUser=TEST_USER;
    state=structuredClone(DEFAULT);
    for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
    state.company={
      ...state.company,
      name:'Kwin Phetmanee',
      tradeName:'Kwin Phetmanee',
      contactName:'Kwin Phetmanee',
      email:'k.phetmanee@gmail.com',
      phone:'+31636052860',
      address:'Teststraat 1',
      postal:'3011AA',
      city:'Rotterdam',
      country:'Nederland',
      kvk:'12345678',
      vat:'NL123456789B01',
      iban:'NL96INGB0751841897',
      invoicePrefix:'2026-',
      paymentDays:14,
      kor:false,
      emailTemplate:{...DEFAULT_EMAIL_TEMPLATE},
      invoiceDesign:{...DEFAULT_INVOICE_DESIGN}
    };
    const customer={
      id:'gmail-live-customer',
      type:'customer',
      name:'Kwin Phetmanee',
      contactPerson:'Kwin Phetmanee',
      email:'customer@example.com',
      address:'Klantstraat 2',
      postal:'3012BB',
      city:'Rotterdam'
    };
    const invoice={
      id:'gmail-live-invoice',
      number:'2026-0008',
      numberManaged:true,
      numberFinalized:true,
      customerId:customer.id,
      issueDate:'2026-09-29',
      supplyDate:'2026-09-29',
      dueDate:'2026-10-13',
      paymentDays:14,
      status:'sent',
      taxTreatment:'standard',
      reference:'',
      paymentReference:'2026-0008',
      discountType:'none',
      discountValue:0,
      notes:'',
      lines:[{desc:'Werkzaamheden',qty:1,unitLabel:'stuk',unit:250,vat:21}],
      payments:[],
      reminderCount:0
    };
    state.contacts=[customer];
    state.invoices=[invoice];
    window.__livePdfFetches=0;
    window.__liveDownloads=0;
    window.__liveGmailOpens=[];
    window.fetchInvoiceSharePdf=async function(inv,cust){
      window.__livePdfFetches++;
      return new File([new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31,0x2e,0x37])],invoiceShareFilename(inv,cust),{type:'application/pdf'});
    };
    window.downloadInvoiceShareFile=function(file){if(file){window.__liveDownloads++;return true}return false};
    window.open=function(url){window.__liveGmailOpens.push(String(url));return {closed:false}};
    Object.defineProperty(navigator,'canShare',{configurable:true,value:data=>!!data?.files?.length});
    Object.defineProperty(navigator,'share',{configurable:true,value:async ()=>{}});
    Object.defineProperty(navigator,'userAgentData',{configurable:true,value:{mobile:true}});
    return {invoiceId:invoice.id,gross:invoiceGross(invoice)};
  });

  await gmailLive.evaluate(id=>openSendInvoice(id),fixture.invoiceId);
  await gmailLive.getByRole('heading',{name:'Factuur versturen'}).waitFor({timeout:10000});
  const liveTo=await gmailLive.locator('#emailHandoffForm [name="to"]').inputValue();
  const liveSubject=await gmailLive.locator('#emailHandoffForm [name="subject"]').inputValue();
  const liveBody=await gmailLive.locator('#emailHandoffForm [name="message"]').inputValue();
  assert.equal(liveTo,'customer@example.com');
  assert.equal(liveSubject,'Factuur 2026-0008 · Kwin Phetmanee');
  assert.notEqual(liveSubject,'Factuur-2026-0008-Kwin-Phetmanee');
  assert.match(liveBody,/^Goedendag Kwin Phetmanee,\n\n/);
  assert.match(liveBody,/Factuurdatum: 29 september 2026\nVervaldatum: 13 oktober 2026/);
  assert.match(liveBody,/Met vriendelijke groet,\nKwin Phetmanee\nk\.phetmanee@gmail\.com\n\+31636052860$/);

  await gmailLive.evaluate(()=>prepareEmailHandoffFromComposer());
  await gmailLive.getByRole('heading',{name:'Hoe wilt u versturen'}).waitFor({timeout:10000});
  const chooser=await gmailLive.locator('.modal').innerText();
  assert.match(chooser,/Gmail openen/);
  assert.match(chooser,/PDF delen als bijlage/);
  assert.match(chooser,/Andere e-mailapp openen/);
  assert.match(chooser,/ontvangende app bepaalt zelf Aan en Onderwerp/);
  assert.equal(await gmailLive.getByRole('button',{name:'Gmail openen'}).evaluate(el=>el.classList.contains('primary')),true);

  await gmailLive.evaluate(()=>openEmailHandoffGmail());
  await gmailLive.getByRole('heading',{name:'Hebt u de e-mail verzonden?'}).waitFor({timeout:10000});
  const handoffState=await gmailLive.evaluate(id=>{
    const invoice=state.invoices.find(x=>x.id===id);
    return {
      url:window.__boekunaLastGmailUrl,
      pdfFetches:window.__livePdfFetches,
      downloads:window.__liveDownloads,
      opens:window.__liveGmailOpens.slice(),
      lastSentAt:invoice.lastSentAt||null,
      handoff:window.__boekunaEmailHandoffTestState()
    };
  },fixture.invoiceId);
  const parsedGmail=new URL(handoffState.url);
  assert.equal(parsedGmail.searchParams.get('to'),'customer@example.com');
  assert.equal(parsedGmail.searchParams.get('su'),'Factuur 2026-0008 · Kwin Phetmanee');
  assert.equal(parsedGmail.searchParams.get('body'),liveBody);
  assert.equal(handoffState.pdfFetches,1);
  assert.equal(handoffState.downloads,1);
  assert.equal(handoffState.opens.length,1);
  assert.equal(handoffState.lastSentAt,null,'Opening Gmail must not mark the invoice sent');
  assert.equal(handoffState.handoff.fileDownloaded,true);

  await gmailLive.evaluate(()=>emailHandoffNotSent());
  const afterCancel=await gmailLive.evaluate(id=>{
    const invoice=state.invoices.find(x=>x.id===id);
    return {lastSentAt:invoice.lastSentAt||null,sendHistory:(invoice.sendHistory||[]).length};
  },fixture.invoiceId);
  assert.equal(afterCancel.lastSentAt,null);
  assert.equal(afterCancel.sendHistory,0);
  await gmailLive.close();

  assert.deepEqual(pageErrors,[],'Browser page errors: '+pageErrors.join(' | '));
  console.log('Boekuna browser smoke: PASS (auth, CRUD, invoice integrity, native email share/fallback/cancel/confirmation, responsive layout, live availability)');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
