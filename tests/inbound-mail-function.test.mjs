import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as pdfLib from 'pdf-lib';
import {loadEdgeFunction} from './lib/edge-harness.mjs';

// Bonnen mailen (Kwin 2026-11-04): the inbound-mail edge function in Node with a fake database,
// fake storage and a fake Resend. Nothing here touches a real service.
const dir=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','supabase','functions','inbound-mail');
const secret='whsec_'+Buffer.from('boekuna-test-signing-secret-32by').toString('base64');
const USER='11111111-1111-4111-8111-111111111111',LOCAL='kwinstudio-3f9a1c7e5b2d';

// legacy: the database before migration 20261105140000 (no detail column, no forward_confirm outcome).
function fakeDb(vault=null,{legacy=false}={}){
 const tables={documents:[],inbound_mail_events:[],document_processing_jobs:[]},storage=new Map(),calls=[];
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
    if(name==='document_processing_jobs'&&tables[name].some(r=>r.user_id===row.user_id&&r.document_id===row.document_id))return {error:{code:'23505'}};
    tables[name].push({id:crypto.randomUUID(),created_at:new Date().toISOString(),...row});return {error:null}
   },
   update:patch=>{const f=[];const u={eq(c,v){f.push(r=>r[c]===v);return u},then(res){if(legacy&&name==='inbound_mail_events'&&('detail' in patch||patch.outcome==='forward_confirm'))return res({error:{code:'PGRST204',message:'detail'}});tables[name].filter(r=>f.every(x=>x(r))).forEach(r=>Object.assign(r,patch));res({error:null})}};return u}
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
// The mails themselves, for the ones without a usable attachment.
// A Klarna payment forwarded from Gmail (shape of Kwin's mail of 2026-11-06, without his details).
const KLARNA_FWD=['--------- Doorgestuurd bericht --------','Van: Klarna <noreply-nl@klarna.nl>','Datum: wo 4 nov 2026 om 16:53','Onderwerp: We hebben je betaling aan winparts.nl ontvangen','Aan: <kwin.test@gmail.example>','','','Je betaling van € 43,63 is geslaagd.','[image: Klarna]','<https://click.klarna.example/a>','','Samenvatting','','','winparts.nl','------------------------------','','Besteldatum','','29 september 2026','------------------------------','','Betaald','','€ 43,63','------------------------------','','Nog te betalen','','€ 0,00','------------------------------','','Remblokken set','','€ 35,49','------------------------------','','Verzending','','€ 6,99','------------------------------','','Totaal','','€ 43,63','','Klarna Bank AB (publ)','Sveavägen 46','BTW reg. nr: SE556737043101'].join('\n');
const MAILS={
 'mail-empty':{from:'kwin@gmail.example',subject:'test',text:'test\n\nVerstuurd vanaf mijn iPhone',html:'<p>test</p>'},
 'mail-html':{from:'Bol <orders@bol.example>',subject:'Je bestelling 1234',text:'',html:'<html><head><style>td{color:red}</style><title>x</title></head><body><h1>Bedankt voor je bestelling</h1><table><tr><td>USB-C kabel</td><td>&euro;&nbsp;19,99</td></tr><tr><td>Verzending</td><td>&#8364; 4,00</td></tr><tr><th>Totaal</th><th>€ 23,99</th></tr></table><p>Btw 21%: € 4,16<br>Ordernummer: 1234 · Café “De Hoek” 🎉</p><p>'+'x'.repeat(3000)+'</p></body></html>'},
 'mail-gmail':{from:'Gmail Team <forwarding-noreply@google.com>',subject:'(#481516234) Gmail Forwarding Confirmation - Receive Mail from Kwin.Test@gmail.example',text:'kwin.test@gmail.example has requested to automatically forward mail to your email address.\nConfirmation code: 481516234\n\nTo allow, please click the link below to confirm the request:\n\nhttps://mail-settings.google.com/mail/vf-%5BANGjdJ8abc%5D-xyz\n\nIf you click the link and it appears to be broken...',html:''},
 'mail-fake-gmail':{from:'forwarding-noreply@google.com',subject:'(#999999999) Gmail Forwarding Confirmation',text:'Click https://evil.example/mail/vf-steal to confirm',html:'<a href="https://evil.example/x">confirm</a>'},
 'mail-fwd':{from:'kwin.test@gmail.example',subject:'Fwd: We hebben je betaling aan winparts.nl ontvangen',text:KLARNA_FWD,html:''}
};
function fakeFetch(){
 const calls=[];
 return {calls,fetchImpl:async(url,init={})=>{
  const u=String(url);calls.push(u);
  if(u.startsWith('https://api.resend.test/emails/receiving/')){
   assert.equal(init.headers?.Authorization,'Bearer re_test');
   const id=decodeURIComponent(u.split('/')[5]);
   if(!u.endsWith('/attachments')){assert.ok(MAILS[id],'Only a mail without a usable file is read: '+id);return new Response(JSON.stringify({object:'email',id,...MAILS[id]}),{status:200})}
   return new Response(JSON.stringify({object:'list',data:MAILS[id]?[ATTACHMENTS[1]]:ATTACHMENTS}),{status:200});
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
async function load(opts={}){
 const db=fakeDb(null,opts),net=fakeFetch();
 const handler=await loadEdgeFunction(dir,{env:{SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'service-key',RESEND_API_KEY:'re_test',RESEND_INBOUND_WEBHOOK_SECRET:secret,RESEND_API_URL:'https://api.resend.test'},supabase:db.supabase,fetchImpl:net.fetchImpl,pdfLib});
 const post=(body,headers=sign(body))=>handler(new Request('https://fn.test/inbound-mail',{method:'POST',headers,body}));
 return {db,net,post,fn:handler.exports};
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
 assert.equal(meta.processing,true,'If the job below is lost, the app’s resume makes it from this');
 assert.equal(meta.source,'mail');assert.equal(meta.requested_kind,'auto');assert.equal(meta.batch_id,'mail-mail-1');assert.equal(meta.size,pdf.length);
 assert.deepEqual(meta.mail,{from:'orders@bol.example',subject:'Je factuur',received_at:'2026-11-04T14:00:00.000Z'});
 assert.deepEqual(meta.company_context,{name:'Kwin Studio',tradeName:'',kvk:'12345678',vat:''});
 assert.equal(db.storage.size,2);assert.equal(db.storage.get(docs[0].storage_path).opts.contentType,'application/pdf');
 assert.deepEqual(db.tables.inbound_mail_events.map(e=>[e.outcome,e.files,e.user_id,e.detail?.subject]),[['stored',2,USER,'Je factuur']]);
 // The processing job is queued right away, so an open app starts reading the bon at once.
 const jobs=db.tables.document_processing_jobs;
 assert.deepEqual(jobs.map(j=>[j.client_ref,j.state,j.phase,j.execution_mode,j.requested_kind,j.batch_id]),docs.map(d=>[d.client_ref,'queued','queued','legacy','auto','mail-mail-1']));
 assert.deepEqual(jobs.map(j=>j.document_id),docs.map(d=>d.id));
 assert.deepEqual(jobs[0].company_context,{name:'Kwin Studio',tradeName:'',kvk:'12345678',vat:''});assert.equal(jobs[0].size_bytes,pdf.length);assert.equal(jobs[0].file_name,'Factuur Bol.com 2026-11.pdf');

 // Resend retries the same delivery: nothing doubles.
 const again=await post(body,sign(body,{id:'msg_2'}));
 assert.deepEqual((await json(again)).outcomes,['duplicate']);assert.equal(db.tables.documents.length,2);assert.equal(db.tables.document_processing_jobs.length,2);

 // Unknown address, Start plan, a mail without a receipt and an address on another domain.
 assert.deepEqual((await json(await post(received('mail-2',['iemand-anders123@bon.boekuna.nl'])))).outcomes,['unknown_address']);
 assert.deepEqual((await json(await post(received('mail-3',['startplan-aaaaaaaaaaaa@bon.boekuna.nl'])))).outcomes,['not_entitled']);
 assert.deepEqual((await json(await post(received('mail-empty',[LOCAL+'@bon.boekuna.nl'],{subject:'test'})))).outcomes,['no_files'],'"test" without a file is no bon');
 assert.deepEqual(db.tables.inbound_mail_events.find(e=>e.email_id==='mail-empty').detail,{subject:'test'},'The app can say which mail had no bon');
 assert.deepEqual((await json(await post(received('mail-4',[LOCAL+'@boekuna.nl'])))).outcomes,[],'Only the inbound domain counts');
 // Auto-forward from Gmail: the original To stays, the forward address is in received_for; +tags are fine.
 assert.deepEqual((await json(await post(received('mail-5',['kwin@gmail.example'],{received_for:[LOCAL.toUpperCase()+'+bonnen@bon.boekuna.nl']})))).outcomes,['stored']);
 assert.equal(db.tables.documents.length,4);assert.equal(db.tables.document_processing_jobs.length,4);
 assert.equal((await post(JSON.stringify({type:'email.sent',data:{email_id:'x'}}))).status,200,'Other events are ignored');
 assert.ok(!db.calls.some(c=>c[0]==='rpc'&&c[2].p_local_part==='kwin'),'Never looks up a sender');
}
{
 // Proven logic (Dext, Expensify, Moneybird): a mail without a pdf or photo whose text is the receipt
 // becomes a pdf of that mail, processed like any other bon.
 const {db,post}=await load();
 const res=await post(received('mail-html',[LOCAL+'@bon.boekuna.nl'],{from:'Bol <orders@bol.example>',subject:'Je bestelling 1234'}));
 assert.deepEqual((await json(res)).outcomes,['stored_text']);
 const [doc]=db.tables.documents;
 assert.equal(doc.name,'Je bestelling 1234.pdf');assert.equal(doc.mime_type,'application/pdf');assert.equal(doc.client_ref,'mail-mail-html-tekst');
 assert.equal(doc.metadata.mail.body,true);assert.equal(doc.metadata.source,'mail');assert.equal(doc.metadata.processing,true);
 const bytes=db.storage.get(doc.storage_path).bytes;
 assert.equal(Buffer.from(bytes.slice(0,5)).toString(),'%PDF-');assert.equal(doc.metadata.size,bytes.byteLength);
 const parsed=await pdfLib.PDFDocument.load(bytes);
 assert.ok(parsed.getPageCount()>=1&&parsed.getPageCount()<=6);assert.equal(parsed.getTitle(),'Je bestelling 1234');
 assert.deepEqual(db.tables.document_processing_jobs.map(j=>[j.client_ref,j.state,j.mime_type]),[['mail-mail-html-tekst','queued','application/pdf']]);
 const ev=db.tables.inbound_mail_events[0];assert.deepEqual([ev.outcome,ev.files,ev.detail],['stored',1,{subject:'Je bestelling 1234',from_text:'1'}]);
 // Replayed: still one document and one job.
 const again=received('mail-html',[LOCAL+'@bon.boekuna.nl']);
 assert.deepEqual((await json(await post(again,sign(again,{id:'msg_html_2'})))).outcomes,['duplicate']);
 assert.equal(db.tables.documents.length,1);assert.equal(db.tables.document_processing_jobs.length,1);

 // Gmail's forwarding check: code, Google's link and the Gmail account go to the app; no bon.
 const g=await post(received('mail-gmail',[LOCAL+'@bon.boekuna.nl'],{from:'Gmail Team <forwarding-noreply@google.com>',subject:MAILS['mail-gmail'].subject}));
 assert.deepEqual((await json(g)).outcomes,['forward_confirm']);
 const ge=db.tables.inbound_mail_events.find(e=>e.email_id==='mail-gmail');
 assert.equal(ge.outcome,'forward_confirm');assert.equal(ge.user_id,USER);
 assert.equal(ge.detail.code,'481516234');assert.equal(ge.detail.link,'https://mail-settings.google.com/mail/vf-%5BANGjdJ8abc%5D-xyz');assert.equal(ge.detail.account,'kwin.test@gmail.example');
 assert.equal(db.tables.documents.length,1,'A Gmail check is never a bon');
 // A look-alike with someone else's link keeps the code but never the link.
 await post(received('mail-fake-gmail',[LOCAL+'@bon.boekuna.nl'],{from:'forwarding-noreply@google.com',subject:MAILS['mail-fake-gmail'].subject}));
 const fe=db.tables.inbound_mail_events.find(e=>e.email_id==='mail-fake-gmail');
 assert.equal(fe.outcome,'forward_confirm');assert.equal(fe.detail.code,'999999999');assert.equal(fe.detail.link,'');
}
{
 // Before migration 20261105140000: the outcome is still kept, without the detail.
 const {db,post}=await load({legacy:true});
 assert.deepEqual((await json(await post(received('mail-gmail',[LOCAL+'@bon.boekuna.nl'],{subject:MAILS['mail-gmail'].subject})))).outcomes,['forward_confirm']);
 assert.deepEqual((await json(await post(received('mail-l1',[LOCAL+'@bon.boekuna.nl'])))).outcomes,['stored']);
 assert.deepEqual(db.tables.inbound_mail_events.map(e=>[e.email_id,e.outcome,e.user_id,'detail' in e]),[['mail-gmail','no_files',USER,false],['mail-l1','stored',USER,false]]);
}
{
 // The pieces on their own.
 const {fn}=await load();
 assert.equal(fn.htmlText('<style>p{}</style><p>A&nbsp;&amp;&#x20AC;&#8364;&euro;&eacute;</p><table><tr><td>Kabel</td><td>€ 1,00</td></tr></table><!-- x --><br>&bogus;'),'A &€€€é\nKabel € 1,00\n\n&bogus;');
 assert.ok(fn.looksLikeReceipt('Totaal: 12,50'));assert.ok(fn.looksLikeReceipt('Bedrag EUR 9'));assert.ok(fn.looksLikeReceipt('€ 4,16'));
 assert.ok(!fn.looksLikeReceipt('test'));assert.ok(!fn.looksLikeReceipt('Zie bijlage. Groet, Kwin'));assert.ok(!fn.looksLikeReceipt('Bel me op 06 12345678'));
 assert.equal(fn.mailText({text:'Totaal € 5,00',html:'<p>other</p>'}),'Totaal € 5,00','Plain text wins when it holds the amounts');
 assert.equal(fn.mailText({text:'Bekijk deze mail in je browser',html:'<p>Totaal</p><p>€ 5,00</p>'}),'Totaal\n€ 5,00','Otherwise the html');
 assert.equal(fn.pdfText('Łódź → ok 🎉 ‑'),'Lódz -> ok ? -');
 assert.equal(fn.gmailForwardConfirm({from:'shop@example.com',subject:'Je bon'},{text:'https://mail.google.com/mail/vf-x'}),null,'Only Gmail’s own check');
 // A huge mail without spaces still makes a small pdf quickly.
 const t0=Date.now(),big=await fn.mailPdf({subject:'Groot',from:'a@b.example',created_at:'2026-11-05'},'€ 1,00 '+'y'.repeat(30000)+'\n'+'regel\n'.repeat(4000));
 const doc=await pdfLib.PDFDocument.load(big);assert.ok(doc.getPageCount()<=6);assert.ok(Date.now()-t0<5000,'fast enough');
}
{
 // Forwarded mails (Kwin 2026-11-06): the shop is the supplier, never whoever forwarded the mail, and
 // a label and its amount on separate lines become one line, so the processor reads the total.
 const {db,fn,post}=await load();
 const f=fn.forwarded(KLARNA_FWD);
 assert.deepEqual([f.from,f.date,f.subject],['Klarna <noreply-nl@klarna.nl>','wo 4 nov 2026 om 16:53','We hebben je betaling aan winparts.nl ontvangen']);
 assert.ok(f.body.startsWith('Je betaling van € 43,63 is geslaagd.'),'Only the text below the forwarded header');
 const apple=fn.forwarded('Kijk even\n\nBegin forwarded message:\n\nFrom: Shop <a@shop.example>\nSubject: Your order\nDate: November 4, 2026 at 16:53:00 GMT+1\nTo: Me <me@icloud.example>\n\nTotal € 5,00');
 assert.deepEqual([apple.from,apple.subject,apple.body],['Shop <a@shop.example>','Your order','Total € 5,00']);
 const outlook=fn.forwarded('________________________________\nVan: Shop BV <f@shop.example>\nVerzonden: dinsdag 3 november 2026 10:00\nAan: Kwin\nOnderwerp: Factuur 12\n\nTotaal € 5,00');
 assert.deepEqual([outlook.from,outlook.date,outlook.subject],['Shop BV <f@shop.example>','dinsdag 3 november 2026 10:00','Factuur 12']);
 assert.equal(fn.forwarded('Totaal € 5,00\nVan: iemand'),null,'No forward marker, no forward');

 // Dates without "om 16:53": the processor read "2026 OM" as a postcode.
 for(const [v,want] of [['wo 4 nov 2026 om 16:53','4 november 2026'],['Wed, Nov 4, 2026 at 4:53 PM','4 november 2026'],['dinsdag 3 november 2026 10:00','3 november 2026'],['04-11-2026','4 november 2026'],['2026-11-04T15:53:00Z','4 november 2026']])assert.equal(fn.mailDate(v),want,v);
 assert.equal(fn.mailDate('',"2026-11-06T23:30:00Z"),'7 november 2026','Falls back to the day it arrived, in Dutch time');
 assert.equal(fn.mailDate('gisteren'),'');

 assert.equal(fn.receiptLines('Totaal\n\n€ 43,63\n------------------------------\n\nNog te betalen\n\n€ 0,00\n[image: Klarna]\n<https://x.example/a>\nBesteldatum\n\n29 september 2026\nVerzending\n€ 6,99\nKlarna Bank AB (publ)\nSveavägen 46\nHoi! Je betaling is gelukt.\n\n€ 1,00'),
  'Totaal: € 43,63\n\nNog te betalen: € 0,00\n\nBesteldatum: 29 september 2026\nVerzending: € 6,99\nKlarna Bank AB (publ)\nSveavägen 46\nHoi! Je betaling is gelukt.\n\n€ 1,00');

 // Who the bon is from: the shop paid through Klarna or PayPal, the shop itself, or nobody when it is the user.
 const head=(data,text)=>fn.mailHeader({created_at:'2026-11-06T12:01:55Z',...data},text);
 const k=head({from:'kwin.test@gmail.example',subject:'Fwd: We hebben je betaling aan winparts.nl ontvangen'},KLARNA_FWD);
 assert.deepEqual(k.rows,[['Van','winparts.nl'],['Via','Klarna'],['Datum','4 november 2026'],['Onderwerp','We hebben je betaling aan winparts.nl ontvangen']]);
 assert.ok(!JSON.stringify(k.rows).includes('gmail'),'The one who forwarded is not in the header');
 assert.deepEqual(head({from:'PayPal <service@paypal.nl>',subject:'Receipt for your payment to Bol.com'},'Total € 5,00').rows[0],['Van','Bol.com']);
 assert.deepEqual(head({from:'Klarna <info@klarna.nl>',subject:'Je herinnering'},'Bedrag € 5,00').rows[0],['Van','Klarna <info@klarna.nl>'],'No shop named: the provider stays');
 assert.deepEqual(head({from:'Bol <orders@bol.example>',subject:'Je bestelling 1234'},'Totaal € 5,00').rows,[['Van','Bol <orders@bol.example>'],['Datum','6 november 2026'],['Onderwerp','Je bestelling 1234']]);
 assert.deepEqual(head({from:'kwin.test@gmail.example',subject:'tankbon'},'Shell € 65,00').rows[0],['Doorgestuurd door','kwin.test@gmail.example'],'Your own mailbox is never the supplier');

 // Through the webhook: one pdf named after the shop's subject, the event keeps the subject as mailed.
 assert.deepEqual((await json(await post(received('mail-fwd',[LOCAL+'@bon.boekuna.nl'],{from:'kwin.test@gmail.example',subject:'Fwd: We hebben je betaling aan winparts.nl ontvangen'})))).outcomes,['stored_text']);
 const [doc]=db.tables.documents;
 assert.equal(doc.name,'We hebben je betaling aan winparts.nl ontvangen.pdf');
 const parsed=await pdfLib.PDFDocument.load(db.storage.get(doc.storage_path).bytes);
 assert.equal(parsed.getTitle(),'We hebben je betaling aan winparts.nl ontvangen');assert.equal(parsed.getPageCount(),1);
 assert.equal(db.tables.inbound_mail_events[0].detail.subject,'Fwd: We hebben je betaling aan winparts.nl ontvangen');
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
 // Only the Resend key stored: the signing secret comes from Resend, from the webhook that points here.
 const db=fakeDb({resend_api_key:'re_test',webhook_secret:''}),net=fakeFetch(),asked=[];
 const fetchImpl=async(url,init={})=>{
  const u=String(url);
  if(u==='https://api.resend.test/webhooks'){asked.push('list');return new Response(JSON.stringify({data:[
   {id:'wh_other',endpoint:'https://elders.example/hook',events:['email.received'],status:'enabled'},
   {id:'wh_sent',endpoint:'https://db.test/functions/v1/inbound-mail',events:['email.sent'],status:'enabled'},
   {id:'wh_1',endpoint:'https://db.test/functions/v1/inbound-mail',events:['email.received'],status:'enabled'}]}))}
  if(u==='https://api.resend.test/webhooks/wh_1'){asked.push('wh_1');assert.equal(init.headers?.Authorization,'Bearer re_test');return new Response(JSON.stringify({id:'wh_1',signing_secret:secret}))}
  return net.fetchImpl(url,init);
 };
 const handler=await loadEdgeFunction(dir,{env:{SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'service-key',RESEND_API_URL:'https://api.resend.test'},supabase:db.supabase,fetchImpl});
 const body=received('mail-9',[LOCAL+'@bon.boekuna.nl']);
 const ok=await handler(new Request('https://fn.test',{method:'POST',headers:sign(body),body}));
 assert.deepEqual((await json(ok)).outcomes,['stored']);
 assert.deepEqual(asked,['list','wh_1'],'Only the webhook for this function and for received mail');
 const body2=received('mail-10',[LOCAL+'@bon.boekuna.nl']);
 await handler(new Request('https://fn.test',{method:'POST',headers:sign(body2),body:body2}));
 assert.deepEqual(asked,['list','wh_1'],'Looked up once, then kept');
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
console.log('Inbound mail function: signature, address lookup, attachments, mail text as bon, Gmail check, jobs, replay, limits and retry: PASS');
