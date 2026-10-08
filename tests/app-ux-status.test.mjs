import assert from 'node:assert/strict';
import vm from 'node:vm';
import {appSource,declaration} from './production-code.mjs';
function element(){let value='';return {get className(){return value},set className(v){value=v},textContent:'',title:'',classList:{add(c){value+=' '+c},toggle(c,on){value=value.split(' ').filter(x=>x!==c).join(' ')+(on?' '+c:'')},contains(c){return value.split(' ').includes(c)}}}}
const badge=element(),retry=element(),timers=[];let writes=0,conflicts=0;
const ctx=vm.createContext({TEST_MODE_NO_AUTH:false,document:{getElementById:id=>id==='cloudSyncBadge'?badge:retry},setTimeout:(fn,ms)=>{assert.equal(ms,3000);timers.push(fn);return timers.length},clearTimeout:()=>{},syncCloudStateNow:async()=>{writes++},restoreConflictDialog:()=>{conflicts++},toast:()=>{}});
vm.runInContext('let cloudStatusHideTimer=null,cloudSyncStatus="saved";'+declaration(appSource,'setCloudSyncStatus')+'\n'+declaration(appSource,'retryCloudSave'),ctx);
ctx.setCloudSyncStatus('saving');assert.equal(badge.textContent,'Opslaan…');assert.ok(retry.classList.contains('hidden'));
ctx.setCloudSyncStatus('saved');assert.equal(badge.textContent,'Opgeslagen ✓');timers.at(-1)();assert.ok(badge.classList.contains('hidden'));
for(const status of ['offline','error','conflict']){ctx.setCloudSyncStatus(status);assert.equal(badge.textContent,'Niet opgeslagen');assert.ok(!retry.classList.contains('hidden'));timers.at(-1)();assert.ok(!badge.classList.contains('hidden'),'Old success timer cannot hide a failure');}
await ctx.retryCloudSave();assert.equal(conflicts,1);assert.equal(writes,0,'Conflict retry must preserve the choice of version');
ctx.setCloudSyncStatus('error');await ctx.retryCloudSave();assert.equal(writes,1,'Retry uses the existing serialized sync');
console.log('App storage status and conflict-safe retry: PASS');

// Bonnetjes: a review message never shows the processor's own field names.
{
  const c=vm.createContext({});vm.runInContext(declaration(appSource,'documentReviewMessage')+';this.f=documentReviewMessage',c);
  assert.equal(c.f({review_message:'Controleer documentType, supplierName, subtotal, vatTotal, total, documentgegevens, totaal, btw-bedrag.'}),'Controleer documenttype, leverancier, bedrag excl. btw, btw-bedrag en totaal.');
  assert.equal(c.f({review_fields:['party','gross','vatAmount','total'],review_message:'x'}),'Controleer leverancier, totaal en btw-bedrag.');
  assert.equal(c.f({review_fields:['documentType'],review_message:'Controleer het documenttype. Dit document kan niet automatisch worden geboekt.'}),'Controleer het documenttype. Dit document kan niet automatisch worden geboekt.');
  assert.equal(c.f({}),'Controleer de gemarkeerde gegevens.');
  console.log('Review message in plain words: PASS');
}
// A home-screen app reloads itself for a new version, only when nothing is open and never for scripts it added itself.
{
  const page='<script src="/assets/a.js?v=1"></script><link href="/assets/b.css?v=2">';
  for(const [online,busy,expected] of [[page,false,0],[page.replace('v=1','v=3'),false,1],[page.replace('v=1','v=3'),true,0]]){
    let reloaded=0;
    const c=vm.createContext({TEST_MODE_NO_AUTH:false,Date,document:{visibilityState:'visible',documentElement:{outerHTML:page+'<script src="/assets/lazy.js?v=7">'},activeElement:null,querySelector:()=>busy?{}:null},location:{pathname:'/',reload(){reloaded++}},fetch:async()=>({ok:true,text:async()=>online}),cloudSyncStatus:'saved',pendingPdfImport:null});
    vm.runInContext('let appBuildCheckAt=0;'+declaration(appSource,'appBuildSignature')+declaration(appSource,'appBusyForReload')+declaration(appSource,'checkForNewAppBuild')+';this.c=checkForNewAppBuild',c);
    await c.c();assert.equal(reloaded,expected);
  }
  console.log('Reload for a new app version: PASS');
}
