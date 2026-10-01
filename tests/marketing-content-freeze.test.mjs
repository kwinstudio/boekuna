import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {routes,slug,serveMarketing,contentSnapshot,dynamicStates,settleImages} from './helpers/marketing-site.mjs';

const capture=process.argv.includes('--capture');
const fixture='tests/fixtures/marketing-content-freeze.json';
const evidence='tests/artifacts/marketing-editorial';
const originalAssets=['marketing.css','marketing.js','homepage.css','brand-v2.css'];
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const bodyText=rows=>rows.map(row=>JSON.parse(row).text).sort();
const normalizeDynamic=states=>Object.fromEntries(Object.entries(states).map(([key,value])=>[key,value&&typeof value==='object'?{text:value.text,link:value.link??null}:value]));
const options={headless:true,...(process.env.MARKETING_CHROMIUM_PATH?{executablePath:process.env.MARKETING_CHROMIUM_PATH}:{})};
const browser=await chromium.launch(options);
const server=await serveMarketing(capture?'public':'dist/marketing');
try{
  if(capture)assert.ok(!fs.existsSync(fixture),'Freeze already exists: never regenerate it to make a failed gate pass');
  const baseline=capture?{baseHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),pages:{},dynamic:{},assets:{}}:JSON.parse(fs.readFileSync(fixture,'utf8'));
  fs.mkdirSync(evidence,{recursive:true});
  for(const route of routes){
    const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});
    await page.goto(server.base+route,{waitUntil:'networkidle'});
    const snapshot=await page.evaluate(contentSnapshot);
    if(capture){baseline.pages[route]=snapshot;}
    else{
      for(const key of ['words','headings','links','controls','forms','fields','seo'])assert.deepEqual(snapshot[key],baseline.pages[route][key],route+': content freeze violation: '+key);
      assert.deepEqual(bodyText(snapshot.bodycopy),bodyText(baseline.pages[route].bodycopy),route+': visible body copy changed during image removal');
      assert.equal(snapshot.sections.length,baseline.pages[route].sections.length,route+': original sections must remain');
      for(const section of baseline.pages[route].sections)if(section.id)assert.ok(snapshot.sections.some(s=>s.id===section.id),route+': lost section anchor '+section.id);
    }
    if(route==='/'){
      const states=await dynamicStates(page);
      if(capture)baseline.dynamic=states;
      else assert.deepEqual(states,normalizeDynamic(baseline.dynamic),'Dynamic product/comparison text and links must remain');
      await page.reload({waitUntil:'networkidle'});
    }
    if(capture&&['/','/functies/','/scanner/','/hoe-het-werkt/','/prijzen/','/faq/','/privacy/','/support/'].includes(route)){
      for(const width of [390,1440]){
        await page.setViewportSize({width,height:width<700?844:960});
        // Lazy image pixels are included in full-page evidence.
        await settleImages(page);
        await page.screenshot({path:path.join(evidence,`before-${slug(route)}-${width}.png`),fullPage:true});
      }
    }
    await page.close();
  }
  for(const asset of originalAssets){
    const hash=sha('public/assets/'+asset);
    if(capture)baseline.assets[asset]=hash;
    else assert.equal(hash,baseline.assets[asset],'Shared/app-used asset must remain unchanged: '+asset);
  }
  for(const file of ['robots.txt','sitemap.xml']){
    const hash=sha('public/'+file);
    if(capture)baseline.assets[file]=hash;
    else assert.equal(hash,baseline.assets[file],'SEO freeze: '+file);
  }
  // Presentation changes cannot silently change any original form handler or
  // inline schema/runtime. Compare the actual generated HTML to immutable Git.
  for(const route of routes){
    const relative=route==='/'?'index.html':route.endsWith('/')?route.slice(1)+'index.html':route.slice(1);
    const original=execFileSync('git',['show',baseline.baseHead+':public/'+relative],{encoding:'utf8'});
    const actual=fs.readFileSync(path.join(capture?'public':'dist/marketing',relative),'utf8');
    const scripts=html=>[...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
    assert.deepEqual(scripts(actual),scripts(original),route+': original inline handlers/schema must remain verbatim');
  }
  if(capture){
    fs.mkdirSync(path.dirname(fixture),{recursive:true});
    fs.writeFileSync(fixture,JSON.stringify(baseline,null,2)+'\n');
    console.log(`Content inventory frozen at ${baseline.baseHead}: ${routes.length} routes, ${Object.keys(baseline.dynamic).length} interactive states, 16 before screenshots`);
  }else console.log(`Marketing content + SEO parity: PASS (${routes.length} routes; 6 dynamic states; original shared assets unchanged)`);
}finally{await browser.close();await server.close();}
