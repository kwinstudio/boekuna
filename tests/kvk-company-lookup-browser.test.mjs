import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';

const root=path.resolve(new URL('..',import.meta.url).pathname),browserName=process.env.BOOKUNA_BROWSER==='webkit'?'webkit':'chromium';
const preview=process.env.KVK_BROWSER_PREVIEW==='true';
const build=spawnSync(process.execPath,['scripts/build-app.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,BOEKUNA_DEV_MODE:'false',BOEKUNA_KVK_PREVIEW:String(preview),BOEKUNA_KVK_LOOKUP:'true',BOEKUNA_DEPLOYMENT_ENV:preview?'preview':'production',BOEKUNA_SUPABASE_URL:'https://ozisiotrzeubwbffnxyr.supabase.co',BOEKUNA_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_browser_fixture'}});
assert.equal(build.status,0,build.stderr);
const dir=path.join(root,'dist/app');
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),file=path.join(dir,url.pathname==='/'?'index.html':url.pathname);if(!file.startsWith(dir)||!fs.existsSync(file)){res.writeHead(404);return res.end()}res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});res.end(fs.readFileSync(file))});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
const browser=await (browserName==='webkit'?webkit:chromium).launch({headless:true});
const mode=preview?'test':'production';
const row={kvkNumber:'69599084',establishmentNumber:'000038509504',name:'Zeer lange officiële bedrijfsnaam met meerdere woorden voor een herkenbare vestiging in Utrecht BV',street:'Teststraat',city:'Utrecht',type:'hoofdvestiging',active:true,expiredName:null,selectionToken:'mock-selected-result'};
const profile={kvkNumber:'69599084',establishmentNumber:'000038509504',name:'Officiële Testonderneming BV',address:'Teststraat 12A-2',postalCode:'1234 AB',city:'Utrecht',country:'Nederland',addressType:'bezoekadres',addressShielded:false,active:true,source:'KVK',retrievedAt:'2026-10-01T10:00:00Z'};
const sdk=`
let session={user:{id:'11111111-1111-4111-8111-111111111111',email:'qa@example.test',user_metadata:{first_name:'QA'}},access_token:'mock-authenticated-session',expires_at:4102444800};
const listeners=new Set();window.__savedStates=[];
let ledger=JSON.parse(localStorage.getItem('__kvk_fixture_remote:'+session.user.id)||'null')||{meta:{nextInvoice:1},contacts:[{id:'existing',type:'customer',name:'Bestaande relatie',kvk:'12 345 678',country:'Nederland',customMetadata:'preserve'}]};
window.__changeAccount=()=>{session={...session,user:{...session.user,id:'22222222-2222-4222-8222-222222222222'}};ledger={meta:{nextInvoice:1},contacts:[]};for(const cb of listeners)cb('SIGNED_IN',session)};
function query(table){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},upsert(){return q},insert(){return q},update(){return q},delete(){return q},maybeSingle:async()=>({data:table==='profiles'?{company:{}}:table==='ledger_state'?{state:structuredClone(ledger),version:1}:null,error:null}),single:async()=>({data:null,error:null}),then(resolve){resolve({data:[],error:null})}};return q}
export function createClient(){return {auth:{getSession:async()=>({data:{session},error:null}),refreshSession:async()=>({data:{session},error:null}),onAuthStateChange:cb=>{listeners.add(cb);return {data:{subscription:{unsubscribe(){listeners.delete(cb)}}}}},signOut:async()=>{session=null;for(const cb of listeners)cb('SIGNED_OUT',null);return {error:null}},mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1',nextLevel:'aal1'},error:null})}},from:query,rpc:async(name,args)=>{if(name==='get_billing_summary')return {data:{plan:'free',status:'free',entitlement_status:'free'},error:null};if(name==='save_ledger_state'){window.__savedStates.push(structuredClone(args.p_state));ledger=structuredClone(args.p_state);localStorage.setItem('__kvk_fixture_remote:'+session.user.id,JSON.stringify(ledger));return {data:window.__savedStates.length+1,error:null}}return {data:null,error:null}},channel:()=>({on(){return this},subscribe(){return this},unsubscribe(){}}),storage:{from:()=>({remove:async()=>({error:null})})}}}
`;
const calls=[],errors=[];
let respond=body=>({ok:true,mode,data:body.action==='search'?{results:[row],page:1,hasMore:false}:profile});
async function fresh(){
  const p=await browser.newPage({viewport:{width:1280,height:900}});p.on('pageerror',e=>errors.push(String(e)));p.on('dialog',dialog=>dialog.accept());
  // Existing document polling must also stay offline with this synthetic JWT.
  await p.route('https://*.supabase.co/**',r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,data:{jobs:[]},jobs:[]})}));
  await p.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',r=>r.fulfill({status:200,contentType:'text/javascript',body:sdk}));
  await p.route('**/functions/v1/kvk-company-lookup',async r=>{const body=r.request().postDataJSON();calls.push(body);const response=await respond(body);try{await r.fulfill({status:response.ok?200:503,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(response)})}catch{}});
  await p.goto(url,{waitUntil:'domcontentloaded'});await p.locator('#pageTitle').filter({hasText:'Overzicht'}).waitFor();await p.evaluate(()=>navigate('contacts'));await p.getByRole('button',{name:'Nieuwe relatie',exact:true}).click();await p.locator('#kvkQuery').waitFor();return p;
}
async function find(p,q='Test'){await p.locator('#kvkQuery').fill(q);await p.locator('.kvk-result').first().waitFor()}
try{
  let p=await fresh();assert.equal(await p.locator('.kvk-preview').isVisible(),preview);
  await p.locator('#kvkQuery').focus();await p.keyboard.press('Tab');assert.equal(await p.locator('#kvkPlace').evaluate(el=>el===document.activeElement),true);await p.keyboard.press('Shift+Tab');assert.equal(await p.locator('#kvkQuery').evaluate(el=>el===document.activeElement),true);
  const widths=[320,360,375,390,393,430,768,820,1024,1280,1440];
  await find(p);
  assert.equal(calls.filter(c=>c.action==='profile').length,0,'search never fetches profiles');
  for(const width of widths){await p.setViewportSize({width,height:900});await p.waitForTimeout(30);assert.ok(await p.locator('.modal').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'dialog overflows at '+width);assert.ok(await p.locator('.kvk-result').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'long result overflows at '+width);assert.equal(await p.locator('.kvk-result strong').innerText(),row.name)}
  const axe=fs.readFileSync(path.join(root,'tests/node_modules/axe-core/axe.min.js'),'utf8');await p.addScriptTag({content:axe});
  const accessibility=await p.evaluate(async()=>{const result=await axe.run({include:['#kvkLookup','#contactForm']},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))});assert.deepEqual(accessibility,[],'KVK form accessibility');
  assert.equal(await p.locator('#kvkStatus').getAttribute('aria-live'),'polite');
  fs.mkdirSync(path.join(root,'tests/artifacts'),{recursive:true});
  for(const width of [320,1440]){await p.setViewportSize({width,height:900});await p.screenshot({path:path.join(root,'tests/artifacts','kvk-'+browserName+'-'+mode+'-'+width+'.png'),fullPage:true})}
  await p.locator('#contactType').selectOption('supplier');await p.locator('#contactEmail').fill('zelf@example.test');await p.locator('#contactVat').fill('NL123TEST');
  await p.locator('.kvk-result').focus();await p.keyboard.press('Enter');await p.waitForFunction(()=>document.querySelector('#contactKvk')?.value==='69599084');
  assert.equal(calls.filter(c=>c.action==='profile').length,1);assert.equal(await p.locator('#contactAddress').inputValue(),profile.address);assert.equal(await p.locator('#contactType').inputValue(),'supplier');assert.equal(await p.locator('#contactEmail').inputValue(),'zelf@example.test');assert.equal(await p.locator('#contactVat').inputValue(),'NL123TEST');
  assert.equal(await p.evaluate(()=>window.__savedStates.length),0,'autofill never saves');
  await p.locator('#contactAddress').fill('Zelf gewijzigd 3');await p.getByRole('button',{name:'Opslaan',exact:true}).click();
  await p.waitForFunction(()=>window.__savedStates.some(s=>s.contacts?.some(c=>c.kvk==='69599084')));
  const saved=await p.evaluate(()=>window.__savedStates.at(-1).contacts.find(c=>c.kvk==='69599084'));
  assert.equal(saved.address,'Zelf gewijzigd 3');assert.equal(saved.establishmentNumber,'000038509504');assert.equal(saved.type,'supplier');assert.equal(saved.kvkSource,'KVK');
  await p.reload();await p.locator('#pageTitle').waitFor();await p.evaluate(id=>editContact(id),saved.id);assert.equal(await p.locator('#contactAddress').inputValue(),'Zelf gewijzigd 3');await p.locator('#contactType').selectOption('customer');await p.getByRole('button',{name:'Opslaan',exact:true}).click();await p.evaluate(()=>newInvoice());assert.equal(await p.locator('#invoiceCustomer option').evaluateAll((options,id)=>options.some(o=>o.value===id),saved.id),true);await p.locator('#invoiceCustomer').selectOption(saved.id);assert.match(await p.locator('#customerPreview').innerText(),/Officiële Testonderneming/);await p.keyboard.press('Escape');assert.equal(await p.locator('#contactForm').count(),0);
  // Same normalized KVK is blocked; a name alone is allowed; edits keep metadata.
  assert.equal(await p.evaluate(()=>state.contacts.find(c=>c.id==='existing')?.kvk),'12 345 678','existing relation survives reload/invoice selection');
  await p.evaluate(()=>newContact());await p.locator('#contactName').fill('Andere naam');await p.locator('#contactKvk').fill('12-345-678');await p.getByRole('button',{name:'Opslaan',exact:true}).click();await p.getByRole('button',{name:'Open bestaande relatie'}).click();assert.equal(await p.locator('#contactName').inputValue(),'Bestaande relatie');await p.locator('#contactCity').fill('Rotterdam');await p.getByRole('button',{name:'Opslaan',exact:true}).click();try{await p.waitForFunction(()=>window.__savedStates.at(-1)?.contacts.find(c=>c.id==='existing')?.city==='Rotterdam')}catch(error){
   const diagnostic=await p.evaluate(()=>({contacts:state.contacts,savedStates:window.__savedStates.map(s=>({contacts:s.contacts,audit:s.audit})),cloudStatus:cloudSyncStatus,active:document.activeElement?.outerHTML?.slice(0,500),form:document.querySelector('#contactForm')?Object.fromEntries(new FormData(document.querySelector('#contactForm'))):null,invalid:[...document.querySelectorAll('#contactForm :invalid')].map(el=>({name:el.name,value:el.value,message:el.validationMessage}))}));
   console.error('KVK duplicate-edit save diagnostic',JSON.stringify(diagnostic));throw error
  };assert.equal(await p.evaluate(()=>window.__savedStates.at(-1).contacts.find(c=>c.id==='existing').customMetadata),'preserve');
  await p.evaluate(()=>newContact());await p.getByRole('button',{name:'Handmatig invullen',exact:true}).click();await p.locator('#contactName').fill('Bestaande relatie');await p.locator('#contactCountry').fill('België');await p.getByRole('button',{name:'Opslaan',exact:true}).click();await p.waitForFunction(()=>window.__savedStates.at(-1)?.contacts.filter(c=>c.name==='Bestaande relatie').length===2);await p.close();
  // Server failure always leaves manual fields usable.
  respond=()=>({ok:false,error:{code:'UNAVAILABLE'}});p=await fresh();await p.locator('#kvkQuery').fill('Test');await p.locator('#kvkStatus').filter({hasText:'handmatig'}).waitFor();await p.getByRole('button',{name:'Handmatig invullen',exact:true}).click();assert.equal(await p.locator('#contactName').isEditable(),true);await p.close();
  // Slow search must not replace a newer response.
  respond=async body=>{if(body.query==='Oude'){await new Promise(r=>setTimeout(r,950));return {ok:true,mode,data:{results:[{...row,name:'Oude reactie'}],hasMore:false}}}return {ok:true,mode,data:{results:[{...row,name:'Nieuwe reactie'}],hasMore:false}}};
  p=await fresh();await p.locator('#kvkQuery').fill('Oude');await p.waitForTimeout(470);await p.locator('#kvkQuery').fill('Nieuwe');await p.locator('.kvk-result strong').filter({hasText:'Nieuwe reactie'}).waitFor();await p.waitForTimeout(1000);assert.equal(await p.locator('.kvk-result strong').innerText(),'Nieuwe reactie');await p.close();
  // Editing while detail is loading cannot overwrite the user's input.
  respond=async body=>{if(body.action==='profile')await new Promise(r=>setTimeout(r,500));return {ok:true,mode,data:body.action==='search'?{results:[row],hasMore:false}:profile}};
  p=await fresh();await find(p);await p.locator('.kvk-result').click();await p.locator('#contactName').fill('Tijdens het ophalen gewijzigd');await p.locator('#kvkStatus').filter({hasText:'gewijzigd'}).waitFor();assert.equal(await p.locator('#contactName').inputValue(),'Tijdens het ophalen gewijzigd');await p.close();
  // Closing or changing account while a request runs leaves no old profile in a new form.
  p=await fresh();await find(p);await p.locator('.kvk-result').click();await p.keyboard.press('Escape');await p.evaluate(()=>newContact());await p.waitForTimeout(700);assert.equal(await p.locator('#contactName').inputValue(),'');await p.close();
  p=await fresh();await find(p);await p.locator('.kvk-result').click();await p.evaluate(()=>window.__changeAccount());await p.waitForTimeout(700);assert.notEqual(await p.locator('#contactKvk').inputValue(),'69599084');await p.close();
  // Short cache avoids a second paid profile request in this modal.
  respond=body=>({ok:true,mode,data:body.action==='search'?{results:[row],hasMore:false}:profile});p=await fresh();await find(p);const before=calls.filter(c=>c.action==='profile').length;await p.locator('.kvk-result').click();await p.waitForFunction(()=>document.querySelector('#contactKvk')?.value==='69599084');await p.locator('.kvk-result').click();await p.waitForTimeout(100);assert.equal(calls.filter(c=>c.action==='profile').length,before+1);await p.close();
  // A production artifact rejects test data, including an accidental server misconfiguration.
  if(!preview){respond=()=>({ok:true,mode:'test',data:{results:[row],hasMore:false}});p=await fresh();await p.locator('#kvkQuery').fill('Test');await p.locator('#kvkStatus').filter({hasText:'tijdelijk niet beschikbaar'}).waitFor();assert.equal(await p.locator('.kvk-result').count(),0);await p.close()}
  assert.deepEqual(errors,[]);
  console.log('KVK generated '+(preview?'preview':'production')+' artifact '+browserName+': PASS; '+widths.join(',')+'px; search, one profile, edit/save/cloud, duplicates, manual, races, account isolation, cache');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));if(preview)spawnSync(process.execPath,['scripts/build-app.mjs'],{cwd:root,env:{...process.env,BOEKUNA_KVK_PREVIEW:'false',BOEKUNA_DEV_MODE:'false',BOEKUNA_DEPLOYMENT_ENV:'production'}})}
