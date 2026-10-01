// No KVK credential, endpoint or raw response is returned to the browser.
const PRODUCTION_PROJECT='https://vuwfyhtejsxhdfyvkkeq.supabase.co';
const TEST_PROJECT='https://ozisiotrzeubwbffnxyr.supabase.co';
const PRODUCTION_ORIGINS=new Set(['https://app.boekuna.nl','https://boekuna.nl','https://www.boekuna.nl','https://boekuna-boekhouding.onrender.com','https://kwinest-boekhouding.onrender.com']);
const TEST_KEY_SHA256='9d6f7624f417477b5dae66f114e0f2075dd9e8156ae8a3b0543f29bc9ced20e3';
const text=v=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,'').trim():null;
const clean=(v,max=240)=>{const s=text(v);return s?s.slice(0,max):null};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const number=(v,length)=>typeof v==='string'&&new RegExp('^\\d{'+length+'}$').test(v)?v:null;
const active=v=>v==='ja'||v==='Ja'||v===true?true:v==='nee'||v==='Nee'||v===false?false:null;
const failure=(code,status)=>Object.assign(new Error(code),{code,status});
const invalid=()=>{throw failure('INVALID_UPSTREAM',502)};
const unavailable=()=>{throw failure('UNAVAILABLE',503)};
const TYPES=new Set(['hoofdvestiging','nevenvestiging','rechtspersoon']);
const encoder=new TextEncoder();

