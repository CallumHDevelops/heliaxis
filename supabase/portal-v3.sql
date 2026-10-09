-- Portal v3: document requests (16) and CIS verification (17). Safe to run more than once.

-- 16. Document requests: Heliaxis asks a firm for a specific document (or a replacement
--     for one it rejected). Emailed when made, shown at the top of the portal's Documents
--     step, and chased in the daily digest until the firm uploads it against the request.
create table if not exists public.subcontractor_doc_requests (
  id                    uuid primary key default gen_random_uuid(),
  subcontractor_id      uuid not null references public.subcontractors(id) on delete cascade,
  category              text not null,
  operative_id          uuid references public.subcontractor_operatives(id) on delete set null,
  operative_name        text,
  label                 text,             -- what exactly, e.g. "IPAF card" (optional)
  note                  text,             -- shown to the subcontractor
  due_on                date,
  replaces_document_id  uuid references public.subcontractor_documents(id) on delete set null,
  status                text not null default 'open' check (status in ('open','fulfilled','cancelled')),
  requested_by          text not null,
  created_at            timestamptz not null default now(),
  emailed_at            timestamptz,
  fulfilled_at          timestamptz,
  fulfilled_document_id uuid references public.subcontractor_documents(id) on delete set null,
  cancelled_at          timestamptz,
  cancelled_by          text
);
create index if not exists sc_doc_requests_sub_idx on public.subcontractor_doc_requests (subcontractor_id, status);
create index if not exists sc_doc_requests_doc_idx on public.subcontractor_doc_requests (fulfilled_document_id);

-- Service role only (the portal and admin both go through the server).
alter table public.subcontractor_doc_requests enable row level security;

-- 17. CIS verification: Heliaxis's accountants verify each subcontractor with HMRC before
--     the first payment. Records that it's been done, the deduction rate HMRC gave
--     (gross 0% / net 20% / higher 30% when unmatched), the verification number, when,
--     and who ticked it in admin.
alter table public.subcontractors
  add column if not exists cis_verified_on      date,
  add column if not exists cis_rate             text check (cis_rate in ('gross', 'net', 'higher')),
  add column if not exists cis_verification_ref text,
  add column if not exists cis_verified_by      text,
  add column if not exists cis_verified_at      timestamptz;
