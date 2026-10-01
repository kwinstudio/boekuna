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
