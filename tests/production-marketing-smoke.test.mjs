import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE='https://boekuna-boekhouding.onrender.com';
const cases=[
  {path:'/', selectors:['.kz-hero','.kz-hero-product-proof img'], expectedAssets:['boekuna-dashboard-overview-crop.webp','boekuna-document-review-mobile.webp']},
  {path:'/scanner/', selectors:['main','.product-crop picture'], expectedAssets:['boekuna-document-review-desktop-960.webp','boekuna-document-review-mobile.webp']},
  {path:'/hoe-het-werkt/', selectors:['main','.product-crop picture'], expectedAssets:['boekuna-document-review-desktop-960.webp','boekuna-document-review-mobile.webp']}
];
const viewports=[
  {width:390,height:844,label:'390'},
  {width:430,height:900,label:'430'},
  {width:768,height:900,label:'tablet'},
  {width:1440,height:960,label:'desktop'}
];

const browser=await chromium.launch({headless:true});
try{
  for(const vp of viewports){
    for(const tc of cases){
      const page=await browser.newPage({viewport:{width:vp.width,height:vp.height},reducedMotion:'reduce'});
      const pageErrors=[];
      const consoleErrors=[];
      const httpFailures=[];
      page.on('pageerror',e=>pageErrors.push(String(e)));
      page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
      page.on('response',r=>{if(r.url().startsWith(BASE)&&r.status()>=400)httpFailures.push({status:r.status(),url:r.url()})});
      const response=await page.goto(BASE+tc.path,{waitUntil:'domcontentloaded',timeout:60000});
      assert.equal(response?.status(),200,`${tc.path} HTTP status at ${vp.label}`);
      for(const sel of tc.selectors) await page.locator(sel).first().waitFor({state:'visible',timeout:20000});
      await page.evaluate(async()=>{
        const step=Math.max(500,Math.floor(innerHeight*.8));
        for(let y=0;y<document.documentElement.scrollHeight;y+=step){
          window.scrollTo(0,y);
          await new Promise(r=>setTimeout(r,80));
        }
        window.scrollTo(0,0);
      });
      await page.waitForTimeout(700);

      const state=await page.evaluate(()=>({
        sw:document.documentElement.scrollWidth,
        vw:innerWidth,
        title:document.title,
        broken:[...document.images].filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.currentSrc||i.src),
        srcs:[...document.images].flatMap(i=>[i.src,i.currentSrc].filter(Boolean)),
        sourceSets:[...document.querySelectorAll('source')].map(s=>s.srcset),
        heroCtas:[...document.querySelectorAll('a')].filter(a=>/Probeer Boekuna|Bekijk hoe het werkt|Bekijk de software|Open Boekuna/.test(a.textContent||'')).map(a=>({text:a.textContent.trim(),href:a.getAttribute('href')}))
      }));
      assert.ok(state.sw<=state.vw+1,`Horizontal overflow on ${tc.path} at ${vp.label}: ${state.sw} > ${state.vw}`);
      assert.deepEqual(state.broken,[],`Broken production images on ${tc.path} at ${vp.label}`);
      for(const asset of tc.expectedAssets){
        const declared=state.srcs.some(s=>s.includes(asset))||state.sourceSets.some(s=>s.includes(asset));
        assert.ok(declared,`Missing expected production asset ${asset} on ${tc.path} at ${vp.label}`);
      }
      if(tc.path==='/'){
        assert.ok(state.heroCtas.some(x=>x.href==='/?register=1'),`Homepage registration CTA missing at ${vp.label}`);
        assert.ok(state.heroCtas.some(x=>x.href==='/hoe-het-werkt/'),`Homepage product-tour CTA missing at ${vp.label}`);
      }else{
        const review=[...state.srcs,...state.sourceSets].join('\n');
        if(vp.width<=620) assert.ok(review.includes('boekuna-document-review-mobile.webp'),`Mobile review asset not selected/declared on ${tc.path} at ${vp.label}`);
        if(vp.width>=768) assert.ok(review.includes('boekuna-document-review-desktop-960.webp'),`Desktop review asset missing on ${tc.path} at ${vp.label}`);
      }
      assert.deepEqual(pageErrors,[],`Page errors on ${tc.path} at ${vp.label}: ${pageErrors.join(' | ')}`);
      assert.deepEqual(httpFailures,[],`Same-origin HTTP failures on ${tc.path} at ${vp.label}: ${JSON.stringify(httpFailures)}`);
      assert.deepEqual(consoleErrors,[],`Console errors on ${tc.path} at ${vp.label}: ${consoleErrors.join(' | ')}`);
      await page.close();
    }
  }
  console.log('03C production marketing smoke: PASS (live Render URL; 390, 430, tablet, desktop; homepage + scanner + product tour; images/overflow/CTA/console/http)');
}finally{
  await browser.close();
}
