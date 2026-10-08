// Uitloggen removes the local copy of the administration once the cloud copy is confirmed,
// and keeps it (with a warning) when the last save did not succeed.
import assert from 'node:assert/strict';
import {loadApp} from './production-code.mjs';

const USER='00000000-0000-4000-8000-0000000000c3';
function run({syncStatus,syncThrows=false,testMode=false}){
  const store=new Map([
    ['boekhouden-user-data-v1-'+USER,'{"invoices":[]}'],
    ['boekhouden-user-profile-v1-'+USER,'{"name":"Fictief BV"}'],
    ['boekhouden-user-data-v1-other','{"invoices":[]}'],
    ['boekuna-theme','dark']
  ]);
  const toasts=[];
  const el=()=>({style:{},innerHTML:'',isConnected:false,classList:{toggle(){},add(){},remove(){}}});
  const ctx=loadApp(['logoutUser'],{
    TEST_MODE_NO_AUTH:testMode,DATA_KEY_PREFIX:'boekhouden-user-data-v1-',PROFILE_KEY_PREFIX:'boekhouden-user-profile-v1-',
    currentUser:{id:USER,email:'qa@example.test'},cloudSyncStatus:'saved',DEFAULT:{invoices:[]},
    localStorage:{removeItem:k=>store.delete(k),getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},
    document:{getElementById:()=>el()},window:{},console:{warn(){}},
    setProductUiAuthenticated(){},cleanupDocumentBackgroundProcessing(){},resetAuthScopedClientState(){},closeModal(){},showAuth(){},
    toast:m=>toasts.push(m),
    getSupabase:async()=>({auth:{signOut:async()=>({})}}),
  });
  ctx.syncCloudStateNow=async()=>{if(syncThrows)throw new Error('offline');ctx.cloudSyncStatus=syncStatus};
  return ctx.logoutUser().then(()=>({store,toasts,ctx}));
}

{
  const {store,toasts,ctx}=await run({syncStatus:'saved'});
  assert.equal(store.has('boekhouden-user-data-v1-'+USER),false,'ledger removed after confirmed save');
  assert.equal(store.has('boekhouden-user-profile-v1-'+USER),false,'company profile removed after confirmed save');
  assert.equal(store.has('boekhouden-user-data-v1-other'),true,'other accounts on this device are untouched');
  assert.equal(store.get('boekuna-theme'),'dark','device preferences stay');
  assert.deepEqual(toasts,[]);
  assert.equal(ctx.currentUser,null);
}
for(const c of [{syncStatus:'offline'},{syncStatus:'conflict'},{syncStatus:'error'},{syncThrows:true}]){
  const {store,toasts}=await run(c);
  assert.equal(store.has('boekhouden-user-data-v1-'+USER),true,'unsaved work stays on the device: '+JSON.stringify(c));
  assert.match(toasts[0]||'',/Niet alles was opgeslagen/);
}
{
  const {store}=await run({syncStatus:'saved',testMode:true});
  assert.equal(store.has('boekhouden-user-data-v1-'+USER),true,'local test mode keeps its only copy');
}
console.log('Logout local data: PASS');
