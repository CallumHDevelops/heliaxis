/**
 * Answers saved before the electrician's records were rewritten in Heliaxis's own words (schema
 * version 4, WORDING-SPEC 12): preview jobs only, as none of it had shipped. Read-time aliases, so an
 * old answer shows under its new key until the preview rows are migrated, plus the few value rules
 * where a check was split, merged or reworded. Drop this file once the preview rows are migrated.
 * Pure, no imports: the rules (rules.ts) apply it when they read the answers.
 */

/** Old key → new key, for each base key (a ✓ / ✗ / N/A row's note and photo follow it: TICKS). */
const RENAMED: Record<string, string> = {
  // PV inspection
  f44_01: 'pvi_kit',
  f44_02: 'pvi_access',
  f44_03: 'pvi_connected',
  f44_04: 'pvi_special',
  f44_05: 'pvi_suits',
  f44_06: 'pvi_clear',
  f44_07: 'pvi_ends',
  f44_08: 'pvi_sizes',
  f44_09: 'pvi_routes',
  f44_10: 'pvi_fire_stop',
  f44_11: 'pvi_airflow',
  f44_12: 'pvi_corrosion',
  f44_13: 'pvi_fixed',
  f44_14: 'pvi_entry',
  f44_15: 'pvi_live',
  f44_16: 'pvi_frame_bonded',
  f44_17: 'pvi_spd',
  f44_18: 'pvi_rcd',
  f44_19: 'pvi_frame_lps',
  f44_20: 'pvi_roof_fire',
  f44_21: 'pvi_ac_dc',
  f44_22: 'pvi_dc_switch',
  f44_23: 'pvi_dc_insul',
  f44_24: 'pvi_dc_volts',
  f44_25: 'pvi_string_fuse',
  f44_26: 'pvi_ac_lock',
  f44_27: 'pvi_meter',
  f44_28: 'pvi_grid',
  f44_29: 'pvi_labels',
  f44_30: 'pvi_schematic',
  f44_31: 'pvi_settings_note',
  f44_32: 'pvi_shutdown',
  f44_33: 'pvi_ac_label',
  f44_34: 'pvi_dc_label',
  f44_35: 'pvi_labels_last',
  f44_36: 'pvi_dno',
  f44_37: 'pvi_tests',
  f44_38: 'pvi_cert',
  f44_comments: 'pvi_notes',
  // String tests
  f43_kind: 'pvt_kind',
  f43_desc: 'pvt_desc',
  f43_instruments: 'pvt_tester',
  f43_cal: 'pvt_tester_cal',
  f43_strings: 'pvt_strings',
  f43_module: 'pvt_panel',
  f43_qty: 'pvt_panels',
  f43_spec_voc: 'pvt_voc_stc',
  f43_spec_isc: 'pvt_isc_stc',
  f43_wire_type: 'pvt_cable',
  f43_wire_phase: 'pvt_cable_mm2',
  f43_wire_earth: 'pvt_earth_mm2',
  f43_ocpd_type: 'pvt_fuse',
  f43_ocpd_a: 'pvt_fuse_a',
  f43_ocpd_v: 'pvt_fuse_v',
  f43_ocpd_ka: 'pvt_fuse_ka',
  f43_iso_loc: 'pvt_iso_where',
  f43_iso_a: 'pvt_iso_a',
  f43_iso_v: 'pvt_iso_v',
  f43_inv_model: 'pvt_inv',
  f43_inv_serial: 'pvt_inv_serial',
  f43_earth_cont: 'pvt_frame_earth',
  f43_polarity: 'pvt_polarity',
  f43_test_voc: 'pvt_voc',
  f43_test_isc: 'pvt_isc',
  f43_irr: 'pvt_irr',
  f43_ir_v: 'pvt_ir_v',
  f43_ir_pos: 'pvt_ir_pos',
  f43_ir_neg: 'pvt_ir_neg',
  f43_iso_func: 'pvt_iso_ok',
  f43_inv_func: 'pvt_inv_ok',
  f43_failn: 'pvt_fail_note',
  f43_comments: 'pvt_notes',
  // Switch-on
  f44a_1: 'pvc_start',
  f44a_2: 'pvc_grid',
  f44a_3: 'pvc_export',
  f44a_4: 'pvc_isolators',
  f44a_5: 'pvc_meter',
  f44a_6: 'pvc_monitoring',
  f44a_7: 'pvc_labels',
  f44a_8: 'pvc_generating',
  f44a_9: 'pvc_shown',
  // Battery inspection
  f74_1_01: 'bat_standards',
  f74_1_02: 'bat_design',
  f74_1_04: 'bat_undamaged',
  f74_1_05: 'bat_cable_ends',
  f74_1_06: 'bat_cable_rating',
  f74_1_07: 'bat_device_rating',
  f74_1_08: 'bat_device_fit',
  f74_1_10: 'bat_live_parts',
  f74_1_11: 'bat_extra_prot',
  f74_1_12: 'bat_other_prot',
  f74_1_13: 'bat_earthing',
  f74_1_14: 'bat_apart',
  f74_1_16: 'bat_labels',
  f74_1_17: 'bat_bu_isolate',
  f74_1_18: 'bat_bu_electrode',
  f74_1_19: 'bat_bu_rcd',
  f74_1_20: 'bat_bu_spd',
  f74_1_21: 'bat_bu_load',
  f74_1_22: 'bat_space_vent',
  f74_1_23: 'bat_conditions',
  f74_1_24: 'bat_fire',
  f74_1_25: 'bat_signs',
  f74_1_26: 'bat_manual',
  f74_1_27: 'bat_space',
  f74_1_28: 'bat_vents_clear',
  f74_1_29: 'bat_heat',
  f74_1_30: 'bat_reach',
  f74_1_31: 'bat_notices',
  f74_1_notes: 'bat_inspect_notes',
  f74_2_tests: 'bat_tests_done',
  f74_2_refs: 'bat_tests_ref',
  // Battery tests
  f74_mfr_ref: 'bat_mfr_ref',
  f74_mfr_p: 'bat_mfr_photo',
  f74_4_notes: 'bat_test_notes',
  eess_t_01: 'bat_control',
  eess_t_02: 'bat_online',
  eess_t_03: 'bat_display',
  eess_t_04: 'bat_cycle',
  eess_t_05: 'bat_temp',
  eess_t_06: 'bat_vent_fans',
  eess_t_07: 'bat_fire_test',
  eess_t_08: 'bat_electrolyte',
  eess_t_09: 'bat_other_parts',
  eess_a_01: 'bat_grid_loss',
  eess_a_02: 'bat_export_cap',
  eess_a_03: 'bat_grid_services',
  eess_a_04: 'bat_meters',
  eess_a_05: 'bat_bu_quality',
  eess_a_06: 'bat_bu_switch',
  eess_a_06_ra: 'bat_bu_ra',
  // System summary
  f78_kind: 'hos_kind',
  f78_p_info: 'hos_pv_view',
  f78_p_circuits: 'hos_circuits',
  f78_e_info: 'hos_bat_view',
  f78_e_kw: 'hos_bat_kw',
};

