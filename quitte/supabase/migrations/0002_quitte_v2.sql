-- Quitte v2: valuta per uitgave, foto's, terugkerende uitgaven, prullenbak (30 dagen),
-- betaallinks, naam claimen, gedeelde verdeelsleutels, apparaten (push) en Apple-backup.
-- Additief en compatibel met oudere app-versies (ontbrekende velden laten bestaande waarden staan).

alter table public.quitte_lists add column if not exists split_keys jsonb not null default '[]'::jsonb;
alter table public.quitte_members add column if not exists pay_link text check (pay_link is null or char_length(pay_link) <= 300);
alter table public.quitte_members add column if not exists claimed boolean not null default false;
alter table public.quitte_entries add column if not exists orig_currency text check (orig_currency is null or orig_currency ~ '^[A-Z]{3}$');
alter table public.quitte_entries add column if not exists orig_amount bigint check (orig_amount is null or orig_amount > 0);
alter table public.quitte_entries add column if not exists rate numeric(18,8);
alter table public.quitte_entries add column if not exists photos jsonb not null default '[]'::jsonb;
alter table public.quitte_entries add column if not exists repeat text check (repeat is null or repeat in ('weekly','monthly'));
alter table public.quitte_entries add column if not exists repeat_next date;
alter table public.quitte_entries add column if not exists repeat_parent uuid;
alter table public.quitte_entries add column if not exists deleted_at timestamptz;
alter table public.quitte_activity add column if not exists device text check (device is null or char_length(device) <= 80);

create table if not exists public.quitte_devices (
  list_id uuid not null references public.quitte_lists(id) on delete cascade,
  device_id text not null check (char_length(device_id) between 8 and 80),
  member_id uuid,
  apns_token text check (apns_token is null or char_length(apns_token) <= 200),
  lang text not null default 'nl',
  updated_at timestamptz not null default now(),
  primary key (list_id, device_id)
);
create table if not exists public.quitte_backups (
  owner_hash text primary key,
  lists jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.quitte_devices enable row level security;
alter table public.quitte_backups enable row level security;
revoke all on public.quitte_devices, public.quitte_backups from anon, authenticated;

-- Terugkerende uitgaven: maakt vervallen exemplaren aan met een vast id (idempotent).
create or replace function public.quitte__run_recurring(p_list uuid)
returns int language plpgsql set search_path = '' as $$
declare r record; v_next date; v_n int := 0; v_i int;
begin
  for r in select * from public.quitte_entries
           where list_id = p_list and repeat is not null and not deleted
             and repeat_next is not null and repeat_next <= current_date
           for update loop
    v_next := r.repeat_next; v_i := 0;
    while v_next <= current_date and v_i < 24 loop
      insert into public.quitte_entries (id, list_id, kind, title, amount, category, occurred_on, payers, shares,
          split_mode, weights, note, created_by, orig_currency, orig_amount, rate, repeat_parent, updated_at)
        values ((md5(r.id::text || ':' || v_next::text))::uuid, p_list, r.kind, r.title, r.amount, r.category, v_next,
          r.payers, r.shares, r.split_mode, r.weights, r.note, r.created_by, r.orig_currency, r.orig_amount, r.rate, r.id, now())
        on conflict (id) do nothing;
      v_n := v_n + 1; v_i := v_i + 1;
      v_next := case when r.repeat = 'weekly' then v_next + 7 else (v_next + interval '1 month')::date end;
    end loop;
    update public.quitte_entries set repeat_next = v_next where id = r.id;
  end loop;
  if v_n > 0 then update public.quitte_lists set rev = rev + 1 where id = p_list; end if;
  return v_n;
end $$;

create or replace function public.quitte__entry_json(e public.quitte_entries)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', e.id, 'kind', e.kind, 'title', e.title,
    'amount', e.amount, 'category', e.category, 'date', e.occurred_on, 'payers', e.payers,
    'shares', e.shares, 'splitMode', e.split_mode, 'weights', e.weights, 'batchId', e.batch_id,
    'note', e.note, 'createdBy', e.created_by, 'createdAt', e.created_at, 'updatedAt', e.updated_at,
    'origCurrency', e.orig_currency, 'origAmount', e.orig_amount, 'rate', e.rate, 'photos', e.photos,
    'repeat', e.repeat, 'repeatNext', e.repeat_next, 'repeatParent', e.repeat_parent, 'deletedAt', e.deleted_at)
$$;

