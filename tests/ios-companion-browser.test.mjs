// Uses the production app build and the user-agent from the actual iOS shell.
// Fake authentication/billing data only; no real backend or payment is contacted.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {buildApp,startAppServer} from './lib/app-fixture.mjs';
buildApp();
const swift=fs.readFileSync('ios/Boekuna/WebView.swift','utf8');
const suffix=swift.match(/configuration.applicationNameForUserAgent = "([^"]+)"/)[1].replace(/\\\(version\)/g,'1.0.0');
const {server,url}=await startAppServer();
const name=process.env.BOOKUNA_BROWSER==='webkit'?'webkit':'chromium';
const browser=await (name==='webkit'?webkit:chromium).launch();
const errors=[];
try{
 for(const ua of [suffix,'Boekuna-iOS/1.0.0','BoekunaNative/1.0']){
  const ctx=await browser.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 '+ua});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url+'?login=1&app=1');
  await page.waitForFunction(()=>document.getElementById('mainApp')?.style.display!=='none');
  assert.equal(await page.evaluate(()=>isNativeStoreShell()),true,'actual native user-agent must activate purchase guards: '+ua);
  for(const status of ['free','active','past_due']){
   await page.evaluate(status=>{
    billingSnapshot={plan:status==='free'?'free':'zzp',status,entitlement_status:status==='free'?'free':'paid',access_source:'stripe',can_manage_subscription:true,monthly_limit:100,used:4,remaining:96,tester_access_used:true};
    navigate('settings');document.getElementById('billingCard').outerHTML=renderBillingCard();openSettingsSection('billing');
   },status);
   const card=page.locator('#billingCard');
   assert.equal(await card.locator('a[href*="prijzen"],button[onclick*="Subscription"],button[onclick*="BillingPortal"]').count(),0);
   assert.doesNotMatch(await card.innerText(),/op boekuna\.nl|https:\/\/boekuna\.nl|Beheer abonnement|Kies een pakket|zelf een abonnement kiest/,'no external purchase prompts');
  }
  await page.evaluate(()=>{
   window.__paymentRequests=[];
   fetchWithAuthRetry=async url=>{window.__paymentRequests.push(url);return new Response('{}',{status:503})};
   loadBillingSummary=async()=>billingSnapshot;
  });
  await page.evaluate(async()=>{await confirmSubscriptionCheckout('zzp','month');await openBillingPortal();startSubscription('zzp','month')});
  assert.deepEqual(await page.evaluate(()=>window.__paymentRequests),[],'direct payment entry points must also be guarded');
  await page.evaluate(()=>showPlanUpsell(1,'Bonnetjes'));
  assert.equal(await page.getByRole('dialog').locator('.modal-foot').getByRole('button',{name:'Sluiten',exact:true}).count(),1);
  assert.doesNotMatch(await page.getByRole('dialog').innerText(),/boekuna\.nl|Stripe|Kies ZZP/);
  // Native print/PDF must reuse the authoritative PDF, without a blank popup or status change.
  await page.evaluate(()=>{
   closeModal();window.__pdfRequests=0;
   window.fetchInvoiceSharePdf=async()=>{window.__pdfRequests++;return new File(['%PDF-1.4\\nSynthetic test'],'native-invoice.pdf',{type:'application/pdf'})};
   window.open=()=>{throw new Error('native PDF must not open a blank window')};
  });
  const beforeStatus=await page.evaluate(()=>state.invoices[0].status);
  const [invoiceDownload]=await Promise.all([page.waitForEvent('download'),page.evaluate(async()=>{await printInvoice('i0')})]);
  assert.equal(invoiceDownload.suggestedFilename(),'native-invoice.pdf');
  assert.equal(await page.evaluate(()=>window.__pdfRequests),1);
  assert.equal(await page.evaluate(()=>state.invoices[0].status),beforeStatus);
  await page.evaluate(()=>{
   window.__nativePrint=[];
   window.webkit={messageHandlers:{boekunaPrint:{postMessage:payload=>window.__nativePrint.push(payload)}}};
   openA4Preview({title:'Rapport',frameTitle:'Rapport',html:'<html><body>Fictieve rapportcijfers</body></html>',print:true});
   printReportPreview();
  });
  assert.equal(await page.evaluate(()=>window.__nativePrint.length),1);
  assert.match(await page.evaluate(()=>window.__nativePrint[0].html),/Fictieve rapportcijfers/);
  await page.evaluate(()=>{closeModal();deleteAccountDialog()});
  assert.ok(await page.getByRole('button',{name:'Definitief verwijderen'}).isVisible(),'deletion remains reachable');
  await page.evaluate(()=>closeModal());
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=1,true);
  await ctx.close();
 }
 // An ordinary web browser (even with ?app=1) retains the existing purchase route.
 const web=await browser.newPage({viewport:{width:390,height:844}});
 await web.goto(url+'?app=1');
 await web.waitForFunction(()=>document.getElementById('mainApp')?.style.display!=='none');
 assert.equal(await web.evaluate(()=>isNativeStoreShell()),false);
 await web.evaluate(()=>{billingSnapshot={plan:'free',status:'free',entitlement_status:'free',monthly_limit:100,used:0};navigate('settings');document.getElementById('billingCard').outerHTML=renderBillingCard();openSettingsSection('billing')});
 assert.ok(await web.getByRole('button',{name:'Kies ZZP'}).isVisible());
 await web.close();assert.deepEqual(errors,[]);
 console.log('PASS iOS companion actual UA, free/paid/past-due UI, guarded payment entry points, deletion and web parity ('+name+')');
}finally{await browser.close();await new Promise(r=>server.close(r))}
