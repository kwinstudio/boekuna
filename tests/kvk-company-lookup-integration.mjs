// Opt in only. CI never calls KVK. All requests use the isolated Edge Function;
// the KVK public test key stays in server-side Vault, never in this runner.
import fs from 'node:fs';
import assert from 'node:assert/strict';

if(process.env.KVK_RUN_FREE_INTEGRATION!=='true')throw Error('Set KVK_RUN_FREE_INTEGRATION=true explicitly for the official free test environment');
const project='https://ozisiotrzeubwbffnxyr.supabase.co';
const origin=process.env.KVK_INTEGRATION_ORIGIN||'https://boekuna-kvk-preview.onrender.com';
const session=JSON.parse(fs.readFileSync(process.env.KVK_INTEGRATION_SESSION_FILE,'utf8'));
const key=process.env.KVK_INTEGRATION_PUBLISHABLE_KEY;
assert.ok(session.access_token&&key);
const outcomes=[];
async function request(body,headers={},expected=200){
  const started=Date.now();
  const r=await fetch(project+'/functions/v1/kvk-company-lookup',{method:'POST',headers:{origin,authorization:'Bearer '+session.access_token,apikey:key,'content-type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const data=await r.json();outcomes.push({action:body.action,status:r.status,latencyMs:Date.now()-started});assert.equal(r.status,expected,data.error?.code||'unexpected status');return data;
}
await request({action:'search',query:'Test'},{authorization:'Bearer invalid'},401);
await request({action:'search',query:'Test'},{origin:'https://evil.example.test'},403);
await request({action:'search',query:'ab'},{},400);
await request({action:'profile',kvkNumber:'69599084'},{},400);
const found=await request({action:'search',query:'Test'});
assert.equal(found.mode,'test');assert.ok(found.data.results.length>0);assert.ok(found.data.results.length<=10);
const main=found.data.results.find(r=>r.type==='hoofdvestiging');assert.ok(main);
const detail=await request({action:'profile',selectionToken:main.selectionToken});assert.equal(detail.mode,'test');assert.equal(detail.data.kvkNumber,main.kvkNumber);assert.ok(detail.data.name);assert.equal(detail.data.email,undefined);
const secondarySearch=await request({action:'search',query:'68750110'});
const secondary=secondarySearch.data.results.find(r=>r.type==='nevenvestiging');assert.ok(secondary,'official test BV must have a secondary branch');
const branch=await request({action:'profile',selectionToken:secondary.selectionToken});assert.equal(branch.data.establishmentNumber,secondary.establishmentNumber);assert.equal(branch.data.kvkNumber,secondary.kvkNumber);
const report={checkedAt:new Date().toISOString(),project:'ozisiotrzeubwbffnxyr',mode:'official-free-test',result:'PASS',searchResultCount:found.data.results.length,mainProfile:true,secondaryProfile:true,authAndCors:true,outcomes};
fs.mkdirSync('tests/artifacts',{recursive:true});fs.writeFileSync('tests/artifacts/kvk-integration.json',JSON.stringify(report,null,2)+'\n');
console.log('KVK deployed authenticated official free-test integration: PASS; no production calls or raw profiles saved');
