-- ProspectPV · seed configuration
--
-- [TBC] values are seeded as JSON null (settings) or SQL null (packages,
-- extras), never invented. Packages and extras start inactive; check
-- constraints stop them going live until every printed field is filled in.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
insert into public.pv_settings (key, value, description) values

('screen', jsonb_build_object(
   'min_aspect_area_m2', 12,
   'aspects_counted', jsonb_build_array('s','se','sw','e','w'),
   'exclude_thatch', true,
   'exclude_existing_solar', true,
   'exclude_multi_occupancy', true,
   'exclude_flats', true,
   'exclude_listed', false,
   'exclude_conservation_area', false,
   'flag_unknown_roof_shape', true
 ), 'OS roof screen thresholds (spec section 4)'),

('solar', jsonb_build_object(
   'required_quality', 'HIGH',
   'fallback_quality', 'MEDIUM',
   'min_azimuth', 90,
   'max_azimuth', 270,
   'cost_per_call_gbp', null
 ), 'Google Solar sizing. cost_per_call_gbp [TBC]: confirm current Google pricing'),

('spend', jsonb_build_object(
   'monthly_cap_gbp', null,
   'require_confirmation', true
 ), 'API spend cap [TBC]. Jobs stop when the cap is reached'),

('letters', jsonb_build_object(
   'default_template', 5,
   'remail_window_months', 6,
   'bleed_mm', 0
 ), 'Letter generation defaults'),

('codes', jsonb_build_object(
   'expiry_months', 12
 ), 'Short code lifetime'),

('calc.inputs', jsonb_build_object(
   'usage_min', 1500, 'usage_max', 10000, 'usage_step', 100, 'usage_default', 3500,
   'usage_typical_hint', 2700,
   'bill_min', 30, 'bill_max', 400, 'bill_step', 5, 'bill_default', 120,
   'home_default', 'some'
 ), 'Landing calculator slider ranges (spec 7.2)'),

('calc.assumptions', jsonb_build_object(
   'seg_rate_gbp_per_kwh', null,
   'off_peak_spread_gbp_per_kwh', null,
   'standing_charge_gbp_per_year', null
 ), 'Calculator assumptions [TBC]: SEG export rate, off-peak spread, standing charge'),

('calc.coefficients', jsonb_build_object(
   'base_self_use', 0.35,
   'self_use_per_battery_kwh', 0.03,
   'home_all_day_adj', 0.10,
   'mostly_out_adj', -0.10,
   'min_self_use_fraction', 0.25,
   'max_self_use_fraction', 0.90,
   'max_self_use_of_demand', 0.85,
   'min_unit_rate_gbp', 0.12,
   'diverter_share_of_export', 0.20,
   'battery_usable_depth', 0.90,
   'battery_cycles_per_year', 250,
   'cap_saving_at_bill', true
 ), 'Savings model coefficients (spec 7.3). Check against RECC guidance before launch'),

('battery', jsonb_build_object(
   'module_kwh', 5,
   'module_price_gbp', null,
   'max_kwh', null
 ), 'GoodWe ESA expansion [TBC]: module price and system maximum'),

('finance', jsonb_build_object(
   'enabled', false,
   'lender_name', null,
   'fca_wording', null
 ), 'Finance promotion. Stays off until lender and FCA wording are set (spec 9)'),

('company', jsonb_build_object(
   'phone', '01633 965205',
   'website', 'heliaxis.co.uk',
   'registered_details', null,
   'business_address', null,
   'opt_out_url', null,
   'privacy_url', null
 ), 'Company and footer details [TBC]'),

('sender', jsonb_build_object(
   'name', null,
   'role', 'Director'
 ), 'Letter signatory [TBC]'),

('landing', jsonb_build_object(
   'team_story', null,
   'review_rating', null,
   'review_quote', null,
   'review_name', null,
   'walk_in_lookup_enabled', false,
   'booking_rate_limit_per_hour', 5,
   'page_rate_limit_per_minute', 30
 ), 'Landing page content [TBC] and limits');

-- ---------------------------------------------------------------------------
-- Packages (spec section 5). Panel bands are known; everything else [TBC].
-- ---------------------------------------------------------------------------
insert into public.pv_packages (name, min_panels, max_panels, display_order, short_description) values
  ('Essential', 8,  9,    1, null),
  ('Home',      10, 12,   2, null),
  ('Home Plus', 13, 16,   3, null),
  ('Max',       17, null, 4, null);

-- ---------------------------------------------------------------------------
-- Extras (spec 7.2 default set). Prices [TBC].
-- ---------------------------------------------------------------------------
insert into public.pv_extras (key, name, description, effect, display_order) values
  ('ev_charger',  'EV charger',         'Smart charger that tops up from solar or cheap overnight rates', '{}'::jsonb,                 1),
  ('diverter',    'Hot water diverter', 'Sends spare solar to your immersion heater',                     '{"diverter": true}'::jsonb, 2),
  ('backup',      'Whole-home backup',  'Keeps your home running in a power cut',                         '{"backup": true}'::jsonb,   3),
  ('bird_mesh',   'Bird protection',    'Mesh to keep pigeons from nesting under panels',                 '{}'::jsonb,                 4);

-- ---------------------------------------------------------------------------
-- Letter templates. Copy blocks empty = use the defaults in code.
-- ---------------------------------------------------------------------------
insert into public.pv_letter_templates (template_key, name, version, enabled) values
  (1, 'Classic',         1, true),
  (2, 'Bold Dark',       1, true),
  (3, 'Personal Letter', 1, true),
  (4, 'Roof Report',     1, true),
  (5, 'Brand Hero',      1, true);

-- ---------------------------------------------------------------------------
-- Image slots, paths [TBC] (Supabase storage bucket 'prospectpv').
-- ---------------------------------------------------------------------------
insert into public.pv_letter_assets (slot) values
  ('logo'), ('logo_white'), ('accreditations'), ('hero'), ('install'),
  ('team'), ('app'), ('signature'), ('director_photo'), ('esa_unit');
