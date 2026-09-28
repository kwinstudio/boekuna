import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root=process.cwd();
const sourcePath=path.join(root,'kwinest','index.html');
let html=fs.readFileSync(sourcePath,'utf8');
const boot=html.lastIndexOf('initAuth();');
assert.ok(boot>=0,'Homepage bootstrap marker missing');
html=html.slice(0,boot)+'showLanding();'+html.slice(boot+'initAuth();'.length);

const mime={'.webp':'image/webp','.avif':'image/avif','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
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
    const staticIndex=path.join(root,'public',pathname,'index.html');
    if(staticIndex.startsWith(path.join(root,'public'))&&fs.existsSync(staticIndex)){
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
      return fs.createReadStream(staticIndex).pipe(res);
    }
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(html);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const viewports=[320,360,390,430,768,1024,1440];

async function pageErrors(page){
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));return errors;
}

try{
  for(const width of viewports){
    const height=width<620?844:900;
    const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce',hasTouch:width<900});
    const errors=await pageErrors(page);
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    const hero=page.locator('.kz-hero-visual .product-mobile img');
    await hero.waitFor();
    await page.waitForFunction(()=>{const i=document.querySelector('.kz-hero-visual .product-mobile img');return !!i&&i.complete&&i.naturalWidth>0});

    const overflow=await page.evaluate(()=>({vw:innerWidth,sw:document.documentElement.scrollWidth,bw:document.body.scrollWidth,htmlOverflow:getComputedStyle(document.documentElement).overflowY}));
    assert.ok(overflow.sw<=overflow.vw+1&&overflow.bw<=overflow.vw+1,`Horizontal overflow at ${width}px: ${JSON.stringify(overflow)}`);
    assert.notEqual(overflow.htmlOverflow,'hidden','DocumentStory must not scroll-jack native page scrolling');

    assert.equal(await page.locator('.kz-reveal,.bookuna-reveal').count(),0,`Legacy reveal architecture must be absent at ${width}px`);
    assert.equal(await page.locator('.reveal').count()>0,true,'Selected reveal components must exist');
    const revealStates=await page.locator('.reveal').evaluateAll(nodes=>nodes.map(el=>({opacity:getComputedStyle(el).opacity,transform:getComputedStyle(el).transform})));
    assert.ok(revealStates.every(x=>x.opacity==='1'&&x.transform==='none'),`Reduced motion reveal must be immediately usable at ${width}px`);

    assert.equal(await page.locator('.product-proof').count(),0,`Legacy product-proof must not render at ${width}px`);
    assert.equal(await page.locator('.product-crop').count(),3,`Homepage must render exactly three static desktop/detail crop containers at ${width}px`);
    assert.equal(await page.locator('.product-mobile').count(),4,`Hero plus three-card mobile product rail expected at ${width}px`);

    const storyPosition=await page.locator('.document-story-visual').evaluate(el=>getComputedStyle(el).position);
    if(width>=1024)assert.equal(storyPosition,'sticky',`DocumentStory visual must be sticky at ${width}px`);
    else assert.notEqual(storyPosition,'sticky',`DocumentStory sticky must be disabled at ${width}px`);

    const snap=await page.locator('#mobileProductRail').evaluate(el=>getComputedStyle(el).scrollSnapType);
    assert.ok(/x/.test(snap)&&/mandatory/.test(snap),`Mobile product rail must use x mandatory scroll snap at ${width}px; got ${snap}`);

    if(width<=900){
      const targets=await page.locator('.kz-mobile-rail-tabs button,.document-story-step').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
      assert.ok(targets.every(h=>h>=43.5),`Touch targets must be at least 44px at ${width}px: ${targets.join(', ')}`);
    }
    if(width<=620){
      const mobileWidths=await page.locator('.product-mobile').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));
      assert.ok(mobileWidths.every(w=>w<=280.5),`Mobile product shot too wide at ${width}px: ${mobileWidths.join(', ')}`);
    }

    assert.deepEqual(errors,[],`Homepage page errors at ${width}px: ${errors.join(' | ')}`);
    await page.close();
  }

  // Product tabs: real ARIA tabs + Left/Right keyboard + one stable tabpanel.
  {
    const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('[role="tablist"] .kz-tab').count(),3,'Homepage must expose three ARIA product tabs');
    assert.equal(await page.locator('#kzProductPanel[role="tabpanel"]').count(),1,'Product detail must use one stable tabpanel');
    const invoices=page.locator('#kz-tab-facturen');
    await invoices.focus();
    await page.keyboard.press('ArrowRight');
    const docs=page.locator('#kz-tab-documenten');
    assert.equal(await docs.getAttribute('aria-selected'),'true','ArrowRight must select Documents');
    assert.equal(await docs.evaluate(el=>document.activeElement===el),true,'ArrowRight must move focus to Documents');
    await page.waitForFunction(()=>document.getElementById('kzProductImage')?.getAttribute('src')?.includes('boekuna-documents-upload-crop.webp'));
    await page.keyboard.press('ArrowRight');
    const vat=page.locator('#kz-tab-btw');
    assert.equal(await vat.getAttribute('aria-selected'),'true','Second ArrowRight must select Btw');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await docs.getAttribute('aria-selected'),'true','ArrowLeft must return to Documents');
    const panelBox=await page.locator('#kzProductShell').boundingBox();
    assert.ok(panelBox&&panelBox.width>0&&panelBox.height>0,'Product panel must reserve layout space');
    await page.close();
  }

  // Mouse: only genuinely interactive cards receive hover motion, capped at 2px.
  {
    const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    const interactive=page.locator('.kz-audience-card').first();
    const staticCard=page.locator('.kz-reason').first();
    assert.equal(await interactive.evaluate(el=>el.classList.contains('bookuna-hover-card')),true,'Interactive linked card must receive hover affordance');
    assert.equal(await staticCard.evaluate(el=>el.classList.contains('bookuna-hover-card')),false,'Non-interactive card must not receive hover affordance');
    await interactive.hover();
    await page.waitForTimeout(220);
    const transform=await interactive.evaluate(el=>getComputedStyle(el).transform);
    const translateY=transform==='none'?0:Number((transform.match(/matrix\\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+, ([^)]+)\\)/)||[])[1]||0);
    assert.ok(translateY>=-2.1&&translateY<=0,`Interactive hover lift must stay within 2px; got ${transform}`);
    assert.equal(await page.locator('#kzProductPanel img').count(),1,'Product screenshot transitions must keep exactly one layout image');
    await page.close();
  }

  // Sticky DocumentStory responds to native scroll without intercepting it.
  {
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    const steps=page.locator('.document-story-step');
    assert.equal(await steps.count(),4,'DocumentStory must expose four real-content steps');
    await steps.nth(3).scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelectorAll('.document-story-step')[3]?.getAttribute('aria-current')==='step',{timeout:3000});
    assert.equal(await page.locator('#documentStoryProgressLabel').textContent(),'4 / 4','DocumentStory progress must follow active scroll step');
    const src=await page.locator('#documentStoryImage').getAttribute('src');
    assert.ok(src.includes('boekuna-documents-desktop-960.webp'),'Final story step must use a real Documents capture');
    await page.close();
  }

  // Mobile rail taps and scrolling stay synchronized; no autoplay.
  {
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    const invoiceTab=page.locator('[data-mobile-rail-target="facturen"]');
    await invoiceTab.click();
    assert.equal(await invoiceTab.getAttribute('aria-selected'),'true','Rail tap must update selected state');
    const documentsCard=page.locator('[data-mobile-rail-card="documenten"]');
    await documentsCard.evaluate(el=>el.scrollIntoView({inline:'center',block:'nearest'}));
    await page.waitForFunction(()=>document.querySelector('[data-mobile-rail-target="documenten"]')?.getAttribute('aria-selected')==='true',{timeout:2000});
    assert.equal(await page.locator('[data-mobile-rail-target="documenten"]').getAttribute('aria-selected'),'true','Rail scroll position must sync back to tabs');
    await page.waitForTimeout(350);
    assert.equal(await page.locator('[data-mobile-rail-target="documenten"]').getAttribute('aria-selected'),'true','Rail must not autoplay away from the user-selected screen');
    await page.close();
  }

  // Before/after remains keyboard accessible and keeps a stable footprint.
  {
    const page=await browser.newPage({viewport:{width:1024,height:900},reducedMotion:'reduce'});
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    const panel=page.locator('#comparePanel');
    const before=await panel.boundingBox();
    const withBtn=page.locator('[data-compare="with"]');
    await withBtn.focus();
    await page.keyboard.press('Enter');
    assert.equal(await withBtn.getAttribute('aria-pressed'),'true','Before/after button must expose pressed state');
    const after=await panel.boundingBox();
    assert.ok(before&&after&&Math.abs(before.height-after.height)<1.5,`Before/after height must stay stable: ${before?.height} -> ${after?.height}`);
    await page.close();
  }

  // FAQ uses native buttons, aria-expanded and content-height-safe accordion.
  {
    const page=await browser.newPage({viewport:{width:768,height:900},reducedMotion:'reduce'});
    await page.goto(base+'/faq/',{waitUntil:'domcontentloaded'});
    const first=page.locator('.mk-faq-toggle').first();
    const second=page.locator('.mk-faq-toggle').nth(1);
    assert.equal(await first.evaluate(el=>el.tagName),'BUTTON','FAQ trigger must be a native button');
    assert.equal(await first.getAttribute('aria-expanded'),'true','First FAQ item opens by default');
    await second.focus();await page.keyboard.press('Enter');
    assert.equal(await second.getAttribute('aria-expanded'),'true','FAQ must open from keyboard');
    assert.equal(await first.getAttribute('aria-expanded'),'false','Accordion must close previous item');
    const answer=page.locator('#'+await second.getAttribute('aria-controls'));
    assert.equal(await answer.getAttribute('aria-hidden'),'false','FAQ answer state must be exposed to assistive technology');
    await page.close();
  }

  // Slow image loading: product panel keeps its reserved aspect ratio and does not shift.
  {
    const page=await browser.newPage({viewport:{width:1024,height:900},reducedMotion:'reduce'});
    await page.route('**/assets/product/*.webp',async route=>{await new Promise(r=>setTimeout(r,250));await route.continue()});
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    const shell=page.locator('#kzProductShell');
    const before=await shell.boundingBox();
    await page.waitForFunction(()=>document.getElementById('kzProductImage')?.complete&&document.getElementById('kzProductImage')?.naturalWidth>0);
    const after=await shell.boundingBox();
    assert.ok(before&&after&&Math.abs(before.height-after.height)<1.5,`Product screenshot load must not cause CLS: ${before?.height} -> ${after?.height}`);
    await page.close();
  }

  // JS failure: noscript fallback keeps core proposition and navigation readable.
  {
    const page=await browser.newPage({viewport:{width:390,height:844},javaScriptEnabled:false});
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    const fallback=page.locator('noscript main');
    assert.equal(await fallback.count(),1,'Noscript marketing fallback must exist');
    assert.match(await fallback.locator('h1').textContent(),/Boekuna/i,'Noscript fallback must keep the core proposition readable');
    assert.ok(await fallback.locator('a').count()>=3,'Noscript fallback must retain core navigation');
    await page.close();
  }

  console.log('Marketing interaction responsive QA: PASS (320, 360, 390, 430, 768, 1024, 1440 + tabs + story + rail + FAQ + reduced-motion + slow images + no-JS)');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
