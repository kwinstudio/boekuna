-- Applied to kwinest on 2026-11-01 as migration "lt_wish_and_shop_items".
create table if not exists public.lt_wish_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.lt_groups(id) on delete cascade,
  member_id uuid not null references public.lt_members(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  url text check (url is null or (char_length(url) <= 1000 and url ~* '^https?://')),
  image_url text check (image_url is null or (char_length(image_url) <= 1000 and image_url ~* '^https://')),
  price_cents integer check (price_cents is null or price_cents between 0 and 1000000),
  note text check (note is null or char_length(note) <= 300),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists lt_wish_items_member_idx on public.lt_wish_items(member_id, position);
create index if not exists lt_wish_items_group_idx on public.lt_wish_items(group_id);
create table if not exists public.lt_shop_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.lt_groups(id) on delete cascade,
  giver_id uuid not null references public.lt_members(id) on delete cascade,
  wish_item_id uuid references public.lt_wish_items(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  price_cents integer check (price_cents is null or price_cents between 0 and 1000000),
  bought boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists lt_shop_items_giver_idx on public.lt_shop_items(giver_id, position);
create index if not exists lt_shop_items_group_idx on public.lt_shop_items(group_id);
create index if not exists lt_shop_items_wish_idx on public.lt_shop_items(wish_item_id);
alter table public.lt_wish_items enable row level security;
alter table public.lt_shop_items enable row level security;
revoke all on public.lt_wish_items, public.lt_shop_items from anon, authenticated;
