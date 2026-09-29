import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root=process.cwd();
const sourcePath=path.join(root,'kwinest','index.html');
fs.mkdirSync(path.join(root,'tests','artifacts'),{recursive:true});
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
    assert.equal(await page.locator('.kz-hero h1 span').evaluate(el=>getComputedStyle(el).color),'rgb(43, 115, 108)',`Calm Control hero accent missing at ${width}px`);
    assert.equal(await page.locator('.kz-hero-actions .mk-btn.primary').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(18, 59, 58)',`Calm Control primary CTA missing at ${width}px`);
    if([390,1440,1920].includes(width))await page.screenshot({path:path.join(root,'tests','artifacts',`brand-home-${width}.png`),fullPage:true});
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
  await new Promise(resolve=>server.close(resolve));
}
