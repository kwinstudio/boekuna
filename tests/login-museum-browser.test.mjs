// Kwin 2026-10-23 (inlogscherm in museumstijl, keuze C1 zonder bon, alleen telefoon): the login opens on a white
// screen with "Boe / ku / na." in a serif over a marble statue, the promise and one Inloggen button. Inloggen opens
// the existing form as a sheet. The computer keeps the form as it was.
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { buildApp, startAppServer } from './lib/app-fixture.mjs';

buildApp();
const {server,url}=await startAppServer({enter:false});
const browserName=(process.env.BOOKUNA_BROWSER||'chromium')==='webkit'?'webkit':'chromium';
const browser=await (browserName==='webkit'?webkit:chromium).launch({headless:true});
const pageErrors=[];
async function open(viewport,colorScheme='light'){
  const page=await browser.newPage({viewport,colorScheme});
  page.on('pageerror',e=>pageErrors.push(String(e)));
  await page.goto(url);
  await page.locator('#authForm').waitFor({state:'attached'});
  return page;
}
const sheetOpen=page=>page.evaluate(()=>document.querySelector('#authRoot .auth-form').classList.contains('is-sheet-open'));

try{
  for(const width of [320,375,390,430]){
    const page=await open({width,height:width===375?667:844});
    const cta=page.locator('.auth-museum-cta');
    assert.ok(await cta.isVisible(),`${width}: Inloggen button on the opening screen`);
    assert.equal(await page.locator('#loginEmail').isVisible(),false,`${width}: the form waits behind Inloggen`);
    assert.equal(await page.getByRole('img',{name:'Boekuna'}).count(),1,`${width}: the wordmark has one accessible name`);
    const geometry=await page.evaluate(()=>{
      const box=s=>document.querySelector(s).getBoundingClientRect();
      const word=box('.auth-museum-word'),img=document.querySelector('.auth-museum-beeld'),foot=box('.auth-museum-foot');
      return {overflow:document.documentElement.scrollWidth>innerWidth+1,wordRight:word.right,wordBottom:word.bottom,footTop:foot.top,footBottom:foot.bottom,
        imgLoaded:img.complete&&img.naturalWidth>0,font:getComputedStyle(document.querySelector('.auth-museum-word')).fontFamily,inner:innerHeight,innerW:innerWidth};
    });
    assert.equal(geometry.overflow,false,`${width}: no sideways scroll`);
    assert.ok(geometry.imgLoaded,`${width}: the statue loads`);
    assert.match(geometry.font,/Boekuna Serif/,`${width}: the wordmark uses the serif`);
    assert.ok(geometry.wordRight<=geometry.innerW,`${width}: the wordmark fits the width`);
    assert.ok(geometry.wordBottom<geometry.footTop,`${width}: the wordmark stays above the promise and the button`);
    assert.ok(geometry.footBottom<=geometry.inner,`${width}: the button fits on the screen`);

    await cta.click();
    await page.locator('#loginEmail').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'loginEmail',`${width}: tapping Inloggen puts the cursor in the e-mail field`);
    if(width===390){
      await page.keyboard.press('Escape');
      await page.waitForFunction(()=>!document.querySelector('#authRoot .auth-form').classList.contains('is-sheet-open'));
      await cta.click();
      await page.locator('#loginEmail').waitFor({state:'visible'});
      await page.mouse.click(195,60);
      await page.waitForFunction(()=>!document.querySelector('#authRoot .auth-form').classList.contains('is-sheet-open'));
      // An error from the server opens the sheet, so it is never hidden behind the opening screen.
      await page.evaluate(()=>authError('Onjuist e-mailadres of wachtwoord.'));
      assert.ok(await sheetOpen(page),'an error opens the sheet');
      assert.ok(await page.locator('#authError').isVisible(),'the error is visible');
      // Coming back with an e-mail address already filled in opens the form straight away.
      await page.evaluate(()=>showAuth('login','qa@example.test'));
      assert.ok(await sheetOpen(page),'a prefilled e-mail opens the sheet');
      await page.evaluate(()=>showAuth('login'));
      await page.locator('.auth-museum-link').click();
      await page.locator('#registerEmail').waitFor({state:'visible'});
      assert.equal(await page.locator('.auth-museum').count(),0,'registering keeps its own screen');
    }
    await page.close();
  }

  // Dark mode: dark ground, light letters.
  {
    const page=await open({width:390,height:844},'dark');
    await page.evaluate(()=>{document.documentElement.dataset.theme='dark'});
    const colors=await page.evaluate(()=>({bg:getComputedStyle(document.querySelector('.auth-museum')).backgroundColor,ink:getComputedStyle(document.querySelector('.auth-museum-word')).color}));
    assert.equal(colors.bg,'rgb(15, 19, 17)');
    assert.equal(colors.ink,'rgb(241, 243, 242)');
    await page.close();
  }

  // The computer keeps the form as it was.
  {
    const page=await open({width:1440,height:900});
    assert.equal(await page.locator('.auth-museum').isVisible(),false,'no opening screen on the computer');
    assert.ok(await page.locator('#loginEmail').isVisible(),'the form shows straight away on the computer');
    assert.equal(await page.locator('.auth-sheet-grab').isVisible(),false);
    await page.close();
  }

  assert.deepEqual(pageErrors,[],'no page errors');
  console.log(`PASS login museum screen ${browserName}`);
}finally{
  await browser.close();server.close();
}
