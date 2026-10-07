// Automatisch / Licht / Donker on the production build: system following (also at runtime),
// manual override, persistence (refresh, PWA relaunch, account sync), no white flash,
// Light Mode unchanged, and WCAG contrast of every main screen in Dark Mode.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import axeCore from 'axe-core';
import {chromium,webkit} from 'playwright';
import {buildApp,startAppServer,CONTRAST_AUDIT} from './lib/app-fixture.mjs';

buildApp();
const built=fs.readFileSync('dist/app/index.html','utf8');
const browserName=process.env.BOOKUNA_BROWSER==='webkit'?'webkit':'chromium';
const shotDir=process.env.THEME_SHOT_DIR||'tests/artifacts/theme';fs.mkdirSync(shotDir,{recursive:true});
const PAGES=['dashboard','invoices','expenses','documents','bank','vat','reports','contacts','services','settings'];
const MODALS=['newInvoice','newExpense','newContact','quickMenu'];

// Static contract: the boot snippet runs before any stylesheet, and no CSS invert is used.
{
  const head=built.slice(0,built.indexOf('</head>'));
  const boot=head.indexOf('id="boekuna-theme-boot"'),firstCss=head.indexOf('rel="stylesheet"');
  assert.ok(boot>0&&boot<firstCss,'theme boot must run before the first stylesheet');
  for(const f of ['theme-dark.css','theme-dark-generated.css','feedback.css']){
    const css=fs.readFileSync('dist/app/assets/'+f,'utf8');
    assert.equal(/filter\s*:\s*invert|mix-blend-mode\s*:\s*difference/i.test(css),false,f+' must not invert colours');
  }
  const generated=fs.readFileSync('dist/app/assets/theme-dark-generated.css','utf8');
  assert.equal(/(^|\})\s*(?!html\[data-theme="dark"\]|@media|@supports|\/\*)[^{}\s][^{}]*\{/.test(generated.replace(/@media[^{]*\{/g,'').replace(/@supports[^{]*\{/g,'')),false,'every generated rule is scoped to Dark Mode');
  console.log('PASS boot before CSS, scoped dark rules, no invert');
}

const {server,url}=await startAppServer();
// Variant without the Dark Mode stylesheets: Light Mode must be byte-for-byte the same look.
const {server:baseServer,url:baseUrl}=await (async()=>{
  const {server:s,url:u}=await startAppServer();
  return {server:s,url:u};
})();
const browser=await (browserName==='webkit'?webkit:chromium).launch();
const errors=[];
async function newPage(opts={}){
  const context=opts.context||await browser.newContext({viewport:opts.viewport||{width:1440,height:900},colorScheme:opts.colorScheme||'light',reducedMotion:'reduce'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  if(opts.init)await page.addInitScript(opts.init);
  return {context,page};
}
const themeOf=page=>page.evaluate(()=>({theme:document.documentElement.dataset.theme,pref:document.documentElement.dataset.themePref,meta:document.querySelector('meta[name="theme-color"]').content,bg:getComputedStyle(document.body).backgroundColor}));
async function ready(page){await page.locator('#mainApp').waitFor();await page.waitForFunction(()=>!!window.BoekunaTheme)}
async function chooseTheme(page,label){
  await page.evaluate(()=>openSettingsSection('app'));
  await page.locator('#settings-panel-app').waitFor({state:'visible'});
  await page.locator('#settings-panel-app').getByLabel(label).check();
}

try{
  // System Light / System Dark, default Automatisch.
  for(const scheme of ['light','dark']){
    const {context,page}=await newPage({colorScheme:scheme});
    await page.goto(url);await ready(page);
    const t=await themeOf(page);
    assert.deepEqual([t.pref,t.theme],['system',scheme],'Automatisch follows system '+scheme);
    assert.equal(t.meta,scheme==='dark'?'#15191C':'#FFFFFF','browser chrome colour follows the theme');
    await context.close();
  }
  console.log('PASS System Light / System Dark (default Automatisch)');

  // Runtime system switches while open.
  {
    const {context,page}=await newPage({colorScheme:'light'});
    await page.goto(url);await ready(page);
    await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
    console.log('PASS runtime system Light → Dark → Light');

    // Settings: the THEMA choice.
    await page.evaluate(()=>openSettingsSection('app'));
    const legend=await page.locator('#settings-panel-app legend').first().innerText();
    assert.equal(legend.trim(),'Thema');
    assert.deepEqual(await page.locator('#settings-panel-app .settings-theme-copy strong').allInnerTexts().then(x=>x.map(s=>s.replace(' ✓','').trim())),['Automatisch','Licht','Donker']);
    assert.match(await page.locator('#settings-panel-app').innerText(),/Volgt de instelling van je apparaat\./);
    assert.equal(await page.locator('#set-theme-system').isChecked(),true,'Automatisch is the default');
    await page.screenshot({path:shotDir+'/settings-thema-light-'+browserName+'.png'});

    // Manual Donker stays dark whatever the device does; Licht stays light.
    await chooseTheme(page,'Donker');
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    await page.emulateMedia({colorScheme:'light'});await page.waitForTimeout(100);
    assert.equal((await themeOf(page)).theme,'dark','manual Donker ignores the system');
    assert.equal(await page.evaluate(()=>state.meta.theme),'dark','choice saved with the account');
    assert.equal(await page.evaluate(()=>localStorage.getItem('boekuna-theme')),'dark','choice saved on the device for the next start');
    assert.equal(await page.locator('.settings-center-row[data-settings-open="app"] .settings-center-status').innerText(),'Donker');
    await page.screenshot({path:shotDir+'/settings-thema-dark-'+browserName+'.png'});
    await chooseTheme(page,'Licht');
    await page.emulateMedia({colorScheme:'dark'});await page.waitForTimeout(100);
    assert.equal((await themeOf(page)).theme,'light','manual Licht ignores the system');
    await chooseTheme(page,'Automatisch');
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
    console.log('PASS manual override Donker / Licht and back to Automatisch');

    // Refresh and PWA relaunch keep the choice.
    await chooseTheme(page,'Donker');
    await page.reload();await ready(page);
    assert.equal((await themeOf(page)).theme,'dark','refresh keeps Donker');
    const relaunch=await context.newPage();relaunch.on('pageerror',e=>errors.push(String(e)));
    await page.close();
    await relaunch.goto(url);await ready(relaunch);
    assert.equal((await themeOf(relaunch)).theme,'dark','relaunch keeps Donker');
    console.log('PASS refresh and PWA relaunch persistence');

    // No white flash: with every stylesheet held back, the theme is already decided.
    let release;const hold=new Promise(r=>{release=r});
    await relaunch.route('**/*.css*',async route=>{await hold;await route.continue().catch(()=>{})});
    const nav=relaunch.goto(url,{waitUntil:'commit'});
    await nav;
    await relaunch.waitForFunction(()=>document.documentElement&&document.documentElement.dataset.theme!==undefined,null,{timeout:5000});
    assert.equal(await relaunch.evaluate(()=>document.documentElement.dataset.theme),'dark','theme decided before any CSS arrives');
    assert.equal(await relaunch.evaluate(()=>document.documentElement.style.colorScheme),'dark');
    release();await ready(relaunch);
    console.log('PASS no flash: dark decided before first paint');
    await context.close();
  }

  // Another device: account preference wins once the administration is loaded.
  {
    const {server:s2,url:u2}=await startAppServer({extraBoot:"state.meta={...(state.meta||{}),theme:'dark'};"});
    const {context,page}=await newPage({colorScheme:'light'});
    await page.goto(u2);await ready(page);
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    assert.equal(await page.evaluate(()=>localStorage.getItem('boekuna-theme')),'dark','account choice is remembered on this device too');
    await context.close();s2.close();
    console.log('PASS account preference follows the user to a new device');
  }

  // Light Mode: computed colours identical to the build without Dark Mode stylesheets.
  {
    const strip=html=>html.replace(/<link rel="stylesheet" href="\/assets\/theme-dark(-generated)?\.css[^>]*>\n?/g,'');
    const {context,page}=await newPage({colorScheme:'light'});
    const {context:bctx,page:base}=await newPage({colorScheme:'light'});
    await base.route('**/app',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:strip(await r.text())})});
    await page.goto(url);await ready(page);await base.goto(baseUrl);await ready(base);
    assert.equal(await base.locator('link[href*="theme-dark"]').count(),0,'comparison build has no Dark Mode CSS');assert.equal(await page.locator('link[href*="theme-dark"]').count(),2);
    const snap=p=>p.evaluate(()=>[...document.querySelectorAll('#mainApp *')].filter(el=>el.getClientRects().length).slice(0,1500).map(el=>{const s=getComputedStyle(el);return el.tagName+'|'+s.color+'|'+s.backgroundColor+'|'+s.borderTopColor}).join('\n'));
    for(const p of PAGES){
      await page.evaluate(p=>navigate(p),p);await base.evaluate(p=>navigate(p),p);
      await page.waitForTimeout(150);await base.waitForTimeout(150);
      assert.equal(await snap(page),await snap(base),'Light Mode changed on '+p);
    }
    await context.close();await bctx.close();
    console.log('PASS Light Mode identical on all '+PAGES.length+' screens');
  }

  // Dark Mode: no light surfaces, WCAG AA text contrast, chart meaning, on desktop and phone.
  for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:700}]){
    const {context,page}=await newPage({viewport,colorScheme:'dark'});
    await page.goto(url);await ready(page);
    await page.addScriptTag({content:axeCore.source});
    const problems=[];
    for(const p of PAGES){
      await page.evaluate(p=>navigate(p),p);await page.waitForTimeout(200);
      if(viewport.width!==320&&['dashboard','invoices','settings','documents'].includes(p))await page.screenshot({path:shotDir+'/dark-'+viewport.width+'-'+p+'-'+browserName+'.png'});
      const r=await page.evaluate(CONTRAST_AUDIT+'({dark:true})');
      r.light.forEach(x=>problems.push(p+' light surface: '+x));r.lowContrast.forEach(x=>problems.push(p+' contrast: '+x));
      const axe=await page.evaluate(async()=>(await axe.run(document.body,{runOnly:['color-contrast']})).violations.flatMap(v=>v.nodes.map(n=>n.target.join(' '))));
      axe.forEach(x=>problems.push(p+' axe color-contrast: '+x));
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      if(overflow>1)problems.push(p+' horizontal overflow '+overflow);
    }
    for(const m of MODALS){
      await page.evaluate(m=>{closeModal();window[m]()},m);await page.waitForTimeout(200);
      const r=await page.evaluate(CONTRAST_AUDIT+'({dark:true,scope:"#modalRoot"})');
      r.light.forEach(x=>problems.push(m+' light surface: '+x));r.lowContrast.forEach(x=>problems.push(m+' contrast: '+x));
    }
    await page.evaluate(()=>closeModal());
    assert.deepEqual(problems,[],'Dark Mode issues at '+viewport.width+'px');
    if(viewport.width===1440){
      await page.evaluate(()=>navigate('reports'));await page.waitForTimeout(200);
      const bars=await page.evaluate(()=>['sales','costs','profit'].map(k=>{const el=document.querySelector('.bar.'+k+',.legend-dot.'+k);return el?getComputedStyle(el).backgroundColor:null}).filter(Boolean));
      for(const c of bars)assert.ok(['rgb(99, 212, 113)','rgb(229, 83, 75)','rgb(59, 130, 246)'].includes(c),'chart colours keep their meaning: '+c);
      const surface=await page.evaluate(()=>getComputedStyle(document.querySelector('#mainApp .card')).backgroundColor);
      assert.notEqual(surface,'rgb(0, 0, 0)','cards are charcoal, never pure black');
    }
    await context.close();
    console.log('PASS Dark Mode contrast and surfaces at '+viewport.width+'px');
  }

  // Login screen (auth) follows the theme too.
  {
    const {server:s3,url:u3}=await startAppServer({enter:false});
    const {context,page}=await newPage({colorScheme:'dark',viewport:{width:390,height:844}});
    await page.goto(u3);await page.waitForTimeout(500);
    const r=await page.evaluate(CONTRAST_AUDIT+'({dark:true})');
    assert.deepEqual([...r.light,...r.lowContrast],[],'login screen in Dark Mode');
    await page.screenshot({path:shotDir+'/dark-390-login-'+browserName+'.png'});
    await context.close();s3.close();
    console.log('PASS login screen in Dark Mode');
  }

  assert.deepEqual(errors,[]);
  console.log('Theme browser QA: PASS '+browserName);
}finally{await browser.close();server.close();baseServer.close()}
