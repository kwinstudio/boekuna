import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium,webkit} from 'playwright';
import {serveMarketing} from './helpers/marketing-site.mjs';

const require=createRequire(import.meta.url);
const axeSource=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const root=process.cwd();
const dist=path.join(root,'dist','marketing');
const evidence=path.join(root,'tests','artifacts','onepage');
fs.mkdirSync(evidence,{recursive:true});
const server=await serveMarketing(dist);
const widths=[320,360,375,390,393,430,768,1024,1440];
const engines=[['chromium',chromium],['webkit',webkit]];
const errors=[];

async function axe(page,label){
  await page.addScriptTag({content:axeSource});
  const result=await page.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
  if(result.violations.length)errors.push({label,violations:result.violations.map(v=>v.id)});
}
async function noOverflow(page,label){
  const sizes=await page.evaluate(()=>({vw:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert.ok(sizes.html<=sizes.vw+1&&sizes.body<=sizes.vw+1,label+' overflow '+JSON.stringify(sizes));
}
async function assertFocus(page,selector,label){
  const el=page.locator(selector).first();
  await el.focus();
  const state=await el.evaluate(node=>{const s=getComputedStyle(node);return {outline:s.outlineStyle,width:parseFloat(s.outlineWidth),color:s.outlineColor}});
  assert.notEqual(state.outline,'none',label+' focus outline missing');
  assert.ok(state.width>=3,label+' focus outline too thin');
}

try{
  for(const [name,type] of engines){
    const browser=await type.launch({headless:true});
    try{
      for(const width of widths){
        const page=await browser.newPage({viewport:{width,height:width<700?844:960},reducedMotion:'reduce'});
        const runtime=[];
        page.on('pageerror',e=>runtime.push(String(e)));
        page.on('console',m=>{if(m.type()==='error')runtime.push(m.text())});
        const response=await page.goto(server.base+'/',{waitUntil:'networkidle'});
        assert.equal(response.status(),200,name+' '+width+' homepage HTTP');
        assert.ok(await page.locator('.hero h1').isVisible(),name+' '+width+' hero visible');
        assert.equal((await page.locator('.hero h1').innerText()).replace(/\s+/g,' ').trim(),'Je bent ondernemer. Geen boekhouder.');
        assert.ok(await page.locator('a[href="https://app.boekuna.nl/?login=1"]').first().isVisible(),name+' '+width+' login visible');
        assert.ok(await page.locator('.hero a[href="https://app.boekuna.nl/?register=1"]').isVisible(),name+' '+width+' registration CTA visible');
        for(const id of ['product','hoe-het-werkt','waarom','prijzen','faq','veiligheid','contact'])assert.equal(await page.locator('#'+id).count(),1,name+' '+width+' missing #'+id);
        await noOverflow(page,name+' '+width);
        assert.deepEqual(runtime,[],name+' '+width+' runtime errors');
        if(width===390||width===1440){
          await axe(page,name+' '+width);
          await page.screenshot({path:path.join(evidence,'home-'+width+'-'+name+'.png'),fullPage:true});
        }
        await assertFocus(page,'.hero .button-primary',name+' '+width+' primary CTA');
        if(width>=1024){
          await page.locator('.nav-links a[href="#product"]').click();
          assert.equal(await page.evaluate(()=>location.hash),'#product',name+' desktop anchor');
        }
        if(width<=768){
          const toggle=page.locator('.menu-toggle');
          assert.ok(await toggle.isVisible(),name+' '+width+' mobile toggle visible');
          await toggle.click();
          assert.equal(await toggle.getAttribute('aria-expanded'),'true',name+' menu expanded');
          assert.ok(await page.locator('#mobileMenu a[href="/#product"]').isVisible(),name+' mobile menu content visible');
          await page.keyboard.press('Escape');
          assert.equal(await toggle.getAttribute('aria-expanded'),'false',name+' menu closes with Escape');
          assert.ok(await toggle.evaluate(el=>el===document.activeElement),name+' focus restored to menu trigger');
        }
        const faq=page.locator('.faq-list details').first();
        await faq.locator('summary').click();
        assert.equal(await faq.getAttribute('open'),'',name+' FAQ disclosure opens');
        await page.close();
      }

      for(const route of ['/privacy/','/voorwaarden/','/support/','/account-verwijderen/']){
        const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
        const response=await page.goto(server.base+route,{waitUntil:'networkidle'});
        assert.equal(response.status(),200,name+' retained route '+route);
        await page.locator('.site-header').waitFor();
        assert.ok(await page.locator('h1').isVisible(),name+' retained route h1 '+route);
        await noOverflow(page,name+' retained '+route);
        await page.close();
      }

      const nojs=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});
      await nojs.goto(server.base+'/',{waitUntil:'domcontentloaded'});
      assert.ok(await nojs.locator('.hero h1').isVisible(),name+' no-JS hero remains visible');
      assert.ok(await nojs.locator('.footer').isVisible(),name+' no-JS footer remains visible');
      await noOverflow(nojs,name+' no-JS');
      await nojs.close();
    }finally{
      await browser.close();
    }
  }
  assert.deepEqual(errors,[],'Axe accessibility regressions: '+JSON.stringify(errors));
  console.log('BOEKUNA one-page browser QA: PASS (Chromium + WebKit; 9 widths; Axe; keyboard; no-JS; retained endpoints)');
}finally{
  await server.close();
}
