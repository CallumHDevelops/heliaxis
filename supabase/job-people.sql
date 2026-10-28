-- More than one person on a job: a couple, a landlord and the tenant, a site contact, an accountant.
-- Each is a contact (CRM > Contacts) linked to the opportunity with a role. The customer on the job and the one
-- "contact it's dealt with through" (organisations.sql) stay as they are. Run after organisations.sql. Safe to re-run.
create table if not exists public.crm_project_contacts (
  project_id  uuid not null references public.crm_projects(id) on delete cascade,
  contact_id  uuid not null references public.crm_contacts(id) on delete cascade,
  role        text,                 -- "Wife", "Tenant", "Site contact"
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (project_id, contact_id)
);
create index if not exists crm_project_contacts_contact_idx on public.crm_project_contacts (contact_id);
alter table public.crm_project_contacts enable row level security;
notify pgrst, 'reload schema';
