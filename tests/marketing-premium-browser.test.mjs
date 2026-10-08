import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium,webkit} from 'playwright';
import {serveMarketing} from './helpers/marketing-site.mjs';

const require=createRequire(import.meta.url);
const axeSource=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const evidence=path.join('tests','artifacts','premium-marketing');
fs.mkdirSync(evidence,{recursive:true});
const server=await serveMarketing('dist/marketing');
const widths=[320,375,390,430,768,1024,1280,1440];

try{
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch({headless:true});
    try{
      for(const width of widths){
        const page=await browser.newPage({viewport:{width,height:width<600?844:900},reducedMotion:'reduce'});
        const errors=[];page.on('pageerror',e=>errors.push(String(e)));
        await page.goto(server.base+'/',{waitUntil:'networkidle'});
        assert.equal(await page.locator('h1').textContent(),'Zo simpel kan het zijn.');
        assert.equal(await page.locator('img:not([src^="/assets/site/"])').count(),0,'Only first-party Boekuna images');
        assert.equal(await page.locator('img:not([alt])').count(),0,'Every image has alt text');
        assert.equal(await page.locator('script:not([src="/assets/site/site.js"]):not([type="application/ld+json"])').count(),0,'Only the first-party site script');
        assert.equal(await page.locator('.editorial-hero,.editorial-pricing,.project-grid').count(),0,'Old marketing structure returned');
        const size=await page.evaluate(()=>({vw:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
        assert.ok(size.html<=size.vw+1&&size.body<=size.vw+1,name+'/'+width+' overflow '+JSON.stringify(size));
        const palette=await page.evaluate(()=>{
          const root=getComputedStyle(document.documentElement);
          return ['--ink','--green','--soft','--brand-muted','--paper'].map(k=>root.getPropertyValue(k).trim());
        });
        assert.deepEqual(palette,['#1B1F23','#63D471','#F6F7F8','#8A949C','#FFFFFF']);
        if(width===390||width===1440){
          await page.addScriptTag({content:axeSource});
          const result=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));
          assert.deepEqual(result,[],name+'/'+width+' Axe');
          await page.screenshot({path:path.join(evidence,'landing-v4-'+width+'-'+name+'.png'),fullPage:true});
        }
        assert.deepEqual(errors,[],name+'/'+width+' runtime errors');
        await page.close();
      }
    } finally {await browser.close()}
  }
  console.log('BOEKUNA V4 landing visual QA: PASS (Chromium + WebKit, 8 widths, canonical palette, Axe, first-party imagery and site script only)');
} finally {await server.close()}
