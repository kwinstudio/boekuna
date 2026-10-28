// Terugkerende facturen and the bank-file help (gebruikerssimulatie 2026-10-28), on the real production build.
// A schedule only ever puts a concept ready: no payments, no send history, a concept number, and omzet/btw
// stay the same until the user makes the concept final.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {buildApp,startAppServer} from './lib/app-fixture.mjs';

const engine=(process.env.BOOKUNA_BROWSER||process.env.BROWSER)==='webkit'?webkit:chromium;
if(!process.env.SKIP_APP_BUILD)buildApp();
const {server,url}=await startAppServer();
const browser=await engine.launch({headless:true});
const errors=[];

async function openPage(mobile){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:900}});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof window.openRecurringInvoice==='function'&&document.getElementById('mainApp')?.style.display!=='none');
  return {context,page};
}
const finalTotals=page=>page.evaluate(()=>{const inv=state.invoices.filter(i=>i.status!=='draft');return {net:inv.reduce((s,i)=>s+invoiceNet(i),0),vat:inv.reduce((s,i)=>s+invoiceVat(i),0),count:inv.length}});

try{
  // Date arithmetic keeps the day of the month: 31 jan -> 28 feb -> 31 mrt; quarters and years too.
  {
    const {context,page}=await openPage(false);
    const dates=await page.evaluate(()=>[1,2,3].map(n=>recurringInvoiceOccurrence('2026-01-31','month',n)).concat([recurringInvoiceOccurrence('2026-11-30','quarter',1),recurringInvoiceOccurrence('2028-02-29','year',1)]));
    assert.deepEqual(dates,['2026-02-28','2026-03-31','2026-04-30','2027-02-28','2029-02-28']);
    await context.close();
  }

  for(const mobile of [true,false]){
    const {context,page}=await openPage(mobile);
    const label=mobile?'phone':'desktop';
    const before=await finalTotals(page);
    const source=await page.evaluate(()=>structuredClone(state.invoices.find(i=>i.id==='i0')));
    const now=await page.evaluate(()=>today());

    // The invoice sheet offers Herhalen; the sheet asks only how often and from when.
    await page.evaluate(()=>{navigate('invoices');invoiceActions('i0')});
    assert.equal(await page.locator('#modalRoot .invoice-action-more .recurring-action').count(),1,label+': Herhalen waits under Meer');
    await page.locator('#modalRoot .invoice-action-more summary').click();
    await page.getByRole('button',{name:/Herhalen/}).click();
    await page.getByRole('heading',{name:'Terugkerende factuur'}).waitFor();
    await page.getByText('Er gaat niets vanzelf naar je klant').waitFor();
    assert.equal(await page.locator('#recurringForm input[name="every"]').count(),3,label+': three choices');
    await page.locator('#recurringStart').fill(now);
    await page.getByRole('button',{name:'Opslaan'}).click();

    // Today is the first date, so one concept is ready right away, and only one, however often we render.
    await page.evaluate(()=>{render();render();runRecurringInvoices()});
    const made=await page.evaluate(()=>state.invoices.filter(i=>i.recurringId));
    assert.equal(made.length,1,label+': exactly one concept');
    const copy=made[0];
    assert.equal(copy.status,'draft');
    assert.match(copy.number,/^CONCEPT-/,label+': concept number, no gap in the number series');
    assert.deepEqual(copy.payments,[]);
    assert.equal(copy.issueDate,now);
    assert.equal(copy.lastSentAt,undefined);
    assert.deepEqual(copy.lines,source.lines,label+': same lines as the source');
    assert.equal(copy.customerId,source.customerId);
    const after=await finalTotals(page);
    assert.deepEqual(after,before,label+': omzet and btw unchanged by a concept');
    assert.deepEqual(await page.evaluate(()=>structuredClone(state.invoices.find(i=>i.id==='i0'))),source,label+': source invoice untouched');

    // Inkomsten shows one quiet row with the schedules.
    await page.evaluate(()=>{closeModal();navigate('invoices')});
    await page.locator('.recurring-strip').getByText('Terugkerend · 1 factuur').waitFor();
    // Really visible: not hidden behind the filters on a phone.
    await page.locator('.recurring-strip').scrollIntoViewIfNeeded();await page.waitForTimeout(300);
    const hit=await page.evaluate(()=>{const el=document.querySelector('.recurring-strip');const r=el.getBoundingClientRect();const top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!top&&el.contains(top)});
    assert.ok(hit,label+': Terugkerend row can be tapped');

    // The newest invoice in the chain is the template: a price changed in the concept carries on.
    await page.evaluate(()=>{const c=state.invoices.find(i=>i.recurringId);c.lines[0].unit=95;const r=state.recurringInvoices[0];r.start=addDateOnlyDays(today(),-62);r.made=1;render()});
    const chain=await page.evaluate(()=>state.invoices.filter(i=>i.recurringId).map(i=>({date:i.issueDate,unit:i.lines[0].unit})));
    assert.ok(chain.length>=2,label+': missed month caught up');
    assert.equal(chain[0].unit,95,label+': follows the newest concept');
    assert.ok(chain.every(i=>i.date<=now),label+': nothing dated in the future');

    // The sheet of a chained invoice shows the schedule; Stoppen ends it and keeps the invoices.
    const count=chain.length;
    await page.evaluate(()=>{const c=state.invoices.find(i=>i.recurringId);invoiceActions(c.id)});
    await page.getByRole('button',{name:/Elke maand herhalen/}).click();
    await page.getByRole('button',{name:'Stoppen'}).click();
    await page.evaluate(()=>{const r=state.recurringInvoices[0];r.start='2020-01-01';r.made=0;render();runRecurringInvoices()});
    assert.equal(await page.evaluate(()=>state.invoices.filter(i=>i.recurringId).length),count,label+': stopped means stopped');
    assert.equal(await page.locator('.recurring-strip').count(),0,label+': no row without running schedules');

    // Credit notes never repeat.
    const credit=await page.evaluate(()=>{state.invoices.push({id:'cr1',number:'CR-1',kind:'credit',status:'sent',customerId:'c0',issueDate:'2026-09-01',dueDate:'2026-09-01',lines:[{desc:'x',qty:-1,unit:10,vat:21}],payments:[]});invoiceActions('cr1');return document.querySelector('#modalRoot .recurring-action')===null});
    assert.ok(credit,label+': no Herhalen on a credit note');
    await page.evaluate(()=>closeModal());

    // Bank: where do I find the file, from the empty page.
    await page.evaluate(()=>{state.transactions=[];navigate('bank')});
    await page.getByRole('button',{name:'Waar vind ik dit bestand?'}).first().click();
    await page.getByRole('heading',{name:'Waar vind ik mijn bankbestand?'}).waitFor();
    for(const bank of ['ING','Rabobank','ABN AMRO','Knab','bunq'])await page.locator('.bank-download-help dt',{hasText:bank}).first().waitFor();
    const box=await page.locator('#modalRoot .modal').boundingBox();
    assert.ok(box&&box.width<=(mobile?390:1366),label+': help fits the screen');
    // A PDF instead of a CSV: the error offers the same help.
    await page.evaluate(()=>{closeModal();showBankImportError('pdf')});
    await page.locator('#modalRoot').getByRole('button',{name:'Waar vind ik dit bestand?'}).waitFor();
    await context.close();
  }
  assert.deepEqual(errors,[],'page errors');
  console.log('Recurring invoices and bank help: PASS');
}finally{
  await browser.close();server.close();
}
