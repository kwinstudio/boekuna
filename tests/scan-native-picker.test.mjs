import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function triggerInvoiceUpload('),html.indexOf('function safeStorageName('));
for(const mobile of [true,false]){
 let clicks=0,modals=0;
 const input={value:'previous-file',dataset:{},click(){clicks++}};
 const ctx=vm.createContext({document:{getElementById:id=>id==='invoicePdfFile'?input:null},matchMedia:()=>({matches:mobile}),modal:()=>modals++,closeModal(){},pendingUploadKind:''});
 vm.runInContext(source,ctx);
 for(const call of ["openUploadSourcePicker('auto')","triggerInvoiceUpload('purchase')","openDocumentUpload()"]){
  const before=clicks;vm.runInContext(call,ctx);
  assert.equal(clicks,before+1,`${call} opens exactly one native picker, mobile=${mobile}`);
  assert.equal(modals,0,'No extra application source sheet');
  assert.equal(input.value,'','Repeat selection works');
 }
 assert.equal(input.dataset.smartUpload,'true');
}
const input=html.match(/<input[^>]*id="invoicePdfFile"[^>]*>/)[0];
assert.ok(!/capture=/.test(input),'General Scan must offer native camera/library/files choice');
assert.ok(/multiple/.test(input));
for(const type of ['application/pdf','image/jpeg','image/png','image/heic','image/heif'])assert.ok(input.includes(type));
console.log('PASS native Scan picker: synchronous single input, mobile/desktop, multi-upload and types');

// A replacement selection must preserve the original document workflow.
const replaceSource=html.slice(html.indexOf('function chooseAnotherDocumentProcessingItem('),html.indexOf('async function retryDocumentProcessingItem('));
const selectSource=html.slice(html.indexOf('async function startSelectedDocumentUpload('),html.indexOf('async function handleGenericDocuments('));
for(const smart of [true,false]){
 const calls=[],input={id:'invoicePdfFile',value:'',dataset:{},files:[{name:'replacement.pdf'}],click(){}};
 const context=vm.createContext({document:{getElementById:()=>input},closeModal(){},toast(){},pendingUploadKind:'auto',documentProcessingSession:{smart,items:[{id:'failed',sourceInputId:'invoicePdfFile',kind:'purchase'}]},startDocumentProcessingQueue:(files,kind,options)=>calls.push({kind,smart:options.smart})});
 vm.runInContext(source+replaceSource+selectSource,context);
 vm.runInContext("chooseAnotherDocumentProcessingItem('failed')",context);
 await vm.runInContext("startSelectedDocumentUpload(document.getElementById('invoicePdfFile'),document.getElementById('invoicePdfFile').dataset.uploadKind||'auto')",context);
 assert.equal(calls[0].smart,smart,'Replacement keeps smart upload semantics');
 assert.equal(calls[0].kind,'purchase','Replacement keeps requested document kind');
}
console.log('PASS replacement selection preserves workflow and requested kind');
