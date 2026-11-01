-- DenkNote 0002: fixes uit de review.
-- 1) dn_store_suggestion vergelijkt ook met dn_notes.last_analyzed_version, zodat een trager,
--    ouder resultaat nooit wint van een nieuwere versie die "niets toe te voegen" opleverde.
-- 2) dn_match_notes zoekt iteratief in de gedeelde HNSW-index (pgvector >= 0.8), zodat het
--    filter op user_id niet tot lege resultaten leidt; kandidaten worden daarna opnieuw gesorteerd.

create or replace function public.dn_store_suggestion(
  p_user uuid, p_note_id uuid, p_version integer,
  p_question text, p_action text, p_related uuid[], p_analyzed_content text,
  p_allow_same_version boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_related uuid[];
  v_last integer;
begin
  select last_analyzed_version into v_last from public.dn_notes where id = p_note_id and user_id = p_user for update;
  if not found then
    raise exception 'note not found' using errcode = 'P0002';
  end if;
  if v_last > p_version or (v_last = p_version and not p_allow_same_version) then
    return null;
  end if;
  if exists (select 1 from public.dn_ai_suggestions s
             where s.note_id = p_note_id
               and (s.content_version > p_version
                    or (s.content_version = p_version and not p_allow_same_version))) then
    return null;
  end if;
  select coalesce(array_agg(n.id order by array_position(p_related, n.id)), '{}')
    into v_related
  from public.dn_notes n
  where n.id = any(coalesce(p_related, '{}')) and n.user_id = p_user and n.id <> p_note_id;
  insert into public.dn_ai_suggestions (user_id, note_id, content_version, question, proposed_action, related_note_ids)
  values (p_user, p_note_id, p_version, nullif(btrim(p_question), ''), nullif(btrim(p_action), ''), v_related[1:2])
  returning id into v_id;
  update public.dn_notes
    set last_analyzed_version = p_version, last_analyzed_content = p_analyzed_content
    where id = p_note_id and last_analyzed_version < p_version;
  return v_id;
end;
$$;
revoke all on function public.dn_store_suggestion(uuid, uuid, integer, text, text, uuid[], text, boolean) from public, anon, authenticated;
grant execute on function public.dn_store_suggestion(uuid, uuid, integer, text, text, uuid[], text, boolean) to service_role;

create or replace function public.dn_match_notes(p_note_id uuid, p_count integer default 5, p_min_similarity double precision default 0.3)
returns table (note_id uuid, title text, snippet text, similarity double precision)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_query extensions.vector(1536);
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.dn_profiles p where p.user_id = v_uid and p.allow_related) then
    return;
  end if;
  select e.embedding into v_query
  from public.dn_note_embeddings e
  join public.dn_notes n on n.id = e.note_id
  where e.note_id = p_note_id and n.user_id = v_uid and e.user_id = v_uid;
  if v_query is null then
    return;
  end if;
  perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
  return query
    with candidates as materialized (
      select e.note_id as id, (e.embedding operator(extensions.<=>) v_query) as dist
      from public.dn_note_embeddings e
      where e.user_id = v_uid and e.note_id <> p_note_id
      order by e.embedding operator(extensions.<=>) v_query
      limit 40
    )
    select n.id, n.title, left(n.content, 400), (1 - c.dist)::double precision
    from candidates c
    join public.dn_notes n on n.id = c.id and n.user_id = v_uid
    where (1 - c.dist) >= p_min_similarity
    order by c.dist
    limit least(greatest(p_count, 1), 10);
end;
$$;
revoke all on function public.dn_match_notes(uuid, integer, double precision) from public, anon;
grant execute on function public.dn_match_notes(uuid, integer, double precision) to authenticated, service_role;
