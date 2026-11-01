-- Anonieme groeicijfers zonder tracking: alleen tellingen uit bestaande tabellen, geen persoonsgegevens.
-- Gebruik (alleen met service-rol): select * from public.quitte_stats(30);
create or replace function public.quitte_stats(p_days int default 30)
returns table (day date, lists_created bigint, people_joined bigint, expenses_added bigint, lists_activated bigint)
language sql stable security definer set search_path = '' as $$
  with days as (
    select generate_series((current_date - (greatest(1, least(p_days, 365)) - 1)), current_date, interval '1 day')::date as day
  ),
  first_member as (
    select distinct on (list_id) list_id, id from public.quitte_members order by list_id, created_at
  ),
  parts as (
    select l.id,
      (select min(e.created_at) from public.quitte_entries e where e.list_id = l.id) as first_entry,
      (select m.created_at from public.quitte_members m where m.list_id = l.id and m.claimed order by m.created_at offset 1 limit 1) as second_person
    from public.quitte_lists l
  ),
  activated as (
    -- Geactiveerd = minstens 2 mensen doen mee op hun eigen telefoon én er is 1 uitgave.
    select id, case when first_entry is null or second_person is null then null else greatest(first_entry, second_person) end as at from parts
  )
  select d.day,
    (select count(*) from public.quitte_lists l where l.created_at::date = d.day),
    (select count(*) from public.quitte_members m left join first_member f on f.id = m.id
       where m.claimed and f.id is null and m.created_at::date = d.day),
    (select count(*) from public.quitte_entries e where e.created_at::date = d.day and e.kind = 'expense'),
    (select count(*) from activated a where a.at::date = d.day)
  from days d order by d.day desc
$$;
revoke all on function public.quitte_stats(int) from public, anon, authenticated;
