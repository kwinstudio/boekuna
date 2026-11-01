// Vertrouwen (Kwin 2026-11-01, "slechte reviews concurrenten"): what customers of other bookkeeping apps complain about,
// done right. Price promise + cancelling on Abonnement, calm to-dos on the overview (failed payment, smart-scan limit,
// old bank file, invoice not sent), "Om na te kijken" on Btw and several costs at once on Kosten.
// Phone and desktop, Chromium and WebKit (BOOKUNA_BROWSER=webkit).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';

execFileSync(process.execPath,['scripts/build-app.mjs']);
const generated=fs.readFileSync('dist/app/index.html','utf8');
assert.match(generated,/vertrouwen\.js\?v=/,'the app loads vertrouwen.js');
assert.match(generated,/vertrouwen\.css\?v=/,'the app loads vertrouwen.css');
const browserName=process.env.BOOKUNA_BROWSER||'chromium';
// A fixed day in Q4 2026, so "made two days ago" and "30 days ago" mean the same on every run.
const NOW='2026-11-20T10:00:00';
const boot=`currentUser={...TEST_USER,email:'qa@example.test'};state=structuredClone(DEFAULT);
for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
state.company={...state.company,name:'Fictieve QA BV',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',kvk:'12345678',vat:'NL123456789B01',email:'qa@example.test',iban:'NL91ABNA0417164300'};
state.contacts=[{id:'c1',type:'customer',name:'Fictieve Schilders',email:'klant@example.test',address:'Klantstraat 2',postal:'3011AB',city:'Rotterdam'}];
state.invoices=[
 {id:'i1',number:'2026-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:'2026-11-18',dueDate:'2026-12-02',lines:[{desc:'Fictieve dienst',qty:2,unit:100,unitLabel:'uur',vat:21}],payments:[]},
 {id:'i2',number:'2026-0002',customerId:'c1',status:'sent',kind:'invoice',issueDate:'2026-11-18',dueDate:'2026-12-02',lines:[{desc:'Zonder btw',qty:1,unit:50,unitLabel:'stuk',vat:0}],payments:[],lastSentAt:'2026-11-18T10:00:00Z'}
];
state.expenses=[
 {id:'e1',date:'2026-11-03',vendor:'Fictieve Telecom',category:'Telefoon en internet',exVat:30,vatAmount:2.7,gross:32.7,vatRate:9},
 {id:'e2',date:'2026-11-04',vendor:'Fictieve Pomp',category:'Kantoor',exVat:50,vatAmount:10.5,gross:60.5,vatRate:21},
 {id:'e3',date:'2026-11-04',vendor:'Fictieve Pomp',category:'Kantoor',exVat:50,vatAmount:10.5,gross:60.5,vatRate:21}
];
state.transactions=[{id:'t1',date:'2026-10-20',amount:-60.5,description:'Fictieve Pomp',status:'unmatched'}];
state.audit=[{id:'a1',at:'2026-10-21T09:00:00Z',action:'Bankbestand geïmporteerd',detail:'1 nieuw'}];
billingSnapshot={plan:'zzp',status:'past_due',entitlement_status:'paid',access_source:'stripe',can_manage_subscription:true,monthly_limit:100,used:85,remaining:15,current_period_end:'2026-12-03T00:00:00Z',details:{billing_interval:'month',unit_amount_cents:995}};
billingSnapshotSource='normal';billingLoadedAt=Date.now()+1e9;
window.__portal=[];fetchWithAuthRetry=async(url,opt)=>{window.__portal.push({url,body:opt&&opt.body});return new Response(JSON.stringify({ok:false,error:'Testmodus: geen Stripe'}),{status:500})};
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
const shotDir='tests/artifacts/vertrouwen';fs.mkdirSync(shotDir,{recursive:true});

async function openApp(phone){
  const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1280,height:900},hasTouch:phone,isMobile:phone&&browserName==='chromium',locale:'nl-NL'});
  const page=await context.newPage();
  await page.clock.setFixedTime(new Date(NOW));
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('dialog',d=>d.accept());
  page.setDefaultTimeout(6000);
  await page.goto(url+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#mainApp').waitFor();
  return {context,page};
}

try{
  for(const phone of [true,false]){
    const tag=(phone?'telefoon':'desktop')+'-'+browserName;
    // 3, 8, 9, 10: calm to-dos on the overview.
    {
      const {context,page}=await openApp(phone);
      const keys=await page.evaluate(()=>dashboardAttentionItems().map(i=>i.key));
      for(const key of ['payment-failed','scan-limit','bank-import','invoice-unsent'])assert.ok(keys.includes(key),tag+': to-do '+key+' in '+keys.join(','));
      const items=await page.evaluate(()=>Object.fromEntries(dashboardAttentionItems().map(i=>[i.key,i.title+' | '+(i.detail||'')])));
      assert.match(items['payment-failed'],/niet gelukt \| Geen boete\. Je kunt 14 dagen gewoon doorwerken/);
      assert.match(items['scan-limit'],/Nog 15 slimme scans deze maand \| Bonnen uploaden en zelf invullen kan altijd/);
      assert.match(items['bank-import'],/Laatste bankimport: 30 dagen geleden/);
      assert.match(items['invoice-unsent'],/Factuur 2026-0001 is nog niet verstuurd/,'only the invoice that was never sent');
      // Hidden to-dos stay hidden.
      await page.evaluate(()=>{state.meta.attentionHidden=['scan-limit'];renderMemo=null});
      assert.equal(await page.evaluate(()=>dashboardAttentionItemsNow().some(i=>i.key==='scan-limit')),false);
      // A new bank file resets the reminder.
      await page.evaluate(()=>{state.meta.lastBankImportAt=new Date().toISOString()});
      assert.equal(await page.evaluate(()=>dashboardAttentionItemsNow().some(i=>i.key==='bank-import')),false);
      await page.screenshot({path:shotDir+'/overzicht-'+tag+'.png'});
      await context.close();
    }
    // 1, 2: Abonnement shows the promise and cancelling starts with taking everything along.
    {
      const {context,page}=await openApp(phone);
      await page.evaluate(()=>openSettingsSection('billing'));
      const card=page.locator('#billingCard');
      await card.waitFor();
      const text=await card.innerText();
      assert.match(text,/Onze belofte/);
      assert.match(text,/Je betaalt € 9,95 per maand\. Je volgende betaling is op 3 december 2026\./);
      assert.match(text,/minstens 60 dagen van tevoren/);
      assert.match(text,/Geen limiet op facturen/);
      await card.locator('.vk-cancel-link').click();
      const dialog=page.locator('#modalRoot [role=dialog]');
      await dialog.waitFor();
      const sheet=await dialog.innerText();
      for(const word of ['Neem eerst alles mee','Alles (back-up)','Facturen · CSV','Kosten · CSV','Auditfile','Je houdt ZZP tot 3 december 2026','Je gegevens blijven bewaard','Toch blijven'])assert.ok(sheet.includes(word),tag+': cancel sheet says '+word);
      await page.waitForTimeout(500);await page.screenshot({path:shotDir+'/opzeggen-'+tag+'.png'});
      await dialog.locator('#vkCancelGo').click();
      await page.waitForFunction(()=>window.__portal.length===1);
      const call=await page.evaluate(()=>window.__portal[0]);
      assert.match(call.url,/\/billing-portal$/);
      assert.deepEqual(JSON.parse(call.body),{flow:'cancel'},'opens Stripe on the cancel step');
      await context.close();
    }
    // 7: Btw, om na te kijken.
    {
      const {context,page}=await openApp(phone);
      await page.evaluate(()=>{sessionStorage.setItem(VAT_PERIOD_KEY||'vatPeriod','q4');navigate('vat')});
      const box=page.locator('[data-vk="vat-checks"]');
      await box.waitFor();
      const text=await box.innerText();
      assert.match(text,/Om na te kijken/);
      assert.match(text,/Dubbele bon\?/);
      assert.match(text,/Fictieve Pomp/);
      assert.match(text,/Factuur 2026-0002 zonder btw/);
      assert.match(text,/Boekuna verstuurt je aangifte niet zelf/);
      await page.screenshot({path:shotDir+'/btw-'+tag+'.png',fullPage:false});
      await context.close();
    }
    // 5: several costs at once.
    {
      const {context,page}=await openApp(phone);
      await page.evaluate(()=>navigate('expenses'));
      const start=page.locator('[data-vk="bulk-start"] button');
      await start.waitFor();
      await start.click();
      const row=id=>phone?page.locator(`#content [data-bk-expense="${id}"]`).first():page.locator('#content tr',{has:page.locator(`[onclick="expenseActions('${id}')"]`)}).first();
      await row('e1').dispatchEvent('click');await row('e2').dispatchEvent('click');
      assert.deepEqual(await page.evaluate(()=>BoekunaVertrouwen.picked()),['e1','e2']);
      assert.equal(await page.locator('#modalRoot [role=dialog]').count(),0,'a tap picks the row instead of opening it');
      assert.match(await page.locator('#vkBulkBar').innerText(),/2 gekozen/);
      await page.screenshot({path:shotDir+'/kosten-kiezen-'+tag+'.png'});
      // Category for both.
      await page.locator('#vkBulkBar [data-vk-act=category]').dispatchEvent('click');
      await page.selectOption('#vkCategory','Marketing');
      await page.locator('#modalRoot .btn.primary').click();
      assert.deepEqual(await page.evaluate(()=>state.expenses.filter(e=>['e1','e2'].includes(e.id)).map(e=>e.category)),['Marketing','Marketing']);
      assert.equal(await page.locator('#vkBulkBar').count(),0,'select mode ends after an action');
      // Btw 21% for e1: the amount with btw stays 32,70.
      await page.locator('[data-vk="bulk-start"] button').dispatchEvent('click');
      await row('e1').dispatchEvent('click');
      await page.locator('#vkBulkBar [data-vk-act=vat]').dispatchEvent('click');
      await page.locator('input[name=vkRate][value="21"]').check();
      await page.locator('#modalRoot .btn.primary').click();
      const e1=await page.evaluate(()=>{const e=state.expenses.find(x=>x.id==='e1');return [e.vatRate,expenseGross(e),e.vatAmount,e.exVat]});
      assert.deepEqual(e1,[21,32.7,5.68,27.02]);
      // Remove two: each gets a correction, one tap undoes it.
      await page.locator('[data-vk="bulk-start"] button').dispatchEvent('click');
      await row('e2').dispatchEvent('click');await row('e3').dispatchEvent('click');
      await page.locator('#vkBulkBar [data-vk-act=remove]').dispatchEvent('click');
      assert.equal(await page.evaluate(()=>state.expenses.filter(e=>e.correctionFor).length),2);
      assert.equal(await page.evaluate(()=>['e2','e3'].every(id=>state.expenses.find(e=>e.id===id).correctedAt)),true);
      await context.close();
    }
  }
  assert.deepEqual(errors,[],'no page errors');
  console.log('Vertrouwen ('+browserName+'): PASS');
}finally{
  await browser.close();server.close();
}
