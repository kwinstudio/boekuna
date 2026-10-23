// Android app shell: the WebView shim (mobile/android/app/src/main/assets/boekuna/android-shim.js)
// must turn the app's browser-only file actions into native messages, in the real built app.
// Android WebView has no Web Share API and ignores <a download>; desktop Chromium on Linux
// has no navigator.share either, so this runs the shim the way the Android app does.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {buildApp,startAppServer} from './lib/app-fixture.mjs';

const SHIM=fs.readFileSync('mobile/android/app/src/main/assets/boekuna/android-shim.js','utf8');
// Stand-in for the native WebMessageListener: records what the app would hand to Android.
const NATIVE='window.__nativeMessages=[];window.BoekunaAndroid={postMessage(m){window.__nativeMessages.push(JSON.parse(m))}};';

buildApp();
const {server,url}=await startAppServer({headBoot:NATIVE+SHIM});
const browser=await chromium.launch();
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36 BoekunaNative'});
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(()=>typeof window.exportBackup==='function'&&document.querySelector('#app, main, .app'));
  assert.equal(await page.evaluate(()=>typeof navigator.share),'function','share polyfill installed');
  assert.equal(await page.evaluate(()=>typeof isNativeStoreShell==='function'&&isNativeStoreShell()),true,'app recognises the Android shell');
  const take=async(action)=>{
    await page.waitForFunction(a=>window.__nativeMessages.some(m=>m.action===a),action,{timeout:10000});
    return page.evaluate(a=>{const i=window.__nativeMessages.findIndex(m=>m.action===a);return window.__nativeMessages.splice(i,1)[0]},action);
  };
  const decode=b64=>Buffer.from(b64,'base64');

  // 1. Back-up export uses the app's download(): saved to Downloads, real JSON.
  await page.evaluate(()=>exportBackup());
  let msg=await take('save');
  assert.match(msg.name,/^boekhouding-backup-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(JSON.parse(decode(msg.data).toString('utf8')).company.name,'Fictieve QA BV');

  // 2. Invoice PDF download fallback.
  const pdf='%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF';
  await page.evaluate(p=>downloadInvoiceShareFile(new File([p],'Factuur 2026-0001.pdf',{type:'application/pdf'})),pdf);
  msg=await take('save');
  assert.equal(msg.name,'Factuur 2026-0001.pdf');assert.equal(msg.mime,'application/pdf');
  assert.equal(decode(msg.data).toString('latin1'),pdf);

  // 3. Mailing an invoice: the app shares the PDF file; the shim hands it to the Android share sheet.
  const canShare=await page.evaluate(p=>canNativeShareInvoiceFile(new File([p],'f.pdf',{type:'application/pdf'})),pdf);
  assert.equal(canShare,true,'app sees file sharing as available');
  await page.evaluate(p=>navigator.share({title:'Factuur 2026-0001',text:'Bijgaand de factuur.',files:[new File([p],'Factuur 2026-0001.pdf',{type:'application/pdf'})]}),pdf);
  msg=await take('share');
  assert.equal(msg.name,'Factuur 2026-0001.pdf');assert.equal(msg.title,'Factuur 2026-0001');assert.equal(msg.text,'Bijgaand de factuur.');

  // 4. "PDF / print" of an invoice writes into window.open(''): printed natively, app stays put.
  const before=page.url();
  await page.evaluate(()=>printInvoice('i0'));
  msg=await take('print');
  assert.ok(msg.html.includes('2026-0001'),'invoice HTML reaches the printer');
  assert.equal(page.url(),before);

  // 5. Report PDF prints from its preview iframe.
  await page.evaluate(()=>printReport());
  await page.waitForFunction(()=>document.getElementById('reportPreviewFrame')?.contentDocument?.body?.textContent?.length>20);
  await page.evaluate(()=>printReportPreview());
  msg=await take('print');
  assert.ok(msg.html.length>500,'report HTML reaches the printer');
  await page.evaluate(()=>closeModal());

  // 6. Document viewer: tapping Downloaden (a real click on a blob link) saves the file.
  await page.evaluate(p=>BoekunaDocumentViewer.open({file:new File([p],'bon-kantoor.pdf',{type:'application/pdf'}),name:'bon-kantoor.pdf'}),pdf);
  await page.click('.docviewer-download');
  msg=await take('save');
  assert.equal(msg.name,'bon-kantoor.pdf');
  await page.evaluate(()=>BoekunaDocumentViewer.close());

  // 7. Opening a blob in a new tab opens it with an Android app instead of replacing Boekuna.
  await page.evaluate(()=>{window.open(URL.createObjectURL(new Blob(['x'],{type:'image/png'})),'_blank')});
  msg=await take('open');
  assert.equal(msg.mime,'image/png');assert.equal(page.url(),before);

  // Normal links and navigation still work.
  await page.evaluate(()=>navigate('invoices'));
  await page.waitForFunction(()=>document.body.textContent.includes('2026-0001'));
  assert.deepEqual(errors,[],'no page errors');
  console.log('android-shell-browser: 7 native file actions verified');
}finally{
  await browser.close();server.close();
}
