create table if not exists public.support_requests (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    email text not null check (char_length(email) between 5 and 320),
    subject text not null check (char_length(subject) between 2 and 120),
    message text not null check (char_length(message) between 10 and 4000),
    source text not null default 'web' check (char_length(source) <= 40),
    user_agent text null check (user_agent is null or char_length(user_agent) <= 500),
    status text not null default 'new' check (status in ('new','read','closed'))
  );

  alter table public.support_requests enable row level security;

  revoke all on public.support_requests from anon, authenticated;
  grant insert on public.support_requests to anon, authenticated;

  drop policy if exists "public_submit_support" on public.support_requests;
  create policy "public_submit_support"
    on public.support_requests
    for insert
    to anon, authenticated
    with check (
      status = 'new'
      and source in ('web','app','store-support','privacy')
      and char_length(email) between 5 and 320
      and char_length(subject) between 2 and 120
      and char_length(message) between 10 and 4000
    );

  create index if not exists support_requests_created_at_idx on public.support_requests(created_at desc);
