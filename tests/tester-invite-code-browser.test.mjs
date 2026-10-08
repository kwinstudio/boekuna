import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';

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
        const ext=path.extname(file.pathname);
        const mime={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
        res.writeHead(200,{'content-type':mime[ext]||'application/octet-stream'});
        return fs.createReadStream(file).pipe(res);
      }
    }catch{}
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(appHtml);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));

const browserName=(process.env.BOOKUNA_BROWSER||'chromium')==='webkit'?'webkit':'chromium';
const browserType=browserName==='webkit'?webkit:chromium;
const browser=await browserType.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});

try{
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#pageTitle').filter({hasText:'Overzicht'}).waitFor();
  await page.evaluate(()=>navigate('settings'));

  await page.evaluate(()=>{
    billingSnapshot={plan:'free',status:'free',entitlement_status:'free',monthly_limit:10,used:0,remaining:10,tester_access_used:false,access_source:'free'};
    billingLoadedAt=Date.now();billingSnapshotSource='normal';
    const card=document.getElementById('billingCard');if(card)card.outerHTML=renderBillingCard();
  });
  await page.locator('#testerInviteCode').waitFor();
  assert.ok(await page.getByText('Heb je een testcode?').isVisible());
  assert.ok(await page.getByRole('button',{name:'Code activeren'}).isVisible());
  assert.ok(await page.getByRole('button',{name:'Kies ZZP'}).isVisible(),'Gratis account must still work without code');

  await page.evaluate(()=>{
    window.__testerResolve=null;
    getSupabase=async()=>({rpc:async(name,args)=>{
      window.__testerRpc={name,args};
      return await new Promise(resolve=>{window.__testerResolve=resolve});
    }});
  });
  await page.locator('#testerInviteCode').fill('BOEKUNA-ABCDEFGHJKLMNPQR');
  await page.getByRole('button',{name:'Code activeren'}).click();
  await page.getByRole('button',{name:'Activeren…'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Activeren…'}).isDisabled(),true,'activation must expose loading state');
  await page.evaluate(()=>window.__testerResolve({data:{ok:false,code:'INVALID_CODE'},error:null}));
  await page.locator('#testerInviteStatus').filter({hasText:'Deze testcode is niet geldig.'}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__testerRpc),{name:'redeem_tester_invite_code',args:{p_code:'BOEKUNA-ABCDEFGHJKLMNPQR'}});

  assert.equal(await page.evaluate(()=>testerCodeMessage('CODE_EXPIRED')),'Deze testcode is verlopen.');
  assert.equal(await page.evaluate(()=>testerCodeMessage('CODE_ALREADY_USED')),'Deze testcode is al gebruikt.');
  assert.equal(await page.evaluate(()=>testerCodeMessage('ACCOUNT_TEST_ALREADY_USED')),'Je hebt je gratis testperiode al gebruikt.');
  assert.equal(await page.evaluate(()=>testerCodeMessage('EMAIL_NOT_VERIFIED')),'Verifieer eerst je e-mailadres.');
  assert.equal(await page.evaluate(()=>testerCodeMessage('ACTIVE_SUBSCRIPTION')),'Je hebt al een actief abonnement.');

  await page.evaluate(()=>{
    getSupabase=async()=>({rpc:async()=>({data:{
      ok:true,code:'TESTER_CODE_REDEEMED',plan:'boekuna',access_source:'tester_code',
      activated_at:'2026-10-07T10:00:00Z',expires_at:'2026-11-06T10:00:00Z',idempotent:false
    },error:null})});
    loadBillingSummary=async()=>{
      billingSnapshot={plan:'boekuna',status:'free',entitlement_status:'paid',monthly_limit:100,used:0,remaining:100,tester_access_used:true,access_source:'tester_code',access_ends_at:'2026-11-06T10:00:00Z',can_manage_subscription:false};
      billingLoadedAt=Date.now();billingSnapshotSource='normal';return billingSnapshot;
    };
  });
  await page.locator('#testerInviteCode').fill('BOEKUNA-HJKLMNPQ23456789');
  await page.getByRole('button',{name:'Code activeren'}).click();
  await page.getByText('Testtoegang actief',{exact:true}).waitFor();
  assert.ok(await page.getByText(/Je kunt ZZP gratis gebruiken tot/).isVisible());
  assert.equal(await page.locator('#testerInviteCode').count(),0,'active tester must not see another-code input');
  assert.ok(await page.getByText('Geen kaart gekoppeld. Er start geen automatische betaling.').isVisible());

  await page.evaluate(()=>{
    billingSnapshot={plan:'free',status:'free',entitlement_status:'free',monthly_limit:10,used:0,remaining:10,tester_access_used:true,access_source:'free'};
    const card=document.getElementById('billingCard');if(card)card.outerHTML=renderBillingCard();
  });
  await page.getByText('Testperiode gebruikt').waitFor();
  assert.equal(await page.locator('#testerInviteCode').count(),0,'used tester account must not stack another code');

  await page.evaluate(()=>{
    billingSnapshot={plan:'boekuna',status:'active',entitlement_status:'paid',monthly_limit:100,used:0,remaining:100,tester_access_used:false,access_source:'stripe',can_manage_subscription:true,current_period_end:'2026-11-10T10:00:00Z'};
    const card=document.getElementById('billingCard');if(card)card.outerHTML=renderBillingCard();
  });
  assert.equal(await page.locator('#testerInviteCode').count(),0,'paid account must not see tester-code input');
  assert.ok(await page.getByRole('button',{name:'Beheer abonnement'}).isVisible());

  console.log('BOEKUNA tester invite-code browser ('+browserName+'): PASS');
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
