/**
 * Serial numbers (FORMS 4.3, SPEC 2.4): for each device its label photo (kept always, read by Claude
 * when there's signal) and its serials (scanned, typed, or taken from the read with one tap), with
 * the count expected. Checks: no serial twice on the job, the count, the model on the label against
 * the design (an inverter or battery that differs is Urgent), and labels that couldn't be read go to
 * the office. Type-only imports.
 */
import type { Field, FlagRule, FormCtx, Step } from '../types';
import { captures, el, has, is, num, optimisers, panelsFitted, plural, readOf, sameModel, yn } from './shared';

const solar = (c: FormCtx) => has(c, 'solar');
const battery = (c: FormCtx) => has(c, 'battery');
/** The battery has its own inverter or gateway: always on a battery-only job, on solar + battery when the electrician says so. */
export const separateBatteryInverter = (c: FormCtx) => battery(c) && (!solar(c) || is(c, 'bat_inv_sep', 'yes'));

const label = (key: string, title: string, hint: string, extra: Partial<Field> = {}): Field => ({ key, type: 'PHOTOS', label: title, hint, level: 'must', need: 1, label_photo: true, read: true, ...extra });
const scan = (key: string, title: string, photo: string, extra: Partial<Field> = {}): Field => ({ key, type: 'SCAN', label: title, level: 'must', need: 1, photo, ...extra });

/** The optimiser serials the roofer's layout plan was read as, offered in one tap. */
function rooferOptimisers(c: FormCtx) {
  const read = readOf(c, 'RF7b', 'roofer');
  if (!read?.serials.length) return null;
  return { v: read.serials.map((s) => ({ s, src: 'roofer' })), src: 'roofer' as const, text: `${plural(read.serials.length, 'serial')} from the layout plan` };
}

export const SERIAL_FIELDS: Field[] = [
  label('EP21', 'Inverter label', 'Straight on, serial readable.', { group: 'Solar inverter', show: solar }),
  scan('SN_INV', 'Inverter serial number', 'EP21', { expect: () => 1, show: solar }),

  label('EP26', 'Generation meter', 'Meter with the reading and serial readable.', { group: 'Generation meter', show: solar }),
  {
    key: 'EP26r',
    type: 'NUM',
    label: 'Generation meter reading',
    hint: 'The opening reading, as it is now.',
    level: 'must',
    unit: 'kWh',
    dp: 1,
    min: 0,
    max: 100000,
    show: solar,
    suggest: (c) => {
      const v = readOf(c, 'EP26')?.meter?.reading_kwh;
      return typeof v === 'number' ? { v, src: 'photo', text: `${v} kWh` } : null;
    },
  },
  scan('SN_GENMETER', 'Generation meter serial number', 'EP26', { expect: () => 1, show: solar }),

  scan('SN_OPT', 'Optimiser serial numbers', 'SN_OPT', {
    group: 'Optimisers',
    hint: 'From the roofer’s layout plan. Scan any that are missing from the plan’s stickers.',
    show: (c) => solar(c) && optimisers(c) === true,
    expect: (c) => panelsFitted(c),
    suggest: rooferOptimisers,
  }),

  yn('SN_METER', 'Is the supply meter the same one as in the survey photo?', {
    group: 'Supply meter',
    hint: 'The survey’s meter photo is in Drawings and design. It goes on the DNO and Smart Export Guarantee paperwork.',
    show: (c) => has(c, 'solar', 'battery'),
  }),
  label('SN_METERp', 'Photo of the meter now', 'Serial and MPAN readable.', { parent: 'SN_METER', show: (c) => is(c, 'SN_METER', 'no') }),

  label('EP31', 'Battery labels', 'Each battery module’s label, serial readable.', { group: 'Battery', show: battery }),
  scan('SN_BAT', 'Battery serial numbers', 'EP31', { hint: 'One for each battery module.', show: battery }),
  yn('bat_inv_sep', 'Is there a separate battery inverter or gateway?', { hint: 'No if the solar inverter is a hybrid that runs the battery.', show: (c) => solar(c) && battery(c) }),
  label('EP32', 'Battery inverter / gateway label', 'Straight on, serial readable.', { show: separateBatteryInverter }),
  scan('SN_BINV', 'Battery inverter / gateway serial number', 'EP32', { expect: () => 1, show: separateBatteryInverter }),

  label('EP41', 'Charger label', 'Serial readable.', { group: 'EV charger', show: (c) => has(c, 'ev') }),
  scan('SN_EV', 'Charger serial number', 'EP41', { expect: () => 1, show: (c) => has(c, 'ev') }),

  label('EP53', 'Outdoor unit label', 'Serial readable.', { group: 'Heat pump', show: (c) => has(c, 'heatpump') }),
  scan('SN_HP', 'Outdoor unit serial number', 'EP53', { expect: () => 1, show: (c) => has(c, 'heatpump') }),
  label('EP54', 'Indoor unit / controller label', 'Where there is one. Serial readable.', { level: 'should', show: (c) => has(c, 'heatpump') }),
  scan('SN_HP2', 'Indoor unit / controller serial number', 'EP54', { level: 'should', show: (c) => has(c, 'heatpump') }),
];

