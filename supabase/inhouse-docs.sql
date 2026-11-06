-- Documents filed to an In-House pack item (src/lib/inhouse/slots.ts): the structural survey, delivery notes,
-- the forms only some jobs need. A column of its own, NOT handover_slot: handover_slot decides what a customer
-- sees in their portal, and the In-House pack is internal. Documents filed here are never shown to a customer
-- (the application saves them with visible = false). Additive and safe to re-run.
-- Run after crm-v2.sql.
alter table public.crm_documents add column if not exists inhouse_slot text;
create index if not exists crm_documents_inhouse_slot_idx on public.crm_documents (project_id, inhouse_slot) where inhouse_slot is not null;
notify pgrst, 'reload schema';
