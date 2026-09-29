import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root=process.cwd();
const sourcePath=path.join(root,'kwinest','index.html');
let home=fs.readFileSync(sourcePath,'utf8');
const boot=home.lastIndexOf('initAuth();');
assert.ok(boot>=0,'Homepage bootstrap marker missing');
home=home.slice(0,boot)+'showLanding();'+home.slice(boot+'initAuth();'.length);
const qaDir=path.join(root,'tests','artifacts','marketing-rebuild');
fs.mkdirSync(qaDir,{recursive:true});
const mime={'.webp':'image/webp','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};

const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
 if(pathname.startsWith('/assets/')){
  const file=path.join(root,'public',pathname);
  if(file.startsWith(path.join(root,'public'))&&fs.existsSync(file)){res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});return fs.createReadStream(file).pipe(res);}
 }
 if(pathname!=='/'&&pathname.endsWith('/')){
  const file=path.join(root,'public',pathname,'index.html');
  if(file.startsWith(path.join(root,'public'))&&fs.existsSync(file)){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(fs.readFileSync(file,'utf8'));}
 }
 res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(home);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const viewports=[320,360,390,430,768,1024,1280,1440,1920];

try{
 for(const width of viewports){
  const page=await browser.newPage({viewport:{width,height:width<620?844:960},reducedMotion:'reduce',hasTouch:width<=430});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.locator('.rb-product-hero img').waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('.rb-home img')].every(i=>i.complete&&i.naturalWidth>0));
  const overflow=await page.evaluate(()=>({vw:innerWidth,sw:document.documentElement.scrollWidth,bw:document.body.scrollWidth}));
  assert.ok(overflow.sw<=overflow.vw+1&&overflow.bw<=overflow.vw+1,`Horizontal overflow at ${width}px: ${JSON.stringify(overflow)}`);
  assert.equal(await page.locator('.rb-photo img').count(),2,`Two editorial-context images expected at ${width}px`);
  assert.equal(await page.locator('.rb-product img').count(),6,`Six real product visuals expected at ${width}px`);
  assert.equal(await page.locator('h1').count(),1,`One homepage h1 expected at ${width}px`);
  assert.deepEqual(errors,[],`Homepage page errors at ${width}px: ${errors.join(' | ')}`);
  if([390,1440,1920].includes(width))await page.screenshot({path:path.join(qaDir,`home-${width}.png`),fullPage:true});
  await page.close();
 }

 const mobile=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
 await mobile.goto(base+'/',{waitUntil:'domcontentloaded'});
 const toggle=mobile.locator('.marketing-mobile-toggle');
 await toggle.focus();await mobile.keyboard.press('Enter');
 assert.equal(await toggle.getAttribute('aria-expanded'),'true','Mobile menu must open from keyboard');
 assert.ok(await mobile.locator('#marketingMobileMenu').evaluate(el=>el.classList.contains('open')),'Mobile menu class must reflect open state');
 const box=await toggle.boundingBox();assert.ok(box&&box.width>=42&&box.height>=42,'Mobile menu control must remain a usable touch target');
 await mobile.close();

 for(const slug of ['functies','scanner','facturen','prijzen','voor-ondernemers']){
  for(const width of [390,1440]){
   const page=await browser.newPage({viewport:{width,height:width===390?844:960},reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',e=>errors.push(String(e)));
   const response=await page.goto(base+'/'+slug+'/',{waitUntil:'domcontentloaded'});
   assert.ok(response&&response.ok(),`${slug} ${width}: HTTP failure`);
   const overflow=await page.evaluate(()=>({vw:innerWidth,sw:document.documentElement.scrollWidth,bw:document.body.scrollWidth}));
   assert.ok(overflow.sw<=overflow.vw+1&&overflow.bw<=overflow.vw+1,`${slug} ${width}: overflow`);
   assert.equal(await page.locator('h1').count(),1,`${slug} ${width}: one h1 expected`);
   assert.deepEqual(errors,[],`${slug} ${width}: page errors ${errors.join(' | ')}`);
   await page.screenshot({path:path.join(qaDir,`${slug}-${width}.png`),fullPage:true});
   await page.close();
  }
 }

 const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
 const scanner=await noJs.newPage();await scanner.goto(base+'/scanner/',{waitUntil:'domcontentloaded'});
 assert.equal(await scanner.locator('h1').count(),1,'Scanner content must remain readable without JS');
 assert.ok((await scanner.locator('main').innerText()).includes('Upload het bewijsstuk'),'Scanner core copy must not depend on JS');
 await noJs.close();

 console.log('Marketing responsive QA: PASS (320/360/390/430/768/1024/1280/1440/1920 + route matrix + keyboard + no-JS)');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
