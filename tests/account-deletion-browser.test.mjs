// Account verwijderen on the production build: subscription notice, export reminder and a
// failed server deletion that keeps the user signed in with a clear Dutch message.
// Supabase is replaced by a fake in the page; nothing reaches a real backend or Stripe.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {buildApp,startAppServer} from './lib/app-fixture.mjs';

buildApp();
const browserName=process.env.BOOKUNA_BROWSER==='webkit'?'webkit':'chromium';
const shotDir=process.env.ACCOUNT_DELETE_SHOT_DIR||'tests/artifacts/account-deletion';fs.mkdirSync(shotDir,{recursive:true});

const fakeSupabase=`
window.__deleteCalls=0;window.__deleteReply={status:502,error:'Je abonnement kon niet worden stopgezet, daarom is er niets verwijderd. Probeer het later opnieuw of mail support@boekuna.nl.'};
getSupabase=async()=>({
  auth:{signInWithPassword:async()=>({error:null}),signOut:async()=>({error:null})},
  functions:{invoke:async(name)=>{window.__deleteCalls++;const r=window.__deleteReply;if(r.status===200)return {data:{ok:true},error:null};return {data:null,error:{message:'Edge Function returned a non-2xx status code',context:new Response(JSON.stringify({error:r.error}),{status:r.status})}}}}
});
`;
const {server,url}=await startAppServer({extraBoot:fakeSupabase});
const browser=await (browserName==='webkit'?webkit:chromium).launch();
const errors=[];
try{
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
    const tag=viewport.width<600?'mobiel':'desktop';
    const page=await browser.newPage({viewport,reducedMotion:'reduce'});
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(url);
    await page.waitForFunction(()=>typeof deleteAccountDialog==='function'&&document.getElementById('mainApp')?.style.display!=='none');

    // Paid subscription: the dialog says it stops immediately, and offers the export first.
    await page.evaluate(()=>{billingSnapshot={plan:'boekuna',status:'active',entitlement_status:'paid',access_source:'stripe'};deleteAccountDialog()});
    const paidText=await page.locator('.modal').innerText();
    assert.match(paidText,/Je abonnement stopt direct/);
    assert.match(paidText,/7 jaar bewaren/);
    assert.ok(await page.getByRole('button',{name:'Volledige back-up downloaden'}).isVisible());
    await page.waitForTimeout(400);
    await page.screenshot({path:`${shotDir}/${browserName}-${tag}-1-verwijderen-abonnement.png`});

    // The backup button really downloads the administration.
    const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Volledige back-up downloaden'}).click()]);
    assert.match(download.suggestedFilename(),/^boekhouding-backup-.*\.json$/);

    // Server refuses (Stripe could not be stopped): user stays signed in, data stays, message is shown.
    await page.fill('#deleteAccountForm input[name=password]','fictief-wachtwoord');
    await page.fill('#deleteAccountForm input[name=confirm]','VERWIJDER');
    await page.click('#confirmDeleteAccount');
    await page.waitForFunction(()=>window.__deleteCalls===1);
    await page.waitForFunction(()=>/niets verwijderd/.test(document.body.innerText));
    assert.equal(await page.evaluate(()=>!!currentUser&&state.invoices.length>0),true,'a failed deletion must not sign out or wipe local data');
    await page.waitForTimeout(400);
    await page.screenshot({path:`${shotDir}/${browserName}-${tag}-2-verwijderen-mislukt.png`});
    await page.evaluate(()=>closeModal());

    // Free account: no subscription notice.
    await page.evaluate(()=>{billingSnapshot={plan:'free',status:'free'};deleteAccountDialog()});
    assert.doesNotMatch(await page.locator('.modal').innerText(),/Je abonnement stopt direct/);

    // Success: signed out to the login screen.
    await page.evaluate(()=>{window.__deleteReply={status:200}});
    await page.fill('#deleteAccountForm input[name=password]','fictief-wachtwoord');
    await page.fill('#deleteAccountForm input[name=confirm]','VERWIJDER');
    await page.click('#confirmDeleteAccount');
    await page.waitForFunction(()=>currentUser===null);
    await page.close();
    console.log(`PASS account deletion dialog ${browserName} ${tag}`);
  }
  assert.deepEqual(errors,[],'no page errors');
}finally{
  await browser.close();server.close();
}
