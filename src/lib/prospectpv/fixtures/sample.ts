/**
 * SAMPLE DATA for tests and template previews only.
 * Prices, models and assumptions here are illustrative (they match the sample
 * props in design-reference/Landing2.dc.html) and are NOT Heliaxis config.
 */
import { buildLetterData, type LetterInputs } from '@/lib/prospectpv/letterData';
import type { LandingSettingsBundle } from '@/lib/prospectpv/settings';
import { SPEC_CALC_INPUTS, SPEC_COEFFICIENTS } from '@/lib/prospectpv/settings';
import type { ExtraRow, LetterData, PackageRow } from '@/lib/prospectpv/types';

/** A 9 m × 7.4 m semi, turned 18° off north, in British National Grid metres. */
function rotatedRect(cx: number, cy: number, w: number, h: number, deg: number): [number, number][] {
  const a = (deg * Math.PI) / 180;
  const pts: [number, number][] = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  const out = pts.map(([x, y]) => [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)] as [number, number]);
  return [...out, out[0]!];
}

export const SAMPLE_FOOTPRINT = { coordinates: [rotatedRect(331005, 188003, 9.4, 7.6, 18)], crs: 'EPSG:27700' as const };

/** L-shaped detached house with a rear extension. */
export const SAMPLE_L_FOOTPRINT = {
  coordinates: [[[0, 0], [12, 0], [12, 5], [7, 5], [7, 9], [0, 9], [0, 0]]] as [number, number][][],
  crs: 'EPSG:27700' as const,
};

export const SAMPLE_PACKAGE: PackageRow = {
  id: '00000000-0000-0000-0000-0000000000a2',
  name: 'Home',
  min_panels: 10,
  max_panels: 12,
  panel_model: 'Aiko Neostar 2P',
  panel_watts: 450,
  esa_inverter_model: 'GW5K-ESA',
  battery_module_model: 'ESA 5 kWh module',
  battery_module_count: 2,
  usable_kwh: 10,
  heated_module: true,
  backup_included: false,
  mounting: 'In-roof black frame mounting',
  monitoring_app: 'SEMS+',
  warranty_panel_yrs: 25,
  warranty_battery_yrs: 10,
  warranty_workmanship_yrs: 10,
  price_inc_vat: 9000,
  finance_example_text: null,
  short_description: 'Solar and a 10 kWh battery for a typical family home.',
  claims: ['ai_tariff', 'safety', 'heating', 'expandable', 'backup', 'all_in_one'],
  active: true,
  display_order: 2,
};

export const SAMPLE_EXTRAS: ExtraRow[] = [
  { key: 'ev_charger', name: 'EV charger', description: 'Smart charger that tops up from solar or cheap overnight rates', price: 1000, effect: {} },
  { key: 'diverter', name: 'Hot water diverter', description: 'Sends spare solar to your immersion heater', price: 450, effect: { diverter: true } },
  { key: 'backup', name: 'Whole-home backup', description: 'Keeps your home running in a power cut', price: 600, effect: { backup: true } },
  { key: 'bird_mesh', name: 'Bird protection', description: 'Mesh to keep pigeons from nesting under panels', price: 400, effect: {} },
];

export const SAMPLE_INPUTS: LetterInputs = {
  mode: 'preview',
  letterCode: '7KQ4M2XA',
  baseUrl: 'https://heliaxis.co.uk',
  now: new Date('2026-11-09T10:00:00Z'),
  property: { uprn: 10023456789, address_line1: '12 Transton Road', address_line2: null, town: 'Newport', postcode: 'NP19 7AB' },
  building: {
    os_building_id: 'osgb1000000000001',
    roof_shape: 'pitched',
    roof_material: 'tile',
    aspect_n: 26, aspect_ne: 0, aspect_e: 0, aspect_se: 0, aspect_s: 26, aspect_sw: 0, aspect_w: 0, aspect_nw: 0,
    os_data_date: '2026-09-01',
    footprint: SAMPLE_FOOTPRINT,
  },
  assessment: { panel_count: 12, kwp: 5.4, indicative_kwh: 4812, usable_area_m2: null, main_aspect: null },
  pkg: SAMPLE_PACKAGE,
  finance: { enabled: false, lender_name: null, fca_wording: null },
  company: {
    phone: '01633 965205',
    website: 'heliaxis.co.uk',
    registered_details: null,
    business_address: null,
    opt_out_url: 'heliaxis.co.uk/optout',
    privacy_url: null,
  },
  sender: { name: null, role: 'Director' },
  assets: {},
};

export const SAMPLE_LETTER: LetterData = buildLetterData(SAMPLE_INPUTS).data;

/** The same home with finance switched on and sample (not lender-approved) wording. */
export const SAMPLE_LETTER_FINANCE: LetterData = buildLetterData({
  ...SAMPLE_INPUTS,
  pkg: { ...SAMPLE_PACKAGE, finance_example_text: '[SAMPLE: lender-approved representative example goes here]' },
  finance: { enabled: true, lender_name: '[SAMPLE lender]', fca_wording: '[SAMPLE FCA status wording]' },
}).data;

export const SAMPLE_LANDING_SETTINGS: LandingSettingsBundle = {
  inputs: SPEC_CALC_INPUTS,
  coefficients: SPEC_COEFFICIENTS,
  assumptions: { seg_rate_gbp_per_kwh: 0.15, off_peak_spread_gbp_per_kwh: 0.15, standing_charge_gbp_per_year: 200 },
  battery: { module_kwh: 5, module_price_gbp: 2000, max_kwh: 30 },
  finance: { enabled: false, lender_name: null, fca_wording: null },
  company: SAMPLE_INPUTS.company,
  landing: {
    team_story: null,
    review_rating: null,
    review_quote: null,
    review_name: null,
    walk_in_lookup_enabled: false,
    booking_rate_limit_per_hour: 5,
    page_rate_limit_per_minute: 30,
  },
};

/** Worst case for layout checks: two-line address, every benefit, finance on, long names. */
export const STRESS_LETTER: LetterData = buildLetterData({
  ...SAMPLE_INPUTS,
  property: { ...SAMPLE_INPUTS.property, address_line1: 'Flat Cottage, 117 Llanwern Road East', address_line2: 'Ringland', town: 'Newport', postcode: 'NP19 7AB' },
  assessment: { ...SAMPLE_INPUTS.assessment, panel_count: 16, indicative_kwh: 6420 },
  pkg: {
    ...SAMPLE_PACKAGE,
    name: 'Home Plus',
    panel_model: 'Aiko Neostar 2P Comet 54-cell All-Black',
    esa_inverter_model: 'GW6K-ESA-UK',
    backup_included: true,
    heated_module: true,
    usable_kwh: 15,
    price_inc_vat: 12450,
    finance_example_text: '[SAMPLE] Representative example: borrow £12,450 over 120 months. Wording to be supplied and approved by the lender before any letter is sent.',
    short_description: 'More panels and a 15 kWh battery for larger homes and higher usage.',
  },
  finance: { enabled: true, lender_name: '[SAMPLE lender name]', fca_wording: '[SAMPLE] Heliaxis Limited is an appointed representative of … authorised and regulated by the Financial Conduct Authority.' },
  company: { ...SAMPLE_INPUTS.company, registered_details: 'registered in England and Wales, company no. 00000000, Unit 0, Example Business Park, Newport NP00 0XX', business_address: 'Unit 0, Example Business Park, Newport NP00 0XX' },
  sender: { name: 'Sam Example', role: 'Director' },
}).data;
