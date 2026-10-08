// Legal and public links from the app host: forwarding pages for typed/old URLs,
// registration links, and the Privacy en voorwaarden block in Hulp & feedback.
// boekuna.nl is answered by a local stub; nothing leaves the machine.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {buildApp,startAppServer} from './lib/app-fixture.mjs';

buildApp();
const browserName=process.env.BOOKUNA_BROWSER==='webkit'?'webkit':'chromium';
const shotDir=process.env.LEGAL_ROUTES_SHOT_DIR||'tests/artifacts/legal-routes';fs.mkdirSync(shotDir,{recursive:true});
const ROUTES=['/privacy/','/voorwaarden/','/account-verwijderen/','/prijzen/','/support/','/hoe-het-werkt/'];

// Static contract: one forwarding page per public route, and no relative public link left in the app.
const built=fs.readFileSync('dist/app/index.html','utf8');
for(const route of ROUTES){
  const page=fs.readFileSync(path.join('dist/app',route,'index.html'),'utf8');
  assert.ok(page.includes('location.replace("https://boekuna.nl'+route+'"'),route+' forwards to boekuna.nl');
  assert.ok(page.includes('name="robots" content="noindex"'),route+' forwarding page is not indexed');
}
for(const route of ROUTES)assert.ok(!built.includes('href="'+route+'"'),'app still links relatively to '+route);
assert.ok(built.includes('window.BOEKUNA_PUBLIC_LINKS=Object.freeze('),'public link map is available to app assets');

// Serve the built app as Render does (directory index.html), plus the QA fixture at /app.
const {server:appServer,url:appUrl}=await startAppServer({enter:false});
const staticServer=http.createServer((req,res)=>{
  let p=new URL(req.url,'http://x').pathname;if(p.endsWith('/'))p+='index.html';
  const file=path.join(path.resolve('dist/app'),p);
  if(fs.existsSync(file)&&fs.statSync(file).isFile()){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return fs.createReadStream(file).pipe(res)}
  res.writeHead(404);res.end('404');
});
await new Promise(r=>staticServer.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+staticServer.address().port;

const browser=await (browserName==='webkit'?webkit:chromium).launch();
const errors=[];
try{
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
    const tag=viewport.width<600?'mobiel':'desktop';
    const context=await browser.newContext({viewport,reducedMotion:'reduce'});
    await context.route('https://boekuna.nl/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>boekuna.nl stub</title><h1>'+new URL(route.request().url()).pathname+'</h1>'}));
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(String(e)));

    // Typed or old links on the app host end up on the public page, without a 404.
    for(const route of ROUTES){
      const response=await page.goto(base+route);
      assert.equal(response.status(),200,route+' on the app host');
      await page.waitForURL('https://boekuna.nl'+route);
      assert.equal(await page.locator('h1').innerText(),route);
    }

    // Registration (logged out): terms and privacy open the public pages.
    await page.goto(appUrl);
    await page.evaluate(()=>showAuth('register'));
    for(const [name,route] of [['Algemene voorwaarden','/voorwaarden/'],['privacyverklaring','/privacy/']]){
      const link=page.locator('.auth-legal a',{hasText:name});
      assert.equal(await link.getAttribute('href'),'https://boekuna.nl'+route);
      const [popup]=await Promise.all([page.waitForEvent('popup'),link.click()]);
      await popup.waitForLoadState();
      assert.equal(new URL(popup.url()).pathname,route);await popup.close();
    }
    await page.screenshot({path:`${shotDir}/${browserName}-${tag}-registratie.png`});

    // Logged in: Instellingen › Hulp & feedback shows privacy, terms and deletion info.
    await page.evaluate(()=>{enterApp();navigate('settings')});
    await page.evaluate(()=>{const b=document.querySelector('[data-settings-open="help"],[data-settings-key="help"]');if(b)b.click()});
    await page.waitForFunction(()=>!!document.querySelector('.settings-center-block h3')&&[...document.querySelectorAll('h3')].some(h=>h.textContent==='Privacy en voorwaarden'));
    const hrefs=await page.$$eval('.settings-center-block a[target=_blank]',as=>as.map(a=>a.getAttribute('href')));
    for(const route of ['/privacy/','/voorwaarden/','/account-verwijderen/'])assert.ok(hrefs.includes('https://boekuna.nl'+route),'help panel links '+route);
    await page.locator('h3',{hasText:'Privacy en voorwaarden'}).scrollIntoViewIfNeeded();
    await page.screenshot({path:`${shotDir}/${browserName}-${tag}-hulp-privacy.png`});
    await context.close();
    console.log(`PASS legal routes ${browserName} ${tag}`);
  }
  assert.deepEqual(errors,[],'no page errors');
}finally{
  await browser.close();appServer.close();staticServer.close();
}
