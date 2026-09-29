
create or replace function public.save_ledger_state(
  p_expected_version bigint,
  p_state jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_new_version bigint;
begin
  update public.ledger_state
  set state = p_state,
      version = version + 1,
      updated_at = now()
  where user_id = (select auth.uid())
    and version = p_expected_version
  returning version into v_new_version;

  return v_new_version;
end;
$$;

revoke all on function public.save_ledger_state(bigint,jsonb) from public;
revoke all on function public.save_ledger_state(bigint,jsonb) from anon;
grant execute on function public.save_ledger_state(bigint,jsonb) to authenticated;

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]
where id='kwinest-documents';
