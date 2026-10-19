-- 27. Deleted customers: so Enquiries → Import doesn't bring back someone deleted on purpose.
--     No names, numbers or emails: only a one-way fingerprint (sha256) of their Meta lead id, their
--     mobile and their email (see src/lib/crm/delete-customer.ts), and when they were deleted.
--     A new live lead or WhatsApp message from them still comes in as normal.
--     Run after crm.sql. Safe to re-run. Server-only (RLS on, no policies).
create table if not exists public.crm_deleted_people (
  hash       text primary key,
  kind       text not null check (kind in ('meta_lead','phone','email')),
  deleted_at timestamptz not null default now()
);

alter table public.crm_deleted_people enable row level security;
