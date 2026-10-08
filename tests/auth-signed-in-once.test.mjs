// Supabase sends SIGNED_IN again right after a login and every time the tab gets focus. The administration
// must be loaded once per sign-in: a second load replaced what the user had just entered with the older
// cloud copy (release audit 2026-10-08, reproduced on the live app with a QA account).
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
function replaceLast(source,needle,replacement){const i=source.lastIndexOf(needle);if(i<0)throw new Error('Missing '+needle);return source.slice(0,i)+replacement+source.slice(i+needle.length)}

const html=replaceLast(original,'initAuth();',String.raw`
window.__hydrations=0;window.__enters=0;window.__authListener=null;
window.__session=new URL(location.href).searchParams.get('session')==='1'?{user:{id:'qa-user',email:'qa@example.test'}}:null;
supabaseClient={
 auth:{
  getSession:async()=>({data:{session:window.__session},error:null}),
  onAuthStateChange:cb=>{window.__authListener=cb;return {data:{subscription:{unsubscribe(){}}}}},
  signInWithPassword:async({email})=>{const s={user:{id:'qa-user',email}};window.__session=s;window.__authListener?.('SIGNED_IN',s);return {data:{user:s.user,session:s},error:null}},
  signOut:async()=>{window.__session=null;return {error:null}},
  mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1',nextLevel:'aal1'},error:null})}
 },
 rpc:async()=>({data:2,error:null}),
 from:()=>({upsert:async()=>({error:null})})
};
// The cloud copy is empty: anything the user entered locally must survive a repeated SIGNED_IN.
hydrateCloudAccount=async user=>{window.__hydrations++;currentUser={id:user.id,email:user.email||'',supabaseUser:user};await new Promise(r=>setTimeout(r,120));state=structuredClone(DEFAULT);state.company={...state.company,name:'QA Testbedrijf'};setCloudSyncStatus('saved')};
const realEnterApp=enterApp;enterApp=function(){window.__enters++;return realEnterApp()};
loadBillingSummary=async()=>{};handleBillingReturnAndPlan=async()=>{};handleMailboxReturn=()=>{};initDocumentBackgroundProcessing=async()=>{};resumePendingDocumentVerifications=async()=>{};
initAuth();
`);

const server=http.createServer((req,res)=>{
  const path=(req.url||'').split('?')[0];
  if(path==='/app'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(html)}
  res.writeHead(404);res.end('');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
const pageErrors=[];
const counts=page=>page.evaluate(()=>({hydrations:window.__hydrations,enters:window.__enters}));
async function addContact(page,name){
  await page.evaluate(()=>{navigate('contacts');newContact()});
  await page.locator('#contactName').fill(name);
  await page.locator('#modalRoot').getByRole('button',{name:'Opslaan'}).click();
  await page.waitForFunction(n=>state.contacts.some(c=>c.name===n),name);
}
const contacts=page=>page.evaluate(()=>state.contacts.map(c=>c.name));

try{
  // Open the app with a stored session, enter something, then come back to the tab.
  {
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    page.on('pageerror',e=>pageErrors.push(String(e)));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
    await page.goto(base+'/app?session=1',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.getElementById('mainApp')?.style.display==='grid');
    await page.waitForTimeout(300);
    assert.deepEqual(await counts(page),{hydrations:1,enters:1},'one load and one start for a stored session');
    await addContact(page,'Klant Na Inloggen BV');
    await page.evaluate(()=>window.__authListener('SIGNED_IN',window.__session));
    await page.waitForTimeout(400);
    assert.deepEqual(await contacts(page),['Klant Na Inloggen BV'],'returning to the tab keeps what was just entered');
    assert.deepEqual(await counts(page),{hydrations:1,enters:1},'returning to the tab does not reload the administration');
    assert.equal(await page.evaluate(()=>page),'contacts','returning to the tab keeps the current page');
    await page.close();
  }

  // Log in: Supabase fires SIGNED_IN while the login itself also loads the account.
  {
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    page.on('pageerror',e=>pageErrors.push(String(e)));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
    await page.goto(base+'/app?login=1',{waitUntil:'domcontentloaded'});
    await page.locator('#loginEmail').fill('qa@example.test');
    await page.locator('#loginPassword').fill('lang-genoeg-123');
    await page.locator('#authForm button[type=submit]').click();
    await page.waitForFunction(()=>document.getElementById('mainApp')?.style.display==='grid');
    await page.waitForTimeout(400);
    assert.deepEqual(await counts(page),{hydrations:1,enters:1},'a login loads the administration once');
    await addContact(page,'Klant Direct BV');
    await page.waitForTimeout(400);
    assert.deepEqual(await contacts(page),['Klant Direct BV'],'something entered right after login stays');

    // After logging out, the next login loads the administration again.
    await page.evaluate(()=>logoutUser());
    await page.waitForFunction(()=>document.getElementById('mainApp')?.style.display==='none');
    await page.evaluate(()=>showAuth('login'));
    await page.locator('#loginEmail').fill('qa@example.test');
    await page.locator('#loginPassword').fill('lang-genoeg-123');
    await page.locator('#authForm button[type=submit]').click();
    await page.waitForFunction(()=>document.getElementById('mainApp')?.style.display==='grid');
    await page.waitForTimeout(300);
    assert.deepEqual(await counts(page),{hydrations:2,enters:2},'a new login after logout loads again');
    await page.close();
  }
  assert.deepEqual(pageErrors,[]);
  console.log('Signed-in user loads once (stored session, tab focus, login, logout and login): PASS');
}finally{await browser.close();await new Promise(r=>server.close(r))}
