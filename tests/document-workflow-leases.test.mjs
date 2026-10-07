import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema private;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$
    select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub' $$;
` .replace("select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'", "select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid"));
await db.exec(`
  create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
  create function private.current_user_has_verified_mfa() returns boolean language sql as $$ select false $$;
  create table public.documents(id uuid primary key,user_id uuid references auth.users(id));
  create publication supabase_realtime;
  create table public.test_usage(user_id uuid primary key,used integer not null default 0,allowed boolean not null default true);
  create function public.can_operate_bookkeeping() returns boolean language sql as $$ select allowed from public.test_usage where user_id=auth.uid() $$;
  create function public.check_document_quota() returns table(allowed boolean,plan text,monthly_limit integer,used integer,remaining integer)
    language sql as $$ select used<100,'test',100,used,100-used from public.test_usage where user_id=auth.uid() $$;
  create function public.record_document_usage() returns table(plan text,monthly_limit integer,used integer,remaining integer)
    language sql as $$ update public.test_usage set used=used+1 where user_id=auth.uid() returning 'test'::text,100,used,100-used $$;
`);
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260929201500_document_background_processing.sql',import.meta.url),'utf8'));
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261007150000_document_workflow_leases.sql',import.meta.url),'utf8'));

const uuid=()=>crypto.randomUUID();
const users=[uuid(),uuid()];
for(const user of users){
  await db.query('insert into auth.users values($1)',[user]);
  await db.query('insert into public.test_usage(user_id) values($1)',[user]);
}
async function enqueue(user,n){
  const ids=[];
  for(let i=0;i<n;i++){
    const doc=uuid(),job=uuid();
    await db.query('insert into documents values($1,$2)',[doc,user]);
    await db.query(`insert into document_processing_jobs(id,user_id,document_id,client_ref,batch_id,file_name,execution_mode)
       values($1,$2,$3,$4,$5,'synthetic.pdf','workflow')`,[job,user,doc,doc,'batch-'+uuid()]);
    ids.push(job);
  }
  return ids;
}
async function claim(id,userLimit=4,globalLimit=4){
  return (await db.query('select * from claim_document_workflow_job($1,$2,$3)',[id,userLimit,globalLimit])).rows[0];
}
async function finish(job,lease=job.lease_token){
  return (await db.query(`select complete_document_workflow_job($1,$2,$3,$4,$5) as ok`,
    [job.id,lease,{documentType:'receipt',amounts:{total:121}},[],''])).rows[0].ok;
}

for(const n of [1,10,50]){
  const ids=await enqueue(users[0],n);let completed=0,peak=0;
  while(completed<n){
    const claimed=(await Promise.all(ids.map(id=>claim(id)))).filter(Boolean);
    assert(claimed.length>0);peak=Math.max(peak,claimed.length);assert(claimed.length<=4);
    for(const job of claimed){
      assert.equal(await claim(job.id),undefined,'duplicate delivery cannot claim an active job');
      assert.equal(await finish(job,uuid()),false,'wrong lease cannot write');
      assert.equal(await finish(job),true);assert.equal(await finish(job),false,'terminal write is idempotent');completed++;
    }
  }
  const states=(await db.query('select state,count(*)::int as count from document_processing_jobs where id=any($1::uuid[]) group by state',[ids])).rows;
  assert.deepEqual(states,[{state:'ready',count:n}]);
  console.log(JSON.stringify({scenario:'durable SQL batch',documents:n,terminal:completed,peakActive:peak}));
}

const first=await enqueue(users[0],5),second=await enqueue(users[1],5);
const held=[];
for(const id of [...first,...second]){const j=await claim(id,2,3);if(j)held.push(j);}
assert.equal(held.length,3,'global cap applies across users');
assert.equal(held.filter(j=>j.user_id===users[0]).length,2,'user cap applies across batches');
for(const j of held)await finish(j);
for(const id of [...first,...second]){const j=await claim(id);if(j)await finish(j);}

const retryId=(await enqueue(users[1],1))[0];let retry=await claim(retryId);
await db.query('select fail_document_workflow_job($1,$2,$3,true)',[retry.id,retry.lease_token,'NETWORK_ERROR']);
assert.equal(await claim(retryId),undefined,'backoff prevents immediate retry');
await db.query("update document_processing_jobs set next_attempt_at=now()-interval '1 second' where id=$1",[retryId]);
retry=await claim(retryId);assert.equal(retry.attempt,2);
await db.query("update document_processing_jobs set lease_expires_at=now()-interval '1 second' where id=$1",[retryId]);
assert.equal(await finish(retry),false,'expired lease cannot write');
await db.query('select recover_document_workflow_jobs()');
const recovered=await claim(retryId);assert.equal(recovered.attempt,3);
assert.equal(await finish(retry),false,'old worker cannot overwrite new attempt');
await db.query("update document_processing_jobs set lease_expires_at=now()-interval '1 second' where id=$1",[retryId]);
await db.query('select recover_document_workflow_jobs()');
assert.equal((await db.query('select state from document_processing_jobs where id=$1',[retryId])).rows[0].state,'failed');

const permanent=await claim((await enqueue(users[1],1))[0]);
await db.query('select fail_document_workflow_job($1,$2,$3,false)',[permanent.id,permanent.lease_token,'FILE_CORRUPT']);
assert.equal(await claim(permanent.id),undefined,'permanent failures are terminal');

const quota=await claim((await enqueue(users[1],1))[0]);
await db.query('update test_usage set used=100 where user_id=$1',[users[1]]);
await assert.rejects(finish(quota),/DOCUMENT_LIMIT_REACHED/);
assert.equal((await db.query('select state from document_processing_jobs where id=$1',[quota.id])).rows[0].state,'processing','failed completion rolls back result');
await db.query('update test_usage set used=1,allowed=false where user_id=$1',[users[1]]);
await assert.rejects(finish(quota),/ACCOUNT_READ_ONLY/);
await db.query('update test_usage set allowed=true where user_id=$1',[users[1]]);
assert.equal(await finish(quota),true);
assert.equal((await db.query('select used from test_usage where user_id=$1',[users[1]])).rows[0].used,2,'successful result consumes exactly once');

for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  await assert.rejects(db.query('select * from claim_document_workflow_job($1)',[uuid()]),/permission denied/);
  await db.exec('reset role');
}
await db.close();
console.log('Workflow lease, tenant caps, duplicate delivery, backoff, stale recovery, quota and RPC privileges: PASS');
