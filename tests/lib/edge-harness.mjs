// Run a Supabase Edge Function (Deno) inside Node with a fake Supabase client,
// fake Stripe and no network. Used by billing tests; never touches real services.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

let loadCounter=0;

export function fakeSupabase({users={},tables={},rpc={}}={}){
  const calls=[];
  const rows=name=>(tables[name]||=[]);
  function query(name){
    const filters=[];let single=false;
    const q={
      select(){return q},
      eq(col,val){filters.push(r=>r[col]===val);return q},
      maybeSingle(){single=true;return q},
      then(resolve,reject){
        try{
          const found=rows(name).filter(r=>filters.every(f=>f(r)));
          resolve({data:single?(found[0]||null):found,error:null});
        }catch(e){reject(e)}
      }
    };
    return q;
  }
  function createClient(url,key,opts={}){
    const auth=String(opts?.global?.headers?.Authorization||'');
    return {
      auth:{
        async getUser(){const u=users[auth.replace(/^Bearer /,'')];return u?{data:{user:u},error:null}:{data:{user:null},error:{message:'invalid'}}},
        admin:{async getUserById(id){const u=Object.values(users).find(x=>x.id===id);return {data:{user:u||null},error:u?null:{message:'User not found'}}}}
      },
      from:name=>({
        ...query(name),
        insert:async row=>{calls.push(['insert',name,row]);if(rows(name).some(r=>r.stripe_event_id&&r.stripe_event_id===row.stripe_event_id))return {error:{code:'23505'}};rows(name).push({...row});return {error:null}},
        update:patch=>{const filters=[];const u={eq(c,v){filters.push(r=>r[c]===v);return u},select(){return u},maybeSingle(){return u},then(res){const hit=rows(name).filter(r=>filters.every(f=>f(r)));hit.forEach(r=>Object.assign(r,patch));res({data:hit[0]||null,error:null})}};return u},
      }),
      async rpc(fn,args){calls.push(['rpc',fn,args]);if(!rpc[fn])return {data:null,error:{code:'PGRST202',message:'Could not find the function public.'+fn}};return rpc[fn](args)}
    };
  }
  return {createClient,calls,tables};
}

export function fakeStripe(routes){
  const calls=[];
  async function fetchImpl(url,init={}){
    const u=new URL(String(url));
    const method=(init.method||'GET').toUpperCase();
    const body=init.body?new URLSearchParams(String(init.body)):null;
    calls.push({method,path:u.pathname.replace(/^\/v1/,''),query:u.searchParams,body,headers:init.headers||{}});
    const handler=routes[method+' '+u.pathname.replace(/^\/v1/,'')]||routes[method+' '+u.pathname.replace(/^\/v1/,'').replace(/(sub|cs|price)_[A-Za-z0-9]+/g,'$1_X')];
    if(!handler)throw new Error('unexpected Stripe call '+method+' '+u.pathname);
    const out=await handler({query:u.searchParams,body});
    if(out instanceof Response)return out;
    return new Response(JSON.stringify(out),{status:200,headers:{'content-type':'application/json'}});
  }
  return {fetchImpl,calls};
}

// Load an Edge Function with its Deno-only imports replaced by the fakes.
export async function loadEdgeFunction(fnDir,{env={},supabase,fetchImpl}){
  const src=fs.readFileSync(path.join(fnDir,'index.ts'),'utf8')
    .replace(/^import "jsr:[^"]+";\s*$/m,'')
    .replace(/import \{ ?createClient ?\} from "npm:@supabase\/supabase-js@2";/,'const {createClient}=globalThis.__edgeFakes.supabase;');
  const tmp=path.join(fnDir,`.harness-${process.pid}-${++loadCounter}.ts`);
  fs.writeFileSync(tmp,src);
  let handler=null;
  globalThis.__edgeFakes={supabase};
  globalThis.Deno={env:{get:k=>env[k]},serve:h=>{handler=h}};
  globalThis.fetch=fetchImpl;
  try{await import(pathToFileURL(tmp).href)}finally{fs.unlinkSync(tmp)}
  return handler;
}
