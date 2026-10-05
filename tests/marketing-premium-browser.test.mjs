import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium,webkit} from 'playwright';
import {serveMarketing,settleImages} from './helpers/marketing-site.mjs';
const require=createRequire(import.meta.url);
const axeSource=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const evidence='tests/artifacts/premium-marketing';fs.mkdirSync(evidence,{recursive:true});
const server=await serveMarketing('dist/marketing');
try{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch();
  try{
   for(const width of [320,360,390,430,768,1024,1280,1440,1920]){
    const page=await browser.newPage({viewport:{width,height:960},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(server.base,{waitUntil:'networkidle'});await settleImages(page);
    assert.equal(await page.locator('h1').getAttribute('aria-label'),'Boekhouden zonder boekhoudtaal.');
    assert.equal(await page.locator('.project-card').count(),4);
    const size=await page.evaluate(()=>({html:document.documentElement.scrollWidth,body:document.body.scrollWidth,vw:innerWidth}));
    assert.ok(size.html<=width+1&&size.body<=width+1,JSON.stringify({name,width,...size}));
    assert.equal(await page.locator('.marquee-track').evaluate(el=>getComputedStyle(el).animationName),'none');
    assert.equal(await page.locator('#marquee-pause').isDisabled(),true);
    const broken=await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src));assert.deepEqual(broken,[]);
    await page.locator('#burger').click();
    assert.equal(await page.locator('#burger').getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('main').evaluate(el=>el.inert),true);
    await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('#burger').evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#burger').getAttribute('aria-expanded'),'false');
    assert.equal(await page.locator('main').evaluate(el=>el.inert),false);
    if(width===390||width===1440){
     await page.addScriptTag({content:axeSource});
     const result=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));
     assert.deepEqual(result,[],`${name}/${width} accessibility`);
     await page.screenshot({path:`${evidence}/home-${width}-${name}.png`,fullPage:true});
    }
    assert.deepEqual(errors,[]);await page.close();
   }
   const page=await browser.newPage({viewport:{width:1440,height:960}});
   await page.goto(server.base,{waitUntil:'networkidle'});
   assert.equal(await page.locator('.marquee-track').evaluate(el=>getComputedStyle(el).animationDuration),'30s');
   await page.locator('#marquee-pause').click();assert.equal(await page.locator('#marquee-pause').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('.marquee-track').evaluate(el=>getComputedStyle(el).animationPlayState),'paused');
   await page.locator('#marquee-pause').click();await page.locator('a.logo').first().focus();await page.mouse.move(10,10);
   assert.equal(await page.locator('.marquee-track').evaluate(el=>getComputedStyle(el).animationPlayState),'running');
   await page.mouse.move(100,150);assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).cursor),'none');
   assert.ok(await page.locator('.editorial-cursor').evaluate(el=>el.classList.contains('is-visible')));
   await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('cursor-active')),false);
   await page.close();
   const nojs=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});
   await nojs.goto(server.base);assert.ok(await nojs.locator('h1').isVisible());assert.ok(await nojs.locator('.project-card').first().isVisible());
   assert.equal(await nojs.locator('.marquee-track').evaluate(el=>getComputedStyle(el).animationName),'none');await nojs.close();
  }finally{await browser.close()}
 }
 console.log('Editorial marketing QA: PASS (18 responsive cases, images, menu focus/Escape, Axe, marquee pause, cursor, reduced motion and no JS)');
}finally{await server.close()}
