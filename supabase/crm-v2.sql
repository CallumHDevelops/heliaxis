-- 25. CRM v2: customer portal, documents, library, saved replies, Microsoft 365 email, reminders,
--     lead routing, sequences, booking, quote acceptance + deposits, Meta conversions.
--     Run after crm.sql. Safe to re-run. Server-only tables (RLS on, no policies).

-- Opportunity: portal, DNO, reminders, automation, acceptance and deposit.
alter table public.crm_projects add column if not exists portal_token              text unique;   -- the customer's private portal link
alter table public.crm_projects add column if not exists dno_status                text not null default 'not_started'; -- not_required | not_started | submitted | approved | rejected
alter table public.crm_projects add column if not exists dno_ref                   text;
alter table public.crm_projects add column if not exists dno_submitted_at          timestamptz;
alter table public.crm_projects add column if not exists dno_approved_at           timestamptz;
alter table public.crm_projects add column if not exists reminders_sent            text[] not null default '{}'; -- e.g. install-3:2026-10-21
alter table public.crm_projects add column if not exists sequence_step             int not null default 0;
alter table public.crm_projects add column if not exists sequence_stopped_at       timestamptz;
alter table public.crm_projects add column if not exists first_contact_at          timestamptz;   -- first message / call / email to them
alter table public.crm_projects add column if not exists first_response_alerted_at timestamptz;
alter table public.crm_projects add column if not exists deposit_amount            numeric(12,2);
alter table public.crm_projects add column if not exists deposit_paid_at           timestamptz;
alter table public.crm_projects add column if not exists deposit_ref               text;          -- Stripe checkout session / payment id
alter table public.crm_projects add column if not exists accepted_at               timestamptz;   -- quote accepted in the portal
alter table public.crm_projects add column if not exists accepted_name             text;
alter table public.crm_projects add column if not exists accepted_ip               text;
alter table public.crm_projects add column if not exists accepted_document_id      uuid;
alter table public.crm_projects add column if not exists accepted_signature        text;          -- storage path of the signature PNG
alter table public.crm_projects add column if not exists capi_sent                 text[] not null default '{}'; -- Meta events already sent

-- Meta click id (fbclid → fbc) captured with website enquiries, for the Conversions API.
alter table public.enquiries add column if not exists meta_fbc text;

-- Documents on an opportunity (quotes, invoices, DNO letters, certificates…), optionally shown in the portal.
create table if not exists public.crm_documents (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.crm_projects(id) on delete cascade,
  category      text not null default 'other'
                check (category in ('quote','invoice','dno','mcs','warranty','handover','design','contract','receipt','other')),
  name          text not null,
  storage_path  text not null unique,
  mime          text,
  size          int,
  visible       boolean not null default true,     -- shown in the customer portal
  needs_signature boolean not null default false,  -- a quote the customer can accept + sign in the portal
  uploaded_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists crm_documents_project_idx on public.crm_documents (project_id, created_at desc);

-- Company library: guides and packs you send to many customers (EV access guide, intro pack…).
create table if not exists public.crm_library (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  storage_path  text not null unique,
  mime          text,
  size          int,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- Saved replies for WhatsApp and email.
create table if not exists public.crm_snippets (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Emails with customers (Microsoft 365 shared mailbox), in and out.
create table if not exists public.crm_emails (
  id            uuid primary key default gen_random_uuid(),
  enquiry_id    uuid not null references public.enquiries(id) on delete cascade,
  project_id    uuid references public.crm_projects(id) on delete set null,
  graph_id      text unique,                         -- Microsoft Graph internetMessageId
  direction     text not null check (direction in ('in','out')),
  subject       text,
  body          text,                                -- plain-text preview
  from_address  text,
  to_address    text,
  sent_by       uuid references public.profiles(id) on delete set null,
  attachments   text[] not null default '{}',
  at            timestamptz not null default now()
);
create index if not exists crm_emails_enquiry_idx on public.crm_emails (enquiry_id, at desc);

alter table public.crm_documents enable row level security;
alter table public.crm_library   enable row level security;
alter table public.crm_snippets  enable row level security;
alter table public.crm_emails    enable row level security;

-- Starter saved replies (edit them in CRM → Settings).
insert into public.crm_snippets (title, body)
select * from (values
  ('Thanks for your enquiry', 'Hi {first_name}, thanks for getting in touch with Heliaxis. Could you tell me a little about your property and what you''d like to achieve? Then I can point you in the right direction.'),
  ('Ask for photos', 'Hi {first_name}, to give you an accurate price could you send a few photos of: your roof (from the road), your fuse box / consumer unit, and your electricity meter? Thank you!'),
  ('Book a survey', 'Hi {first_name}, the next step is a free survey. You can pick a time that suits you here: {portal_link}'),
  ('Your portal', 'Hi {first_name}, you can follow your project, see your documents and key dates any time here: {portal_link}')
) as v(title, body)
where not exists (select 1 from public.crm_snippets);
