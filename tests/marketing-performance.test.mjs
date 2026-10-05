import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serveMarketing} from './helpers/marketing-site.mjs';

const server=await serveMarketing(path.resolve('dist/marketing'));
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,reducedMotion:'reduce'});
  const session=await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate',{rate:4});
  await session.send('Network.enable');
  await session.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:90000});
  await page.addInitScript(()=>{
    window.lab={lcp:0,cls:0};
    new PerformanceObserver(list=>{for(const entry of list.getEntries())window.lab.lcp=entry.startTime}).observe({type:'largest-contentful-paint',buffered:true});
    new PerformanceObserver(list=>{for(const entry of list.getEntries())if(!entry.hadRecentInput)window.lab.cls+=entry.value}).observe({type:'layout-shift',buffered:true});
  });
  await page.goto(server.base,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(1000);
  const metrics=await page.evaluate(()=>({...window.lab,bytes:performance.getEntriesByType('resource').reduce((sum,e)=>sum+e.transferSize,0)}));
  assert.ok(metrics.lcp<4000,`Mobile lab LCP ${metrics.lcp}ms`);
  assert.ok(metrics.cls<.1,`Mobile lab CLS ${metrics.cls}`);
  assert.ok(await page.locator('.project-card').count()===4);
  const nojs=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});
  await nojs.goto(server.base);
  assert.ok(await nojs.locator('.editorial-intro h2').isVisible());
  assert.ok(await nojs.getByRole('link',{name:'Probeer Boekuna gratis',exact:true}).first().isVisible());
  assert.ok(await nojs.locator('.marquee-card').first().isVisible());
  fs.mkdirSync('tests/artifacts/premium-marketing',{recursive:true});
  fs.writeFileSync('tests/artifacts/premium-marketing/performance.json',JSON.stringify({profile:'390px, CPU 4x, 1.6Mbps, 150ms latency; laboratory measurements, not field INP',...metrics,noJavaScriptContent:true},null,2));
  console.log('Mobile marketing performance/no-JavaScript QA: PASS',metrics);
} finally {await browser.close();await server.close();}
