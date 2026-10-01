import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {chromium,webkit} from 'playwright';
import {routes,slug,serveMarketing,settleImages} from './helpers/marketing-site.mjs';

const require=createRequire(import.meta.url);
const axeSource=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const widths=[320,360,375,390,393,430,640,768,820,1024,1280,1440,1920];
const evidence='tests/artifacts/marketing-editorial-v2';
fs.mkdirSync(evidence,{recursive:true});
const server=await serveMarketing('dist/marketing');
const engines=process.env.MARKETING_BROWSER==='chromium'?[['chromium',chromium]]:process.env.MARKETING_BROWSER==='webkit'?[['webkit',webkit]]:[['chromium',chromium],['webkit',webkit]];
const report={routes:routes.length,widths,engines:[],screenshots:[],errors:[],accessibility:[],forms:[],motion:[],brand:[],checks:0};
const beforeDir=fs.mkdtempSync(path.join(os.tmpdir(),'boekuna-marketing-before-'));
const baseline=JSON.parse(fs.readFileSync('tests/fixtures/marketing-content-freeze-v2.json','utf8'));
execFileSync('tar',['-x','-C',beforeDir],{input:execFileSync('git',['archive',baseline.baseHead,'public'],{maxBuffer:64*1024*1024})});
const before=await serveMarketing(path.join(beforeDir,'public'));
const visualRoutes=['/','/functies/','/scanner/','/hoe-het-werkt/','/prijzen/','/rapportages/','/faq/','/privacy/','/support/'];

