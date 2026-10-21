import 'server-only';
import type { AgreementInput } from '@/lib/handover/inputs';
import { begin } from './common';

/**
 * HX-HO-12, your maintenance plan (SPEC 4.5): only when a plan was sold. The owner's own wording from
 * CRM settings, then the plan's details typed by the office exactly as quoted.
 */
export const PLAN_TITLE = 'Your maintenance plan';

export async function makeAgreement(a: AgreementInput): Promise<Uint8Array> {
  const kit = await begin('HX-HO-12', PLAN_TITLE, a);
  kit.section('Your plan');
  kit.rows(a.values.map((v) => ({ label: v.label, value: v.value, must: true })));
  kit.section('The agreement');
  for (const p of a.text.split(/\n{2,}/)) kit.paragraph(p);
  return kit.save();
}