export function resolveConfig(env){
  const project=String(env.SUPABASE_URL||'').replace(/\/$/,'');
  const environment=env.BOEKUNA_DEPLOYMENT_ENV||'production';
  const mode=env.KVK_API_MODE;
  if(env.KVK_LOOKUP_ENABLED!=='true'||!['test','production'].includes(mode)||!env.KVK_API_KEY||String(env.KVK_SELECTION_SECRET||'').length<32)unavailable();
  let origins;
  if(mode==='test'){
    if(!['development','preview','staging','test'].includes(environment)||project!==TEST_PROJECT)unavailable();
    origins=new Set(String(env.KVK_PREVIEW_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean));
    if(!origins.size||[...origins].some(o=>PRODUCTION_ORIGINS.has(o)||!/^https:\/\/[^/?#]+$/.test(o)))unavailable();
  }else{
    if(environment!=='production'||project!==PRODUCTION_PROJECT||String(env.KVK_API_KEY).length<24)unavailable();
    origins=PRODUCTION_ORIGINS;
  }
  return {mode,origins,key:env.KVK_API_KEY,secret:env.KVK_SELECTION_SECRET,base:'https://api.kvk.nl/'+(mode==='test'?'test/':'')+'api/'};
}
function fallbackOrigins(env){
  if(env.SUPABASE_URL===PRODUCTION_PROJECT||env.BOEKUNA_DEPLOYMENT_ENV==='production')return PRODUCTION_ORIGINS;
  return new Set(String(env.KVK_PREVIEW_ORIGINS||'').split(',').map(s=>s.trim()).filter(o=>/^https:\/\/[^/?#]+$/.test(o)&&!PRODUCTION_ORIGINS.has(o)));
}
function resultRow(r){
  if(!object(r)||!number(r.kvkNummer,8)||!clean(r.naam)||!TYPES.has(r.type))invalid();
  if(r.vestigingsnummer!=null&&!number(r.vestigingsnummer,12))invalid();
  if(r.type==='nevenvestiging'&&!r.vestigingsnummer)invalid();
  const a=object(r.adres?.binnenlandsAdres)?r.adres.binnenlandsAdres:{};
  return {kvkNumber:r.kvkNummer,establishmentNumber:r.vestigingsnummer||null,name:clean(r.naam),city:clean(a.plaats),postalCode:clean(a.postcode,24),street:clean(a.straatnaam),houseNumber:Number.isInteger(a.huisnummer)?String(a.huisnummer):null,type:r.type,active:active(r.actief),expiredName:clean(r.vervallenNaam)};
}
export function normalizeSearch(raw){
  if(!object(raw)||!Number.isInteger(raw.totaal)||raw.totaal<0||(!Array.isArray(raw.resultaten)&&raw.totaal!==0))invalid();
  if((raw.resultaten||[]).length>10)invalid();
  const page=Number.isInteger(raw.pagina)&&raw.pagina>0?raw.pagina:1;
  return {results:(raw.resultaten||[]).map(resultRow),page,hasMore:page<3&&raw.totaal>page*10};
}
function addressFrom(adressen){
  const list=Array.isArray(adressen)?adressen.filter(object):[];
  // An explicitly shielded address is never used, including volledigAdres.
  const publicAddresses=list.filter(a=>active(a.indAfgeschermd)!==true);
  const a=publicAddresses.find(a=>a.type==='bezoekadres')||publicAddresses.find(a=>a.type==='postadres');
  const shielded=list.some(a=>active(a.indAfgeschermd)===true);
  if(!a)return {address:null,postalCode:null,city:null,country:null,addressType:null,addressShielded:shielded,foreignPostalCity:null};
  let line=null;
  if(Number.isInteger(a.postbusnummer))line='Postbus '+a.postbusnummer;
  else if(clean(a.straatHuisnummer))line=clean(a.straatHuisnummer);
  else if(clean(a.straatnaam)){
    const house=Number.isInteger(a.huisnummer)?String(a.huisnummer):'';
    const addition=clean(a.huisnummerToevoeging,40);
    line=[clean(a.straatnaam),house+(clean(a.huisletter,4)||'')+(addition?'-'+addition:'')].filter(Boolean).join(' ');
    if(clean(a.toevoegingAdres))line+=' '+clean(a.toevoegingAdres);
  }
  return {address:line,postalCode:clean(a.postcode,24),city:clean(a.plaats),country:clean(a.land,80),addressType:a.type,addressShielded:shielded,foreignPostalCity:clean(a.postcodeWoonplaats)};
}
export function normalizeProfile(raw,selected,now=Date.now()){
  if(!object(raw)||raw.kvkNummer!==selected.kvkNumber)invalid();
  const branch=selected.type==='nevenvestiging';
  const site=branch?raw:raw._embedded?.hoofdvestiging;
  if(branch&&raw.vestigingsnummer!==selected.establishmentNumber)invalid();
  if(site?.vestigingsnummer!=null&&!number(site.vestigingsnummer,12))invalid();
  if(!branch&&selected.type==='hoofdvestiging'&&selected.establishmentNumber&&site?.vestigingsnummer!==selected.establishmentNumber)invalid();
  const name=clean(branch?raw.eersteHandelsnaam:raw.naam)||clean(site?.eersteHandelsnaam);
  if(!name)invalid();
  const trades=Array.isArray(raw.handelsnamen||site?.handelsnamen)?(raw.handelsnamen||site.handelsnamen):[];
  const tradeNames=[...new Set(trades.map(t=>clean(typeof t==='string'?t:t?.naam)).filter(Boolean))].slice(0,12);
  const end=raw.materieleRegistratie?.datumEinde||site?.materieleRegistratie?.datumEinde;
  return {kvkNumber:raw.kvkNummer,establishmentNumber:site?.vestigingsnummer||null,name,tradeNames,...addressFrom(site?.adressen||raw._embedded?.eigenaar?.adressen),active:end?false:(selected.active??null),expiredName:selected.expiredName||null,source:'KVK',retrievedAt:new Date(now).toISOString()};
}
function validateInput(b){
  if(!object(b))throw failure('INVALID_REQUEST',400);
  if(b.action==='search'){
    if(Object.keys(b).some(k=>!['action','query','place','page'].includes(k)))throw failure('INVALID_REQUEST',400);
    const query=text(b.query),place=b.place==null?'':text(b.place);
    if(!query||query.length<3||query.length>120||(/[\d\s-]+/.test(query)&&/^[\d\s-]+$/.test(query)&&!/^\d{8}$/.test(query))||place===null||place.length>80||!Number.isInteger(b.page??1)||(b.page??1)<1||(b.page??1)>3)throw failure('INVALID_REQUEST',400);
    return {action:'search',query,place,page:b.page??1};
  }
  if(b.action==='profile'&&Object.keys(b).every(k=>['action','selectionToken'].includes(k))&&typeof b.selectionToken==='string'&&b.selectionToken.length<2400)return b;
  throw failure('INVALID_REQUEST',400);
}
function base64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function decode(s){if(!/^[A-Za-z0-9_-]+$/.test(s))throw failure('INVALID_SELECTION',400);return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}
async function signingKey(secret){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
async function issue(row,uid,config,now){
  const payload=base64url(encoder.encode(JSON.stringify({uid,mode:config.mode,exp:Math.floor(now/1000)+300,kvkNumber:row.kvkNumber,establishmentNumber:row.establishmentNumber,type:row.type,active:row.active,expiredName:row.expiredName})));
  return payload+'.'+base64url(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(config.secret),encoder.encode(payload))));
}
async function selection(token,uid,config,now){
  try{
    const [p,s,...extra]=token.split('.');if(!p||!s||extra.length)throw Error();
    if(!await crypto.subtle.verify('HMAC',await signingKey(config.secret),decode(s),encoder.encode(p)))throw Error();
    const d=JSON.parse(new TextDecoder().decode(decode(p)));
    if(d.uid!==uid||d.mode!==config.mode||!Number.isInteger(d.exp)||d.exp<=Math.floor(now/1000)||d.exp>Math.floor(now/1000)+300||!number(d.kvkNumber,8)||!TYPES.has(d.type)||(d.establishmentNumber!=null&&!number(d.establishmentNumber,12))||(d.type==='nevenvestiging'&&!d.establishmentNumber))throw Error();
    return d;
  }catch{throw failure('INVALID_SELECTION',400)}
}
async function boundedText(response,max){
  if(Number(response.headers.get('content-length'))>max)throw Error('TOO_LARGE');
  const reader=response.body?.getReader();if(!reader)return '';
  const chunks=[];let count=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;count+=value.byteLength;if(count>max)throw Error('TOO_LARGE');chunks.push(value)}}catch(e){await reader.cancel().catch(()=>{});throw e}
  const bytes=new Uint8Array(count);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}return new TextDecoder().decode(bytes);
}
async function upstream(url,config,fetcher,timeoutMs){
  const controller=new AbortController();let timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{const e=failure('TIMEOUT',504);controller.abort(e);reject(e)},timeoutMs)});
  try{return await Promise.race([deadline,(async()=>{
    const response=await fetcher(url,{headers:{apikey:config.key,accept:'application/json'},signal:controller.signal,redirect:'error'});
    if(!response.ok){await response.body?.cancel();if([401,403].includes(response.status))unavailable();if(response.status===404)throw failure('NOT_FOUND',404);if(response.status===429)throw failure('RATE_LIMITED',429);throw failure('UPSTREAM_ERROR',502)}
    try{return JSON.parse(await boundedText(response,256*1024))}catch{throw failure('INVALID_UPSTREAM',502)}
  })()])}catch(e){if(e.status)throw e;throw failure('UPSTREAM_ERROR',502)}finally{clearTimeout(timer);controller.abort()}
}

