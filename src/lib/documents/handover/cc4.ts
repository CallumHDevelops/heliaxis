import 'server-only';
import type { SwitchInput } from '@/lib/handover/inputs';
import { begin } from './common';

/**
 * CC4's own page, "How to switch your system off" (SPEC 4.5): where this house's switches are (the
 * consumer unit circuit, the AC, DC and battery isolators), the order to switch them, and the
 * back-up warning when the battery keeps circuits on in a power cut. The words are the draft the
 * owner approved (DRAFTS.shutdown); the manufacturers' own start-up and shutdown procedures follow
 * it in the pack, from the product library.
 */
export const CC4_TITLE = 'How to switch your system off';

export async function makeSwitchOff(s: SwitchInput): Promise<Uint8Array> {
  const kit = await begin('CC4', CC4_TITLE, s, { label: 'CC4' });
  const order = s.steps.filter((l) => /^\d\./.test(l));
  const after = s.steps.filter((l) => !/^\d\./.test(l));
  kit.section('To switch it off', { intro: 'In this order. Each switch is labelled.' });
  kit.paragraph(order.join('\n'));
  for (const l of after) kit.paragraph(l, { bold: /back-up power|keep away/.test(l) });
  if (s.procedures.length) {
    kit.section('The manufacturers’ procedures');
    kit.paragraph(`Starting up and shutting down, step by step, in the manufacturers’ own words: ${s.procedures.join('; ')}. They follow this page.`);
  }
  return kit.save();
}
