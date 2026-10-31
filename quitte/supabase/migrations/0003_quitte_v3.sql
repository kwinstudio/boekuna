-- Quitte v3: reacties, personen samenvoegen, lijstinstellingen, "gewijzigd door", backupsleutel.
alter table public.quitte_lists add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.quitte_entries add column if not exists updated_by uuid;
alter table public.quitte_backups add column if not exists key_hash text unique;

create table if not exists public.quitte_comments (
  id uuid primary key,
  list_id uuid not null references public.quitte_lists(id) on delete cascade,
  entry_id uuid not null,
  member_id uuid,
  body text check (body is null or char_length(body) <= 500),
  emoji text check (emoji is null or char_length(emoji) <= 16),
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists quitte_comments_list_idx on public.quitte_comments(list_id);
alter table public.quitte_comments enable row level security;
revoke all on public.quitte_comments from anon, authenticated;

create or replace function public.quitte__apply_ext(p_list uuid, p_op jsonb, p_ts timestamptz)
returns void language plpgsql set search_path = '' as $$
declare v_d jsonb := p_op->'data'; v_from uuid; v_into uuid;
begin
  if p_op->>'op' = 'comment' then
    insert into public.quitte_comments as c (id, list_id, entry_id, member_id, body, emoji, deleted, created_at)
      values ((v_d->>'id')::uuid, p_list, (v_d->>'entryId')::uuid, (v_d->>'memberId')::uuid,
              nullif(trim(coalesce(v_d->>'body', '')), ''), nullif(v_d->>'emoji', ''),
              coalesce((v_d->>'deleted')::boolean, false), p_ts)
      on conflict (id) do update set deleted = excluded.deleted where c.list_id = p_list;

  elsif p_op->>'op' = 'merge' then
    v_from := (v_d->>'from')::uuid; v_into := (v_d->>'into')::uuid;
    if v_from = v_into or not exists (select 1 from public.quitte_members where id = v_into and list_id = p_list)
       or not exists (select 1 from public.quitte_members where id = v_from and list_id = p_list) then
      raise exception 'quitte_bad_merge';
    end if;
    update public.quitte_entries e set
      payers = (select jsonb_agg(jsonb_build_object('m', m, 'a', a)) from (
                 select case when (p->>'m')::uuid = v_from then v_into else (p->>'m')::uuid end as m, sum((p->>'a')::bigint) as a
                 from jsonb_array_elements(e.payers) p group by 1) s),
      shares = (select jsonb_agg(jsonb_build_object('m', m, 'a', a)) from (
                 select case when (p->>'m')::uuid = v_from then v_into else (p->>'m')::uuid end as m, sum((p->>'a')::bigint) as a
                 from jsonb_array_elements(e.shares) p group by 1) s),
      updated_at = p_ts
      where e.list_id = p_list and (e.payers::text like '%' || v_from::text || '%' or e.shares::text like '%' || v_from::text || '%');
    update public.quitte_members set deleted = true, updated_at = p_ts where id = v_from and list_id = p_list;
    update public.quitte_comments set member_id = v_into where list_id = p_list and member_id = v_from;

  elsif p_op->>'op' = 'settings' then
    update public.quitte_lists set settings = settings || coalesce(v_d->'settings', '{}'::jsonb), updated_at = p_ts
      where id = p_list;
  else
    raise exception 'quitte_unknown_op';
  end if;
end $$;

create or replace function public.quitte__state(p_list uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'list', (select jsonb_build_object('id', l.id, 'name', l.name, 'currency', l.currency,
              'archived', l.archived, 'rev', l.rev, 'updatedAt', l.updated_at, 'createdAt', l.created_at,
              'splitKeys', l.split_keys, 'settings', l.settings)
             from public.quitte_lists l where l.id = p_list),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'iban', m.iban,
              'payLink', m.pay_link, 'claimed', m.claimed, 'deleted', m.deleted, 'updatedAt', m.updated_at)
              order by m.created_at)
             from public.quitte_members m where m.list_id = p_list), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(public.quitte__entry_json(e) || jsonb_build_object('updatedBy', e.updated_by)
              order by e.occurred_on desc, e.created_at desc)
             from public.quitte_entries e where e.list_id = p_list and not e.deleted), '[]'::jsonb),
    'trash', coalesce((select jsonb_agg(public.quitte__entry_json(e) || jsonb_build_object('updatedBy', e.updated_by)
              order by e.deleted_at desc)
             from public.quitte_entries e where e.list_id = p_list and e.deleted
               and e.batch_id is null and e.deleted_at > now() - interval '30 days'), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'entryId', c.entry_id, 'memberId', c.member_id,
              'body', c.body, 'emoji', c.emoji, 'at', c.created_at) order by c.created_at)
             from public.quitte_comments c where c.list_id = p_list and not c.deleted), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(x order by (x->>'id')::bigint desc) from (
              select jsonb_build_object('id', a.id, 'actor', a.actor, 'summary', a.summary, 'at', a.created_at) x
              from public.quitte_activity a where a.list_id = p_list order by a.id desc limit 100) s), '[]'::jsonb)
  )
$$;

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
          orig_currency, orig_amount, rate, photos, repeat, repeat_next, updated_by)
        values ((v_d->>'id')::uuid, v_list, v_d->>'kind', coalesce(v_d->>'title', ''), (v_d->>'amount')::bigint,
          nullif(v_d->>'category', ''), coalesce((v_d->>'date')::date, current_date), v_d->'payers', v_d->'shares',
          coalesce(v_d->>'splitMode', 'equal'), v_d->'weights', (v_d->>'batchId')::uuid, nullif(v_d->>'note', ''),
          (v_d->>'createdBy')::uuid, v_del, case when v_del then now() end, v_ts,
          nullif(v_d->>'origCurrency', ''), (v_d->>'origAmount')::bigint, (v_d->>'rate')::numeric,
          coalesce(v_d->'photos', '[]'::jsonb), nullif(v_d->>'repeat', ''), (v_d->>'repeatNext')::date,
          (v_d->>'updatedBy')::uuid)
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
          repeat_next = case when v_d ? 'repeatNext' then excluded.repeat_next else e.repeat_next end,
          updated_by = case when v_d ? 'updatedBy' then excluded.updated_by else e.updated_by end
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
      perform public.quitte__apply_ext(v_list, v_op, v_ts);
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

revoke all on function public.quitte__apply_ext(uuid, jsonb, timestamptz) from public, anon, authenticated;
