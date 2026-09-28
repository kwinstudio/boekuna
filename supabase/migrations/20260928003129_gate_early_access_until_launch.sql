
alter table public.early_access_campaign
  add column if not exists starts_at timestamptz;

-- Remove claims that were accidentally allocated by pre-launch QA to accounts
-- that already existed before the entitlement system itself was installed.
delete from public.early_access_identities i
using public.early_access_claims c, auth.users u
where i.claim_number=c.claim_number
  and c.current_user_id=u.id
  and c.source='verified_signup'
  and u.created_at < timestamptz '2026-09-28 00:06:56+00';

delete from public.early_access_claims c
using auth.users u
where c.current_user_id=u.id
  and c.source='verified_signup'
  and u.created_at < timestamptz '2026-09-28 00:06:56+00';

-- Pre-launch: do not allocate real campaign slots until the launch gate opens it.
update public.early_access_campaign
set is_open=false,
    starts_at=null,
    closed_at=null,
    issued_claims=(select count(*)::smallint from public.early_access_claims),
    updated_at=now()
where id=1;

create or replace function private.set_early_access_campaign_open(p_open boolean)
returns public.early_access_campaign
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row public.early_access_campaign%rowtype;
begin
  perform pg_advisory_xact_lock(91827041);

  select * into v_row
  from public.early_access_campaign
  where id=1
  for update;

  if not found then
    raise exception 'EARLY_ACCESS_CAMPAIGN_MISSING';
  end if;

  if p_open then
    if v_row.issued_claims >= v_row.max_claims then
      raise exception 'EARLY_ACCESS_FULL';
    end if;
    update public.early_access_campaign
    set is_open=true,
        starts_at=coalesce(starts_at,clock_timestamp()),
        closed_at=null,
        updated_at=now()
    where id=1
    returning * into v_row;
  else
    update public.early_access_campaign
    set is_open=false,
        closed_at=case when starts_at is null then null else coalesce(closed_at,clock_timestamp()) end,
        updated_at=now()
    where id=1
    returning * into v_row;
  end if;

  return v_row;
end
$$;

revoke all on function private.set_early_access_campaign_open(boolean) from public,anon,authenticated;
grant execute on function private.set_early_access_campaign_open(boolean) to service_role;

create or replace function private.ensure_early_access_claim(p_user_id uuid)
returns table(
  claim_number smallint,
  started_at timestamptz,
  ends_at timestamptz,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user auth.users%rowtype;
  v_email_hash text;
  v_existing_claim public.early_access_claims%rowtype;
  v_identity_claim smallint;
  v_next smallint;
  v_now timestamptz := clock_timestamp();
  v_kind text;
  v_eligible text;
  v_campaign_start timestamptz;
begin
  perform pg_advisory_xact_lock(91827041);

  select * into v_user
  from auth.users
  where id = p_user_id;

  if not found
     or v_user.email is null
     or v_user.email_confirmed_at is null
     or coalesce(v_user.is_anonymous,false) then
    return;
  end if;

  v_kind := lower(coalesce(
    v_user.raw_app_meta_data->>'boekuna_account_type',
    v_user.raw_app_meta_data->>'account_type',
    ''
  ));
  v_eligible := lower(coalesce(v_user.raw_app_meta_data->>'early_access_eligible','true'));

  if v_kind in ('internal','test','demo')
     or v_eligible in ('false','0','no') then
    return;
  end if;

  v_email_hash := encode(
    extensions.digest(lower(trim(v_user.email)),'sha256'),
    'hex'
  );

  -- A prior identity always resolves to the original immutable claim.
  select i.claim_number into v_identity_claim
  from public.early_access_identities i
  where i.identity_hash = v_email_hash;

  if found then
    select * into v_existing_claim
    from public.early_access_claims c
    where c.claim_number = v_identity_claim
    for update;

    if v_existing_claim.current_user_id is null then
      update public.early_access_claims
      set current_user_id = p_user_id,
          updated_at = v_now
      where public.early_access_claims.claim_number = v_existing_claim.claim_number
        and current_user_id is null
      returning * into v_existing_claim;
    end if;

    if v_existing_claim.current_user_id = p_user_id then
      return query select
        v_existing_claim.claim_number,
        v_existing_claim.started_at,
        v_existing_claim.ends_at,
        false;
    end if;
    return;
  end if;

  -- Existing participant changing email: preserve claim and remember both identities.
  select * into v_existing_claim
  from public.early_access_claims c
  where c.current_user_id = p_user_id
  for update;

  if found then
    insert into public.early_access_identities(identity_hash,claim_number)
    values (v_email_hash,v_existing_claim.claim_number)
    on conflict (identity_hash) do nothing;

    return query select
      v_existing_claim.claim_number,
      v_existing_claim.started_at,
      v_existing_claim.ends_at,
      false;
    return;
  end if;

  select c.starts_at into v_campaign_start
  from public.early_access_campaign c
  where c.id=1 and c.is_open=true
  for update;

  -- No new claims pre-launch/after closure, and no pre-existing accounts may
  -- consume a "new user" Early Access slot after the campaign starts.
  if not found
     or v_campaign_start is null
     or v_user.created_at < v_campaign_start then
    return;
  end if;

  select s::smallint into v_next
  from generate_series(1,100) s
  where not exists (
    select 1 from public.early_access_claims c where c.claim_number=s
  )
  order by s
  limit 1;

  if v_next is null then
    update public.early_access_campaign
    set is_open=false,
        closed_at=coalesce(closed_at,v_now),
        updated_at=v_now
    where id=1;
    return;
  end if;

  insert into public.early_access_claims(
    claim_number,current_user_id,original_user_id,
    started_at,ends_at,claimed_at,source,updated_at
  )
  values (
    v_next,p_user_id,p_user_id,
    v_now,v_now + interval '90 days',v_now,'verified_signup',v_now
  )
  returning * into v_existing_claim;

  insert into public.early_access_identities(identity_hash,claim_number)
  values (v_email_hash,v_next);

  if v_next = 100 then
    update public.early_access_campaign
    set is_open=false,
        closed_at=v_now,
        updated_at=v_now
    where id=1;
  end if;

  return query select
    v_existing_claim.claim_number,
    v_existing_claim.started_at,
    v_existing_claim.ends_at,
    true;
end
$$;

revoke all on function private.ensure_early_access_claim(uuid) from public,anon,authenticated;
grant execute on function private.ensure_early_access_claim(uuid) to service_role;
