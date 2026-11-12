-- Document templates and categories (CRM › Documents). Safe to run more than once. Server-only: RLS on, no policies.
-- 1. A category on each uploaded file in the Document library (CRM › CRM settings).
alter table public.crm_library add column if not exists category text;
-- 2. Templates saved from a document (Documents › New document › From template). Using one copies it into a new document.
create table if not exists public.crm_writeup_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 120),
  category    text,
  description text,
  title       text not null default 'Untitled document',
  content     jsonb not null default '{"blocks":[]}'::jsonb,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists crm_writeup_templates_name_idx on public.crm_writeup_templates (lower(name));
alter table public.crm_writeup_templates enable row level security;
