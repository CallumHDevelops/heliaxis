/**
 * Photos as you go (FORMS 4.2, SPEC 2.3): every slot the electrician fills, by technology, each with
 * its one-line instruction and minimum. EP01 is pinned first ("Before you touch anything"). The
 * label photos that serial numbers are read from (EP21, EP26, EP31, EP32, EP41, EP53, EP54) sit with
 * their serials (serials.ts), so nothing is asked twice. Type-only imports.
 */
import type { Field, FormCtx, Step } from '../types';
import { has, is } from './shared';

const photo = (key: string, label: string, hint: string, extra: Partial<Field> = {}): Field => ({ key, type: 'PHOTOS', label, hint, level: 'must', need: 1, ...extra });
const solar = (c: FormCtx) => has(c, 'solar');
const battery = (c: FormCtx) => has(c, 'battery');
const ev = (c: FormCtx) => has(c, 'ev');
const hp = (c: FormCtx) => has(c, 'heatpump');

/** The PV inspection's frame earthing says the frame is bonded, earthed or earthed for lightning protection: its connection is photographed (EP25). */
export const frameEarthed = (c: FormCtx) => is(c, 'pvi_frame_metal', 'yes') && (is(c, 'pvi_frame_ext', 'yes') || is(c, 'pvi_frame_exp', 'yes') || is(c, 'pvi_frame_lp', 'yes'));
/**
 * Does the frame have a safety earth (PV inspection, frame earthing)? true when it's bonded or earthed,
 * false when it isn't a connected metal frame or every question was No, null while it's unanswered.
 */
export function frameSafetyEarth(c: FormCtx): boolean | null {
  if (is(c, 'pvi_frame_metal', 'no')) return false;
  if (!is(c, 'pvi_frame_metal', 'yes')) return null;
  if (frameEarthed(c)) return true;
  return is(c, 'pvi_frame_ext', 'no') && is(c, 'pvi_frame_exp', 'no') && is(c, 'pvi_frame_lp', 'no') ? false : null;
}
/** An earth electrode is fitted: a back-up battery, the battery inspection's own electrode ticked, or the EV charger on its own rod. */
export const electrodeFitted = (c: FormCtx) => is(c, 'eess_backup', 'yes') || is(c, 'bat_bu_electrode', 'done') || is(c, 'ev_earthing', 'tt') || is(c, 'ev_openpen', 'electrode');

