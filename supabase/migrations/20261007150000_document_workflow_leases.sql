-- Optional execution adapter for the EXISTING document_processing_jobs queue.
-- Dormant until DOCUMENT_EXECUTION_MODE=workflow and a recovery schedule exists.
alter table public.document_processing_jobs
  add column execution_mode text not null default 'legacy' check (execution_mode in ('legacy','workflow')),
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column next_attempt_at timestamptz not null default now(),
  add column workflow_run_id text,
  add column usage_recorded_at timestamptz;

create index document_processing_workflow_due_idx
  on public.document_processing_jobs(next_attempt_at,created_at)
  where execution_mode='workflow' and state='queued';

create or replace function public.claim_document_workflow_job(p_job_id uuid,p_user_limit integer default 4,p_global_limit integer default 4)
returns setof public.document_processing_jobs
language plpgsql security definer set search_path=''
as $$
declare v_job public.document_processing_jobs; v_user_active integer; v_global_active integer;
begin
  -- Serializes count+claim across workers, batches and users. No session lock.
  perform pg_catalog.pg_advisory_xact_lock(7742026,1);
  select * into v_job from public.document_processing_jobs where id=p_job_id for update;
  if not found or v_job.execution_mode<>'workflow' or v_job.state<>'queued'
     or v_job.attempt>=v_job.max_attempts or v_job.next_attempt_at>now() then return; end if;
  select count(*) into v_user_active from public.document_processing_jobs
    where user_id=v_job.user_id and state in ('processing','validating');
  select count(*) into v_global_active from public.document_processing_jobs
    where state in ('processing','validating');
  if v_user_active>=greatest(1,least(p_user_limit,16)) or v_global_active>=greatest(1,least(p_global_limit,16)) then return; end if;
  return query update public.document_processing_jobs
    set state='processing',phase='read',attempt=attempt+1,lease_token=gen_random_uuid(),
        lease_expires_at=now()+interval '10 minutes',started_at=now(),updated_at=now(),
        completed_at=null,error_code=null,error_retryable=false
    where id=p_job_id returning *;
end $$;

-- These wrappers are service-role-only and bind the existing user-scoped
-- entitlement/quota RPCs to an atomically claimed job. No user token is stored.
create or replace function public.document_workflow_access(p_job_id uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_job public.document_processing_jobs; v_claims text; v_quota jsonb; v_access boolean;
begin
  select * into v_job from public.document_processing_jobs
    where id=p_job_id and lease_token=p_lease and lease_expires_at>now() and state='processing';
  if not found then raise exception 'JOB_LEASE_INVALID' using errcode='42501'; end if;
  v_claims:=current_setting('request.jwt.claims',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_job.user_id,'role','authenticated')::text,true);
  v_access:=public.can_operate_bookkeeping();
  select to_jsonb(q) into v_quota from public.check_document_quota() q;
  if v_job.usage_recorded_at is not null then v_quota:=jsonb_set(v_quota,'{allowed}','true'); end if;
  perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
  return jsonb_build_object('canOperate',v_access,'quota',v_quota);
end $$;

create or replace function public.complete_document_workflow_job(p_job_id uuid,p_lease uuid,p_analysis jsonb,p_review_fields text[],p_review_message text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_job public.document_processing_jobs; v_claims text; v_quota jsonb; v_usage jsonb;
begin
  -- Same lock order as claim. The result and usage commit in one transaction.
  perform pg_catalog.pg_advisory_xact_lock(7742026,1);
  select * into v_job from public.document_processing_jobs where id=p_job_id for update;
  if not found or v_job.execution_mode<>'workflow' or v_job.state not in ('processing','validating')
     or p_lease is null or v_job.lease_expires_at is null
     or v_job.lease_token is distinct from p_lease or v_job.lease_expires_at<=now() then return false; end if;
  if p_analysis is null or jsonb_typeof(p_analysis)<>'object' then raise exception 'INVALID_ANALYSIS'; end if;
  v_claims:=current_setting('request.jwt.claims',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_job.user_id,'role','authenticated')::text,true);
  if not public.can_operate_bookkeeping() then raise exception 'ACCOUNT_READ_ONLY' using errcode='42501'; end if;
  select to_jsonb(q) into v_quota from public.check_document_quota() q;
  if v_job.usage_recorded_at is null and not coalesce((v_quota->>'allowed')::boolean,false) then raise exception 'DOCUMENT_LIMIT_REACHED' using errcode='42501'; end if;
  if v_job.usage_recorded_at is null then
    select to_jsonb(u) into v_usage from public.record_document_usage() u;
  end if;
  perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
  update public.document_processing_jobs
    set state=case when cardinality(coalesce(p_review_fields,'{}'))>0 then 'review_required' else 'ready' end,
        phase='complete',result=jsonb_build_object('analysis',p_analysis),
        review_fields=coalesce(p_review_fields,'{}'),review_message=p_review_message,
        error_code=null,error_reference=null,error_retryable=false,
        usage_recorded_at=coalesce(usage_recorded_at,now()),completed_at=now(),updated_at=now(),
        lease_token=null,lease_expires_at=null
    where id=p_job_id;
  return true;
end $$;

create or replace function public.fail_document_workflow_job(p_job_id uuid,p_lease uuid,p_code text,p_retryable boolean)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_job public.document_processing_jobs;
begin
  select * into v_job from public.document_processing_jobs where id=p_job_id for update;
  if not found or v_job.execution_mode<>'workflow' or v_job.state not in ('processing','validating')
     or p_lease is null or v_job.lease_expires_at is null
     or v_job.lease_token is distinct from p_lease or v_job.lease_expires_at<=now() then return false; end if;
  update public.document_processing_jobs
    set state=case when p_retryable and attempt<max_attempts then 'queued' else 'failed' end,
        phase=case when p_retryable and attempt<max_attempts then 'queued' else 'complete' end,
        next_attempt_at=now()+make_interval(secs=>least(300,15*(2^(attempt-1))::integer)),
        error_code=left(p_code,80),error_retryable=p_retryable and attempt<max_attempts,
        completed_at=case when not p_retryable or attempt>=max_attempts then now() else null end,
        updated_at=now(),lease_token=null,lease_expires_at=null where id=p_job_id;
  return true;
end $$;

create or replace function public.recover_document_workflow_jobs()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
  update public.document_processing_jobs
    set state=case when attempt<max_attempts then 'queued' else 'failed' end,
        phase=case when attempt<max_attempts then 'queued' else 'complete' end,
        error_code='PROCESSING_TIMEOUT',error_retryable=attempt<max_attempts,
        completed_at=case when attempt>=max_attempts then now() else null end,
        next_attempt_at=now(),updated_at=now(),lease_token=null,lease_expires_at=null
    where execution_mode='workflow' and state in ('processing','validating') and lease_expires_at<now();
  get diagnostics v_count=row_count;
  return v_count;
end $$;

revoke all on function public.claim_document_workflow_job(uuid,integer,integer),
  public.document_workflow_access(uuid,uuid),
  public.complete_document_workflow_job(uuid,uuid,jsonb,text[],text),
  public.fail_document_workflow_job(uuid,uuid,text,boolean),
  public.recover_document_workflow_jobs() from public,anon,authenticated;
grant execute on function public.claim_document_workflow_job(uuid,integer,integer),
  public.document_workflow_access(uuid,uuid),
  public.complete_document_workflow_job(uuid,uuid,jsonb,text[],text),
  public.fail_document_workflow_job(uuid,uuid,text,boolean),
  public.recover_document_workflow_jobs() to service_role;
