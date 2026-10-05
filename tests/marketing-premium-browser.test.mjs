import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium, webkit} from 'playwright';
import {serveMarketing} from './helpers/marketing-site.mjs';

const require=createRequire(import.meta.url);
const axeSource=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const evidence=path.resolve('tests/artifacts/premium-marketing');
fs.mkdirSync(evidence,{recursive:true});
const server=await serveMarketing(path.resolve('dist/marketing'));
const reports=[];
try {
  for (const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
    const browser=await engine.launch({headless:true});
    try {
      for (const width of [320,360,390,430,768,1024,1280,1440,1920]) {
        const page=await browser.newPage({viewport:{width,height:960},reducedMotion:'reduce'});
        const errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
        await page.goto(server.base+'/',{waitUntil:'networkidle'});
        assert.match(await page.locator('h1').innerText(),/Boekhouden\s+zonder\s+boekhoudtaal\./);
        assert.equal(await page.locator('#story-pause').innerText(),'Afspelen');
        await page.locator('[data-story="1"]').click();
        assert.equal(await page.locator('[data-story="1"]').getAttribute('aria-pressed'),'true');
        assert.ok(await page.locator('#hero-story-1').isVisible());
        await page.locator('[data-story="2"]').focus();
        await page.keyboard.press('Enter');
        assert.ok(await page.locator('#hero-story-2').isVisible());
        await page.locator('[data-story="0"]').click();
        await page.locator('#workflow-step-2').click();
        assert.equal(await page.locator('#workflow-step-2').getAttribute('aria-pressed'),'true');
        await page.locator('.try-scan > summary').click();
        await page.locator('#scanBtn').click();
        await page.waitForTimeout(700);
        assert.notEqual(await page.locator('#scanBadge').innerText(),'Klaar om te scannen');
        await page.locator('#t-bank').click();
        assert.equal(await page.locator('#t-bank').getAttribute('aria-selected'),'true');
        const sizes=await page.evaluate(()=>({width:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
        assert.ok(sizes.html<=width+1&&sizes.body<=width+1,`${name}/${width}: overflow ${JSON.stringify(sizes)}`);
        await page.locator('img').evaluateAll(async imgs=>{for(const img of imgs)img.loading='eager';await Promise.all(imgs.map(img=>img.decode().catch(()=>{})));});
        const broken=await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src));
        assert.deepEqual(broken,[]);
        if (width===390||width===1440) {
          await page.addScriptTag({content:axeSource});
          const violations=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));
          assert.deepEqual(violations,[],`${name}/${width}: Axe`);
          await page.evaluate(()=>scrollTo(0,0));
          await page.screenshot({path:path.join(evidence,`home-${width}-${name}.png`),fullPage:true});
        }
        assert.deepEqual(errors,[]);
        reports.push({engine:name,width,overflow:false,errors});
        await page.close();
      }
      const page=await browser.newPage({viewport:{width:1440,height:960}});
      await page.goto(server.base+'/',{waitUntil:'networkidle'});
      await page.waitForTimeout(6200);
      assert.equal(await page.locator('[data-story="1"]').getAttribute('aria-pressed'),'true','normal motion rotates product stories');
      await page.locator('#story-pause').click();
      assert.equal(await page.locator('#story-pause').innerText(),'Afspelen');
      await page.waitForTimeout(6500);
      assert.equal(await page.locator('[data-story="1"]').getAttribute('aria-pressed'),'true','pause must stop automatic rotation');
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.locator('[data-story="1"]').click();
      assert.ok(await page.locator('#hero-story-1').isVisible(),'manual navigation survives reduced motion');
      await page.close();
    } finally {await browser.close();}
  }
  fs.writeFileSync(path.join(evidence,'qa.json'),JSON.stringify(reports,null,2));
  console.log('Premium marketing browser QA: PASS (18 viewport/engine combinations, keyboard, pause, reduced motion, demos, Axe)');
} finally {await server.close();}
