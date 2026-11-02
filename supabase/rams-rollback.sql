-- Undo supabase/rams.sql, for use straight after running it and before any RAMS data has been copied in.
-- It refuses to run if any of the RAMS tables holds rows, so it can never throw a record away: export
-- them first. It leaves the three profile columns (job_title, phone, signature_path) and the two storage
-- buckets in place, because they may already hold someone's details or files and are harmless empty.
--
-- The whole thing is ONE statement on purpose. A client that carries on after an error (psql's default)
-- would otherwise run the drops even after the check below has refused; as a single block, a refusal
-- undoes everything and nothing is dropped, whatever ran it.
do $$
declare t text; n bigint;
begin
  foreach t in array array['rams_documents','rams_trades','rams_trade_requests','rams_briefings','rams_operatives','rams_sites','project_operatives','operatives','certifications'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then
        raise exception 'public.% has % row(s): export them before rolling back. Nothing was dropped.', t, n;
      end if;
    end if;
  end loop;

  drop trigger if exists crm_projects_queue_rams on public.crm_projects;
  drop function if exists public.crm_projects_queue_rams();

  drop table if exists public.rams_autocreate_queue;
  drop table if exists public.rams_briefings;
  drop table if exists public.rams_trade_requests;
  drop table if exists public.rams_trades;
  drop table if exists public.rams_operatives;
  drop table if exists public.rams_documents;
  drop table if exists public.rams_ref_counters;
  drop table if exists public.project_operatives;
  drop table if exists public.certifications;
  drop table if exists public.operatives;
  drop table if exists public.company_settings;
  drop table if exists public.rams_sites;

  drop function if exists public.rams_next_number(uuid);
  drop function if exists public.rams_documents_guard();
  drop function if exists public.rams_trade_requests_guard();
  drop function if exists public.rams_briefings_guard();

  perform pg_notify('pgrst', 'reload schema');
end $$;
