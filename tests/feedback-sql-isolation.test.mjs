import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Runs the real feedback migration in local PostgreSQL. auth.uid(), auth.users and the storage
// schema are small fixtures of the Supabase platform; grants, RLS policies, checks and triggers
// are the production SQL.
const db=new PGlite();
const read=name=>fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const core=read('20260926081916_create_kwinest_core.sql');
const migration=read('20261007200000_in_app_feedback.sql');
const A='00000000-0000-4000-8000-00000000000a',B='00000000-0000-4000-8000-00000000000b';
const idA='11111111-1111-4111-8111-111111111111',idB='22222222-2222-4222-8222-222222222222';
async function as(user){await db.exec('reset role');await db.query("select set_config('test.uid',$1,false)",[user||'']);await db.exec(user?'set role authenticated':'set role anon')}
async function asService(){await db.exec('reset role');await db.query("select set_config('test.uid','',false)")}
const report=(id,extra={})=>({id,category:'bug',title:'Opslaan werkt niet',message:'Ik druk op opslaan en er gebeurt niets.',feature:'invoices',route:'invoices',app_release:'abc123',platform:'web',context:{v:1,route:'invoices',theme:'system/dark'},...extra});
async function insert(row){
  const cols=Object.keys(row),vals=cols.map((_,i)=>'$'+(i+1)+(cols[i]==='context'?'::jsonb':''));
  return db.query('insert into public.feedback_reports('+cols.join(',')+') values ('+vals.join(',')+')',cols.map(c=>c==='context'?JSON.stringify(row[c]):row[c]));
}
const results=[];
async function check(name,fn){await fn();results.push(name);console.log('PASS',name)}

