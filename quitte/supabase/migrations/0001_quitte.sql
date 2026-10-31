-- Quitte: groepsuitgaven delen zonder account.
-- Toegang uitsluitend via SECURITY DEFINER-functies met een geheim lijst-token
-- (128+ bits, alleen als SHA-256-hash opgeslagen). Tabellen hebben RLS aan en
-- geen policies, dus anon/authenticated kunnen er niet rechtstreeks bij.

create table if not exists public.quitte_lists (
  id uuid primary key,
  token_hash text not null unique,
  name text not null check (char_length(name) between 1 and 80),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  archived boolean not null default false,
  rev bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quitte_members (
  id uuid primary key,
  list_id uuid not null references public.quitte_lists(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  iban text check (iban is null or char_length(iban) <= 40),
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quitte_members_list_idx on public.quitte_members(list_id);

create table if not exists public.quitte_entries (
  id uuid primary key,
  list_id uuid not null references public.quitte_lists(id) on delete cascade,
  kind text not null check (kind in ('expense','income','transfer')),
  title text not null default '' check (char_length(title) <= 120),
  amount bigint not null check (amount > 0 and amount < 100000000000),
  category text check (category is null or char_length(category) <= 24),
  occurred_on date not null default current_date,
  payers jsonb not null,
  shares jsonb not null,
  split_mode text not null default 'equal' check (split_mode in ('equal','amounts','shares')),
  weights jsonb,
  batch_id uuid,
  note text check (note is null or char_length(note) <= 500),
  created_by uuid,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quitte_entries_list_idx on public.quitte_entries(list_id);

create table if not exists public.quitte_activity (
  id bigint generated always as identity primary key,
  list_id uuid not null references public.quitte_lists(id) on delete cascade,
  actor text not null default '' check (char_length(actor) <= 40),
  summary text not null check (char_length(summary) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists quitte_activity_list_idx on public.quitte_activity(list_id, id desc);

alter table public.quitte_lists enable row level security;
alter table public.quitte_members enable row level security;
alter table public.quitte_entries enable row level security;
alter table public.quitte_activity enable row level security;
revoke all on public.quitte_lists, public.quitte_members, public.quitte_entries, public.quitte_activity from anon, authenticated;

-- Hulpfuncties ---------------------------------------------------------------

create or replace function public.quitte__hash(p_token text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;

create or replace function public.quitte__list_id(p_token text, p_lock boolean default false)
returns uuid language plpgsql set search_path = '' as $$
declare v uuid;
begin
  if p_token is null or char_length(p_token) < 24 or char_length(p_token) > 64 then
    raise exception 'quitte_not_found' using errcode = 'P0002';
  end if;
  if p_lock then
    select id into v from public.quitte_lists where token_hash = public.quitte__hash(p_token) for update;
  else
    select id into v from public.quitte_lists where token_hash = public.quitte__hash(p_token);
  end if;
  if v is null then
    raise exception 'quitte_not_found' using errcode = 'P0002';
  end if;
  return v;
end $$;

-- Controleert een verdeling [{"m": member_id, "a": centen}, ...]
create or replace function public.quitte__check_parts(p_parts jsonb, p_amount bigint, p_list uuid)
returns void language plpgsql set search_path = '' as $$
declare v_sum bigint := 0; v_part jsonb; v_cnt int;
begin
  if jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) = 0 or jsonb_array_length(p_parts) > 100 then
    raise exception 'quitte_invalid_parts';
  end if;
  for v_part in select * from jsonb_array_elements(p_parts) loop
    if (v_part->>'a')::bigint < 0 then raise exception 'quitte_invalid_parts'; end if;
    v_sum := v_sum + (v_part->>'a')::bigint;
    select count(*) into v_cnt from public.quitte_members
      where id = (v_part->>'m')::uuid and list_id = p_list;
    if v_cnt = 0 then raise exception 'quitte_unknown_member'; end if;
  end loop;
  if v_sum <> p_amount then raise exception 'quitte_parts_mismatch'; end if;
end $$;

create or replace function public.quitte__state(p_list uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'list', (select jsonb_build_object('id', l.id, 'name', l.name, 'currency', l.currency,
              'archived', l.archived, 'rev', l.rev, 'updatedAt', l.updated_at, 'createdAt', l.created_at)
             from public.quitte_lists l where l.id = p_list),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'iban', m.iban,
              'deleted', m.deleted, 'updatedAt', m.updated_at) order by m.created_at)
             from public.quitte_members m where m.list_id = p_list), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'title', e.title,
              'amount', e.amount, 'category', e.category, 'date', e.occurred_on, 'payers', e.payers,
              'shares', e.shares, 'splitMode', e.split_mode, 'weights', e.weights, 'batchId', e.batch_id,
              'note', e.note, 'createdBy', e.created_by, 'createdAt', e.created_at, 'updatedAt', e.updated_at)
              order by e.occurred_on desc, e.created_at desc)
             from public.quitte_entries e where e.list_id = p_list and not e.deleted), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(x order by (x->>'id')::bigint desc) from (
              select jsonb_build_object('id', a.id, 'actor', a.actor, 'summary', a.summary, 'at', a.created_at) x
              from public.quitte_activity a where a.list_id = p_list order by a.id desc limit 100) s), '[]'::jsonb)
  )
$$;

-- Publieke API -----------------------------------------------------------------

