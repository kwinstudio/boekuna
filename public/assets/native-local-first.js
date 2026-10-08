// BOEKUNA iPhone local-first bridge (web side).
// Active only inside the iOS app when that build has local-first switched on
// (native flag BOEKUNA_LOCAL_FIRST, default off). Everywhere else this is a no-op.
// Rollback without an app update: set DISABLED to true and deploy the web app.
// The bridge never decides about money: scans and offline drafts go through the
// existing upload, server processing and review like any other document.
(function(){
 'use strict';
 const DISABLED=false;
 const MAX_BYTES=15*1024*1024;
 let capabilitiesPromise=null;

 function handler(){
  if(DISABLED)return null;
  try{
   const h=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.boekunaNative;
   return h&&window.BoekunaNativeLocalFirst&&window.BoekunaNativeLocalFirst.version===1?h:null;
  }catch(e){return null}
 }
 function nativeError(code){const e=new Error(String(code||'NATIVE_FAILED'));e.code=String(code||'NATIVE_FAILED');return e}
 async function call(action,payload){
  const h=handler();if(!h)throw nativeError('NATIVE_UNAVAILABLE');
  try{return await h.postMessage(Object.assign({action},payload||{}))}catch(e){throw nativeError(e&&e.message||e)}
 }
 function fileToBase64(file){
  return new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>{const s=String(reader.result||''),i=s.indexOf(',');resolve(i>=0?s.slice(i+1):'')};
   reader.onerror=()=>reject(nativeError('FILE_READ_FAILED'));
   reader.readAsDataURL(file);
  });
 }
 function base64ToFile(base64,name,type){
  const bin=atob(String(base64||'')),bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return new File([bytes],name||'document',{type:type||'application/octet-stream'});
 }

 const api={
  available(){return !!handler()},
  capabilities(){
   if(!handler())return Promise.resolve(null);
   if(!capabilitiesPromise)capabilitiesPromise=call('capabilities').catch(()=>null);
   return capabilitiesPromise;
  },
  // Returns a PDF File, or null when the user cancels.
  async scan(){
   const r=await call('scan');
   if(!r||r.cancelled)return null;
   return base64ToFile(r.base64,r.name||'Scan.pdf',r.mimeType||'application/pdf');
  },
  // Text read on the iPhone. Unconfirmed: never used as financial values.
  async ocr(file){
   if(!file||file.size>MAX_BYTES)throw nativeError('DOCUMENT_TOO_LARGE');
   return call('ocr',{base64:await fileToBase64(file),mimeType:file.type||'',name:file.name||'document'});
  },
  // clientRef: only for an upload that was interrupted halfway, so the retry reuses it.
  async saveDraft(userId,file,kind,clientRef){
   if(!userId)throw nativeError('NO_ACCOUNT');
   if(!file||file.size>MAX_BYTES)throw nativeError('DOCUMENT_TOO_LARGE');
   return call('draftSave',{userId:String(userId),base64:await fileToBase64(file),mimeType:file.type||'',name:file.name||'document',kind:kind||'auto',clientRef:clientRef?String(clientRef):''});
  },
  async listDrafts(userId){if(!userId||!handler())return [];const r=await call('draftList',{userId:String(userId)});return Array.isArray(r)?r:[]},
  async readDraft(userId,id){const r=await call('draftRead',{userId:String(userId),id:String(id)});return {meta:r.meta,file:base64ToFile(r.base64,r.meta&&r.meta.name,r.meta&&r.meta.mimeType)}},
  async draftText(userId,id){const r=await call('draftText',{userId:String(userId),id:String(id)});return String(r&&r.text||'')},
  markAttempt(userId,id,error){return call('draftAttempt',{userId:String(userId),id:String(id),error:String(error||'')})},
  deleteDraft(userId,id){return call('draftDelete',{userId:String(userId),id:String(id)})},
  clearDrafts(userId){if(!userId||!handler())return Promise.resolve(null);return call('draftClear',{userId:String(userId)})},
  // Exponential backoff after failed sends: 30 s, 1, 2, 4 … minutes, at most 30 minutes.
  retryDue(meta,now){
   const attempts=Number(meta&&meta.attempts||0);if(!attempts)return true;
   const last=Date.parse(meta&&meta.updatedAt||'')||0,wait=Math.min(30*60e3,30e3*Math.pow(2,attempts-1));
   return (now||Date.now())-last>=wait;
  },
  _base64ToFile:base64ToFile
 };
 window.BoekunaLocalFirst=api;
})();
