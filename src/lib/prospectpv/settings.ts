/**
 * Typed view over `pv_settings` (key → JSON). Null means [TBC] in the seed.
 * Nothing here invents a value: if a number is missing it stays null and the
 * caller decides what to hide.
 */

export type CalcCoefficients = {
  base_self_use: number;
  self_use_per_battery_kwh: number;
  home_all_day_adj: number;
  mostly_out_adj: number;
  min_self_use_fraction: number;
  max_self_use_fraction: number;
  max_self_use_of_demand: number;
  min_unit_rate_gbp: number;
  diverter_share_of_export: number;
  battery_usable_depth: number;
  battery_cycles_per_year: number;
  cap_saving_at_bill: boolean;
};

/** The coefficients written in spec 7.3. The seed stores the same values. */
export const SPEC_COEFFICIENTS: CalcCoefficients = {
  base_self_use: 0.35,
  self_use_per_battery_kwh: 0.03,
  home_all_day_adj: 0.1,
  mostly_out_adj: -0.1,
  min_self_use_fraction: 0.25,
  max_self_use_fraction: 0.9,
  max_self_use_of_demand: 0.85,
  min_unit_rate_gbp: 0.12,
  diverter_share_of_export: 0.2,
  battery_usable_depth: 0.9,
  battery_cycles_per_year: 250,
  cap_saving_at_bill: true,
};

export type CalcInputs = {
  usage_min: number;
  usage_max: number;
  usage_step: number;
  usage_default: number;
  usage_typical_hint: number;
  bill_min: number;
  bill_max: number;
  bill_step: number;
  bill_default: number;
  home_default: 'out' | 'some' | 'all';
};

export const SPEC_CALC_INPUTS: CalcInputs = {
  usage_min: 1500,
  usage_max: 10000,
  usage_step: 100,
  usage_default: 3500,
  usage_typical_hint: 2700,
  bill_min: 30,
  bill_max: 400,
  bill_step: 5,
  bill_default: 120,
  home_default: 'some',
};

export type CalcAssumptions = {
  seg_rate_gbp_per_kwh: number | null;
  off_peak_spread_gbp_per_kwh: number | null;
  standing_charge_gbp_per_year: number | null;
};

export type BatterySettings = { module_kwh: number; module_price_gbp: number | null; max_kwh: number | null };
export type FinanceSettings = { enabled: boolean; lender_name: string | null; fca_wording: string | null };
export type CompanySettings = {
  phone: string;
  website: string | null;
  registered_details: string | null;
  business_address: string | null;
  opt_out_url: string | null;
  privacy_url: string | null;
};
export type LandingSettings = {
  team_story: string | null;
  review_rating: string | null;
  review_quote: string | null;
  review_name: string | null;
  walk_in_lookup_enabled: boolean;
  booking_rate_limit_per_hour: number;
  page_rate_limit_per_minute: number;
};

export type LandingSettingsBundle = {
  inputs: CalcInputs;
  assumptions: CalcAssumptions;
  coefficients: CalcCoefficients;
  battery: BatterySettings;
  finance: FinanceSettings;
  company: CompanySettings;
  landing: LandingSettings;
};

import { SCAFFOLD_GEOMETRY_DEFAULTS, type ScaffoldRates } from './scaffolding';

type Raw = Record<string, unknown>;

