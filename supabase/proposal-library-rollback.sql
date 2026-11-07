-- Undo proposal-library.sql. Refuses (one statement, so nothing else runs) while any library file is tagged to a Proposal item.
do $$
begin
  if exists (select 1 from public.crm_library where proposal_slot is not null) then
    raise exception 'Library files are tagged to Proposal pack items: untag them first.';
  end if;
  drop index if exists public.crm_library_proposal_slot_idx;
  alter table public.crm_library drop column if exists proposal_slot;
end $$;
notify pgrst, 'reload schema';
