import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadEdgeFunction} from './lib/edge-harness.mjs';

// Bonnen mailen (Kwin 2026-11-04): the inbound-mail edge function in Node with a fake database,
// fake storage and a fake Resend. Nothing here touches a real service.
const dir=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','supabase','functions','inbound-mail');
const secret='whsec_'+Buffer.from('boekuna-test-signing-secret-32by').toString('base64');
const USER='11111111-1111-4111-8111-111111111111',LOCAL='kwinstudio-3f9a1c7e5b2d';

function fakeDb(vault=null){
 const tables={documents:[],inbound_mail_events:[]},storage=new Map(),calls=[];
 const targets={[LOCAL]:{user_id:USER,entitled:true,company_context:{name:'Kwin Studio',kvk:'12345678'}},'startplan-aaaaaaaaaaaa':{user_id:'22222222-2222-4222-8222-222222222222',entitled:false,company_context:{}}};
 function builder(name){
  const f=[];let head=false,count=false;
  const q={
   select(_c,opts){if(opts?.count)count=true;if(opts?.head)head=true;return q},
   eq(c,v){f.push(r=>r[c]===v);return q},
   gte(c,v){f.push(r=>String(r[c])>=String(v));return q},
   maybeSingle(){q.single=true;return q},
   then(res){const hit=tables[name].filter(r=>f.every(x=>x(r)));res(count?{count:hit.length,data:head?null:hit,error:null}:{data:q.single?(hit[0]||null):hit,error:null})}
  };
  return q;
 }
 const client={
  from:name=>({
   ...builder(name),
   select:(...args)=>builder(name).select(...args),
   insert:async row=>{
    calls.push(['insert',name,row]);
    if(name==='inbound_mail_events'&&tables[name].some(r=>r.email_id===row.email_id&&r.local_part===row.local_part))return {error:{code:'23505'}};
    if(name==='documents'&&tables[name].some(r=>r.user_id===row.user_id&&r.client_ref===row.client_ref))return {error:{code:'23505'}};
    tables[name].push({id:crypto.randomUUID(),created_at:new Date().toISOString(),...row});return {error:null}
   },
   update:patch=>{const f=[];const u={eq(c,v){f.push(r=>r[c]===v);return u},then(res){tables[name].filter(r=>f.every(x=>x(r))).forEach(r=>Object.assign(r,patch));res({error:null})}};return u}
  }),
  rpc:async(fn,args)=>{calls.push(['rpc',fn,args]);if(fn==='inbound_mail_secrets')return {data:vault?[vault]:[],error:null};assert.equal(fn,'inbound_mail_target');const t=targets[args.p_local_part];return {data:t?[t]:[],error:null}},
  storage:{from:bucket=>({
   upload:async(p,bytes,opts)=>{assert.equal(bucket,'kwinest-documents');storage.set(p,{bytes,opts});return {error:null}},
   remove:async ps=>{ps.forEach(p=>storage.delete(p));return {error:null}}
  })}
 };
 return {tables,storage,calls,supabase:{createClient:(url,key)=>{assert.equal(key,'service-key');return client}}};
}

const pdf=Buffer.from('%PDF-1.4 bon');
const photo=Buffer.alloc(120*1024,7);
const ATTACHMENTS=[
 {id:'att-pdf',filename:'Factuur Bol.com 2026-11.pdf',content_type:'application/pdf',content_disposition:'attachment',size:pdf.length,download_url:'https://inbound-cdn.resend.test/att-pdf'},
 {id:'att-logo',filename:'logo.png',content_type:'image/png',content_disposition:'inline',size:4000,download_url:'https://inbound-cdn.resend.test/att-logo'},
 {id:'att-photo',filename:'IMG_2041.HEIC',content_type:'application/octet-stream',content_disposition:'inline',size:photo.length,download_url:'https://inbound-cdn.resend.test/att-photo'},
 {id:'att-zip',filename:'stukken.zip',content_type:'application/zip',content_disposition:'attachment',size:900,download_url:'https://inbound-cdn.resend.test/att-zip'}
];
function fakeFetch(){
 const calls=[];
 return {calls,fetchImpl:async(url,init={})=>{
  const u=String(url);calls.push(u);
  if(u.startsWith('https://api.resend.test/emails/receiving/')){
   assert.equal(init.headers?.Authorization,'Bearer re_test');
   const id=decodeURIComponent(u.split('/')[5]);
   return new Response(JSON.stringify({object:'list',data:id==='mail-empty'?[ATTACHMENTS[1]]:ATTACHMENTS}),{status:200});
  }
  if(u==='https://inbound-cdn.resend.test/att-pdf')return new Response(pdf);
  if(u==='https://inbound-cdn.resend.test/att-photo')return new Response(photo);
  throw new Error('unexpected fetch '+u);
 }};
}
function sign(body,{id='msg_1',ts=Math.floor(Date.now()/1000),key=secret}={}){
 const sig=crypto.createHmac('sha256',Buffer.from(key.replace(/^whsec_/,''),'base64')).update(`${id}.${ts}.${body}`).digest('base64');
 return {'svix-id':id,'svix-timestamp':String(ts),'svix-signature':'v1,'+sig};
}
function received(id,to,extra={}){return JSON.stringify({type:'email.received',created_at:'2026-11-04T14:00:00.000Z',data:{email_id:id,created_at:'2026-11-04T14:00:00.000Z',from:'orders@bol.example',to,cc:[],subject:'Je factuur',attachments:[],...extra}})}
async function load(){
 const db=fakeDb(),net=fakeFetch();
 const handler=await loadEdgeFunction(dir,{env:{SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'service-key',RESEND_API_KEY:'re_test',RESEND_INBOUND_WEBHOOK_SECRET:secret,RESEND_API_URL:'https://api.resend.test'},supabase:db.supabase,fetchImpl:net.fetchImpl});
 const post=(body,headers=sign(body))=>handler(new Request('https://fn.test/inbound-mail',{method:'POST',headers,body}));
 return {db,net,post};
}
const json=r=>r.json();

