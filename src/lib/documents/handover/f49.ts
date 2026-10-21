import 'server-only';
import type { ScheduleInput } from '@/lib/handover/inputs';
import { begin } from './common';

/**
 * F49, the maintenance schedule (SPEC 4.5): item · what to check · who · how often · where that comes
 * from. Every interval comes from the EIC's next inspection, the product library (typed from the
 * manufacturer's papers, with its source) or the owner's own rows; otherwise it says "As the
 * manufacturer's manual says" and points to CC5. Never a made-up number.
 */
export const F49_TITLE = 'Solar PV Maintenance Schedule';

export async function makeSchedule(s: ScheduleInput): Promise<Uint8Array> {
  const kit = await begin('F49', F49_TITLE, s);
  kit.section('What needs checking', { intro: 'Who does it and how often. Each interval says where it comes from.' });
  kit.grid({ columns: ['Item', 'What to check', 'Who', 'How often', 'Source'], rows: s.rows.map((r) => [r.item, r.check, r.who, r.often, r.source]), widths: [1.6, 2, 1, 1.7, 1.3] });
  kit.note('The manufacturers’ manuals and warranties are in Manufacturer Information (CC5).');
  return kit.save();
}
