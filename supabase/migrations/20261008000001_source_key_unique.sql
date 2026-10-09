-- Plain (non-partial) unique index so PostgREST upserts can target it for idempotent imports.
-- Rows with a NULL source_key are never treated as duplicates.
drop index if exists public.transactions_source_key_uq;
create unique index transactions_source_key_uq on public.transactions (user_id, source_key);
