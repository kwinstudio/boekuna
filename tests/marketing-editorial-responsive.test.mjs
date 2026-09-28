import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root=process.cwd();
const sourcePath=path.join(root,'kwinest','index.html');
let html=fs.readFileSync(sourcePath,'utf8');
const boot=html.lastIndexOf('initAuth();');
assert.ok(boot>=0,'Homepage bootstrap marker missing');
html=html.slice(0,boot)+'showLanding();'+html.slice(boot+'initAuth();'.length);

const mime={'.webp':'image/webp','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(pathname.startsWith('/assets/')){
    const file=path.join(root,'public',pathname);
    if(file.startsWith(path.join(root,'public'))&&fs.existsSync(file)){
      res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
      return fs.createReadStream(file).pipe(res);
    }
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(html);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const viewports=[320,360,390,430,768,1024,1440];

try{
  for(const width of viewports){
    const height=width<620?844:900;
    const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
    const errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    const hero=page.locator('.kz-hero-visual .product-mobile img');
    await hero.waitFor();
    await page.waitForFunction(()=>{const i=document.querySelector('.kz-hero-visual .product-mobile img');return !!i&&i.complete&&i.naturalWidth>0});
    const overflow=await page.evaluate(()=>({vw:innerWidth,sw:document.documentElement.scrollWidth,bw:document.body.scrollWidth}));
    assert.ok(overflow.sw<=overflow.vw+1&&overflow.bw<=overflow.vw+1,`Horizontal overflow at ${width}px: ${JSON.stringify(overflow)}`);
    assert.equal(await page.locator('.product-proof').count(),0,`Legacy product-proof must not render at ${width}px`);
    assert.equal(await page.locator('.product-crop').count(),4,`Homepage must render exactly four static crop containers while the OCR mobile review is pending at ${width}px`);
    assert.equal(await page.locator('.product-mobile').count(),2,`Exactly two mobile product compositions expected at ${width}px`);
    if(width<=620){
      const mobileWidths=await page.locator('.product-mobile').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));
      assert.ok(mobileWidths.every(w=>w<=280.5),`Mobile product shot too wide at ${width}px: ${mobileWidths.join(', ')}`);
    }
    assert.deepEqual(errors,[],`Homepage page errors at ${width}px: ${errors.join(' | ')}`);
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

  const desktopProof=await page.locator('.kz-dashboard-proof').boundingBox();
  const actionProof=await page.locator('.kz-action-proof').boundingBox();
  assert.ok(desktopProof&&desktopProof.width<=820.5,'Dashboard proof must stay compact on desktop');
  assert.ok(actionProof&&actionProof.width<=620.5,'Action-center proof must stay compact on desktop');
  assert.equal(await page.locator('[data-kz-tab]').count(),3,'Homepage must expose only three compact product tabs');
  assert.equal(await page.locator('[data-kz-tab="rapportages"]').count(),0,'Rapportages must stay off the compact homepage tabset');
  assert.equal(await page.locator('.kz-workflow .product-mobile').count(),0,'Workflow must not fake a mobile OCR/review screen');
  assert.equal(await page.locator('.kz-workflow .kz-workflow-doc-proof').count(),1,'Workflow must use one compact real Documents fallback crop until OCR mobile review exists');
  assert.equal(await page.locator('.kz-hero-product-proof').count(),0,'Former full-width desktop hero proof must stay removed');
  await page.close();

  console.log('Editorial marketing screenshot responsive QA: PASS (320, 360, 390, 430, 768, 1024, 1440 + keyboard tabs)');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
