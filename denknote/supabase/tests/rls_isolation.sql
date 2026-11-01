-- RLS- en accountscheidingstest voor DenkNote.
-- Draait volledig binnen één transactie en eindigt altijd met een exception,
-- zodat alles wordt teruggedraaid. Uitkomst staat in de foutmelding:
--   "DENKNOTE_RLS_RESULT: PASS (n checks)" of "DENKNOTE_RLS_RESULT: FAIL ...".
do $$
declare
  a uuid := '0d000000-0000-4000-8000-00000000000a';
  b uuid := '0d000000-0000-4000-8000-00000000000b';
  note_a uuid := '0d000000-0000-4000-8000-0000000000a1';
  note_a2 uuid := '0d000000-0000-4000-8000-0000000000a2';
  sugg_a uuid;
  n int;
  failures text[] := '{}';
  checks int := 0;
  v text;
  vbool boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dn-rls-a@example.invalid', now(), now()),
         (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dn-rls-b@example.invalid', now(), now());

  -- ── Gebruiker A maakt data aan ──
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.dn_profiles (default_ai_mode, allow_related) values ('thinking', true);
  insert into public.dn_notes (id, title, content, ai_mode) values (note_a, 'Geheim plan A', 'inhoud van A', 'thinking');
  insert into public.dn_notes (id, title, content) values (note_a2, 'Tweede', 'nog iets');
  insert into public.dn_tasks (title, note_id) values ('Taak van A', note_a);
  update public.dn_notes set content = 'inhoud van A, aangepast' where id = note_a;
  select content_version into n from public.dn_notes where id = note_a;
  checks := checks + 1; if n <> 2 then failures := failures || format('versie na bewerking = %s, verwacht 2', n); end if;
  update public.dn_notes set ai_mode = 'silent' where id = note_a;
  select content_version into n from public.dn_notes where id = note_a;
  checks := checks + 1; if n <> 2 then failures := failures || 'modus wisselen verhoogde content_version'; end if;
  execute 'reset role';

  -- Server (service role-equivalent) maakt AI-data voor A.
  insert into public.dn_ai_messages (user_id, note_id, role, content) values (a, note_a, 'user', 'vraag van A');
  sugg_a := public.dn_store_suggestion(a, note_a, 2, 'Vraag?', 'Stap.', array[note_a2, note_a, '0d000000-0000-4000-8000-0000000000ff']::uuid[], 'tekst', false);
  checks := checks + 1;
  select related_note_ids::text into v from public.dn_ai_suggestions where id = sugg_a;
  if v <> '{' || note_a2 || '}' then failures := failures || ('related_note_ids gefilterd verkeerd: ' || v); end if;
  -- Ouder resultaat mag een nieuwere versie niet overschrijven.
  checks := checks + 1;
  if public.dn_store_suggestion(a, note_a, 1, 'Oud', null, '{}', 'oud', false) is not null then
    failures := failures || 'oudere versie werd toch opgeslagen';
  end if;
  checks := checks + 1;
  if public.dn_store_suggestion(a, note_a, 2, 'Nogmaals', null, '{}', 'tekst', false) is not null then
    failures := failures || 'zelfde versie zonder Denk mee werd dubbel opgeslagen';
  end if;
  checks := checks + 1;
  if public.dn_store_suggestion(a, note_a, 2, 'Handmatig', null, '{}', 'tekst', true) is null then
    failures := failures || 'Denk mee op dezelfde versie werd geweigerd';
  end if;
  -- Server mag geen notitie van A koppelen aan B.
  checks := checks + 1;
  begin
    perform public.dn_store_suggestion(b, note_a, 3, 'x', null, '{}', 'x', false);
    failures := failures || 'dn_store_suggestion accepteerde notitie van andere gebruiker';
  exception when others then null;
  end;
  checks := checks + 1;
  begin
    perform public.dn_upsert_embedding(b, note_a, 3, array_fill(0.01::real, array[1536])::extensions.vector);
    failures := failures || 'dn_upsert_embedding accepteerde notitie van andere gebruiker';
  exception when others then null;
  end;
  perform public.dn_upsert_embedding(a, note_a, 2, array_fill(0.01::real, array[1536])::extensions.vector);
  perform public.dn_upsert_embedding(a, note_a2, 1, array_fill(0.02::real, array[1536])::extensions.vector);
  checks := checks + 1;
  if public.dn_upsert_embedding(a, note_a, 1, array_fill(0.5::real, array[1536])::extensions.vector) then
    failures := failures || 'oudere embedding overschreef nieuwere';
  end if;

  -- ── Gebruiker B probeert bij data van A te komen ──
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.dn_notes; checks := checks + 1;
  if n <> 0 then failures := failures || format('B ziet %s notities van A', n); end if;
  select count(*) into n from public.dn_ai_messages; checks := checks + 1;
  if n <> 0 then failures := failures || 'B ziet berichten van A'; end if;
  select count(*) into n from public.dn_ai_suggestions; checks := checks + 1;
  if n <> 0 then failures := failures || 'B ziet suggesties van A'; end if;
  select count(*) into n from public.dn_tasks; checks := checks + 1;
  if n <> 0 then failures := failures || 'B ziet taken van A'; end if;
  select count(*) into n from public.dn_profiles; checks := checks + 1;
  if n <> 0 then failures := failures || 'B ziet profiel van A'; end if;

  update public.dn_notes set content = 'gehackt' where id = note_a;
  get diagnostics n = row_count; checks := checks + 1;
  if n <> 0 then failures := failures || 'B kon notitie van A wijzigen'; end if;
  delete from public.dn_notes where id = note_a;
  get diagnostics n = row_count; checks := checks + 1;
  if n <> 0 then failures := failures || 'B kon notitie van A verwijderen'; end if;
  update public.dn_ai_suggestions set dismissed = true where id = sugg_a;
  get diagnostics n = row_count; checks := checks + 1;
  if n <> 0 then failures := failures || 'B kon suggestie van A wegklikken'; end if;

  -- Taak koppelen aan notitie van A moet falen.
  checks := checks + 1;
  begin
    insert into public.dn_tasks (title, note_id) values ('kaping', note_a);
    failures := failures || 'B kon taak aan notitie van A koppelen';
  exception when insufficient_privilege or check_violation then null;
  end;
  -- user_id vervalsen bij insert kan niet (geen kolomrecht).
  checks := checks + 1;
  begin
    execute format('insert into public.dn_notes (user_id, title) values (%L, %L)', a, 'vals');
    failures := failures || 'B kon user_id zelf zetten';
  exception when insufficient_privilege then null;
  end;
  -- Serverkolommen niet door client te zetten.
  checks := checks + 1;
  begin
    execute 'update public.dn_notes set last_analyzed_version = 99';
    failures := failures || 'client kon last_analyzed_version zetten';
  exception when insufficient_privilege then null;
  end;
  -- Geen directe toegang tot embeddings / limieten / serverfuncties.
  checks := checks + 1;
  begin
    execute 'select count(*) from public.dn_note_embeddings';
    failures := failures || 'client kan embeddings lezen';
  exception when insufficient_privilege then null;
  end;
  checks := checks + 1;
  begin
    execute 'select count(*) from public.dn_rate_events';
    failures := failures || 'client kan limieten lezen';
  exception when insufficient_privilege then null;
  end;
  checks := checks + 1;
  begin
    execute format('select public.dn_store_suggestion(%L, %L, 9, %L, null, %L, %L, true)', b, note_a, 'x', '{}', 'x');
    failures := failures || 'client kan dn_store_suggestion aanroepen';
  exception when insufficient_privilege then null;
  end;
  checks := checks + 1;
  begin
    execute format('select public.dn_take_rate(%L, %L, 1000, 60)', b, 'x');
    failures := failures || 'client kan dn_take_rate aanroepen';
  exception when insufficient_privilege then null;
  end;
  -- Vectorzoeken op notitie van A geeft niets (gebruiker komt uit JWT).
  select count(*) into n from public.dn_match_notes(note_a, 5, 0); checks := checks + 1;
  if n <> 0 then failures := failures || 'B kreeg vergelijkbare notities van A'; end if;
  execute 'reset role';

  -- ── A ziet eigen verbanden wel ──
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.dn_match_notes(note_a, 5, 0); checks := checks + 1;
  if n <> 1 then failures := failures || format('A kreeg %s vergelijkbare notities, verwacht 1', n); end if;
  update public.dn_profiles set allow_related = false;
  select count(*) into n from public.dn_match_notes(note_a, 5, 0); checks := checks + 1;
  if n <> 0 then failures := failures || 'verbanden zonder toestemming'; end if;
  select count(*) into n from public.dn_notes; checks := checks + 1;
  if n <> 2 then failures := failures || format('A ziet %s eigen notities, verwacht 2', n); end if;
  -- Eigen gegevens verwijderen (cascade).
  delete from public.dn_tasks;
  delete from public.dn_notes;
  delete from public.dn_profiles;
  execute 'reset role';
  select count(*) into n from public.dn_ai_messages where user_id = a; checks := checks + 1;
  if n <> 0 then failures := failures || 'berichten bleven staan na verwijderen notities'; end if;
  select count(*) into n from public.dn_note_embeddings where user_id = a; checks := checks + 1;
  if n <> 0 then failures := failures || 'embeddings bleven staan na verwijderen notities'; end if;

  -- Verzoeklimiet.
  checks := checks + 1;
  vbool := public.dn_take_rate(b, 'test', 2, 60) and public.dn_take_rate(b, 'test', 2, 60);
  if not vbool or public.dn_take_rate(b, 'test', 2, 60) then failures := failures || 'verzoeklimiet werkt niet'; end if;

  if cardinality(failures) = 0 then
    raise exception 'DENKNOTE_RLS_RESULT: PASS (% checks)', checks;
  else
    raise exception 'DENKNOTE_RLS_RESULT: FAIL (% van % checks): %', cardinality(failures), checks, array_to_string(failures, ' | ');
  end if;
end;
$$;
