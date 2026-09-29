
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles(user_id, company)
  values (new.id, coalesce(new.raw_user_meta_data->'company', '{}'::jsonb))
  on conflict (user_id) do nothing;

  insert into public.ledger_state(user_id, state)
  values (
    new.id,
    jsonb_build_object(
      'meta', jsonb_build_object('nextInvoice', 1, 'taxReservePct', 30),
      'company', '{}'::jsonb,
      'contacts', '[]'::jsonb,
      'invoices', '[]'::jsonb,
      'expenses', '[]'::jsonb,
      'transactions', '[]'::jsonb,
      'hours', '[]'::jsonb,
      'mileage', '[]'::jsonb,
      'documents', '[]'::jsonb,
      'bookings', '[]'::jsonb,
      'plannedCash', '[]'::jsonb,
      'settlements', '[]'::jsonb,
      'audit', '[]'::jsonb
    )
  )
  on conflict (user_id) do nothing;

  return new;
end;
$function$;

insert into public.ledger_revisions(user_id, version, state)
select ls.user_id, ls.version, ls.state
from public.ledger_state ls
where exists (
  select 1
  from jsonb_array_elements(coalesce(ls.state->'contacts','[]'::jsonb)) c
  where coalesce((c->>'demo')::boolean,false)
);

update public.ledger_state ls
set state = jsonb_set(
      ls.state,
      '{contacts}',
      coalesce(
        (
          select jsonb_agg(c)
          from jsonb_array_elements(coalesce(ls.state->'contacts','[]'::jsonb)) c
          where not coalesce((c->>'demo')::boolean,false)
        ),
        '[]'::jsonb
      ),
      true
    ),
    version = ls.version + 1,
    updated_at = now()
where exists (
  select 1
  from jsonb_array_elements(coalesce(ls.state->'contacts','[]'::jsonb)) c
  where coalesce((c->>'demo')::boolean,false)
);