create or replace function public.quitte_create_list(p_token text, p_list jsonb, p_members jsonb, p_actor text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := (p_list->>'id')::uuid; v_m jsonb;
begin
  if p_token is null or char_length(p_token) < 24 or char_length(p_token) > 64 then
    raise exception 'quitte_bad_token';
  end if;
  if jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) = 0 or jsonb_array_length(p_members) > 100 then
    raise exception 'quitte_invalid_members';
  end if;
  -- Idempotent: dezelfde lijst opnieuw aanmaken (offline herhaling) geeft de bestaande terug.
  if exists (select 1 from public.quitte_lists where id = v_id) then
    if not exists (select 1 from public.quitte_lists where id = v_id and token_hash = public.quitte__hash(p_token)) then
      raise exception 'quitte_conflict';
    end if;
    return public.quitte__state(v_id);
  end if;
  insert into public.quitte_lists (id, token_hash, name, currency)
    values (v_id, public.quitte__hash(p_token), trim(p_list->>'name'), coalesce(p_list->>'currency', 'EUR'));
  for v_m in select * from jsonb_array_elements(p_members) loop
    insert into public.quitte_members (id, list_id, name)
      values ((v_m->>'id')::uuid, v_id, trim(v_m->>'name'));
  end loop;
  insert into public.quitte_activity (list_id, actor, summary)
    values (v_id, left(coalesce(p_actor, ''), 40), 'Lijst aangemaakt');
  return public.quitte__state(v_id);
end $$;

create or replace function public.quitte_get_state(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.quitte__state(public.quitte__list_id(p_token));
end $$;

create or replace function public.quitte_get_rev(p_token text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  select rev into v from public.quitte_lists where id = public.quitte__list_id(p_token);
  return v;
end $$;

-- Past een reeks bewerkingen toe (idempotent, last-write-wins per record).
create or replace function public.quitte_apply(p_token text, p_ops jsonb, p_actor text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_list uuid := public.quitte__list_id(p_token, true);
  v_op jsonb; v_d jsonb; v_ts timestamptz; v_rows int;
begin
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 200 then
    raise exception 'quitte_invalid_ops';
  end if;
  for v_op in select * from jsonb_array_elements(p_ops) loop
    v_d := v_op->'data';
    v_ts := coalesce((v_d->>'updatedAt')::timestamptz, now());
    if v_ts > now() + interval '5 minutes' then v_ts := now(); end if;

    if v_op->>'op' = 'member' then
      insert into public.quitte_members as m (id, list_id, name, iban, deleted, updated_at)
        values ((v_d->>'id')::uuid, v_list, trim(v_d->>'name'), nullif(trim(coalesce(v_d->>'iban', '')), ''),
                coalesce((v_d->>'deleted')::boolean, false), v_ts)
        on conflict (id) do update set name = excluded.name, iban = excluded.iban,
          deleted = excluded.deleted, updated_at = excluded.updated_at
        where m.list_id = v_list and m.updated_at <= excluded.updated_at;

    elsif v_op->>'op' = 'entry' then
      if not coalesce((v_d->>'deleted')::boolean, false) then
        perform public.quitte__check_parts(v_d->'payers', (v_d->>'amount')::bigint, v_list);
        perform public.quitte__check_parts(v_d->'shares', (v_d->>'amount')::bigint, v_list);
      end if;
      insert into public.quitte_entries as e (id, list_id, kind, title, amount, category, occurred_on,
          payers, shares, split_mode, weights, batch_id, note, created_by, deleted, updated_at)
        values ((v_d->>'id')::uuid, v_list, v_d->>'kind', coalesce(v_d->>'title', ''), (v_d->>'amount')::bigint,
          nullif(v_d->>'category', ''), coalesce((v_d->>'date')::date, current_date), v_d->'payers', v_d->'shares',
          coalesce(v_d->>'splitMode', 'equal'), v_d->'weights', (v_d->>'batchId')::uuid, nullif(v_d->>'note', ''),
          (v_d->>'createdBy')::uuid, coalesce((v_d->>'deleted')::boolean, false), v_ts)
        on conflict (id) do update set kind = excluded.kind, title = excluded.title, amount = excluded.amount,
          category = excluded.category, occurred_on = excluded.occurred_on, payers = excluded.payers,
          shares = excluded.shares, split_mode = excluded.split_mode, weights = excluded.weights,
          batch_id = excluded.batch_id, note = excluded.note, deleted = excluded.deleted,
          updated_at = excluded.updated_at
        where e.list_id = v_list and e.updated_at <= excluded.updated_at;

    elsif v_op->>'op' = 'delete_batch' then
      update public.quitte_entries set deleted = true, updated_at = v_ts
        where list_id = v_list and batch_id = (v_op->>'batchId')::uuid;

    elsif v_op->>'op' = 'list' then
      update public.quitte_lists set
        name = coalesce(nullif(trim(v_d->>'name'), ''), name),
        currency = coalesce(v_d->>'currency', currency),
        archived = coalesce((v_d->>'archived')::boolean, archived),
        updated_at = v_ts
        where id = v_list and updated_at <= v_ts;
    else
      raise exception 'quitte_unknown_op';
    end if;

    if coalesce(v_op->>'summary', '') <> '' then
      insert into public.quitte_activity (list_id, actor, summary)
        values (v_list, left(coalesce(p_actor, ''), 40), left(v_op->>'summary', 200));
    end if;
  end loop;

  update public.quitte_lists set rev = rev + 1 where id = v_list;
  return public.quitte__state(v_list);
end $$;

revoke all on function public.quitte__hash(text), public.quitte__list_id(text, boolean),
  public.quitte__check_parts(jsonb, bigint, uuid), public.quitte__state(uuid) from public, anon, authenticated;
revoke all on function public.quitte_create_list(text, jsonb, jsonb, text), public.quitte_get_state(text),
  public.quitte_get_rev(text), public.quitte_apply(text, jsonb, text) from public;
grant execute on function public.quitte_create_list(text, jsonb, jsonb, text), public.quitte_get_state(text),
  public.quitte_get_rev(text), public.quitte_apply(text, jsonb, text) to anon, authenticated;