{
 const {db,net,post}=await load();
 // Unsigned, wrongly signed or stale webhooks are refused before anything is read.
 const body=received('mail-1',[LOCAL+'@bon.boekuna.nl']);
 assert.equal((await post(body,{})).status,401);
 assert.equal((await post(body,sign(body,{key:'whsec_'+Buffer.from('another-secret-another-secret-32').toString('base64')}))).status,401);
 assert.equal((await post(body,sign(body,{ts:Math.floor(Date.now()/1000)-3600}))).status,401,'Replay outside five minutes');
 assert.equal((await post(body.replace('Je factuur','Andere'),sign(body))).status,401,'Body changed after signing');
 assert.equal(net.calls.length,0);assert.equal(db.tables.documents.length,0);

 // A forwarded mail with a PDF, a signature logo and an iPhone photo: two documents, ready for processing.
 const res=await post(body);assert.equal(res.status,200);
 assert.deepEqual((await json(res)).outcomes,['stored']);
 const docs=db.tables.documents;
 assert.deepEqual(docs.map(d=>d.name),['Factuur Bol.com 2026-11.pdf','IMG_2041.HEIC'],'The logo and the zip are left out');
 assert.ok(docs.every(d=>d.user_id===USER&&d.kind==='document'&&d.client_ref.startsWith('mail-mail-1-')));
 assert.deepEqual(docs.map(d=>d.mime_type),['application/pdf','image/heic']);
 assert.equal(docs[0].storage_path,USER+'/mail-mail-1-att-pdf-Factuur-Bol.com-2026-11.pdf','Same bucket layout as an upload from the app');
 const meta=docs[0].metadata;
 assert.equal(meta.processing,true,'The app’s resume turns it into a processing job');
 assert.equal(meta.source,'mail');assert.equal(meta.requested_kind,'auto');assert.equal(meta.batch_id,'mail-mail-1');assert.equal(meta.size,pdf.length);
 assert.deepEqual(meta.mail,{from:'orders@bol.example',subject:'Je factuur',received_at:'2026-11-04T14:00:00.000Z'});
 assert.deepEqual(meta.company_context,{name:'Kwin Studio',tradeName:'',kvk:'12345678',vat:''});
 assert.equal(db.storage.size,2);assert.equal(db.storage.get(docs[0].storage_path).opts.contentType,'application/pdf');
 assert.deepEqual(db.tables.inbound_mail_events.map(e=>[e.outcome,e.files,e.user_id]),[['stored',2,USER]]);

 // Resend retries the same delivery: nothing doubles.
 const again=await post(body,sign(body,{id:'msg_2'}));
 assert.deepEqual((await json(again)).outcomes,['duplicate']);assert.equal(db.tables.documents.length,2);

 // Unknown address, Start plan, a mail without a receipt and an address on another domain.
 assert.deepEqual((await json(await post(received('mail-2',['iemand-anders123@bon.boekuna.nl'])))).outcomes,['unknown_address']);
 assert.deepEqual((await json(await post(received('mail-3',['startplan-aaaaaaaaaaaa@bon.boekuna.nl'])))).outcomes,['not_entitled']);
 assert.deepEqual((await json(await post(received('mail-empty',[LOCAL+'@bon.boekuna.nl'])))).outcomes,['no_files']);
 assert.deepEqual((await json(await post(received('mail-4',[LOCAL+'@boekuna.nl'])))).outcomes,[],'Only the inbound domain counts');
 // Auto-forward from Gmail: the original To stays, the forward address is in received_for; +tags are fine.
 assert.deepEqual((await json(await post(received('mail-5',['kwin@gmail.example'],{received_for:[LOCAL.toUpperCase()+'+bonnen@bon.boekuna.nl']})))).outcomes,['stored']);
 assert.equal(db.tables.documents.length,4);
 assert.equal((await post(JSON.stringify({type:'email.sent',data:{email_id:'x'}}))).status,200,'Other events are ignored');
 assert.ok(!db.calls.some(c=>c[0]==='rpc'&&c[2].p_local_part==='kwin'),'Never looks up a sender');
}
{
 // Thirty stored mails a day per account; the next one waits.
 const {db,post}=await load();
 for(let i=0;i<30;i++)db.tables.inbound_mail_events.push({id:'e'+i,email_id:'old-'+i,local_part:LOCAL,user_id:USER,outcome:'stored',files:1,created_at:new Date().toISOString()});
 assert.deepEqual((await json(await post(received('mail-6',[LOCAL+'@bon.boekuna.nl'])))).outcomes,['limited']);
 assert.equal(db.tables.documents.length,0);
}
{
 // Resend down: the webhook gets a 500 so it is delivered again later, and that retry succeeds.
 const db=fakeDb();let down=true;
 const handler=await loadEdgeFunction(dir,{env:{SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'service-key',RESEND_API_KEY:'re_test',RESEND_INBOUND_WEBHOOK_SECRET:secret,RESEND_API_URL:'https://api.resend.test'},supabase:db.supabase,fetchImpl:async(url)=>{
  if(down)return new Response('{}',{status:503});
  if(String(url).includes('/attachments'))return new Response(JSON.stringify({data:[ATTACHMENTS[0]]}));
  return new Response(pdf);
 }});
 const body=received('mail-7',[LOCAL+'@bon.boekuna.nl']);
 const first=await handler(new Request('https://fn.test',{method:'POST',headers:sign(body),body}));
 assert.equal(first.status,500);assert.equal(db.tables.inbound_mail_events[0].outcome,'failed');
 down=false;
 const second=await handler(new Request('https://fn.test',{method:'POST',headers:sign(body,{id:'msg_retry'}),body}));
 assert.equal(second.status,200);assert.equal(db.tables.documents.length,1);assert.equal(db.tables.inbound_mail_events[0].outcome,'stored');
}
{
 // No edge secrets: the Resend key and the signing secret come from Supabase Vault, read once.
 const db=fakeDb({resend_api_key:'re_test',webhook_secret:secret}),net=fakeFetch();
 const handler=await loadEdgeFunction(dir,{env:{SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'service-key',RESEND_API_URL:'https://api.resend.test'},supabase:db.supabase,fetchImpl:net.fetchImpl});
 const body=received('mail-8',[LOCAL+'@bon.boekuna.nl']);
 assert.equal((await handler(new Request('https://fn.test',{method:'POST',headers:sign(body,{key:'whsec_'+Buffer.from('another-secret-another-secret-32').toString('base64')}),body}))).status,401,'The Vault secret is the one that counts');
 const ok=await handler(new Request('https://fn.test',{method:'POST',headers:sign(body),body}));
 assert.deepEqual((await json(ok)).outcomes,['stored']);assert.equal(db.tables.documents.length,2);
 assert.equal(db.calls.filter(c=>c[1]==='inbound_mail_secrets').length,1,'Read once, then kept');
}
{
 // Vault empty too: still not configured.
 const db=fakeDb({resend_api_key:'re_test',webhook_secret:''});
 const handler=await loadEdgeFunction(dir,{env:{SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'service-key'},supabase:db.supabase,fetchImpl:async()=>{throw new Error('no network')}});
 assert.equal((await handler(new Request('https://fn.test',{method:'POST',body:'{}'}))).status,503);
}
{
 // Not configured: refuse instead of half-working.
 const db=fakeDb();
 const handler=await loadEdgeFunction(dir,{env:{SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'service-key'},supabase:db.supabase,fetchImpl:async()=>{throw new Error('no network')}});
 assert.equal((await handler(new Request('https://fn.test',{method:'POST',body:'{}'}))).status,503);
}
console.log('Inbound mail function: signature, address lookup, attachments, replay, limits and retry: PASS');
