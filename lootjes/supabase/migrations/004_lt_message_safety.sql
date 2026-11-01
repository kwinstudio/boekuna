-- Applied to kwinest on 2026-11-01 as migration "lt_message_safety".
-- Report and block for anonymous messages (App Store guideline 1.2).
alter table public.lt_assignments add column if not exists block_to_receiver boolean not null default false;
alter table public.lt_assignments add column if not exists block_to_giver boolean not null default false;
create table if not exists public.lt_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  group_id uuid references public.lt_groups(id) on delete cascade,
  message_id uuid,
  body text not null check (char_length(body) <= 600),
  reason text check (reason is null or char_length(reason) <= 300),
  handled boolean not null default false
);
create index if not exists lt_reports_created_idx on public.lt_reports(created_at desc);
alter table public.lt_reports enable row level security;