export function createLookupHandler({env,authenticate,consumeBudget,fetch:fetcher=globalThis.fetch,now=Date.now,log=(_entry)=>{},timeoutMs=8000}){
  return async req=>{
    const started=now(),ref=crypto.randomUUID();let action='unknown',status=500,code=null,count=0;
    let config;try{config=resolveConfig(env)}catch{}
    const origin=req.headers.get('origin'),origins=config?.origins||fallbackOrigins(env);
    const headers={'content-type':'application/json','cache-control':'no-store','vary':'Origin','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'authorization,apikey,content-type'};
    if(origin&&origins.has(origin))headers['access-control-allow-origin']=origin;
    const out=(body,s)=>{status=s;return new Response(JSON.stringify(body),{status:s,headers})};
    try{
      if(origin&&!origins.has(origin))throw failure('ORIGIN_DENIED',403);
      if(req.method==='OPTIONS'){status=204;return new Response(null,{status,headers})}
      if(req.method!=='POST')throw failure('METHOD_NOT_ALLOWED',405);
      if(!/^Bearer [^\s]+$/.test(req.headers.get('authorization')||''))throw failure('UNAUTHORIZED',401);
      let user;try{user=await authenticate(req)}catch{}
      if(!user?.id||user.is_anonymous)throw failure('UNAUTHORIZED',401);
      let input;try{input=validateInput(JSON.parse(await boundedText(req,2048)))}catch(e){throw failure(e.code||'INVALID_REQUEST',400)}
      action=input.action;if(!config)unavailable();
      if(config.mode==='production'){
        const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(config.key)))].map(b=>b.toString(16).padStart(2,'0')).join('');
        if(digest===TEST_KEY_SHA256)unavailable();
      }
      let selected;if(action==='profile')selected=await selection(input.selectionToken,user.id,config,now());
      let budget;try{budget=await consumeBudget(user.id,action)}catch{unavailable()}
      if(typeof budget?.allowed!=='boolean')unavailable();
      if(!budget.allowed){headers['retry-after']=String(Math.max(1,Math.min(86400,Number(budget.retry_after_seconds)||60)));throw failure('RATE_LIMITED',429)}
      let data;
      if(action==='search'){
        const url=new URL(config.base+'v2/zoeken');url.searchParams.set(/^\d{8}$/.test(input.query)?'kvkNummer':'naam',input.query);
        if(input.place)url.searchParams.set('plaats',input.place);
        url.searchParams.set('pagina',String(input.page));url.searchParams.set('resultatenPerPagina','10');url.searchParams.set('inclusiefInactieveRegistraties','true');
        data=normalizeSearch(await upstream(url,config,fetcher,timeoutMs));count=data.results.length;
        data.results=await Promise.all(data.results.map(async r=>({...r,selectionToken:await issue(r,user.id,config,now())})));
      }else{
        const endpoint=selected.type==='nevenvestiging'?'v1/vestigingsprofielen/'+selected.establishmentNumber:'v1/basisprofielen/'+selected.kvkNumber;
        const url=new URL(config.base+endpoint);url.searchParams.set('geoData','false');
        data=normalizeProfile(await upstream(url,config,fetcher,timeoutMs),selected,now());count=1;
      }
      return out({ok:true,mode:config.mode,data},200);
    }catch(e){code=e.code||'UNAVAILABLE';return out({ok:false,error:{code,referenceId:ref}},e.status||503)}
    finally{try{log({action,mode:config?.mode||'disabled',status,latencyMs:Math.max(0,now()-started),resultCount:count,errorCode:code,referenceId:ref})}catch{}}
  };
}