const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Builds the landing bundle from the `settings` object returned by pv_landing_open. */
export function parseLandingSettings(settings: Raw): LandingSettingsBundle {
  const inputsRaw = obj(settings['calc.inputs']);
  const coefRaw = obj(settings['calc.coefficients']);
  const assumptions = obj(settings['calc.assumptions']);
  const battery = obj(settings['battery']);
  const finance = obj(settings['finance']);
  const company = obj(settings['company']);
  const landing = obj(settings['landing']);

  const inputs = { ...SPEC_CALC_INPUTS };
  for (const k of Object.keys(SPEC_CALC_INPUTS) as (keyof CalcInputs)[]) {
    if (k === 'home_default') {
      const h = inputsRaw[k];
      if (h === 'out' || h === 'some' || h === 'all') inputs.home_default = h;
    } else {
      const n = num(inputsRaw[k]);
      if (n !== null) inputs[k] = n;
    }
  }

  const coefficients = { ...SPEC_COEFFICIENTS };
  for (const k of Object.keys(SPEC_COEFFICIENTS) as (keyof CalcCoefficients)[]) {
    if (k === 'cap_saving_at_bill') coefficients[k] = bool(coefRaw[k], SPEC_COEFFICIENTS[k]);
    else {
      const n = num(coefRaw[k]);
      if (n !== null) coefficients[k] = n;
    }
  }

  return {
    inputs,
    coefficients,
    assumptions: {
      seg_rate_gbp_per_kwh: num(assumptions.seg_rate_gbp_per_kwh),
      off_peak_spread_gbp_per_kwh: num(assumptions.off_peak_spread_gbp_per_kwh),
      standing_charge_gbp_per_year: num(assumptions.standing_charge_gbp_per_year),
    },
    battery: {
      module_kwh: num(battery.module_kwh) ?? 5,
      module_price_gbp: num(battery.module_price_gbp),
      max_kwh: num(battery.max_kwh),
    },
    finance: {
      enabled: bool(finance.enabled, false),
      lender_name: str(finance.lender_name),
      fca_wording: str(finance.fca_wording),
    },
    company: {
      phone: str(company.phone) ?? '',
      website: str(company.website),
      registered_details: str(company.registered_details),
      business_address: str(company.business_address),
      opt_out_url: str(company.opt_out_url),
      privacy_url: str(company.privacy_url),
    },
    landing: {
      team_story: str(landing.team_story),
      review_rating: str(landing.review_rating),
      review_quote: str(landing.review_quote),
      review_name: str(landing.review_name),
      walk_in_lookup_enabled: bool(landing.walk_in_lookup_enabled, false),
      booking_rate_limit_per_hour: num(landing.booking_rate_limit_per_hour) ?? 5,
      page_rate_limit_per_minute: num(landing.page_rate_limit_per_minute) ?? 30,
    },
  };
}

/** The calculator can only run once all three [TBC] assumptions are set. */
export function calculatorReady(a: CalcAssumptions): a is {
  seg_rate_gbp_per_kwh: number;
  off_peak_spread_gbp_per_kwh: number;
  standing_charge_gbp_per_year: number;
} {
  return a.seg_rate_gbp_per_kwh !== null && a.off_peak_spread_gbp_per_kwh !== null && a.standing_charge_gbp_per_year !== null;
}

/**
 * Finance copy may only appear when the global switch is on AND lender and
 * FCA wording are set (spec 9). The example text comes from the package.
 */
export function financeAllowed(f: FinanceSettings): boolean {
  return f.enabled && f.lender_name !== null && f.fca_wording !== null;
}

export type GenerationSettings = { yield_kwh_per_kwp: number | null };
export type SenderSettings = { name: string | null; role: string };
export type LetterSettings = { default_template: number; remail_window_months: number; bleed_mm: number };

export type AdminSettings = LandingSettingsBundle & {
  scaffolding: ScaffoldRates;
  generation: GenerationSettings;
  sender: SenderSettings;
  letters: LetterSettings;
  codes: { expiry_months: number };
};

/** Everything the admin screens read, from a key → value map of pv_settings rows. */
export function parseAdminSettings(settings: Raw): AdminSettings {
  const base = parseLandingSettings(settings);
  const sc = obj(settings['scaffolding']);
  const gen = obj(settings['generation']);
  const sender = obj(settings['sender']);
  const letters = obj(settings['letters']);
  const codes = obj(settings['codes']);
  return {
    ...base,
    scaffolding: {
      rate_per_m2_gbp: num(sc.rate_per_m2_gbp),
      fixed_fee_gbp: num(sc.fixed_fee_gbp),
      min_charge_gbp: num(sc.min_charge_gbp),
      end_return_m: num(sc.end_return_m) ?? SCAFFOLD_GEOMETRY_DEFAULTS.end_return_m,
      storey_height_m: num(sc.storey_height_m) ?? SCAFFOLD_GEOMETRY_DEFAULTS.storey_height_m,
      top_lift_m: num(sc.top_lift_m) ?? SCAFFOLD_GEOMETRY_DEFAULTS.top_lift_m,
    },
    generation: { yield_kwh_per_kwp: num(gen.yield_kwh_per_kwp) },
    sender: { name: str(sender.name), role: str(sender.role) ?? 'Director' },
    letters: {
      default_template: num(letters.default_template) ?? 5,
      remail_window_months: num(letters.remail_window_months) ?? 6,
      bleed_mm: num(letters.bleed_mm) ?? 0,
    },
    codes: { expiry_months: num(codes.expiry_months) ?? 12 },
  };
}