async function loadImages(page){
  await settleImages(page);
  const broken=await page.locator('img').evaluateAll(images=>images.filter(img=>!img.naturalWidth).map(img=>img.src));
  assert.deepEqual(broken,[],'All remaining functional/brand images must load');
}
async function captureVisual(browser,base,route,width,file){
  // A full-page Chromium capture changes the emulated viewport internally.
  // Use a fresh page per breakpoint so subsequent picture source changes
  // cannot inherit a stale compositor surface from an earlier capture.
  const page=await browser.newPage({viewport:{width,height:width<700?844:960},reducedMotion:'reduce'});
  try{
    await page.goto(base+route,{waitUntil:'networkidle'});
    await loadImages(page);
    await page.screenshot({path:path.join(evidence,file),fullPage:true});
    report.screenshots.push(file);
  }finally{await page.close();}
}
async function overflow(page,label){
  const sizes=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert.ok(sizes.document<=sizes.viewport+1&&sizes.body<=sizes.viewport+1,label+': horizontal overflow '+JSON.stringify(sizes));
  const clipped=await page.evaluate(()=>{const h=document.querySelector('h1');if(!h)return [];const hero=h.closest('.ed-opening,.mk-hero,.how-hero,.page-hero');if(!hero)return [];const box=hero.getBoundingClientRect();const walker=document.createTreeWalker(h,NodeFilter.SHOW_TEXT);const failures=[];while(walker.nextNode()){if(!walker.currentNode.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(walker.currentNode);for(const rect of range.getClientRects())if(rect.left<box.left-2||rect.right>box.right+2)failures.push({text:walker.currentNode.textContent,hero:{left:box.left,right:box.right},textBounds:{left:rect.left,right:rect.right}});}return failures;});
  assert.deepEqual(clipped,[],label+': visible heading text cannot be clipped by the page frame');
  report.checks++;
}
async function audit(page,label){
  await page.addScriptTag({content:axeSource});
  const results=await page.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
  const violations=results.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
  report.accessibility.push({label,violations});
  if(violations.length)report.errors.push({label,violations});
}
try{
 for(const [name,type] of engines){
  const browser=await type.launch({headless:true});
  report.engines.push({name,version:browser.version()});
  try{
   for(const route of routes){
    const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});
    const pageErrors=[],networkErrors=[];
    page.on('pageerror',e=>pageErrors.push(String(e)));
    page.on('console',m=>{if(m.type()==='error')pageErrors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400)networkErrors.push(r.status()+' '+r.url());});
    page.on('requestfailed',r=>networkErrors.push(r.url()+' '+r.failure()?.errorText));
    const response=await page.goto(server.base+route,{waitUntil:'networkidle'});
    assert.equal(response.status(),200,route+' HTTP');
    assert.equal(await page.locator('h1').count(),1,route+' keeps one h1');
    assert.equal(await page.locator('#mainApp').count(),0,route+' must remain marketing-only');
    await loadImages(page);
    const brand=await page.evaluate(()=>({primary:getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim(),secondary:getComputedStyle(document.documentElement).getPropertyValue('--brand-secondary').trim(),font:getComputedStyle(document.body).fontFamily,loaded:document.fonts.check('500 20px Inter')}));
    assert.equal(brand.primary,'#123B3A');assert.equal(brand.secondary,'#2B736C');assert.ok(brand.font.startsWith('Inter'));assert.equal(brand.loaded,true);report.brand.push({engine:name,route,...brand});
    for(const width of widths){
      await page.setViewportSize({width,height:width<700?844:960});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await overflow(page,name+' '+route+' '+width);
      await loadImages(page);
      if([390,1440].includes(width)){
        await audit(page,name+' '+route+' '+width);
        if(visualRoutes.includes(route)){
          const file=`after-${slug(route)}-${width}-${name}.png`;
          await captureVisual(browser,server.base,route,width,file);
        }
      }
    }
    // The default motion layout must also fit every breakpoint. Word masks
    // must never turn the homepage's intentional second line into word rows.
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.reload({waitUntil:'networkidle'});
    for(const width of widths){
      await page.setViewportSize({width,height:width<700?844:960});
      await loadImages(page);
      await overflow(page,name+' default motion '+route+' '+width);
    }
    const links=await page.locator('a[href]').evaluateAll(links=>links.map(a=>a.getAttribute('href')));
    for(const href of new Set(links.filter(h=>h.startsWith('/')))){
      const url=new URL(href,server.base);
      assert.equal((await page.request.get(server.base+url.pathname)).status(),200,route+' internal link '+href);
      if(url.hash&&url.pathname===route)assert.ok(await page.locator('[id="'+decodeURIComponent(url.hash.slice(1))+'"]').count(),route+' anchor '+href);
    }
    assert.deepEqual(pageErrors,[],name+' '+route+' console/page errors');
    assert.deepEqual(networkErrors,[],name+' '+route+' network errors');
    await page.close();
   }

   // Product tabs, solution disclosures, compare states and real FAQ controls.
   const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
   await page.goto(server.base+'/',{waitUntil:'networkidle'});
   for(const key of ['documenten','btw','rapportages','facturen']){
    await page.locator('[data-kz-tab="'+key+'"]').press('Enter');
    assert.equal(await page.locator('[data-kz-tab="'+key+'"]').getAttribute('aria-pressed'),'true');
    await loadImages(page);await overflow(page,name+' product '+key);
   }
   for(const button of await page.locator('.kz-solution-more').all()){
    await button.press('Enter');assert.equal(await button.getAttribute('aria-expanded'),'true');
    assert.ok(await button.locator('..').locator('.kz-solution-extra').isVisible());
    await button.press('Enter');assert.equal(await button.getAttribute('aria-expanded'),'false');
   }
   for(const mode of ['with','without']){await page.locator('[data-compare="'+mode+'"]').press('Enter');await overflow(page,name+' compare '+mode);}

   // Complete mobile nav, expanded groups, focus wrapping and Escape.
   await page.locator('.mobile-toggle').click();
   await page.waitForFunction(()=>document.querySelector('main').inert);
   assert.equal(await page.locator('.mobile-toggle').getAttribute('aria-expanded'),'true');
   assert.equal(await page.locator('.mobile-toggle-icon i').nth(1).evaluate(el=>getComputedStyle(el).opacity),'0','Open-menu toggle presents a close icon');
   assert.equal(await page.locator('.mobile-toggle-icon i').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s','Reduced motion also disables component-specific transitions');
   assert.notEqual(await page.locator('.mobile-toggle-icon i').first().evaluate(el=>getComputedStyle(el).transform),'none');
   await overflow(page,name+' open menu');
   for(const summary of await page.locator('#mobileMenu summary').all())await summary.press('Enter');
   assert.ok(await page.locator('#mobileMenu a[href="/scanner/"]').isVisible());
   const last=page.locator('#mobileMenu a').last();
   await last.focus();await page.keyboard.press('Tab');
   assert.ok(await page.locator('.site-header a').first().evaluate(el=>el===document.activeElement),'Forward focus wraps inside navigation');
   await page.keyboard.press('Shift+Tab');
   assert.ok(await last.evaluate(el=>el===document.activeElement),'Backward focus wraps inside navigation');
   await audit(page,name+' open mobile navigation');
   await page.keyboard.press('Escape');
   await page.waitForFunction(()=>!document.querySelector('main').inert);
   assert.equal(await page.locator('.mobile-toggle').getAttribute('aria-expanded'),'false');
   assert.equal(await page.locator('.mobile-toggle-icon i').nth(1).evaluate(el=>getComputedStyle(el).opacity),'1','Closed-menu toggle restores the menu icon');
   assert.ok(await page.locator('.mobile-toggle').evaluate(el=>el===document.activeElement));
   await page.setViewportSize({width:1440,height:960});
   await page.locator('.dropdown>.nav-item').first().press('Enter');
   assert.equal(await page.locator('.dropdown>.nav-item').first().getAttribute('aria-expanded'),'true');
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('.dropdown>.nav-item').first().getAttribute('aria-expanded'),'false');
   await page.goto(server.base+'/faq/',{waitUntil:'networkidle'});
   for(const detail of await page.locator('.mk-faq-list details').all()){
    if(!await detail.evaluate(el=>el.hasAttribute('open')))await detail.locator('summary').press('Enter');
    assert.ok(await detail.locator('p').first().isVisible(),'Each FAQ answer remains readable');
   }

   // Form behavior, request contracts and feedback; no real support/deletion POST.
   for(const formCase of [
    {route:'/support/',id:'supportForm',submit:'supportSubmit',status:'supportStatus'},
    {route:'/contact/',id:'contactForm',submit:'contactSubmit',status:'contactStatus'},
    {route:'/account-verwijderen/',id:'deleteRequestForm',submit:'deleteSubmit',status:'deleteStatus'}
   ]){
    for(const success of [false,true]){
     await page.goto(server.base+formCase.route,{waitUntil:'networkidle'});
     let posted=null;
     await page.route('**/rest/v1/support_requests',r=>{posted=r.request().postDataJSON();return r.fulfill({status:success?201:500,body:success?'':'unavailable',contentType:'application/json'});});
     const form=page.locator('#'+formCase.id);
     assert.ok(await form.count(),'Original form remains: '+formCase.id);
     await form.locator('button[type="submit"]').click();
     assert.equal(await form.evaluate(element=>element.checkValidity()),false,'Required fields still block an empty request');
     assert.equal(posted,null,'Invalid form never emits a support/deletion POST');
     for(const field of await form.locator('input:not([type="hidden"]),textarea').all()){
      if(await field.getAttribute('name')==='website')continue;
      const type=await field.getAttribute('type'),name=await field.getAttribute('name'),pattern=await field.getAttribute('pattern');
      if(type==='checkbox'){await field.check();continue;}
      await field.fill(pattern==='VERWIJDER'?'VERWIJDER':type==='email'?'marketing-qa@example.invalid':name==='subject'?'Marketing QA': 'Test van de bestaande formulierfeedback, uitsluitend lokaal onderschept.');
     }
     for(const select of await form.locator('select').all())await select.selectOption({index:1});
     const trap=form.locator('input[name="website"]');
     await trap.evaluate(element=>element.value='automated-spam.invalid');
     await form.locator('button[type="submit"]').click();
     assert.equal(posted,null,'Existing honeypot blocks the request');
     await trap.evaluate(element=>element.value='');
     await form.locator('button[type="submit"]').click();
     await page.waitForFunction(()=>Array.from(document.querySelectorAll('.form-status')).some(el=>el.textContent.length>0));
     const status=await page.locator('.form-status').innerText();
     if(success){assert.ok(/Ontvangen|ontvangen|opgeslagen|verzoek/i.test(status));assert.ok(posted,'Original form POST contract');assert.equal(posted.email,'marketing-qa@example.invalid');}
     else{assert.ok(/niet gelukt|niet worden|lukt niet|Mail|mail/i.test(status));if(formCase.route==='/support/')assert.ok(await page.locator('.form-status a[href="mailto:support@boekuna.nl"]').count());}
     report.forms.push({engine:name,route:formCase.route,success,status});
     await page.unroute('**/rest/v1/support_requests');
    }
   }
   // Short intro runs once per session and yields to user input.
   await page.evaluate(()=>sessionStorage.removeItem('boekuna:marketing-intro-v2'));
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.goto(server.base+'/',{waitUntil:'domcontentloaded'});
   assert.equal(await page.locator('.editorial-intro').count(),1,'First-session introduction');
   await page.keyboard.press('Tab');
   assert.equal(await page.locator('.editorial-intro').count(),0,'Any keyboard input dismisses the curtain');
   await page.reload({waitUntil:'domcontentloaded'});
   assert.equal(await page.locator('.editorial-intro').count(),0,'No repeated introduction on navigation');
   // Runtime preference change, default entrance and no-JS readable content.
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.goto(server.base+'/',{waitUntil:'networkidle'});
   assert.ok(await page.locator('.editorial-word').count()>0,'Clip-mask word reveal initialized');
   await page.emulateMedia({reducedMotion:'reduce'});
   const animations=await page.locator('.editorial-word').evaluateAll(words=>words.map(word=>getComputedStyle(word).animationName));
   assert.ok(animations.every(name=>name==='none'),'Reduced motion change stops every word animation');
   const moves=await page.locator('.ed-parallax').evaluateAll(elements=>elements.map(el=>getComputedStyle(el).translate));
   assert.ok(moves.every(move=>move==='none'),'Reduced motion stops every remaining parallax plate');
   report.motion.push({engine:name,reducedMotion:true});
   await page.close();
   const noJS=await browser.newPage({javaScriptEnabled:false,viewport:{width:320,height:844}});
   await noJS.goto(server.base+'/',{waitUntil:'networkidle'});
   assert.ok(await noJS.locator('h1').isVisible());
   assert.ok(await noJS.locator('.kz-solution h3').first().isVisible());await overflow(noJS,name+' no JS');await noJS.close();
   for(const width of [320,430,768,1024,1920])await captureVisual(browser,server.base,'/',width,`after-home-${width}-${name}.png`);

   // Recreate the immutable before state in the same engine and breakpoints.
   for(const route of visualRoutes){
    for(const width of (route==='/'?[320,390,430,768,1024,1440,1920]:[390,1440])){
      const file=`before-${slug(route)}-${width}-${name}.png`;
      await captureVisual(browser,before.base,route,width,file);
    }
   }
  }finally{await browser.close();}
 }
 fs.writeFileSync(path.join(evidence,'qa.json'),JSON.stringify(report,null,2)+'\n');
 assert.equal(report.errors.length,0,'WCAG A/AA accessibility regressions; see qa.json');
 console.log(`Generated marketing browser QA: PASS (${report.engines.map(x=>x.name).join(' + ')}; ${report.routes} routes; ${report.checks} overflow checks; forms/menu/FAQ/images/reduced motion; ${report.screenshots.length} before/after screenshots)`);
}finally{
 fs.writeFileSync(path.join(evidence,'qa.json'),JSON.stringify(report,null,2)+'\n');
 await server.close();await before.close();fs.rmSync(beforeDir,{recursive:true,force:true});
}
