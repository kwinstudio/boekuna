-- BOEKUNA financial automation persistence. Amounts are integer cents.
create table if not exists public.bank_imports (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 source_format text not null check(source_format in('camt053','mt940')),source_file_hash text not null check(source_file_hash~'^[0-9a-f]{64}$'),
 source_name text,account_iban text,period_start date,period_end date,transaction_count integer not null default 0 check(transaction_count>=0),
 credit_total_cents bigint not null default 0 check(credit_total_cents>=0),debit_total_cents bigint not null default 0 check(debit_total_cents>=0),
 duplicate_count integer not null default 0 check(duplicate_count>=0),warning_count integer not null default 0 check(warning_count>=0),
 created_at timestamptz not null default now(),unique(user_id,source_file_hash));
create table if not exists public.bank_transactions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 bank_import_id uuid not null references public.bank_imports(id) on delete cascade,transaction_id text,account_iban text,counterparty_name text,counterparty_iban text,
 booking_date date not null,value_date date,amount_cents bigint not null,currency text not null check(currency~'^[A-Z]{3}$'),description text not null default '',
 end_to_end_id text,bank_reference text,credit_debit text not null check(credit_debit in('credit','debit')),source_format text not null check(source_format in('camt053','mt940')),
 source_file_hash text not null check(source_file_hash~'^[0-9a-f]{64}$'),transaction_fingerprint text not null check(transaction_fingerprint~'^[0-9a-f]{64}$'),
 status text not null default 'unmatched' check(status in('unmatched','suggested','ambiguous','matched','rejected')),created_at timestamptz not null default now(),
 unique(user_id,transaction_fingerprint));
create table if not exists public.transaction_matches (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 bank_transaction_id uuid not null references public.bank_transactions(id) on delete cascade,target_type text not null check(target_type in('invoice','expense')),
 target_ref text not null,state text not null check(state in('exact/high-confidence','suggested','ambiguous','unmatched','manually_matched','rejected')),
 score smallint not null default 0 check(score between 0 and 100),evidence jsonb not null default '[]'::jsonb,confirmed_at timestamptz,rejected_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(user_id,bank_transaction_id,target_type,target_ref));
create table if not exists public.document_duplicate_fingerprints (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,document_ref text not null,
 document_sha256 text not null check(document_sha256~'^[0-9a-f]{64}$'),perceptual_hash text,supplier_fingerprint text,document_date date,gross_cents bigint,vat_cents bigint,
 text_fingerprint text,document_type text,created_at timestamptz not null default now(),unique(user_id,document_ref));
create table if not exists public.document_validation_results (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,document_ref text,
 validation_type text not null check(validation_type in('ubl','peppol-bis-billing')),status text not null check(status in('valid','invalid','needs_review')),
 ruleset text not null,source_sha256 text not null check(source_sha256~'^[0-9a-f]{64}$'),errors jsonb not null default '[]'::jsonb,
 warnings jsonb not null default '[]'::jsonb,financial_snapshot jsonb,created_at timestamptz not null default now());
create index if not exists bank_imports_user_created_idx on public.bank_imports(user_id,created_at desc);
create index if not exists bank_transactions_user_booking_idx on public.bank_transactions(user_id,booking_date desc);
create index if not exists bank_transactions_user_status_idx on public.bank_transactions(user_id,status,booking_date desc);
create index if not exists bank_transactions_import_idx on public.bank_transactions(bank_import_id);
create index if not exists transaction_matches_user_tx_idx on public.transaction_matches(user_id,bank_transaction_id);
create index if not exists transaction_matches_transaction_idx on public.transaction_matches(bank_transaction_id);
create index if not exists duplicate_fingerprints_user_sha_idx on public.document_duplicate_fingerprints(user_id,document_sha256);
create index if not exists duplicate_fingerprints_user_phash_idx on public.document_duplicate_fingerprints(user_id,perceptual_hash) where perceptual_hash is not null;
create index if not exists document_validation_results_user_ref_idx on public.document_validation_results(user_id,document_ref,created_at desc);
alter table public.bank_imports enable row level security;alter table public.bank_transactions enable row level security;alter table public.transaction_matches enable row level security;
alter table public.document_duplicate_fingerprints enable row level security;alter table public.document_validation_results enable row level security;
create policy bank_imports_select_own on public.bank_imports for select to authenticated using((select auth.uid())=user_id);
create policy bank_transactions_select_own on public.bank_transactions for select to authenticated using((select auth.uid())=user_id);
create policy transaction_matches_select_own on public.transaction_matches for select to authenticated using((select auth.uid())=user_id);
create policy document_duplicate_fingerprints_select_own on public.document_duplicate_fingerprints for select to authenticated using((select auth.uid())=user_id);
create policy document_validation_results_select_own on public.document_validation_results for select to authenticated using((select auth.uid())=user_id);
grant select on public.bank_imports,public.bank_transactions,public.transaction_matches,public.document_duplicate_fingerprints,public.document_validation_results to authenticated;
revoke insert,update,delete on public.bank_imports,public.bank_transactions,public.transaction_matches,public.document_duplicate_fingerprints,public.document_validation_results from anon,authenticated;
revoke all on public.bank_imports,public.bank_transactions,public.transaction_matches,public.document_duplicate_fingerprints,public.document_validation_results from anon;
