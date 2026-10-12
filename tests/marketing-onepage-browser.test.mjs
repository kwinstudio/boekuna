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
// BOOKUNA_BROWSERS=chromium runs one engine locally; CI runs both.
const engines=[['chromium',chromium],['webkit',webkit]].filter(([n])=>!process.env.BOOKUNA_BROWSERS||process.env.BOOKUNA_BROWSERS.split(',').includes(n));
const widths=[320,375,390,430,768,1024,1280,1440];
const preserved=['/privacy/','/voorwaarden/','/support/','/account-verwijderen/','/functies/','/facturen/','/bonnen/','/slim-scannen/','/btw/','/bank/','/rapportages/','/hoe-het-werkt/','/zzp/','/prijzen/','/veiligheid/','/faq/','/over-ons/','/kennisbank/','/kennisbank/administratie-bijhouden-zzp/','/kennisbank/factuur-eisen/','/kennisbank/btw-aangifte-per-kwartaal/','/kennisbank/kleineondernemersregeling/','/kennisbank/bewaarplicht/','/kennisbank/zakelijke-kosten-en-btw/'];
const moved={'/assistent/':'/functies/','/scanner/':'/slim-scannen/','/mobiel/':'/functies/','/contact/':'/support/'};

async function noOverflow(page,label){
  const s=await page.evaluate(()=>({vw:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  if(s.html>s.vw+1||s.body>s.vw+1){
    const offenders=await page.evaluate(()=>[...document.querySelectorAll('body *')]
      .map(e=>({tag:e.tagName,cls:e.className?.toString?.().slice(0,85),text:(e.textContent||'').trim().slice(0,55),right:Math.round(e.getBoundingClientRect().right),width:Math.round(e.getBoundingClientRect().width)}))
      .filter(x=>x.right>innerWidth+1).sort((a,b)=>b.right-a.right).slice(0,18));
    console.error('LANDING_OVERFLOW_DIAGNOSTIC '+JSON.stringify(offenders));
  }
  assert.ok(s.html<=s.vw+1&&s.body<=s.vw+1,label+' horizontal overflow '+JSON.stringify(s));
}
async function axe(page,label){
  await page.addScriptTag({content:axeSource});
  const result=await page.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
  assert.deepEqual(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),[],label+' Axe');
}

try{
  for(const [name,engine] of engines){
    const browser=await engine.launch({headless:true});
    try{
      for(const width of widths){
        const page=await browser.newPage({viewport:{width,height:width<600?844:900},reducedMotion:'reduce'});
        const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
        const response=await page.goto(server.base+'/',{waitUntil:'networkidle'});
        assert.equal(response.status(),200,name+' root '+width);
        assert.equal(await page.locator('h1').textContent(),'Boekhouden zonder boekhoudtaal.');
        assert.equal(await page.getByRole('link',{name:/^Begin gratis/}).first().getAttribute('href'),'https://app.boekuna.nl/?register=1','Primary CTA opens the real sign-up');
        if(width<980)await page.locator('.mobile-nav summary').click();
        assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'),'index,follow');
        assert.ok(await page.getByRole('navigation',{name:'Hoofdnavigatie'}).getByRole('link',{name:'Inloggen'}).isVisible());
        assert.equal(await page.locator('img:not([src^="/assets/site/"])').count(),0,'Only first-party Boekuna images');
        assert.equal(await page.locator('img:not([alt])').count(),0,'Every image has alt text');
        assert.equal(await page.locator('script:not([src="/assets/site/site.js"]):not([type="application/ld+json"])').count(),0,'Only the first-party site script');
        await noOverflow(page,name+' root '+width);
        await axe(page,name+' root '+width);
        const login=await page.getByRole('navigation',{name:'Hoofdnavigatie'}).getByRole('link',{name:'Inloggen'}).getAttribute('href');
        assert.equal(login,'https://app.boekuna.nl/?login=1');
        assert.deepEqual(errors,[]);
        if(width===390||width===1440){if(width<980)await page.locator('.mobile-nav summary').click();await page.screenshot({path:path.join(evidence,'landing-'+width+'-'+name+'.png'),fullPage:true});}
        await page.close();
      }

      for(const route of preserved){
        const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
        const errors=[];page.on('pageerror',e=>errors.push(String(e)));
        const response=await page.goto(server.base+route,{waitUntil:'networkidle'});
        assert.equal(response.status(),200,name+' '+route);
        assert.equal(await page.locator('h1').count(),1,route+' h1');
        assert.ok(await page.locator('header .brand').isVisible(),route+' baseline brand');
        assert.ok(await page.locator('a[href="https://app.boekuna.nl/?login=1"]:visible').first().isVisible(),route+' app login link');
        await noOverflow(page,name+' '+route);
        await axe(page,name+' '+route);
        assert.deepEqual(errors,[],name+' '+route+' console/page errors');
        await page.close();
      }

      for(const [route,to] of Object.entries(moved)){
        const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
        const response=await page.request.get(server.base+route);
        assert.equal(response.status(),200,name+' '+route);
        const html=await response.text();
        assert.ok(html.includes('<meta name="robots" content="noindex,follow">'),route+' moved page must be noindex');
        await page.goto(server.base+route);
        await page.waitForURL(server.base+to);
        assert.equal(await page.locator('h1').count(),1,route+' forwards to a real page');
        await page.close();
      }
    } finally { await browser.close(); }
  }
  console.log('BOEKUNA landing browser QA: PASS ('+engines.map(([n])=>n).join(' + ')+', 8 widths, all pages, moved routes, Axe)');
} finally { await server.close(); }