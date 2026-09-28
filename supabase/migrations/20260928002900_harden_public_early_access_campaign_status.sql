
alter table public.early_access_campaign
  add column if not exists issued_claims smallint not null default 0
  check (issued_claims between 0 and 100);

update public.early_access_campaign c
set issued_claims=(select count(*)::smallint from public.early_access_claims),
    updated_at=now()
where c.id=1;

create or replace function private.refresh_early_access_campaign_count()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count smallint;
  v_max smallint;
begin
  select count(*)::smallint into v_count
  from public.early_access_claims;

  select max_claims into v_max
  from public.early_access_campaign
  where id=1;

  update public.early_access_campaign
  set issued_claims=v_count,
      is_open=case when v_count >= v_max then false else is_open end,
      closed_at=case
        when v_count >= v_max then coalesce(closed_at,now())
        else closed_at
      end,
      updated_at=now()
  where id=1;

  return null;
end
$$;

revoke all on function private.refresh_early_access_campaign_count() from public,anon,authenticated;

drop trigger if exists refresh_early_access_campaign_count on public.early_access_claims;
create trigger refresh_early_access_campaign_count
after insert or delete on public.early_access_claims
for each statement
execute function private.refresh_early_access_campaign_count();

drop policy if exists early_access_campaign_public_read on public.early_access_campaign;
create policy early_access_campaign_public_read
on public.early_access_campaign
for select
to anon,authenticated
using (id=1);

grant select on public.early_access_campaign to anon,authenticated;

create or replace function public.get_early_access_campaign_status()
returns table(is_open boolean, issued_claims integer, max_claims integer, closed_at timestamptz)
language sql
stable
security invoker
set search_path=''
as $$
  select
    c.is_open and c.issued_claims < c.max_claims,
    c.issued_claims::integer,
    c.max_claims::integer,
    c.closed_at
  from public.early_access_campaign c
  where c.id=1
$$;

revoke all on function public.get_early_access_campaign_status() from public;
grant execute on function public.get_early_access_campaign_status() to anon,authenticated,service_role;
