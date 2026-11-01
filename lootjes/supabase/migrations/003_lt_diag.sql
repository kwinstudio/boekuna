-- Applied to kwinest on 2026-11-01 as migration "lt_diag".
-- Anonymous crash and hang reports from the app (Apple MetricKit). No names, tokens or group data.
create table if not exists public.lt_diag (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  app_version text not null check (char_length(app_version) <= 40),
  os_version text not null check (char_length(os_version) <= 80),
  kind text not null check (kind in ('crash', 'hang', 'cpu', 'disk', 'launch', 'other')),
  summary text check (summary is null or char_length(summary) <= 500),
  payload jsonb not null check (pg_column_size(payload) <= 70000)
);
create index if not exists lt_diag_created_idx on public.lt_diag(created_at desc);
alter table public.lt_diag enable row level security;
