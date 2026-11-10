-- ProspectPV · admin: manual letters, scaffolding and generation settings,
-- logo storage, and brand assets on the landing page.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.pv_letters
  add column if not exists source     text not null default 'scan' check (source in ('scan','manual')),
  add column if not exists created_by uuid references auth.users (id) on delete set null;

alter table public.pv_roof_assessments
  add column if not exists storeys           smallint check (storeys is null or storeys between 1 and 4),
  add column if not exists elevation_width_m numeric(6,2),
  add column if not exists scaffold_est      numeric(10,2);

-- Addresses typed in by hand have no UPRN. They get a negative number from this
-- sequence (shown as M1, M2… in the admin) so suppression and the re-mail limit
-- still work. Replace with the real UPRN once the OS lookup is connected.
create sequence if not exists public.pv_manual_uprn_seq
  increment by -1 start with -1 minvalue -9223372036854775807 maxvalue -1;
-- pv_issue_letter runs as the signed-in user (security invoker), so they need the sequence.
grant usage on sequence public.pv_manual_uprn_seq to authenticated;

-- ---------------------------------------------------------------------------
-- Settings: scaffolding and generation. Money values stay null until entered.
-- ---------------------------------------------------------------------------
insert into public.pv_settings (key, value, description) values
('scaffolding', jsonb_build_object(
   'rate_per_m2_gbp', null,
   'fixed_fee_gbp', null,
   'min_charge_gbp', null,
   'end_return_m', 1,
   'storey_height_m', 2.6,
   'top_lift_m', 1
 ), 'Rough scaffolding estimate. Rates [TBC]; geometry values are editable assumptions'),
('generation', jsonb_build_object(
   'yield_kwh_per_kwp', null
 ), 'Yearly kWh per kWp used to pre-fill generation on manual letters [TBC]')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Issue a letter (manual or scan) in one transaction.