/** Old keys of ✓ / ✗ / N/A rows: their `n` (the problem) and `p` (its photo) are renamed with them. */
const TICK = /^(f44_\d\d|f44a_[1-57-9]|f74_1_\d\d)$/;

/** New key → the old key it's read from while the new one is missing (WORDING-SPEC 0.4). */
export const LEGACY_KEYS: Record<string, string> = Object.fromEntries(
  Object.entries(RENAMED).flatMap(([old, now]) => [
    [now, old],
    ...(TICK.test(old) ? [[`${now}n`, `${old}n`] as const, [`${now}p`, `${old}p`] as const] : []),
  ])
);

/** Keys that went with no new key of their own (folded into others by the value rules below). */
export const RETIRED_KEYS = ['f44_20_kind', 'f44_t2', 'f74_1_03', 'f74_1_03n', 'f74_1_03p', 'f74_1_09', 'f74_1_09n', 'f74_1_09p', 'f74_1_15', 'f74_1_15n', 'f74_1_15p', 'f74_2_notes', 'bl_vent', 'bl_notice'];

/** The electrician's old section ids (on site_assignments.forms) → the new ones. */
export const LEGACY_SECTIONS: Record<string, string> = { f43: 'pvtests', f44: 'pvinspect', f44a: 'pvswitchon', f74: 'battery', f78: 'summary' };
/** An assignment's sections with any old ids read as the new ones, in the order they came. */
export const legacySections = (forms: string[]): string[] => [...new Set(forms.map((f) => LEGACY_SECTIONS[f] ?? f))];

