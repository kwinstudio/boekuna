-- Pushmeldingen: voorkeuren per toestel en per lijst, en een seintje naar de edge function
-- zodra er activiteit is. De functie zelf haalt de gegevens op en claimt ze (pushed_at),
-- dus een los aanroepen van de functie kan nooit iets dubbel of verzonnen versturen.

alter table public.quitte_devices
  add column if not exists muted boolean not null default false,
  add column if not exists quiet boolean not null default true,
  add column if not exists tz text not null default 'Europe/Amsterdam',
  add column if not exists push_on boolean not null default true;

alter table public.quitte_activity add column if not exists pushed_at timestamptz;
-- Oude activiteit valt buiten het venster van 10 minuten en wordt dus nooit gepusht.

create index if not exists quitte_activity_unpushed on public.quitte_activity (list_id) where pushed_at is null;

create or replace function public.quitte_push_register(
  p_token text, p_device text, p_member uuid default null, p_apns text default null,
  p_lang text default 'nl', p_tz text default null, p_quiet boolean default null, p_push boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_list uuid := public.quitte__list_id(p_token);
begin
  if p_device is null or char_length(p_device) < 8 or char_length(p_device) > 80 then raise exception 'quitte_bad_device'; end if;
  if p_apns is not null and p_apns !~ '^[0-9a-fA-F]{32,200}$' then raise exception 'quitte_bad_token'; end if;
  if p_tz is not null and (char_length(p_tz) > 64 or p_tz !~ '^[A-Za-z_+\-/0-9]+$') then p_tz := null; end if;
  insert into public.quitte_devices (list_id, device_id, member_id, apns_token, lang, tz, quiet, push_on, updated_at)
    values (v_list, p_device, p_member, nullif(p_apns, ''), case when p_lang = 'en' then 'en' else 'nl' end,
            coalesce(p_tz, 'Europe/Amsterdam'), coalesce(p_quiet, true), coalesce(p_push, true), now())
    on conflict (list_id, device_id) do update set member_id = excluded.member_id,
      apns_token = coalesce(excluded.apns_token, public.quitte_devices.apns_token), lang = excluded.lang,
      tz = coalesce(p_tz, public.quitte_devices.tz),
      quiet = coalesce(p_quiet, public.quitte_devices.quiet),
      push_on = coalesce(p_push, public.quitte_devices.push_on),
      updated_at = now();
end $$;

create or replace function public.quitte_mute_list(p_token text, p_device text, p_muted boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.quitte_devices set muted = coalesce(p_muted, false), updated_at = now()
    where list_id = public.quitte__list_id(p_token) and device_id = p_device;
end $$;

revoke all on function public.quitte_push_register(text, text, uuid, text, text, text, boolean, boolean) from public;
revoke all on function public.quitte_mute_list(text, text, boolean) from public;
grant execute on function public.quitte_push_register(text, text, uuid, text, text, text, boolean, boolean) to anon, authenticated;
grant execute on function public.quitte_mute_list(text, text, boolean) to anon, authenticated;

-- Seintje naar de edge function. pg_net verstuurt pas na commit, dus alle regels van één
-- wijziging staan er dan al en worden samen in één melding gebundeld.
create or replace function public.quitte__notify_push()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.device is null then return new; end if; -- 'Lijst aangemaakt' e.d.: niet pushen
  perform net.http_post(
    url := 'https://vuwfyhtejsxhdfyvkkeq.supabase.co/functions/v1/quitte-push',
    body := jsonb_build_object('list', new.list_id),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 8000);
  return new;
exception when others then
  return new; -- een melding mag een wijziging nooit tegenhouden
end $$;

revoke all on function public.quitte__notify_push() from public, anon, authenticated;

create trigger quitte_activity_push after insert on public.quitte_activity
  for each row execute function public.quitte__notify_push();

-- Claimt alle nog niet verstuurde activiteit van een lijst (voor de edge function, service role).
create or replace function public.quitte__claim_push(p_list uuid)
returns table (actor text, summary text, device text)
language sql security definer set search_path = '' as $$
  update public.quitte_activity set pushed_at = now()
   where list_id = p_list and pushed_at is null and created_at > now() - interval '10 minutes'
  returning actor, summary, device;
$$;
revoke all on function public.quitte__claim_push(uuid) from public, anon, authenticated;
grant execute on function public.quitte__claim_push(uuid) to service_role;
