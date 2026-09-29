
create table if not exists public.anonymous_ai_usage (
  client_hash text not null,
  feature text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (client_hash, feature, window_start)
);

alter table public.anonymous_ai_usage enable row level security;
revoke all on public.anonymous_ai_usage from anon, authenticated;
