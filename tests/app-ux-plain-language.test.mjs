import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';
execFileSync(process.execPath,['scripts/build-app.mjs']);
const generated=fs.readFileSync('dist/app/index.html','utf8');
const boot=`currentUser={...TEST_USER,email:'qa@example.test',supabaseUser:{user_metadata:{first_name:'Kwin'}}};state=structuredClone(DEFAULT);
state.company={...state.company,name:'Fictieve QA BV',contactName:'Kwin',email:'qa@example.test',address:'Teststraat 1',postal:'3011AA',city:'Rotterdam',country:'Nederland',kvk:'12345678',vat:'NL123456789B01',iban:'NL91ABNA0417164300'};
state.contacts=[{id:'c1',type:'customer',name:'Fictieve klant met een bijzonder lange naam zonder korte afkorting',email:'qa@example.test',address:'Teststraat',postal:'3011AA',city:'Rotterdam'}];
state.services=[{id:'s1',name:'Fictieve dienst',price:100,vat:21,unitLabel:'uur',active:true}];
state.invoices=[{id:'i1',number:'2026-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:'2026-09-01',dueDate:'2026-09-15',lines:[{desc:'Fictieve dienst',qty:1,unit:100,unitLabel:'uur',vat:21}],payments:[]},{id:'i2',number:'2025-0001',customerId:'c1',status:'sent',kind:'invoice',issueDate:'2025-08-01',dueDate:'2025-08-15',lines:[{desc:'Fictieve dienst',qty:1,unit:200,unitLabel:'uur',vat:9}],payments:[]}];
state.expenses=[{id:'e1',date:'2026-09-01',vendor:'Fictieve leverancier',invoiceNumber:'INK-1',category:'Kantoor',paymentMethod:'bank',exVat:50,vatRate:21}];
state.transactions=Array.from({length:174},(_,i)=>({id:'t'+i,date:'2026-09-01',description:'Fictieve transactie '+i,amount:-10,status:'unmatched'}));
state.hours=[{id:'h1',date:'2026-09-01',project:'Fictief project',desc:'Werkzaamheden',hours:8}];state.mileage=[{id:'m1',date:'2026-09-01',from:'Rotterdam',to:'Amsterdam',purpose:'Fictieve afspraak',km:75}];
state.audit=[{id:'a1',at:'2026-09-01T12:00:00Z',action:'Fictieve actie',detail:'Controleerbare testgegevens',entityType:'invoice'}];state.bookings=[];
state.documents=[{id:'d1',fileId:'f1',name:'fictief-document.pdf',type:'Document',date:'2026-09-01',processingState:'failed'}];
documentProcessingJobs=[{id:'j1',client_ref:'f1',file_name:'fictief-document.pdf',state:'failed',attempt:1,max_attempts:3}];documentProcessingInitialized=true;documentProcessingConnectivityLost=false;documentProcessingFetchError=false;enterApp();`;
const html=generated.replace('const TEST_MODE_NO_AUTH=false;','const TEST_MODE_NO_AUTH=true;').replace(/initAuth\(\);(?![\s\S]*initAuth\(\);)/,boot);
const server=http.createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname;
 if(p.startsWith('/assets/')){const f=path.resolve('dist/app'+p);if(fs.existsSync(f)){res.setHeader('Content-Type',p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':p.endsWith('.svg')?'image/svg+xml':'image/png');return res.end(fs.readFileSync(f));}res.writeHead(404);return res.end();}
 res.setHeader('Content-Type','text/html');res.end(html);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browserName=process.env.BOOKUNA_BROWSER||'chromium',browser=await (browserName==='webkit'?webkit:chromium).launch();
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],failures=[],layout=[];
page.on('pageerror',e=>errors.push(String(e)));fs.mkdirSync('tests/artifacts',{recursive:true});
page.setDefaultTimeout(1500);
async function check(name,fn){try{await fn()}catch(e){failures.push({name,error:String(e)})}}
async function nav(p){await page.evaluate(p=>navigate(p),p);await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(260)}
try{
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.locator('#pageTitle').filter({hasText:'Dashboard'}).waitFor();
 await check('standalone auth',async()=>{await page.evaluate(()=>showAuth('login'));assert.equal(await page.locator('.back-to-site').count(),0);await page.evaluate(()=>enterApp())});
 await check('bottom nav',async()=>{assert.deepEqual((await page.locator('#mobileBottomNav .mobile-bottom-nav-item').allTextContents()).map(s=>s.trim().replace(/Scan\d+$/,'Scan')),['Dashboard','Facturen','Scan','Bank','Actie nodig'])});
 await check('scan opens one native picker',async()=>{const event=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Scan',exact:true}).click();const chooser=await event;assert.equal(chooser.isMultiple(),true);assert.equal(await page.locator('.source-picker').count(),0);assert.equal(await page.locator('#invoicePdfFile').getAttribute('capture'),null)});
 await check('chart values',async()=>{await nav('dashboard');const bars=page.locator('.chart button');assert.equal(await bars.count(),6);await bars.nth(4).focus();assert.match(await page.locator('.chart-values').innerText(),/Omzet.*€.*Kosten.*€/s);await page.keyboard.press('Escape');assert.equal(await page.locator('.chart-values').isVisible(),false);await bars.nth(4).click();assert.equal(await page.locator('.chart-values').isVisible(),true)});
 for(const route of ['invoices','expenses','ledger','control','reports'])await check('central exports '+route,async()=>{await nav(route);assert.equal(await page.locator('#content [onclick*="export"]').count(),0)});
 await check('settings exports',async()=>{await nav('settings');for(const action of ['exportInvoicesCSV','exportExpensesCSV','exportJournalCSV','exportBackup','exportAuditCSV'])assert.equal(await page.locator('#content [onclick="'+action+'()'+'"]:visible').count(),1);for(const label of ['Bedrijf','Facturen','Data & import/export','Beveiliging','Account','Geavanceerd'])assert.ok((await page.locator('#content').textContent()).includes(label))});
 await check('document hierarchy',async()=>{await nav('documents');assert.equal(await page.getByRole('button',{name:'Uploaden',exact:true}).count(),1);assert.equal(await page.locator('.dropzone').isVisible(),false);assert.equal(await page.getByRole('button',{name:'Handmatig invoeren',exact:true}).isVisible(),false);assert.equal(await page.getByRole('button',{name:'Opnieuw proberen',exact:true}).count(),1);await page.getByRole('button',{name:'Documentacties',exact:true}).click();assert.ok(await page.getByRole('button',{name:'Handmatig invoeren',exact:true}).isVisible());await page.evaluate(()=>closeModal())});
 await check('all years VAT',async()=>{await nav('vat');await page.locator('#vatYear').selectOption('all');assert.ok((await page.locator('#content').innerText()).includes('2025'));assert.match(await page.locator('#content').innerText(),/€\s*18,00/);assert.equal(await page.getByRole('button',{name:'Kopieer overzicht',exact:true}).count(),0);await page.getByRole('button',{name:'Bekijk 2025',exact:true}).click();assert.equal(await page.locator('#vatYear').inputValue(),'2025')});
 await check('complete large attention list',async()=>{await nav('control');await page.getByRole('button',{name:/Bank \(174\)/}).click();let count=0;while(true){count+=await page.locator('.control-worklist [data-control-key]').count();const next=page.getByRole('button',{name:'Volgende',exact:true});if(!(await next.isEnabled()))break;await next.click()}assert.equal(count,174);await page.getByLabel('Zoek aandachtspunten').fill('Fictieve transactie 173');assert.equal(await page.locator('[data-control-key]').count(),1);assert.match(await page.locator('.control-worklist').innerText(),/transactie 173/)});

 await page.addScriptTag({content:fs.readFileSync('tests/node_modules/axe-core/axe.min.js','utf8')});
 for(const route of ['dashboard','control','settings','vat'])await check('accessibility '+route,async()=>{await nav(route);const violations=await page.evaluate(async()=>{const result=await axe.run({include:['#content']},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))});assert.deepEqual(violations,[])});
 await check('new contact accessibility',async()=>{for(const call of ['newContact()']){await page.evaluate(call);await page.locator('#modalRoot').evaluate(async root=>{await Promise.all(root.getAnimations({subtree:true}).map(animation=>animation.finished))});const violations=await page.evaluate(async()=>{const result=await axe.run({include:['#modalRoot']},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))});assert.deepEqual(violations,[]);await page.evaluate(()=>closeModal())}});
 await page.evaluate(()=>{state.invoices.push(...Array.from({length:75},(_,index)=>({id:'bulk'+index,number:'2026-QA'+index,customerId:'c1',status:index%4===0?'draft':'sent',kind:'invoice',issueDate:'2026-09-01',dueDate:'2026-09-15',lines:[{desc:'Fictieve lange omschrijving voor een grote dataset',qty:1,unit:index===1?999999999.99:100,vat:21}],payments:index%4===2?[{amount:121,date:'2026-09-02'}]:index%4===3?[{amount:60,date:'2026-09-02'}]:[]})))});
 const routes=['dashboard','invoices','expenses','documents','bank','control','vat','reports','cashflow','ledger','contacts','services','bookings','hours','settings','profile'];
 for(const width of [320,360,375,390,393,430,768,1024,1280,1440]){
  await page.setViewportSize({width,height:width<768?844:1000});
  for(const route of routes){await nav(route);await check('layout '+route+' '+width,async()=>{
   const result=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflowNodes:[...document.querySelectorAll('#content *')].filter(el=>el.getClientRects().length&&el.scrollWidth>el.clientWidth+2).slice(0,15).map(el=>({tag:el.tagName,cls:el.className,width:el.clientWidth,scroll:el.scrollWidth,text:el.textContent.slice(0,70)})),offenders:[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+2).slice(0,12).map(el=>({tag:el.tagName,cls:el.className,text:el.textContent.slice(0,50),right:el.getBoundingClientRect().right})),wide:[...document.querySelectorAll('#content .table-wrap')].filter(el=>el.scrollWidth>el.clientWidth+2).map(el=>el.className)}));layout.push({route,...result});assert.ok(result.scroll<=width+2,JSON.stringify(result));assert.deepEqual(result.wide,[],'Financial data must not require horizontal scrolling');
   if([320,390,1440].includes(width))await page.screenshot({path:`tests/artifacts/app-ux-${route}-${browserName}-${width}.png`,fullPage:await page.evaluate(()=>document.documentElement.scrollHeight<30000),timeout:10000});
  })}
 }
 await page.setViewportSize({width:320,height:844});await nav('invoices');await page.evaluate(()=>viewInvoice('i1'));await page.waitForTimeout(350);
 await check('invoice detail action menu and overflow',async()=>{assert.ok(await page.locator('#modalRoot').getByRole('button',{name:'Factuuracties',exact:true}).isVisible());assert.equal(await page.locator('#modalRoot').getByRole('button',{name:/Bewerk/}).count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));assert.equal(await page.locator('#modalRoot').evaluate(el=>el.scrollWidth>innerWidth+2),false)});
 await check('no page errors',async()=>assert.deepEqual(errors,[]));
 fs.writeFileSync(`tests/artifacts/app-ux-${browserName}-results.json`,JSON.stringify({browserName,layout,errors,failures},null,2));
 assert.deepEqual(failures,[],JSON.stringify(failures.slice(0,15)));console.log('Generated app UX plain-language regression: PASS '+browserName+' '+layout.length+' layouts');
}finally{await browser.close();await new Promise(r=>server.close(r))}
