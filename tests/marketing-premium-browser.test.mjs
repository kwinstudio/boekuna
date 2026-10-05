import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium,webkit} from 'playwright';
import {serveMarketing,settleImages} from './helpers/marketing-site.mjs';

const require=createRequire(import.meta.url);
const axeSource=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const evidence='tests/artifacts/premium-marketing';
fs.mkdirSync(evidence,{recursive:true});
const server=await serveMarketing('dist/marketing');

try{
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch();
    try{
      for(const width of [320,360,390,430,768,1024,1280,1440,1920]){
        const page=await browser.newPage({viewport:{width,height:960},reducedMotion:'reduce'});
        const errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        await page.goto(server.base,{waitUntil:'networkidle'});
        await settleImages(page);

        assert.equal(await page.locator('h1').getAttribute('aria-label'),'Boekhouden zonder boekhoudtaal.');
        assert.equal(await page.locator('.project-card').count(),4);
        assert.equal(await page.locator('main img').count(),0,'Homepage content must remain screenshot-free');

        const size=await page.evaluate(()=>({html:document.documentElement.scrollWidth,body:document.body.scrollWidth,vw:innerWidth}));
        assert.ok(size.html<=width+1&&size.body<=width+1,JSON.stringify({name,width,...size}));

        const brand=await page.evaluate(()=>{
          const root=getComputedStyle(document.documentElement);
          return {
            lime:root.getPropertyValue('--boekuna-lime').trim(),
            cyan:root.getPropertyValue('--boekuna-cyan').trim()
          };
        });
        assert.deepEqual(brand,{lime:'#E7FE55',cyan:'#BFE7EC'});

        const broken=await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src));
        assert.deepEqual(broken,[]);

        await page.locator('#burger').click();
        assert.equal(await page.locator('#burger').getAttribute('aria-expanded'),'true');
        assert.equal(await page.locator('main').evaluate(el=>el.inert),true);
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.locator('#burger').evaluate(el=>el===document.activeElement),true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#burger').getAttribute('aria-expanded'),'false');
        assert.equal(await page.locator('main').evaluate(el=>el.inert),false);

        if(width===390||width===1440){
          await page.addScriptTag({content:axeSource});
          const result=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));
          assert.deepEqual(result,[],`${name}/${width} accessibility`);
          await page.screenshot({path:`${evidence}/home-${width}-${name}.png`,fullPage:true});
        }
        assert.deepEqual(errors,[]);
        await page.close();
      }

      const page=await browser.newPage({viewport:{width:1440,height:960}});
      await page.goto(server.base,{waitUntil:'networkidle'});
      await page.locator('#burger').click();
      await page.waitForFunction(()=>document.activeElement===document.querySelector('#mnav a'));
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#burger').evaluate(el=>el===document.activeElement),true);
      await page.mouse.move(100,150);
      assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).cursor),'none');
      assert.ok(await page.locator('.editorial-cursor').evaluate(el=>el.classList.contains('is-visible')));
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.waitForFunction(()=>!document.body.classList.contains('cursor-active'));
      assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('cursor-active')),false);
      await page.close();

      const nojs=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});
      await nojs.goto(server.base);
      assert.ok(await nojs.locator('h1').isVisible());
      assert.ok(await nojs.locator('.project-card').first().isVisible());
      assert.equal(await nojs.locator('main img').count(),0);
      await nojs.close();
    }finally{
      await browser.close();
    }
  }
  console.log('BOEKUNA lime/cyan editorial QA: PASS (18 responsive cases, image-free content, menu focus/Escape, Axe, cursor, reduced motion and no JS)');
}finally{
  await server.close();
}
