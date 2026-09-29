create table if not exists public.document_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  client_ref text not null,
  batch_id text not null,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  requested_kind text not null default 'auto',
  state text not null default 'queued' check (state in ('received','queued','processing','validating','ready','review_required','failed')),
  phase text not null default 'received' check (phase in ('received','queued','read','validate','complete')),
  attempt integer not null default 0 check (attempt >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 5),
  result jsonb,
  review_fields text[] not null default '{}',
  review_message text,
  error_code text,
  error_reference text,
  error_retryable boolean not null default false,
  company_context jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  resolved_at timestamptz,
  constraint document_processing_jobs_user_document_unique unique (user_id, document_id)
);

create index if not exists document_processing_jobs_user_updated_idx
  on public.document_processing_jobs(user_id, updated_at desc);
create index if not exists document_processing_jobs_user_batch_idx
  on public.document_processing_jobs(user_id, batch_id);
create index if not exists document_processing_jobs_document_id_idx
  on public.document_processing_jobs(document_id);
create index if not exists document_processing_jobs_active_idx
  on public.document_processing_jobs(user_id, state)
  where state in ('received','queued','processing','validating');

alter table public.document_processing_jobs enable row level security;

drop policy if exists "document_processing_jobs_select_own" on public.document_processing_jobs;
create policy "document_processing_jobs_select_own"
on public.document_processing_jobs
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "document_processing_jobs_mfa_guard" on public.document_processing_jobs;
create policy "document_processing_jobs_mfa_guard"
on public.document_processing_jobs
as restrictive
for select
to authenticated
using ((((select auth.jwt())->>'aal') = 'aal2') or not (select private.current_user_has_verified_mfa()));

grant select on public.document_processing_jobs to authenticated;
revoke insert, update, delete on public.document_processing_jobs from anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.document_processing_jobs;
exception
  when duplicate_object then null;
end $$;
