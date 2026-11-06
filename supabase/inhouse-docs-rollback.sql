-- Undo supabase/inhouse-docs.sql. One statement: it refuses if any document is filed to an In-House item,
-- so it can never lose the link between a document and its item.
do $$
declare n bigint;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'crm_documents' and column_name = 'inhouse_slot') then
    execute 'select count(*) from public.crm_documents where inhouse_slot is not null' into n;
    if n > 0 then
      raise exception '% document(s) are filed to an In-House item: move them first. Nothing was dropped.', n;
    end if;
    drop index if exists public.crm_documents_inhouse_slot_idx;
    alter table public.crm_documents drop column inhouse_slot;
  end if;
  perform pg_notify('pgrst', 'reload schema');
end $$;
