// Bonnen mailen (Kwin 2026-11-04, UI-trucs 18): your own address in Instellingen, one quiet line in Bonnen,
// and a mailed receipt in the list marked "via mail". The address RPC is a stub; the server side has its own
// tests (inbound-mail-sql, inbound-mail-function). Chromium and WebKit (BOOKUNA_BROWSER=webkit).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';

execFileSync(process.execPath,['scripts/build-app.mjs']);
const generated=fs.readFileSync('dist/app/index.html','utf8');
const browserName=process.env.BOOKUNA_BROWSER||'chromium';
const boot=`currentUser={...TEST_USER,email:'qa@example.test'};state=structuredClone(DEFAULT);
for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
state.company={...state.company,name:'Fictieve QA BV',tradeName:'',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',kvk:'12345678',vat:'NL123456789B01',email:'qa@example.test',iban:'NL91ABNA0417164300'};
state.documents=[{id:'doc1',fileId:'f1',name:'bon.jpg',type:'Bon',date:'2026-11-10',processingState:'ready'}];
documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;enterApp();`;
const html=generated.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;').replace(/initAuth\(\);(?![\s\S]*initAuth\(\);)/,boot);
const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  const p=new URL(req.url,'http://localhost').pathname;
  if(p.startsWith('/assets/')){const f=path.resolve('dist/app'+p);if(fs.existsSync(f)){res.setHeader('Content-Type',types[path.extname(f)]||'image/png');return res.end(fs.readFileSync(f))}res.writeHead(404);return res.end()}
  res.setHeader('Content-Type','text/html');res.end(html);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
const browser=await (browserName==='webkit'?webkit:chromium).launch();
const errors=[];
// The stand-in for public.inbound_address_mine: reading never makes an address, create does, rotate makes a new one.
const stub=()=>{
  window.__inbound={calls:[],local:null};
  window.boekunaInboundMailRpc=async args=>{
    window.__inbound.calls.push(args);
    if(args.p_rotate)window.__inbound.local='fictieveqabv-bbbbbbbbbbbb';
    else if(args.p_create&&!window.__inbound.local)window.__inbound.local='fictieveqabv-aaaaaaaaaaaa';
    return {data:window.__inbound.local,error:null};
  };
};
async function openApp({withStub=true,width=390}={}){
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:width<820,isMobile:browserName==='chromium'&&width<820,locale:'nl-NL'});
  if(browserName==='chromium')await context.grantPermissions(['clipboard-read','clipboard-write']);
  if(withStub)await context.addInitScript(stub);
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('dialog',d=>d.accept()); // klopt.js is off in tests, so "Nieuw adres" asks with the browser's own dialog
  page.setDefaultTimeout(5000);
  await page.goto(url+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#mainApp').waitFor();
  return {context,page};
}
const calls=page=>page.evaluate(()=>window.__inbound.calls);

