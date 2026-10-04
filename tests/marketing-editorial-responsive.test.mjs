import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {serveMarketing} from './helpers/marketing-site.mjs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root=process.cwd();
const artifacts=path.join(root,'tests','artifacts');
fs.mkdirSync(artifacts,{recursive:true});

const css=fs.readFileSync(path.join(root,'public','assets','site.css'),'utf8');
const js=fs.readFileSync(path.join(root,'public','assets','site.js'),'utf8');
const home=fs.readFileSync(path.join(root,'public','index.html'),'utf8');

for(const contract of [
  "font-family:'Space Grotesk'",
  "font-family:'Inter'",
  '--green:#63D471',
  '--bg:#FFFFFF',
  '@media (prefers-reduced-motion: reduce)'
]){
  assert.ok(css.includes(contract),'Current multipage marketing CSS contract missing: '+contract);
}
for(const retired of ['marketing-editorial.css','parity-hero','data-depth-root','kz-magnetic']){
  assert.equal(home.includes(retired)||css.includes(retired)||js.includes(retired),false,
    'Retired one-page/editorial contract returned: '+retired);
}
for(const id of ['scanDemo','functies','invLines','doclist','omzet','txlist','chart']){
  assert.ok(home.includes('id="'+id+'"'),'Interactive homepage proof missing: '+id);
}

const build=spawnSync(process.execPath,['scripts/build-marketing.mjs'],{cwd:root,encoding:'utf8'});
assert.equal(build.status,0,build.stderr||build.stdout);
const dist=path.join(root,'dist','marketing');
const server=await serveMarketing(dist);
const browser=await chromium.launch({headless:true});
const viewports=[320,360,375,390,393,430,620,768,1024,1280,1440,1920];

async function noOverflow(page,label){
  const value=await page.evaluate(()=>({vw:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert.ok(value.html<=value.vw+1&&value.body<=value.vw+1,label+' horizontal overflow '+JSON.stringify(value));
}

try{
  for(const width of viewports){
    const page=await browser.newPage({viewport:{width,height:width<620?844:900},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(server.base+'/',{waitUntil:'domcontentloaded'});
    await page.locator('.hdr-in > .logo').waitFor({state:'visible'});
    await noOverflow(page,'home '+width);

    assert.equal(await page.locator('#scanDemo').count(),1,'Scanner demo missing at '+width);
    assert.equal(await page.locator('#functies').count(),1,'Feature demo missing at '+width);
    assert.deepEqual(errors,[],'Homepage page errors at '+width+': '+errors.join(' | '));

    const mobile=width<=960;
    assert.equal(await page.locator('#burger').isVisible(),mobile,'Burger visibility mismatch at '+width);
    assert.equal(await page.locator('.hdr .nav').isVisible(),!mobile,'Desktop nav visibility mismatch at '+width);

    if([390,1440,1920].includes(width)){
      await page.screenshot({path:path.join(artifacts,'multipage-home-'+width+'.png'),fullPage:true});
    }
    await page.close();
  }

  for(const width of [390,430]){
    const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce'});
    await page.goto(server.base+'/',{waitUntil:'domcontentloaded'});
    await page.locator('#burger').click();
    assert.equal(await page.locator('#burger').getAttribute('aria-expanded'),'true');
    assert.ok(await page.locator('#mnav').evaluate(el=>el.classList.contains('open')),'Mobile menu must open at '+width);
    assert.equal(await page.locator('#mnav a[href="/assistent/"]').count(),1);
    assert.equal(await page.locator('#mnav a[href="/scanner/"]').count(),1);
    await noOverflow(page,'mobile menu '+width);
    await page.screenshot({path:path.join(artifacts,'multipage-menu-'+width+'.png'),fullPage:true});
    await page.close();
  }

  const interactive=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await interactive.goto(server.base+'/',{waitUntil:'domcontentloaded'});
  await interactive.locator('#scanBtn').click();
  await interactive.locator('#scanBadge').filter({hasText:/Herkend|controleren|op te slaan/}).waitFor();
  assert.ok(await interactive.locator('#fields .filled, #fields .flag').count()>0,'Scanner demo must populate fields');
  await interactive.locator('#t-btw').click();
  assert.equal(await interactive.locator('#p-btw').isVisible(),true,'Feature tabs must switch on mobile');
  await interactive.close();

  for(const [route,heading] of [
    ['/functies/','Alle functies op een rij.'],
    ['/assistent/','Een assistent die jouw administratie kent.'],
    ['/scanner/','Upload je bon. Boekuna zoekt de belangrijke gegevens voor je uit.'],
    ['/prijzen/','Eerlijke prijzen. Begin gratis.'],
    ['/veiligheid/','Je administratie verdient serieuze beveiliging.'],
    ['/faq/','Waar kunnen we mee helpen?']
  ]){
    for(const width of [390,1440]){
      const page=await browser.newPage({viewport:{width,height:width<700?844:960},reducedMotion:'reduce'});
      const errors=[];page.on('pageerror',e=>errors.push(String(e)));
      await page.goto(server.base+route,{waitUntil:'domcontentloaded'});
      await page.locator('h1').waitFor();
      assert.ok((await page.locator('h1').innerText()).includes(heading),route+' heading mismatch');
      await noOverflow(page,route+' '+width);
      assert.deepEqual(errors,[],route+' page errors at '+width+': '+errors.join(' | '));
      await page.close();
    }
  }

  console.log('Marketing multipage responsive QA: PASS (12 home viewports + mobile menu + interactive scanner/tabs + current public routes)');
}finally{
  await browser.close();
  await server.close();
}