export const PHOTO_FIELDS: Field[] = [
  photo('EP01', 'Consumer unit before', 'Before you touch anything: cover on, every label readable.', { group: 'Before you touch anything' }),
  photo('EP02', 'Consumer unit open, after', 'Cover off after your work: new devices and terminations clearly in shot.', { group: 'Every job' }),
  photo('EP03', 'Consumer unit finished', 'Cover back on, new circuit labelled.'),
  photo('EP04', 'Main earthing', 'Main earthing terminal and earthing conductor, clamp and label in shot.'),
  photo('EP05', 'Main bonding', 'Gas and water bonding clamps with their labels (skip it if there’s none).', { level: 'should' }),
  photo('EP06', 'Meter and cut-out after', 'The meter, cut-out and the dual-supply label in one shot.', { show: (c) => has(c, 'solar', 'battery') }),
  photo('EP07', 'Cable routes', 'Every run you installed, inside and out; clips, trunking, and fire sealing where it goes through walls or ceilings.', { need: 3 }),
  photo('EP08', 'Labels and warning notices', 'Each label close enough to read: isolators, DC cable, dual supply, schematic, emergency shutdown.', { need: 2 }),
  photo('EP09', 'Surge protection (SPD)', 'The SPD and its status window (skip it if none is fitted).', { level: 'should' }),
  photo('EP10', 'Finished work', 'Wide shots of everything you installed, area left tidy.', { need: 2 }),
  photo('EP11', 'Tester screen', 'Readings on the tester screen for insulation resistance and loop tests. Backs up the numbers if they’re ever questioned.', { level: 'optional', need: 0 }),

  photo('EP20', 'Inverter', 'Wide shot showing the mounting and the space around it.', { group: 'Solar PV', show: solar }),
  photo('EP22', 'DC isolator(s)', 'Each DC isolator with its label (built-in ones too).', { show: solar }),
  photo('EP23', 'AC isolator', 'The AC isolator by the inverter, label readable, shown locked off if you can.', { show: solar }),
  photo('EP24', 'DC cable entry and loft run', 'Where the DC cables come into the building and their route in the loft.', { need: 2, show: solar }),
  photo('EP25', 'Array frame earth', 'The earth connection on the array frame.', { show: (c) => solar(c) && frameEarthed(c), note: () => 'Needed because the frame is bonded or earthed (PV inspection, frame earthing).' }),
  photo('EP27', 'Inverter commissioned', 'Inverter screen or app showing it running, plus the grid-protection settings page.', { show: solar }),
  photo('EP28', 'CT clamp / export limiter', 'Where fitted: the CT clamp on the meter tails, arrow the right way.', { level: 'should', show: solar }),

  photo('EP30', 'Battery location', 'Wide shot: clearances, ventilation, nothing stored around it.', { group: 'Battery', show: battery }),
  photo('EP33', 'Battery isolator', 'The battery isolator or DC breaker, labelled.', { show: battery }),
  photo('EP34', 'Battery notices', '‘Battery in installation’ and ‘multiple supplies’ notices at the consumer unit and meter.', { show: battery }),
  photo('EP35', 'Smoke / heat detection', 'The detector near the battery (where fitted or needed).', { level: 'should', show: battery }),
  photo('EP36', 'Back-up circuit', 'The back-up (EPS) circuit and changeover switch.', { show: (c) => battery(c) && is(c, 'eess_backup', 'yes') }),
  photo('EP38', 'Battery working', 'App or screen showing the battery charging or discharging and online.', { show: battery }),

  photo('EP40', 'Charger mounted', 'Wide shot showing the parking space and the mounting height.', { group: 'EV charger', show: ev }),
  photo('EP42', 'Supply cable route', 'From the consumer unit to the charger: clipped, ducted or buried.', { need: 2, show: ev }),
  photo('EP43', 'Protective device', 'The charger’s RCBO/RCD with its type marking readable.', { show: ev }),
  photo('EP44', 'Earthing', 'The charger’s earthing arrangement: the PEN-fault protection setting, or the earth rod and its reading if TT.', { show: ev }),
  photo('EP45', 'Labels', 'Labels at the consumer unit and the charger.', { show: ev }),
  photo('EP46', 'Charger online', 'Charger online in its app; a charging test if a car is there.', { level: 'should', show: ev }),
  photo('EP47', 'Load-management CT', 'Where fitted: the CT clamp and its lead.', { level: 'should', show: ev }),
  // REGS 3.4: a grant claim needs these four (only when the job claims the OZEV grant).
  photo('EPG1', 'Grant: charger close-up', 'For the OZEV grant claim: the charger, close up.', { group: 'EV grant photos', show: (c) => ev(c) && c.design.ozev_grant === true }),
  photo('EPG2', 'Grant: model and serial label', 'For the OZEV grant claim: the label with the model and serial readable.', { show: (c) => ev(c) && c.design.ozev_grant === true }),
  photo('EPG3', 'Grant: charger with its parking space', 'For the OZEV grant claim: the charger and the space the car parks in.', { show: (c) => ev(c) && c.design.ozev_grant === true }),
  photo('EPG4', 'Grant: wide view of the building', 'For the OZEV grant claim: the building, wide.', { show: (c) => ev(c) && c.design.ozev_grant === true }),

  photo('EP50', 'Isolator by the unit', 'Rotary isolator next to the outdoor unit, labelled.', { group: 'Heat pump', show: hp }),
  photo('EP51', 'Supply route and gland', 'Supply cable route and where it’s glanded into the unit.', { show: hp }),
  photo('EP52', 'Heat pump circuit', 'The dedicated circuit at the consumer unit, device rating readable and labelled.', { show: hp }),
  photo('EP55', 'Earthing and bonding', 'Earth and any bonding at the unit and pipework, where required.', { level: 'should', show: hp }),

  photo('EP37', 'Earth electrode', 'The earth rod and its test reading.', { group: 'Earth electrode', show: electrodeFitted }),
];

export const PHOTOS_STEP: Step = {
  key: 'photos',
  title: 'Photos as you go',
  intro: 'Take each one when you get to it: the first before you touch anything. Label photos for serial numbers are on the Serials step.',
  fields: PHOTO_FIELDS,
};