try{
  {
    const {context,page}=await openApp();
    // Bonnen: no address yet, so a quiet line that offers one. Looking it up never creates it.
    await page.evaluate(()=>navigate('documents'));
    const hint=page.locator('#content .inbound-mail-hint');
    await hint.waitFor();
    assert.match(await hint.innerText(),/Je kunt bonnen ook mailen/);
    assert.deepEqual((await calls(page)).map(c=>c.p_create),[false],'Visiting Bonnen only reads');
    // Visiting Instellingen does not make an address either; opening "Bonnen mailen" does.
    await page.evaluate(()=>navigate('settings'));
    await page.locator('#settingsCenter [data-settings-open="mailin"]').first().waitFor();
    assert.ok(!(await calls(page)).some(c=>c.p_create),'Instellingen alone makes nothing');
    await page.evaluate(()=>navigate('documents'));
    await hint.getByRole('button',{name:'Adres maken'}).click();
    const panel=page.locator('#settings-panel-mailin');
    await panel.locator('.inbound-mail-text').waitFor();
    assert.equal(await panel.locator('.inbound-mail-text').innerText(),'fictieveqabv-aaaaaaaaaaaa@bon.boekuna.nl');
    const created=(await calls(page)).find(c=>c.p_create);
    assert.equal(created.p_hint,'Fictieve QA BV','The company name gives the readable start');
    assert.deepEqual(created.p_company,{name:'Fictieve QA BV',tradeName:'',kvk:'12345678',vat:'NL123456789B01'},'The processor gets the company to tell a purchase from a sale');
    assert.match(await panel.innerText(),/Stuur een bon of factuur naar dit adres/);
    assert.match(await panel.innerText(),/of de bon in de mail zelf/,'A webshop mail without attachment works too');
    await panel.locator('.inbound-mail-events').waitFor();
    assert.match(await panel.locator('.inbound-mail-events').innerText(),/Laatste mails[\s\S]*Nog geen mail ontvangen/);
    assert.equal(await panel.locator('.inbound-mail-card').count(),1,'One panel, not one inside another');
    // Copy.
    await panel.getByRole('button',{name:'Kopiëren'}).click();
    await panel.getByRole('button',{name:'Gekopieerd'}).waitFor();
    if(browserName==='chromium')assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'fictieveqabv-aaaaaaaaaaaa@bon.boekuna.nl');
    // Nieuw adres: asked first, then the old one is gone.
    await panel.getByRole('button',{name:'Nieuw adres'}).click();
    await page.waitForFunction(()=>document.querySelector('#settings-panel-mailin .inbound-mail-text')?.textContent.includes('bbbb'));
    assert.ok((await calls(page)).some(c=>c.p_rotate));
    await page.locator('.toast',{hasText:'Nieuw adres gemaakt'}).first().waitFor();
    // Settings search finds it by the words people use.
    await page.evaluate(async()=>{await navigate('settings');window.boekunaSettingsSearch('mailen')});
    assert.equal(await page.locator('#settingsCenter .settings-center-nav li:not([hidden]) [data-settings-open="mailin"]').count(),1);
    // Back in Bonnen the line shows the address with a copy button.
    await page.evaluate(()=>navigate('documents'));
    await hint.locator('b').waitFor();
    assert.match(await hint.innerText(),/Mail bonnen naar fictieveqabv-bbbbbbbbbbbb@bon\.boekuna\.nl/);
    assert.equal(await hint.getByRole('button',{name:'Kopiëren'}).count(),1);
    const box=await hint.boundingBox();assert.ok(box.width<=390,'The line fits the phone');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No sideways scroll');
    // A mailed receipt the app has not seen yet lands in the list, marked "via mail", ready to check.
    await page.evaluate(()=>{
      const job={id:'job-mail',document_id:'d-mail',client_ref:'mail-em1-att1',batch_id:'mail-em1',file_name:'Factuur Bol.com.pdf',mime_type:'application/pdf',size_bytes:2048,requested_kind:'auto',state:'review_required',phase:'complete',attempt:1,max_attempts:3,result:{analysis:{documentType:'purchase_invoice'}},review_fields:['gross'],review_message:'Controleer totaal.',created_at:'2026-11-12T09:00:00Z',updated_at:'2026-11-12T09:01:00Z'};
      applyDocumentProcessingJobs([job]);
    });
    const added=await page.evaluate(()=>state.documents.find(d=>d.fileId==='mail-em1-att1'));
    assert.equal(added.source,'mail');assert.equal(added.name,'Factuur Bol.com.pdf');
    await page.locator('#content .mobile-card-title',{hasText:'Factuur Bol.com.pdf'}).waitFor();
    assert.equal(await page.evaluate(()=>persistentDocumentAttentionCount()),1,'It counts as a document to check');
    // The processing card says where it came from.
    assert.match(await page.evaluate(()=>persistentDocumentCardHtml(documentProcessingJobs[0])),/document-mail-tag">via mail/);
    await context.close();
  }
  {
    // No address RPC (test mode without a stub, like every other test): nothing about mail anywhere.
    const {context,page}=await openApp({withStub:false});
    await page.evaluate(()=>navigate('documents'));
    await page.locator('#content .documents-workspace').waitFor();
    assert.equal(await page.locator('.inbound-mail-hint,[data-inbound-mail]').count(),0);
    await page.evaluate(()=>navigate('settings'));
    await page.locator('#settingsCenter').waitFor();
    assert.equal(await page.locator('[data-settings-open="mailin"]').count(),0);
    await context.close();
  }
  {
    // The address cannot be read (server or network trouble): Bonnen stays quiet instead of offering it.
    const {context,page}=await openApp();
    await page.evaluate(()=>{window.boekunaInboundMailRpc=async()=>({data:null,error:{message:'Could not find the function'}})});
    await page.evaluate(()=>navigate('documents'));
    await page.locator('#content .documents-workspace').waitFor();
    await page.waitForFunction(()=>inboundAddress.loaded&&!inboundAddress.loading);
    assert.equal(await page.evaluate(()=>inboundAddress.error),'failed');
    assert.equal(await page.locator('#content .inbound-mail-hint').count(),0,'No offer when the address cannot be read');
    await context.close();
  }
  {
    // What happened to the last mails, and Gmail's forwarding check with its code and Google's own link.
    const {context,page}=await openApp();
    await page.evaluate(()=>{
      const now=Date.now(),iso=m=>new Date(now-m*60000).toISOString();
      window.__events=[
        {created_at:iso(1),outcome:'forward_confirm',files:0,detail:{subject:'(#481516234) Gmail Forwarding Confirmation',code:'481516234',link:'https://mail-settings.google.com/mail/vf-%5BABC%5D-x',account:'kwin@gmail.example'}},
        {created_at:iso(5),outcome:'stored',files:2,detail:{subject:'Factuur KPN november'}},
        {created_at:iso(9),outcome:'stored',files:1,detail:{subject:'Je bestelling bij bol',from_text:'1'}},
        {created_at:iso(20),outcome:'no_files',files:0,detail:{subject:'test'}},
        {created_at:iso(30),outcome:'limited',files:0}
      ];
      window.boekunaInboundMailEvents=async()=>window.__events.map(e=>({...e,detail:e.detail&&{...e.detail}}));
    });
    await page.evaluate(()=>window.openSettingsSection('mailin'));
    const panel=page.locator('#settings-panel-mailin');
    await panel.locator('.inbound-mail-text').waitFor();
    await panel.locator('.inbound-mail-events li').nth(4).waitFor();
    const items=await panel.locator('.inbound-mail-events li').allInnerTexts();
    assert.equal(items.length,5);
    assert.match(items[0],/Gmail Forwarding Confirmation[\s\S]*Gmail vraagt om bevestiging/);
    assert.match(items[1],/Factuur KPN november[\s\S]*Vandaag \d\d:\d\d · 2 bonnen opgeslagen/);
    assert.match(items[2],/Je bestelling bij bol[\s\S]*Bon uit de mail opgeslagen/);
    assert.match(items[3],/test[\s\S]*Geen bon gevonden/);
    assert.match(items[4],/Mail[\s\S]*Daglimiet bereikt/,'No subject (before the migration): just "Mail"');
    const confirm=panel.locator('.inbound-mail-confirm');
    assert.match(await confirm.innerText(),/Gmail wil bonnen doorsturen[\s\S]*kwin@gmail\.example[\s\S]*481516234/);
    const link=confirm.getByRole('link',{name:'Bevestigen in Gmail'});
    assert.equal(await link.getAttribute('href'),'https://mail-settings.google.com/mail/vf-%5BABC%5D-x');
    assert.equal(await link.getAttribute('target'),'_blank');assert.match(await link.getAttribute('rel'),/noopener/);
    await confirm.getByRole('button',{name:'Kopiëren'}).click();
    await confirm.getByRole('button',{name:'Gekopieerd'}).waitFor();
    if(browserName==='chromium')assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'481516234');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No sideways scroll');
    // Someone else's link never becomes a button.
    await page.evaluate(()=>{window.__events[0].detail.link='https://evil.example/mail/vf-x';return refreshInboundEvents()});
    assert.equal(await panel.locator('.inbound-mail-confirm a').count(),0);
    assert.match(await panel.locator('.inbound-mail-confirm').innerText(),/481516234/);
    // Once forwarded mail arrives, the check is gone.
    await page.evaluate(()=>{window.__events.unshift({created_at:new Date().toISOString(),outcome:'stored',files:1,detail:{subject:'Doorgestuurd: bon'}});return refreshInboundEvents()});
    assert.equal(await panel.locator('.inbound-mail-confirm').count(),0,'Forwarding works, so the check is gone');
    assert.equal(await panel.locator('.inbound-mail-events li').count(),5,'The last five');
    // The newest mail had no bon: one short line says what to do.
    await page.evaluate(()=>{window.__events.unshift({created_at:new Date().toISOString(),outcome:'no_files',files:0,detail:{subject:'zie bijlage'}});return refreshInboundEvents()});
    assert.match(await panel.locator('.inbound-mail-events').innerText(),/Stuur de bon mee als pdf of foto/);
    await context.close();
  }
  {
    // Desktop: the list says "via mail" next to the kind of document; the same panel in the settings column.
    const {context,page}=await openApp({width:1280});
    await page.evaluate(()=>{state.documents.unshift({id:'dm',fileId:'mail-em2-att1',name:'Factuur KPN.pdf',type:'Factuur',date:'2026-11-12',source:'mail'});navigate('documents')});
    await page.locator('#content tr',{hasText:'Factuur KPN.pdf'}).waitFor();
    assert.match(await page.locator('#content tr',{hasText:'Factuur KPN.pdf'}).innerText(),/Factuur · via mail/);
    await page.evaluate(()=>window.openSettingsSection('mailin'));
    await page.locator('#settings-panel-mailin .inbound-mail-text').waitFor();
    assert.equal(await page.locator('#settings-panel-mailin .inbound-mail-text').innerText(),'fictieveqabv-aaaaaaaaaaaa@bon.boekuna.nl');
    await context.close();
  }
  assert.deepEqual(errors,[],'No page errors');
  console.log('Bonnen mailen ok ('+browserName+')');
}finally{
  await browser.close();server.close();
}
