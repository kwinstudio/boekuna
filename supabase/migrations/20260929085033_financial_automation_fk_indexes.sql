create index if not exists bank_transactions_import_idx on public.bank_transactions(bank_import_id);
create index if not exists transaction_matches_transaction_idx on public.transaction_matches(bank_transaction_id);
