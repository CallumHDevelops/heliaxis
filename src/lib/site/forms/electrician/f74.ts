/**
 * F74 Battery Storage Inspection and Commissioning Checklist (FORMS 1.3, SPEC 2.8), and F75 printed
 * from its Parts 3 and 4. The driver question first (does the battery give back-up power?), then
 * Part 1's 31 rows in the form's sections (rows 10–13 one answer each, their sub-lines listed;
 * italics kept for the printing), Part 2, the 15 tests answered once for both forms (eess.ts), and
 * F74's maker's commissioning reference. With no back-up, the back-up rows offer one tap for N/A,
 * never a pre-answer. Flags as FORMS 5.3. Type-only imports.
 */
import type { Field, FlagRule, FormCtx, Step } from '../types';
import { certRef } from './cert';
import { EESS_FIELDS, EESS_ROWS } from './eess';
import { has, is, text, tick } from './shared';

export const F74_REVISION = 'Rev 1';
export const F75_REVISION = 'Rev 1';
export const F74_INTRO =
  'The inspection of an EESS installation needs to follow the requirements of BS 7671 and the manufacturer’s instructions for the components forming the EESS. The below checklist describes general items to be inspected and should be applied to the whole installation (both AC and DC sides).';

/** Part 1 rows: section, wording, sub-lines (rows 10–13), italic, back-up only (ⓑ). */
export type F74Row = { n: number; key: string; section: string; label: string; lines?: string[]; italic?: boolean; backup?: boolean; sic?: string };

const S1 = 'System Design/Equipment selection and connection';
const S2 = 'Protection against electric shock';
const S3 = 'General';
const S4 = 'Systems that provide back-up or island mode power supply';
const S5 = 'EESS location';
const S6 = 'EESS Equipment';

export const F74_PART1: F74Row[] = [
  { n: 1, key: 'f74_1_01', section: S1, label: 'General check to confirm equipment complies with relevant standards' },
  { n: 2, key: 'f74_1_02', section: S1, label: 'System installed in accordance with design?' },
  { n: 3, key: 'f74_1_03', section: S1, label: 'Equipment correctly selected and erected – according to standards and manufacturer’s instructions?' },
  { n: 4, key: 'f74_1_04', section: S1, label: 'Equipment undamaged?' },
  { n: 5, key: 'f74_1_05', section: S1, label: 'Conductors correctly connected, identified and routed?' },
  { n: 6, key: 'f74_1_06', section: S1, label: 'Conductors suitably selected for voltage and current requirements?', sic: 'Conductors suitable selected for voltage and current requirements?' },
  { n: 7, key: 'f74_1_07', section: S1, label: 'Switchgear and ancillary devices suitable for voltage and current requirements?' },
  { n: 8, key: 'f74_1_08', section: S1, label: 'Switchgear and ancillary devices correctly installed and connected?' },
  { n: 9, key: 'f74_1_09', section: S1, label: 'Components selected and erected to suit the locations and any external influences?', sic: 'Components selected and erected to suit the locations and any eternal influences?' },
  {
    n: 10,
    key: 'f74_1_10',
    section: S2,
    label: 'i. Basic protection (prevention of contact with live parts)',
    lines: ['Protection by insulation of live parts (e.g. conductors) - correctly applied and suitable', 'Protection by the use of barriers or enclosures – suitable and with an appropriate IP rating'],
    italic: true,
  },
  { n: 11, key: 'f74_1_11', section: S2, label: 'ii. Additional protection (additional protection measures)', lines: ['Protection by the use of an RCD not exceeding 30mA', 'Supplementary bonding'], italic: true },
  { n: 12, key: 'f74_1_12', section: S2, label: 'iii. Other methods of protection', lines: ['SELV', 'PELV', 'Double or reinforced insulation (Class II or equivalent equipment and circuits)'], italic: true },
  {
    n: 13,
    key: 'f74_1_13',
    section: S2,
    label: 'iv. Automatic disconnection of supply',
    lines: ['Suitable main earth provided', 'Earth connections suitably installed', 'Main protective bonding suitably installed', 'RCDs provided for fault protection (where necessary)'],
    italic: true,
  },
  { n: 14, key: 'f74_1_14', section: S3, label: 'Equipment and circuits deployed to prevent mutual detrimental influence?' },
  { n: 15, key: 'f74_1_15', section: S3, label: 'Equipment location to allow suitable access arrangements?' },
  { n: 16, key: 'f74_1_16', section: S3, label: 'Labels and signs displayed and durable?' },
  { n: 17, key: 'f74_1_17', section: S4, label: 'Isolation of grid supply current-carrying conductors? (see section 9.4 of Code of Practice)', italic: true, backup: true },
  { n: 18, key: 'f74_1_18', section: S4, label: 'Provision of consumer’s earth electrode? (see section 9.4.10 of Code of Practice)', italic: true, backup: true },
  {
    n: 19,
    key: 'f74_1_19',
    section: S4,
    label: 'Additional protection by RCDs to supplement overcurrent protective devices to ensure adequate disconnection times are met? (see section 9.4.11 of Code of Practice)',
    italic: true,
    backup: true,
  },
  { n: 20, key: 'f74_1_20', section: S4, label: 'Provision of surge protection devices? (see section 9.7 Code of Practice)', italic: true, backup: true },
  { n: 21, key: 'f74_1_21', section: S4, label: 'Staggered start and/or load-shedding on change-over (see sections 9.8 and 9.9 of Code of Practice)', italic: true, backup: true },
  { n: 22, key: 'f74_1_22', section: S5, label: 'Location/room has ventilation arrangements suitable for EESS and ancillary equipment?' },
  { n: 23, key: 'f74_1_23', section: S5, label: 'Location selected suitable for IP rating of EESS components?' },
  { n: 24, key: 'f74_1_24', section: S5, label: 'Fire prevention and detection measures implemented as necessary to meet EESS technology?' },
  { n: 25, key: 'f74_1_25', section: S5, label: 'Site safety signs displayed and durable as necessary to meet EESS technology?' },
  { n: 26, key: 'f74_1_26', section: S6, label: 'Equipment installed to manufacturer’s requirements?' },
  { n: 27, key: 'f74_1_27', section: S6, label: 'Clearance from adjacent objects meets manufacturer’s specifications?' },
  { n: 28, key: 'f74_1_28', section: S6, label: 'Ventilation of equipment meets manufacturer’s requirements and remains unobstructed?' },
  { n: 29, key: 'f74_1_29', section: S6, label: 'Clearance from any external heat sources acceptable (as relevant)?' },
  { n: 30, key: 'f74_1_30', section: S6, label: 'EESS equipment suitably accessible for maintenance and operation?' },
  { n: 31, key: 'f74_1_31', section: S6, label: 'EESS labelling displayed and durable (e.g. ‘multiple supplies’ warning notices, ‘battery in installation’ instruction notices)?' },
];

