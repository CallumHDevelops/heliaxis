/**
 * The electrician's pack (SPEC 2.1): one form, its steps in the phone's order, made from the sections
 * on the assignment (forms/index.ts formsFor: the job's technologies, changed with ticks on the Site
 * tab). Sections that don't apply aren't shown. The certificate and Finish are always there: the
 * owner's completion conditions aren't optional. Type-only imports, plus the sections.
 */
import type { FlagRule, SiteForm, Step } from '../types';
import { certFlags, certSteps } from './cert';
import { EV_FLAGS, EV_STEP } from './ev';
import { F43_FLAGS, F43_STEP } from './f43';
import { F44_FLAGS, F44_STEP } from './f44';
import { F44A_STEP } from './f44a';
import { F74_FLAGS, F74_STEP, F74_TESTS_STEP } from './f74';
import { F78_FLAGS, F78_STEP } from './f78';
import { EF_SIG, FINISH_FLAGS, FINISH_STEP } from './finish';
import { HP_STEP } from './heatpump';
import { LOCATION_FLAGS, LOCATION_STEP } from './pas63100';
import { PHOTOS_STEP } from './photos';
import { SERIAL_FLAGS, SERIALS_STEP } from './serials';

/** Each section's steps, flags and rough minutes on the job screen ("about 90 minutes"). */
const SECTIONS: Record<string, { steps: () => Step[]; flags: () => FlagRule[]; minutes: number }> = {
  photos: { steps: () => [PHOTOS_STEP], flags: () => [], minutes: 15 },
  serials: { steps: () => [SERIALS_STEP], flags: () => SERIAL_FLAGS, minutes: 10 },
  f43: { steps: () => [F43_STEP], flags: () => F43_FLAGS, minutes: 20 },
  f44: { steps: () => [F44_STEP], flags: () => F44_FLAGS, minutes: 10 },
  f44a: { steps: () => [F44A_STEP], flags: () => [], minutes: 3 },
  f74: { steps: () => [F74_STEP, F74_TESTS_STEP], flags: () => F74_FLAGS, minutes: 20 },
  pas63100: { steps: () => [LOCATION_STEP], flags: () => LOCATION_FLAGS, minutes: 3 },
  ev: { steps: () => [EV_STEP], flags: () => EV_FLAGS, minutes: 10 },
  heatpump: { steps: () => [HP_STEP], flags: () => [], minutes: 10 },
  f78: { steps: () => [F78_STEP], flags: () => F78_FLAGS, minutes: 2 },
  cert: { steps: certSteps, flags: certFlags, minutes: 5 },
  finish: { steps: () => [FINISH_STEP], flags: () => FINISH_FLAGS, minutes: 2 },
};

/** The electrician's form for these sections, in `order` (forms/index.ts ELECTRICIAN_FORMS). */
export function electricianForm(forms: string[], order: readonly string[]): SiteForm {
  const want = new Set([...forms, 'cert', 'finish']);
  const used = order.filter((k) => want.has(k) && SECTIONS[k]);
  return {
    id: 'electrician',
    stage: 'main',
    title: 'Electrical checks',
    steps: used.flatMap((k) => SECTIONS[k].steps()),
    sig: EF_SIG,
    flags: used.flatMap((k) => SECTIONS[k].flags()),
    minutes: used.reduce((a, k) => a + SECTIONS[k].minutes, 0),
  };
}
