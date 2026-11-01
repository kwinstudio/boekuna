-- DenkNote: strikt geïsoleerde tabellen (prefix dn_) in het gedeelde Supabase-project.
-- Raakt geen tabellen van andere apps. Elke tabel heeft RLS; de client krijgt alleen
-- expliciete kolomrechten. Servervelden (versies, analyse-status) zijn niet door de client te zetten.

create extension if not exists vector with schema extensions;

-- ── Profiel / instellingen die de server moet kennen ─────────────────────────
create table public.dn_profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  default_ai_mode text not null default 'silent' check (default_ai_mode in ('silent', 'thinking')),
  allow_related boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ── Notities ─────────────────────────────────────────────────────────────────
create table public.dn_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 300),
  content text not null default '' check (char_length(content) <= 40000),
  ai_mode text not null default 'silent' check (ai_mode in ('silent', 'thinking')),
  content_version integer not null default 1,
  last_analyzed_version integer not null default 0,
  last_analyzed_content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dn_notes_user_updated_idx on public.dn_notes (user_id, updated_at desc);

-- Versie en tijdstempel worden uitsluitend door de database bepaald.
create or replace function public.dn_notes_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.content_version := 1;
    new.last_analyzed_version := 0;
    new.last_analyzed_content := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  if new.title is distinct from old.title or new.content is distinct from old.content then
    new.content_version := old.content_version + 1;
    new.updated_at := now();
  else
    new.content_version := old.content_version;
  end if;
  return new;
end;
$$;
create trigger dn_notes_before_write
  before insert or update on public.dn_notes
  for each row execute function public.dn_notes_before_write();

-- ── AI-gesprekken ────────────────────────────────────────────────────────────
create table public.dn_ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null references public.dn_notes(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 12000),
  created_at timestamptz not null default now()
);
create index dn_ai_messages_note_idx on public.dn_ai_messages (note_id, created_at);
create index dn_ai_messages_user_idx on public.dn_ai_messages (user_id);

-- ── AI-suggesties ────────────────────────────────────────────────────────────
create table public.dn_ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null references public.dn_notes(id) on delete cascade,
  content_version integer not null,
  question text check (char_length(question) <= 500),
  proposed_action text check (char_length(proposed_action) <= 500),
  related_note_ids uuid[] not null default '{}' check (cardinality(related_note_ids) <= 2),
  dismissed boolean not null default false,
  question_dismissed boolean not null default false,
  action_dismissed boolean not null default false,
  created_at timestamptz not null default now()
);
create index dn_ai_suggestions_note_idx on public.dn_ai_suggestions (note_id, content_version desc);
create index dn_ai_suggestions_user_idx on public.dn_ai_suggestions (user_id);

-- ── Acties ───────────────────────────────────────────────────────────────────
create table public.dn_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note_id uuid references public.dn_notes(id) on delete set null,
  suggestion_id uuid references public.dn_ai_suggestions(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index dn_tasks_user_idx on public.dn_tasks (user_id, completed, created_at desc);
create index dn_tasks_note_idx on public.dn_tasks (note_id);
create index dn_tasks_suggestion_idx on public.dn_tasks (suggestion_id);

create or replace function public.dn_tasks_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  if new.completed and (tg_op = 'INSERT' or not old.completed) then
    new.completed_at := now();
  elsif not new.completed then
    new.completed_at := null;
  end if;
  return new;
end;
$$;
create trigger dn_tasks_before_write
  before insert or update on public.dn_tasks
  for each row execute function public.dn_tasks_before_write();

-- ── Embeddings (alleen server) ───────────────────────────────────────────────
create table public.dn_note_embeddings (
  note_id uuid primary key references public.dn_notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  embedding extensions.vector(1536) not null,
  content_version integer not null,
  updated_at timestamptz not null default now()
);
create index dn_note_embeddings_user_idx on public.dn_note_embeddings (user_id);
create index dn_note_embeddings_hnsw on public.dn_note_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

-- ── Verzoeklimieten (alleen server) ──────────────────────────────────────────
create table public.dn_rate_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  created_at timestamptz not null default now()
);
create index dn_rate_events_lookup_idx on public.dn_rate_events (user_id, bucket, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.dn_profiles enable row level security;
alter table public.dn_notes enable row level security;
alter table public.dn_ai_messages enable row level security;
alter table public.dn_ai_suggestions enable row level security;
alter table public.dn_tasks enable row level security;
alter table public.dn_note_embeddings enable row level security;
alter table public.dn_rate_events enable row level security;

-- Supabase geeft standaard alle rechten aan anon/authenticated: eerst alles intrekken.
revoke all on public.dn_profiles, public.dn_notes, public.dn_ai_messages, public.dn_ai_suggestions,
  public.dn_tasks, public.dn_note_embeddings, public.dn_rate_events from anon, authenticated;

grant select, insert (default_ai_mode, allow_related), update (default_ai_mode, allow_related)
  on public.dn_profiles to authenticated;
create policy dn_profiles_select on public.dn_profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy dn_profiles_insert on public.dn_profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy dn_profiles_update on public.dn_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert (id, title, content, ai_mode), update (title, content, ai_mode), delete
  on public.dn_notes to authenticated;
create policy dn_notes_select on public.dn_notes for select to authenticated
  using (user_id = (select auth.uid()));
create policy dn_notes_insert on public.dn_notes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy dn_notes_update on public.dn_notes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy dn_notes_delete on public.dn_notes for delete to authenticated
  using (user_id = (select auth.uid()));

-- Berichten worden alleen door de Edge Function geschreven.
grant select on public.dn_ai_messages to authenticated;
create policy dn_ai_messages_select on public.dn_ai_messages for select to authenticated
  using (user_id = (select auth.uid()));

grant select, update (dismissed, question_dismissed, action_dismissed) on public.dn_ai_suggestions to authenticated;
create policy dn_ai_suggestions_select on public.dn_ai_suggestions for select to authenticated
  using (user_id = (select auth.uid()));
create policy dn_ai_suggestions_update on public.dn_ai_suggestions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert (id, note_id, suggestion_id, title, completed), update (title, completed), delete
  on public.dn_tasks to authenticated;
create policy dn_tasks_select on public.dn_tasks for select to authenticated
  using (user_id = (select auth.uid()));
create policy dn_tasks_insert on public.dn_tasks for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (note_id is null or exists (
      select 1 from public.dn_notes n where n.id = note_id and n.user_id = (select auth.uid())))
    and (suggestion_id is null or exists (
      select 1 from public.dn_ai_suggestions s where s.id = suggestion_id and s.user_id = (select auth.uid())))
  );
