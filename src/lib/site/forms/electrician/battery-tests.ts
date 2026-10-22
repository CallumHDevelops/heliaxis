/**
 * HX-BAT-02 Battery switch-on and test record (WORDING-SPEC 5): the maker's commissioning, then the
 * battery's function, grid and back-up tests in Heliaxis's own words, each Pass, Fail or N/A. Each
 * has its question, a line of help under it, and for some the how-to behind ⓘ (printed in full on the
 * record). The back-up tests are asked only of a battery that gives back-up. Type-only imports.
 */
import type { Field, FormCtx } from '../types';
import { el, is, num } from './shared';

export const BAT_TEST_SECTIONS = ['The maker’s commissioning', 'The battery working', 'On the grid', 'Back-up', 'Grid services and meters', 'Notes'] as const;
export type BatTestSection = (typeof BAT_TEST_SECTIONS)[number];

/** One test: its key, section, question, help, the how-to behind ⓘ, and whether it's a back-up test. */
export type BatTest = { key: string; section: BatTestSection; q: string; help: string; info?: string; backup?: boolean };

export const BAT_TESTS: BatTest[] = [
  {
    key: 'bat_online',
    section: 'The battery working',
    q: 'Is it online and reporting?',
    help: 'Set up and talking to the maker’s app or portal. Same answer as getting it on the customer’s internet at Finish.',
  },
  {
    key: 'bat_control',
    section: 'The battery working',
    q: 'Are its controls and monitoring working?',
    help: 'The readings make sense (charge level, battery power, grid import and export from the meter or CT clamp), and it follows the settings you’ve made.',
  },
  {
    key: 'bat_display',
    section: 'The battery working',
    q: 'Do its display and any alarms work?',
    help: 'The screen or lights show the right status, and any alarm or warning works. N/A if it has neither.',
  },
  {
    key: 'bat_cycle',
    section: 'The battery working',
    q: 'Does it charge and discharge?',
    help: 'See it do both.',
    info: 'Run any checks the maker’s manual asks for at commissioning. A full capacity test isn’t normally needed on a home battery.',
  },
  {
    key: 'bat_temp',
    section: 'The battery working',
    q: 'Does its heating or cooling work?',
    help: 'Any fan, heater or cooling that keeps the battery at the right temperature. N/A if it has none.',
  },
  { key: 'bat_vent_fans', section: 'The battery working', q: 'Does any ventilation fitted for it work?', help: 'Extract fans, powered vents and their controls. N/A if there are none.' },
  {
    key: 'bat_fire_test',
    section: 'The battery working',
    q: 'Does the fire detection for it work?',
    help: 'Test the smoke or heat detector near the battery, and any other fire system fitted for it. N/A if none is fitted.',
  },
  {
    key: 'bat_electrolyte',
    section: 'The battery working',
    q: 'Is the electrolyte right?',
    help: 'Wet cells such as lead-acid only: level and strength, checked with a hydrometer or as the maker says. N/A for lithium.',
  },
  {
    key: 'bat_other_parts',
    section: 'The battery working',
    q: 'Do any other working parts of the system work?',
    help: 'For example pumps or control valves that are part of the battery system. N/A if it has none.',
  },
  {
    key: 'bat_grid_loss',
    section: 'On the grid',
    q: 'Does it stop feeding the grid when the supply is lost?',
    help: 'The loss of mains check.',
    info: 'Switch the incoming supply off and check the system disconnects from the grid (and, with back-up, switches over). A larger system on the G99 route may need a longer sequence of tests, such as injection testing.',
  },
  {
    key: 'bat_export_cap',
    section: 'On the grid',
    q: 'Does the export limit hold?',
    help: 'Where the design caps what the site can send to the grid (from the panels or the battery), prove the cap works.',
    info: 'ENA G100 sets out the commissioning tests the DNO expects for an export limit.',
  },
  {
    key: 'bat_bu_switch',
    section: 'Back-up',
    q: 'Does it switch to back-up and back again properly?',
    help: 'Cut the grid supply, then restore it.',
    info: 'Check that the changeover switch or relays work, the neutral-earth link switches as designed, only the back-up circuits stay on, and the earth electrode reads right (below). The IET Code of Practice for Electrical Energy Storage Systems covers how back-up should be arranged.',
    backup: true,
  },
  {
    key: 'bat_bu_quality',
    section: 'Back-up',
    q: 'On back-up, are the voltage and frequency right?',
    help: 'Measure at a back-up circuit while it runs from the battery, against the inverter maker’s figures.',
    info: 'For bigger or sensitive loads, the waveform and harmonics may need checking too.',
    backup: true,
  },
  {
    key: 'bat_grid_services',
    section: 'Grid services and meters',
    q: 'If it provides a service to the grid, has it passed that service’s tests?',
    help: 'For example frequency response.',
    info: 'The service sets the tests. Usually a test set simulates a change on the grid, and you check the battery responds as the service needs (how fast it charges or discharges).',
  },
  {
    key: 'bat_meters',
    section: 'Grid services and meters',
    q: 'Do the meters that count its income or its use read correctly?',
    help: 'Where the battery earns from a service, or its warranty depends on measured use, check those meters record correctly. N/A if neither.',
  },
];

