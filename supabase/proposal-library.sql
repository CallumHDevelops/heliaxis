-- Universal documents for the Proposal pack (src/lib/proposal/library.ts): the MCS Customer Commitment, the Consumer
-- Code leaflet, the deposit protection details and the complaints procedure are the same on every job, so they are
-- added once to the document library and tagged here with the pack item they are. Every job's pack then has them.
-- Additive and safe to re-run. Run after handover.sql (the library's other columns) and proposal-pack.sql.
alter table public.crm_library add column if not exists proposal_slot text;
create index if not exists crm_library_proposal_slot_idx on public.crm_library (proposal_slot) where proposal_slot is not null;
notify pgrst, 'reload schema';
