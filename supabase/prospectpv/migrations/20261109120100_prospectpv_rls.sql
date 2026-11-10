-- ProspectPV · roles and row level security (Heliaxis mapping)
--
-- Roles come from public.profiles, the same users database as the rest of the admin (src/lib/auth.ts, src/lib/portals.ts):
--   prospectpv_admin  an approved admin: packages, extras, templates, settings, spend caps (+ everything staff can do)
--   prospectpv_staff  an approved admin, or an approved member with the 'crm' portal ticked (Sales lives under CRM):
--                     run scans, review, generate letters
-- src/lib/prospectpv/server/auth.ts applies the same rule in the app. Every policy goes through pv_has_role().

create or replace function public.pv_has_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'approved'
      and (
        (p_role = 'prospectpv_admin' and p.role = 'admin')
        or (p_role = 'prospectpv_staff' and (p.role = 'admin' or 'crm' = any(coalesce(p.portals, '{}'))))
      )
  );
$$;

create or replace function public.pv_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.pv_has_role('prospectpv_admin');
$$;

create or replace function public.pv_is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.pv_has_role('prospectpv_staff') or public.pv_has_role('prospectpv_admin');
$$;

revoke all on function public.pv_has_role(text) from public, anon;
grant execute on function public.pv_has_role(text), public.pv_is_admin(), public.pv_is_staff() to authenticated;

-- RLS on every table.
do $$
declare t text;
begin
  foreach t in array array[
    'pv_settings','pv_packages','pv_extras','pv_letter_templates','pv_letter_assets',
    'pv_buildings','pv_properties','pv_heritage_features','pv_campaigns','pv_campaign_templates',
    'pv_scan_jobs','pv_roof_assessments','pv_letters','pv_responses','pv_suppression',
    'pv_api_log','pv_rate_limits'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Campaign data: staff read and write.
do $$
declare t text;
begin
  foreach t in array array[
    'pv_campaigns','pv_campaign_templates','pv_scan_jobs','pv_roof_assessments',
    'pv_letters','pv_properties','pv_buildings'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.pv_is_staff()) with check (public.pv_is_staff())',
      t || '_staff_all', t);
  end loop;
end $$;

-- Configuration: staff read, admins write.
do $$
declare t text;
begin
  foreach t in array array[
    'pv_settings','pv_packages','pv_extras','pv_letter_templates','pv_letter_assets','pv_heritage_features'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.pv_is_staff())',
      t || '_staff_read', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.pv_is_admin()) with check (public.pv_is_admin())',
      t || '_admin_write', t);
  end loop;
end $$;

-- Responses: staff read and can log calls; public writes go through the
-- security definer functions in the next migration.
create policy pv_responses_staff_read on public.pv_responses
  for select to authenticated using (public.pv_is_staff());
create policy pv_responses_staff_insert on public.pv_responses
  for insert to authenticated with check (public.pv_is_staff());

-- Suppression: staff read and add; only admins remove an address.
create policy pv_suppression_staff_read on public.pv_suppression
  for select to authenticated using (public.pv_is_staff());
create policy pv_suppression_staff_insert on public.pv_suppression
  for insert to authenticated with check (public.pv_is_staff());
create policy pv_suppression_admin_delete on public.pv_suppression
  for delete to authenticated using (public.pv_is_admin());

-- API log: staff read; rows are written by server code using the service role.
create policy pv_api_log_staff_read on public.pv_api_log
  for select to authenticated using (public.pv_is_staff());

-- pv_rate_limits: no policies. Service role only.
