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
const engines=[['chromium',chromium],['webkit',webkit]];
const widths=[320,375,390,430,768,1024,1280,1440];
const preserved=['/privacy/','/voorwaarden/','/support/','/account-verwijderen/'];
const retired=['/functies/','/assistent/','/scanner/','/prijzen/','/veiligheid/','/faq/','/facturen/','/bonnen/','/btw/','/bank/','/rapportages/','/mobiel/','/hoe-het-werkt/'];

async function noOverflow(page,label){
  const s=await page.evaluate(()=>({vw:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert.ok(s.html<=s.vw+1&&s.body<=s.vw+1,label+' horizontal overflow '+JSON.stringify(s));
}
async function axe(page,label){
  await page.addScriptTag({content:axeSource});
  const result=await page.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
  assert.deepEqual(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' Axe');
}

try{
  for(const [name,engine] of engines){
    const browser=await engine.launch({headless:true});
    try{
      for(const width of widths){
        const page=await browser.newPage({viewport:{width,height:width<600?844:900},reducedMotion:'reduce'});
        const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
        const response=await page.goto(server.base+'/',{waitUntil:'networkidle'});
        assert.equal(response.status(),200,name+' root '+width);
        assert.equal(await page.locator('h1').innerText(),'Nieuwe website in ontwikkeling.');
        assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'),'noindex,follow');
        assert.ok(await page.getByRole('link',{name:'Inloggen'}).isVisible());
        assert.equal(await page.locator('img').count(),0,'Holding page must not contain marketing imagery');
        assert.equal(await page.locator('script').count(),0,'Holding page must not contain marketing JS');
        await noOverflow(page,name+' root '+width);
        await axe(page,name+' root '+width);
        const login=await page.getByRole('link',{name:'Inloggen'}).getAttribute('href');
        assert.equal(login,'https://app.boekuna.nl/?login=1');
        assert.deepEqual(errors,[]);
        if(width===390||width===1440)await page.screenshot({path:path.join(evidence,'clean-holding-'+width+'-'+name+'.png'),fullPage:true});
        await page.close();
      }

      for(const route of preserved){
        const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
        const errors=[];page.on('pageerror',e=>errors.push(String(e)));
        const response=await page.goto(server.base+route,{waitUntil:'networkidle'});
        assert.equal(response.status(),200,name+' '+route);
        assert.equal(await page.locator('h1').count(),1,route+' h1');
        assert.ok(await page.locator('header .brand').isVisible(),route+' baseline brand');
        assert.ok(await page.locator('a[href="https://app.boekuna.nl/?login=1"]').first().isVisible(),route+' app login link');
        await noOverflow(page,name+' '+route);
        await axe(page,name+' '+route);
        assert.deepEqual(errors,[],name+' '+route+' console/page errors');
        await page.close();
      }

      for(const route of retired){
        const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
        const response=await page.goto(server.base+route,{waitUntil:'networkidle'});
        assert.equal(response.status(),200,name+' '+route);
        assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'),'noindex,follow');
        assert.equal(await page.locator('h1').innerText(),'Nieuwe website in ontwikkeling.');
        assert.equal(await page.locator('.editorial-hero,.project-grid,.editorial-pricing,.audience-grid,.detail-hero').count(),0,route+' old marketing UI returned');
        await noOverflow(page,name+' '+route);
        await axe(page,name+' '+route);
        await page.close();
      }
    } finally { await browser.close(); }
  }
  console.log('BOEKUNA marketing clean-slate browser QA: PASS (Chromium + WebKit, 8 widths, legal/support, retired-route holdings, Axe)');
} finally { await server.close(); }