export const SERIALS_STEP: Step = {
  key: 'serials',
  title: 'Serials',
  intro: 'Scan the barcode, or take the label photo and it’s read when you have signal. Nothing is saved until you’ve checked it.',
  fields: SERIAL_FIELDS,
};

/** Every SCAN key on the electrician's pack, with its device. */
export const SCAN_KEYS: { key: string; what: string; photo: string; design?: (c: FormCtx) => string | null; urgent?: boolean }[] = [
  { key: 'SN_INV', what: 'inverter', photo: 'EP21', design: (c) => c.system.inverter_model, urgent: true },
  { key: 'SN_GENMETER', what: 'generation meter', photo: 'EP26' },
  { key: 'SN_OPT', what: 'optimiser', photo: 'SN_OPT' },
  { key: 'SN_BAT', what: 'battery', photo: 'EP31', design: (c) => c.system.battery_model, urgent: true },
  { key: 'SN_BINV', what: 'battery inverter', photo: 'EP32' },
  { key: 'SN_EV', what: 'charger', photo: 'EP41', design: (c) => el(c).ev_model },
  { key: 'SN_HP', what: 'heat pump', photo: 'EP53', design: (c) => el(c).heat_pump_model },
  { key: 'SN_HP2', what: 'indoor unit', photo: 'EP54' },
];

const norm = (s: string) => s.trim().toUpperCase();

/** Every serial in this pack's captures (the roofer scans none: the owner doesn't need panel serials). */
function allSerials(c: FormCtx): { s: string; where: string }[] {
  const out: { s: string; where: string }[] = [];
  for (const k of SCAN_KEYS) for (const x of captures(c.values[k.key])) if (!x.unread && x.s.trim()) out.push({ s: norm(x.s), where: k.what });
  return out;
}

export const SERIAL_FLAGS: FlagRule[] = [
  {
    code: 'SN_DUP',
    key: '*serials',
    severity: 'review',
    when: (c) => {
      const all = allSerials(c).map((x) => x.s);
      return all.some((s, i) => all.indexOf(s) !== i);
    },
    text: (c) => {
      const all = allSerials(c).map((x) => x.s);
      const twice = [...new Set(all.filter((s, i) => all.indexOf(s) !== i))];
      return `The same serial is on the job twice: ${twice.join(', ')}`;
    },
  },
  ...SCAN_KEYS.flatMap((k): FlagRule[] => [
    {
      code: `${k.key}_COUNT`,
      key: k.key,
      severity: 'review',
      when: (c) => {
        const list = captures(c.values[k.key]);
        const want = k.key === 'SN_OPT' ? panelsFitted(c) : k.key === 'SN_BAT' || k.key === 'SN_HP2' ? null : 1;
        return list.length > 0 && !!want && list.length !== want;
      },
      text: (c) => `${captures(c.values[k.key]).length} ${k.what} serial${captures(c.values[k.key]).length === 1 ? '' : 's'} captured, ${k.key === 'SN_OPT' ? panelsFitted(c) : 1} expected`,
    },
    {
      code: `${k.key}_UNREAD`,
      key: k.key,
      severity: 'review',
      when: (c) => captures(c.values[k.key]).some((x) => x.unread),
      text: (c) => `${plural(captures(c.values[k.key]).filter((x) => x.unread).length, `${k.what} label`)} couldn’t be read: the photo is kept for the office to read`,
    },
    ...(k.design
      ? [
          {
            code: `${k.key}_MODEL`,
            key: k.key,
            severity: k.urgent ? ('urgent' as const) : ('review' as const),
            when: (c: FormCtx) => {
              const read = readOf(c, k.photo)?.model;
              return !!read && !sameModel(read, k.design!(c));
            },
            text: (c: FormCtx) => `The ${k.what} label says ${readOf(c, k.photo)?.model}, but the design has ${k.design!(c)}`,
          },
        ]
      : []),
  ]),
  {
    code: 'EP26r',
    key: 'EP26r',
    severity: 'review',
    when: (c) => {
      const read = readOf(c, 'EP26')?.meter?.reading_kwh;
      const typed = num(c.values.EP26r);
      return typeof read === 'number' && typed !== null && Math.abs(read - typed) > 0.05;
    },
    text: (c) => `Generation meter reading ${c.values.EP26r} kWh isn’t the ${readOf(c, 'EP26')?.meter?.reading_kwh} kWh on the photo`,
  },
];
