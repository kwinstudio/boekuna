import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {routes,serveMarketing,contentSnapshot,dynamicStates} from './helpers/marketing-site.mjs';

// Immutable current-main baseline, not an editable post-redesign capture.
const base='71da7f3a939cad6a4c208bf221a70b1a6c5604bf';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'boekuna-white-content-'));
execFileSync('tar',['-x','-C',tmp],{input:execFileSync('git',['archive',base,'public'],{maxBuffer:64*1024*1024})});
const before=await serveMarketing(path.join(tmp,'public'));
const after=await serveMarketing('dist/marketing');
const browser=await chromium.launch({headless:true});
const report={base,routes:[],removedCaptions:[]};
try{
 for(const route of routes){
  const snapshots=[];
  for(const [index,server] of [before,after].entries()){
   const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});
   await page.goto(server.base+route,{waitUntil:'networkidle'});
   // Only retired captions naming absent screenshots/demo images may be removed.
   if(index===0){
    const removed=await page.locator('.image-free-proof-note').evaluateAll(elements=>{
     const removed=[];
     for(const el of elements)if(/^Echte Boekuna-interface/.test(el.textContent)){
      removed.push(el.textContent);el.remove();
     }
     return removed;
    });
    report.removedCaptions.push(...removed.map(text=>({route,text})));
   }
   const snapshot=await page.evaluate(contentSnapshot);
   snapshots.push(snapshot);
   if(route==='/')snapshot.dynamic=await dynamicStates(page);
   await page.close();
  }
  const [original,actual]=snapshots;
  for(const key of ['words','headings','bodycopy','links','controls','forms','fields','seo','images']){
   assert.deepEqual(actual[key],original[key],route+': content/SEO contract '+key);
  }
  if(route==='/')assert.deepEqual(actual.dynamic,original.dynamic,'Every original interactive state and destination survives');
  for(const section of original.sections)if(section.id)assert.ok(actual.sections.some(s=>s.id===section.id),route+' lost anchor '+section.id);
  const rel=route==='/'?'index.html':route.endsWith('/')?route.slice(1)+'index.html':route.slice(1);
  const scripts=html=>[...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  assert.deepEqual(scripts(fs.readFileSync('dist/marketing/'+rel,'utf8')),scripts(fs.readFileSync(path.join(tmp,'public',rel),'utf8')),route+' inline form/schema code remains verbatim');
  report.routes.push({route,content:true,seo:true,fields:true,inlineHandlers:true});
 }
 for(const file of ['robots.txt','sitemap.xml','assets/marketing.js','assets/homepage.js','assets/marketing.css','assets/homepage.css','assets/brand-v2.css']){
  assert.ok(fs.readFileSync('public/'+file).equals(fs.readFileSync(path.join(tmp,'public',file))),file+' remains byte-identical');
 }
 fs.mkdirSync('tests/artifacts/white-editorial',{recursive:true});
 fs.writeFileSync('tests/artifacts/white-editorial/content.json',JSON.stringify(report,null,2)+'\n');
 console.log('White editorial content parity: PASS ('+routes.length+' routes; all sentences, prices, links, controls, SEO, forms and dynamic states; '+report.removedCaptions.length+' obsolete image captions documented)');
}finally{await browser.close();await before.close();await after.close();fs.rmSync(tmp,{recursive:true,force:true});}
