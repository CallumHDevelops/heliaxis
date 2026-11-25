-- 27. Metis Desktop: a name for each conversation (the thread sidebar can rename them).
--     Additive and safe to re-run. Run after assistant.sql. Nothing else reads or needs this column.
alter table public.assistant_threads add column if not exists title text;
