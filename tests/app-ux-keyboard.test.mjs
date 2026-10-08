import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';

execFileSync(process.execPath,['scripts/build-app.mjs']);
const boot="currentUser={...TEST_USER};state=structuredClone(DEFAULT);state.transactions=Array.from({length:174},(_,i)=>({id:'t'+i,date:'2026-09-01',description:'Fictieve transactie '+i,amount:-10,status:'unmatched'}));documentProcessingInitialized=true;enterApp();";
const html=fs.readFileSync('dist/app/index.html','utf8').replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;').replace(/initAuth\(\);(?![\s\S]*initAuth\(\);)/,boot);
const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname;if(p.startsWith('/assets/')){const f='dist/app'+p;if(fs.existsSync(f)){res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'image/svg+xml');return res.end(fs.readFileSync(f))}res.writeHead(404);return res.end()}res.setHeader('Content-Type','text/html');res.end(html)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const name=process.env.BOOKUNA_BROWSER==='webkit'?'webkit':'chromium',releaseProfile=String(process.env.BOEKUNA_RELEASE_PROFILE||'first-release').trim().toLowerCase(),fullProfile=['full','development','test'].includes(releaseProfile),browser=await (name==='webkit'?webkit:chromium).launch();
const page=await browser.newPage({viewport:{width:390,height:844}}),failures=[];
page.setDefaultTimeout(2000);
// Keep native file-chooser interception enabled before keyboard activation.
page.on('filechooser',()=>{});
async function check(label,run){try{await run()}catch(error){failures.push({label,error:String(error)})}}
try{
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.locator('#pageTitle').filter({hasText:'Overzicht'}).waitFor();
 await check('keyboard backup import',async()=>{
  await page.evaluate(()=>navigate('settings'));
  await page.locator('.settings-nav-item').filter({hasText:'Data & export'}).click();
  const importer=page.getByRole('button',{name:'Back-up importeren',exact:true});assert.equal(await importer.count(),1,'Importer needs a keyboard-operable button');
  await page.locator('#settings-panel-data .settings-advanced-exports>summary').focus();await page.keyboard.press('Tab');assert.equal(await importer.evaluate(el=>el===document.activeElement),true);
  for(const key of ['Enter','Space']){const chosen=page.waitForEvent('filechooser');await page.keyboard.press(key);const chooser=await chosen;assert.equal(await chooser.element().getAttribute('id'),'backupFile');await chooser.setFiles([]);assert.equal(await importer.evaluate(el=>el===document.activeElement),true,'Focus must return after cancelling '+key+' file chooser')}
 });
 if(fullProfile){
  await check('keyboard attention filter',async()=>{
   await page.evaluate(()=>navigate('control'));const bank=page.getByRole('button',{name:'Bank (174)',exact:true});await bank.focus();await page.keyboard.press('Enter');assert.equal(await bank.evaluate(el=>el===document.activeElement),true);
  });
  await check('keyboard attention pagination',async()=>{
   await page.evaluate(()=>{setControlFilter('bank');setControlPage(1)});
   let reached=25;
   while(reached<174){const next=page.getByRole('button',{name:'Volgende',exact:true});await next.focus();await page.keyboard.press('Enter');reached=Math.min(174,reached+25);assert.match(await page.locator('.control-pagination [role="status"]').innerText(),new RegExp('–'+reached+' van 174'));const target=page.getByRole('button',{name:reached===174?'Vorige':'Volgende',exact:true});assert.equal(await target.evaluate(el=>el===document.activeElement),true,'Focus must survive pagination, including the final page')}
   await page.keyboard.press('Enter');assert.match(await page.locator('.control-pagination [role="status"]').innerText(),/126–150 van 174/);assert.equal(await page.getByRole('button',{name:'Vorige',exact:true}).evaluate(el=>el===document.activeElement),true);
  });
 }else{
  await check('first-release advanced control fallback',async()=>{
   await page.evaluate(()=>navigate('control'));assert.equal((await page.locator('#pageTitle').innerText()).trim(),'Overzicht');assert.equal(await page.locator('.control-filters').count(),0,'Release 1 must keep advanced control UI hidden');
  });
  await check('keyboard bank quick filter',async()=>{
   await page.evaluate(()=>navigate('bank'));const filter=page.getByLabel('Snelle filters').getByRole('button',{name:'Te verwerken',exact:true});await filter.focus();await page.keyboard.press('Enter');const active=page.getByLabel('Snelle filters').getByRole('button',{name:'Te verwerken',exact:true});assert.equal(await active.evaluate(el=>el.classList.contains('active')),true,'Keyboard activation must apply the visible bank quick filter');
  });
 }
 await check('dialog initial focus respects field input',async()=>{
  await page.evaluate(()=>{
   window.__uxOriginalRAF=window.requestAnimationFrame;window.__uxFocusFrames=[];
   window.requestAnimationFrame=callback=>{window.__uxFocusFrames.push(callback);return window.__uxFocusFrames.length};
   state.contacts.push({id:'ux-existing',type:'customer',name:'Bestaande relatie',city:'',customMetadata:'preserve'});
   editContact('ux-existing');document.querySelector('#contactCity').focus();
   for(const callback of window.__uxFocusFrames.splice(0))callback(performance.now());
   window.requestAnimationFrame=window.__uxOriginalRAF;
  });
  assert.equal(await page.locator('#contactCity').evaluate(el=>el===document.activeElement),true,'Deferred dialog autofocus must not steal an explicitly focused field');
  await page.keyboard.type('Rotterdam');assert.equal(await page.locator('#contactCity').inputValue(),'Rotterdam');await page.getByRole('button',{name:'Opslaan',exact:true}).click();
  const contact=await page.evaluate(()=>state.contacts.find(c=>c.id==='ux-existing'));assert.equal(contact.city,'Rotterdam');assert.equal(contact.customMetadata,'preserve');assert.equal(await page.locator('#contactForm').count(),0);
  const normal=await page.evaluate(()=>{
   window.requestAnimationFrame=callback=>{window.__uxFocusFrames.push(callback);return window.__uxFocusFrames.length};
   newContact();for(const callback of window.__uxFocusFrames.splice(0))callback(performance.now());
   const initial=document.activeElement.className;
   newContact();const stale=window.__uxFocusFrames.shift();newContact();stale(performance.now());const before=document.querySelector('#modalRoot .modal').contains(document.activeElement);
   for(const callback of window.__uxFocusFrames.splice(0))callback(performance.now());
   window.requestAnimationFrame=window.__uxOriginalRAF;return {initial,before,after:document.activeElement.className};
  });
  assert.equal(normal.initial,'modal-close','Normal dialog autofocus remains');assert.equal(normal.before,false,'A removed dialog cannot focus its replacement');assert.equal(normal.after,'modal-close');await page.keyboard.press('Escape');
 });
 assert.deepEqual(failures,[],JSON.stringify(failures));console.log('App UX keyboard regression: PASS '+name+' '+releaseProfile+' (backup import, release-aware keyboard navigation and dialog field focus)');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
