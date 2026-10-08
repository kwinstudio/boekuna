// Invoice e-mail in as few taps as possible, on the real production build.
// Phone: Versturen -> Open mail-app (share sheet with the PDF). Desktop: Versturen -> Open e-mail
// (mail program filled in, PDF downloaded). No chooser and no "did you send it?" step.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {PDFDocument} from 'pdf-lib';
import {buildApp,startAppServer} from './lib/app-fixture.mjs';

const engineName=(process.env.BOOKUNA_BROWSER||process.env.BROWSER)==='webkit'?'webkit':'chromium';
const engine=engineName==='webkit'?webkit:chromium;
const shots=process.env.INVOICE_SEND_SCREENSHOTS||'';
if(shots)fs.mkdirSync(shots,{recursive:true});
if(!process.env.SKIP_APP_BUILD)buildApp();
// The shared fixture predates the required supply date and managed concept numbers.
const {server,url}=await startAppServer({extraBoot:`
state.invoices.forEach(i=>{i.supplyDate=i.supplyDate||i.issueDate});
Object.assign(state.invoices.find(i=>i.id==='i2'),{number:'CONCEPT-QA',numberManaged:true,numberFinalized:false,paymentReference:'CONCEPT-QA',paymentDays:14,dueDate:'2026-10-17'});
state.meta.nextInvoice=3;
`});
const pdf=await PDFDocument.create();pdf.addPage();const pdfBytes=Buffer.from(await pdf.save());
const browser=await engine.launch({headless:true});
const errors=[];

async function openPage({mobile,theme='light'}){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:900},acceptDownloads:true});
  await context.addInitScript(([isMobile,mode])=>{
    try{localStorage.setItem('boekuna-theme',mode)}catch{}
    window.__shares=[];window.__shareMode='ok';
    Object.defineProperty(navigator,'userAgentData',{configurable:true,value:{mobile:isMobile}});
    Object.defineProperty(navigator,'canShare',{configurable:true,value:data=>!!(data&&data.files&&isMobile)});
    Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{
      if(window.__shareMode==='abort')throw new DOMException('cancelled','AbortError');
      window.__shares.push({title:data.title,text:data.text,files:data.files.map(f=>({name:f.name,type:f.type,size:f.size}))});
    }});
  },[mobile,theme]);
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  const calls={pdf:0,provider:0,fail:false};
  await page.route('**/functions/v1/send-invoice',async route=>{
    const body=route.request().postDataJSON();
    if(body.action!=='render_pdf'){calls.provider++;return route.fulfill({status:410,contentType:'application/json',body:'{"code":"MAILBOX_SEND_DISABLED"}'})}
    calls.pdf++;
    await new Promise(r=>setTimeout(r,150));
    if(calls.fail)return route.fulfill({status:503,contentType:'application/json',body:'{}'});
    return route.fulfill({status:200,contentType:'application/pdf',body:pdfBytes});
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof window.sendEmailHandoff==='function'&&document.getElementById('mainApp')?.style.display!=='none');
  return {context,page,calls};
}
const invoice=(page,id)=>page.evaluate(i=>structuredClone(state.invoices.find(x=>x.id===i)),id);

