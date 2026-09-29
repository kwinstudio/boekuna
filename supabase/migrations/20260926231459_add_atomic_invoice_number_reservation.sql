
create table if not exists public.invoice_sequences (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_year integer not null check (book_year between 2000 and 2100),
  prefix text not null check (char_length(prefix) between 1 and 40),
  next_number bigint not null default 1 check (next_number >= 1),
  updated_at timestamptz not null default now(),
  primary key (user_id, book_year, prefix)
);

alter table public.invoice_sequences enable row level security;

drop policy if exists invoice_sequences_select_own on public.invoice_sequences;
create policy invoice_sequences_select_own
on public.invoice_sequences
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.invoice_sequences from anon, authenticated;
grant select on public.invoice_sequences to authenticated;

create or replace function public.reserve_invoice_number(p_year integer, p_prefix text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_prefix text := left(coalesce(nullif(trim(p_prefix),''), p_year::text || '-'), 40);
  v_seed bigint := 1;
  v_num bigint;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_year < 2000 or p_year > 2100 then
    raise exception 'INVALID_YEAR' using errcode = '22023';
  end if;

  select greatest(
    coalesce(nullif(ls.state->'meta'->>'nextInvoice','')::bigint, 1),
    coalesce(max(
      case
        when left(inv.item->>'number', char_length(v_prefix)) = v_prefix
         and substring(inv.item->>'number' from char_length(v_prefix)+1) ~ '^[0-9]+$'
        then substring(inv.item->>'number' from char_length(v_prefix)+1)::bigint
        else null
      end
    ), 0) + 1
  )
  into v_seed
  from public.ledger_state ls
  left join lateral jsonb_array_elements(coalesce(ls.state->'invoices','[]'::jsonb)) as inv(item) on true
  where ls.user_id = v_uid
  group by ls.state;

  v_seed := coalesce(v_seed, 1);

  insert into public.invoice_sequences(user_id, book_year, prefix, next_number, updated_at)
  values (v_uid, p_year, v_prefix, v_seed + 1, now())
  on conflict (user_id, book_year, prefix)
  do update set
    next_number = public.invoice_sequences.next_number + 1,
    updated_at = now()
  returning next_number - 1 into v_num;

  return v_prefix || lpad(v_num::text, 4, '0');
end;
$$;

revoke all on function public.reserve_invoice_number(integer,text) from public, anon;
grant execute on function public.reserve_invoice_number(integer,text) to authenticated, service_role;
