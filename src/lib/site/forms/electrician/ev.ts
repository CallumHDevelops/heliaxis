/**
 * EV Charge Point Installation Record (SPEC 2.10): Heliaxis's own record from REGS 3.1–3.3, not the
 * IET Code of Practice checklist (that's transcribed only once the owner buys it). Earthing system
 * and the open-PEN protection used, the RCD / DC fault detection, the dedicated circuit, the SPD
 * assessment, load management, maximum demand against the cut-out fuse, smart charging evidence and
 * the DNO connect-and-notify route (which makes the office's to-do at sign-off). Schema version 6
 * adds the charger's location (which decides whether the open-PEN question applies), AFDD, the
 * isolator, how the cable is run, its rating and tether, the labels, the randomised delay, firmware
 * and app, the test charge, and what the customer was shown (printed on HX-EV-03). Type-only imports.
 */
import { EARTHING_LABEL, earthingFromEv, earthingToEv, isEarthing } from '../../earthing';
import type { Field, FlagRule, FormCtx, Step } from '../types';
import { el, has, is, num, text, yn } from './shared';

export const EV_TITLE = 'EV Charge Point Installation Record';

/** This record's own keys (saved answers use them), labelled as the EIC labels the same arrangement (site/earthing.ts). */
export const EARTHING = ['tn_s', 'tncs_pme', 'tncs_pnb', 'tt'].map((key) => ({ key, label: EARTHING_LABEL[earthingFromEv(key)!] }));
export const OPEN_PEN = [
  { key: 'electrode', label: 'Earth electrode' },
  { key: 'device_charger', label: 'Device in the charger' },
  { key: 'device_separate', label: 'Separate device' },
  { key: 'other', label: 'Other' },
];
/**
 * The connect-and-notify route (REGS 3.3), from the ENA's notification criteria: 60 A or less, install
 * then notify within 28 days; more, apply first. 60 A is one of the criteria on the ENA form, not all of them.
 */
export const DNO_ROUTES = [
  { key: 'notify', label: '60 A or less: notify within 28 days' },
  { key: 'apply', label: 'Over 60 A: applied before installing' },
];

/** Where the charger is, as Regulation 722.411.4.1 treats it (schema 6). */
export const LOCATION = [
  { key: 'outdoor', label: 'Outdoors, or it can charge a car parked outdoors' },
  { key: 'indoor', label: 'Indoors, and it only charges a car parked indoors' },
];
/** How the supply cable is run: every method on the run. Buried asks for the buried-cable photo (EP62). */
export const CABLE_METHODS = [
  { key: 'clipped', label: 'Clipped direct' },
  { key: 'containment', label: 'In conduit or trunking' },
  { key: 'swa', label: 'SWA' },
  { key: 'buried', label: 'Buried in the ground' },
];
export const TEST_CHARGE = [
  { key: 'vehicle', label: 'Yes, with a vehicle' },
  { key: 'adaptor', label: 'Yes, with an EV test adaptor or simulator' },
  { key: 'not_possible', label: 'Not possible' },
];

/** A PME or PNB supply (TN-C-S): the PEN conductor could break. */
const pme = (c: FormCtx) => is(c, 'ev_earthing', 'tncs_pme') || is(c, 'ev_earthing', 'tncs_pnb');
/**
 * The open-PEN question applies: a TN-C-S supply and a charger that isn't indoors-only. An unanswered
 * location counts as outdoors, so nothing is skipped and a record from before schema 6 reads as it did.
 */
export const openPenApplies = (c: FormCtx) => pme(c) && !is(c, 'ev_location', 'indoor');
/** The charger has its own earth rod: a TT supply, or a rod chosen as the open-PEN protection (only while that question applies). */
export const evRod = (c: FormCtx) => is(c, 'ev_earthing', 'tt') || (openPenApplies(c) && is(c, 'ev_openpen', 'electrode'));
/** An isolator is fitted for the charger: its photo (EP61) and label are asked for. */
export const evIsolator = (c: FormCtx) => is(c, 'ev_isolator', 'yes');
/** Some of the supply cable is buried: its photo before backfill (EP62) is asked for. */
export const evBuried = (c: FormCtx) => Array.isArray(c.values.ev_cable) && (c.values.ev_cable as unknown[]).includes('buried');
/** The job also has solar or a battery: a second source of supply, so the dual-supply notice applies. */
const twoSupplies = (c: FormCtx) => has(c, 'solar', 'battery');
const pen = openPenApplies;
const rod = evRod;

