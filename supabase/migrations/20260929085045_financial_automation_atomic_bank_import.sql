create or replace function public.commit_financial_bank_import(
  p_user_id uuid,
  p_import jsonb,
  p_transactions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_id uuid;
  v_count integer;
begin
  if p_user_id is null or p_import is null or p_transactions is null or jsonb_typeof(p_transactions) <> 'array' then
    raise exception 'INVALID_BANK_IMPORT_INPUT' using errcode='22023';
  end if;
  v_count := jsonb_array_length(p_transactions);
  if v_count > 5000 then
    raise exception 'BANK_TOO_MANY_TRANSACTIONS' using errcode='22023';
  end if;

  insert into public.bank_imports(
    user_id,source_format,source_file_hash,source_name,account_iban,period_start,period_end,
    transaction_count,credit_total_cents,debit_total_cents,duplicate_count,warning_count
  ) values (
    p_user_id,
    p_import->>'source_format',
    p_import->>'source_file_hash',
    nullif(p_import->>'source_name',''),
    nullif(p_import->>'account_iban',''),
    nullif(p_import->>'period_start','')::date,
    nullif(p_import->>'period_end','')::date,
    coalesce((p_import->>'transaction_count')::integer,0),
    coalesce((p_import->>'credit_total_cents')::bigint,0),
    coalesce((p_import->>'debit_total_cents')::bigint,0),
    coalesce((p_import->>'duplicate_count')::integer,0),
    coalesce((p_import->>'warning_count')::integer,0)
  ) returning id into v_import_id;

  insert into public.bank_transactions(
    user_id,bank_import_id,transaction_id,account_iban,counterparty_name,counterparty_iban,
    booking_date,value_date,amount_cents,currency,description,end_to_end_id,bank_reference,
    credit_debit,source_format,source_file_hash,transaction_fingerprint
  )
  select
    p_user_id,
    v_import_id,
    nullif(x->>'transaction_id',''),
    nullif(x->>'account_iban',''),
    nullif(x->>'counterparty_name',''),
    nullif(x->>'counterparty_iban',''),
    (x->>'booking_date')::date,
    nullif(x->>'value_date','')::date,
    (x->>'amount_cents')::bigint,
    x->>'currency',
    coalesce(x->>'description',''),
    nullif(x->>'end_to_end_id',''),
    nullif(x->>'bank_reference',''),
    x->>'credit_debit',
    x->>'source_format',
    x->>'source_file_hash',
    x->>'transaction_fingerprint'
  from jsonb_array_elements(p_transactions) x;

  if (select count(*) from public.bank_transactions where bank_import_id=v_import_id) <> v_count then
    raise exception 'BANK_IMPORT_COUNT_MISMATCH';
  end if;
  return v_import_id;
end
$$;

revoke all on function public.commit_financial_bank_import(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.commit_financial_bank_import(uuid,jsonb,jsonb) to service_role;
