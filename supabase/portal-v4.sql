-- Portal v4: every upload stored as one compact PDF. Safe to run more than once.

-- 18. What the firm actually uploaded, kept until the document is approved (then deleted —
--     the approved PDF is the record), and how it was processed.
alter table public.subcontractor_documents
  add column if not exists original_files  jsonb,        -- [{ path, name, mime, size }] — null once removed
  add column if not exists original_bytes  bigint,       -- total size of what was uploaded
  add column if not exists processed_at    timestamptz,  -- when it was converted / compressed (or checked and kept)
  add column if not exists processing_note text;         -- e.g. "2 photos → 2-page PDF · 7.9 MB → 612 KB"

-- The backfill works through documents that haven't been processed yet, oldest first.
create index if not exists sc_docs_unprocessed_idx
  on public.subcontractor_documents (uploaded_at)
  where processed_at is null;
