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
  await marketing.waitForSelector('.kz-hero');
  assert.equal(await marketing.locator('#mainApp').count(),0,'marketing must not contain app runtime');
  assert.equal(await marketing.locator('.kz-hero h1').innerText(),'Je bent ondernemer.\nGeen boekhouder.');
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
  assert.ok((await app.locator('.back-to-site').getAttribute('onclick')||'').includes('https://boekuna.nl/'));
} finally {
  await browser.close();
  await new Promise(resolve=>marketingServer.close(resolve));
  await new Promise(resolve=>appServer.close(resolve));
}
console.log('BOEKUNA split surface browser smoke: PASS');
