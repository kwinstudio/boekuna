import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {serveMarketing} from './helpers/marketing-site.mjs';

const server=await serveMarketing('dist/marketing');
const retired=['/functies/','/assistent/','/scanner/','/prijzen/','/veiligheid/','/faq/','/facturen/','/bonnen/','/btw/','/bank/','/rapportages/','/mobiel/','/hoe-het-werkt/'];
const preserved=['/privacy/','/voorwaarden/','/support/','/account-verwijderen/'];
try{
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch();
    try{
      for(const width of [320,390,768,1440]){
        const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
        const errors=[];page.on('pageerror',e=>errors.push(String(e)));
        await page.goto(server.base+'/',{waitUntil:'networkidle'});
        if(width<980)await page.locator('.mobile-nav summary').click();
        assert.equal(await page.getByRole('navigation',{name:'Hoofdnavigatie'}).getByRole('link',{name:'Inloggen'}).getAttribute('href'),'https://app.boekuna.nl/?login=1');
        for(const href of ['/privacy/','/voorwaarden/','/support/'])assert.equal((await page.request.get(server.base+href)).status(),200,href);
        for(const route of retired){
          await page.goto(server.base+route,{waitUntil:'networkidle'});
          assert.equal(await page.locator('h1').innerText(),'Nieuwe website in ontwikkeling.',name+' '+route);
          assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'),'noindex,follow',route);
          assert.equal(await page.locator('.editorial-hero,.detail-hero,.project-grid,.editorial-pricing,.audience-grid').count(),0,route+' old UI returned');
          const size=await page.evaluate(()=>document.documentElement.scrollWidth);
          assert.ok(size<=width+1,`${name} ${route} ${width} overflow`);
        }
        for(const route of preserved)assert.equal((await page.request.get(server.base+route)).status(),200,name+' '+route);
        assert.deepEqual(errors,[]);
        await page.close();
      }
    }finally{await browser.close()}
  }
  console.log('Clean marketing navigation QA: PASS (retired routes hold, required routes live, both engines, four widths)');
}finally{await server.close()}
