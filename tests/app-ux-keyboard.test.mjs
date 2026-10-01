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
const name=process.env.BOOKUNA_BROWSER==='webkit'?'webkit':'chromium',browser=await (name==='webkit'?webkit:chromium).launch();
const page=await browser.newPage({viewport:{width:390,height:844}}),failures=[];
page.setDefaultTimeout(2000);
async function check(label,run){try{await run()}catch(error){failures.push({label,error:String(error)})}}
try{
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor();
 await check('keyboard backup import',async()=>{
  await page.evaluate(()=>navigate('settings'));
  const importer=page.getByRole('button',{name:'Back-up importeren',exact:true});assert.equal(await importer.count(),1,'Importer needs a keyboard-operable button');
  await page.getByRole('button',{name:'Administratie-back-up',exact:true}).focus();await page.keyboard.press('Tab');assert.equal(await importer.evaluate(el=>el===document.activeElement),true);
  for(const key of ['Enter','Space']){const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.keyboard.press(key)]);assert.equal(await chooser.element().getAttribute('id'),'backupFile')}
 });
 await check('keyboard attention filter',async()=>{
  await page.evaluate(()=>navigate('control'));const bank=page.getByRole('button',{name:'Bank (174)',exact:true});await bank.focus();await page.keyboard.press('Enter');assert.equal(await bank.evaluate(el=>el===document.activeElement),true);
 });
 await check('keyboard attention pagination',async()=>{
  await page.evaluate(()=>{setControlFilter('bank');setControlPage(1)});
  let reached=25;
  while(reached<174){const next=page.getByRole('button',{name:'Volgende',exact:true});await next.focus();await page.keyboard.press('Enter');reached=Math.min(174,reached+25);assert.match(await page.locator('.control-pagination [role="status"]').innerText(),new RegExp('–'+reached+' van 174'));const target=page.getByRole('button',{name:reached===174?'Vorige':'Volgende',exact:true});assert.equal(await target.evaluate(el=>el===document.activeElement),true,'Focus must survive pagination, including the final page')}
  await page.keyboard.press('Enter');assert.match(await page.locator('.control-pagination [role="status"]').innerText(),/126–150 van 174/);assert.equal(await page.getByRole('button',{name:'Vorige',exact:true}).evaluate(el=>el===document.activeElement),true);
 });
 assert.deepEqual(failures,[],JSON.stringify(failures));console.log('App UX keyboard regression: PASS '+name+' (backup file chooser, category and seven-page focus traversal)');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
