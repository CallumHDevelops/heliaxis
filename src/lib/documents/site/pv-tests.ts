import 'server-only';
import { newDocument } from '@/lib/documents/pdf-kit';
import { ISSUE } from '@/lib/documents/issue';
import { RECORD_TITLE } from '@/lib/site/declaration';
import { pvStringCount, pvTestField } from '@/lib/site/forms/electrician/pv-tests';
import type { FormCtx } from '@/lib/site/forms/types';
import { perStringValues } from '@/lib/site/rules';
import { answer, signature, siteBox, words, type ElectricianDocInput } from './common';

/**
 * HX-PV-02 Solar PV string test results (WORDING-SPEC 2.5): about this test, what's fitted (what's
 * the same on every string once, then a row per string), the readings (a row per string, on a
 * landscape page), problems and notes, the statement as signed and the tester's signature.
 */

export const PV_TEST_TITLE = RECORD_TITLE['HX-PV-02'];
const CODE = 'HX-PV-02';

const text = (c: FormCtx, k: string) => (typeof c.values[k] === 'string' ? (c.values[k] as string).trim() : '');

export async function makePvTests(d: ElectricianDocInput): Promise<Uint8Array> {
  const c = d.ctx;
  const kit = await newDocument({ code: CODE, title: PV_TEST_TITLE, revision: ISSUE[CODE], jobRef: d.jobRef, issued: d.date, draft: d.draft });
  kit.header({ meta: [['Job reference', d.jobRef ?? '–'], ['Test date', d.date.split('-').reverse().join('/')]] });
  siteBox(kit, d, 'Tested by', 'Test date');

  const n = Math.min(12, Math.max(1, Math.round(pvStringCount(c))));
  const gap = d.draft ? 'Not answered' : '–';
  /** One string's answer to a per-string row, in words (the unit printed in the column heading). */
  const at = (key: string, i: number, unitInLabel = true) => {
    const f = pvTestField(key);
    return words(f, perStringValues(f, c)[i], unitInLabel) ?? gap;
  };
  const once = (key: string) => {
    const f = pvTestField(key);
    return words(f, answer(f, c));
  };

  kit.section('About this test');
  const tester = [text(c, 'pvt_tester'), text(c, 'pvt_tester_cal') ? `calibrated ${text(c, 'pvt_tester_cal')}` : null].filter(Boolean).join(', ') || null;
  kit.rows([
    { label: 'Type', value: once('pvt_kind'), must: true },
    { label: 'What’s being tested', value: once('pvt_desc'), must: true },
    { label: 'Tester', value: tester, must: true },
    { label: 'Strings', value: String(n), must: true },
  ]);

  // What's the same on every string, once; then a row per string.
  kit.section('What’s fitted');
  const same = (key: string) => {
    const list = Array.from({ length: n }, (_, i) => at(key, i, false));
    return list.every((x) => x === list[0]) ? list[0] : list.map((x, i) => `String ${i + 1}: ${x}`).join(' · ');
  };
  kit.rows([
    { label: 'Panel', value: same('pvt_panel'), must: true },
    { label: 'DC cable type', value: same('pvt_cable'), must: true },
    { label: 'DC isolator', value: [same('pvt_iso_where'), same('pvt_iso_a'), same('pvt_iso_v')].join(', '), must: true },
    { label: 'Inverter', value: [same('pvt_inv'), same('pvt_inv_serial') !== gap ? `serial ${same('pvt_inv_serial')}` : null].filter(Boolean).join(', '), must: true },
  ]);
  const fuse = (i: number) => {
    const kind = at('pvt_fuse', i);
    if (kind === 'None fitted') return kind;
    return [kind, at('pvt_fuse_a', i, false), at('pvt_fuse_v', i, false), at('pvt_fuse_ka', i, false)].join(', ');
  };
  kit.grid({
    columns: ['String', 'Panels', 'Expected Voc (V)', 'Expected Isc (A)', 'Live / earth (mm²)', 'Fuse or breaker (type, A, V, kA)'],
    rows: Array.from({ length: n }, (_, i) => [String(i + 1), at('pvt_panels', i), at('pvt_voc_stc', i), at('pvt_isc_stc', i), `${at('pvt_cable_mm2', i)} / ${at('pvt_earth_mm2', i)}`, fuse(i)]),
    widths: [0.8, 0.9, 1.3, 1.3, 1.4, 2.6],
  });

  // The readings: a row per string, on a landscape page so every column reads.
  kit.newPage({ landscape: true, continued: true });
  kit.section('Readings');
  const voc = (i: number) => {
    const got = at('pvt_voc', i);
    const want = at('pvt_voc_stc', i);
    return want !== gap ? `${got} (${want})` : got;
  };
  kit.grid({
    columns: ['String', 'Frame earth (Ω)', 'Polarity', 'Voc (V), measured (expected)', 'Isc (A)', 'Irradiance (W/m²)', 'Insulation test (V)', '+ to earth (MΩ)', '− to earth (MΩ)', 'DC isolator', 'Inverter'],
    rows: Array.from({ length: n }, (_, i) => [
      String(i + 1),
      at('pvt_frame_earth', i),
      at('pvt_polarity', i),
      voc(i),
      at('pvt_isc', i),
      at('pvt_irr', i),
      at('pvt_ir_v', i),
      at('pvt_ir_pos', i),
      at('pvt_ir_neg', i),
      at('pvt_iso_ok', i),
      at('pvt_inv_ok', i),
    ]),
    widths: [0.7, 1, 0.9, 1.6, 0.8, 1, 1, 1, 1, 0.9, 0.9],
  });
  kit.newPage({ continued: true });

  kit.section('Problems and notes');
  kit.rows([
    { label: 'What failed, and what was done about it', value: text(c, 'pvt_fail_note') || 'None' },
    { label: 'Notes', value: text(c, 'pvt_notes') || 'None' },
  ]);
  await signature(kit, d, 'Tested by', CODE);
  return kit.save();
}
