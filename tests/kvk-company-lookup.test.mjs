import test from 'node:test';
import assert from 'node:assert/strict';
import {createLookupHandler, resolveConfig, normalizeSearch, normalizeProfile} from '../supabase/functions/kvk-company-lookup/lib.mjs';

const uid='11111111-1111-4111-8111-111111111111';
const env={KVK_LOOKUP_ENABLED:'true',KVK_API_MODE:'test',KVK_API_KEY:'mock-upstream-credential',KVK_SELECTION_SECRET:'a'.repeat(48),BOEKUNA_DEPLOYMENT_ENV:'preview',SUPABASE_URL:'https://ozisiotrzeubwbffnxyr.supabase.co',KVK_PREVIEW_ORIGINS:'https://kvk-preview.example.test'};
const row={kvkNummer:'69599084',vestigingsnummer:'000038509504',naam:'Testbedrijf',type:'hoofdvestiging',adres:{binnenlandsAdres:{type:'bezoekadres',straatnaam:'Teststraat',plaats:'Utrecht'}},actief:'ja'};
const search={totaal:1,pagina:1,resultatenPerPagina:10,resultaten:[row]};
const address={type:'bezoekadres',indAfgeschermd:'Nee',straatnaam:'Teststraat',huisnummer:12,huisletter:'A',huisnummerToevoeging:'2',postcode:'1234AB',plaats:'Utrecht',land:'Nederland'};
const basis={kvkNummer:'69599084',naam:'Testbedrijf BV',_embedded:{hoofdvestiging:{vestigingsnummer:'000038509504',adressen:[address]}}};
function harness(options={}){
  const calls=[],logs=[];
  const handler=createLookupHandler({env,authenticate:async()=>({id:uid}),consumeBudget:async()=>({allowed:true}),fetch:async(url,init)=>{calls.push({url:String(url),init});return Response.json(String(url).includes('/zoeken')?search:basis)},log:e=>logs.push(e),...options});
  const request=(body,headers={})=>handler(new Request('https://backend.example.test',{method:'POST',headers:{origin:'https://kvk-preview.example.test',authorization:'Bearer fake-user-token','content-type':'application/json',...headers},body:JSON.stringify(body)}));
  return {calls,logs,request,handler};
}
test('authenticated search normalizes minimal data and selection fetches one profile',async()=>{
  const h=harness();const s=await h.request({action:'search',query:'Test'});assert.equal(s.status,200);
  const data=await s.json();assert.equal(data.mode,'test');assert.equal(data.data.results.length,1);assert.equal(data.data.results[0].active,true);
  assert.ok(data.data.results[0].selectionToken);assert.equal(h.calls.length,1);
  const p=await h.request({action:'profile',selectionToken:data.data.results[0].selectionToken});assert.equal(p.status,200);
  const profile=(await p.json()).data;assert.equal(profile.kvkNumber,'69599084');assert.equal(profile.address,'Teststraat 12A-2');
  assert.equal(profile.establishmentNumber,'000038509504');assert.equal(h.calls.length,2);assert.match(h.calls[1].url,/basisprofielen\/69599084/);
  assert.equal(profile.vat,undefined);assert.equal(profile.email,undefined);assert.equal(profile.owner,undefined);
  assert.ok(!JSON.stringify(h.logs).includes('Testbedrijf'));assert.ok(!JSON.stringify(h.logs).includes('mock-upstream-credential'));
});
test('secondary branch uses its own single establishment profile',async()=>{
  const other={...row,type:'nevenvestiging',vestigingsnummer:'000038509520'};
  const h=harness({fetch:async(url)=>{h.calls.push({url:String(url)});return Response.json(String(url).includes('/zoeken')?{...search,resultaten:[other]}:{kvkNummer:'69599084',vestigingsnummer:'000038509520',eersteHandelsnaam:'Test nevenvestiging',adressen:[{...address,straatnaam:'Branchstraat'}]})}});
  const s=(await (await h.request({action:'search',query:'Test'})).json()).data.results[0];
  const p=(await (await h.request({action:'profile',selectionToken:s.selectionToken})).json()).data;
  assert.equal(p.address,'Branchstraat 12A-2');assert.match(h.calls[1].url,/vestigingsprofielen\/000038509520/);assert.equal(h.calls.length,2);
});
test('missing active state stays unknown; shielded addresses never reconstructed',()=>{
  assert.equal(normalizeSearch({...search,resultaten:[{...row,actief:undefined}]}).results[0].active,null);
  const p=normalizeProfile({...basis,_embedded:{hoofdvestiging:{vestigingsnummer:'000038509504',adressen:[{...address,indAfgeschermd:'Ja'}]}}},{kvkNumber:'69599084',establishmentNumber:'000038509504',type:'hoofdvestiging',active:null});
  assert.equal(p.address,null);assert.equal(p.city,null);assert.equal(p.postalCode,null);assert.equal(p.addressShielded,true);assert.equal(p.active,null);
});
test('public correspondence address is explicit; foreign data is not guessed',()=>{
  const selected={kvkNumber:'69599084',establishmentNumber:null,type:'rechtspersoon',active:null};
  const p=normalizeProfile({kvkNummer:'69599084',naam:'Test',_embedded:{eigenaar:{adressen:[{...address,type:'postadres',postbusnummer:42,straatnaam:undefined,huisnummer:undefined,huisletter:undefined,huisnummerToevoeging:undefined}]}}},selected);
  assert.equal(p.address,'Postbus 42');assert.equal(p.addressType,'postadres');
  const f=normalizeProfile({kvkNummer:'69599084',naam:'Foreign',_embedded:{eigenaar:{adressen:[{type:'bezoekadres',straatHuisnummer:'Rue Test 3',postcodeWoonplaats:'75001 Paris',land:'Frankrijk'}]}}},selected);
  assert.equal(f.address,'Rue Test 3');assert.equal(f.postalCode,null);assert.equal(f.city,null);assert.equal(f.foreignPostalCity,'75001 Paris');
});
test('configuration is disabled by default and forbids production test fallback',async()=>{
  assert.throws(()=>resolveConfig({}),/UNAVAILABLE/);
  for(const altered of [{BOEKUNA_DEPLOYMENT_ENV:'production'},{SUPABASE_URL:'https://vuwfyhtejsxhdfyvkkeq.supabase.co'},{SUPABASE_URL:'https://unknown.supabase.co'},{KVK_API_KEY:''},{KVK_SELECTION_SECRET:'short'},{KVK_API_MODE:'other'}]){
    const h=harness({env:{...env,...altered}});assert.equal((await h.request({action:'search',query:'Test'},{origin:altered.BOEKUNA_DEPLOYMENT_ENV==='production'||altered.SUPABASE_URL?.includes('vuwfyhtejsxhdfyvkkeq')?'https://app.boekuna.nl':'https://kvk-preview.example.test'})).status,503);assert.equal(h.calls.length,0);
  }
});
test('validates authorization, strict CORS, size, action, query and numeric KVK before upstream',async()=>{
  for(const authenticate of [async()=>null,async()=>({id:uid,is_anonymous:true}),async()=>{throw Error('AUTH_FAILURE')}]){
    const h=harness({authenticate});assert.equal((await h.request({action:'search',query:'Test'})).status,401);assert.equal(h.calls.length,0);
  }
  const h=harness();assert.equal((await h.request({action:'search',query:'Test'},{origin:'https://evil.example'})).status,403);
  for(const body of [{action:'search',query:'ab'},{action:'search',query:'1234567'},{action:'search',query:'x'.repeat(121)},{action:'search',query:'test',page:99},{action:'search',query:'test',url:'https://evil.example'},{action:'profile',kvkNumber:'69599084'},{action:'anything'},{action:'search',query:'x'.repeat(3000)}])assert.equal((await h.request(body)).status,400);
  assert.equal(h.calls.length,0);
});
test('durable budget rejection and failure close without upstream call',async()=>{
  for(const [consumeBudget,status] of [[async()=>({allowed:false,retry_after_seconds:60}),429],[async()=>{throw Error('storage down')},503],[async()=>null,503]]){
    const h=harness({consumeBudget});const r=await h.request({action:'search',query:'Test'});assert.equal(r.status,status);assert.equal(h.calls.length,0);
  }
});
test('upstream errors are safe and never automatically retried',async()=>{
  for(const [upstream,status,code] of [[401,503,'UNAVAILABLE'],[403,503,'UNAVAILABLE'],[404,404,'NOT_FOUND'],[429,429,'RATE_LIMITED'],[500,502,'UPSTREAM_ERROR']]){
    let count=0;const h=harness({fetch:async()=>{count++;return new Response('private raw upstream payload',{status:upstream})}});
    const r=await h.request({action:'search',query:'Test'});assert.equal(r.status,status);const b=await r.json();assert.equal(b.error.code,code);assert.doesNotMatch(JSON.stringify(b),/private raw/);assert.equal(count,1);
  }
});
test('invalid/oversize responses fail closed and timeout covers response body',async()=>{
  for(const response of [()=>new Response('not json'),()=>Response.json({totaal:1,resultaten:[{naam:'wrong'}]}),()=>new Response('x'.repeat(270000))]){
    const h=harness({fetch:async()=>response()});assert.equal((await h.request({action:'search',query:'Test'})).status,502);
  }
  const h=harness({timeoutMs:15,fetch:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))});
  assert.equal((await h.request({action:'search',query:'Test'})).status,504);
});
test('profile tokens are tamper resistant, user bound, expiring and mode bound',async()=>{
  const h=harness();const s=(await (await h.request({action:'search',query:'Test'})).json()).data.results[0];
  const another=harness({authenticate:async()=>({id:'22222222-2222-4222-8222-222222222222'})});
  assert.equal((await another.request({action:'profile',selectionToken:s.selectionToken})).status,400);assert.equal(another.calls.length,0);
  const expired=harness({now:()=>Date.now()+6*60*1000});assert.equal((await expired.request({action:'profile',selectionToken:s.selectionToken})).status,400);
  assert.equal((await h.request({action:'profile',selectionToken:s.selectionToken+'x'})).status,400);
});
test('selected profile identifiers must match and inactive registration is explicit',async()=>{
  assert.throws(()=>normalizeProfile({...basis,kvkNummer:'99999999'},{kvkNumber:'69599084',type:'hoofdvestiging'}),/INVALID_UPSTREAM/);
  const p=normalizeProfile({...basis,materieleRegistratie:{datumEinde:'20250101'}},{kvkNumber:'69599084',type:'hoofdvestiging',active:true});assert.equal(p.active,false);
});
test('empty search and numeric query make one bounded search request',async()=>{
  const h=harness({fetch:async url=>{h.calls.push({url:String(url)});return Response.json({totaal:0,pagina:1})}});
  const r=await h.request({action:'search',query:'69599084'});assert.equal(r.status,200);assert.deepEqual((await r.json()).data.results,[]);assert.match(h.calls[0].url,/kvkNummer=69599084/);assert.doesNotMatch(h.calls[0].url,/naam=/);
});
test('preflight uses exact allowed origin; absent bearer and wrong method are denied',async()=>{
  const h=harness();const good=await h.handler(new Request('https://backend.example.test',{method:'OPTIONS',headers:{origin:'https://kvk-preview.example.test'}}));assert.equal(good.status,204);assert.equal(good.headers.get('access-control-allow-origin'),'https://kvk-preview.example.test');
  const bad=await h.handler(new Request('https://backend.example.test',{method:'OPTIONS',headers:{origin:'https://evil.example.test'}}));assert.equal(bad.status,403);assert.equal(bad.headers.get('access-control-allow-origin'),null);
  assert.equal((await h.request({action:'search',query:'Test'},{authorization:''})).status,401);assert.equal((await h.handler(new Request('https://backend.example.test'))).status,405);assert.equal(h.calls.length,0);
});
test('slow response body is bounded by the same upstream timeout',async()=>{
  const h=harness({timeoutMs:15,fetch:async()=>new Response(new ReadableStream({start(){},cancel(){}}))});assert.equal((await h.request({action:'search',query:'Test'})).status,504);
});
