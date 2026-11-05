-- Bonnen mailen, betere logica (Kwin 2026-11-05).
-- The app now shows what happened to each recent mail (bon opgeslagen, geen bon gevonden, ...), so
-- an event keeps the subject the user recognises. When someone turns on automatic forwarding in
-- Gmail, Gmail first sends a confirmation code to the address; that code and Gmail's own link are
-- kept too, so the app can show them instead of the mail disappearing.
-- Only the account owner reads these rows (RLS select own, from 20261104140000_inbound_mail.sql).

alter table public.inbound_mail_events add column if not exists detail jsonb not null default '{}'::jsonb;

alter table public.inbound_mail_events drop constraint if exists inbound_mail_events_outcome;
alter table public.inbound_mail_events add constraint inbound_mail_events_outcome
  check (outcome in ('received','stored','no_files','unknown_address','not_entitled','limited','failed','forward_confirm'));

alter table public.inbound_mail_events drop constraint if exists inbound_mail_events_detail_small;
alter table public.inbound_mail_events add constraint inbound_mail_events_detail_small
  check (jsonb_typeof(detail) = 'object' and pg_column_size(detail) <= 2048);
