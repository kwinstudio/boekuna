
alter table public.documents
  add column if not exists client_ref text;

create unique index if not exists documents_user_client_ref_uidx
  on public.documents(user_id, client_ref)
  where client_ref is not null;
