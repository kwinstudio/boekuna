import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('kwinest/index.html','utf8');
const swift=fs.readFileSync('ios/Boekuna/WebView.swift','utf8');
const suffix=swift.match(/configuration.applicationNameForUserAgent = "([^"]+)"/)[1].replace(/\\\(version\)/g,'1.0.0');
const detect=html.match(/^function isNativeStoreShell\(\).*$/m)[0];
for(const ua of [suffix,'Boekuna-iOS/1.0.0','BoekunaNative/1.0']){
 const context=vm.createContext({window:{},navigator:{userAgent:ua}});
 vm.runInContext(detect,context);
 assert.equal(vm.runInContext('isNativeStoreShell()',context),true,'native detection: '+ua);
}
for(const ua of ['Mozilla/5.0 Safari/605.1.15','Mozilla/5.0 Chrome/141.0']){
 const context=vm.createContext({window:{},navigator:{userAgent:ua}});vm.runInContext(detect,context);
 assert.equal(vm.runInContext('isNativeStoreShell()',context),false);
}
let requests=0;
const context=vm.createContext({window:{},navigator:{userAgent:suffix},billingBusy:false,toast(){},document:{getElementById(){return null}},fetchWithAuthRetry(){requests++;throw new Error('must not call payments')},console,location:{}});
vm.runInContext(detect+'\n'+html.slice(html.indexOf('async function confirmSubscriptionCheckout('),html.indexOf('async function syncBillingFromStripe(')),context);
await vm.runInContext("confirmSubscriptionCheckout('zzp','month')",context);
await vm.runInContext('openBillingPortal()',context);
assert.equal(requests,0,'native checkout/portal entry points must not request payment endpoints');
assert.deepEqual(fs.readFileSync('ios/Boekuna/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png'),fs.readFileSync('public/assets/boekuna-app-icon-1024.png'),'native icon must equal canonical icon');
console.log('PASS companion user-agent, guarded payment endpoints and canonical icon');
