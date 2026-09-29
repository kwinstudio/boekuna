
create table if not exists public.email_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  email text not null,
  refresh_secret_id uuid,
  scopes text[] not null default '{}'::text[],
  status text not null default 'connected' check (status in ('connected','error','revoked')),
  last_error text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_connections enable row level security;

drop policy if exists "email_connections_select_own" on public.email_connections;
create policy "email_connections_select_own"
on public.email_connections
for select
to authenticated
using (auth.uid() = user_id);

grant select on public.email_connections to authenticated;
grant all on public.email_connections to service_role;
revoke insert, update, delete on public.email_connections from authenticated, anon;

create table if not exists public.email_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  return_url text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.email_oauth_states enable row level security;
revoke all on public.email_oauth_states from authenticated, anon;
grant all on public.email_oauth_states to service_role;

create or replace function public.set_email_connection_secret(
  p_user_id uuid,
  p_provider text,
  p_email text,
  p_refresh_token text,
  p_scopes text[] default '{}'::text[]
)
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_secret_id uuid;
  v_name text;
begin
  if p_provider not in ('google','microsoft') then
    raise exception 'Unsupported provider';
  end if;
  if coalesce(length(trim(p_email)),0) < 3 then
    raise exception 'Invalid email';
  end if;
  if coalesce(length(p_refresh_token),0) < 10 then
    raise exception 'Missing refresh token';
  end if;

  select refresh_secret_id into v_secret_id
  from public.email_connections
  where user_id = p_user_id;

  v_name := 'mail-refresh-' || p_user_id::text;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      p_refresh_token,
      v_name,
      'OAuth refresh token for connected invoice mailbox'
    );
  else
    perform vault.update_secret(
      v_secret_id,
      p_refresh_token,
      v_name,
      'OAuth refresh token for connected invoice mailbox'
    );
  end if;

  insert into public.email_connections(
    user_id, provider, email, refresh_secret_id, scopes, status, last_error, connected_at, updated_at
  )
  values(
    p_user_id, p_provider, lower(trim(p_email)), v_secret_id, coalesce(p_scopes,'{}'::text[]),
    'connected', null, now(), now()
  )
  on conflict (user_id) do update set
    provider = excluded.provider,
    email = excluded.email,
    refresh_secret_id = excluded.refresh_secret_id,
    scopes = excluded.scopes,
    status = 'connected',
    last_error = null,
    connected_at = now(),
    updated_at = now();
end;
$$;

create or replace function public.get_email_connection_secret(p_user_id uuid)
returns table(
  provider text,
  email text,
  refresh_token text,
  scopes text[],
  status text
)
language sql
security definer
set search_path = public, vault, pg_temp
as $$
  select
    c.provider,
    c.email,
    v.decrypted_secret as refresh_token,
    c.scopes,
    c.status
  from public.email_connections c
  left join vault.decrypted_secrets v on v.id = c.refresh_secret_id
  where c.user_id = p_user_id
  limit 1;
$$;

create or replace function public.delete_email_connection_secret(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_secret_id uuid;
begin
  select refresh_secret_id into v_secret_id
  from public.email_connections
  where user_id = p_user_id;

  delete from public.email_connections where user_id = p_user_id;

  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
end;
$$;

create or replace function public.get_integration_secret(p_name text)
returns text
language sql
security definer
set search_path = public, vault, pg_temp
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = p_name
  order by updated_at desc
  limit 1;
$$;

revoke all on function public.set_email_connection_secret(uuid,text,text,text,text[]) from public, anon, authenticated;
revoke all on function public.get_email_connection_secret(uuid) from public, anon, authenticated;
revoke all on function public.delete_email_connection_secret(uuid) from public, anon, authenticated;
revoke all on function public.get_integration_secret(text) from public, anon, authenticated;

grant execute on function public.set_email_connection_secret(uuid,text,text,text,text[]) to service_role;
grant execute on function public.get_email_connection_secret(uuid) to service_role;
grant execute on function public.delete_email_connection_secret(uuid) to service_role;
grant execute on function public.get_integration_secret(text) to service_role;

create index if not exists email_oauth_states_expires_idx on public.email_oauth_states(expires_at);
