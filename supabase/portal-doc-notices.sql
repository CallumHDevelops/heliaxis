-- Telling customers about new documents in their portal, in one message (src/lib/crm/portal-notify.ts).
-- Whenever a document becomes visible to the customer, by any route (an upload, the handover pack's own
-- documents, library files, the electrician's documents, signed forms, the combined pack), this trigger
-- queues it. Once 30 minutes pass with nothing new queued for a job, the every-minute cron
-- (/api/cron/whatsapp-outbox) sends ONE email and text listing them. Only a document's first appearance
-- counts: a later version of a generated document (version > 1, or another with the same generated_key
-- already on the job) and the office-only data sheets (*-SHEET) are never queued. Safe to run again.

create table if not exists public.portal_doc_notices (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.crm_projects(id) on delete cascade,
  document_id  uuid not null unique references public.crm_documents(id) on delete cascade,
  name         text not null,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  -- Told another way (the handover Upload sheet's "tell them" tick, the pack's Send): not in the summary.
  covered      boolean not null default false
);
create index if not exists portal_doc_notices_pending_idx on public.portal_doc_notices (project_id, created_at) where sent_at is null;
alter table public.portal_doc_notices enable row level security;

create or replace function public.queue_portal_doc_notice() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.visible is true
     and new.archived_at is null
     and new.project_id is not null
     and new.inhouse_slot is null
     and (tg_op = 'INSERT' or old.visible is distinct from true)
     and coalesce(new.generated_key, '') not like '%-SHEET'
     and coalesce(new.version, 1) <= 1
     and not (
       new.generated_key is not null and exists (
         select 1 from public.crm_documents o
         where o.project_id = new.project_id and o.generated_key = new.generated_key and o.id <> new.id and o.created_at < new.created_at
       )
     )
  then
    insert into public.portal_doc_notices (project_id, document_id, name)
    values (new.project_id, new.id, coalesce(nullif(regexp_replace(new.name, '\.pdf$', '', 'i'), ''), 'Document'))
    on conflict (document_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists crm_documents_portal_notice on public.crm_documents;
create trigger crm_documents_portal_notice
  after insert or update of visible on public.crm_documents
  for each row execute function public.queue_portal_doc_notice();

notify pgrst, 'reload schema';
