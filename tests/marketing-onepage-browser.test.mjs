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

const routes=['/','/functies/','/assistent/','/scanner/','/prijzen/','/veiligheid/','/faq/','/facturen/','/bonnen/','/btw/','/bank/','/rapportages/','/mobiel/','/hoe-het-werkt/'];
const engines=[['chromium',chromium],['webkit',webkit]];
const axeErrors=[];

async function noOverflow(page,label){
  const s=await page.evaluate(()=>({vw:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert.ok(s.html<=s.vw+1&&s.body<=s.vw+1,label+' horizontal overflow '+JSON.stringify(s));
}

async function axe(page,label){
  await page.addScriptTag({content:axeSource});
  const result=await page.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
  if(result.violations.length)axeErrors.push({label,violations:result.violations.map(v=>({id:v.id,nodes:v.nodes.length}))});
}

try{
  for(const [name,type] of engines){
    const browser=await type.launch({headless:true});
    try{
      for(const route of routes){
        for(const width of [390,1440]){
          const page=await browser.newPage({viewport:{width,height:width<700?844:1000},reducedMotion:'reduce'});
          const runtime=[],failed=[];
          page.on('pageerror',e=>runtime.push(String(e)));
          page.on('console',m=>{if(m.type()==='error')runtime.push(m.text())});
          page.on('requestfailed',req=>failed.push(req.url()+' '+(req.failure()?.errorText||'')));
          const response=await page.goto(server.base+route,{waitUntil:'networkidle'});
          assert.equal(response.status(),200,name+' '+route+' '+width+' HTTP');
          assert.ok(await page.locator('h1').isVisible(),name+' '+route+' h1');
          assert.ok(await page.locator('a.logo').first().isVisible(),name+' '+route+' logo');
          assert.ok(await page.locator('a[href^="https://app.boekuna.nl/?"]').count()>=1,name+' '+route+' app CTA');
          await page.evaluate(async()=>document.fonts.ready);
          await noOverflow(page,name+' '+route+' '+width);
          assert.deepEqual(runtime,[],name+' '+route+' runtime errors');
          assert.deepEqual(failed,[],name+' '+route+' failed requests');
          if(width===390)await axe(page,name+' '+route);
          if((route==='/'||route==='/assistent/'||route==='/prijzen/')&&(width===390||width===1440)){
            await page.screenshot({path:path.join(evidence,(route==='/'?'home':route.replaceAll('/',''))+'-'+width+'-'+name+'.png'),fullPage:true});
          }
          if(width===390){
            const burger=page.locator('#burger');
            assert.ok(await burger.isVisible(),name+' '+route+' mobile menu trigger');
            await burger.click();
            assert.equal(await burger.getAttribute('aria-expanded'),'true',name+' '+route+' menu opens');
            assert.ok(await page.locator('#mnav').evaluate(el=>el.classList.contains('open')),name+' '+route+' mobile menu visible');
            await page.keyboard.press('Escape');
            assert.equal(await burger.getAttribute('aria-expanded'),'false',name+' '+route+' menu closes');
          }
          await page.close();
        }
      }

      const home=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
      await home.goto(server.base+'/',{waitUntil:'networkidle'});
      await home.locator('.try-scan > summary').click();
      await home.locator('#scanBtn').click();
      await home.waitForTimeout(700);
      assert.notEqual((await home.locator('#scanBadge').innerText()).trim(),'Klaar om te scannen',name+' scan demo must react');
      await home.locator('#t-btw').click();
      assert.equal(await home.locator('#t-btw').getAttribute('aria-selected'),'true',name+' product tabs work');
      await home.close();

      const assistant=await browser.newPage({viewport:{width:390,height:844}});
      await assistant.goto(server.base+'/assistent/',{waitUntil:'networkidle'});
      assert.ok((await assistant.locator('main').innerText()).includes('Binnenkort'),name+' assistant upcoming label');
      await assistant.close();

      for(const route of ['/privacy/','/voorwaarden/','/support/','/account-verwijderen/']){
        const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
        const response=await page.goto(server.base+route,{waitUntil:'networkidle'});
        assert.equal(response.status(),200,name+' retained '+route);
        assert.ok(await page.locator('h1').isVisible(),name+' retained '+route+' h1');
        await noOverflow(page,name+' retained '+route);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
  assert.deepEqual(axeErrors,[],'Axe accessibility regressions: '+JSON.stringify(axeErrors));
  console.log('BOEKUNA multipage browser QA: PASS (Chromium + WebKit, mobile + desktop, interactions, Axe)');
} finally {
  await server.close();
}