export const BACKUP_KEYS = F74_PART1.filter((r) => r.backup).map((r) => r.key);
const noBackup = (c: FormCtx) => is(c, 'eess_backup', 'no');

/** Evidence beside Part 1 rows (FORMS 1.3): the battery photos, the notices, the electrode. */
const EVIDENCE: Record<number, string[]> = { 16: ['EP34'], 18: ['EP37'], 22: ['EP30', 'EP35'], 23: ['EP30', 'EP35'], 24: ['EP30', 'EP35'], 25: ['EP30', 'EP34'], 27: ['EP30'], 28: ['EP30'], 29: ['EP30'], 30: ['EP30'], 31: ['EP34'] };

const part1: Field[] = F74_PART1.flatMap((r, i) => {
  const extra: Partial<Field> = {
    ...(i === 0 || F74_PART1[i - 1].section !== r.section ? { group: `Part 1: ${r.section}` } : {}),
    ...(r.lines ? { hint: r.lines.map((l) => `• ${l}`).join('\n') } : {}),
    ...(r.backup ? { note: (c: FormCtx) => (noBackup(c) ? 'No back-up on this battery: N/A, unless it applies anyway.' : null) } : {}),
    ...(EVIDENCE[r.n] ? { evidence: EVIDENCE[r.n] } : {}),
    // The first back-up row carries the one-tap N/A for all five.
    ...(r.n === 17 ? { bulk: { label: 'N/A: no back-up (rows 17 to 21)', keys: BACKUP_KEYS, v: 'na', when: noBackup } } : {}),
  };
  return tick(r.key, `${r.n}. ${r.label}`, extra);
});

export const F74_FIELDS: Field[] = [
  {
    key: 'eess_backup',
    type: 'YN',
    label: 'Does this battery give back-up (island mode) power in a power cut?',
    hint: 'It decides which rows below apply.',
    level: 'must',
    suggest: (c) => (c.design.battery_backup === true ? { v: 'yes', src: 'design', text: 'Yes' } : c.design.battery_backup === false ? { v: 'no', src: 'design', text: 'No' } : null),
  },
  ...part1,
  { key: 'f74_1_notes', type: 'LONG', label: 'Part 1: Notes and observations', level: 'optional' },
];

