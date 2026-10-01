import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {serveMarketing,settleImages} from './helpers/marketing-site.mjs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root=process.cwd();
fs.mkdirSync(path.join(root,'tests','artifacts'),{recursive:true});
const build=spawnSync(process.execPath,['scripts/build-marketing.mjs'],{encoding:'utf8'});
assert.equal(build.status,0,build.stderr);
const server=await serveMarketing(path.join(root,'dist','marketing'));
const base=server.base;
const browser=await chromium.launch({headless:true});
const viewports=[320,360,390,430,768,1024,1280,1440,1920];

try{
  for(const width of viewports){
    const height=width<620?844:900;
    const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
    const errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim()==='#123B3A');
    const hero=page.locator('.kz-hero-product-proof .product-proof img');
    await hero.waitFor();
    await page.waitForFunction(()=>{const i=document.querySelector('.kz-hero-product-proof img');return !!i&&i.complete&&i.naturalWidth>0});
    const overflow=await page.evaluate(()=>({vw:innerWidth,sw:document.documentElement.scrollWidth,bw:document.body.scrollWidth}));
    assert.ok(overflow.sw<=overflow.vw+1&&overflow.bw<=overflow.vw+1,`Horizontal overflow at ${width}px: ${JSON.stringify(overflow)}`);
    assert.equal(await page.locator('.product-proof').count(),1,`Exactly one product-proof expected at ${width}px`);
    assert.ok(await page.locator('.product-crop').count()>=3,`Editorial product crops missing at ${width}px`);
    assert.equal(await page.locator('.product-mobile').count(),1,`Exactly one mobile proof expected at ${width}px`);
    assert.deepEqual(errors,[],`Homepage page errors at ${width}px: ${errors.join(' | ')}`);
    assert.equal(await page.locator('.kz-hero h1 span').evaluate(el=>getComputedStyle(el).color),'rgb(231, 240, 238)',`Original brand soft accent on the dark hero missing at ${width}px`);
    assert.equal(await page.locator('.kz-hero-actions .mk-btn.primary').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(248, 247, 243)',`Readable primary CTA on dark brand hero missing at ${width}px`);
    if([390,1440,1920].includes(width)){
      await settleImages(page);
      await page.screenshot({path:path.join(root,'tests','artifacts',`brand-home-${width}.png`),fullPage:true});
    }
    await page.close();
  }

  const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  const docsTab=page.locator('[data-kz-tab="documenten"]');
  await docsTab.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.getElementById('kzProductImage')?.getAttribute('src')?.includes('boekuna-documents-upload-crop.webp'));
  assert.equal(await docsTab.getAttribute('aria-pressed'),'true','Keyboard activation must update active product tab');
  const img=page.locator('#kzProductImage');
  assert.ok(await img.evaluate(el=>el.naturalWidth>0&&el.naturalHeight>0),'Switched real product crop must load');
  await page.close();

  console.log('Editorial marketing screenshot responsive QA: PASS (320, 360, 390, 430, 768, 1024, 1280, 1440, 1920 + keyboard tabs)');
}finally{
  await browser.close();
  await server.close();
}
