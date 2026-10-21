/**
 * The battery's equipment, system and application tests (FORMS 1.4): word for word the same 15 rows
 * in F74 (Parts 3 and 4) and F75, so they're answered once and printed in both. Each has a bold
 * title, the test, and in Part 4 the italic guidance (behind ⓘ on the phone, printed in full).
 * Wording exactly as the forms, with the FORMS 0.7 corrections. Type-only imports.
 */
import type { Field, FormCtx } from '../types';
import { el, is } from './shared';

export type EessRow = { key: string; part: 3 | 4; title: string; test: string; guidance?: string; sic?: string; backup?: boolean };

export const EESS_ROWS: EessRow[] = [
  { key: 'eess_t_01', part: 3, title: 'Data acquisition and control', test: 'Test to ensure that EESS data acquisition and control systems are performing correctly' },
  { key: 'eess_t_02', part: 3, title: 'Internet connectivity', test: 'Test to ensure that the EESS is correctly configured and communicating' },
  { key: 'eess_t_03', part: 3, title: 'Displays/alarms', test: 'Check to ensure correct function of any user displays or alarm mechanisms' },
  {
    key: 'eess_t_04',
    part: 3,
    title: 'Charge-discharge',
    test: 'Check that the EESS can correctly operate charge and discharge functions. Functional checks of batteries are recommended by the manufacturer or relevant standards (e.g. BS EN 61427-1 recommends battery capacity tests during commissioning). Capacity tests are not routinely required for domestic EESS installations',
  },
  { key: 'eess_t_05', part: 3, title: 'Thermal management', test: 'Check to ensure correct function of any thermal management systems' },
  { key: 'eess_t_06', part: 3, title: 'Ventilation', test: 'Check to ensure correct function of any ventilation systems and controls' },
  { key: 'eess_t_07', part: 3, title: 'Fire systems', test: 'Check to ensure correct function of any fire detection or management systems' },
  { key: 'eess_t_08', part: 3, title: 'Wet chemical checks', test: 'Test to validate correct status of any liquids contained within the EESS (e.g. using hydrometer to check a lead-acid battery)' },
  { key: 'eess_t_09', part: 3, title: 'Ancillary equipment', test: 'Check to ensure correct function of any ancillary equipment forming part of the EESS (e.g. pumps, control valves, etc.)' },
  {
    key: 'eess_a_01',
    part: 4,
    title: 'G98/G99',
    test: 'Test for EESS that can operate in parallel to the grid (‘grid connected’)',
    guidance:
      'At the most basic these tests may simply be a ‘loss of mains test’ to ensure that the system operates correctly when the mains supply is lost. For larger systems, a longer test sequence, such as G99 ‘injection testing’, may be required.',
  },
  {
    key: 'eess_a_02',
    part: 4,
    title: 'Export limitation (G100)',
    test: 'Where the EESS is part of a system that has been specified to control site export to a specific limit (export from the on-site generation or the battery), a suite of tests will be required to prove the correct function of these systems.',
    sic: 'prove the correction function',
    guidance: 'The commissioning tests expected by a DNO during the commissioning of an export limitation system are described in Engineering Recommendation G100.',
  },
  {
    key: 'eess_a_03',
    part: 4,
    title: 'Ancillary services',
    test: 'Where a system is providing services to support the grid, specific commissioning tests will be required to prove that the system meets the requirements of that service.',
    sic: 'in the correct manger',
    guidance:
      'These tests typically involve simulating specific grid conditions and then monitoring the EESS to ensure it responds in the correct manner. An example of these tests would be where a test set is used to inject a specific grid frequency change – and then the EESS is monitored to ensure that it has a suitable charge/discharge ramp response',
  },
  {
    key: 'eess_a_04',
    part: 4,
    title: 'Revenue metering/monitoring',
    test: 'Where an EESS derives income from providing a service, metering and data acquisition systems are deployed to monitor the EESS and allow revenue to be collected. The correct operation and accuracy of these systems may need to be tested during commissioning.',
    guidance: 'These tests may also be required for other meters in the system, such as those utilised to determine EESS usage as part of any warranty conditions',
  },
  {
    key: 'eess_a_05',
    part: 4,
    title: 'Back-up or island mode – power quality',
    test: 'Where an EESS provides a back-up or an island mode power supply, the quality of that supply may need to be verified during commissioning.',
    guidance: 'These tests may vary from simple checks of voltage and frequency to a more detailed examination of wave-shape and harmonic content.',
    backup: true,
  },
  {
    key: 'eess_a_06',
    part: 4,
    title: 'Back-up or island mode – changeover',
    test: 'Where an EESS provides a back-up power supply, the transition between on-grid and island mode operation may require functional testing.',
    sic: 'systems providing  back up functionality',
    guidance:
      'Information on the requirements for systems providing back-up functionality is provided in sections 8.3 and 9.4 of the IET Code of Practice. Commissioning tests need to determine the correct function of the measures adopted and may include:\n1. Correct function of changeover switches/relays;\n2. Correct function of neutral-earth switching;\n3. Correct separation of essential and non-essential supplies;\n4. Measurement of earth electrode resistance for the consumer’s earth electrode',
    backup: true,
  },
];

const backup = (c: FormCtx) => is(c, 'eess_backup', 'yes');
const HINTS: Record<string, (c: FormCtx) => string | null> = {
  eess_t_02: () => 'Same answer as getting it on the customer’s internet at Finish.',
  eess_t_04: () => 'Photo of the app or screen charging or discharging: Battery working (EP38).',
  eess_t_07: () => 'Detector photo: Smoke / heat detection (EP35).',
  eess_t_08: () => 'Lead-acid batteries only: N/A for lithium.',
  eess_a_01: (c) => (el(c).dno_route ? `The job’s DNO route: ${el(c).dno_route?.toUpperCase()}.` : null),
  eess_a_02: (c) => (el(c).export_limit_kw !== null ? `The design has a ${el(c).export_limit_kw} kW export limit, so this test applies.` : 'No export limit in the design: N/A is expected.'),
  eess_a_03: () => 'Usually N/A on homes.',
};

export const EESS_FIELDS: Field[] = [
  ...EESS_ROWS.map(
    (r): Field => ({
      key: r.key,
      type: 'PFN',
      label: r.title,
      hint: r.test,
      ...(r.guidance ? { info: r.guidance } : {}),
      note: HINTS[r.key],
      level: 'must',
      group: r.part === 3 ? 'Part 3: Equipment and system tests' : 'Part 4: Application tests',
      ...(r.backup ? { show: backup } : {}),
    })
  ),
  {
    key: 'eess_a_06_ra',
    type: 'NUM',
    label: 'Earth electrode resistance',
    hint: 'Item 4 of the changeover test asks for it. It’s printed in the Part 4 notes.',
    level: 'should',
    unit: 'Ω',
    dp: 2,
    min: 0,
    max: 2000,
    show: backup,
  },
];