create or replace function public.quitte__state(p_list uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'list', (select jsonb_build_object('id', l.id, 'name', l.name, 'currency', l.currency,
              'archived', l.archived, 'rev', l.rev, 'updatedAt', l.updated_at, 'createdAt', l.created_at,
              'splitKeys', l.split_keys)
             from public.quitte_lists l where l.id = p_list),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'iban', m.iban,
              'payLink', m.pay_link, 'claimed', m.claimed, 'deleted', m.deleted, 'updatedAt', m.updated_at)
              order by m.created_at)
             from public.quitte_members m where m.list_id = p_list), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(public.quitte__entry_json(e) order by e.occurred_on desc, e.created_at desc)
             from public.quitte_entries e where e.list_id = p_list and not e.deleted), '[]'::jsonb),
    'trash', coalesce((select jsonb_agg(public.quitte__entry_json(e) order by e.deleted_at desc)
             from public.quitte_entries e where e.list_id = p_list and e.deleted
               and e.batch_id is null and e.deleted_at > now() - interval '30 days'), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(x order by (x->>'id')::bigint desc) from (
              select jsonb_build_object('id', a.id, 'actor', a.actor, 'summary', a.summary, 'at', a.created_at) x
              from public.quitte_activity a where a.list_id = p_list order by a.id desc limit 100) s), '[]'::jsonb)
  )
$$;

