import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {serveMarketing,settleImages} from './helpers/marketing-site.mjs';
const server=await serveMarketing('dist/marketing');
const routes=['/facturen/','/bonnen/','/btw/','/bank/','/rapportages/','/mobiel/','/hoe-het-werkt/'];
try{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch();
  try{
   for(const width of [320,390,768,1440]){
    const page=await browser.newPage({viewport:{width,height:960},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(server.base);
    await page.emulateMedia({colorScheme:'dark'});
    assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)','Editorial palette remains white in dark preference');
    await page.emulateMedia({colorScheme:'light'});
    assert.equal(await page.locator('img[src*="ondernemer-werkplek"]').count(),0);
    const links=await page.locator('.project-card, .hero-cta a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
    assert.ok(links.every(href=>!href.startsWith('#')&&!href.includes('/#')),links.join(','));
    await page.getByRole('link',{name:/Bekijk hoe het werkt/}).click();
    assert.equal(new URL(page.url()).pathname,'/hoe-het-werkt/');
    for(const route of routes){
     await page.goto(server.base+route,{waitUntil:'networkidle'});
     assert.equal(new URL(page.url()).pathname,route,'No feature page may redirect home');
     assert.equal(await page.locator('h1').count(),1);
     await settleImages(page);
     const size=await page.evaluate(()=>document.documentElement.scrollWidth);assert.ok(size<=width+1,`${name} ${route} ${width} overflow`);
     for(const link of await page.locator('main a').all()){
      const href=await link.getAttribute('href');assert.ok(!href.startsWith('#'));assert.notEqual(href,route);
      if(href.startsWith('/'))assert.equal((await page.request.get(server.base+href)).status(),200,href);
     }
     const image=page.locator('.detail-product img');
     assert.equal(await image.evaluate(el=>getComputedStyle(el).objectFit),'contain');
    }
    assert.deepEqual(errors,[]);
    await page.close();
   }
  }finally{await browser.close()}
 }
 console.log('Marketing navigation/image QA: PASS (7 real pages, both engines, four widths, next-page CTAs, no portraits, editorial palette, uncropped images)');
}finally{await server.close()}
