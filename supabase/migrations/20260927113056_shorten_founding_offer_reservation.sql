create or replace function public.reserve_founding_offer(p_user_id uuid)
  returns table(eligible boolean, founder_number integer)
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_existing public.founding_offer_claims%rowtype;
    v_next integer;
  begin
    perform pg_advisory_xact_lock(74542893);
    delete from public.founding_offer_claims
      where status='reserved' and reserved_until < now();

    select * into v_existing
      from public.founding_offer_claims
      where user_id=p_user_id;

    if found then
      if v_existing.status='activated' then
        return query select false,v_existing.founder_number;
        return;
      end if;
      update public.founding_offer_claims
        set reserved_until=now()+interval '75 minutes',updated_at=now()
        where user_id=p_user_id;
      return query select true,v_existing.founder_number;
      return;
    end if;

    select slot into v_next
    from generate_series(1,100) as slot
    where not exists (
      select 1 from public.founding_offer_claims f where f.founder_number=slot
    )
    order by slot
    limit 1;

    if v_next is null then
      return query select false,null::integer;
      return;
    end if;

    insert into public.founding_offer_claims(user_id,founder_number,status,reserved_until)
      values(p_user_id,v_next,'reserved',now()+interval '75 minutes');

    return query select true,v_next;
  end;
  $$;

  revoke all on function public.reserve_founding_offer(uuid) from public, anon, authenticated;
  grant execute on function public.reserve_founding_offer(uuid) to service_role;