create or replace function public.quitte_get_state(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_list uuid := public.quitte__list_id(p_token);
begin
  perform public.quitte__run_recurring(v_list);
  return public.quitte__state(v_list);
end $$;

drop function if exists public.quitte_apply(text, jsonb, text);
create or replace function public.quitte_apply(p_token text, p_ops jsonb, p_actor text default '', p_device text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_list uuid := public.quitte__list_id(p_token, true);
  v_op jsonb; v_d jsonb; v_ts timestamptz; v_del boolean;
begin
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 200 then
    raise exception 'quitte_invalid_ops';
  end if;
  for v_op in select * from jsonb_array_elements(p_ops) loop
    v_d := v_op->'data';
    v_ts := coalesce((v_d->>'updatedAt')::timestamptz, now());
    if v_ts > now() + interval '5 minutes' then v_ts := now(); end if;

    if v_op->>'op' = 'member' then
      insert into public.quitte_members as m (id, list_id, name, iban, pay_link, claimed, deleted, updated_at)
        values ((v_d->>'id')::uuid, v_list, trim(v_d->>'name'), nullif(trim(coalesce(v_d->>'iban', '')), ''),
                nullif(trim(coalesce(v_d->>'payLink', '')), ''), coalesce((v_d->>'claimed')::boolean, false),
                coalesce((v_d->>'deleted')::boolean, false), v_ts)
        on conflict (id) do update set name = excluded.name, iban = excluded.iban,
          pay_link = case when v_d ? 'payLink' then excluded.pay_link else m.pay_link end,
          claimed = case when v_d ? 'claimed' then excluded.claimed else m.claimed end,
          deleted = excluded.deleted, updated_at = excluded.updated_at
        where m.list_id = v_list and m.updated_at <= excluded.updated_at;

    elsif v_op->>'op' = 'entry' then
      v_del := coalesce((v_d->>'deleted')::boolean, false);
      if not v_del then
        perform public.quitte__check_parts(v_d->'payers', (v_d->>'amount')::bigint, v_list);
        perform public.quitte__check_parts(v_d->'shares', (v_d->>'amount')::bigint, v_list);
      end if;
      insert into public.quitte_entries as e (id, list_id, kind, title, amount, category, occurred_on,
          payers, shares, split_mode, weights, batch_id, note, created_by, deleted, deleted_at, updated_at,
          orig_currency, orig_amount, rate, photos, repeat, repeat_next)
        values ((v_d->>'id')::uuid, v_list, v_d->>'kind', coalesce(v_d->>'title', ''), (v_d->>'amount')::bigint,
          nullif(v_d->>'category', ''), coalesce((v_d->>'date')::date, current_date), v_d->'payers', v_d->'shares',
          coalesce(v_d->>'splitMode', 'equal'), v_d->'weights', (v_d->>'batchId')::uuid, nullif(v_d->>'note', ''),
          (v_d->>'createdBy')::uuid, v_del, case when v_del then now() end, v_ts,
          nullif(v_d->>'origCurrency', ''), (v_d->>'origAmount')::bigint, (v_d->>'rate')::numeric,
          coalesce(v_d->'photos', '[]'::jsonb), nullif(v_d->>'repeat', ''), (v_d->>'repeatNext')::date)
        on conflict (id) do update set kind = excluded.kind, title = excluded.title, amount = excluded.amount,
          category = excluded.category, occurred_on = excluded.occurred_on, payers = excluded.payers,
          shares = excluded.shares, split_mode = excluded.split_mode, weights = excluded.weights,
          batch_id = excluded.batch_id, note = excluded.note, deleted = excluded.deleted,
          deleted_at = case when excluded.deleted then coalesce(e.deleted_at, now()) else null end,
          updated_at = excluded.updated_at,
          orig_currency = case when v_d ? 'origCurrency' then excluded.orig_currency else e.orig_currency end,
          orig_amount = case when v_d ? 'origAmount' then excluded.orig_amount else e.orig_amount end,
          rate = case when v_d ? 'rate' then excluded.rate else e.rate end,
          photos = case when v_d ? 'photos' then excluded.photos else e.photos end,
          repeat = case when v_d ? 'repeat' then excluded.repeat else e.repeat end,
          repeat_next = case when v_d ? 'repeatNext' then excluded.repeat_next else e.repeat_next end
        where e.list_id = v_list and e.updated_at <= excluded.updated_at;

    elsif v_op->>'op' = 'delete_batch' then
      update public.quitte_entries set deleted = true, deleted_at = now(), updated_at = v_ts
        where list_id = v_list and batch_id = (v_op->>'batchId')::uuid;

    elsif v_op->>'op' = 'list' then
      update public.quitte_lists set
        name = coalesce(nullif(trim(v_d->>'name'), ''), name),
        currency = coalesce(v_d->>'currency', currency),
        archived = coalesce((v_d->>'archived')::boolean, archived),
        split_keys = case when jsonb_typeof(v_d->'splitKeys') = 'array' and jsonb_array_length(v_d->'splitKeys') <= 30
                          then v_d->'splitKeys' else split_keys end,
        updated_at = v_ts
        where id = v_list and updated_at <= v_ts;
    else
      raise exception 'quitte_unknown_op';
    end if;

    if coalesce(v_op->>'summary', '') <> '' then
      insert into public.quitte_activity (list_id, actor, summary, device)
        values (v_list, left(coalesce(p_actor, ''), 40), left(v_op->>'summary', 200), left(p_device, 80));
    end if;
  end loop;

  perform public.quitte__run_recurring(v_list);
  update public.quitte_lists set rev = rev + 1 where id = v_list;
  return public.quitte__state(v_list);
end $$;

-- Apparaat koppelen aan een lijst (voor pushmeldingen).
create or replace function public.quitte_register_device(p_token text, p_device text, p_member uuid default null,
  p_apns text default null, p_lang text default 'nl')
returns void language plpgsql security definer set search_path = '' as $$
declare v_list uuid := public.quitte__list_id(p_token);
begin
  if p_device is null or char_length(p_device) < 8 or char_length(p_device) > 80 then raise exception 'quitte_bad_device'; end if;
  insert into public.quitte_devices (list_id, device_id, member_id, apns_token, lang, updated_at)
    values (v_list, p_device, p_member, nullif(p_apns, ''), case when p_lang = 'en' then 'en' else 'nl' end, now())
    on conflict (list_id, device_id) do update set member_id = excluded.member_id,
      apns_token = coalesce(excluded.apns_token, public.quitte_devices.apns_token), lang = excluded.lang, updated_at = now();
end $$;

create or replace function public.quitte_unregister_device(p_token text, p_device text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.quitte_devices where list_id = public.quitte__list_id(p_token) and device_id = p_device;
end $$;

-- Privé-bucket voor bonnetjes; toegang alleen via ondertekende URL's uit de edge function.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('quitte-photos', 'quitte-photos', false, 5242880, array['image/jpeg','image/png','image/heic'])
  on conflict (id) do nothing;

revoke all on function public.quitte__run_recurring(uuid), public.quitte__entry_json(public.quitte_entries) from public, anon, authenticated;
revoke all on function public.quitte_apply(text, jsonb, text, text), public.quitte_register_device(text, text, uuid, text, text),
  public.quitte_unregister_device(text, text) from public;
grant execute on function public.quitte_apply(text, jsonb, text, text), public.quitte_register_device(text, text, uuid, text, text),
  public.quitte_unregister_device(text, text), public.quitte_get_state(text) to anon, authenticated;
