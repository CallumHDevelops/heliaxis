import 'server-only';
import { longDay, type WarrantyInput } from '@/lib/handover/inputs';
import { WARRANTY_START_LABEL } from '@/lib/handover/settings-shared';
import { begin } from './common';

/**
 * F19I, the workmanship warranty (SPEC 4.5): the owner's term, start and wording from CRM settings
 * (no setting, no warranty: the item takes his own upload instead), who backs it (the guarantee's
 * provider and policy, or "Policy details to follow") and that statutory rights aren't affected.
 */
export const F19I_TITLE = 'Workmanship Warranty';

export async function makeWarranty(w: WarrantyInput): Promise<Uint8Array> {
  const kit = await begin('F19I', F19I_TITLE, w, { pairs: [['Warranty term', `${w.years} year${w.years === 1 ? '' : 's'}`], ['Starts', longDay(w.start)]] });
  kit.paragraph(`Heliaxis guarantees the workmanship of the installation at this address for ${w.years} year${w.years === 1 ? '' : 's'} from ${longDay(w.start)} (${WARRANTY_START_LABEL[w.startRule as 'commissioning' | 'handover'] ?? 'the start date'}).`);
  if (w.installed.length) {
    kit.section('The installation');
    kit.paragraph(w.installed.map((l) => `•  ${l}`).join('\n'));
  }
  kit.section('The warranty');
  for (const p of w.text.split(/\n{2,}/)) kit.paragraph(p);
  kit.section('Who backs it');
  kit.rows([{ label: 'Insurance-backed guarantee', value: w.backedBy ?? 'Policy details to follow' }]);
  kit.section('Your rights');
  kit.paragraph('Your statutory rights are not affected.');
  return kit.save();
}
