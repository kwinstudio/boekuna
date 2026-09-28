import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const APP_ORIGIN='https://boekuna-boekhouding.onrender.com';
const EMAIL=process.env.BOOKUNA_MARKETING_CAPTURE_EMAIL||'';
const PASSWORD=process.env.BOOKUNA_MARKETING_CAPTURE_PASSWORD||'';
const TARGET_SHA='28561d1e6e94372b41e0471b2d4da027e79d5901';

assert.ok(EMAIL&&PASSWORD,'Dedicated production QA credentials are required');

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(String(e)));

try{
  await page.goto(APP_ORIGIN+'/?login=1&qa=billing-'+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('#loginEmail').waitFor({timeout:30000});
  await page.locator('#loginEmail').fill(EMAIL);
  await page.locator('#loginPassword').fill(PASSWORD);
  await page.locator('#authForm button[type="submit"]').click();
  await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor({timeout:60000});

  const result=await page.evaluate(async()=>{
    const summary=await loadBillingSummary(true);
    const post=async(path,body)=>{
      const res=await fetch(EDGE_BASE+path,{
        method:'POST',
        headers:await apiAuthHeaders({'content-type':'application/json'}),
        body:JSON.stringify(body||{})
      });
      const json=await res.json().catch(()=>({}));
      return {status:res.status,json};
    };

    const checkout=await post('/billing-checkout',{plan:'boekuna'});
    let checkoutHost=null,sessionMode=null;
    if(checkout?.json?.url){
      try{
        const u=new URL(checkout.json.url);
        checkoutHost=u.hostname;
        const m=checkout.json.url.match(/cs_(test|live)_/);
        sessionMode=m?m[1]:'unknown';
      }catch{}
    }

    const sync=await post('/billing-sync',{});
    const portal=await post('/billing-portal',{});

    return {
      targetSha:TARGET_SHA,
      summary:{
        plan:summary?.plan||null,
        status:summary?.status||null,
        entitlement_status:summary?.entitlement_status||null,
        effective_plan:summary?.effective_plan||summary?.effectivePlan||null,
        read_only:summary?.read_only??summary?.readOnly??null
      },
      checkout:{
        status:checkout.status,
        ok:checkout?.json?.ok===true,
        code:checkout?.json?.code||null,
        error:checkout?.json?.error||null,
        plan:checkout?.json?.plan||null,
        host:checkoutHost,
        sessionMode
      },
      sync:{
        status:sync.status,
        ok:sync?.json?.ok===true,
        synced:sync?.json?.synced??null,
        reason:sync?.json?.reason||null,
        plan:sync?.json?.plan||null,
        billingStatus:sync?.json?.status||null
      },
      portal:{
        status:portal.status,
        ok:portal?.json?.ok===true,
        code:portal?.json?.code||null,
        error:portal?.json?.error||null,
        hasUrl:!!portal?.json?.url
      }
    };
  });

  console.log('LIVE_BILLING_SMOKE '+JSON.stringify(result));

  assert.equal(result.checkout.status,200,'production billing-checkout must be configured and callable');
  assert.equal(result.checkout.ok,true,'production billing-checkout ok');
  assert.equal(result.checkout.plan,'boekuna','checkout plan');
  assert.equal(result.checkout.host,'checkout.stripe.com','checkout must use Stripe hosted Checkout');
  assert.ok(['test','live'].includes(result.checkout.sessionMode),'checkout must expose a Stripe test/live session prefix');

  assert.equal(result.sync.status,200,'billing-sync base call must respond');
  assert.equal(result.sync.ok,true,'billing-sync base call ok');

  assert.ok([200,409].includes(result.portal.status),'portal must either open for an existing Stripe customer or cleanly report no customer');
  if(result.portal.status===200)assert.equal(result.portal.hasUrl,true,'portal success requires URL');

  assert.deepEqual(pageErrors,[],'browser page errors: '+pageErrors.join(' | '));
  console.log('03A LIVE BILLING CONFIG SMOKE: PASS');
}finally{
  await browser.close();
}
