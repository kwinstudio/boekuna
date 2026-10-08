// Pricing V2 in the app: plan chooser, month/year switch, confirmation before Stripe,
// subscription facts for paying users, no purchase in native store builds.
// Fake backend only: no Stripe call leaves the browser.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {PLANS} from '../supabase/functions/_shared/pricing.mjs';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
const publicRoot=new URL('../public/',import.meta.url);
let appHtml=original.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;');
const marker='initAuth();';
const at=appHtml.lastIndexOf(marker);
assert.ok(at>0,'app init marker missing');
appHtml=appHtml.slice(0,at)+'\ncurrentUser=TEST_USER;\nstate=structuredClone(DEFAULT);\nenterApp();\n'+appHtml.slice(at+marker.length);

const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');
  if(u.pathname.startsWith('/assets/')){
    try{
      const file=new URL(u.pathname.replace(/^\//,''),publicRoot);
      if(fs.existsSync(file)){
        const mime={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
        res.writeHead(200,{'content-type':mime[path.extname(file.pathname)]||'application/octet-stream'});
        return fs.createReadStream(file).pipe(res);
      }
    }catch{}
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(appHtml);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));

const browserName=(process.env.BOOKUNA_BROWSER||'chromium')==='webkit'?'webkit':'chromium';
const browser=await (browserName==='webkit'?webkit:chromium).launch({headless:true});

async function settingsPage(viewport){
  const page=await browser.newPage({viewport});
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Overzicht'}).waitFor();
  await page.evaluate(()=>navigate('settings'));
  return page;
}
async function showSnapshot(page,snapshot){
  await page.evaluate(s=>{
    billingSnapshot=s;billingLoadedAt=Date.now();billingSnapshotSource='normal';
    const card=document.getElementById('billingCard');
    if(card)card.outerHTML=renderBillingCard();else document.querySelector('main,#app,body').insertAdjacentHTML('afterbegin',renderBillingCard());
  },snapshot);
  await page.locator('#billingCard').waitFor();
}
const FREE={plan:'free',status:'free',entitlement_status:'free',monthly_limit:10,used:3,remaining:7,tester_access_used:true,access_source:'free'};

try{
  // App display prices equal the server price config.
  const appPrices=await (async()=>{const p=await settingsPage({width:390,height:844});const v=await p.evaluate(()=>BOEKUNA_PRICING.plans);await p.close();return v})();
  for(const id of ['zzp','pro','business']){
    assert.equal(appPrices[id].month,PLANS[id].prices.month,id+' monthly display price must equal server price');
    assert.equal(appPrices[id].year,PLANS[id].prices.year,id+' yearly display price must equal server price');
  }

  for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
    const page=await settingsPage(viewport);
    await showSnapshot(page,FREE);
    const card=page.locator('#billingCard');

    // Default: yearly, with the real yearly total.
    assert.equal(await card.getByRole('radio',{name:/Jaarlijks/}).getAttribute('aria-checked'),'true');
    assert.ok(await card.getByText('€ 99,50',{exact:true}).isVisible(),'ZZP yearly total is shown');
    assert.ok(await card.getByText(/gemiddeld € 8,29 per maand/).isVisible());
    // Pro and Business have no distinguishing features yet: not shown, not sold, no promises.
    for(const hidden of [/\bPro\b/,/Business/,/€ 199,50/,/€ 349,50/,/€ 19,95/,/€ 34,95/,/binnenkort/i])
      assert.equal(await card.getByText(hidden).count(),0,'hidden plan shown in app: '+hidden);

    // Switch to monthly without reload; keyboard reachable.
    await card.getByRole('radio',{name:'Maandelijks'}).focus();
    await page.keyboard.press('Enter');
    await page.locator('#billingCard').getByRole('radio',{name:'Maandelijks',checked:true}).waitFor();
    assert.ok(await page.locator('#billingCard').getByText('€ 9,95',{exact:true}).isVisible());
    assert.ok(await page.locator('#billingCard').getByText(/of € 99,50 per jaar/).isVisible());

    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=1,'no horizontal overflow at '+viewport.width+'px');

    // Choosing a plan opens a confirmation; Stripe opens only after "Naar betalen".
    await page.evaluate(()=>{
      window.__checkout=[];
      fetchWithAuthRetry=async(url,opts)=>{window.__checkout.push({url,body:JSON.parse(opts.body)});await new Promise(r=>setTimeout(r,400));return new Response(JSON.stringify({ok:false,error:'Testmodus: geen Stripe.'}),{status:503})};
    });
    await page.locator('#billingCard').getByRole('radio',{name:/Jaarlijks/}).click();
    await page.locator('#billingCard').getByRole('button',{name:'Kies ZZP'}).click();
    const dialog=page.getByRole('dialog');
    await dialog.waitFor();
    for(const text of ['€ 99,50 excl. btw vooruit voor 12 maanden','verlengt je abonnement automatisch met een jaar','btw wordt in de betaalpagina','niet terugbetaald'])
      assert.ok(await dialog.getByText(text,{exact:false}).isVisible(),'confirmation must say: '+text);
    assert.deepEqual(await page.evaluate(()=>window.__checkout),[],'nothing is requested before confirming');
    await dialog.getByRole('button',{name:'Naar betalen'}).dblclick();
    await page.waitForFunction(()=>window.__checkout.length>0);
    await page.waitForTimeout(600);
    const sent=await page.evaluate(()=>window.__checkout);
    assert.equal(sent.length,1,'a double click starts one checkout request');
    assert.deepEqual(sent[0].body,{plan:'zzp',interval:'year'},'only plan and interval are sent, never an amount');
    assert.ok(await page.getByRole('button',{name:'Naar betalen'}).isEnabled(),'after an error the user can try again');
    await page.evaluate(()=>closeModal());

    // Paying customer: plan, interval, amount, status, renewal and the portal.
    await showSnapshot(page,{plan:'zzp',status:'active',entitlement_status:'paid',monthly_limit:null,used:240,remaining:null,access_source:'stripe',can_manage_subscription:true,current_period_end:'2027-10-08T10:00:00Z',cancel_at_period_end:false,
      details:{plan:'zzp',billing_interval:'year',unit_amount_cents:9950,status:'active'}});
    const paid=page.locator('#billingCard');
    for(const text of ['ZZP · Actief','Jaarlijks','€ 99,50 per jaar excl. btw','Volgende verlenging','8 oktober 2027','Geen maandlimiet'])
      assert.ok(await paid.getByText(text,{exact:false}).first().isVisible(),'paid card must show '+text);
    assert.ok(await paid.getByRole('button',{name:'Beheer abonnement'}).isVisible());
    assert.equal(await paid.getByText(/240 \//).count(),0,'a paid plan shows no quota fraction');
    assert.equal(await paid.getByRole('button',{name:/Kies/}).count(),0);

    await showSnapshot(page,{plan:'zzp',status:'active',entitlement_status:'paid',monthly_limit:null,used:0,access_source:'stripe',can_manage_subscription:true,current_period_end:'2027-10-08T10:00:00Z',cancel_at_period_end:true,details:{billing_interval:'year',unit_amount_cents:9950}});
    assert.ok(await page.locator('#billingCard').getByText('Loopt af op').isVisible());
    assert.ok(await page.locator('#billingCard').getByText(/Je gegevens blijven bewaard/).isVisible());

    // Internal access: no broken Stripe portal button.
    await showSnapshot(page,{plan:'pro',status:'free',entitlement_status:'paid',monthly_limit:null,used:0,access_source:'internal',can_manage_subscription:false});
    assert.equal(await page.locator('#billingCard').getByRole('button',{name:'Beheer abonnement'}).count(),0);
    await page.close();
  }

  // Website plan choice survives login and is confirmed, never auto-charged.
  {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.addInitScript(()=>{const set=Storage.prototype.setItem;window.__stored=[];Storage.prototype.setItem=function(k,v){if(k==='boekuna.planIntent')window.__stored.push(JSON.parse(v));return set.call(this,k,v)}});
    await page.goto('http://127.0.0.1:'+server.address().port+'/?plan=zzp&interval=month',{waitUntil:'domcontentloaded'});
    await page.locator('#pageTitle').filter({hasText:'Overzicht'}).waitFor();
    const remembered=await page.evaluate(()=>window.__stored.map(v=>({plan:v.plan,interval:v.interval})));
    assert.deepEqual(remembered,[{plan:'zzp',interval:'month'}],'the website choice is kept through registration and e-mail confirmation');
    await page.evaluate(()=>{rememberPlanIntent('zzp','month');billingSnapshot={plan:'free',status:'free',entitlement_status:'free'};hasBoekunaSmartLayer=()=>false;loadBillingSummary=async()=>billingSnapshot});
    await page.evaluate(()=>handleBillingReturnAndPlan());
    const dialog=page.getByRole('dialog');
    await dialog.waitFor();
    assert.ok(await dialog.getByText('€ 9,95 excl. btw per maand',{exact:false}).isVisible());
    assert.ok(!page.url().includes('plan='),'plan parameter is removed from the address bar');
    await page.close();
  }

  // Native store build: no web purchase buttons.
  {
    const ctx=await browser.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 BoekunaNative/1.0'});
    const page=await ctx.newPage();
    await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
    await page.locator('#pageTitle').filter({hasText:'Overzicht'}).waitFor();
    await page.evaluate(()=>navigate('settings'));
    await showSnapshot(page,FREE);
    assert.equal(await page.locator('#billingCard').getByRole('button',{name:/Kies/}).count(),0,'native build shows no Stripe purchase');
    assert.equal(await page.locator('#billingCard a[href*="prijzen"]').count(),0,'native build does not link to web prices');
    await ctx.close();
  }

  console.log('Pricing V2 app browser ('+browserName+'): PASS');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
