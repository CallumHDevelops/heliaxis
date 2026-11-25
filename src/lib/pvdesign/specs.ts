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
