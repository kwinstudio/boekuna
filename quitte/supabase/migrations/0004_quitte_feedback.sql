-- Quitte: berichten aan de maker ("Vraag of idee?") vanuit de app.
create table if not exists public.quitte_feedback (
  id bigint generated always as identity primary key,
  body text not null check (char_length(body) between 1 and 2000),
  contact text check (contact is null or char_length(contact) <= 120),
  device text check (device is null or char_length(device) <= 80),
  app_version text check (app_version is null or char_length(app_version) <= 20),
  created_at timestamptz not null default now()
);
create index if not exists quitte_feedback_device_idx on public.quitte_feedback(device, created_at);
alter table public.quitte_feedback enable row level security;
revoke all on public.quitte_feedback from anon, authenticated;

create or replace function public.quitte_send_feedback(p_body text, p_contact text default null, p_device text default null, p_version text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_body is null or char_length(trim(p_body)) = 0 or char_length(p_body) > 2000 then
    raise exception 'quitte_invalid_feedback';
  end if;
  if p_device is not null and (select count(*) from public.quitte_feedback
      where device = left(p_device, 80) and created_at > now() - interval '1 day') >= 5 then
    raise exception 'quitte_too_many';
  end if;
  insert into public.quitte_feedback (body, contact, device, app_version)
    values (trim(p_body), nullif(left(trim(coalesce(p_contact, '')), 120), ''), left(p_device, 80), left(p_version, 20));
  return true;
end $$;
revoke all on function public.quitte_send_feedback(text, text, text, text) from public;
grant execute on function public.quitte_send_feedback(text, text, text, text) to anon, authenticated;
