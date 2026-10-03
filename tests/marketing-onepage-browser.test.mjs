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
const axeErrors=[];

async function axe(page,label){
  await page.addScriptTag({content:axeSource});
  const result=await page.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
  if(result.violations.length)axeErrors.push({label,violations:result.violations.map(v=>({id:v.id,nodes:v.nodes.length}))});
}
async function noOverflow(page,label){
  const sizes=await page.evaluate(()=>({vw:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert.ok(sizes.html<=sizes.vw+1&&sizes.body<=sizes.vw+1,label+' overflow '+JSON.stringify(sizes));
}
async function assertFocus(page,selector,label){
  const el=page.locator(selector).first();
  await el.focus();
  const state=await el.evaluate(node=>{const s=getComputedStyle(node);return {outline:s.outlineStyle,width:parseFloat(s.outlineWidth)}});
  assert.notEqual(state.outline,'none',label+' focus outline missing');
  assert.ok(state.width>=3,label+' focus outline too thin');
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
  assert.match(state.h1,/Space Grotesk/i,label+' headings must use Space Grotesk');
}

try{
  for(const [name,type] of engines){
    const browser=await type.launch({headless:true});
    try{
      for(const width of widths){
        const page=await browser.newPage({viewport:{width,height:width<700?844:960},reducedMotion:'reduce'});
        const runtime=[];
        const failed=[];
        page.on('pageerror',e=>runtime.push(String(e)));
        page.on('console',m=>{if(m.type()==='error')runtime.push(m.text())});
        page.on('requestfailed',req=>failed.push(req.url()+' '+(req.failure()?.errorText||'')));
        const response=await page.goto(server.base+'/',{waitUntil:'networkidle'});
        assert.equal(response.status(),200,name+' '+width+' homepage HTTP');
        await waitFonts(page,name+' '+width);
        assert.ok(await page.locator('.hero h1').isVisible(),name+' '+width+' hero visible');
        assert.equal((await page.locator('.hero h1').innerText()).replace(/\s+/g,' ').trim(),'Je bent ondernemer. Geen boekhouder.');
        const loginLinks=page.locator('a[href="https://app.boekuna.nl/?login=1"]');
        assert.ok(await loginLinks.count()>=1,name+' '+width+' login link present');
        if(width>640)assert.ok(await loginLinks.first().isVisible(),name+' '+width+' desktop/tablet login visible');
        assert.ok(await page.locator('.hero a[href="https://app.boekuna.nl/?register=1"]').isVisible(),name+' '+width+' registration CTA visible');
        for(const id of ['product','hoe-het-werkt','inzicht','prijzen','faq'])assert.equal(await page.locator('#'+id).count(),1,name+' '+width+' missing #'+id);
        assert.equal(await page.locator('.product-visual img').count(),2,name+' '+width+' must render exactly two real product captures');
        await noOverflow(page,name+' '+width);
        assert.deepEqual(runtime,[],name+' '+width+' runtime errors');
        assert.deepEqual(failed,[],name+' '+width+' failed requests');
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
          await page.locator('#mobileMenu').waitFor({state:'visible'});
          assert.ok(await page.locator('#mobileMenu a[href="#product"], #mobileMenu a[href="/#product"]').first().isVisible(),name+' mobile menu content visible');
          assert.ok(await page.locator('#mobileMenu a[href="https://app.boekuna.nl/?login=1"]').isVisible(),name+' mobile login visible after menu opens');
          await page.keyboard.press('Escape');
          assert.equal(await toggle.getAttribute('aria-expanded'),'false',name+' menu closes with Escape');
          assert.ok(await toggle.evaluate(el=>el===document.activeElement),name+' focus restored to menu trigger');
        }
        const faq=page.locator('.faq-list details').first();
        await faq.locator('summary').click();
        assert.equal(await faq.getAttribute('open'),'',name+' FAQ disclosure opens');
        await page.close();
      }

      const retiredRedirects={
        '/functies/':'/#product','/facturen/':'/#product','/scanner/':'/#product','/btw-bank/':'/#product','/rapportages/':'/#product',
        '/hoe-het-werkt/':'/#hoe-het-werkt','/voor-ondernemers/':'/#product','/prijzen/':'/#prijzen','/faq/':'/#faq',
        '/over/':'/#product','/contact/':'/support/','/veiligheid/':'/privacy/'
      };
      for(const [route,destination] of Object.entries(retiredRedirects)){
        const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
        await page.goto(server.base+route,{waitUntil:'domcontentloaded'});
        const target=new URL(destination,server.base);
        await page.waitForURL(url=>url.pathname===target.pathname&&url.hash===target.hash);
        const actual=new URL(page.url());
        assert.equal(actual.pathname,target.pathname,name+' retired route pathname '+route);
        assert.equal(actual.hash,target.hash,name+' retired route hash '+route);
        await page.close();
      }

      for(const route of ['/privacy/','/voorwaarden/','/support/','/account-verwijderen/']){
        const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
        const runtime=[];
        page.on('pageerror',e=>runtime.push(String(e)));
        page.on('console',m=>{if(m.type()==='error')runtime.push(m.text())});
        const response=await page.goto(server.base+route,{waitUntil:'networkidle'});
        assert.equal(response.status(),200,name+' retained route '+route);
        await page.locator('.site-header').waitFor();
        await waitFonts(page,name+' retained '+route);
        assert.ok(await page.locator('h1').isVisible(),name+' retained route h1 '+route);
        await noOverflow(page,name+' retained '+route);
        await axe(page,name+' retained '+route);
        assert.deepEqual(runtime,[],name+' retained route runtime errors '+route);
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
  assert.deepEqual(axeErrors,[],'Axe accessibility regressions: '+JSON.stringify(axeErrors));
  console.log('BOEKUNA one-page browser QA: PASS (Chromium + WebKit; 9 widths; local fonts; Axe; keyboard; reduced motion; no-JS; retained endpoints; retired-route redirects)');
}finally{
  await server.close();
}