const backup = (c: FormCtx) => is(c, 'eess_backup', 'yes');
const NOTES: Record<string, (c: FormCtx) => string | null> = {
  bat_cycle: () => 'Photo of the app or screen charging or discharging: Battery working (EP38).',
  bat_fire_test: () => 'Detector photo: Smoke / heat detection (EP35).',
  bat_grid_loss: (c) => (el(c).dno_route ? `The job’s DNO route: ${el(c).dno_route?.toUpperCase()}.` : null),
  bat_export_cap: (c) => (el(c).export_limit_kw !== null ? `The design has a ${el(c).export_limit_kw} kW export limit, so this test applies.` : 'No export limit in the design: N/A is expected.'),
  bat_grid_services: () => 'Usually N/A on homes.',
};
const SECTION_NOTE: Partial<Record<BatTestSection, string>> = { 'Grid services and meters': 'Usually N/A on a home battery.' };

const testField = (r: BatTest, first: boolean): Field => ({
  key: r.key,
  type: 'PFN',
  label: r.q,
  hint: r.help,
  ...(r.info ? { info: r.info } : {}),
  note: NOTES[r.key],
  level: 'must',
  ...(first ? { group: r.section, groupNote: SECTION_NOTE[r.section] } : {}),
  ...(r.backup ? { show: backup } : {}),
});
const firstOf = (r: BatTest) => BAT_TESTS.find((x) => x.section === r.section) === r;

/** The earth electrode's reading, beside the changeover test (asked once: offered from the certificate). */
export const ELECTRODE_FIELD: Field = {
  key: 'bat_bu_ra',
  type: 'NUM',
  label: 'Earth electrode resistance',
  hint: 'Measured at the back-up supply’s earth electrode. Offered from your certificate when you’ve recorded it there.',
  level: 'should',
  unit: 'Ω',
  dp: 2,
  min: 0,
  max: 2000,
  show: backup,
  suggest: (c) => {
    const v = num(c.values.eic_ra);
    return v !== null ? { v, src: 'job', text: `${v} Ω (from your certificate)` } : null;
  },
};

export const BAT_TEST_FIELDS: Field[] = [
  { key: 'bat_mfr_ref', type: 'TEXT', label: 'Maker’s commissioning reference', hint: 'From the maker’s commissioning app or installer portal, if it gives one.', level: 'should', group: 'The maker’s commissioning' },
  {
    key: 'bat_mfr_photo',
    type: 'PHOTOS',
    label: 'Photo of the maker’s commissioning screen or report',
    hint: 'Shows the maker’s own commissioning was done. It matters for the warranty.',
    level: 'should',
    need: 0,
  },
  ...BAT_TESTS.filter((r) => r.section !== 'Back-up' && r.section !== 'Grid services and meters').map((r) => testField(r, firstOf(r))),
  testField(BAT_TESTS.find((r) => r.key === 'bat_bu_switch')!, true),
  ELECTRODE_FIELD,
  testField(BAT_TESTS.find((r) => r.key === 'bat_bu_quality')!, false),
  ...BAT_TESTS.filter((r) => r.section === 'Grid services and meters').map((r) => testField(r, firstOf(r))),
  { key: 'bat_test_notes', type: 'LONG', label: 'Anything else about the switch-on and tests?', hint: 'Say what happened on any test that failed.', level: 'optional', group: 'Notes' },
];
