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
            charcoal:root.getPropertyValue('--brand-charcoal').trim(),
            green:root.getPropertyValue('--brand-green').trim(),
            light:root.getPropertyValue('--brand-light').trim(),
            muted:root.getPropertyValue('--brand-muted').trim()
          };
        });
        assert.deepEqual(brand,{charcoal:'#1B1F23',green:'#63D471',light:'#F6F7F8',muted:'#8A949C'});

        const broken=await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src));
        assert.deepEqual(broken,[]);

        if(width<=960){
          const burger=page.locator('#burger');
          assert.ok(await burger.isVisible(),name+'/'+width+' mobile menu trigger');
          await burger.click();
          assert.equal(await burger.getAttribute('aria-expanded'),'true');
          assert.equal(await page.locator('main').evaluate(el=>el.inert),true);
          await page.keyboard.press('Shift+Tab');
          assert.equal(await burger.evaluate(el=>el===document.activeElement),true);
          await page.keyboard.press('Escape');
          assert.equal(await burger.getAttribute('aria-expanded'),'false');
          assert.equal(await page.locator('main').evaluate(el=>el.inert),false);
        }else{
          assert.equal(await page.locator('#burger').isVisible(),false,name+'/'+width+' desktop burger hidden');
          assert.ok(await page.locator('.hdr .nav').isVisible(),name+'/'+width+' desktop navigation visible');
          const navTrigger=page.locator('#ddBtn');
          await navTrigger.focus();
          await page.keyboard.press('Enter');
          assert.equal(await navTrigger.getAttribute('aria-expanded'),'true',name+'/'+width+' desktop menu keyboard open');
          await page.keyboard.press('Escape');
          assert.equal(await navTrigger.getAttribute('aria-expanded'),'false',name+'/'+width+' desktop menu Escape close');
          assert.ok(await navTrigger.evaluate(el=>el===document.activeElement),name+'/'+width+' desktop focus restored');
        }

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
      const navTrigger=page.locator('#ddBtn');
      await navTrigger.focus();
      await page.keyboard.press('Enter');
      assert.equal(await navTrigger.getAttribute('aria-expanded'),'true');
      await page.keyboard.press('Escape');
      assert.equal(await navTrigger.evaluate(el=>el===document.activeElement),true);
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
  console.log('BOEKUNA canonical editorial QA: PASS (18 responsive cases, image-free content, menu focus/Escape, Axe, cursor, reduced motion and no JS)');
}finally{
  await server.close();
}
