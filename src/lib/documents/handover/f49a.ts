import 'server-only';
import type { AgreementInput } from '@/lib/handover/inputs';
import { begin } from './common';

/**
 * F49A, the maintenance agreement (SPEC 4.5): only when a plan was sold. The owner's own wording from
 * CRM settings, then the plan's details typed by the office exactly as quoted.
 */
export const F49A_TITLE = 'Solar PV Maintenance Agreement';

export async function makeAgreement(a: AgreementInput): Promise<Uint8Array> {
  const kit = await begin('F49A', F49A_TITLE, a);
  kit.section('Your plan');
  kit.rows(a.values.map((v) => ({ label: v.label, value: v.value, must: true })));
  kit.section('The agreement');
  for (const p of a.text.split(/\n{2,}/)) kit.paragraph(p);
  return kit.save();
}
