import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base='https://boekuna-boekhouding.onrender.com';
const browser=await chromium.launch({headless:true});
const viewports=[320,360,390,430,768,1024,1440];

function watch(page){
  const pageErrors=[];
  const consoleErrors=[];
  const httpFailures=[];
  page.on('pageerror',e=>pageErrors.push(String(e)));
  page.on('console',msg=>{ if(msg.type()==='error') consoleErrors.push(msg.text()); });
  page.on('response',res=>{
    const u=new URL(res.url());
    if(u.origin===base && res.status()>=400) httpFailures.push(res.status()+' '+u.pathname);
  });
  return {pageErrors,consoleErrors,httpFailures};
}

async function gotoProduction(page,path){
  const response=await page.goto(base+path,{waitUntil:'load',timeout:45000});
  assert.ok(response && response.ok(),`Production HTTP failure for ${path}: ${response?.status()}`);
}

try{
  for(const width of viewports){
    const page=await browser.newPage({viewport:{width,height:width<620?844:900},reducedMotion:'reduce'});
    const signals=watch(page);
    await gotoProduction(page,'/');
    const hero=page.locator('.kz-hero-product-proof .product-proof img');
    await hero.waitFor({state:'visible'});
    await page.waitForFunction(()=>{const i=document.querySelector('.kz-hero-product-proof img');return !!i&&i.complete&&i.naturalWidth>0});
    const overflow=await page.evaluate(()=>({vw:innerWidth,sw:document.documentElement.scrollWidth,bw:document.body.scrollWidth}));
    assert.ok(overflow.sw<=overflow.vw+1&&overflow.bw<=overflow.vw+1,`Production horizontal overflow at ${width}px: ${JSON.stringify(overflow)}`);
    assert.equal(await page.locator('.product-proof').count(),1,`Exactly one production product-proof expected at ${width}px`);
    assert.ok(await page.locator('.product-crop').count()>=3,`Production editorial product crops missing at ${width}px`);
    assert.equal(await page.locator('.product-mobile').count(),1,`Exactly one production mobile proof expected at ${width}px`);
    const review=page.locator('img[src*="boekuna-document-review-mobile.webp"]');
    assert.equal(await review.count(),1,`Homepage real review capture missing at ${width}px`);
    await review.scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>{const el=document.querySelector('img[src*="boekuna-document-review-mobile.webp"]');return !!el&&el.complete&&el.naturalWidth===390&&el.naturalHeight===844},{timeout:15000});
    assert.ok(await review.evaluate(el=>el.complete&&el.naturalWidth===390&&el.naturalHeight===844),`Homepage real review capture failed after scroll at ${width}px`);
    assert.deepEqual(signals.pageErrors,[],`Production homepage page errors at ${width}px: ${signals.pageErrors.join(' | ')}`);
    assert.deepEqual(signals.consoleErrors,[],`Production homepage console errors at ${width}px: ${signals.consoleErrors.join(' | ')}`);
    assert.deepEqual(signals.httpFailures,[],`Production homepage HTTP failures at ${width}px: ${signals.httpFailures.join(' | ')}`);
    await page.close();
  }

  for(const route of ['/scanner/','/hoe-het-werkt/']){
    for(const width of [390,1440]){
      const page=await browser.newPage({viewport:{width,height:width===390?844:960},reducedMotion:'reduce'});
      const signals=watch(page);
      await gotoProduction(page,route);
      const hero=page.locator('main picture img').first();
      await hero.waitFor({state:'visible'});
      await page.waitForFunction(()=>{const p=document.querySelector('main picture img');return !!p&&p.complete&&p.naturalWidth>0});
      const current=await hero.evaluate(el=>({src:el.currentSrc,nw:el.naturalWidth,nh:el.naturalHeight}));
      if(width===390){
        assert.ok(current.src.includes('boekuna-document-review-mobile.webp'),`${route} mobile selected wrong capture: ${current.src}`);
        assert.equal(current.nw,390); assert.equal(current.nh,844);
      }else{
        assert.ok(current.src.includes('boekuna-document-review-desktop-960.webp'),`${route} desktop selected wrong capture: ${current.src}`);
        assert.equal(current.nw,960); assert.equal(current.nh,640);
      }
      const overflow=await page.evaluate(()=>({vw:innerWidth,sw:document.documentElement.scrollWidth,bw:document.body.scrollWidth}));
      assert.ok(overflow.sw<=overflow.vw+1&&overflow.bw<=overflow.vw+1,`${route} horizontal overflow at ${width}px: ${JSON.stringify(overflow)}`);
      assert.deepEqual(signals.pageErrors,[],`${route} page errors at ${width}px: ${signals.pageErrors.join(' | ')}`);
      assert.deepEqual(signals.consoleErrors,[],`${route} console errors at ${width}px: ${signals.consoleErrors.join(' | ')}`);
      assert.deepEqual(signals.httpFailures,[],`${route} HTTP failures at ${width}px: ${signals.httpFailures.join(' | ')}`);
      await page.close();
    }
  }

  const nav=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});
  const signals=watch(nav);
  await gotoProduction(nav,'/');
  const visibleTourLinks=nav.locator('a[href="/hoe-het-werkt/"]:visible');
  assert.ok(await visibleTourLinks.count()>=1,'Production has no visible product-tour link');
  const tourLink=visibleTourLinks.first();
  await tourLink.scrollIntoViewIfNeeded();
  await Promise.all([nav.waitForURL('**/hoe-het-werkt/',{timeout:15000}),tourLink.click()]);
  assert.ok((await nav.title()).includes('Boekuna'),'Production navigation did not reach the Boekuna product tour');
  assert.deepEqual(signals.pageErrors,[],'Production navigation page errors');
  assert.deepEqual(signals.consoleErrors,[],'Production navigation console errors');
  assert.deepEqual(signals.httpFailures,[],'Production navigation HTTP failures');
  await nav.close();

  console.log('PRODUCTION marketing browser verification: PASS (homepage 320/360/390/430/768/1024/1440; Scanner + Product tour 390/1440; real captures, console, HTTP, overflow, navigation)');
}finally{
  await browser.close();
}
