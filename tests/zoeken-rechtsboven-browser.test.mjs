// Zoeken rechtsboven (Kwin 2026-11-02): no search field in the middle of a screen; one magnifier top right opens a search
// bar in the header. On a list it filters that list, in Instellingen it filters the settings, elsewhere it searches everything.
// Closing the bar ends the search. Phone and computer; Chromium and WebKit (BOOKUNA_BROWSER=webkit).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';

execFileSync(process.execPath,['scripts/build-app.mjs']);
const generated=fs.readFileSync('dist/app/index.html','utf8');
const browserName=process.env.BOOKUNA_BROWSER||'chromium';
const boot=`currentUser={...TEST_USER,email:'qa@example.test'};state=structuredClone(DEFAULT);
for(const key of ['contacts','services','invoices','expenses','transactions','hours','mileage','documents','bookings','plannedCash','settlements','audit'])state[key]=[];
state.company={...state.company,name:'Fictieve QA BV',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',kvk:'12345678',vat:'NL123456789B01',email:'qa@example.test',iban:'NL91ABNA0417164300'};
state.contacts=[{id:'c1',type:'customer',name:'Fictieve Schilders'},{id:'c2',type:'customer',name:'Bakkerij Jansen'}];
state.invoices=[1,2].map(n=>({id:'i'+n,number:'2026-000'+n,status:'sent',kind:'invoice',customerId:'c'+n,issueDate:today(),dueDate:today(),lines:[{desc:'Werk',qty:1,unit:100*n,vat:21}],payments:[]}));
documentProcessingJobs=[];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;enterApp();`;
const html=generated.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;').replace(/initAuth\(\);(?![\s\S]*initAuth\(\);)/,boot);
const types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  const p=new URL(req.url,'http://localhost').pathname;
  if(p.startsWith('/assets/')){const f=path.resolve('dist/app'+p);if(fs.existsSync(f)){res.setHeader('Content-Type',types[path.extname(f)]||'image/png');return res.end(fs.readFileSync(f))}res.writeHead(404);return res.end()}
  res.setHeader('Content-Type','text/html');res.end(html);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
const browser=await (browserName==='webkit'?webkit:chromium).launch();
const errors=[];

try{
  for(const phone of [true,false]){
    const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1280,height:900},hasTouch:phone,isMobile:phone&&browserName==='chromium',locale:'nl-NL'});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(5000);
    await page.goto(url+'/?helder=1',{waitUntil:'domcontentloaded'});await page.locator('#mainApp').waitFor();
    const bar=page.locator('#headerSearch'),input=page.locator('#headerSearchInput'),button=page.locator('#globalSearchButton');
    const rows=()=>page.locator('#content .table tbody tr, #content .mobile-row, #content [data-bk-invoice]').allInnerTexts();

    // No search field inside any screen; the magnifier sits at the right of the top bar.
    for(const p of ['invoices','expenses','documents','contacts','services','trips','bank','settings','dashboard']){
      await page.evaluate(p=>navigate(p),p);
      assert.equal(await page.locator('#content input[type="search"], #content [data-list-search]').count(),0,'No search field in '+p);
      assert.ok(await button.isVisible(),'Magnifier on '+p);
    }
    const b=await button.boundingBox(),vw=phone?390:1280;
    assert.ok(b.x+b.width>vw-(phone?40:220),'Magnifier is top right');
    assert.ok(b.y<80,'Magnifier is in the top bar');
    assert.equal(await bar.isVisible(),false,'Bar closed until you tap');

    // A list: the bar filters that list.
    await page.evaluate(()=>navigate('invoices'));
    await button.click();
    assert.ok(await bar.isVisible());
    await page.waitForFunction(()=>document.activeElement?.id==='headerSearchInput');
    assert.equal(await input.getAttribute('placeholder'),phone?'Zoek factuur of klant':'Zoek op factuurnummer, klant of bedrag');
    await input.fill('bakker');
    await page.waitForFunction(()=>listPageState('invoices').query==='bakker');
    const hits=await page.evaluate(()=>getListRows('invoices').map(i=>i.id));
    assert.deepEqual(hits,['i2'],'Search filters the list');
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'headerSearchInput','Typing keeps focus while the list updates');
    // Leaving and coming back: the bar shows the search that is still on.
    await page.evaluate(()=>navigate('dashboard'));
    assert.equal(await bar.isVisible(),false,'Another page closes the bar');
    await page.evaluate(()=>navigate('invoices'));
    assert.ok(await bar.isVisible(),'The search that is on shows in the bar');
    assert.equal(await input.inputValue(),'bakker');
    // Annuleer ends the search.
    await page.locator('#headerSearchClose').click();
    assert.equal(await bar.isVisible(),false);
    assert.equal(await page.evaluate(()=>listPageState('invoices').query),'','Closing clears the search');

    // Instellingen: the bar filters the settings.
    await page.evaluate(()=>navigate('settings'));
    await button.click();
    assert.equal(await input.getAttribute('placeholder'),'Zoek een instelling');
    await input.fill('wachtwoord');
    await page.waitForFunction(()=>document.querySelector('#settingsCenter')?.classList.contains('is-searching'));
    assert.ok(await page.locator('.settings-center-nav [data-settings-open="security"]').isVisible());
    assert.equal(await page.locator('.settings-center-nav [data-settings-open="invoices"]').isVisible(),false);
    await input.press('Escape');
    assert.equal(await bar.isVisible(),false,'Escape closes');
    assert.ok(await page.locator('.settings-center-nav [data-settings-open="invoices"]').isVisible(),'Closing shows all settings again');

    // Overzicht: everything, results right under the bar; a tap opens the item and closes the bar.
    await page.evaluate(()=>navigate('dashboard'));
    await button.click();
    await input.fill('bakker');
    const result=page.locator('#headerSearchPanel .global-search-item').first();
    await result.waitFor();
    assert.match(await result.innerText(),/Bakkerij Jansen/);
    const panel=await page.locator('#headerSearchPanel').boundingBox(),top=await page.locator('#appMain .topbar').boundingBox();
    assert.ok(Math.abs(panel.y-(top.y+top.height))<=10,'Results start under the top bar');
    await result.click();
    await page.locator('#modalRoot .modal').first().waitFor();
    assert.equal(await bar.isVisible(),false,'Opening a result closes the bar');
    await page.evaluate(()=>closeModal());
    // The keyboard shortcut and older calls open the same bar.
    await page.evaluate(()=>openGlobalSearch());
    assert.ok(await bar.isVisible());
    await page.locator('#headerSearchClose').click();
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('zoeken-rechtsboven ok ('+browserName+')');
}finally{await browser.close();server.close()}
