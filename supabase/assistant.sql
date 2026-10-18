-- 26. Claude assistant: conversations and the drafts it writes for you to check and send.
--     Run after crm.sql. Safe to re-run. Server-only tables (RLS on, no policies).

-- One conversation per person at a time (kept so you can carry on from the van on your computer).
create table if not exists public.assistant_threads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  messages    jsonb not null default '[]',   -- Claude API message history
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists assistant_threads_user_idx on public.assistant_threads (user_id, archived, updated_at desc);
alter table public.assistant_threads enable row level security;

-- Emails and WhatsApps Claude has drafted. Nothing goes to a customer until someone presses Send.
create table if not exists public.assistant_drafts (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('email','whatsapp')),
  project_id  uuid references public.crm_projects(id) on delete cascade,
  enquiry_id  uuid references public.enquiries(id) on delete cascade,
  subject     text,
  body        text not null,
  status      text not null default 'draft' check (status in ('draft','sent','discarded')),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index if not exists assistant_drafts_status_idx on public.assistant_drafts (status, created_at desc);
create index if not exists assistant_drafts_project_idx on public.assistant_drafts (project_id);
alter table public.assistant_drafts enable row level security;
