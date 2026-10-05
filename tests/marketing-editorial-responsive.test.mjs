import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {serveMarketing} from './helpers/marketing-site.mjs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root=process.cwd();
const artifacts=path.join(root,'tests','artifacts','premium-marketing');
fs.mkdirSync(artifacts,{recursive:true});

const css=fs.readFileSync(path.join(root,'public','assets','editorial-marketing.css'),'utf8');
const home=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
for(const contract of ['#1B1F23','#63D471','#F6F7F8','#8A949C','#FFFFFF','@media(prefers-reduced-motion:reduce)']){
  assert.ok(css.includes(contract),'BOEKUNA marketing contract missing: '+contract);
}
assert.equal(/\/assets\/stories\//.test(home),false,'Homepage screenshot reference returned');
assert.equal(/product-marquee|project-image/.test(home),false,'Homepage screenshot presentation returned');

const build=spawnSync(process.execPath,['scripts/build-marketing.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,build.stderr||build.stdout);
const dist=path.join(root,'dist','marketing');
assert.equal(fs.existsSync(path.join(dist,'assets','stories')),false,'Public build must exclude screenshot assets');

const server=await serveMarketing(dist);
const browser=await chromium.launch({headless:true});
const viewports=[320,360,375,390,393,430,620,768,1024,1280,1440,1920];

async function noOverflow(page,label){
  const value=await page.evaluate(()=>({vw:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert.ok(value.html<=value.vw+1&&value.body<=value.vw+1,label+' horizontal overflow '+JSON.stringify(value));
}

try{
  for(const width of viewports){
    const page=await browser.newPage({viewport:{width,height:width<620?844:900},reducedMotion:'reduce'});
    const errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(server.base+'/',{waitUntil:'networkidle'});
    await page.locator('.hdr-in > .logo').waitFor({state:'visible'});
    await noOverflow(page,'home '+width);

    assert.equal(await page.locator('.project-card').count(),4,'Feature links missing at '+width);
    assert.equal(await page.locator('main img').count(),0,'Screenshot content returned at '+width);
    assert.ok(await page.locator('#burger').isVisible(),'Editorial menu trigger must remain visible at '+width);

    const palette=await page.evaluate(()=>({
      primary:getComputedStyle(document.querySelector('.btn-primary')).backgroundColor,
      intro:getComputedStyle(document.querySelector('.editorial-intro')).backgroundColor
    }));
    assert.equal(palette.primary,'rgb(99, 212, 113)','Primary CTA must be BOEKUNA green at '+width);
    assert.equal(palette.intro,'rgb(246, 247, 248)','Supporting band must be BOEKUNA light gray at '+width);
    assert.deepEqual(errors,[],'Homepage page errors at '+width+': '+errors.join(' | '));

    if([390,1440,1920].includes(width)){
      await page.screenshot({path:path.join(artifacts,'brand-home-'+width+'.png'),fullPage:true});
    }
    await page.close();
  }

  for(const width of [390,1440]){
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
    await page.goto(server.base+'/',{waitUntil:'networkidle'});
    await page.locator('#burger').click();
    assert.equal(await page.locator('#burger').getAttribute('aria-expanded'),'true');
    assert.ok(await page.locator('#mnav').evaluate(el=>el.classList.contains('open')),'Menu must open at '+width);
    await noOverflow(page,'menu '+width);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#burger').getAttribute('aria-expanded'),'false');
    await page.close();
  }

  for(const route of ['/facturen/','/bonnen/','/btw/','/bank/','/rapportages/','/mobiel/','/hoe-het-werkt/']){
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    await page.goto(server.base+route,{waitUntil:'networkidle'});
    assert.equal(await page.locator('.detail-product').count(),0,route+' screenshot stage returned');
    assert.equal((await page.content()).includes('/assets/stories/'),false,route+' screenshot asset returned');
    await noOverflow(page,route);
    await page.close();
  }

  console.log('BOEKUNA canonical responsive QA: PASS (12 home widths + menu + 7 screenshot-free feature routes)');
}finally{
  await browser.close();
  await server.close();
}