export const F74_PART2_FIELDS: Field[] = [
  { key: 'f74_2_tests', type: 'YNN', label: 'Tests carried out', hint: 'Tests according to BS 7671.', level: 'must', group: 'Part 2: Tests according to BS 7671' },
  {
    key: 'f74_2_refs',
    type: 'TEXT',
    label: 'Part 2 BS 7671 certificate and schedule references',
    level: 'must',
    suggest: (c) => {
      const ref = certRef(c);
      return ref ? { v: `${ref}: Schedule of inspections / Schedule of test results`, src: 'job', text: `${ref}: Schedule of inspections / Schedule of test results` } : null;
    },
  },
  { key: 'f74_2_notes', type: 'LONG', label: 'Part 2: Notes and observations', level: 'optional' },
];

export const F74_TEST_FIELDS: Field[] = [
  ...EESS_FIELDS,
  { key: 'f74_mfr_ref', type: 'TEXT', label: 'Manufacturer’s commissioning test report/schedule reference(s) (where appropriate)', level: 'should', group: 'The maker’s commissioning' },
  { key: 'f74_mfr_p', type: 'PHOTOS', label: 'Photo of the maker’s commissioning screen or report', hint: 'Proves the maker’s own commissioning ran (for the warranty).', level: 'should', need: 0 },
  { key: 'f74_4_notes', type: 'LONG', label: 'Part 4: Notes and observations', level: 'optional' },
];

const backupRows = EESS_ROWS.filter((r) => r.backup).map((r) => r.key);

export const F74_FLAGS: FlagRule[] = [
  ...F74_PART1.map(
    (r): FlagRule => ({
      code: `F74_${r.n}`,
      key: r.key,
      severity: 'urgent',
      when: (c) => is(c, r.key, 'problem'),
      text: (c) => `F74 Part 1 row ${r.n} ✗ ${r.label.replace(/\?$/, '')}${text(c, `${r.key}n`) ? `: ${text(c, `${r.key}n`)}` : ''}`,
    })
  ),
  { code: 'F74_2_TESTS', key: 'f74_2_tests', severity: 'urgent', when: (c) => is(c, 'f74_2_tests', 'no'), text: () => 'F74 Part 2: BS 7671 tests not carried out' },
  {
    code: 'F74_2_REFS',
    key: 'f74_2_refs',
    severity: 'urgent',
    when: (c) => !!c.values.f74_2_tests && is(c, 'f74_2_tests', 'yes') && !text(c, 'f74_2_refs'),
    text: () => 'F74 Part 2: no certificate reference',
  },
  ...EESS_ROWS.map(
    (r): FlagRule => ({
      code: `EESS_${r.key.slice(5)}`,
      key: r.key,
      severity: 'urgent',
      when: (c) => is(c, r.key, 'fail'),
      text: () => `Battery test failed: ${r.title} (F74 Part ${r.part}, F75)`,
    })
  ),
  {
    code: 'EESS_NET',
    key: 'eess_t_02',
    severity: 'review',
    when: (c) => !!c.values.eess_t_02 && !is(c, 'eess_t_02', 'pass'),
    text: () => 'The battery isn’t communicating: set up the monitoring remotely',
  },
  {
    code: 'EESS_BACKUP',
    key: 'eess_backup',
    severity: 'review',
    when: (c) =>
      (is(c, 'eess_backup', 'yes') && [...backupRows, ...BACKUP_KEYS].some((k) => is(c, k, 'na'))) ||
      (is(c, 'eess_backup', 'no') && BACKUP_KEYS.some((k) => is(c, k, 'done'))),
    text: (c) =>
      is(c, 'eess_backup', 'yes') ? 'The battery gives back-up power, but back-up rows are marked N/A' : 'The battery gives no back-up power, but back-up rows are ticked as done',
  },
];

export const F74_STEP: Step = { key: 'f74', title: 'Battery checks (F74)', intro: 'Parts 1 and 2. One tap per row; ✗ asks for a note.', show: (c) => has(c, 'battery'), fields: [...F74_FIELDS, ...F74_PART2_FIELDS] };
export const F74_TESTS_STEP: Step = {
  key: 'f74t',
  title: 'Battery tests (F74/F75)',
  intro: 'Answered once, printed on both F74 and F75. Tap ⓘ for the guidance.',
  show: (c) => has(c, 'battery'),
  fields: F74_TEST_FIELDS,
};
