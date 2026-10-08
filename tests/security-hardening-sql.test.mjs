import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Runs the real hardening migration in local PostgreSQL. auth.uid(), auth.jwt() and the MFA helper
// are small fixtures of the Supabase platform; the tables mirror production's own-row SELECT policies.
const db=new PGlite();
const migration=fs.readFileSync(new URL('../supabase/migrations/20261008150000_security_mfa_guard_and_anon_grants.sql',import.meta.url),'utf8');
const A='00000000-0000-4000-8000-00000000000a',B='00000000-0000-4000-8000-00000000000b';
const guarded=['bank_imports','bank_transactions','transaction_matches','document_validation_results','document_duplicate_fingerprints','invoice_sequences','feedback_reports','email_connections'];
const anonRevoked=['documents','ledger_state','ledger_revisions','profiles','email_connections'];
async function as(user,{aal='aal1',mfa=false}={}){
  await db.exec('reset role');
  await db.query("select set_config('test.uid',$1,false),set_config('test.aal',$2,false),set_config('test.mfa',$3,false)",[user||'',aal,String(mfa)]);
  await db.exec(user?'set role authenticated':'set role anon');
}
const rows=async t=>(await db.query('select user_id from public.'+t+' order by user_id')).rows.map(r=>r.user_id);
const results=[];
async function check(name,fn){await fn();results.push(name);console.log('PASS',name)}

try{
  await db.exec(`create role authenticated;create role anon;create schema auth;create schema private;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
  create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',coalesce(nullif(current_setting('test.aal',true),''),'aal1'))$$;
  create function private.current_user_has_verified_mfa() returns boolean language sql stable as $$select coalesce(current_setting('test.mfa',true),'false')='true'$$;
  grant usage on schema public,auth,private to authenticated,anon;
  grant execute on function private.current_user_has_verified_mfa() to authenticated;`);
  for(const t of [...new Set([...guarded,...anonRevoked])]){
    await db.exec(`create table public.${t}(id serial primary key,user_id uuid not null);
    alter table public.${t} enable row level security;
    create policy ${t}_select_own on public.${t} for select to authenticated using (user_id=(select auth.uid()));
    grant all on public.${t} to anon;grant select on public.${t} to authenticated;
    insert into public.${t}(user_id) values ('${A}'),('${B}');`);
  }
  await db.exec(migration);
  await db.exec(migration); // Replay-safe.

  await check('users without MFA keep reading their own rows only',async()=>{
    await as(A);
    for(const t of guarded)assert.deepEqual(await rows(t),[A],t);
  });
  await check('MFA user needs an aal2 session for every financial table',async()=>{
    await as(A,{mfa:true,aal:'aal1'});
    for(const t of guarded)assert.deepEqual(await rows(t),[],t+' hidden at aal1');
    await as(A,{mfa:true,aal:'aal2'});
    for(const t of guarded)assert.deepEqual(await rows(t),[A],t+' visible at aal2');
  });
  await check('guard never widens access to another account',async()=>{
    await as(B,{mfa:true,aal:'aal2'});
    for(const t of guarded)assert.deepEqual(await rows(t),[B],t);
  });
  await check('anon has no table privileges left',async()=>{
    await as(null);
    for(const t of anonRevoked)await assert.rejects(db.query('select 1 from public.'+t),/permission denied/,t);
    await assert.rejects(db.query('insert into public.documents(user_id) values ($1)',[A]),/permission denied/);
  });
  await check('one restrictive guard per table, for authenticated only',async()=>{
    await db.exec('reset role');
    const policies=(await db.query("select tablename,permissive,roles::text as roles,cmd from pg_policies where policyname like 'mfa_guard_%' order by 1")).rows;
    assert.deepEqual(policies.map(p=>p.tablename),[...guarded].sort());
    for(const p of policies)assert.deepEqual([p.permissive,p.roles,p.cmd],['RESTRICTIVE','{authenticated}','ALL'],p.tablename);
  });
  await check('financial-automation refuses an MFA account without aal2 before touching service-role data',async()=>{
    const src=fs.readFileSync(new URL('../supabase/functions/financial-automation/index.ts',import.meta.url),'utf8');
    assert.match(src,/getAuthenticatorAssuranceLevel\(\);if\(aalError\)return null;if\(aal\?\.nextLevel==="aal2"&&aal\?\.currentLevel!=="aal2"\)return \{mfaRequired:true\}/);
    const handler=src.slice(src.indexOf('Deno.serve('));
    assert.ok(handler.indexOf('if(ctx.mfaRequired)return fail(req,"MFA_REQUIRED",403,ref)')<handler.indexOf('await rate(ctx.user.id'),'MFA check precedes any admin call');
  });
  console.log('Security hardening SQL: PASS ('+results.length+' checks)');
}finally{await db.close()}
