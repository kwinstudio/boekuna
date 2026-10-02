-- Planned movements remain forecast-only entries in the owner's ledger_state JSON.
-- No generated occurrence, journal entry, payment, or bank transaction is created.
-- Existing ledger RLS (SELECT/INSERT/UPDATE/DELETE), MFA restrictions and the
-- SECURITY INVOKER save_ledger_state RPC remain the only persistence boundary.
create or replace function public.normalize_planned_cash_recurrence()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan jsonb;
  v_plans jsonb := '[]'::jsonb;
  v_repeating text;
  v_date text;
  v_parsed_date date;
begin
  if not (new.state ? 'plannedCash') then
    return new;
  end if;
  if jsonb_typeof(new.state->'plannedCash') is distinct from 'array' then
    raise exception 'plannedCash must be an array' using errcode = '23514';
  end if;

  for v_plan in select value from jsonb_array_elements(new.state->'plannedCash') loop
    if jsonb_typeof(v_plan) is distinct from 'object' then
      raise exception 'Planned cash movement must be an object' using errcode = '23514';
    end if;
    v_repeating := coalesce(v_plan->>'repeating', 'oneoff');
    if v_repeating not in ('oneoff', 'weekly', 'monthly', 'quarterly', 'yearly') then
      raise exception 'Unsupported planned cash recurrence' using errcode = '23514';
    end if;
    -- Historical oneoff dates/amounts keep their previous behavior. New repeating
    -- definitions require a usable positive cash amount, direction and anchor.
    if v_repeating <> 'oneoff' then
      if jsonb_typeof(v_plan->'amount') is distinct from 'number'
         or (v_plan->>'amount')::numeric <= 0
         or coalesce(v_plan->>'type', '') not in ('in', 'out') then
        raise exception 'Invalid recurring planned cash amount or direction' using errcode = '23514';
      end if;
      v_date := v_plan->>'date';
      if v_date is null or v_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or left(v_date, 4) = '0000' then
        raise exception 'Invalid recurring planned cash start date' using errcode = '23514';
      end if;
      begin
        v_parsed_date := v_date::date;
      exception when datetime_field_overflow or invalid_datetime_format then
        raise exception 'Invalid recurring planned cash start date' using errcode = '23514';
      end;
      if to_char(v_parsed_date, 'YYYY-MM-DD') <> v_date then
        raise exception 'Invalid recurring planned cash start date' using errcode = '23514';
      end if;
    end if;
    v_plans := v_plans || jsonb_build_array(v_plan || jsonb_build_object('repeating', v_repeating));
  end loop;
  new.state := jsonb_set(new.state, '{plannedCash}', v_plans, false);
  return new;
end;
$$;

revoke all on function public.normalize_planned_cash_recurrence() from public, anon, authenticated;

drop trigger if exists ledger_state_planned_cash_recurrence on public.ledger_state;
create trigger ledger_state_planned_cash_recurrence
before insert or update of state on public.ledger_state
for each row execute function public.normalize_planned_cash_recurrence();

-- Run only for states containing legacy plans. The trigger adds the safe default
-- without changing any financial field, plan order, tenant owner or version.
update public.ledger_state
set state = state
where jsonb_typeof(state->'plannedCash') = 'array'
  and exists (
    select 1 from jsonb_array_elements(state->'plannedCash') as plan
    where jsonb_typeof(plan) = 'object' and (not (plan ? 'repeating') or plan->'repeating' = 'null'::jsonb)
  );
