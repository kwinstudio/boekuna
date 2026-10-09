// Instellingen: category index, detail panels, persistence and layout at every phone width.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';

execFileSync(process.execPath,['scripts/build-app.mjs']);
const generated=fs.readFileSync('dist/app/index.html','utf8');
const axeSource=fs.readFileSync('tests/node_modules/axe-core/axe.min.js','utf8');
const shotDir=process.env.SETTINGS_SHOT_DIR||'tests/artifacts/settings-center';
fs.mkdirSync(shotDir,{recursive:true});
const boot=`currentUser={...TEST_USER,email:'qa@example.test'};state=structuredClone(DEFAULT);
state.company={...state.company,name:'Fictieve QA BV',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',kvk:'12345678',vat:'NL123456789B01',email:'',iban:''};
state.contacts=[{id:'c1',type:'customer',name:'Fictieve klant',email:'klant@example.test',address:'Klantstraat 2',postal:'3011AB',city:'Rotterdam'}];
state.invoices=[{id:'i1',number:'2026-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:'2026-08-01',dueDate:'2026-08-15',lines:[{desc:'Fictieve dienst',qty:1,unit:100,unitLabel:'uur',vat:21}],payments:[]}];
state.transactions=[{id:'t1',date:'2026-09-01',description:'Fictieve transactie',amount:-10,status:'unmatched'}];
documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;enterApp();`;
const html=generated.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;').replace(/initAuth\(\);(?![\s\S]*initAuth\(\);)/,boot);
const server=http.createServer((req,res)=>{
  const p=new URL(req.url,'http://localhost').pathname;
  if(p.startsWith('/assets/')){const f=path.resolve('dist/app'+p);if(fs.existsSync(f)){res.setHeader('Content-Type',p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':p.endsWith('.svg')?'image/svg+xml':'image/png');return res.end(fs.readFileSync(f))}res.writeHead(404);return res.end()}
  res.setHeader('Content-Type','text/html');res.end(html);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
const browserName=process.env.BOOKUNA_BROWSER||'chromium';
const browser=await (browserName==='webkit'?webkit:chromium).launch();
const errors=[];

async function openApp(width,height=900){
  const context=await browser.newContext({viewport:{width,height}});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  page.setDefaultTimeout(4000);
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#mainApp').waitFor();
  await page.waitForFunction(()=>typeof window.openSettingsSection==='function');
  return {context,page};
}
async function toSettings(page){await page.evaluate(()=>navigate('settings'));await page.locator('#settingsCenter').waitFor()}
async function axe(page){
  await page.addScriptTag({content:axeSource});
  const result=await page.evaluate(async()=>(await axe.run({include:['#content']},{runOnly:['wcag2a','wcag2aa']})).violations.map(v=>v.id+': '+v.nodes.length));
  return result;
}
async function overflow(page){return page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)}
// Visible boxes inside the page that scroll on their own (the page itself should be the only scroll on phones; text fields may scroll).
async function innerScrollers(page){return page.evaluate(()=>[...document.querySelectorAll('#content *:not(textarea,select)')].filter(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return /(auto|scroll)/.test(s.overflowY)&&e.scrollHeight>e.clientHeight+1&&r.width>0&&r.height>0}).map(e=>e.id||e.className))}

try{
  // Desktop: index and detail side by side.
  {
    const {context,page}=await openApp(1440,960);
    await toSettings(page);
    const rows=await page.locator('.settings-center-nav .settings-nav-item strong').allTextContents();
    assert.deepEqual(rows,['Mijn bedrijf','Facturen','E-mail & delen','Meldingen','App & weergave','Beveiliging & privacy','Data & export','Abonnement & gebruik','Hulp & feedback','Account','Gevaarzone']);
    for(const hidden of ['Kosten & bonnen','Documenten & scanner','Mobiele app','Bank & betalingen'])assert.equal(rows.includes(hidden),false,hidden+' has no real settings yet');
    assert.equal(await page.locator('#settings-panel-business').isVisible(),true,'Desktop opens Mijn bedrijf next to the index');
    assert.equal(await page.locator('.settings-center-nav').isVisible(),true);
    assert.match(await page.locator('#settingsSetupStatus').innerText(),/Bedrijfse-mail.*IBAN/s,'Setup status lists only what an invoice still needs');
    await page.screenshot({path:shotDir+'/01-home-desktop.png'});

    // Company form saves only its own fields and the setup status disappears once complete.
    await page.locator('#settings-panel-business [name="company.email"]').fill('facturen@example.test');
    await page.locator('#settings-panel-business [name="company.iban"]').fill('NL91ABNA0417164300');
    await page.locator('#settings-panel-business').getByRole('button',{name:'Bedrijfsgegevens opslaan'}).click();
    assert.equal(await page.evaluate(()=>state.company.iban),'NL91ABNA0417164300');
    assert.equal(await page.evaluate(()=>state.company.name),'Fictieve QA BV','Fields outside the form keep their value');
    assert.equal(await page.locator('#settingsSetupStatus').count(),0);
    assert.equal(await page.locator('.settings-center-row[data-settings-open="business"] .settings-center-status').innerText(),'Compleet');
    await page.screenshot({path:shotDir+'/03-mijn-bedrijf-desktop.png'});

    // Facturen: live preview follows the layout choice; saving keeps the logo and numbering intact.
    await page.locator('.settings-center-row[data-settings-open="invoices"]').click();
    assert.equal(await page.locator('#settings-panel-invoices').isVisible(),true);
    assert.equal(await page.locator('#settings-panel-business').isVisible(),false);
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'settings-title-invoices','Focus moves to the panel heading');
    await page.locator('#settings-panel-invoices select[name="invoiceDesign.layout"]').selectOption('classic');
    assert.match(await page.locator('.settings-center-preview').innerHTML(),/Georgia/,'Preview reflects the layout before saving');
    await page.locator('#settings-panel-invoices [name="company.paymentDays"]').fill('30');
    await page.locator('#settings-panel-invoices').getByRole('button',{name:'Factuurinstellingen opslaan'}).click();
    assert.equal(await page.evaluate(()=>state.company.paymentDays),30);
    assert.equal(await page.evaluate(()=>state.company.invoiceDesign.layout),'classic');
    assert.equal(await page.locator('.settings-center-row[data-settings-open="invoices"] .settings-center-status').innerText(),'30 dagen');
    await page.screenshot({path:shotDir+'/04-facturen-desktop.png'});

    for(const [key,file] of [['notifications','05-meldingen-desktop'],['app','06-app-weergave-desktop'],['security','07-beveiliging-desktop'],['danger','08-gevaarzone-desktop'],['email','09-email-desktop'],['data','10-data-desktop']]){
      await page.locator('.settings-center-row[data-settings-open="'+key+'"]').click();
      assert.equal(await page.locator('#settings-panel-'+key).isVisible(),true);
      const violations=await axe(page);
      assert.deepEqual(violations,[],'axe '+key);
      await page.screenshot({path:shotDir+'/'+file+'.png'});
    }

    // Danger zone keeps the existing confirmation flows.
    await page.locator('.settings-center-row[data-settings-open="danger"]').click();
    const danger=page.locator('.settings-danger-group');
    assert.equal(await danger.getByRole('button',{name:'Administratie wissen',exact:true}).count(),1);
    assert.equal(await danger.getByRole('button',{name:'Account verwijderen',exact:true}).count(),1);
    assert.equal(await page.locator('#settings-panel-account .btn.danger').count(),0,'No destructive actions next to Uitloggen');
    assert.equal(await page.locator('#settings-panel-security .btn.danger').count(),0,'No destructive actions in Beveiliging');
    assert.equal(await page.locator('a[href="mailto:support@boekuna.nl"]').count(),1);

    // Advanced exports stay folded away.
    await page.locator('.settings-center-row[data-settings-open="data"]').click();
    assert.equal(await page.locator('details.settings-advanced-exports').count(),1);
    assert.equal(await page.locator('#settings-panel-data [onclick="exportJournalCSV()"]').isVisible(),false);
    await context.close();
  }

  // Preferences persist per account and change real behaviour.
  {
    const {context,page}=await openApp(1280,900);
    // The full release profile replaces the dashboard with the assistant, so check the "Nog te doen" renderer itself.
    assert.match(await page.evaluate(()=>renderAttentionCenter(0)),/bankregel/i);
    await page.evaluate(()=>window.openSettingsSection('notifications'));
    await page.locator('#set-attention-bank').uncheck();
    assert.deepEqual(await page.evaluate(()=>state.meta.attentionHidden),['bank']);
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem(userDataKey())).meta.attentionHidden),['bank'],'Saved with the account data');
    assert.equal(await page.locator('.settings-center-row[data-settings-open="notifications"] .settings-center-status').innerText(),'4 van 5 aan');
    assert.doesNotMatch(await page.evaluate(()=>renderAttentionCenter(0)),/bankregel/i,'Hidden type no longer shows under Nog te doen');
    await page.evaluate(()=>window.openSettingsSection('app'));
    await page.locator('#set-startPage').selectOption('invoices');
    assert.equal(await page.evaluate(()=>state.meta.startPage),'invoices');
    await page.evaluate(()=>enterApp());
    assert.equal(await page.evaluate(()=>page),'invoices','Start page is used after login');
    await page.evaluate(()=>{state.meta.startPage='ledger'});
    assert.equal(await page.evaluate(()=>preferredStartPage()),'dashboard','Unknown start pages fall back to Overzicht');
    await context.close();
  }

  // Mobile: index → category → back at every required width.
  for(const width of [320,360,375,390,393,430]){
    const {context,page}=await openApp(width,width===360?640:844);
    await toSettings(page);
    assert.deepEqual(await innerScrollers(page),[],'Settings index scrolls with the page, not on its own, at '+width);
    assert.equal(await page.locator('.settings-center-nav').isVisible(),true);
    assert.equal(await page.locator('.settings-center-panels').isVisible(),false,'Mobile starts on the index only');
    assert.ok(await overflow(page)<=0,'No horizontal overflow on the index at '+width);
    if(width===390){assert.deepEqual(await axe(page),[],'axe mobile index');await page.screenshot({path:shotDir+'/02-home-mobile.png',fullPage:true})}
    // Phone: there is no separate Gevaarzone row; it opens from Account and going back returns to Account.
    assert.equal(await page.locator('.settings-center-row[data-settings-open="danger"]').isVisible(),false,'No Gevaarzone row on a phone');
    assert.equal(await page.locator('.settings-profile-card').isVisible(),true,'Profile card on top of the phone index');
    for(const key of ['business','invoices','email','notifications','app','security','data','billing','help','account','danger']){
      if(key==='danger'){
        await page.locator('.settings-center-row[data-settings-open="account"]').click();
        await page.locator('#settings-panel-account [data-settings-open="danger"]').click();
      }else await page.locator('.settings-center-row[data-settings-open="'+key+'"]').click();
      assert.equal(await page.locator('#settings-panel-'+key).isVisible(),true);
      assert.equal(await page.locator('.settings-center-nav').isVisible(),false);
      await page.locator('#settings-panel-'+key+' details').evaluateAll(list=>list.forEach(d=>{d.open=true}));
      assert.ok(await overflow(page)<=0,'No horizontal overflow in '+key+' at '+width);
      assert.deepEqual(await innerScrollers(page),[],'No second scroll in '+key+' at '+width);
      if(width===390&&['business','invoices','notifications','app','security','danger'].includes(key)){
        await page.locator('#settings-panel-'+key+' details').evaluateAll(list=>list.forEach(d=>{d.open=false}));
        await page.screenshot({path:shotDir+'/m-'+key+'.png',fullPage:true});
      }
      const back=page.locator('#settings-panel-'+key+' .settings-center-back');
      assert.equal(await back.isVisible(),true);
      await back.click();
      if(key==='danger'){
        assert.equal(await page.locator('#settings-panel-account').isVisible(),true,'Back from Gevaarzone returns to Account');
        assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-settings-open')),'danger','Focus returns to the Account row that opened it');
        await page.locator('#settings-panel-account .settings-center-back').click();
        assert.equal(await page.locator('.settings-center-nav').isVisible(),true);
        continue;
      }
      assert.equal(await page.locator('.settings-center-nav').isVisible(),true);
      assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-settings-open')),key,'Back returns focus to the row');
    }
    // Keyboard: Enter opens, Escape returns.
    await page.locator('.settings-center-row[data-settings-open="app"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#settings-panel-app').isVisible(),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.settings-center-nav').isVisible(),true);
    // The save button stays reachable above the bottom navigation.
    await page.locator('.settings-center-row[data-settings-open="business"]').click();
    const save=page.locator('#settings-panel-business .settings-center-save .btn.primary');
    const box=await save.boundingBox(),nav=await page.locator('#mobileBottomNav').boundingBox();
    assert.ok(box&&nav&&box.y+box.height<=nav.y+1,'Save button sits above the bottom navigation at '+width);
    await context.close();
  }
  assert.deepEqual(errors,[],'No page errors');
  console.log('Settings center: PASS '+browserName);
}finally{
  await browser.close();server.close();
}
