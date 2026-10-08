-- In-app feedback ("Hulp & feedback"): reports, private screenshots and room for internal triage.
--
-- Customers can only insert their own report and read back the customer-facing columns of
-- their own reports. Triage columns (priority, internal notes, GitHub links, grouping) have no
-- grants for anon/authenticated at all, so they are invisible and unwritable from the app;
-- BOEKUNA triages with the service role. Screenshots live in a private bucket under
-- <user id>/<report id>/ and are only reachable by their owner (signed URLs).

create table if not exists public.feedback_issue_groups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null check (char_length(title) between 2 and 200),
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  priority text null check (priority in ('critical','high','normal','low')),
  github_issue_url text null check (github_issue_url is null or github_issue_url ~ '^https://github\.com/'),
  github_pr_url text null check (github_pr_url is null or github_pr_url ~ '^https://github\.com/'),
  fixed_in_release text null check (fixed_in_release is null or char_length(fixed_in_release) <= 60),
  notes text null check (notes is null or char_length(notes) <= 8000)
);

create table if not exists public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- What the customer sent
  category text not null check (category in ('bug','incorrect_result','unclear','feature_request','ocr_correction')),
  title text not null check (char_length(title) between 1 and 120),
  message text not null check (char_length(message) between 3 and 4000),
  screenshot_path text null check (screenshot_path is null or screenshot_path ~ '^[0-9a-zA-Z-]+/[0-9a-f-]{36}/screenshot\.(jpg|png|webp)$'),

  -- Safe technical context (whitelisted on the client, size-limited and screened here too)
  feature text null check (feature is null or char_length(feature) <= 60),
  route text null check (route is null or char_length(route) <= 60),
  app_release text null check (app_release is null or char_length(app_release) <= 60),
  platform text null check (platform is null or char_length(platform) <= 20),
  context jsonb not null default '{}'::jsonb check (
    jsonb_typeof(context) = 'object'
    and pg_column_size(context) <= 16384
    and context::text !~* '"(access_token|refresh_token|id_token|password|authorization|apikey|api_key|secret|iban|bank_account|ocr_text|raw_text|document_text)"'
  ),

  -- Internal triage (service role only)
  status text not null default 'new' check (status in ('new','triaged','planned','in_progress','resolved','closed')),
  priority text null check (priority in ('critical','high','normal','low')),
  issue_group_id uuid null references public.feedback_issue_groups(id) on delete set null,
  github_issue_url text null check (github_issue_url is null or github_issue_url ~ '^https://github\.com/'),
  github_pr_url text null check (github_pr_url is null or github_pr_url ~ '^https://github\.com/'),
  fixed_in_release text null check (fixed_in_release is null or char_length(fixed_in_release) <= 60),
  internal_notes text null check (internal_notes is null or char_length(internal_notes) <= 8000),
  triaged_at timestamptz null,
  resolved_at timestamptz null,

  -- What the customer sees about progress
  customer_status text generated always as (
    case status
      when 'new' then 'received'
      when 'triaged' then 'reviewing'
      when 'planned' then 'in_progress'
      when 'in_progress' then 'in_progress'
      else 'resolved'
    end
  ) stored,
  customer_reply text null check (customer_reply is null or char_length(customer_reply) <= 2000),
  status_changed_at timestamptz not null default now()
);

create index if not exists feedback_reports_user_created_idx on public.feedback_reports(user_id, created_at desc);
create index if not exists feedback_reports_triage_idx on public.feedback_reports(status, priority, created_at desc);
create index if not exists feedback_reports_category_idx on public.feedback_reports(category, created_at desc);
create index if not exists feedback_reports_feature_idx on public.feedback_reports(feature, created_at desc);
create index if not exists feedback_reports_release_idx on public.feedback_reports(app_release);
create index if not exists feedback_reports_group_idx on public.feedback_reports(issue_group_id) where issue_group_id is not null;

-- Keep timestamps honest whoever updates the row.
create or replace function public.feedback_reports_touch()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  if tg_op = 'UPDATE' and (new.status is distinct from old.status or new.customer_reply is distinct from old.customer_reply) then
    new.status_changed_at = now();
    if new.status = 'triaged' and old.triaged_at is null then new.triaged_at = now(); end if;
    if new.status in ('resolved','closed') and new.resolved_at is null then new.resolved_at = now(); end if;
  end if;
  return new;
end;
$$;

drop trigger if exists feedback_reports_touch on public.feedback_reports;
create trigger feedback_reports_touch
before update on public.feedback_reports
for each row execute function public.feedback_reports_touch();

drop trigger if exists feedback_issue_groups_set_updated_at on public.feedback_issue_groups;
create trigger feedback_issue_groups_set_updated_at
before update on public.feedback_issue_groups
for each row execute function public.set_updated_at();

-- Abuse guard: at most 20 reports per account per hour.
create or replace function public.feedback_reports_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.feedback_reports r
      where r.user_id = new.user_id and r.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'feedback_rate_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.feedback_reports_rate_limit() from public, anon, authenticated;

drop trigger if exists feedback_reports_rate_limit on public.feedback_reports;
create trigger feedback_reports_rate_limit
before insert on public.feedback_reports
for each row execute function public.feedback_reports_rate_limit();

alter table public.feedback_reports enable row level security;
alter table public.feedback_issue_groups enable row level security;

revoke all on public.feedback_reports from anon, authenticated;
revoke all on public.feedback_issue_groups from anon, authenticated;

-- Column-level grants: customers write only what they send and read only customer-facing data.
grant insert (id, category, title, message, screenshot_path, feature, route, app_release, platform, context)
  on public.feedback_reports to authenticated;
grant select (id, created_at, category, title, message, screenshot_path, customer_status, customer_reply, status_changed_at)
  on public.feedback_reports to authenticated;

drop policy if exists feedback_reports_select_own on public.feedback_reports;
create policy feedback_reports_select_own
  on public.feedback_reports for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists feedback_reports_insert_own on public.feedback_reports;
create policy feedback_reports_insert_own
  on public.feedback_reports for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'new'
    and priority is null
    and issue_group_id is null
    and (
      screenshot_path is null
      or (split_part(screenshot_path, '/', 1) = (select auth.uid())::text
          and split_part(screenshot_path, '/', 2) = id::text)
    )
  );

-- Private screenshot bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-screenshots', 'feedback-screenshots', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists feedback_screenshots_select_own on storage.objects;
create policy feedback_screenshots_select_own
  on storage.objects for select to authenticated
  using (bucket_id = 'feedback-screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists feedback_screenshots_insert_own on storage.objects;
create policy feedback_screenshots_insert_own
  on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback-screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Owners may remove an orphaned upload when sending fails; no updates/overwrites.
drop policy if exists feedback_screenshots_delete_own on storage.objects;
create policy feedback_screenshots_delete_own
  on storage.objects for delete to authenticated
  using (bucket_id = 'feedback-screenshots' and (storage.foldername(name))[1] = (select auth.uid())::text);
