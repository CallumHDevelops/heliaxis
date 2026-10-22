/**
 * The electrician's pack (SPEC 2.1): one form, its steps in the phone's order, made from the sections
 * on the assignment (forms/index.ts formsFor: the job's technologies, changed with ticks on the Site
 * tab). Sections that don't apply aren't shown. The certificate and Finish are always there: the
 * owner's completion conditions aren't optional. Type-only imports, plus the sections.
 */
import type { FlagRule, SiteForm, Step } from '../types';
import { BAT_FLAGS, BAT_TESTS_STEP, batInspectStep, LOCATION_FLAGS } from './battery';
import { certFlags, certSteps } from './cert';
import { EV_FLAGS, EV_STEP } from './ev';
import { finishSig, FINISH_FLAGS, FINISH_STEP } from './finish';
import { HP_STEP } from './heatpump';
import { PHOTOS_STEP } from './photos';
import { PV_INSPECT_FLAGS, PV_INSPECT_STEP } from './pv-inspect';
import { PV_SWITCHON_FLAGS, PV_SWITCHON_STEP } from './pv-switch-on';
import { PV_TEST_FLAGS, PV_TEST_STEP } from './pv-tests';
import { SERIAL_FLAGS, SERIALS_STEP } from './serials';
import { SUMMARY_FLAGS, SUMMARY_STEP } from './summary';

/**
 * Each section's steps (given every section on the assignment: the battery inspection asks the
 * location questions when PAS 63100 is one of them), flags and rough minutes on the job screen.
 */
const SECTIONS: Record<string, { steps: (forms: string[]) => Step[]; flags: () => FlagRule[]; minutes: number }> = {
  photos: { steps: () => [PHOTOS_STEP], flags: () => [], minutes: 15 },
  serials: { steps: () => [SERIALS_STEP], flags: () => SERIAL_FLAGS, minutes: 10 },
  pvinspect: { steps: () => [PV_INSPECT_STEP], flags: () => PV_INSPECT_FLAGS, minutes: 10 },
  pvtests: { steps: () => [PV_TEST_STEP], flags: () => PV_TEST_FLAGS, minutes: 20 },
  pvswitchon: { steps: () => [PV_SWITCHON_STEP], flags: () => PV_SWITCHON_FLAGS, minutes: 3 },
  battery: { steps: (forms) => [batInspectStep(forms.includes('pas63100')), BAT_TESTS_STEP], flags: () => BAT_FLAGS, minutes: 20 },
  // PAS 63100: its questions are asked inside the battery inspection; this section adds their flags.
  pas63100: { steps: () => [], flags: () => LOCATION_FLAGS, minutes: 3 },
  ev: { steps: () => [EV_STEP], flags: () => EV_FLAGS, minutes: 10 },
  heatpump: { steps: () => [HP_STEP], flags: () => [], minutes: 10 },
  summary: { steps: () => [SUMMARY_STEP], flags: () => SUMMARY_FLAGS, minutes: 2 },
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
    steps: used.flatMap((k) => SECTIONS[k].steps(used)),
    sig: finishSig(used),
    flags: used.flatMap((k) => SECTIONS[k].flags()),
    minutes: used.reduce((a, k) => a + SECTIONS[k].minutes, 0),
  };
}
