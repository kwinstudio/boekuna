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
const widths=[320,360,375,390,393,430,620,640,768,820,1024,1280,1440,1920];
const evidence='tests/artifacts/white-editorial';
fs.mkdirSync(evidence,{recursive:true});
const server=await serveMarketing('dist/marketing');
const engines=process.env.MARKETING_BROWSER==='chromium'?[['chromium',chromium]]:process.env.MARKETING_BROWSER==='webkit'?[['webkit',webkit]]:[['chromium',chromium],['webkit',webkit]];
const report={routes:routes.length,widths,engines:[],screenshots:[],errors:[],accessibility:[],forms:[],motion:[],brand:[],focus:[],checks:0};
const beforeDir=fs.mkdtempSync(path.join(os.tmpdir(),'boekuna-marketing-before-'));
const baseline={baseHead:'3478aba296f94b49e00302c9a1441679c9634253'};
execFileSync('tar',['-x','-C',beforeDir],{input:execFileSync('git',['archive',baseline.baseHead,'public'],{maxBuffer:64*1024*1024})});
const before=await serveMarketing(path.join(beforeDir,'public'));
const visualRoutes=routes;

async function loadImages(page){
  await settleImages(page);
  const broken=await page.locator('img').evaluateAll(images=>images.filter(img=>!img.naturalWidth).map(img=>img.src));
  assert.deepEqual(broken,[],'All remaining functional/brand images must load');
}
async function assertHeaderBrand(page,label,width){
  const state=await page.evaluate(()=>{
    const primary=document.querySelector('.site-header .logo-lockup-primary');
    const compact=document.querySelector('.site-header .logo-lockup-compact');
    const logo=document.querySelector('.site-header .logo');
    const actions=document.querySelector('.site-header .nav-actions');
    const login=document.querySelector('.site-header .nav-actions a[href*="?login=1"]');
    const menu=document.querySelector('.site-header .mobile-toggle');
    const visible=el=>{if(!el)return false;const style=getComputedStyle(el),box=el.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity||1)!==0&&box.width>0&&box.height>0};
    const logoBox=logo?.getBoundingClientRect(),actionsBox=actions?.getBoundingClientRect();
    return {
      primaryVisible:visible(primary),
      compactVisible:visible(compact),
      compactSrc:compact?.getAttribute('src')||'',
      loginVisible:visible(login),
      menuVisible:visible(menu),
      visibleLogoCount:[primary,compact].filter(visible).length,
      gap:logoBox&&actionsBox?actionsBox.left-logoBox.right:null
    };
  });
  if(width<=620){
    assert.equal(state.compactVisible,true,label+': official compact BOEKUNA logo must be visible');
    assert.ok(state.compactSrc.endsWith('/assets/boekuna-logo-compact.svg'),label+': compact logo must use official asset');
    assert.equal(state.primaryVisible,false,label+': primary and compact logo must not render together');
    assert.equal(state.visibleLogoCount,1,label+': exactly one BOEKUNA lockup must be visible');
    assert.equal(state.loginVisible,true,label+': Inloggen must remain visible');
    assert.equal(state.menuVisible,true,label+': mobile menu control must remain visible');
    assert.ok(state.gap===null||state.gap>=8,label+': logo must keep clear space from header actions');
  }else{
    assert.equal(state.primaryVisible,true,label+': official primary BOEKUNA logo must remain visible');
    assert.equal(state.compactVisible,false,label+': compact logo must not duplicate desktop/tablet branding');
    assert.equal(state.visibleLogoCount,1,label+': exactly one BOEKUNA lockup must be visible');
  }
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
function cssRgb(value){
  const match=String(value||'').match(/rgba?\((\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)/);
  assert.ok(match,'Expected computed RGB color, got '+value);
  return match.slice(1,4).map(Number);
}
function contrastRatio(a,b){
  const luminance=rgb=>rgb.map(value=>{
    const channel=value/255;
    return channel<=.04045?channel/12.92:Math.pow((channel+.055)/1.055,2.4);
  }).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
  const [lighter,darker]=[luminance(a),luminance(b)].sort((x,y)=>y-x);
  return (lighter+.05)/(darker+.05);
}
async function assertKeyboardFocusCases(page,cases,label){
  const pending=new Map(cases.map(item=>[item.name,item]));
  await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo(0,0)});
  for(let step=0;step<260&&pending.size;step++){
    await page.keyboard.press('Tab');
    const matched=await page.evaluate(selectors=>{
      const active=document.activeElement;
      if(!(active instanceof HTMLElement))return null;
      for(const [name,selector] of selectors)if(active.matches(selector))return name;
      return null;
    },[...pending.values()].map(item=>[item.name,item.selector]));
    if(!matched)continue;
    const item=pending.get(matched);
    const state=await page.evaluate(()=>{
      const el=document.activeElement;
      const style=getComputedStyle(el);
      let parent=el.parentElement,background='rgba(0, 0, 0, 0)';
      while(parent){
        const value=getComputedStyle(parent).backgroundColor;
        if(value!=='transparent'&&value!=='rgba(0, 0, 0, 0)'){
          background=value;
          break;
        }
        parent=parent.parentElement;
      }
      return {
        focusVisible:el.matches(':focus-visible'),
        outlineColor:style.outlineColor,
        outlineStyle:style.outlineStyle,
        outlineWidth:style.outlineWidth,
        background
      };
    });
    assert.equal(state.focusVisible,true,label+' '+item.name+': keyboard focus must match :focus-visible');
    assert.notEqual(state.outlineStyle,'none',label+' '+item.name+': focus outline must be rendered');
    assert.ok(parseFloat(state.outlineWidth)>=3,label+' '+item.name+': focus outline must remain at least 3px');
    const ratio=contrastRatio(cssRgb(state.outlineColor),cssRgb(state.background));
    assert.ok(ratio>=3,label+' '+item.name+': focus contrast '+ratio.toFixed(2)+':1 must be >= 3:1');
    if(item.surface==='light'){
      assert.equal(state.outlineColor,'rgb(17, 17, 17)',label+' '+item.name+': light-surface focus must use near-black, not bare Amber');
      assert.notEqual(state.outlineColor,'rgb(255, 159, 28)',label+' '+item.name+': Amber cannot be the sole light-surface outline');
    }else{
      assert.equal(state.outlineColor,'rgb(255, 255, 255)',label+' '+item.name+': dark-surface focus must use white');
    }
    report.focus.push({label,name:item.name,surface:item.surface,...state,contrast:Number(ratio.toFixed(2))});
    pending.delete(matched);
  }
  assert.deepEqual([...pending.keys()],[],label+': all required keyboard-focus targets must be reachable by Tab');
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
    const brand=await page.evaluate(()=>{
      const root=getComputedStyle(document.documentElement);
      return {
        primary:root.getPropertyValue('--brand-primary').trim(),
        secondary:root.getPropertyValue('--brand-secondary').trim(),
        amber:root.getPropertyValue('--boekuna-amber').trim(),
        honey:root.getPropertyValue('--boekuna-honey').trim(),
        frozen:root.getPropertyValue('--boekuna-frozen').trim(),
        sea:root.getPropertyValue('--boekuna-sea').trim(),
        white:root.getPropertyValue('--boekuna-white').trim(),
        black:root.getPropertyValue('--boekuna-black').trim(),
        font:getComputedStyle(document.body).fontFamily,
        loaded:document.fonts.check('500 20px Inter')
      };
    });
    assert.equal(brand.primary,'#111111');
    assert.equal(brand.secondary,'#2EC4B6');
    assert.equal(brand.amber,'#FF9F1C');
    assert.equal(brand.honey,'#FFBF69');
    assert.equal(brand.frozen,'#CBF3F0');
    assert.equal(brand.sea,'#2EC4B6');
    assert.equal(brand.white,'#FFFFFF');
    assert.equal(brand.black,'#111111');
    assert.ok(brand.font.startsWith('Inter'));
    assert.equal(brand.loaded,true);
    report.brand.push({engine:name,route,...brand});
    for(const width of widths){
      await page.setViewportSize({width,height:width<700?844:960});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await overflow(page,name+' '+route+' '+width);
      await loadImages(page);
      await assertHeaderBrand(page,name+' '+route+' '+width,width);
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

   // Homepage parity structure and guided demo.
   const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
   await page.goto(server.base+'/',{waitUntil:'networkidle'});
   assert.equal(await page.locator('[data-home-section]').count(),15,name+' homepage exposes all parity sections');
   assert.equal(await page.locator('[data-depth-root],.kz-magnetic').count(),0,name+' homepage must not retain 3D or magnetic interaction hooks');
   assert.equal(await page.locator('[data-demo-step]').count(),4,name+' homepage exposes four guided demo controls');
   for(const key of ['recognize','check','save','upload']){
    const control=page.locator('[data-demo-step="'+key+'"]');
    await control.press('Enter');
    assert.equal(await control.getAttribute('aria-pressed'),'true',name+' guided demo exposes active state');
    assert.equal(await page.locator('#boekunaDemoStage').getAttribute('data-demo-state'),key,name+' guided demo stage follows keyboard selection');
    assert.equal(await page.locator('#demoTitle').isVisible(),true,name+' guided demo title stays visible');
    await overflow(page,name+' guided demo '+key);
   }

   // Complete mobile nav, expanded groups, focus wrapping and Escape.
   await page.locator('.mobile-toggle').click();
   await page.waitForFunction(()=>document.querySelector('main').inert);
   assert.equal(await page.locator('.mobile-toggle').getAttribute('aria-expanded'),'true');
   assert.equal(await page.locator('.mobile-toggle-icon i').nth(1).evaluate(el=>getComputedStyle(el).opacity),'0','Open-menu toggle presents a close icon');
   assert.equal(await page.locator('.mobile-toggle-icon i').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s','Reduced motion also disables component-specific transitions');
   assert.notEqual(await page.locator('.mobile-toggle-icon i').first().evaluate(el=>getComputedStyle(el).transform),'none');
   await assertHeaderBrand(page,name+' open menu 390',390);
   await overflow(page,name+' open menu 390');
   await page.screenshot({path:path.join(evidence,`after-home-menu-390-${name}.png`),fullPage:true});
   report.screenshots.push(`after-home-menu-390-${name}.png`);
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
   await page.setViewportSize({width:320,height:844});
   await page.locator('.mobile-toggle').click();
   await page.waitForFunction(()=>document.querySelector('main').inert);
   await assertHeaderBrand(page,name+' open menu 320',320);
   await overflow(page,name+' open menu 320');
   await page.screenshot({path:path.join(evidence,`after-home-menu-320-${name}.png`),fullPage:true});
   report.screenshots.push(`after-home-menu-320-${name}.png`);
   await page.keyboard.press('Escape');
   await page.waitForFunction(()=>!document.querySelector('main').inert);
   assert.equal(await page.locator('.mobile-toggle').getAttribute('aria-expanded'),'false');
   await page.setViewportSize({width:1440,height:960});
   const desktopTriggers=page.locator('.nav-links [data-nav-trigger]');
   assert.equal(await desktopTriggers.count(),3,'Desktop navigation exposes three grouped menu controls');
   assert.deepEqual((await desktopTriggers.allTextContents()).map(label=>label.replace('⌄','').trim()),['Product','Voor wie','Ondersteuning']);
   assert.equal((await page.locator('.nav-links > a[href="/prijzen/"]').textContent()).trim(),'Prijzen','Pricing remains a direct destination');
   const productTrigger=page.locator('[data-nav-trigger="product"]');
   const audienceTrigger=page.locator('[data-nav-trigger="audience"]');
   await productTrigger.click();
   assert.equal(await productTrigger.getAttribute('aria-expanded'),'true','Product menu reports open state');
   assert.ok(await page.locator('[data-nav-panel="product"]').isVisible(),'Product panel becomes visible');
   assert.ok(await page.locator('[data-nav-panel="product"] a[href="/scanner/"]').isVisible(),'Product panel exposes Documents destination');
   await audienceTrigger.click();
   assert.equal(await productTrigger.getAttribute('aria-expanded'),'false','Opening a second desktop menu closes the first');
   assert.equal(await audienceTrigger.getAttribute('aria-expanded'),'true','Audience menu reports open state');
   await page.keyboard.press('Escape');
   assert.equal(await audienceTrigger.getAttribute('aria-expanded'),'false','Escape closes desktop menu');
   assert.ok(await audienceTrigger.evaluate(el=>el===document.activeElement),'Escape restores focus to the desktop trigger');
   await productTrigger.click();
   await page.locator('main').click({position:{x:10,y:10}});
   assert.equal(await productTrigger.getAttribute('aria-expanded'),'false','Outside click closes desktop menu');
   await page.setViewportSize({width:1101,height:960});
   await productTrigger.click();
   const productPanelBox=await page.locator('[data-nav-panel="product"]').boundingBox();
   assert.ok(productPanelBox&&productPanelBox.x>=0,'Product mega menu must stay inside the 1101px viewport on the left');
   assert.ok(productPanelBox&&productPanelBox.x+productPanelBox.width<=1102,'Product mega menu must stay inside the 1101px viewport on the right');
   await page.keyboard.press('Escape');
   await page.setViewportSize({width:1440,height:960});
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
   // Explicit keyboard-focus contrast regression. Axe does not measure this custom outline contrast.
   for(const width of [320,390,768,1440]){
    const focusPage=await browser.newPage({viewport:{width,height:width<700?844:960},reducedMotion:'reduce'});
    await focusPage.goto(server.base+'/',{waitUntil:'networkidle'});
    const homeCases=[
      {name:'ordinary link',selector:'.parity-story .parity-text-link',surface:'light'},
      {name:'primary CTA',selector:'.parity-hero .parity-btn--primary',surface:'light'},
      {name:'secondary CTA',selector:'.parity-hero .parity-btn--secondary',surface:'light'},
      {name:'closing CTA',selector:'.parity-final-cta .parity-btn',surface:'dark'},
      {name:'footer link',selector:'.footer a:not(.footer-logo)',surface:'dark'}
    ];
    if(width<=1100)homeCases.push({name:'mobile menu trigger',selector:'.mobile-toggle',surface:'light'});
    await assertKeyboardFocusCases(focusPage,homeCases,name+' home focus '+width);
    await focusPage.goto(server.base+'/contact/',{waitUntil:'networkidle'});
    await assertKeyboardFocusCases(focusPage,[{name:'form input',selector:'#contactName',surface:'light'}],name+' contact focus '+width);
    await focusPage.goto(server.base+'/faq/',{waitUntil:'networkidle'});
    await assertKeyboardFocusCases(focusPage,[{name:'FAQ summary',selector:'.mk-faq-list summary',surface:'light'}],name+' FAQ focus '+width);
    await focusPage.close();
   }

   // Kwin-style interaction layer: expressive but 2D, non-blocking and reduced-motion safe.
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.goto(server.base+'/',{waitUntil:'networkidle'});
   assert.equal(await page.locator('[data-depth-root],.kz-magnetic').count(),0,name+' must not reintroduce 3D or magnetic hooks');
   assert.equal(await page.locator('[data-interaction-intro]').count(),1,name+' homepage exposes one intro wipe');
   assert.equal(await page.locator('[data-scroll-progress]').count(),1,name+' homepage exposes scroll progress');
   assert.equal(await page.locator('[data-parallax-root]').count(),1,name+' homepage exposes one hero parallax root');
   await page.waitForFunction(()=>document.querySelector('[data-interaction-intro]')?.classList.contains('is-done'));
   assert.equal(await page.locator('[data-interaction-intro]').evaluate(el=>getComputedStyle(el).pointerEvents),'none',name+' intro must not block the page after entry');
   assert.ok(await page.locator('[data-kinetic-title] .interaction-word').count()>=4,name+' kinetic title must split into staged words');
   await page.evaluate(()=>window.scrollTo(0,Math.max(500,document.documentElement.scrollHeight*.35)));
   await page.waitForFunction(()=>Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scroll-progress'))>.1);
   const scrollProgress=await page.locator('html').evaluate(el=>Number.parseFloat(getComputedStyle(el).getPropertyValue('--scroll-progress')));
   assert.ok(scrollProgress>.1&&scrollProgress<=1,name+' scroll progress must track the page');
   await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,0);});
   await page.waitForFunction(()=>window.scrollY<2);
   const heroBox=await page.locator('[data-parallax-root]').boundingBox();
   assert.ok(heroBox,name+' hero parallax root must be measurable');
   await page.mouse.move(heroBox.x+heroBox.width*.82,heroBox.y+heroBox.height*.28);
   await page.waitForFunction(()=>Math.abs(Number.parseFloat(getComputedStyle(document.querySelector('[data-parallax-root]')).getPropertyValue('--hero-x')))>0.1);
   const heroVector=await page.locator('[data-parallax-root]').evaluate(el=>({
     x:Number.parseFloat(getComputedStyle(el).getPropertyValue('--hero-x')),
     y:Number.parseFloat(getComputedStyle(el).getPropertyValue('--hero-y'))
   }));
   assert.ok(Math.abs(heroVector.x)>0.1||Math.abs(heroVector.y)>0.1,name+' pointer motion must update hero parallax variables');
   const thirdStory=page.locator('.parity-story').nth(2);
   await thirdStory.scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>document.querySelectorAll('.parity-story')[2]?.classList.contains('is-story-active'));
   assert.equal(await thirdStory.getAttribute('data-story-state'),'active',name+' visible product story must expose active scroll state');
   await page.locator('[data-demo-step="upload"]').focus();
   await page.keyboard.press('ArrowRight');
   assert.equal(await page.locator('[data-demo-step="recognize"]').getAttribute('aria-pressed'),'true',name+' ArrowRight advances the guided demo');
   assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');

   await page.emulateMedia({reducedMotion:'reduce'});
   await page.goto(server.base+'/',{waitUntil:'networkidle'});
   assert.equal(await page.locator('[data-interaction-intro]').getAttribute('hidden'),'','Reduced motion keeps the intro wipe hidden');
   const transitions=await page.locator('.mobile-toggle-icon i').evaluateAll(elements=>elements.map(el=>getComputedStyle(el).transitionDuration));
   assert.ok(transitions.every(value=>value==='0s'));
   const demoTransition=await page.locator('#boekunaDemoStage').evaluate(el=>getComputedStyle(el).transitionDuration);
   assert.equal(demoTransition,'0s','Reduced motion disables guided-demo transitions');
   const kineticTransition=await page.locator('[data-kinetic-title] .interaction-word').first().evaluate(el=>getComputedStyle(el).transitionDuration);
   assert.equal(kineticTransition,'0s','Reduced motion disables kinetic-title transitions');
   const reducedHero=await page.locator('[data-parallax-root]').evaluate(el=>({
     x:Number.parseFloat(getComputedStyle(el).getPropertyValue('--hero-x'))||0,
     y:Number.parseFloat(getComputedStyle(el).getPropertyValue('--hero-y'))||0
   }));
   assert.equal(reducedHero.x,0,'Reduced motion disables horizontal parallax');
   assert.equal(reducedHero.y,0,'Reduced motion disables vertical parallax');
   report.motion.push({engine:name,reducedMotion:true,introSafe:true,scrollProgress:true,parallax2D:true,storyActivation:true});
   await page.close();
   const noJS=await browser.newPage({javaScriptEnabled:false,viewport:{width:320,height:844}});
   await noJS.goto(server.base+'/',{waitUntil:'networkidle'});
   assert.ok(await noJS.locator('h1').isVisible());
   assert.ok(await noJS.locator('.parity-story h3').first().isVisible());await overflow(noJS,name+' no JS');await noJS.close();
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
