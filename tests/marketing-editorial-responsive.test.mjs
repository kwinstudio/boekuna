import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {serveMarketing} from './helpers/marketing-site.mjs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root=process.cwd();
const artifacts=path.join(root,'tests','artifacts');
fs.mkdirSync(artifacts,{recursive:true});
const build=spawnSync(process.execPath,['scripts/build-marketing.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,build.stderr||build.stdout);
const server=await serveMarketing(path.join(root,'dist','marketing'));
const browser=await chromium.launch({headless:true});
const viewports=[320,360,375,390,393,430,620,768,1024,1280,1440,1920];

try{
  for(const width of viewports){
    const page=await browser.newPage({viewport:{width,height:width<620?844:900},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(server.base+'/',{waitUntil:'networkidle'});
    assert.equal(await page.locator('h1').textContent(),'Zo simpel kan het zijn.');
    if(width<980)await page.locator('.mobile-nav summary').click();
    assert.ok(await page.getByRole('navigation',{name:'Hoofdnavigatie'}).getByRole('link',{name:'Inloggen'}).isVisible());
    const size=await page.evaluate(()=>({vw:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
    assert.ok(size.html<=size.vw+1&&size.body<=size.vw+1,'home '+width+' overflow '+JSON.stringify(size));
    assert.deepEqual(errors,[]);
    if([390,1440].includes(width)){if(width<980)await page.locator('.mobile-nav summary').click();await page.screenshot({path:path.join(artifacts,'brand-v4-'+width+'.png'),fullPage:true});}
    await page.close();
  }
  for(const route of ['/privacy/','/voorwaarden/','/support/','/account-verwijderen/']){
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    await page.goto(server.base+route,{waitUntil:'networkidle'});
    assert.equal(await page.locator('h1').count(),1,route+' h1');
    const size=await page.evaluate(()=>document.documentElement.scrollWidth);
    assert.ok(size<=391,route+' mobile overflow');
    await page.close();
  }
  console.log('BOEKUNA V3 responsive QA: PASS (12 root widths + required public routes)');
}finally{await browser.close();await server.close()}
