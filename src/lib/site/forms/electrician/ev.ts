/**
 * EV Charge Point Installation Record (SPEC 2.10): Heliaxis's own record from REGS 3.1–3.3, not the
 * IET Code of Practice checklist (that's transcribed only once the owner buys it). Earthing system
 * and the open-PEN protection used, the RCD / DC fault detection, the dedicated circuit, the SPD
 * assessment, load management, maximum demand against the cut-out fuse, smart charging evidence and
 * the DNO connect-and-notify route (which makes the office's to-do at sign-off). Type-only imports.
 */
import type { Field, FlagRule, FormCtx, Step } from '../types';
import { has, is, num, text, yn } from './shared';

export const EV_TITLE = 'EV Charge Point Installation Record';
export const EV_REVISION = 'Rev 1';

export const EARTHING = [
  { key: 'tn_s', label: 'TN-S' },
  { key: 'tncs_pme', label: 'TN-C-S (PME)' },
  { key: 'tncs_pnb', label: 'TN-C-S (PNB)' },
  { key: 'tt', label: 'TT' },
];
export const OPEN_PEN = [
  { key: 'electrode', label: 'Earth electrode' },
  { key: 'device_charger', label: 'Device in the charger' },
  { key: 'device_separate', label: 'Separate device' },
  { key: 'other', label: 'Other' },
];
/** The connect-and-notify route (REGS 3.3): 60 A or less, install then notify within 28 days; more, apply first. */
export const DNO_ROUTES = [
  { key: 'notify', label: '60 A or less: notify within 28 days' },
  { key: 'apply', label: 'Over 60 A: applied before installing' },
];

const pen = (c: FormCtx) => is(c, 'ev_earthing', 'tncs_pme') || is(c, 'ev_earthing', 'tncs_pnb');
const rod = (c: FormCtx) => is(c, 'ev_earthing', 'tt') || (pen(c) && is(c, 'ev_openpen', 'electrode'));

export const EV_FIELDS: Field[] = [
  { key: 'ev_earthing', type: 'SEL', label: 'Earthing system', level: 'must', options: EARTHING, group: 'Earthing' },
  { key: 'ev_openpen', type: 'SEL', label: 'Open-PEN protection method', hint: 'How the charger is protected if the PEN conductor breaks.', level: 'must', options: OPEN_PEN, show: pen },
  { key: 'ev_openpen_how', type: 'TEXT', label: 'Charger model and how it does it', level: 'must', parent: 'ev_openpen', show: (c) => is(c, 'ev_openpen', 'device_charger') },
  { key: 'ev_openpen_dev', type: 'TEXT', label: 'Which device, and how it works', level: 'must', parent: 'ev_openpen', show: (c) => is(c, 'ev_openpen', 'device_separate') || is(c, 'ev_openpen', 'other') },
  { key: 'ev_rod_type', type: 'TEXT', label: 'Earth electrode type', level: 'must', show: rod },
  { key: 'ev_rod_loc', type: 'TEXT', label: 'Where the electrode is', level: 'must', show: rod },
  { key: 'ev_ra', type: 'NUM', label: 'Measured RA', level: 'must', unit: 'Ω', dp: 2, min: 0, max: 2000, show: rod },

  {
    key: 'ev_rcd',
    type: 'TEXT',
    label: 'RCD / RDC-DD type',
    level: 'must',
    group: 'Protection',
    choices: ['Type A RCD, 6 mA DC detection (RDC-DD) in the charger', 'Type B RCD'],
  },
  { key: 'ev_dedicated', type: 'CONFIRM', label: 'The charger has its own dedicated circuit', level: 'must' },
  {
    key: 'ev_spd',
    type: 'SEL',
    label: 'Surge protection (SPD)',
    level: 'must',
    options: [
      { key: 'fitted', label: 'SPD fitted' },
      { key: 'assessed', label: 'Assessed: not needed' },
    ],
  },

  yn('ev_load', 'Load management or a CT clamp fitted?', { group: 'Supply' }),
  { key: 'ev_limit', type: 'NUM', label: 'Current limit set', level: 'must', unit: 'A', min: 1, max: 100, parent: 'ev_load', show: (c) => is(c, 'ev_load', 'yes') },
  { key: 'ev_maxdemand', type: 'NUM', label: 'Maximum demand after installation', hint: 'Per phase.', level: 'must', unit: 'A', min: 1, max: 1000 },
  { key: 'ev_fuse', type: 'NUM', label: 'Cut-out fuse rating', level: 'must', unit: 'A', chips: [60, 80, 100], min: 1, max: 1000 },
  { key: 'ev_cutout', type: 'PHOTOS', label: 'Photo of the cut-out', hint: 'The fuse rating readable, if it’s marked.', level: 'must', need: 1 },

  yn('ev_online', 'Is the charger online (on the customer’s Wi-Fi or its own 4G)?', { group: 'Smart charging', hint: 'Without a connection it isn’t smart. Photo: Charger online (EP46).' }),
  { key: 'ev_online_n', type: 'TEXT', label: 'Why not?', level: 'must', parent: 'ev_online', show: (c) => is(c, 'ev_online', 'no') },
  { key: 'ev_hours', type: 'CONFIRM', label: 'Default charging hours shown to the customer', hint: 'And how to change them in the app.', level: 'must' },
  { key: 'ev_soc', type: 'CONFIRM', label: 'Statement of compliance handed over', hint: 'The charger maker’s statement, naming Heliaxis as the seller.', level: 'must' },

  {
    key: 'ev_dno',
    type: 'SEL',
    label: 'DNO connect-and-notify route',
    level: 'must',
    group: 'The DNO',
    options: DNO_ROUTES,
    suggest: (c) => {
      const demand = num(c.values.ev_maxdemand);
      if (demand === null) return null;
      return demand <= 60 ? { v: 'notify', src: 'calc', text: `${demand} A: notify within 28 days` } : { v: 'apply', src: 'calc', text: `${demand} A: should have been applied for first` };
    },
  },
  { key: 'ev_dno_ref', type: 'TEXT', label: 'DNO application reference', level: 'should', parent: 'ev_dno', show: (c) => is(c, 'ev_dno', 'apply') },
  { key: 'ev_notes', type: 'LONG', label: 'Anything else', level: 'optional' },
];

export const EV_FLAGS: FlagRule[] = [
  {
    code: 'EV_FUSE',
    key: 'ev_maxdemand',
    severity: 'urgent',
    when: (c) => num(c.values.ev_maxdemand) !== null && num(c.values.ev_fuse) !== null && num(c.values.ev_maxdemand)! > num(c.values.ev_fuse)!,
    text: (c) => `EV: maximum demand ${c.values.ev_maxdemand} A is more than the ${c.values.ev_fuse} A cut-out fuse`,
  },
  {
    code: 'EV_DNO',
    key: 'ev_dno',
    severity: 'review',
    when: (c) => is(c, 'ev_dno', 'notify') && (num(c.values.ev_maxdemand) ?? 0) > 60,
    text: (c) => `EV: maximum demand ${c.values.ev_maxdemand} A is over 60 A, but the route given is notify`,
  },
  { code: 'EV_ONLINE', key: 'ev_online', severity: 'review', when: (c) => is(c, 'ev_online', 'no'), text: (c) => `Charger not online${text(c, 'ev_online_n') ? `: ${text(c, 'ev_online_n')}` : ''}: set it up remotely` },
];

export const EV_STEP: Step = { key: 'ev', title: 'EV charger record', show: (c) => has(c, 'ev'), fields: EV_FIELDS };
