-- Undo supabase/template-documents.sql, for use straight after running it and before any answers have been
-- entered. One statement, so a client that carries on after an error cannot drop anything the check refused.
do $$
declare n bigint;
begin
  if to_regclass('public.template_documents') is not null then
    execute 'select count(*) from public.template_documents' into n;
    if n > 0 then
      raise exception 'public.template_documents has % row(s): export them before rolling back. Nothing was dropped.', n;
    end if;
  end if;
  drop table if exists public.template_documents;
  drop function if exists public.template_documents_guard();
  drop function if exists public.revise_template_document(uuid, uuid);
  perform pg_notify('pgrst', 'reload schema');
end $$;
