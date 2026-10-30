-- Lootjes app (lt_ prefix). All access goes through the `lootjes` edge function with the
-- service role; RLS is on with no policies, so anon/authenticated clients cannot read or
-- write these tables directly. Secrets (organizer + personal tokens) are stored hashed.

create table if not exists public.lt_groups (
  id uuid primary key default gen_random_uuid(),
  join_code text not null unique,
  admin_token_hash text not null,
  name text not null check (char_length(name) between 1 and 80),
  occasion text not null default 'sinterklaas' check (occasion in ('sinterklaas','kerst','anders')),
  event_date date,
  budget_cents integer check (budget_cents is null or budget_cents between 0 and 100000),
  note text check (note is null or char_length(note) <= 500),
  poems boolean not null default true,
  join_open boolean not null default true,
  drawn_at timestamptz,
  previous_group_id uuid references public.lt_groups(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lt_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.lt_groups(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  token_hash text not null unique,
  is_organizer boolean not null default false,
  joined_self boolean not null default false,
  wishlist text not null default '' check (char_length(wishlist) <= 2000),
  wishlist_updated_at timestamptz,
  link_sent_at timestamptz,
  first_opened_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists lt_members_group_idx on public.lt_members(group_id);
create unique index if not exists lt_members_group_name_uq on public.lt_members(group_id, lower(name));

create table if not exists public.lt_exclusions (
  group_id uuid not null references public.lt_groups(id) on delete cascade,
  a uuid not null references public.lt_members(id) on delete cascade,
  b uuid not null references public.lt_members(id) on delete cascade,
  primary key (group_id, a, b),
  check (a < b)
);

create table if not exists public.lt_assignments (
  group_id uuid not null references public.lt_groups(id) on delete cascade,
  giver_id uuid not null references public.lt_members(id) on delete cascade,
  receiver_id uuid not null references public.lt_members(id) on delete cascade,
  gift_ready boolean not null default false,
  primary key (group_id, giver_id),
  unique (group_id, receiver_id),
  check (giver_id <> receiver_id)
);

-- Anonymous questions: 'to_receiver' = the Sint (giver) asks their lootje,
-- 'to_giver' = the lootje answers their unknown Sint.
create table if not exists public.lt_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.lt_groups(id) on delete cascade,
  giver_id uuid not null references public.lt_members(id) on delete cascade,
  direction text not null check (direction in ('to_receiver','to_giver')),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists lt_messages_pair_idx on public.lt_messages(group_id, giver_id, created_at);

create table if not exists public.lt_rate (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);

alter table public.lt_groups enable row level security;
alter table public.lt_members enable row level security;
alter table public.lt_exclusions enable row level security;
alter table public.lt_assignments enable row level security;
alter table public.lt_messages enable row level security;
alter table public.lt_rate enable row level security;

revoke all on public.lt_groups, public.lt_members, public.lt_exclusions,
  public.lt_assignments, public.lt_messages, public.lt_rate from anon, authenticated;

comment on table public.lt_groups is 'Lootjes app: groups. Only the lootjes edge function (service role) reads/writes.';
comment on table public.lt_assignments is 'Lootjes app: secret draw result. Never exposed except giver->own receiver via edge function.';