export const EV_FIELDS: Field[] = [
  {
    key: 'ev_earthing',
    type: 'SEL',
    label: 'Earthing system',
    level: 'must',
    options: EARTHING,
    group: 'Earthing',
    // The surveyor's answer, in this record's keys, to confirm on site (the EIC's, once given, is carried across: carry.ts).
    suggest: (c) => {
      const e = el(c).survey_earthing;
      const key = earthingToEv(e);
      return key && isEarthing(e) ? { v: key, src: 'survey', text: EARTHING_LABEL[e] } : null;
    },
  },
  {
    key: 'ev_location',
    type: 'SEL',
    label: 'Where is the charger?',
    hint: 'Indoors only means a garage or car park the car is always inside when it charges. Anything else counts as outdoors.',
    level: 'must',
    options: LOCATION,
  },
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
    key: 'ev_afdd',
    type: 'SEL',
    label: 'Arc fault detection (AFDD)',
    level: 'must',
    options: [
      { key: 'fitted', label: 'AFDD fitted' },
      { key: 'not_required', label: 'Not required' },
    ],
  },
  { key: 'ev_afdd_why', type: 'TEXT', label: 'Why it isn’t required', level: 'must', parent: 'ev_afdd', show: (c) => is(c, 'ev_afdd', 'not_required') },
  yn('ev_isolator', 'Is an isolator fitted for the charger?', { hint: 'Photo: Charger isolator (EP61).' }),
  {
    key: 'ev_cable',
    type: 'MULTI',
    label: 'How is the supply cable installed?',
    hint: 'Tick every method on the run. Buried asks for a photo before it’s backfilled (EP62).',
    level: 'must',
    options: CABLE_METHODS,
  },
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
  { key: 'ev_kw', type: 'NUM', label: 'Charger rating', level: 'must', unit: 'kW', dp: 1, chips: [7.4, 11, 22], min: 1, max: 350 },
  {
    key: 'ev_tether',
    type: 'SEL',
    label: 'Tethered or untethered?',
    level: 'must',
    options: [
      { key: 'tethered', label: 'Tethered (cable fixed to the charger)' },
      { key: 'untethered', label: 'Untethered (a socket)' },
    ],
  },

  { key: 'ev_lbl_cu', type: 'CONFIRM', label: 'New circuit labelled at the consumer unit', level: 'must', group: 'Labels' },
  { key: 'ev_lbl_chart', type: 'CONFIRM', label: 'Circuit chart updated with the EV circuit', hint: 'Photo: Updated circuit chart (EP60).', level: 'must' },
  { key: 'ev_lbl_charger', type: 'CONFIRM', label: 'Charger labelled with the circuit that feeds it', level: 'must' },
  { key: 'ev_lbl_iso', type: 'CONFIRM', label: 'Isolator labelled', level: 'must', show: evIsolator },
  { key: 'ev_lbl_rcd', type: 'CONFIRM', label: 'RCD test notice in place', level: 'must' },
  { key: 'ev_lbl_rod', type: 'CONFIRM', label: 'Earth electrode safety label in place', level: 'must', show: rod },
  { key: 'ev_lbl_dual', type: 'CONFIRM', label: 'Dual-supply (alternative source) notice in place', hint: 'This job also has solar or a battery.', level: 'must', show: twoSupplies },

  yn('ev_online', 'Is the charger online (on the customer’s Wi-Fi or its own 4G)?', { group: 'Smart charging', hint: 'Without a connection it isn’t smart. Photo: Charger online (EP46).' }),
  { key: 'ev_online_n', type: 'TEXT', label: 'Why not?', level: 'must', parent: 'ev_online', show: (c) => is(c, 'ev_online', 'no') },
  { key: 'ev_hours', type: 'CONFIRM', label: 'Default charging hours shown to the customer', hint: 'And how to change them in the app.', level: 'must' },
  { key: 'ev_random', type: 'CONFIRM', label: 'Randomised delay confirmed active', hint: 'In the charger’s settings or its app.', level: 'must' },
  { key: 'ev_firmware', type: 'TEXT', label: 'Charger firmware version', level: 'must' },
  yn('ev_app', 'Is the customer’s app account set up?'),
  { key: 'ev_app_n', type: 'TEXT', label: 'Why not?', level: 'must', parent: 'ev_app', show: (c) => is(c, 'ev_app', 'no') },
  { key: 'ev_soc', type: 'CONFIRM', label: 'Statement of compliance handed over', hint: 'The charger maker’s statement, naming Heliaxis as the seller.', level: 'must' },

  { key: 'ev_test', type: 'SEL', label: 'Test charge', level: 'must', group: 'Test charge', options: TEST_CHARGE },
  { key: 'ev_test_n', type: 'TEXT', label: 'Why wasn’t it possible?', level: 'must', parent: 'ev_test', show: (c) => is(c, 'ev_test', 'not_possible') },

  // What the customer was shown: printed on their commissioning and handover certificate (HX-EV-03).
  { key: 'ev_show_start', type: 'CONFIRM', label: 'Starting and stopping a charge', hint: 'These go on the customer’s handover certificate.', level: 'must', group: 'Shown to the customer' },
  { key: 'ev_show_sched', type: 'CONFIRM', label: 'Setting charging schedules in the app', level: 'must' },
  { key: 'ev_show_rcd', type: 'CONFIRM', label: 'Testing the RCD, and how often', level: 'must' },
  { key: 'ev_show_iso', type: 'CONFIRM', label: 'Where the isolator is, and how to isolate it in an emergency', hint: 'The isolator, or the circuit breaker at the consumer unit if there isn’t one.', level: 'must' },
  { key: 'ev_show_lights', type: 'CONFIRM', label: 'What the status lights mean', level: 'must' },
  { key: 'ev_show_contact', type: 'CONFIRM', label: 'Who to call if something’s wrong', level: 'must' },
  { key: 'ev_show_warranty', type: 'CONFIRM', label: 'How the charger’s warranty is registered', level: 'must' },

  {
    key: 'ev_dno',
    type: 'SEL',
    label: 'DNO connect-and-notify route',
    hint: 'Notify only applies when every other criterion on the ENA form is met too. If any isn’t, apply first.',
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
  {
    code: 'EV_TEST',
    key: 'ev_test',
    severity: 'review',
    when: (c) => is(c, 'ev_test', 'not_possible'),
    text: (c) => `EV: no test charge${text(c, 'ev_test_n') ? `: ${text(c, 'ev_test_n')}` : ''}. Arrange one with the customer`,
  },
  { code: 'EV_ONLINE', key: 'ev_online', severity: 'review', when: (c) => is(c, 'ev_online', 'no'), text: (c) => `Charger not online${text(c, 'ev_online_n') ? `: ${text(c, 'ev_online_n')}` : ''}: set it up remotely` },
];

export const EV_STEP: Step = { key: 'ev', title: 'EV charger record', show: (c) => has(c, 'ev'), fields: EV_FIELDS };
