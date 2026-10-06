-- 12. Subcontractor → RAMS sync. Remembers which RAMS rows each portal record
--     became, so re-syncing updates rather than duplicates.
alter table public.subcontractors
  add column if not exists rams_id         uuid,
  add column if not exists rams_synced_at  timestamptz,
  add column if not exists rams_sync_error text;

alter table public.subcontractor_documents
  add column if not exists rams_table     text,
  add column if not exists rams_row_id    uuid,
  add column if not exists rams_path      text,
  add column if not exists rams_synced_at timestamptz;
