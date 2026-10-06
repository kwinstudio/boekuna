import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium,webkit} from 'playwright';
import {serveMarketing} from './helpers/marketing-site.mjs';

const require=createRequire(import.meta.url);
const axeSource=fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const root=process.cwd();
const dist=path.join(root,'dist','marketing');
const evidence=path.join(root,'tests','artifacts','multipage');
fs.mkdirSync(evidence,{recursive:true});
const server=await serveMarketing(dist);

const routes=['/','/functies/','/assistent/','/scanner/','/prijzen/','/veiligheid/','/faq/','/facturen/','/bonnen/','/btw/','/bank/','/rapportages/','/mobiel/','/hoe-het-werkt/'];
const engines=[['chromium',chromium],['webkit',webkit]];
const axeErrors=[];

function hexChannel(value){
  const c=value/255;
  return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);
}
function contrastRatio(foreground,background){
  const parse=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const luminance=hex=>{const [r,g,b]=parse(hex).map(hexChannel);return 0.2126*r+0.7152*g+0.0722*b;};
  const [a,b]=[luminance(foreground),luminance(background)].sort((x,y)=>y-x);
  return (a+0.05)/(b+0.05);
}

async function noOverflow(page,label){
  const s=await page.evaluate(()=>({vw:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert.ok(s.html<=s.vw+1&&s.body<=s.vw+1,label+' horizontal overflow '+JSON.stringify(s));
}

async function axe(page,label){
  await page.addScriptTag({content:axeSource});
  const result=await page.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
  if(result.violations.length)axeErrors.push({label,violations:result.violations.map(v=>({id:v.id,nodes:v.nodes.length}))});
}

try{
  for(const [name,type] of engines){
    const browser=await type.launch({headless:true});
    try{
      for(const route of routes){
        for(const width of [390,1440]){
          const page=await browser.newPage({viewport:{width,height:width<700?844:1000},reducedMotion:'reduce'});
          const runtime=[],failed=[];
          page.on('pageerror',e=>runtime.push(String(e)));
          page.on('console',m=>{if(m.type()==='error')runtime.push(m.text())});
          page.on('requestfailed',req=>failed.push(req.url()+' '+(req.failure()?.errorText||'')));
          const response=await page.goto(server.base+route,{waitUntil:'networkidle'});
          assert.equal(response.status(),200,name+' '+route+' '+width+' HTTP');
          assert.ok(await page.locator('h1').isVisible(),name+' '+route+' h1');
          assert.ok(await page.locator('a.logo').first().isVisible(),name+' '+route+' logo');
          assert.ok(await page.locator('a[href^="https://app.boekuna.nl/?"]').count()>=1,name+' '+route+' app CTA');
          await page.evaluate(async()=>document.fonts.ready);
          await noOverflow(page,name+' '+route+' '+width);
          if(route==='/'&&width===1440){
            assert.ok(await page.locator('.hdr .nav').isVisible(),name+' desktop primary navigation visible');
            assert.ok(await page.locator('.hdr-cta .login').isVisible(),name+' desktop login CTA visible');
            assert.ok(await page.locator('.hdr-cta a[href="https://app.boekuna.nl/?register=1"]').isVisible(),name+' desktop free CTA visible');
            assert.equal(await page.locator('#burger').isVisible(),false,name+' desktop burger hidden');
            const desktopMenuButton=page.locator('#ddBtn');
            await desktopMenuButton.focus();
            await page.keyboard.press('Enter');
            assert.equal(await desktopMenuButton.getAttribute('aria-expanded'),'true',name+' desktop menu opens by keyboard');
            await page.keyboard.press('Escape');
            assert.equal(await desktopMenuButton.getAttribute('aria-expanded'),'false',name+' desktop menu closes by Escape');
            assert.ok(await desktopMenuButton.evaluate(el=>el===document.activeElement),name+' desktop menu focus returns to trigger');
          }
          if(route==='/'){
            assert.ok(await page.locator('.editorial-pricing').isVisible(),name+' '+width+' homepage pricing visible');
            assert.equal(await page.locator('.editorial-plan').count(),3,name+' '+width+' homepage has three plans');
            const pricingText=await page.locator('.editorial-pricing').innerText();
            for(const price of ['€0','€9,95','€19,95'])assert.ok(pricingText.includes(price),name+' '+width+' pricing includes '+price);
            const muted=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--muted').trim().toUpperCase());
            assert.ok(/^#[0-9A-F]{6}$/.test(muted),name+' semantic muted token is a hex color');
            assert.ok(contrastRatio(muted,'#FFFFFF')>=4.5,name+' muted text meets WCAG AA on white: '+contrastRatio(muted,'#FFFFFF'));
            assert.ok(contrastRatio(muted,'#F6F7F8')>=4.5,name+' muted text meets WCAG AA on light gray: '+contrastRatio(muted,'#F6F7F8'));
          }
          assert.deepEqual(runtime,[],name+' '+route+' runtime errors');
          assert.deepEqual(failed,[],name+' '+route+' failed requests');
          if(width===390)await axe(page,name+' '+route);
          if((route==='/'||route==='/assistent/'||route==='/prijzen/')&&(width===390||width===1440)){
            await page.screenshot({path:path.join(evidence,(route==='/'?'home':route.replaceAll('/',''))+'-'+width+'-'+name+'.png'),fullPage:true});
          }
          if(width===390){
            const burger=page.locator('#burger');
            assert.ok(await burger.isVisible(),name+' '+route+' mobile menu trigger');
            await burger.click();
            assert.equal(await burger.getAttribute('aria-expanded'),'true',name+' '+route+' menu opens');
            assert.ok(await page.locator('#mnav').evaluate(el=>el.classList.contains('open')),name+' '+route+' mobile menu visible');
            const mobileFree=page.locator('#mnav a[href="https://app.boekuna.nl/?register=1"]');
            assert.equal(await mobileFree.count(),1,name+' '+route+' mobile menu has one free CTA');
            assert.ok(await mobileFree.isVisible(),name+' '+route+' mobile free CTA visible');
            assert.ok(await page.locator('#mnav').evaluate(el=>el.contains(document.activeElement)),name+' '+route+' focus enters mobile navigation');
            await page.keyboard.press('Escape');
            assert.equal(await burger.getAttribute('aria-expanded'),'false',name+' '+route+' menu closes');
            assert.ok(await burger.evaluate(el=>el===document.activeElement),name+' '+route+' focus returns to mobile trigger');
          }
          await page.close();
        }
      }

      const home=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
      await home.goto(server.base+'/',{waitUntil:'networkidle'});
      await home.getByRole('link',{name:/Bekijk hoe het werkt/}).click();
      assert.equal(new URL(home.url()).pathname,'/hoe-het-werkt/');
      await home.goto(server.base+'/scanner/',{waitUntil:'networkidle'});
      await home.locator('#flowline button').nth(1).click();
      assert.equal(await home.locator('#flowline button').nth(1).getAttribute('aria-pressed'),'true',name+' scanner step reacts');
      await home.close();

      const assistant=await browser.newPage({viewport:{width:390,height:844}});
      await assistant.goto(server.base+'/assistent/',{waitUntil:'networkidle'});
      assert.ok((await assistant.locator('main').innerText()).includes('Binnenkort'),name+' assistant upcoming label');
      await assistant.close();

      for(const route of ['/privacy/','/voorwaarden/','/support/','/account-verwijderen/']){
        const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
        const response=await page.goto(server.base+route,{waitUntil:'networkidle'});
        assert.equal(response.status(),200,name+' retained '+route);
        assert.ok(await page.locator('h1').isVisible(),name+' retained '+route+' h1');
        await noOverflow(page,name+' retained '+route);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
  assert.deepEqual(axeErrors,[],'Axe accessibility regressions: '+JSON.stringify(axeErrors));
  console.log('BOEKUNA multipage browser QA: PASS (Chromium + WebKit, mobile + desktop, interactions, Axe)');
} finally {
  await server.close();
}