try{
  await db.exec(`create role authenticated;create role anon;create schema auth;create schema storage;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
  create table auth.users(id uuid primary key);
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null,owner uuid default auth.uid());
  create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
  alter table storage.objects enable row level security;
  grant usage on schema public,auth,storage to authenticated,anon;
  grant select,insert,delete on storage.objects to authenticated;`);
  // Shared helper from the core migration.
  await db.exec(core.slice(core.indexOf('create or replace function public.set_updated_at()'),core.indexOf('drop trigger if exists profiles_set_updated_at')));
  await db.exec(migration);
  await db.exec(migration); // Replay-safe.
  await db.query('insert into auth.users values ($1),($2)',[A,B]);

  await check('authenticated user stores own report with safe context',async()=>{
    await as(A);await insert(report(idA,{screenshot_path:A+'/'+idA+'/screenshot.jpg'}));
    const rows=(await db.query('select id,customer_status,category from public.feedback_reports')).rows;
    assert.deepEqual(rows,[{id:idA,customer_status:'received',category:'bug'}]);
  });
  await check('user A cannot see user B reports (tenant isolation)',async()=>{
    await as(B);await insert(report(idB,{category:'feature_request',title:'Idee voor facturen',message:'Facturen kopiëren zou fijn zijn.'}));
    assert.deepEqual((await db.query('select id from public.feedback_reports')).rows,[{id:idB}]);
    await as(A);
    assert.deepEqual((await db.query('select id from public.feedback_reports')).rows,[{id:idA}]);
    assert.equal((await db.query('select id from public.feedback_reports where id=$1',[idB])).rows.length,0,'Direct lookup of another account is empty');
  });
  await check('anonymous visitors cannot read or write feedback',async()=>{
    await as(null);
    await assert.rejects(db.query('select id from public.feedback_reports'),/permission denied/);
    await assert.rejects(insert(report('33333333-3333-4333-8333-333333333333')),/permission denied/);
  });
  await check('cannot file a report as someone else',async()=>{
    await as(A);
    await assert.rejects(insert({...report('44444444-4444-4444-8444-444444444444'),user_id:B}),/permission denied/);
  });
  await check('customers cannot set or read internal triage fields',async()=>{
    await as(A);
    for(const [i,[col,val]] of [['priority','critical'],['status','resolved'],['internal_notes','x'],['github_issue_url','https://github.com/x/y/issues/1']].entries()){
      await assert.rejects(insert({...report('55555555-5555-4555-8555-'+String(i).padStart(12,'0')),[col]:val}),/permission denied/,col+' is not writable');
    }
    for(const col of ['priority','internal_notes','github_issue_url','github_pr_url','issue_group_id','user_id','context','status']){
      await assert.rejects(db.query('select '+col+' from public.feedback_reports'),/permission denied/,col+' is not readable');
    }
  });
  await check('customers cannot change or delete reports',async()=>{
    await as(A);
    await assert.rejects(db.query("update public.feedback_reports set message='aangepast' where id=$1",[idA]),/permission denied/);
    await assert.rejects(db.query('delete from public.feedback_reports where id=$1',[idA]),/permission denied/);
  });
  await check("screenshot path must be the reporter's own folder",async()=>{
    await as(A);const id='66666666-6666-4666-8666-666666666666';
    await assert.rejects(insert(report(id,{screenshot_path:B+'/'+id+'/screenshot.jpg'})),/row-level security/);
    await assert.rejects(insert(report(id,{screenshot_path:A+'/'+idA+'/screenshot.jpg'})),/row-level security/,'Path must match the report id');
  });
  await check('context rejects tokens, passwords and document dumps',async()=>{
    await as(A);
    for(const [i,bad] of [{access_token:'x'},{password:'x'},{ocr_text:'...'},{iban:'NL91ABNA0417164300'}].entries()){
      await assert.rejects(insert(report('77777777-7777-4777-8777-'+String(i).padStart(12,'0'),{context:bad})),/check constraint/);
    }
    await assert.rejects(insert(report('88888888-8888-4888-8888-888888888888',{context:{big:'x'.repeat(40000)}})),/check constraint/);
    await assert.rejects(insert(report('99999999-9999-4999-8999-999999999999',{category:'severity_high'})),/check constraint/);
  });
  await check('OCR correction keeps field identity, original and corrected value',async()=>{
    await as(A);const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const ocr=[{field:'invoiceNumber',originalValue:'2026-183',correctedValue:'INV-2026-183',confidence:62,sourceType:'ocr'}];
    await insert(report(id,{category:'ocr_correction',title:'Herkenning klopt niet: Factuurnummer',context:{v:1,feature:'document-review',ocrCorrections:ocr}}));
    await asService();
    const row=(await db.query('select context from public.feedback_reports where id=$1',[id])).rows[0];
    assert.deepEqual(row.context.ocrCorrections,ocr);
  });
  await check('internal triage maps to the four customer statuses',async()=>{
    await asService();
    const seen=[];
    for(const status of ['triaged','planned','in_progress','resolved','closed']){
      await db.query('update public.feedback_reports set status=$1 where id=$2',[status,idA]);
      seen.push((await db.query('select customer_status from public.feedback_reports where id=$1',[idA])).rows[0].customer_status);
    }
    assert.deepEqual(seen,['reviewing','in_progress','in_progress','resolved','resolved']);
    const r=(await db.query('select triaged_at,resolved_at,status_changed_at>created_at as moved from public.feedback_reports where id=$1',[idA])).rows[0];
    assert.ok(r.triaged_at&&r.resolved_at&&r.moved);
  });
  await check('reports can be grouped and linked to GitHub internally',async()=>{
    await asService();
    const g=(await db.query("insert into public.feedback_issue_groups(title,priority,github_issue_url) values ('Factuurnummer verkeerd herkend','high','https://github.com/kwinstudio/boekuna/issues/1') returning id")).rows[0].id;
    await db.query('update public.feedback_reports set issue_group_id=$1,github_pr_url=$2,fixed_in_release=$3 where id=$4',[g,'https://github.com/kwinstudio/boekuna/pull/2','abc123',idA]);
    await as(A);
    await assert.rejects(db.query('select * from public.feedback_issue_groups'),/permission denied/);
  });
  await check('rate limit: at most 20 reports per hour',async()=>{
    await as(B);
    for(let i=0;i<19;i++)await insert(report('bbbbbbbb-bbbb-4bbb-8bbb-'+String(i).padStart(12,'0')));
    await assert.rejects(insert(report('cccccccc-cccc-4ccc-8ccc-cccccccccccc')),/feedback_rate_limit/);
  });
  await check('screenshots are private per account',async()=>{
    await as(A);
    await db.query("insert into storage.objects(bucket_id,name) values ('feedback-screenshots',$1)",[A+'/'+idA+'/screenshot.jpg']);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('feedback-screenshots',$1)",[B+'/'+idB+'/screenshot.jpg']),/row-level security/);
    await as(B);
    assert.equal((await db.query("select name from storage.objects where bucket_id='feedback-screenshots'")).rows.length,0,'B cannot list A screenshots');
    assert.equal((await db.query('delete from storage.objects where name=$1 returning name',[A+'/'+idA+'/screenshot.jpg'])).rows.length,0,'B cannot delete A screenshots');
    await asService();
    const bucket=(await db.query("select public,file_size_limit,allowed_mime_types from storage.buckets where id='feedback-screenshots'")).rows[0];
    assert.deepEqual(bucket,{public:false,file_size_limit:5242880,allowed_mime_types:['image/jpeg','image/png','image/webp']});
  });
  await check('deleting an account removes its reports',async()=>{
    await asService();
    await db.query('delete from auth.users where id=$1',[A]);
    assert.equal((await db.query('select count(*)::int as n from public.feedback_reports where user_id=$1',[A])).rows[0].n,0);
    assert.ok((await db.query('select count(*)::int as n from public.feedback_reports where user_id=$1',[B])).rows[0].n>0);
  });
  console.log('Feedback SQL isolation: PASS ('+results.length+' checks)');
}finally{await db.close()}
