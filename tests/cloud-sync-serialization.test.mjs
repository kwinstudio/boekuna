import {serveKvkAsset} from './lib/kvk-browser-assets.mjs';
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const original=fs.readFileSync(new URL('../kwinest/index.html',import.meta.url),'utf8');
const financialCorrectionSource=fs.readFileSync(new URL('../public/assets/financial-correction.js',import.meta.url),'utf8');
function replaceLast(source,needle,replacement){
  const i=source.lastIndexOf(needle);
  if(i<0)throw new Error('Missing bootstrap marker: '+needle);
  return source.slice(0,i)+replacement+source.slice(i+needle.length);
}

const bootstrap=String.raw`
currentUser={id:'cloud-sync-test',email:'sync@example.test'};
state=structuredClone(DEFAULT);
state.documents=[{
  id:'doc-sync',
  fileId:'file-sync',
  name:'sync.pdf',
  type:'purchase_invoice',
  date:'2026-09-28',
  linkedType:'expense',
  linkedId:'expense-sync',
  verification:{status:'running'},
  fieldProvenance:{
    gross:{source:'user',confirmed:true,confirmedAt:'2026-09-29T09:00:00.000Z'},
    vatRate:{source:'user',confirmed:true,confirmedAt:'2026-09-29T09:00:00.000Z'},
    net:{source:'calculated',confirmed:false,derivedFrom:['gross','vatRate']},
    vatAmount:{source:'calculated',confirmed:false,derivedFrom:['gross','vatRate']}
  },
  financialCorrectionEvents:[{type:'financial_recalculation_applied',fields:['net','vatAmount'],at:'2026-09-29T09:00:01.000Z'}]
}];
cloudVersion=1;
window.__remote={version:1,state:null};
window.__rpcCalls=[];
window.__sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
getSupabase=async()=>({
  rpc:async(name,args)=>{
    assertCloudRpc(name);
    const snapshot=structuredClone(args.p_state);
    const call=window.__rpcCalls.length+1;
    window.__rpcCalls.push({
      call,
      expected:Number(args.p_expected_version),
      status:snapshot.documents?.[0]?.verification?.status||null
    });
    await window.__sleep(call===1?80:5);
    if(Number(args.p_expected_version)!==Number(window.__remote.version)){
      return {data:null,error:null};
    }
    window.__remote={version:window.__remote.version+1,state:snapshot};
    return {data:window.__remote.version,error:null};
  },
  from:()=>({
    select:()=>({
      eq:()=>({
        maybeSingle:async()=>({
          data:window.__remote.state?{state:structuredClone(window.__remote.state),version:window.__remote.version}:null,
          error:null
        })
      })
    }),
    insert:async row=>{
      window.__remote={version:Number(row.version||1),state:structuredClone(row.state||{})};
      return {error:null};
    }
  })
});
function assertCloudRpc(name){if(name!=='save_ledger_state')throw new Error('Unexpected RPC '+name)}
setBootstrapVisible(false);setProductUiAuthenticated(true);
document.getElementById('authRoot').innerHTML='';
document.getElementById('mainApp').style.display='grid';
`;

let appHtml=replaceLast(original,'initAuth();',bootstrap);

const server=http.createServer((req,res)=>{
  if(serveKvkAsset(req,res))return;
  if(req.url?.startsWith('/assets/financial-correction.js')){res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});return res.end(financialCorrectionSource)}
  if(req.url?.startsWith('/manifest.webmanifest')){
    res.writeHead(200,{'content-type':'application/manifest+json'});
    return res.end('{}');
  }
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(appHtml);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {port}=server.address();

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];
page.on('pageerror',e=>errors.push(String(e)));

try{
  await page.goto(`http://127.0.0.1:${port}/app`,{waitUntil:'domcontentloaded'});

  const result=await page.evaluate(async()=>{
    const waitForFirstRpc=()=>new Promise((resolve,reject)=>{
      const started=Date.now();
      const poll=()=>{
        if(window.__rpcCalls.length>=1)return resolve();
        if(Date.now()-started>2000)return reject(new Error('First cloud RPC did not start'));
        setTimeout(poll,1);
      };
      poll();
    });

    state.documents[0].verification.status='running';
    const first=syncCloudStateNow();
    await waitForFirstRpc();

    // Mimic PASS2 completing while the previous "running" ledger save is still in flight.
    state.documents[0].verification.status='verified';
    const second=syncCloudStateNow();

    await Promise.all([first,second]);
    return {
      localStatus:state.documents[0].verification.status,
      remoteStatus:window.__remote.state?.documents?.[0]?.verification?.status||null,
      remoteVersion:window.__remote.version,
      cloudVersion,
      calls:structuredClone(window.__rpcCalls),
      remoteProvenance:structuredClone(window.__remote.state?.documents?.[0]?.fieldProvenance||{}),
      remoteCorrectionEvents:structuredClone(window.__remote.state?.documents?.[0]?.financialCorrectionEvents||[])
    };
  });

  assert.equal(result.localStatus,'verified','local PASS2 state must stay verified');
  assert.equal(result.remoteStatus,'verified','latest verification state must win in cloud storage');
  assert.equal(result.remoteVersion,3,'two sequential saves should advance the remote version twice');
  assert.equal(result.cloudVersion,3,'client cloud version should track the latest save');
  assert.deepEqual(result.calls,[
    {call:1,expected:1,status:'running'},
    {call:2,expected:2,status:'verified'}
  ],'overlapping save requests must be serialized instead of racing on one expected version');
  assert.equal(result.remoteProvenance.gross?.source,'user','Cloud ledger must preserve user-confirmed provenance');
  assert.equal(result.remoteProvenance.net?.source,'calculated','Cloud ledger must preserve calculated provenance');
  assert.deepEqual(result.remoteCorrectionEvents,[{type:'financial_recalculation_applied',fields:['net','vatAmount'],at:'2026-09-29T09:00:01.000Z'}],'Cloud ledger must preserve factual correction events');
  assert.deepEqual(errors,[],'Browser errors: '+errors.join(' | '));

  console.log('Cloud sync serialization regression: PASS (running -> verified persists without self-conflict)');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
