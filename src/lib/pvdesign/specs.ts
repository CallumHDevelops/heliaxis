import type { BatterySpec, InverterSpec, PanelSpec } from './check';
import type { PanelSize } from './layout';

/**
 * Turns the price book's `specs` jsonb (snake_case, from datasheets) into the typed specs the checks use.
 * A figure that is absent, null or not a number becomes null: it is never defaulted.
 */
type Json = Record<string, unknown> | null | undefined;

const n = (s: Json, k: string): number | null => {
  const v = s?.[k];
  const x = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
};
const b = (s: Json, k: string): boolean | null => (typeof s?.[k] === 'boolean' ? (s[k] as boolean) : null);

export const toPanelSpec = (s: Json): PanelSpec => ({ wp: n(s, 'wp'), voc: n(s, 'voc'), vmp: n(s, 'vmp'), isc: n(s, 'isc'), imp: n(s, 'imp'), tempCoeffVocPct: n(s, 'temp_coeff_voc_pct'), tempCoeffVmpPct: n(s, 'temp_coeff_vmp_pct') });

export function toPanelSize(s: Json): PanelSize | null {
  const w = n(s, 'width_mm');
  const h = n(s, 'height_mm');
  if (w == null || h == null || w <= 0 || h <= 0) return null;
  return { widthMm: Math.min(w, h), heightMm: Math.max(w, h) };
}

export const toInverterSpec = (s: Json): InverterSpec => ({
  acKw: n(s, 'ac_kw'),
  maxDcV: n(s, 'max_dc_v'),
  mpptMinV: n(s, 'mppt_min_v'),
  mpptMaxV: n(s, 'mppt_max_v'),
  mpptCount: n(s, 'mppt_count'),
  maxInputCurrentA: n(s, 'max_input_current_a'),
  maxIscA: n(s, 'max_isc_a'),
  maxPvKw: n(s, 'max_pv_kw'),
  batteryMinV: n(s, 'battery_min_v'),
  batteryMaxV: n(s, 'battery_max_v'),
  maxChargeKw: n(s, 'max_charge_kw'),
  maxDischargeKw: n(s, 'max_discharge_kw'),
  offGridCapable: b(s, 'off_grid_capable'),
  generatorInput: b(s, 'generator_input'),
});

export const toBatterySpec = (s: Json): BatterySpec => ({ usableKwh: n(s, 'usable_kwh'), nominalV: n(s, 'nominal_v'), maxChargeKw: n(s, 'max_charge_kw'), maxDischargeKw: n(s, 'max_discharge_kw') });

/** The datasheet figures a product may carry, by category (snake_case, as in supabase/price-book.sql). */
export const SPEC_KEYS: Record<string, { num: string[]; bool: string[] }> = {
  panel: { num: ['wp', 'voc', 'vmp', 'isc', 'imp', 'temp_coeff_voc_pct', 'temp_coeff_vmp_pct', 'width_mm', 'height_mm'], bool: [] },
  inverter: { num: ['ac_kw', 'max_dc_v', 'mppt_min_v', 'mppt_max_v', 'mppt_count', 'max_input_current_a', 'max_isc_a', 'max_pv_kw', 'battery_min_v', 'battery_max_v', 'max_charge_kw', 'max_discharge_kw'], bool: ['off_grid_capable', 'generator_input'] },
  battery: { num: ['usable_kwh', 'nominal_v', 'max_charge_kw', 'max_discharge_kw'], bool: [] },
};

/**
 * Specs typed in by a person (as a JSON string) made safe to store: only figures this category uses, only real numbers
 * and booleans. Anything else is dropped and reported, so a typo can't become a spec.
 */
export function parseSpecsJson(text: string | null | undefined, category: string): { specs: Record<string, number | boolean>; dropped: string[]; error?: string } {
  const out: Record<string, number | boolean> = {};
  const dropped: string[] = [];
  if (!text?.trim()) return { specs: out, dropped };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { specs: out, dropped, error: 'specs_json is not valid JSON.' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { specs: out, dropped, error: 'specs_json must be a JSON object.' };
  const allowed = SPEC_KEYS[category];
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (allowed?.num.includes(k) && typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (allowed?.bool.includes(k) && typeof v === 'boolean') out[k] = v;
    else dropped.push(k);
  }
  return { specs: out, dropped };
}

/** A SKU from a make and model: "Solis" + "S6-EH1P6K" gives "SOLIS-S6-EH1P6K". */
export function skuFrom(make: string, model: string): string {
  return `${make}-${model}`.toUpperCase().replace(/[^A-Z0-9._/-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}
