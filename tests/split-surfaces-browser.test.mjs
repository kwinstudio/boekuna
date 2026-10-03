import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const root=path.resolve(new URL('..',import.meta.url).pathname);
for(const script of ['build-marketing.mjs','build-app.mjs']){
  const r=spawnSync(process.execPath,[path.join(root,'scripts',script)],{cwd:root,encoding:'utf8'});
  assert.equal(r.status,0,script+' failed: '+r.stderr);
}

const generatedAppHtml=fs.readFileSync(path.join(root,'dist','app','index.html'),'utf8');
assert.doesNotMatch(generatedAppHtml,/\bshowLanding\s*\(/,'Generated production app must not retain a dead showLanding() call');

const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'};
function serve(dir){
  const server=http.createServer((req,res)=>{
    let pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    if(pathname.endsWith('/'))pathname+='index.html';
    let file=path.join(dir,pathname.replace(/^\//,''));
    if(!file.startsWith(dir)){res.writeHead(403);return res.end('forbidden')}
    if(!fs.existsSync(file)){res.writeHead(404);return res.end('not found')}
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server)));
}
const urlFor=server=>'http://127.0.0.1:'+server.address().port;

const marketingServer=await serve(path.join(root,'dist','marketing'));
const appServer=await serve(path.join(root,'dist','app'));
const browser=await chromium.launch({headless:true});
try{
  const marketing=await browser.newPage();
  await marketing.goto(urlFor(marketingServer)+'/',{waitUntil:'domcontentloaded'});
  await marketing.waitForSelector('.hero');
  assert.equal(await marketing.locator('#mainApp').count(),0,'marketing must not contain app runtime');
  assert.equal((await marketing.locator('.hero h1').textContent()).replace(/\s+/g,' ').trim(),'Je bent ondernemer.Geen boekhouder.');
  assert.match(await marketing.locator('a[href^="https://app.boekuna.nl/"]').first().getAttribute('href'),/^https:\/\/app\.boekuna\.nl\//);

  const app=await browser.newPage();
  await app.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',route=>route.fulfill({
    status:200,
    contentType:'text/javascript',
    body:`export function createClient(){return {auth:{getSession:async()=>({data:{session:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1',nextLevel:'aal1'},error:null})}}}}`
  }));
  await app.goto(urlFor(appServer)+'/',{waitUntil:'domcontentloaded'});
  await app.waitForSelector('#authForm');
  assert.equal(await app.title(),'Boekuna — je administratie');
  assert.equal(await app.locator('meta[name="robots"]').getAttribute('content'),'noindex,nofollow');
  assert.equal(await app.locator('.marketing-hero').count(),0,'product host must not render marketing hero');
  assert.equal(await app.locator('#mainApp').evaluate(el=>getComputedStyle(el).display),'none','logged-out product app must remain behind auth');
  assert.equal(await app.locator('.back-to-site').count(),0,'Product login has no marketing exit');
  assert.ok(await app.locator('#authForm').isVisible(),'Login remains available');

  const protectedApp=await browser.newPage();
  const protectedErrors=[];
  protectedApp.on('pageerror',error=>protectedErrors.push(String(error)));
  await protectedApp.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',route=>route.fulfill({
    status:200,
    contentType:'text/javascript',
    body:`
let session={user:{id:'generated-logout-user',email:'logout@example.test',user_metadata:{first_name:'QA'}},access_token:'test-token',expires_at:4102444800};
let authListener=()=>{};
function query(table){
  const q={
    select(){return q},eq(){return q},order(){return q},limit(){return q},upsert(){return q},insert(){return q},update(){return q},delete(){return q},
    maybeSingle:async()=>({data:table==='profiles'?{company:{}}:table==='ledger_state'?{state:{meta:{nextInvoice:1}},version:1}:null,error:null}),
    single:async()=>({data:null,error:null}),
    then(resolve){resolve({data:[],error:null})}
  };
  return q;
}
export function createClient(){
  return {
    auth:{
      getSession:async()=>({data:{session},error:null}),
      refreshSession:async()=>({data:{session},error:null}),
      onAuthStateChange:cb=>{authListener=cb;return {data:{subscription:{unsubscribe(){}}}}},
      signOut:async()=>{window.__generatedSignOutCalled=(window.__generatedSignOutCalled||0)+1;session=null;queueMicrotask(()=>authListener('SIGNED_OUT',null));return {error:null}},
      mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1',nextLevel:'aal1'},error:null})}
    },
    from:query,
    rpc:async name=>name==='get_billing_summary'
      ?{data:{plan:'free',status:'free',entitlement_status:'free'},error:null}
      :name==='save_ledger_state'?{data:2,error:null}:{data:null,error:null},
    channel:()=>({on(){return this},subscribe(){return this},unsubscribe(){}}),
    storage:{from:()=>({remove:async()=>({error:null})})}
  }
}
`
  }));
  await protectedApp.goto(urlFor(appServer)+'/',{waitUntil:'domcontentloaded'});
  await protectedApp.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor();
  await protectedApp.evaluate(()=>history.pushState({protected:true},'',location.pathname+'?protected=1'));
  await protectedApp.evaluate(()=>navigate('settings'));
  await protectedApp.locator('#settingsLogoutButton').waitFor();
  await protectedApp.locator('#settingsLogoutButton').click();
  await protectedApp.waitForFunction(()=>window.__generatedSignOutCalled===1);
  await protectedApp.locator('#authForm').waitFor();
  assert.equal(await protectedApp.locator('#mainApp').evaluate(el=>getComputedStyle(el).display),'none','Generated app must hide protected UI after logout');
  assert.ok(await protectedApp.locator('#authForm').isVisible(),'Generated app must render login UI after logout');
  assert.equal(await protectedApp.evaluate(()=>window.__generatedSignOutCalled),1,'Generated app logout must execute Supabase signOut exactly once');
  assert.deepEqual(protectedErrors,[],'Generated app logout must not throw JavaScript errors');
  await protectedApp.evaluate(()=>history.back());
  await protectedApp.waitForTimeout(50);
  assert.equal(await protectedApp.locator('#mainApp').evaluate(el=>getComputedStyle(el).display),'none','Browser Back must not restore protected app UI after logout');
  assert.ok(await protectedApp.locator('#authForm').isVisible(),'Browser Back must keep login UI visible after logout');
  assert.deepEqual(protectedErrors,[],'Browser Back after logout must not throw JavaScript errors');
  await protectedApp.close();
} finally {
  await browser.close();
  await new Promise(resolve=>marketingServer.close(resolve));
  await new Promise(resolve=>appServer.close(resolve));
}
console.log('BOEKUNA split surface browser smoke: PASS');
