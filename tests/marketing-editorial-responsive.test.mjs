import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {serveMarketing,settleImages} from './helpers/marketing-site.mjs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root=process.cwd();
fs.mkdirSync(path.join(root,'tests','artifacts'),{recursive:true});

const identityCss=fs.readFileSync(path.join(root,'public','assets','marketing-editorial.css'),'utf8');
for(const contract of [
  '--boekuna-lime:#E7FE55',
  '--boekuna-cyan:#BFE7EC',
  '--boekuna-white:#FFFFFF',
  '--boekuna-black:#111111',
  '--boekuna-soft:#F6F6F3',
  'URBANIST_ASSET_PENDING'
]){
  assert.ok(identityCss.includes(contract),`Marketing identity contract missing: ${contract}`);
}
for(const legacy of ['#123B3A','#102724','#2B736C','#EEF7F3']){
  assert.equal(identityCss.includes(legacy),false,`Legacy petrol/mint brand token remains: ${legacy}`);
}
const build=spawnSync(process.execPath,['scripts/build-marketing.mjs'],{encoding:'utf8'});
assert.equal(build.status,0,build.stderr);
const server=await serveMarketing(path.join(root,'dist','marketing'));
const base=server.base;
const browser=await chromium.launch({headless:true});
const viewports=[320,360,375,390,393,430,620,768,1024,1280,1440,1920];

try{
  for(const width of viewports){
    const height=width<620?844:900;
    const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
    const errors=[];
    const forbiddenRequests=[];
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('request',req=>{if(req.url().includes('/assets/product/'))forbiddenRequests.push(req.url())});
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>{
      const style=getComputedStyle(document.body);
      return style.getPropertyValue('--boekuna-black').trim()==='#111111'
        && style.getPropertyValue('--boekuna-lime').trim()==='#E7FE55'
        && style.getPropertyValue('--boekuna-cyan').trim()==='#BFE7EC';
    });
    await page.locator(width<=620?'.site-header .logo-lockup-compact':'.site-header .logo-lockup-primary').waitFor({state:'visible'});
    const overflow=await page.evaluate(()=>({vw:innerWidth,sw:document.documentElement.scrollWidth,bw:document.body.scrollWidth}));
    assert.ok(overflow.sw<=overflow.vw+1&&overflow.bw<=overflow.vw+1,`Horizontal overflow at ${width}px: ${JSON.stringify(overflow)}`);
    const header=await page.evaluate(()=>{
      const primary=document.querySelector('.site-header .logo-lockup-primary');
      const compact=document.querySelector('.site-header .logo-lockup-compact');
      const logo=document.querySelector('.site-header .logo');
      const actions=document.querySelector('.site-header .nav-actions');
      const visible=el=>{if(!el)return false;const style=getComputedStyle(el),box=el.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&box.width>0&&box.height>0};
      const logoBox=logo?.getBoundingClientRect(),actionsBox=actions?.getBoundingClientRect();
      return {primary:visible(primary),compact:visible(compact),count:[primary,compact].filter(visible).length,gap:logoBox&&actionsBox?actionsBox.left-logoBox.right:null,compactSrc:compact?.getAttribute('src')||''};
    });
    if(width<=620){
      assert.equal(header.compact,true,`Compact BOEKUNA logo missing at ${width}px`);
      assert.equal(header.primary,false,`Primary logo must not duplicate compact logo at ${width}px`);
      assert.equal(header.count,1,`Exactly one BOEKUNA logo must be visible at ${width}px`);
      assert.ok(header.compactSrc.endsWith('/assets/boekuna-logo-compact.svg'),`Wrong mobile logo asset at ${width}px`);
      assert.ok(header.gap===null||header.gap>=8,`BOEKUNA logo overlaps header actions at ${width}px`);
    }else{
      assert.equal(header.primary,true,`Primary BOEKUNA logo missing at ${width}px`);
      assert.equal(header.compact,false,`Compact logo must stay hidden above 620px at ${width}px`);
      assert.equal(header.count,1,`Exactly one BOEKUNA logo must be visible at ${width}px`);
    }
    assert.equal(await page.locator('img[src*="/assets/product/"],source[srcset*="/assets/product/"]').count(),0,`Product screenshots must be absent at ${width}px`);
    assert.equal(await page.locator('picture').count(),0,`Content picture elements must be absent at ${width}px`);
    assert.deepEqual(forbiddenRequests,[],`Product screenshot requests at ${width}px: ${forbiddenRequests.join(' | ')}`);
    assert.deepEqual(errors,[],`Homepage page errors at ${width}px: ${errors.join(' | ')}`);
    const palette=await page.evaluate(()=>({
      body:getComputedStyle(document.body).backgroundColor,
      hero:getComputedStyle(document.querySelector('.kz-hero h1 span')).color,
      ctaBg:getComputedStyle(document.querySelector('.kz-hero-actions .mk-btn.primary')).backgroundColor,
      ctaText:getComputedStyle(document.querySelector('.kz-hero-actions .mk-btn.primary')).color,
      trust:getComputedStyle(document.querySelector('.kz-trust-strip')).backgroundColor,
      footer:getComputedStyle(document.querySelector('.footer')).backgroundColor
    }));
    assert.equal(palette.body,'rgb(255, 255, 255)',`White canvas missing at ${width}px`);
    assert.equal(palette.hero,'rgb(17, 17, 17)',`Near-black hero type missing at ${width}px`);
    assert.equal(palette.ctaBg,'rgb(231, 254, 85)',`Lime primary CTA missing at ${width}px`);
    assert.equal(palette.ctaText,'rgb(17, 17, 17)',`Near-black CTA text missing at ${width}px`);
    assert.equal(palette.trust,'rgb(191, 231, 236)',`Soft cyan trust band missing at ${width}px`);
    assert.equal(palette.footer,'rgb(17, 17, 17)',`Near-black footer missing at ${width}px`);
    if([390,1440,1920].includes(width)){
      await settleImages(page);
      await page.screenshot({path:path.join(root,'tests','artifacts',`image-free-home-${width}.png`),fullPage:true});
    }
    await page.close();
  }

  const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  const docsTab=page.locator('[data-kz-tab="documenten"]');
  await docsTab.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.getElementById('kzProductCaption')?.textContent?.includes('Documenten'));
  assert.equal(await docsTab.getAttribute('aria-pressed'),'true','Keyboard activation must update active product tab');
  assert.equal(await page.locator('#kzPreviewLink').getAttribute('href'),'/scanner/','Image-free product tab must retain its destination');
  assert.equal(await page.locator('#kzProductImage').count(),0,'Image-free product panel must not recreate a screenshot element');
  await page.close();

  console.log('Image-free marketing responsive QA: PASS (320, 360, 375, 390, 393, 430, 620, 768, 1024, 1280, 1440, 1920 + white/lime/cyan/black palette + keyboard tabs)');
}finally{
  await browser.close();
  await server.close();
}