try{
  // Phone: two taps from the invoice menu.
  {
    const {context,page,calls}=await openPage({mobile:true});
    await page.evaluate(()=>{navigate('invoices');invoiceActions('i0')});
    await page.getByRole('button',{name:/Versturen via e-mail/}).click();
    await page.getByRole('heading',{name:'Factuur versturen'}).waitFor();
    const send=page.getByRole('button',{name:'Open mail-app'});
    await send.waitFor();
    assert.equal(calls.pdf,1,'the PDF is made once, while the screen is open');
    assert.equal(await page.locator('.modal-foot .btn').count(),2,'one cancel and one send button');
    assert.equal(await page.locator('#emailHandoffForm [name="to"]').inputValue(),'klant@example.test');
    assert.equal(await page.locator('#emailHandoffForm [name="subject"]').inputValue(),'Factuur 2026-0001 van Fictieve QA BV');
    const body=await page.locator('#emailHandoffForm [name="message"]').inputValue();
    assert.match(body,/^Goedendag Fictieve klant BV,\n\nHierbij ontvangt u factuur 2026-0001\. De factuur vindt u als PDF in de bijlage\.\n\nFactuurnummer: 2026-0001\nBedrag: €[ \u00a0]411,40\nFactuurdatum: 1 augustus 2026\nVervaldatum: 15 augustus 2026\n\n/);
    assert.match(body,/Wilt u het bedrag uiterlijk 15 augustus 2026 overmaken naar NL91ABNA0417164300 t\.n\.v\. Fictieve QA BV, onder vermelding van 2026-0001\?/);
    assert.match(body,/Met vriendelijke groet,\nKwin\nFictieve QA BV\nqa@example\.test$/);
    if(shots)await page.screenshot({path:`${shots}/${engineName}-mobiel-1-versturen.png`});
    await send.click();
    await page.locator('.toast.has-action').filter({hasText:'Factuur staat als verstuurd.'}).waitFor();
    const shares=await page.evaluate(()=>window.__shares);
    assert.equal(shares.length,1,'one tap opens the share sheet');
    assert.equal(shares[0].files.length,1);assert.equal(shares[0].files[0].type,'application/pdf');
    // Gmail on iPhone uses the file name as subject, Outlook the first text line; both must read as the subject.
    assert.equal(shares[0].files[0].name,'Factuur 2026-0001 van Fictieve QA BV.pdf');
    assert.equal(shares[0].title,'Factuur 2026-0001 van Fictieve QA BV');
    // Outlook turns every enter into a blank line: the shared text has the subject first and single enters only.
    assert.equal(shares[0].text,'Factuur 2026-0001 van Fictieve QA BV\n'+body.split('\n').filter(Boolean).join('\n'));
    assert.doesNotMatch(shares[0].text,/\n\n/);
    assert.match(shares[0].text,/\nGoedendag Fictieve klant BV,\nHierbij ontvangt u factuur 2026-0001\./);
    assert.equal(await page.locator('#emailHandoffForm').count(),0,'screen closes after sending');
    let i0=await invoice(page,'i0');
    assert.ok(i0.lastSentAt);assert.equal(i0.lastSentTo,'klant@example.test');assert.equal(i0.lastShareChannel,'native_share');
    assert.equal(i0.sendHistory.length,1);assert.equal(i0.status,'sent');
    if(shots)await page.screenshot({path:`${shots}/${engineName}-mobiel-2-verstuurd.png`});
    await page.getByRole('button',{name:'Ongedaan maken'}).click();
    i0=await invoice(page,'i0');
    assert.equal(i0.lastSentAt,undefined,'undo removes the sent mark');assert.equal(i0.sendHistory,undefined);

    // Cancelling the share sheet keeps the screen and does not mark anything.
    await page.evaluate(()=>{window.__shareMode='abort';openSendInvoice('i0')});
    await page.getByRole('button',{name:'Open mail-app'}).click();
    await page.locator('.toast').filter({hasText:'Niet verstuurd'}).waitFor();
    assert.equal(await page.locator('#emailHandoffForm').count(),1);
    assert.equal((await invoice(page,'i0')).lastSentAt,undefined);
    await page.evaluate(()=>{window.__shareMode='ok';closeModal()});

    // PDF failure: one clear retry, no send button until the PDF exists.
    calls.fail=true;
    await page.evaluate(()=>openSendInvoice('i0'));
    await page.getByText('PDF maken lukte niet').waitFor();
    assert.equal(await page.locator('#emailHandoffSend').isDisabled(),true);
    calls.fail=false;
    await page.getByRole('button',{name:'Opnieuw'}).click();
    await page.getByRole('button',{name:'Open mail-app'}).waitFor();
    await page.evaluate(()=>closeModal());

    // A concept: Versturen finalises it and opens the same screen, no extra question.
    const before=await page.evaluate(()=>state.meta.nextInvoice);
    await page.evaluate(()=>openSendInvoice('i2'));
    await page.getByRole('heading',{name:'Factuur versturen'}).waitFor();
    await page.getByRole('button',{name:'Open mail-app'}).waitFor();
    const i2=await invoice(page,'i2');
    assert.equal(i2.status,'sent');assert.ok(i2.number&&!/^CONCEPT/.test(i2.number));
    assert.equal(await page.evaluate(()=>state.meta.nextInvoice),before+1);
    assert.equal(i2.lastSentAt,undefined,'finalising is not sending');
    await page.evaluate(()=>closeModal());

    // Reminders use the same single screen.
    await page.evaluate(()=>openReminder('i0'));
    await page.getByRole('heading',{name:'Betalingsherinnering'}).waitFor();
    await page.getByRole('button',{name:'Open mail-app'}).click();
    await page.locator('.toast.has-action').filter({hasText:'Herinnering staat als verstuurd.'}).waitFor();
    assert.equal((await invoice(page,'i0')).reminderCount,1);
    assert.equal(calls.provider,0,'never sends through a mail provider');
    await context.close();
  }

  // Desktop: one tap opens the mail program with everything filled in; the PDF is downloaded.
  for(const theme of ['light','dark']){
    const {context,page}=await openPage({mobile:false,theme});
    await page.evaluate(()=>openSendInvoice('i0'));
    await page.getByRole('heading',{name:'Factuur versturen'}).waitFor();
    const send=page.getByRole('button',{name:'Open e-mail'});
    await send.waitFor();
    assert.equal(await page.getByRole('button',{name:'Gmail in de browser gebruiken'}).count(),1);
    if(shots)await page.screenshot({path:`${shots}/${engineName}-desktop-${theme}-versturen.png`});
    if(theme==='light'){
      // WebKit's test build has no mail handler; there the hand-off itself is recorded instead.
      if(engineName==='webkit')await page.evaluate(()=>{window.openMailtoUri=uri=>{window.__openedMailto=uri}});
      const download=page.waitForEvent('download');
      await send.click();
      assert.equal((await download).suggestedFilename(),'Factuur 2026-0001 van Fictieve QA BV.pdf');
      await page.locator('.toast.has-action').waitFor();
      const mailto=await page.evaluate(()=>window.__boekunaLastMailto);
      assert.match(mailto,/^mailto:klant%40example\.test\?subject=Factuur%202026-0001%20van%20Fictieve%20QA%20BV&body=/);
      assert.match(decodeURIComponent(mailto),/Hierbij ontvangt u factuur 2026-0001/);
      const i0=await invoice(page,'i0');
      assert.equal(i0.lastShareChannel,'mailto');assert.ok(i0.lastSentAt);
    }
    await context.close();
  }

  // Dark phone screenshot, then layout at every width.
  {
    const {context,page}=await openPage({mobile:true,theme:'dark'});
    await page.evaluate(()=>openSendInvoice('i0'));
    await page.getByRole('button',{name:'Open mail-app'}).waitFor();
    if(shots)await page.screenshot({path:`${shots}/${engineName}-mobiel-donker-versturen.png`});
    for(const width of [320,360,390,430,768,1024,1440]){
      await page.setViewportSize({width,height:860});
      const box=await page.locator('.modal').boundingBox();
      assert.ok(box&&box.width<=width+0.5,'send screen fits '+width+'px');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'no sideways scroll at '+width+'px');
      const foot=await page.locator('.modal-foot').boundingBox();
      assert.ok(foot&&foot.y+foot.height<=860+1,'send button visible at '+width+'px');
    }
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log(`Invoice send simple (${engineName}): PASS (phone 2 taps with PDF, desktop mailto + PDF, undo, cancel, PDF retry, concept, reminder, widths)`);
}finally{await browser.close();await new Promise(r=>server.close(r))}
