// iPhone local-first: the administration opens from this account's own local copy when there is no
// connection, offline changes are sent afterwards, and a cloud copy that moved on in the meantime is
// never overwritten (the offline changes become a recovery copy). Without the native flag nothing changes.
// Fake Supabase client, fictional data; no backend is contacted.
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
function replaceLast(source,needle,replacement){const i=source.lastIndexOf(needle);if(i<0)throw new Error('Missing '+needle);return source.slice(0,i)+replacement+source.slice(i+needle.length)}

const html=replaceLast(original,'initAuth();',String.raw`
if(new URL(location.href).searchParams.get('native')==='1')window.BoekunaNativeLocalFirst=Object.freeze({version:1});
window.__cloud={online:true,version:4,state:{meta:{},company:{name:'Cloud BV'},contacts:[{id:'c1',name:'Uit de cloud'}]},rpcCalls:[]};
const fail=()=>{throw new TypeError('Failed to fetch')};
supabaseClient={
 auth:{getSession:async()=>({data:{session:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
 from:table=>{const q={select(){return q},eq(){return q},maybeSingle:async()=>{if(!window.__cloud.online)fail();return {data:table==='profiles'?null:{state:structuredClone(window.__cloud.state),version:window.__cloud.version},error:null}},upsert:async()=>({error:null})};return q},
 rpc:async(name,args)=>{const c=window.__cloud;if(!c.online)fail();c.rpcCalls.push(args.p_expected_version);if(args.p_expected_version!==c.version)return {data:null,error:null};c.version++;c.state=structuredClone(args.p_state);return {data:c.version,error:null}}
};
loadBillingSummary=async()=>{};handleBillingReturnAndPlan=async()=>{};handleMailboxReturn=()=>{};initDocumentBackgroundProcessing=async()=>{};resumePendingDocumentVerifications=async()=>{};
`);

const server=http.createServer((req,res)=>{
 if((req.url||'').split('?')[0]==='/app'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(html)}
 res.writeHead(404);res.end('');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/app`;
const name=process.env.BOOKUNA_BROWSER==='webkit'?'webkit':'chromium';
const browser=await (name==='webkit'?webkit:chromium).launch();
const errors=[];
const user={id:'qa-local-first',email:'qa@example.test'};
const names=page=>page.evaluate(()=>state.contacts.map(c=>c.name));
async function open(native){
 const ctx=await browser.newContext();
 const page=await ctx.newPage();
 page.on('pageerror',e=>errors.push(String(e)));
 await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
 await page.goto(base+(native?'?native=1':''),{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof hydrateCloudAccount==='function'&&!!supabaseClient);
 return page;
}
const hydrate=(page,u)=>page.evaluate(async u=>{try{await hydrateCloudAccount(u);return 'ok'}catch(e){return 'error'}},u);
const addContact=(page,n)=>page.evaluate(n=>{state.contacts.push({id:'x-'+n,name:n});save();return syncCloudStateNow()},n);
const statusText=page=>page.evaluate(()=>cloudSyncStatus);

try{
 // iPhone with local-first: first online start fills the local copy.
 const page=await open(true);
 assert.equal(await hydrate(page,user),'ok');
 assert.deepEqual(await names(page),['Uit de cloud']);
 assert.deepEqual(await page.evaluate(id=>readSyncMeta(id),user.id),{base:4,rev:0,synced:0});

 // Offline start: the local copy opens instead of an error, and offline edits stay on the device.
 await page.evaluate(()=>{window.__cloud.online=false;state=structuredClone(DEFAULT);currentUser=null});
 assert.equal(await hydrate(page,user),'ok','offline start opens the local copy');
 assert.deepEqual(await names(page),['Uit de cloud']);
 assert.equal(await statusText(page),'offline');
 await page.evaluate(()=>{state.contacts.push({id:'x-offline',name:'Offline toegevoegd'});save()});
 assert.equal(await page.evaluate(id=>localChangesPending(id),user.id),true);

 // Next start online, cloud unchanged (still version 4): the offline change is kept and sent.
 await page.evaluate(()=>{window.__cloud.online=true;state=structuredClone(DEFAULT);currentUser=null});
 assert.equal(await hydrate(page,user),'ok');
 await page.evaluate(()=>syncCloudStateNow());
 assert.deepEqual(await page.evaluate(()=>window.__cloud.state.contacts.map(c=>c.name)),['Uit de cloud','Offline toegevoegd'],'offline change reached the cloud');
 assert.equal(await page.evaluate(()=>window.__cloud.version),5);
 assert.equal(await page.evaluate(id=>localChangesPending(id),user.id),false);

 // Offline again, then another device changes the cloud: offline work becomes a recovery copy, cloud wins.
 await page.evaluate(()=>{window.__cloud.online=false;state=structuredClone(DEFAULT);currentUser=null});
 await hydrate(page,user);
 await page.evaluate(()=>{state.contacts.push({id:'x-late',name:'Offline later'});save()});
 await page.evaluate(()=>{window.__cloud.online=true;window.__cloud.version=9;window.__cloud.state={meta:{},contacts:[{id:'c2',name:'Ander apparaat'}]};state=structuredClone(DEFAULT);currentUser=null});
 assert.equal(await hydrate(page,user),'ok');
 assert.deepEqual(await names(page),['Ander apparaat'],'cloud copy is not overwritten');
 const backup=await page.evaluate(id=>JSON.parse(localStorage.getItem('boekhouden-cloud-conflict-v1-'+id)||'null'),user.id);
 assert.ok(backup?.state?.contacts?.some(c=>c.name==='Offline later'),'offline change kept as recovery copy');
 assert.equal(await page.evaluate(()=>window.__cloud.version),9,'nothing pushed over the newer cloud copy');

 // Offline start without changes, cloud moved on: when the connection returns the newer cloud copy is taken, no false conflict.
 await page.evaluate(()=>{localStorage.removeItem('boekhouden-cloud-conflict-v1-'+currentUser.id);window.__cloud.online=false;state=structuredClone(DEFAULT);currentUser=null});
 await hydrate(page,user);
 await page.evaluate(()=>{window.__cloud.online=true;window.__cloud.version=11;window.__cloud.state={meta:{},contacts:[{id:'c3',name:'Nieuwer'}]};return performCloudStateSync(currentUser.id)});
 assert.deepEqual(await names(page),['Nieuwer']);
 assert.equal(await page.evaluate(id=>localStorage.getItem('boekhouden-cloud-conflict-v1-'+id),user.id),null,'no conflict copy');
 assert.equal(await statusText(page),'saved');

 // Another account on the same iPhone has no local copy: offline start fails as before (login screen), no data of the first account.
 await page.evaluate(()=>{window.__cloud.online=false;state=structuredClone(DEFAULT);currentUser=null});
 assert.equal(await hydrate(page,{id:'other-account',email:'other@example.test'}),'error');

 // Web, Android and iPhone builds with the flag off: unchanged, an offline start still fails.
 const web=await open(false);
 await web.evaluate(u=>{localStorage.setItem(DATA_KEY_PREFIX+u.id,JSON.stringify({meta:{},contacts:[{id:'l',name:'Lokaal'}]}));window.__cloud.online=false},user);
 assert.equal(await hydrate(web,user),'error','no offline start without the native flag');

 assert.deepEqual(errors,[],'no page errors');
 console.log('PASS iOS local-first offline administration ('+name+'): offline start, offline changes sent, conflict copy, no false conflict, account isolation, web unchanged');
}finally{await browser.close();server.close()}