create policy dn_tasks_update on public.dn_tasks for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy dn_tasks_delete on public.dn_tasks for delete to authenticated
  using (user_id = (select auth.uid()));

-- dn_note_embeddings en dn_rate_events: geen clientrechten, geen policies (alleen service role).

-- ── Serverfuncties ───────────────────────────────────────────────────────────

-- Vergelijkbare notities: gebruiker komt uit de JWT (auth.uid()), nooit uit een parameter.
create or replace function public.dn_match_notes(p_note_id uuid, p_count integer default 5, p_min_similarity double precision default 0.3)
returns table (note_id uuid, title text, snippet text, similarity double precision)
language plpgsql
stable
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
  return query
    select n.id, n.title, left(n.content, 400),
           (1 - (e.embedding operator(extensions.<=>) v_query))::double precision as sim
    from public.dn_note_embeddings e
    join public.dn_notes n on n.id = e.note_id and n.user_id = v_uid
    where e.user_id = v_uid and e.note_id <> p_note_id
      and (1 - (e.embedding operator(extensions.<=>) v_query)) >= p_min_similarity
    order by e.embedding operator(extensions.<=>) v_query
    limit least(greatest(p_count, 1), 10);
end;
$$;
revoke all on function public.dn_match_notes(uuid, integer, double precision) from public, anon;
grant execute on function public.dn_match_notes(uuid, integer, double precision) to authenticated, service_role;

-- Suggestie opslaan zonder dat een ouder resultaat een nieuwere versie overschrijft.
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
begin
  perform 1 from public.dn_notes where id = p_note_id and user_id = p_user for update;
  if not found then
    raise exception 'note not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.dn_ai_suggestions s
             where s.note_id = p_note_id
               and (s.content_version > p_version
                    or (s.content_version = p_version and not p_allow_same_version))) then
    return null; -- er is al een resultaat voor een nieuwere (of dezelfde) versie
  end if;
  -- Alleen bestaande notities van dezelfde gebruiker, nooit de notitie zelf.
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

-- Markeer een versie als geanalyseerd zonder suggesties (bijv. niets zinvols te zeggen).
create or replace function public.dn_mark_analyzed(p_user uuid, p_note_id uuid, p_version integer, p_analyzed_content text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.dn_notes
    set last_analyzed_version = p_version, last_analyzed_content = p_analyzed_content
    where id = p_note_id and user_id = p_user and last_analyzed_version < p_version;
$$;
revoke all on function public.dn_mark_analyzed(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.dn_mark_analyzed(uuid, uuid, integer, text) to service_role;

-- Embedding alleen vervangen door een nieuwere versie.
create or replace function public.dn_upsert_embedding(p_user uuid, p_note_id uuid, p_version integer, p_embedding extensions.vector(1536))
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if not exists (select 1 from public.dn_notes where id = p_note_id and user_id = p_user) then
    raise exception 'note not found' using errcode = 'P0002';
  end if;
  insert into public.dn_note_embeddings (note_id, user_id, embedding, content_version, updated_at)
  values (p_note_id, p_user, p_embedding, p_version, now())
  on conflict (note_id) do update
    set embedding = excluded.embedding, content_version = excluded.content_version, updated_at = now()
    where public.dn_note_embeddings.content_version < excluded.content_version;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;
revoke all on function public.dn_upsert_embedding(uuid, uuid, integer, extensions.vector) from public, anon, authenticated;
grant execute on function public.dn_upsert_embedding(uuid, uuid, integer, extensions.vector) to service_role;

-- Verzoeklimiet: true = toegestaan (en geteld), false = limiet bereikt.
create or replace function public.dn_take_rate(p_user uuid, p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_bucket, 0));
  select count(*) into v_count from public.dn_rate_events
    where user_id = p_user and bucket = p_bucket
      and created_at > now() - make_interval(secs => p_window_seconds);
  if v_count >= p_limit then
    return false;
  end if;
  insert into public.dn_rate_events (user_id, bucket) values (p_user, p_bucket);
  return true;
end;
$$;
revoke all on function public.dn_take_rate(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.dn_take_rate(uuid, text, integer, integer) to service_role;

-- Eigen gegevens verwijderen gebeurt vanuit de app via RLS (delete op dn_notes, dn_tasks, dn_profiles);
-- cascades ruimen berichten, suggesties en embeddings op. Raakt geen data van andere apps.
grant delete on public.dn_profiles to authenticated;
create policy dn_profiles_delete on public.dn_profiles for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on function public.dn_notes_before_write() from public, anon, authenticated;
revoke all on function public.dn_tasks_before_write() from public, anon, authenticated;
