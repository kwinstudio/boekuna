alter table public.documents
  add constraint documents_user_client_ref_key unique (user_id, client_ref);

create table public.document_verification_jobs (
  user_id uuid not null,
  document_ref text not null,
  verification_version integer not null default 1,
  status text not null default 'running' check (status in ('running','completed','failed')),
  attempts integer not null default 1 check (attempts >= 0 and attempts <= 10),
  result jsonb,
  last_error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, document_ref, verification_version),
  constraint document_verification_jobs_document_fkey
    foreign key (user_id, document_ref)
    references public.documents(user_id, client_ref)
    on delete cascade
);

alter table public.document_verification_jobs enable row level security;
revoke all on table public.document_verification_jobs from anon, authenticated;
create index document_verification_jobs_status_idx
  on public.document_verification_jobs(status, updated_at);