const has = (v: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(v, k);

/** The values with every old answer read under its new key, where the new key has none (WORDING-SPEC 12.3). */
export function withLegacy(values: Record<string, unknown>): Record<string, unknown> {
  if (!Object.keys(values).some((k) => /^(f43_|f44|f74_|f78_|eess_[ta]_|bl_vent$|bl_notice$)/.test(k))) return values;
  const out: Record<string, unknown> = { ...values };
  const fill = (k: string, v: unknown) => {
    if (!has(out, k) && v !== undefined) out[k] = v;
  };
  for (const [now, old] of Object.entries(LEGACY_KEYS)) if (has(values, old)) fill(now, values[old]);
  // The mounting: Pitched Roof was on-roof.
  const kind = values.f44_20_kind;
  fill('pvi_mount', kind === 'pitched' ? 'on_roof' : kind === 'in_roof' ? 'in_roof' : undefined);
  // The frame earthing table: one list of a–d became four questions; a+b, or d with another, stays unanswered.
  if (Array.isArray(values.f44_t2) && values.f44_t2.length) {
    const t = values.f44_t2 as string[];
    const clash = (t.includes('a') && t.includes('b')) || (t.includes('d') && t.length > 1);
    if (!clash) {
      fill('pvi_frame_metal', 'yes');
      if (t.includes('a')) fill('pvi_frame_ext', 'yes');
      if (t.includes('b')) {
        fill('pvi_frame_exp', 'yes');
        fill('pvi_frame_ext', 'no');
      }
      if (t.includes('c')) fill('pvi_frame_lp', 'yes');
      if (t.length === 1 && t[0] === 'd') ['pvi_frame_ext', 'pvi_frame_exp', 'pvi_frame_lp'].forEach((k) => fill(k, 'no'));
    }
  }
  // Rows merged into others: copied where those are still unanswered.
  const copy = (old: string, now: string) => {
    if (!has(values, old) || has(out, now)) return;
    out[now] = values[old];
    fill(`${now}n`, values[`${old}n`]);
    fill(`${now}p`, values[`${old}p`]);
  };
  copy('f74_1_03', 'bat_standards');
  copy('f74_1_03', 'bat_manual');
  copy('f74_1_09', 'bat_conditions');
  copy('f74_1_15', 'bat_reach');
  // Part 2's notes join the inspection's.
  if (typeof values.f74_2_notes === 'string' && values.f74_2_notes.trim()) {
    const before = typeof out.bat_inspect_notes === 'string' ? out.bat_inspect_notes.trim() : '';
    out.bat_inspect_notes = before ? `${before}\n${values.f74_2_notes.trim()}` : values.f74_2_notes.trim();
  }
  // The location check's ventilation and notices became the inspection's rows.
  for (const [old, now, note] of [
    ['bl_vent', 'bat_space_vent', 'Not ventilated as the maker asks'],
    ['bl_notice', 'bat_notices', 'Battery notices not up'],
  ] as const) {
    if (values[old] === 'yes') fill(now, 'done');
    if (values[old] === 'no' && !has(out, now)) {
      out[now] = 'problem';
      fill(`${now}n`, note);
    }
  }
  for (const k of [...Object.values(LEGACY_KEYS), ...RETIRED_KEYS]) delete out[k];
  return out;
}
