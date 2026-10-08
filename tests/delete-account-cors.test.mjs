// The app calls delete-account from the browser (app.boekuna.nl). The browser sends a CORS preflight
// first; the function answered it with 405 and no CORS headers, so "Account verwijderen" never reached
// the server (release audit 2026-10-08, seen on the live app with a QA account).
// Fake Supabase and no Stripe: nothing real is touched.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadEdgeFunction} from './lib/edge-harness.mjs';

const fnDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../supabase/functions/delete-account');
const USER={id:'00000000-0000-4000-8000-0000000000a1',email:'qa@example.test'};
const calls=[];

function createClient(url,key,opts={}){
  const auth=String(opts?.global?.headers?.Authorization||'');
  const chain=()=>{const c={update(){return c},eq(){return Promise.resolve({error:null})}};return c};
  return {
    auth:{
      async getUser(){return auth==='Bearer good'?{data:{user:USER},error:null}:{data:{user:null},error:{message:'invalid'}}},
      mfa:{async getAuthenticatorAssuranceLevel(){return {data:{currentLevel:'aal1',nextLevel:'aal1'},error:null}}},
      admin:{async deleteUser(id){calls.push('deleteUser '+id);return {error:null}}}
    },
    async rpc(fn,args){calls.push('rpc '+fn);if(fn==='begin_account_closure')return {data:{claimed:true},error:null};return {data:null,error:null}},
    from:()=>chain(),
    storage:{from:()=>({async list(){return {data:[],error:null}},async remove(){return {error:null}}})}
  };
}

const handler=await loadEdgeFunction(fnDir,{
  env:{SUPABASE_URL:'https://fake.supabase.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',STRIPE_SECRET_KEY:'',APP_URL:'https://app.boekuna.nl'},
  supabase:{createClient},
  fetchImpl:async url=>{throw new Error('no network in this test: '+url)}
});
const request=(method,{origin='https://app.boekuna.nl',token}={})=>handler(new Request('https://fake.supabase.test/functions/v1/delete-account',{
  method,headers:{origin,...(token?{authorization:'Bearer '+token}:{}),...(method==='POST'?{'content-type':'application/json'}:{})},body:method==='POST'?'{"confirm":true}':undefined
}));

// Preflight from the app: allowed, with the headers supabase-js sends.
{
  const res=await request('OPTIONS');
  assert.equal(res.status,204);
  assert.equal(res.headers.get('access-control-allow-origin'),'https://app.boekuna.nl');
  for(const h of ['authorization','apikey','content-type','x-client-info'])assert.match(res.headers.get('access-control-allow-headers'),new RegExp(h));
  assert.match(res.headers.get('access-control-allow-methods'),/POST/);
}
// Every answer carries CORS headers, so the app can show the real message.
for(const [method,token,status] of [['GET','',405],['POST','',401],['POST','bad',401]]){
  const res=await request(method,{token});
  assert.equal(res.status,status,method+' '+token);
  assert.equal(res.headers.get('access-control-allow-origin'),'https://app.boekuna.nl',method+' '+status+' has CORS');
}
// A signed-in user can delete the account from the app.
{
  const res=await request('POST',{token:'good'});
  assert.equal(res.status,200);
  assert.deepEqual(await res.json(),{ok:true});
  assert.equal(res.headers.get('access-control-allow-origin'),'https://app.boekuna.nl');
  assert.ok(calls.includes('deleteUser '+USER.id));
}
// Another site does not get its own origin back.
{
  const res=await request('OPTIONS',{origin:'https://evil.example'});
  assert.equal(res.headers.get('access-control-allow-origin'),'https://app.boekuna.nl');
}
console.log('Delete account from the app (CORS preflight and answers): PASS');
