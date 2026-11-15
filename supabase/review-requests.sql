-- Review requests (CRM › Reviews): a personal link sent to a customer by email, text or WhatsApp that offers the same options to everyone
-- (review on Google, review on Trustpilot, or tell us privately). Tracks sent, opened, which button was pressed and any private feedback.
-- Safe to run more than once. Server-only: RLS on, no policies.
create table if not exists public.review_requests (
  id                  uuid primary key default gen_random_uuid(),
  token               text unique not null,
  enquiry_id          uuid not null references public.enquiries(id) on delete cascade,
  project_id          uuid references public.crm_projects(id) on delete set null,
  channel             text not null default 'link' check (channel in ('email', 'sms', 'whatsapp', 'link')),
  sent_by             uuid references public.profiles(id) on delete set null,
  sent_at             timestamptz not null default now(),
  opened_at           timestamptz,
  clicked_google_at   timestamptz,
  clicked_trustpilot_at timestamptz,
  feedback            text,
  feedback_at         timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists review_requests_enquiry_idx on public.review_requests (enquiry_id);
create index if not exists review_requests_sent_idx on public.review_requests (sent_at desc);
alter table public.review_requests enable row level security;
