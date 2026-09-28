import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root=process.cwd();
const qaDir=path.join(root,'tests','artifacts','marketing-qa');
fs.mkdirSync(qaDir,{recursive:true});
const sourcePath=path.join(root,'kwinest','index.html');
let home=fs.readFileSync(sourcePath,'utf8');
const boot=home.lastIndexOf('initAuth();');
assert.ok(boot>=0,'Homepage bootstrap marker missing');
home=home.slice(0,boot)+'showLanding();'+home.slice(boot+'initAuth();'.length);

const mime={'.webp':'image/webp','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(pathname.startsWith('/assets/')){
    const file=path.join(root,'public',pathname);
    if(file.startsWith(path.join(root,'public'))&&fs.existsSync(file)){
      res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
      return fs.createReadStream(file).pipe(res);
    }
  }
  if(pathname!=='/'){
    const file=path.join(root,'public',pathname,'index.html');
    if(file.startsWith(path.join(root,'public'))&&fs.existsSync(file)){
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
      return fs.createReadStream(file).pipe(res);
    }
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(home);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const viewports=[320,360,390,430,768,1024,1440];

async function assertNoOverflow(page,label){
  const x=await page.evaluate(()=>({vw:innerWidth,sw:document.documentElement.scrollWidth,bw:document.body.scrollWidth}));
  assert.ok(x.sw<=x.vw+1&&x.bw<=x.vw+1,label+': horizontal overflow '+JSON.stringify(x));
}

try{
  for(const width of viewports){
    const page=await browser.newPage({viewport:{width,height:width<620?844:900},reducedMotion:'reduce',hasTouch:width<768});
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    await page.locator('.bv-home-hero').waitFor();
    await assertNoOverflow(page,'home '+width+'px');
    assert.equal(await page.locator('img[src*="/assets/product/"]').count(),0,'home '+width+': product screenshot must not render');
    assert.equal(await page.locator('.product-proof,.product-crop,.product-mobile').count(),0,'home '+width+': screenshot components must not render');
    assert.ok(await page.locator('.bv').count()>=7,'home '+width+': abstract visual replacements missing');
    const reveal=await page.locator('.bv[data-bv-reveal]').evaluateAll(nodes=>nodes.map(el=>({opacity:getComputedStyle(el).opacity,transform:getComputedStyle(el).transform})));
    assert.ok(reveal.every(x=>x.opacity==='1'&&x.transform==='none'),'home '+width+': reduced-motion visuals must remain visible');
    assert.ok(await page.locator('a[href="/?register=1"]').count()>=1,'home '+width+': registration CTA regression');
    assert.deepEqual(errors,[],'home '+width+': page errors '+errors.join(' | '));
    if(width===390||width===1440) await page.screenshot({path:path.join(qaDir,'home-'+width+'.png'),fullPage:true});
    if(width<=430){
      const heights=await page.locator('[data-bv-stepper] [data-bv-step]').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
      assert.ok(heights.every(h=>h>=44),'home '+width+': documentflow touch target below 44px: '+heights.join(','));
    }
    await page.close();
  }

  {
    const page=await browser.newPage({viewport:{width:1024,height:900},reducedMotion:'reduce'});
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    const first=page.locator('[data-concept-tab="facturen"]');
    await first.focus();
    await page.keyboard.press('ArrowRight');
    const docs=page.locator('[data-concept-tab="documenten"]');
    assert.equal(await docs.getAttribute('aria-selected'),'true','ArrowRight must select Documents concept');
    assert.equal(await page.locator('[data-concept-panel="documenten"]').isVisible(),true,'Documents concept panel must become visible');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-concept-tab="btw"]').getAttribute('aria-selected'),'true','Second ArrowRight must select Btw concept');
    await page.close();
  }

  {
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    const story=page.locator('.bv-home-section.alt [data-bv-stepper]').first();
    await story.locator('[data-bv-step="4"]').click();
    assert.equal(await story.getAttribute('data-step'),'4','Documentflow must reach step 4');
    assert.equal(await story.locator('[data-bv-step-title]').textContent(),'Klaar','Documentflow title must update');
    assert.equal(await page.locator('img[src*="/assets/product/"]').count(),0,'Documentflow must not inject product screenshots');
    await page.close();
  }

  {
    const page=await browser.newPage({viewport:{width:768,height:900},reducedMotion:'reduce'});
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    const withBtn=page.locator('[data-compare="with"]');
    await withBtn.focus();
    await page.keyboard.press('Enter');
    assert.equal(await withBtn.getAttribute('aria-pressed'),'true','Before/after keyboard state must update');
    assert.match(await page.locator('#compareTitle').textContent(),/administratieve lijn/i);
    await page.close();
  }

  for(const slug of ['functies','facturen','scanner','btw-bank','rapportages','hoe-het-werkt','voor-ondernemers']){
    for(const width of [390,1440]){
      const page=await browser.newPage({viewport:{width,height:width===390?844:900},reducedMotion:'reduce',hasTouch:width===390});
      const errors=[];page.on('pageerror',e=>errors.push(String(e)));
      await page.goto(base+'/'+slug+'/',{waitUntil:'domcontentloaded'});
      await page.locator('.bv').first().waitFor();
      await assertNoOverflow(page,slug+' '+width+'px');
      assert.equal(await page.locator('img[src*="/assets/product/"]').count(),0,slug+': screenshot must not render');
      assert.equal(await page.locator('.product-crop,.product-mobile,.mk-window').count(),0,slug+': legacy product/mockup block remains');
      assert.deepEqual(errors,[],slug+' '+width+': page errors '+errors.join(' | '));
      await page.screenshot({path:path.join(qaDir,slug+'-'+width+'.png'),fullPage:true});
      await page.close();
    }
  }

  {
    const page=await browser.newPage({viewport:{width:390,height:844},javaScriptEnabled:false});
    await page.goto(base+'/scanner/',{waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('h1').count(),1,'Scanner no-JS must retain its primary content');
    assert.ok(await page.locator('.bv-stepper').count()>=1,'Scanner no-JS must retain the visual explanation');
    assert.equal(await page.locator('img[src*="/assets/product/"]').count(),0,'No-JS route must remain screenshot-free');
    await page.close();
  }

  console.log('Screenshot-free marketing responsive QA: PASS (320, 360, 390, 430, 768, 1024, 1440 + keyboard + touch + reduced-motion + public routes)');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
