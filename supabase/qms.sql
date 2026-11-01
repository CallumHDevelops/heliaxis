-- 40. Quality Management System (Operations › QMS).
--     The controlled-document registers (internal documents, procedures, forms, external documents),
--     each document's revision history, the review / approval trail, the comments reviewers leave
--     (which "Revise with Claude" reads and answers), and the QMS records (corrective actions,
--     complaints, internal reviews, equipment calibration, training).
--     Server-only tables (RLS on, no policies): the app reads and writes with the service role.
--     Safe to run twice.

-- One row per controlled document (its current revision). Superseded revisions are copied to
-- qms_revisions and the row moves on, so the register always shows what is in force.
create table if not exists public.qms_documents (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('internal','procedure','form','external')),
  ref             text not null check (length(btrim(ref)) between 1 and 20),
  section         text,                          -- forms: heat_pump / solar_pv / battery / general; external: standard / guidance / regulation / link
  title           text not null check (length(btrim(title)) between 1 and 200),
  revision        text not null default '1',
  revision_date   date,
  status          text not null default 'draft'
                  check (status in ('draft','in_review','changes_requested','approved','archived')),
  owner           text,                          -- who looks after it (name)
  summary         text,                          -- one line: what it is for
  body_md         text,                          -- the document itself (Markdown); internal documents, procedures and forms
  source_url      text,                          -- external documents: where the current copy lives
  file_path       text,                          -- an uploaded copy (private bucket 'qms-docs')
  review_months   int not null default 12 check (review_months between 1 and 60),
  next_review_on  date,
  approved_revision text,                        -- the revision an approver signed off (a later edit un-approves it)
  approved_by     text,
  approved_at     timestamptz,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists qms_documents_kind_idx on public.qms_documents (kind, ref);
create index if not exists qms_documents_status_idx on public.qms_documents (status);
-- A ref is meant to be used once per kind among live documents. Not enforced here: the checker reports duplicates
-- so an imported register with two documents on one ref can still be loaded and then tidied.

create table if not exists public.qms_revisions (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.qms_documents(id) on delete cascade,
  revision       text not null,
  revision_date  date,
  title          text,
  body_md        text,
  file_path      text,
  note           text,                           -- what changed
  created_by     text,
  created_at     timestamptz not null default now()
);
create index if not exists qms_revisions_doc_idx on public.qms_revisions (document_id, created_at desc);

-- Comments on a document. 'open' ones are what the reviewer wants changed; "Revise with Claude" answers
-- them and marks them 'addressed'; the reviewer then resolves them (or reopens one that wasn't fixed).
create table if not exists public.qms_comments (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.qms_documents(id) on delete cascade,
  revision       text,                           -- the revision it was made on
  author         text not null,
  body           text not null check (length(btrim(body)) between 1 and 4000),
  quote          text,                           -- the passage it is about (optional)
  status         text not null default 'open' check (status in ('open','addressed','resolved')),
  response       text,                           -- what was done about it
  responded_by   text,                           -- 'Claude' or a person
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);
create index if not exists qms_comments_doc_idx on public.qms_comments (document_id, created_at);
create index if not exists qms_comments_open_idx on public.qms_comments (status) where status <> 'resolved';

-- Each approval decision: who, which revision, what they ticked.
create table if not exists public.qms_reviews (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.qms_documents(id) on delete cascade,
  revision       text not null,
  reviewer       text not null,
  decision       text not null check (decision in ('approved','changes_requested')),
  checklist      jsonb not null default '{}'::jsonb,   -- { in_right_place: true, content_correct: true, ... }
  checker        jsonb not null default '[]'::jsonb,   -- the automatic checks as they stood: [{id, status}]
  note           text,
  created_at     timestamptz not null default now()
);
create index if not exists qms_reviews_doc_idx on public.qms_reviews (document_id, created_at desc);

-- QMS records: one table for the "R" records that don't already live elsewhere in the portal.
--   capa (R02), review (R05), complaint (R06), calibration (R04), training (R07).
-- Purchase orders (R03), suppliers (R08) and subcontractors (R09) already have their own screens.
create table if not exists public.qms_records (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('capa','review','complaint','calibration','training')),
  ref            text not null,                  -- CAPA-0001, COMP-0001 ...
  title          text not null check (length(btrim(title)) between 1 and 200),
  status         text not null default 'open' check (status in ('open','in_progress','closed')),
  owner          text,
  due_on         date,
  closed_on      date,
  project_id     uuid,                           -- a job it relates to (crm_projects), when there is one
  data           jsonb not null default '{}'::jsonb,   -- the fields for that kind of record
  notes          text,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists qms_records_ref_idx on public.qms_records (ref);
create index if not exists qms_records_kind_idx on public.qms_records (kind, status);

alter table public.qms_documents enable row level security;
alter table public.qms_revisions enable row level security;
alter table public.qms_comments  enable row level security;
alter table public.qms_reviews   enable row level security;
alter table public.qms_records   enable row level security;