-- security invoker: row level security applies, so only staff can call it.
-- The caller generates the short code; a collision raises 23505 and nothing is
-- kept, so the caller just retries with a new code.
-- Errors with their own codes (shown to staff as-is):
--   PV001  address is on the do-not-contact list
--   PV002  a letter was already created for this address inside the re-mail window
-- ---------------------------------------------------------------------------
create or replace function public.pv_issue_letter(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch     text := coalesce(nullif(btrim(p ->> 'batch_name'), ''), 'Manual letters');
  v_line1     text := btrim(p ->> 'address_line1');
  v_line2     text := nullif(btrim(p ->> 'address_line2'), '');
  v_town      text := btrim(p ->> 'town');
  v_postcode  text := upper(btrim(p ->> 'postcode'));
  v_formatted text;
  v_uprn      bigint;
  v_campaign  uuid;
  v_months    int;
  v_expiry    int;
  v_prior     public.pv_letters%rowtype;
  v_letter_id uuid;
  v_source    text := coalesce(nullif(p ->> 'source', ''), 'manual');
begin
  if not public.pv_is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_line1 is null or v_line1 = '' or v_town is null or v_postcode is null then
    raise exception 'Address is incomplete' using errcode = '22023';
  end if;

  v_formatted := concat_ws(', ', v_line1, v_line2, v_town, v_postcode);

  -- Which property is this? A given UPRN wins; otherwise reuse the property
  -- already entered for this address so suppression and re-mail limits apply.
  if nullif(p ->> 'uprn', '') is not null then
    v_uprn := (p ->> 'uprn')::bigint;
  else
    select pr.uprn into v_uprn
    from public.pv_properties pr
    where replace(upper(pr.postcode), ' ', '') = replace(v_postcode, ' ', '')
      and lower(btrim(pr.address_line1)) = lower(v_line1)
    order by pr.created_at
    limit 1;
    if v_uprn is null then
      v_uprn := nextval('public.pv_manual_uprn_seq');
    end if;
  end if;

  if exists (
    select 1 from public.pv_suppression s
    where s.uprn = v_uprn or lower(s.address) = lower(v_formatted)
  ) then
    raise exception 'This address is on the do-not-contact list, so no letter can be created for it.'
      using errcode = 'PV001';
  end if;

  select coalesce((value ->> 'remail_window_months')::int, 6) into v_months from public.pv_settings where key = 'letters';
  v_months := coalesce(v_months, 6);
  select * into v_prior from public.pv_letters l
  where l.uprn = v_uprn and l.created_at > now() - make_interval(months => v_months)
  order by l.created_at desc limit 1;
  if found then
    raise exception 'A letter was already created for this address on % (code %). We only write to an address once every % months.',
      to_char(v_prior.created_at at time zone 'Europe/London', 'DD Mon YYYY'), v_prior.short_code, v_months
      using errcode = 'PV002';
  end if;

  select coalesce((value ->> 'expiry_months')::int, 12) into v_expiry from public.pv_settings where key = 'codes';
  v_expiry := coalesce(v_expiry, 12);

  select id into v_campaign from public.pv_campaigns where name = v_batch and search_value = 'manual' limit 1;
  if v_campaign is null then
    insert into public.pv_campaigns (name, search_type, search_value, status, created_by)
    values (v_batch, 'postcode', 'manual', 'letters', auth.uid())
    returning id into v_campaign;
  end if;

  insert into public.pv_properties (uprn, address_line1, address_line2, town, postcode)
  values (v_uprn, v_line1, v_line2, v_town, v_postcode)
  on conflict (uprn) do nothing;

  insert into public.pv_roof_assessments (
    campaign_id, uprn, status, reason, usable_area_m2, main_aspect, panel_count, kwp, indicative_kwh,
    package_id, approved, storeys, elevation_width_m, scaffold_est)
  values (
    v_campaign, v_uprn, 'suitable', case when v_source = 'manual' then 'Entered by staff' else null end,
    nullif(p ->> 'usable_area_m2', '')::numeric, p ->> 'main_aspect',
    (p ->> 'panel_count')::int, (p ->> 'kwp')::numeric, (p ->> 'indicative_kwh')::numeric,
    nullif(p ->> 'package_id', '')::uuid, true,
    nullif(p ->> 'storeys', '')::smallint, nullif(p ->> 'elevation_width_m', '')::numeric, nullif(p ->> 'scaffold_est', '')::numeric)
  on conflict (campaign_id, uprn) do update set
    usable_area_m2 = excluded.usable_area_m2, main_aspect = excluded.main_aspect, panel_count = excluded.panel_count,
    kwp = excluded.kwp, indicative_kwh = excluded.indicative_kwh, package_id = excluded.package_id,
    storeys = excluded.storeys, elevation_width_m = excluded.elevation_width_m, scaffold_est = excluded.scaffold_est;

  insert into public.pv_letters (
    campaign_id, uprn, package_id, template_key, template_version, short_code, expires_at,
    printed_values, data_dates, source, created_by)
  values (
    v_campaign, v_uprn, nullif(p ->> 'package_id', '')::uuid, (p ->> 'template_key')::smallint,
    coalesce((p ->> 'template_version')::int, 1), p ->> 'short_code',
    now() + make_interval(months => v_expiry),
    p -> 'printed_values', coalesce(p -> 'data_dates', '{}'::jsonb), v_source, auth.uid())
  returning id into v_letter_id;

  return jsonb_build_object('letter_id', v_letter_id, 'short_code', p ->> 'short_code', 'uprn', v_uprn, 'campaign_id', v_campaign);
end;
$$;

revoke all on function public.pv_issue_letter(jsonb) from public, anon;
grant execute on function public.pv_issue_letter(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Landing page: also return the current brand images (slot → storage path), so
-- logos uploaded after a letter was printed still appear on its page.
-- ---------------------------------------------------------------------------
create or replace function public.pv_landing_open(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code   text := public.pv_normalise_code(p_code);
  v_letter public.pv_letters%rowtype;
  v_first  boolean;
begin
  if v_code is null then
    return null;
  end if;

  select * into v_letter
  from public.pv_letters
  where short_code = v_code
    and expires_at > now()
    and status <> 'returned';

  if not found then
    return null;
  end if;

  v_first := v_letter.first_viewed_at is null;

  update public.pv_letters
  set view_count      = view_count + 1,
      first_viewed_at = coalesce(first_viewed_at, now()),
      last_viewed_at  = now()
  where id = v_letter.id;

  insert into public.pv_responses (letter_id, uprn, type, payload)
  values (v_letter.id, v_letter.uprn, 'qr_scan', jsonb_build_object('first_view_at', now()))
  on conflict (letter_id) where type = 'qr_scan' do nothing;

  return jsonb_build_object(
    'letterCode',   v_letter.short_code,
    'templateKey',  v_letter.template_key,
    'firstView',    v_first,
    'printed',      v_letter.printed_values,
    'extras', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', e.key, 'name', e.name, 'description', e.description,
               'price', e.price, 'effect', e.effect)
             order by e.display_order, e.name)
      from public.pv_extras e
      where e.active), '[]'::jsonb),
    'assets', coalesce((
      select jsonb_object_agg(a.slot, a.storage_path)
      from public.pv_letter_assets a
      where a.storage_path is not null), '{}'::jsonb),
    'settings', coalesce((
      select jsonb_object_agg(s.key, s.value)
      from public.pv_settings s
      where s.key in ('calc.assumptions','calc.coefficients','calc.inputs',
                      'battery','finance','company','landing')), '{}'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage: a public bucket for brand images (logos, accreditations, photos).
-- Anyone can load them by URL (they print on letters anyway); only ProspectPV
-- admins can upload, replace or delete. Skipped where there's no storage schema.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('prospectpv-assets', 'prospectpv-assets', true)
    on conflict (id) do nothing;

    drop policy if exists pv_assets_staff_read on storage.objects;
    drop policy if exists pv_assets_admin_insert on storage.objects;
    drop policy if exists pv_assets_admin_update on storage.objects;
    drop policy if exists pv_assets_admin_delete on storage.objects;

    create policy pv_assets_staff_read on storage.objects for select to authenticated
      using (bucket_id = 'prospectpv-assets' and public.pv_is_staff());
    create policy pv_assets_admin_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'prospectpv-assets' and public.pv_is_admin());
    create policy pv_assets_admin_update on storage.objects for update to authenticated
      using (bucket_id = 'prospectpv-assets' and public.pv_is_admin())
      with check (bucket_id = 'prospectpv-assets' and public.pv_is_admin());
    create policy pv_assets_admin_delete on storage.objects for delete to authenticated
      using (bucket_id = 'prospectpv-assets' and public.pv_is_admin());
  end if;
end $$;
