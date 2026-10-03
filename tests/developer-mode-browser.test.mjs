import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';

const developerSource=fs.readFileSync(new URL('../public/assets/developer-mode.js',import.meta.url),'utf8');
const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
const publicRoot=new URL('../public/',import.meta.url);
fs.mkdirSync('tests/artifacts',{recursive:true});

let issueCount=0;
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/developer-mode.js'){
    res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});
    return res.end(developerSource);
  }
  if(url.pathname==='/functions/v1/dev-session'){
    let body='';
    req.on('data',chunk=>{body+=chunk});
    req.on('end',()=>{
      issueCount++;
      const bearer=String(req.headers.authorization||'');
      const access=String(req.headers['x-boekuna-dev-access']||'');
      if(!bearer&&!access){
        res.writeHead(403,{'content-type':'application/json'});
        return res.end(JSON.stringify({error:'denied',code:'DEV_MODE_ACCESS_DENIED'}));
      }
      if(!bearer&&access!=='preview-secret'){
        res.writeHead(403,{'content-type':'application/json'});
        return res.end(JSON.stringify({error:'denied',code:'DEV_MODE_ACCESS_DENIED'}));
      }
      res.writeHead(200,{'content-type':'application/json'});
      res.end(JSON.stringify({
        ok:true,
        user_id:'11111111-1111-4111-8111-111111111111',
        session:bearer?null:{
          access_token:'qa-access-token',
          refresh_token:'qa-refresh-token',
          expires_at:Math.floor(Date.now()/1000)+3600,
          expires_in:3600
        },
        developer_session:{
          token:'dev-ticket-'+String(issueCount).padStart(40,'x'),
          expires_at:Math.floor(Date.now()/1000)+3600
        }
      }));
    });
    return;
  }
  if(url.pathname==='/harness'){
    const html=`<!doctype html><html><body><main id="mainApp" style="display:grid"><h1>Dashboard</h1></main>
<script>
window.BOEKUNA_DEV_MODE_CONFIG=Object.freeze({enabled:true,environment:'preview',allowedOrigins:[location.origin]});
window.fakeSupabase={
  auth:{
    getSession:async()=>({data:{session:JSON.parse(localStorage.getItem('qa-session')||'null')},error:null}),
    setSession:async({access_token,refresh_token})=>{
      const session={access_token,refresh_token,user:{id:'11111111-1111-4111-8111-111111111111'}};
      localStorage.setItem('qa-session',JSON.stringify(session));
      return {data:{session},error:null};
    }
  }
};
</script>
<script src="/developer-mode.js"></script>
<script>
(async()=>{
  const r=await BoekunaDeveloperMode.bootstrap({supabaseClient:fakeSupabase,supabaseUrl:location.origin,publishableKey:'sb_publishable_test',accessKey:sessionStorage.getItem('first-run')?'':'preview-secret'});
  sessionStorage.setItem('first-run','1');
  BoekunaDeveloperMode.mountIndicator();
  window.__ready={r,headers:BoekunaDeveloperMode.decorateHeaders({'content-type':'application/json'})};
})();
</script></body></html>`;
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    return res.end(html);
  }
  if(url.pathname.startsWith('/assets/')){
    try{
      const file=new URL(url.pathname.replace(/^\//,''),publicRoot);
      if(fs.existsSync(file)){
        const ext=path.extname(file.pathname);
        const mime={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'};
        res.writeHead(200,{'content-type':mime[ext]||'application/octet-stream'});
        return fs.createReadStream(file).pipe(res);
      }
    }catch(_error){}
  }
  res.writeHead(404);res.end('not found');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;

const browserName=(process.env.BOOKUNA_BROWSER||'chromium')==='webkit'?'webkit':'chromium';
const browserType=browserName==='webkit'?webkit:chromium;
const browser=await browserType.launch({headless:true});
const page=await browser.newPage({viewport:{width:1200,height:800}});
try{
  await page.goto(base+'/harness',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__ready?.r?.active===true);
  assert.equal(await page.locator('h1').innerText(),'Dashboard');
  assert.equal(await page.locator('#boekunaDeveloperModeBadge').innerText(),'DEV MODE');
  assert.match(await page.evaluate(()=>window.__ready.headers['x-boekuna-dev-session']),/^dev-ticket-/);
  assert.equal(issueCount,1,'First preview visit should issue one developer ticket');

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__ready?.r?.active===true);
  assert.equal(issueCount,2,'Refresh should renew from the persisted real QA session without the preview access key');
  assert.equal(await page.locator('#boekunaDeveloperModeBadge').innerText(),'DEV MODE');

  assert.equal(await page.evaluate(()=>typeof BoekunaDeveloperMode.bindUser),'function','Developer helper must expose explicit authenticated-user binding');
  const userSwitch=await page.evaluate(()=>{
    const key='boekuna-developer-session-v1';
    const before=JSON.parse(sessionStorage.getItem(key)||'null');
    const activeForA=BoekunaDeveloperMode.isActive('11111111-1111-4111-8111-111111111111');
    BoekunaDeveloperMode.bindUser('22222222-2222-4222-8222-222222222222');
    return {
      beforeUser:before?.user_id||'',
      activeForA,
      activeForB:BoekunaDeveloperMode.isActive('22222222-2222-4222-8222-222222222222'),
      stored:sessionStorage.getItem(key),
      devHeader:BoekunaDeveloperMode.decorateHeaders({})['x-boekuna-dev-session']||''
    };
  });
  assert.equal(userSwitch.beforeUser,'11111111-1111-4111-8111-111111111111');
  assert.equal(userSwitch.activeForA,true,'Ticket must be active only for the bound QA user');
  assert.equal(userSwitch.activeForB,false,'User B must never inherit user A Developer Mode');
  assert.equal(userSwitch.stored,null,'Cross-user binding must remove the stored developer ticket');
  assert.equal(userSwitch.devHeader,'','Cross-user binding must not forward a stale developer ticket');

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__ready?.r?.active===true);
  assert.equal(issueCount,3,'A fresh preview bootstrap should restore a server-validated ticket for invalidation testing');
  const environmentInvalidation=await page.evaluate(()=>{
    const key='boekuna-developer-session-v1';
    const original=window.BOEKUNA_DEV_MODE_CONFIG;
    const before=JSON.parse(sessionStorage.getItem(key)||'null');
    window.BOEKUNA_DEV_MODE_CONFIG=Object.freeze({enabled:true,environment:'staging',allowedOrigins:[location.origin]});
    const active=BoekunaDeveloperMode.isActive('11111111-1111-4111-8111-111111111111');
    const result={
      beforeEnvironment:before?.environment||'',
      active,
      stored:sessionStorage.getItem(key),
      badge:document.getElementById('boekunaDeveloperModeBadge')?.textContent||''
    };
    window.BOEKUNA_DEV_MODE_CONFIG=original;
    return result;
  });
  assert.equal(environmentInvalidation.beforeEnvironment,'preview');
  assert.equal(environmentInvalidation.active,false,'Environment mismatch must fail closed');
  assert.equal(environmentInvalidation.stored,null,'Environment mismatch must purge the stale ticket');
  assert.equal(environmentInvalidation.badge,'','Environment mismatch must remove the stale DEV MODE indicator');

  const policy=await page.evaluate(()=>{
    const current=window.BOEKUNA_DEV_MODE_CONFIG;
    window.BOEKUNA_DEV_MODE_CONFIG=Object.freeze({enabled:true,environment:'production',allowedOrigins:[location.origin]});
    const denied=BoekunaDeveloperMode.evaluate();
    window.BOEKUNA_DEV_MODE_CONFIG=current;
    return denied;
  });
  assert.equal(policy.allowed,false,'Production environment must fail closed even when the origin is allowlisted');

  // App integration: Developer Mode must block real Stripe navigation.
  let appHtml=original
    .replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;')
    .replace("window.BOEKUNA_DEV_MODE_CONFIG=Object.freeze({enabled:false,environment:'production',allowedOrigins:[]});","window.BOEKUNA_DEV_MODE_CONFIG=Object.freeze({enabled:true,environment:'preview',allowedOrigins:[location.origin]});");
  const marker='initAuth();';
  const at=appHtml.lastIndexOf(marker);
  assert.ok(at>0);
  appHtml=appHtml.slice(0,at)+`
currentUser=TEST_USER;
state=structuredClone(DEFAULT);
enterApp();
window.__stripeCalls=0;
window.fetch=async()=>{window.__stripeCalls++;return new Response('{}',{status:500,headers:{'content-type':'application/json'}})};
`+appHtml.slice(at+marker.length);
  const integration=http.createServer((req,res)=>{
    const u=new URL(req.url,'http://127.0.0.1');
    if(u.pathname.startsWith('/assets/')){
      try{
        const file=new URL(u.pathname.replace(/^\//,''),publicRoot);
        if(fs.existsSync(file)){res.writeHead(200);return fs.createReadStream(file).pipe(res)}
      }catch(_error){}
    }
    res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(appHtml);
  });
  await new Promise(resolve=>integration.listen(0,'127.0.0.1',resolve));
  const appPage=await browser.newPage();
  try{
    await appPage.goto('http://127.0.0.1:'+integration.address().port+'/',{waitUntil:'domcontentloaded'});
    await appPage.locator('#pageTitle').filter({hasText:'Overzicht'}).waitFor();
    await appPage.waitForFunction(()=>typeof window.BoekunaDeveloperMode?.clear==='function');
    await appPage.evaluate(()=>{window.__realDeveloperMode=window.BoekunaDeveloperMode;const real=window.BoekunaDeveloperMode||{};window.BoekunaDeveloperMode={...real,isActive:()=>true};});
    await appPage.evaluate(()=>startSubscription('pro'));
    await appPage.waitForTimeout(50);
    assert.equal(await appPage.evaluate(()=>window.__stripeCalls),0,'Developer Mode must not call Stripe Checkout');

    const logoutState=await appPage.evaluate(async()=>{
      billingSnapshot={plan:'pro',status:'active',entitlement_status:'paid'};
      billingLoadedAt=Date.now();
      sessionStorage.setItem('boekuna-developer-session-v1',JSON.stringify({token:'stale-ticket',user_id:'11111111-1111-4111-8111-111111111111'}));
      window.__devClearCalls=0;
      const originalDev=window.BoekunaDeveloperMode;
      window.BoekunaDeveloperMode={
        ...originalDev,
        clear:()=>{window.__devClearCalls++;originalDev?.clear?.()},
        bindUser:(id)=>originalDev?.bindUser?.(id),
        isActive:()=>true
      };
      await logoutUser();
      return {
        billingSnapshot,
        billingLoadedAt,
        clearCalls:window.__devClearCalls,
        storedTicket:sessionStorage.getItem('boekuna-developer-session-v1')
      };
    });
    assert.equal(logoutState.billingSnapshot,null,'Logout must clear cached billing snapshot');
    assert.equal(logoutState.billingLoadedAt,0,'Logout must clear billing cache timestamp');
    assert.ok(logoutState.clearCalls>=1,'Logout must explicitly clear Developer Mode');
    assert.equal(logoutState.storedTicket,null,'Logout must remove the Developer Mode ticket from sessionStorage');

    const realAccountSwitch=await appPage.evaluate(()=>{
      window.BoekunaDeveloperMode=window.__realDeveloperMode;
      const userA='11111111-1111-4111-8111-111111111111';
      const userB='22222222-2222-4222-8222-222222222222';
      const key='boekuna-developer-session-v1';
      window.BoekunaDeveloperMode.bindUser(userA);
      sessionStorage.setItem(key,JSON.stringify({
        token:'dev-ticket-'+('z'.repeat(48)),
        user_id:userA,
        origin:location.origin,
        environment:'preview',
        expires_at:Math.floor(Date.now()/1000)+3600
      }));
      window.BoekunaDeveloperMode.bindUser(userA);
      window.BoekunaDeveloperMode.mountIndicator();
      billingSnapshot={plan:'pro',status:'active',entitlement_status:'paid'};
      billingSnapshotSource='developer';
      billingLoadedAt=Date.now();
      resetAuthScopedClientState(userB);
      return {
        activeForB:window.BoekunaDeveloperMode.isActive(userB),
        storedTicket:sessionStorage.getItem(key),
        badge:document.getElementById('boekunaDeveloperModeBadge')?.textContent||'',
        billingSnapshot,
        billingLoadedAt
      };
    });
    assert.equal(realAccountSwitch.activeForB,false,'User B must not inherit a server-validated Developer Mode session from user A');
    assert.equal(realAccountSwitch.storedTicket,null,'User switch must purge user A ticket');
    assert.equal(realAccountSwitch.badge,'','User switch must remove user A DEV MODE indicator');
    assert.equal(realAccountSwitch.billingSnapshot,null,'Developer invalidation during user switch must clear billing snapshot');
    assert.equal(realAccountSwitch.billingLoadedAt,0,'Developer invalidation during user switch must reset billing timestamp');

    const signedOutState=await appPage.evaluate(()=>{
      const userA='11111111-1111-4111-8111-111111111111';
      const key='boekuna-developer-session-v1';
      window.BoekunaDeveloperMode.bindUser(userA);
      sessionStorage.setItem(key,JSON.stringify({
        token:'dev-ticket-'+('y'.repeat(48)),
        user_id:userA,
        origin:location.origin,
        environment:'preview',
        expires_at:Math.floor(Date.now()/1000)+3600
      }));
      window.BoekunaDeveloperMode.bindUser(userA);
      window.BoekunaDeveloperMode.mountIndicator();
      billingSnapshot={plan:'pro',status:'active',entitlement_status:'paid'};
      billingSnapshotSource='developer';
      billingLoadedAt=Date.now();
      resetAuthScopedClientState('');
      return {
        active:window.BoekunaDeveloperMode.isActive(userA),
        storedTicket:sessionStorage.getItem(key),
        badge:document.getElementById('boekunaDeveloperModeBadge')?.textContent||'',
        billingSnapshot,
        billingLoadedAt
      };
    });
    assert.equal(signedOutState.active,false,'SIGNED_OUT-equivalent cleanup must disable Developer Mode immediately');
    assert.equal(signedOutState.storedTicket,null,'SIGNED_OUT-equivalent cleanup must remove Developer Mode ticket');
    assert.equal(signedOutState.badge,'','SIGNED_OUT-equivalent cleanup must remove Developer Mode indicator');
    assert.equal(signedOutState.billingSnapshot,null,'SIGNED_OUT-equivalent cleanup must clear billing snapshot');
    assert.equal(signedOutState.billingLoadedAt,0,'SIGNED_OUT-equivalent cleanup must reset billing timestamp');

    const accountSwitch=await appPage.evaluate(()=>{
      currentUser={id:'11111111-1111-4111-8111-111111111111',email:'a@example.test',supabaseUser:{id:'11111111-1111-4111-8111-111111111111'}};
      billingSnapshot={plan:'pro',status:'active',entitlement_status:'paid'};
      billingLoadedAt=Date.now();
      sessionStorage.setItem('boekuna-developer-session-v1',JSON.stringify({token:'stale-ticket-a',user_id:'11111111-1111-4111-8111-111111111111'}));
      window.__boundUser='';
      window.BoekunaDeveloperMode={
        clear:()=>{sessionStorage.removeItem('boekuna-developer-session-v1');document.getElementById('boekunaDeveloperModeBadge')?.remove()},
        bindUser:(id)=>{window.__boundUser=String(id||'')},
        isActive:()=>false
      };
      resetAuthScopedClientState('22222222-2222-4222-8222-222222222222');
      const billingCard=renderBillingCard();
      return {billingSnapshot,billingLoadedAt,boundUser:window.__boundUser,billingCard,storedTicket:sessionStorage.getItem('boekuna-developer-session-v1')};
    });
    assert.equal(accountSwitch.billingSnapshot,null,'User switch must clear previous billing snapshot');
    assert.equal(accountSwitch.billingLoadedAt,0,'User switch must clear previous billing timestamp');
    assert.equal(accountSwitch.boundUser,'22222222-2222-4222-8222-222222222222','User switch must rebind Developer Mode to user B before feature access');
    assert.equal(accountSwitch.storedTicket,null,'User switch must purge user A Developer Mode ticket before user B feature access');
    assert.doesNotMatch(accountSwitch.billingCard,/DEV MODE|Unlimited/,'User B must not inherit Developer Mode or Unlimited billing UI from user A');
  } finally {
    await appPage.close();
    await new Promise(resolve=>integration.close(resolve));
  }

  await page.screenshot({path:'tests/artifacts/developer-mode-preview.png',fullPage:true});
  console.log('BOEKUNA Developer Mode browser smoke ('+browserName+'): PASS');
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
