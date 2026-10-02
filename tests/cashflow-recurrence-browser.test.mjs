import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import { chromium, webkit } from 'playwright';

execFileSync(process.execPath,['scripts/build-app.mjs']);
const original=fs.readFileSync(new URL('../dist/app/index.html',import.meta.url),'utf8').replace('const today=()=>new Date().toISOString().slice(0,10);',"const today=()=> '2026-01-31';");
const bootstrap=String.raw`
// Domain mock only: this exercises the client persistence contract, not live RLS.
window.__auth='account-a';
window.__db=JSON.parse(localStorage.getItem('cashflow-mock-remote')||'null')||{
 'account-a':{version:1,state:{...structuredClone(DEFAULT),
 invoices:[
  {id:'i1',number:'2026-1',status:'sent',kind:'invoice',issueDate:'2026-01-01',dueDate:'2026-02-05',lines:[{qty:1,unit:100,vat:21}],payments:[]},
  {id:'i2',number:'2026-2',status:'paid',kind:'invoice',issueDate:'2026-01-01',dueDate:'2026-02-05',lines:[{qty:1,unit:200,vat:21}],payments:[{id:'p2',date:'2026-01-02',amount:242}]},
  {id:'i3',number:'2026-3',status:'sent',kind:'invoice',issueDate:'2026-01-01',dueDate:'2026-02-05',lines:[{qty:1,unit:100,vat:21}],payments:[{id:'p3',date:'2026-01-02',amount:60}]}
 ],expenses:[{id:'e1',date:'2026-01-02',vendor:'Leverancier',exVat:50,vatRate:21,category:'Software'}],
 transactions:[{id:'t1',date:'2026-01-03',amount:1000,status:'unmatched'}],
 plannedCash:[{id:'legacy',date:'2026-01-20',type:'out',amount:20,description:'Bestaande planning'}]}},
 'account-b':{version:1,state:{...structuredClone(DEFAULT),plannedCash:[{id:'b-private',date:'2026-01-31',type:'in',amount:999,repeating:'weekly',description:'B privé'}]}}
};
window.__persistMock=()=>localStorage.setItem('cashflow-mock-remote',JSON.stringify(window.__db));
getSupabase=async()=>({
 rpc:async(name,args)=>{
  if(name!=='save_ledger_state')throw new Error('Unexpected RPC');
  const row=window.__db[window.__auth];
  if(!row||row.version!==args.p_expected_version)return {data:null,error:null};
  row.state=structuredClone(args.p_state);row.version++;window.__persistMock();return {data:row.version,error:null};
 },
 from:table=>{
  if(table!=='ledger_state')throw new Error('Unexpected table');
  let action='select',payload=null;
  const denied=()=>({data:null,error:{message:'mock ownership policy'}});
  const query={
   select:()=>query,
   eq:(_key,id)=>({
    maybeSingle:async()=>({data:id===window.__auth?structuredClone(window.__db[id]||null):null,error:null}),
    then:(resolve)=>{
     if(id!==window.__auth||payload?.user_id&&payload.user_id!==window.__auth)return resolve(denied());
     if(action==='update')Object.assign(window.__db[id],structuredClone(payload));
     if(action==='delete')delete window.__db[id];
     window.__persistMock();resolve({data:null,error:null});
    }
   }),
   insert:async row=>{if(row.user_id!==window.__auth)return denied();window.__db[row.user_id]=structuredClone(row);window.__persistMock();return {error:null}},
   update:row=>{action='update';payload=row;return query},delete:()=>{action='delete';return query}
  };return query
 }
});
currentUser={id:window.__auth,email:'a@example.test'};
state=normalizeState(structuredClone(window.__db[window.__auth].state));cloudVersion=window.__db[window.__auth].version;
window.__metrics=()=>{
 const inv=state.invoices.filter(i=>i.status!=='draft'),sales=inv.reduce((s,i)=>s+invoiceNet(i),0),costs=state.expenses.reduce((s,e)=>s+Number(e.exVat),0);
 return {sales,costs,profit:sales-costs,vat:inv.reduce((s,i)=>s+invoiceVat(i),0)-state.expenses.reduce((s,e)=>s+expenseVat(e),0),outstanding:inv.map(invoiceOutstanding),paid:inv.map(invoicePaidAmount),statuses:inv.map(invoiceEffectiveStatus),cash:cashBalance(),ledger:ledgerAccountSummary(journalFlatRows()),journal:generatedJournal()}
};
document.getElementById('authRoot').innerHTML='';document.getElementById('mainApp').style.display='grid';page='cashflow';render();
`;
const at=original.lastIndexOf('initAuth();');
assert.ok(at>=0);
const html=original.slice(0,at)+bootstrap+original.slice(at+'initAuth();'.length);
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname.startsWith('/assets/')&&!pathname.includes('..')){
  const file=new URL('../dist/app'+pathname,import.meta.url);
  if(fs.existsSync(file)){res.writeHead(200,{'content-type':pathname.endsWith('.js')?'text/javascript':pathname.endsWith('.css')?'text/css':'image/svg+xml'});return res.end(fs.readFileSync(file));}
 }
 if(pathname==='/manifest.webmanifest'){res.writeHead(200,{'content-type':'application/manifest+json'});return res.end('{}')}
 res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await (process.env.BOOKUNA_BROWSER==='webkit'?webkit:chromium).launch({headless:true});
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/app`,{waitUntil:'domcontentloaded'});
 assert.deepEqual(errors,[],'Bootstrap browser errors');
 const baseline=await page.evaluate(()=>({metrics:window.__metrics(),forecast:forecastAt(30)}));
 assert.equal(await page.evaluate(()=>state.plannedCash[0].repeating),'oneoff');
 await page.evaluate(()=>newPlannedCash());
 assert.equal(await page.getByLabel('Herhalen').inputValue(),'oneoff');
 await page.getByLabel('Omschrijving').fill('Huur');
 await page.getByLabel('Bedrag incl. btw / cashbedrag').fill('100');
 await page.getByLabel('Startdatum').fill('2026-01-31');
 await page.getByLabel('Herhalen').selectOption('monthly');
 await page.evaluate(async()=>{savePlannedCash();await syncCloudStateNow()});
 const created=await page.evaluate(()=>({plans:structuredClone(state.plannedCash),remote:structuredClone(window.__db['account-a'].state.plannedCash),metrics:window.__metrics(),forecast:forecastAt(30)}));
 assert.equal(created.plans.length,2);assert.deepEqual(created.remote,created.plans);
 assert.equal(created.forecast,baseline.forecast-200);
 assert.deepEqual(created.metrics,baseline.metrics,'Creating recurrence changes projection only, including unchanged paid/partial/open invoices, profit, VAT and ledger balances');
 const id=created.plans[1].id;
 await page.reload({waitUntil:'domcontentloaded'});
 assert.equal(await page.evaluate(()=>state.plannedCash.length),2);
 assert.equal(await page.evaluate(()=>forecastAt(30)),created.forecast);
 await page.evaluate(id=>editPlannedCash(id),id);
 assert.equal(await page.getByLabel('Herhalen').inputValue(),'monthly');
 await page.getByLabel('Herhalen').selectOption('weekly');
 await page.getByLabel('Bedrag incl. btw / cashbedrag').fill('25');
 await page.evaluate(async()=>{savePlannedCash();await syncCloudStateNow()});
 assert.equal(await page.evaluate(()=>forecastAt(30)),baseline.forecast-125);
 assert.equal(await page.evaluate(()=>state.plannedCash.length),2);
 assert.deepEqual(await page.evaluate(()=>window.__metrics()),baseline.metrics);
 // Two-account ownership DOMAIN MOCK; live PostgreSQL policy execution is a separate gate.
 const isolation=await page.evaluate(async()=>{
  const sb=await getSupabase(),before=JSON.stringify(window.__db['account-b']);
  const selected=await sb.from('ledger_state').select('state').eq('user_id','account-b').maybeSingle();
  const inserted=await sb.from('ledger_state').insert({user_id:'account-b',state:{plannedCash:[]}});
  const updated=await sb.from('ledger_state').update({state:{plannedCash:[]}}).eq('user_id','account-b');
  const deleted=await sb.from('ledger_state').delete().eq('user_id','account-b');
  const transferred=await sb.from('ledger_state').update({user_id:'account-b'}).eq('user_id','account-a');
  const bUnchanged=before===JSON.stringify(window.__db['account-b']);
  window.__auth='account-b';const own=await sb.from('ledger_state').select('state').eq('user_id','account-b').maybeSingle();
  const aHidden=await sb.from('ledger_state').select('state').eq('user_id','account-a').maybeSingle();window.__auth='account-a';
  return {selected:selected.data,insertDenied:!!inserted.error,updateDenied:!!updated.error,deleteDenied:!!deleted.error,transferDenied:!!transferred.error,bUnchanged,ownId:own.data.state.plannedCash[0].id,aHidden:aHidden.data};
 });
 assert.deepEqual(isolation,{selected:null,insertDenied:true,updateDenied:true,deleteDenied:true,transferDenied:true,bUnchanged:true,ownId:'b-private',aHidden:null});
 await page.evaluate(id=>deletePlannedCash(id),id);
 await page.getByRole('heading',{name:'Wil je dit verwijderen?',exact:true}).waitFor();
 await page.getByRole('button',{name:'Bevestig verwijderen',exact:true}).click();
 await page.evaluate(()=>syncCloudStateNow());
 assert.equal(await page.evaluate(()=>state.plannedCash.length),1);
 assert.equal(await page.evaluate(()=>window.__db['account-a'].state.plannedCash.length),1);
 assert.equal(await page.evaluate(()=>forecastAt(30)),baseline.forecast);
 assert.deepEqual(await page.evaluate(()=>window.__metrics()),baseline.metrics);
 assert.deepEqual(errors,[]);
 fs.mkdirSync('tests/artifacts/financial-presentation',{recursive:true});
 fs.writeFileSync('tests/artifacts/financial-presentation/cashflow-integrity-'+(process.env.BOOKUNA_BROWSER||'chromium')+'.json',JSON.stringify({baseline,recurringForecast:created.forecast,after:await page.evaluate(()=>({metrics:window.__metrics(),forecast:forecastAt(30)})),persistence:'versioned client fixture; real SQL/RLS checked separately'},null,2));
 console.log('Cashflow browser create/edit/delete/reload/cloud roundtrip + two-account DOMAIN MOCK: PASS (not a live RLS test)');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
