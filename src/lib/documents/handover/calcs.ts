import 'server-only';
import type { CalcsInput } from '@/lib/handover/inputs';
import { begin } from './common';

/**
 * HX-HO-14, the system design calculations: the MCS performance estimate the OpenSolar design worked out
 * (installation data, the performance calculation, self-consumption with panels only and with the
 * battery, additional benefits), printed in our own layout from the figures the design printed. Nothing
 * here is worked out: only the design's figures are shown.
 */
export const CALCS_TITLE = 'System design calculations';

export async function makeCalcs(c: CalcsInput): Promise<Uint8Array> {
  const kit = await begin('HX-HO-14', CALCS_TITLE, c, { pairs: c.option ? [['Design option', c.option]] : [] });
  kit.paragraph('The calculations behind your system’s design: its expected performance, worked out by the standard MCS procedure in our design software.');
  if (c.equipment.length) {
    kit.section('The system designed');
    kit.rows(c.equipment.map(([label, value]) => ({ label, value })));
  }
  for (const s of c.sections) {
    kit.section(s.title);
    kit.grid({ columns: ['', 'Figure'], rows: s.rows.map((r) => [r.label, `${r.value}${r.unit && r.unit !== '°' ? ` ${r.unit}` : r.unit}`]), widths: [5, 2] });
  }
  kit.section('Please note');
  kit.paragraph(c.note);
  return kit.save();
}
