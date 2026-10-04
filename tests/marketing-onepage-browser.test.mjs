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
const evidence=path.join(root,'tests','artifacts','multipage');
fs.mkdirSync(evidence,{recursive:true});
const server=await serveMarketing(dist);
const widths=[320,360,375,390,393,430,768,1024,1440];
const engines=[['chromium',chromium],['webkit',webkit]];
const routes=['/','/functies/','/assistent/','/scanner/','/prijzen/','/veiligheid/','/faq/'];
const retained=['/privacy/','/voorwaarden/','/support/','/account-verwijderen/'];
const axeErrors=[];

async function axe(page,label){
  await page.addScriptTag({content:axeSource});
  const result=await page.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
  if(result.violations.length)axeErrors.push({label,violations:result.violations.map(v=>({id:v.id,nodes:v.nodes.length}))});
}
async function noOverflow(page,label){
  const sizes=await page.evaluate(()=>({vw:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert.ok(sizes.html<=sizes.vw+1&&sizes.body<=sizes.vw+1,label+' horizontal overflow '+JSON.stringify(sizes));
}
async function waitFonts(page,label){
  await page.evaluate(async()=>document.fonts.ready);
  const state=await page.evaluate(()=>({
    inter:document.fonts.check('16px Inter'),
    space:document.fonts.check('32px "Space Grotesk"'),
    body:getComputedStyle(document.body).fontFamily,
    h1:getComputedStyle(document.querySelector('h1')).fontFamily
  }));
  assert.ok(state.inter,label+' Inter did not load');
  assert.ok(state.space,label+' Space Grotesk did not load');
  assert.match(state.body,/Inter/i,label+' body must use Inter');
  assert.match(state.h1,/Space Grotesk/i,label+' heading must use Space Grotesk');
}
async function visit(page,url,label){
  const runtime=[];
  const failed=[];
  page.on('pageerror',e=>runtime.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')runtime.push(m.text())});
  page.on('requestfailed',req=>failed.push(req.url()+' '+(req.failure()?.errorText||'')));
  const response=await page.goto(url,{waitUntil:'networkidle'});
  assert.equal(response.status(),200,label+' HTTP');
  assert.ok(await page.locator('h1').isVisible(),label+' h1 visible');
  await noOverflow(page,label);
  assert.deepEqual(runtime,[],label+' runtime errors');
  assert.deepEqual(failed,[],label+' failed requests');
}

try{
  for(const [name,type] of engines){
    const browser=await type.launch({headless:true});
    try{
      for(const width of widths){
        const page=await browser.newPage({viewport:{width,height:width<700?844:960},reducedMotion:'reduce'});
        await visit(page,server.base+'/',name+' home '+width);
        await waitFonts(page,name+' home '+width);
        assert.match((await page.locator('h1').innerText()).replace(/\s+/g,' ').trim(),/Je bent ondernemer\. Geen boekhouder\./);
        assert.ok(await page.locator('a[href="https://app.boekuna.nl/?register=1"]').first().isVisible(),name+' '+width+' free CTA');
        if(width===390||width===1440){
          await axe(page,name+' home '+width);
          await page.screenshot({path:path.join(evidence,'home-'+width+'-'+name+'.png'),fullPage:true});
        }
        if(width<=768){
          const toggle=page.locator('#burger');
          assert.ok(await toggle.isVisible(),name+' '+width+' mobile toggle visible');
          await toggle.click();
          assert.equal(await toggle.getAttribute('aria-expanded'),'true',name+' '+width+' menu opens');
          assert.ok(await page.locator('#mnav').isVisible(),name+' '+width+' mobile nav visible');
          await page.keyboard.press('Escape');
          assert.equal(await toggle.getAttribute('aria-expanded'),'false',name+' '+width+' menu closes with Escape');
        }
        await page.close();
      }

      for(const route of routes){
        for(const width of [390,1440]){
          const page=await browser.newPage({viewport:{width,height:width===390?844:960},reducedMotion:'reduce'});
          await visit(page,server.base+route,name+' '+route+' '+width);
          await waitFonts(page,name+' '+route+' '+width);
          assert.ok(await page.locator('link[href="/assets/site.css"]').count(),name+' '+route+' uses multipage design');
          assert.ok(await page.locator('script[src="/assets/site.js"]').count(),name+' '+route+' uses multipage runtime');
          if(width===390)await axe(page,name+' '+route+' '+width);
          if(route==='/assistent/'){
            assert.match(await page.locator('body').innerText(),/BINNENKORT/i,name+' assistant must be upcoming');
            assert.match(await page.locator('body').innerText(),/wordt gebouwd/i,name+' assistant availability truth');
          }
          if(route==='/prijzen/'){
            await page.locator('[data-pricing="full"] .plan').first().waitFor();
            assert.equal(await page.locator('[data-pricing="full"] .plan').count(),3,name+' pricing plan count');
            const text=await page.locator('[data-pricing="full"]').innerText();
            for(const price of ['€0','€9,95','€19,95'])assert.ok(text.includes(price),name+' pricing '+price);
          }
          if(route==='/faq/'){
            const search=page.locator('#faqSearch');
            await search.fill('btw');
            assert.ok(await page.locator('#faqAll details').count()>0,name+' FAQ search results');
          }
          if(width===390&&['/assistent/','/scanner/','/prijzen/'].includes(route)){
            await page.screenshot({path:path.join(evidence,route.replaceAll('/','')+'-390-'+name+'.png'),fullPage:true});
          }
          await page.close();
        }
      }

      for(const route of retained){
        const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
        await visit(page,server.base+route,name+' retained '+route);
        await page.close();
      }

      const nojs=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});
      const response=await nojs.goto(server.base+'/',{waitUntil:'domcontentloaded'});
      assert.equal(response.status(),200,name+' no-JS HTTP');
      assert.ok(await nojs.locator('h1').isVisible(),name+' no-JS hero visible');
      assert.ok(await nojs.locator('footer').isVisible(),name+' no-JS footer visible');
      await noOverflow(nojs,name+' no-JS');
      await nojs.close();
    }finally{
      await browser.close();
    }
  }
  assert.deepEqual(axeErrors,[],'Axe accessibility regressions: '+JSON.stringify(axeErrors));
  console.log('BOEKUNA multipage browser QA: PASS (Chromium + WebKit; responsive widths; routes; pricing; FAQ; assistant truth; retained legal endpoints)');
}finally{
  await server.close();
}
