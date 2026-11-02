-- Proposal pack: the pre-contract paperwork the customer is given before they sign (src/lib/proposal/slots.ts).
--     Run after site-commissioning.sql. Safe to run twice. Server-only table (RLS on, no policies).
--
--     What it adds:
--       crm_documents.proposal_slot   which pack item (HX-PP-01 ...) a document on a job is
--       proposal_slots                the office's "Not needed" mark (and a note) per job and item
--       crm_projects.accepted_pending_at / _ip
--                                     the customer pressed Accept while the pack was still being
--                                     finished (they have NOT signed: accepted_at stays null)
--       profiles.project_admin        tick a person in /admin/users to make them a Project Admin:
--                                     they get the "finish the proposal pack" task and its alert
--
--     Running this changes nothing the customer sees. The new accept check stays off until the
--     PROPOSAL_PACK environment variable is set to "on" (and it should wait until the pack's
--     documents can be made, or every acceptance would be held).
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                 and table_name = 'crm_documents' and column_name = 'handover_slot') then
    raise exception 'Run site-commissioning.sql first, then this file.';
  end if;
end $$;

alter table public.crm_documents add column if not exists proposal_slot text;
create index if not exists crm_documents_proposal_slot_idx on public.crm_documents (project_id, proposal_slot) where proposal_slot is not null;

-- Per job: an item marked Not needed (with why), or a note, keyed by the item's code.
create table if not exists public.proposal_slots (
  project_id uuid not null references public.crm_projects(id) on delete cascade,
  slot       text not null,
  na         boolean not null default false,
  na_reason  text,
  note       text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (project_id, slot)
);
alter table public.proposal_slots enable row level security;

-- The customer accepted but the contract was not ready to sign. Only accepted_at (the signature) moves a job to Won.
alter table public.crm_projects add column if not exists accepted_pending_at timestamptz;
alter table public.crm_projects add column if not exists accepted_pending_ip text;

-- Who gets the proposal pack tasks and alerts. Until someone is ticked: the job's owner and the admins.
alter table public.profiles add column if not exists project_admin boolean not null default false;

notify pgrst, 'reload schema';
