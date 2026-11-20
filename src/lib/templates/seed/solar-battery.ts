/**
 * The solar PV and battery paperwork as forms, in Heliaxis's own words, for an installer to complete by
 * link (one question at a time) or the office to complete: the PV array test record, the PV inspection,
 * the PV switch-on record, and the battery's inspection and commissioning records. Each one's code is the
 * handover pack item it fills (HX-PV-02…), so a signed form goes straight into the pack. The electrician's
 * own site app records the same things; either fills the item.
 *
 * Dates start as the job's switch-on date and equipment as Job details has it ({{commissioned}},
 * {{panel_model}}…); each question's (i) says what to put. Provisional until the owner signs off the field
 * lists in the quality system. Nothing here claims that completing a form meets any standard: that is for
 * the people who sign the documents off.
 */
import type { DocTemplate, TemplateField } from '../types';

const text = (key: string, label: string, o: Partial<TemplateField> = {}): TemplateField => ({ key, label, kind: 'text', ...o });
const num = (key: string, label: string, unit: string, o: Partial<TemplateField> = {}): TemplateField => ({ key, label, kind: 'number', unit, ...o });
const yn = (key: string, label: string, o: Partial<TemplateField> = {}): TemplateField => ({ key, label, kind: 'yesno', required: true, ...o });
const pick = (key: string, label: string, options: string[], o: Partial<TemplateField> = {}): TemplateField => ({ key, label, kind: 'choice', options, ...o });
const day = (key: string, label: string, o: Partial<TemplateField> = {}): TemplateField => ({ key, label, kind: 'date', ...o });
const long = (key: string, label: string, o: Partial<TemplateField> = {}): TemplateField => ({ key, label, kind: 'long', ...o });

const SIGNERS = [
  { key: 'installer', label: 'Installer or electrician' },
  { key: 'customer', label: 'Customer (optional)' },
];
const ON_SWITCH_ON = '{{commissioned}}';

/* ── HX-PV-02: the PV array test record ───────────────────────────────────── */

const MAX_STRINGS = 6;
const COUNTS = Array.from({ length: MAX_STRINGS }, (_, i) => String(i + 1));
/** String n's readings, asked only when there are at least n strings. */
function stringSection(n: number): DocTemplate['sections'][number] {
  const k = (s: string) => `s${n}_${s}`;
  return {
    type: 'fields',
    title: `String ${n}`,
    columns: 3,
    showWhen: { key: 'strings', is: COUNTS.slice(n - 1) },
    fields: [
      num(k('panels'), `String ${n}: panels on it`, 'panels', { required: true, help: 'Count the panels wired in series on this string (one MPPT input can have more than one string).' }),
      num(k('voc_exp'), `String ${n}: expected open-circuit voltage`, 'V', {
        calc: [k('panels'), 'panel_voc'],
        hint: 'Worked out for you: panels × the panel’s Voc. Change it if you’ve corrected for the temperature.',
        help: 'Voc at STC × the number of panels. On a cold day the measured Voc will be higher than this, on a hot day lower: up to about 0.3% per °C away from 25 °C for most panels.',
      }),
      num(k('voc'), `String ${n}: measured open-circuit voltage`, 'V', { required: true, help: 'Measured at the DC isolator or inverter with the string disconnected from the inverter. Within about 5% of the expected (after temperature) is normal.' }),
      num(k('isc_exp'), `String ${n}: expected short-circuit current`, 'A', {
        calc: ['panel_isc'],
        hint: 'Worked out for you: the panel’s Isc. Change it if you’ve scaled it for today’s irradiance.',
        help: 'For panels in series this is the panel’s Isc at STC. It scales with irradiance: at 500 W/m² expect roughly half.',
      }),
      num(k('isc'), `String ${n}: measured short-circuit current`, 'A', { required: true, help: 'Measured with your PV tester. Only test Isc with the string isolated from the inverter.' }),
      yn(k('polarity'), `String ${n}: polarity correct?`, { noNa: true, hint: 'Checked before the isolator was closed or a fuse fitted.', help: 'Check + and − with a meter before connecting. A reversed string can damage the inverter.' }),
      num(k('ir_v'), `String ${n}: insulation test voltage`, 'V', { hint: 'Usually 500 V or 1000 V, by the array’s voltage.', help: 'The test voltage set on your insulation tester for this string (the IET Code of Practice gives the test voltage for the array’s voltage).' }),
      num(k('ir_pos'), `String ${n}: insulation resistance, positive to earth`, 'MΩ', { required: true, help: 'Positive conductor to earth. If your tester shows >999, type 999.' }),
      num(k('ir_neg'), `String ${n}: insulation resistance, negative to earth`, 'MΩ', { required: true, help: 'Negative conductor to earth. If your tester shows >999, type 999.' }),
      num(k('earth'), `String ${n}: frame earth continuity`, 'Ω', { hint: 'Not applicable if the frames aren’t earthed.', help: 'Continuity of the frame (array) earth, if the frames are earthed. Answer Not applicable if they aren’t.' }),
    ],
  };
}

export const PV_ARRAY_TEST: DocTemplate = {
  schema: 1,
  code: 'HX-PV-02',
  title: 'Solar PV array test record',
  purpose: 'The readings taken on each string of panels before the system is switched on.',
  intro: 'Test each string before the DC isolator is closed or the inverter switched on. Expected values are worked out for you from the panel’s datasheet figures.',
  tech: ['solar'],
  sections: [
    {
      type: 'fields',
      title: 'The test',
      columns: 2,
      fields: [
        pick('kind', 'New installation or re-test?', ['New installation', 'Re-test of an existing system'], { required: true }),
        day('tested_on', 'Date of the test', { required: true, prefill: ON_SWITCH_ON, help: 'Starts as the job’s switch-on date: change it if you tested on another day.' }),
        text('tester_make', 'Tester make', { required: true, hint: 'e.g. Megger, Seaward, Fluke' }),
        text('tester', 'Tester model', { required: true, hint: 'e.g. PV150' }),
        day('tester_cal', 'When was the tester last calibrated?', { help: 'The date on its calibration certificate or sticker.' }),
        num('irradiance', 'Irradiance during the test', 'W/m²', { help: 'From your irradiance meter or the PV tester’s probe. Not applicable if you didn’t measure it.' }),
        num('cell_temp', 'Panel temperature during the test', '°C', { help: 'The back of a panel, from your tester’s probe. Not applicable if you didn’t measure it.' }),
      ],
    },
    {
      type: 'fields',
      title: 'The panels',
      columns: 2,
      fields: [
        text('panel_make', 'Panel make', { required: true, hint: 'e.g. JA Solar, Aiko, Sungrow' }),
        text('panel', 'Panel model', { required: true, prefill: '{{panel_model}}', help: 'As on the panel’s label or datasheet, e.g. JAM54D40-440/MB.' }),
        num('panel_voc', 'Panel open-circuit voltage (Voc)', 'V', { required: true, help: 'From the panel label or datasheet, at STC. Used to work out each string’s expected voltage.' }),
        num('panel_isc', 'Panel short-circuit current (Isc)', 'A', { required: true, help: 'From the panel label or datasheet, at STC. Used for each string’s expected current.' }),
      ],
    },
    {
      type: 'fields',
      title: 'The inverter and DC side',
      columns: 2,
      fields: [
        text('inverter_make', 'Inverter make', { required: true, hint: 'e.g. GoodWe, SolarEdge, Fox ESS' }),
        text('inverter', 'Inverter model', { required: true, prefill: '{{inverter_model}}' }),
        text('inv_serial', 'Inverter serial number', { required: true, prefill: '{{inverter_serial}}', help: 'From the label on the inverter, after “SN” or “S/N”. The customer signs in to their portal with its last 6 characters.' }),
        text('cable', 'DC cable type', { hint: 'e.g. H1Z2Z2-K', help: 'The solar cable used for the DC runs, as printed on its sheath.' }),
        num('cable_mm2', 'DC cable size', 'mm²', { help: 'Cross-section of the + and − cores: usually 4 or 6 mm².' }),
        pick('iso_where', 'Where is the DC isolator?', ['Built into the inverter', 'Next to the inverter', 'In the loft', 'Somewhere else']),
        num('iso_a', 'DC isolator current rating', 'A', { help: 'From the isolator’s label (its DC rating, not AC).' }),
        num('iso_v', 'DC isolator voltage rating', 'V', { help: 'From the isolator’s label: it must be above the highest string Voc in cold weather.' }),
        pick('fuses', 'String fuses or breakers?', ['None', 'Fuses', 'Breakers'], { help: 'Usually none with one or two strings per MPPT input. Choose what’s fitted.' }),
      ],
    },
    { type: 'fields', title: 'Strings', fields: [pick('strings', 'How many strings?', COUNTS, { required: true, help: 'Separate strings of panels in series (count every MPPT input in use, and parallel strings on an input).' })] },
    ...COUNTS.map((n) => stringSection(Number(n))),
    {
      type: 'fields',
      title: 'Result',
      fields: [
        yn('all_pass', 'Every string tested within what’s expected?', { noNa: true }),
        long('failed', 'What didn’t, and what was done about it', { showWhen: { key: 'all_pass', is: 'no' }, required: true }),
        long('comments', 'Anything else to note'),
      ],
    },
    { type: 'sign', title: 'Signed', signers: SIGNERS },
  ],
};

/* ── HX-PV-01: the PV inspection ──────────────────────────────────────────── */

export const PV_INSPECTION: DocTemplate = {
  schema: 1,
  code: 'HX-PV-01',
  title: 'Solar PV inspection checklist',
  purpose: 'The installer’s inspection of the solar installation before it is switched on.',
  intro: 'Check each item on site. Answer N/A only where it really doesn’t apply to this installation.',
  tech: ['solar'],
  sections: [
    {
      type: 'fields',
      title: 'Design and equipment',
      fields: [
        day('inspected_on', 'Date of the inspection', { required: true, prefill: ON_SWITCH_ON, help: 'Starts as the job’s switch-on date: change it if you inspected on another day.' }),
        pick('mounting', 'How are the panels mounted?', ['Pitched roof, on the tiles or slates', 'In-roof', 'Flat roof', 'Ground mount', 'Wall or other']),
        yn('as_designed', 'Installed as designed (panels, layout, inverter and battery as on the design)', { help: 'Compare with the design: panel count and layout, inverter, battery. If anything changed, answer No and say what in the comments.' }),
        yn('equipment_rated', 'Panels, inverter and DC equipment rated for the array’s maximum voltage and current', { help: 'The highest string Voc in cold weather must be under the inverter’s and isolator’s maximum DC voltage.' }),
        yn('mcs_products', 'Panels and inverter are MCS-certified products'),
      ],
    },
    {
      type: 'fields',
      title: 'DC wiring',
      fields: [
        yn('dc_cable', 'DC cable is solar cable, suitable for outdoor and UV exposure'),
        yn('dc_protected', 'DC cables protected from damage and supported along their route'),
        yn('dc_loops', 'Positive and negative cables run together, keeping wiring loops small', { help: 'Run + and − side by side to reduce induced voltages from lightning.' }),
        yn('connectors', 'DC connectors are matching make and type, fully mated', { help: 'Never mix connector brands (e.g. MC4 with a lookalike): they must be the same make and type.' }),
        yn('dc_entry', 'Roof and wall entries sealed and weatherproof'),
        yn('dc_isolator', 'DC isolator fitted, rated for the array and labelled'),
        yn('string_fuses', 'String fuses or breakers fitted and rated correctly, where needed'),
      ],
    },
    {
      type: 'fields',
      title: 'AC side and protection',
      fields: [
        yn('ac_isolator', 'AC isolator fitted next to the inverter, lockable in the off position'),
        yn('ac_protection', 'AC circuit has its own protective device, rated for the inverter'),
        yn('rcd', 'RCD protection as the inverter maker and the wiring regulations require', { help: 'Check the inverter manual for the RCD type it needs (often Type A, sometimes Type B).' }),
        yn('g98_settings', 'Inverter set to the G98 or G99 protection settings for the UK'),
        yn('spd', 'Surge protection fitted where the risk assessment needs it'),
        yn('earthing', 'Earthing and bonding of frames and equipment as the design requires'),
      ],
    },
    {
      type: 'fields',
      title: 'Mounting and location',
      fields: [
        yn('fixings', 'Roof fixings and rails fitted as the mounting system maker says'),
        yn('roof_sound', 'Roof covering left sound and weathertight'),
        yn('inverter_location', 'Inverter has the ventilation, clearances and access its maker requires'),
      ],
    },
    {
      type: 'fields',
      title: 'Labels and information',
      fields: [
        yn('labels_dc', 'DC warning labels on the isolators, junction boxes and consumer unit'),
        yn('labels_dual', 'Dual supply labels at the consumer unit and the meter'),
        yn('shutdown_shown', 'Shutdown procedure displayed by the inverter'),
        yn('schematic', 'Wiring diagram left on site'),
      ],
    },
    { type: 'fields', title: 'Comments', fields: [long('comments', 'Anything that needs putting right, or that the office should know')] },
    { type: 'sign', title: 'Signed', signers: SIGNERS },
  ],
};

/* ── HX-PV-03: switching on ───────────────────────────────────────────────── */

export const PV_SWITCH_ON: DocTemplate = {
  schema: 1,
  code: 'HX-PV-03',
  title: 'Solar PV switch-on record',
  purpose: 'The checks made when the solar system is first switched on.',
  tech: ['solar'],
  sections: [
    {
      type: 'fields',
      title: 'Switching on',
      columns: 2,
      fields: [
        day('switched_on', 'Date switched on', { required: true, prefill: ON_SWITCH_ON }),
        yn('powers_up', 'Inverter starts up with no faults or error codes', { noNa: true }),
        yn('grid_sync', 'Inverter connects to the grid and generates', { noNa: true }),
        num('ac_output', 'AC output when tested', 'kW', { help: 'From the inverter display or app at the time of the test. Not applicable if it was too dark to say.' }),
        num('irradiance', 'Irradiance at the time', 'W/m²'),
        yn('export_limit', 'Export limit set as the DNO approval requires', { hint: 'N/A if there is no export limit.' }),
      ],
    },
    {
      type: 'fields',
      title: 'Generation meter',
      columns: 2,
      fields: [
        text('gen_meter_make', 'Generation meter make', { hint: 'e.g. EM Ltd, Eastron' }),
        text('gen_meter', 'Generation meter model'),
        text('gen_meter_serial', 'Generation meter serial number'),
        num('gen_meter_reading', 'Reading at switch-on', 'kWh', { required: true, help: 'The total kWh on the generation meter at switch-on. Usually 0 or close to it.' }),
      ],
    },
    {
      type: 'fields',
      title: 'Handing over',
      fields: [
        yn('monitoring', 'Monitoring connected and working', { hint: 'N/A if the system has no monitoring.' }),
        yn('shown_off', 'Customer shown how to switch the system off and on'),
        yn('shown_monitoring', 'Customer shown the monitoring app'),
        long('comments', 'Anything else to note'),
      ],
    },
    { type: 'sign', title: 'Signed', signers: SIGNERS },
  ],
};

/* ── HX-BAT-01 and HX-BAT-02: the battery ─────────────────────────────────── */

export const BATTERY_INSPECTION: DocTemplate = {
  schema: 1,
  code: 'HX-BAT-01',
  title: 'Battery inspection checklist',
  purpose: 'The installer’s checks on the battery installation before it is switched on.',
  intro: 'Check each item against the battery maker’s installation manual. Answer N/A only where it really doesn’t apply.',
  tech: ['battery'],
  sections: [
    {
      type: 'fields',
      title: 'Location',
      fields: [
        day('inspected_on', 'Date of the inspection', { required: true, prefill: ON_SWITCH_ON }),
        pick('location', 'Where is the battery?', ['Garage', 'Utility room', 'Outbuilding', 'Outside', 'Loft', 'Somewhere else'], { required: true }),
        yn('loc_allowed', 'A location the battery maker allows, within its temperature range', { help: 'Check the manual’s operating temperature range and any places it rules out (lofts and bedrooms often are).' }),
        yn('loc_clearances', 'Clearances and ventilation as the maker requires'),
        yn('loc_escape', 'Not in, or blocking, a way out of the building'),
        yn('loc_protected', 'Protected from damage (vehicles, knocks) and from water'),
        yn('mounting', 'Fixed securely to a surface that can carry its weight'),
      ],
    },
    {
      type: 'fields',
      title: 'Wiring and isolation',
      fields: [
        yn('dc_isolation', 'Battery can be isolated, with the isolator labelled'),
        yn('cables', 'Cables sized and protected as the maker requires'),
        yn('ac_protection', 'AC circuit has its own protective device'),
        yn('earthing', 'Earthed as the maker requires'),
        pick('backup', 'Does it give back-up power in a power cut?', ['No', 'Yes, some circuits', 'Yes, the whole house'], { required: true }),
        yn('backup_safe', 'Back-up wiring switches safely, and the back-up circuits are labelled', { showWhen: { key: 'backup', is: ['Yes, some circuits', 'Yes, the whole house'] } }),
      ],
    },
    {
      type: 'fields',
      title: 'Labels and information',
      fields: [yn('labels', 'Battery and dual supply warning labels at the consumer unit and the meter'), yn('manual_left', 'Maker’s manual and shutdown procedure left with the customer'), long('comments', 'Anything that needs putting right')],
    },
    { type: 'sign', title: 'Signed', signers: SIGNERS },
  ],
};

export const BATTERY_COMMISSIONING: DocTemplate = {
  schema: 1,
  code: 'HX-BAT-02',
  title: 'Battery commissioning and test record',
  purpose: 'The tests made when the battery is switched on.',
  tech: ['battery'],
  sections: [
    {
      type: 'fields',
      title: 'The battery',
      columns: 2,
      fields: [
        text('battery_make', 'Battery make', { required: true, hint: 'e.g. GivEnergy, Fox ESS, Tesla' }),
        text('battery', 'Battery model', { required: true, prefill: '{{battery_model}}' }),
        text('battery_serials', 'Battery serial numbers', { required: true, hint: 'One for each module, separated by commas.' }),
        num('usable_kwh', 'Usable capacity', 'kWh', { help: 'The usable (not nominal) capacity from the datasheet, for every module together.' }),
        text('battery_inverter_make', 'Battery inverter or gateway make', { hint: 'Not applicable if it uses the solar inverter.' }),
        text('battery_inverter', 'Battery inverter or gateway model', { hint: 'Not applicable if it uses the solar inverter.' }),
        text('battery_inverter_serial', 'Battery inverter or gateway serial number', { hint: 'Not applicable if it uses the solar inverter.' }),
        text('firmware', 'Firmware version', { help: 'From the battery or inverter app. Update it first if the maker says to.' }),
      ],
    },
    {
      type: 'fields',
      title: 'Tests',
      fields: [
        day('commissioned_on', 'Date commissioned', { required: true, prefill: ON_SWITCH_ON }),
        yn('powers_up', 'Battery starts up and talks to the inverter, with no faults', { noNa: true }),
        yn('charges', 'Charges correctly', { noNa: true, help: 'Seen charging, from solar or the grid, in the app or on the display.' }),
        yn('discharges', 'Discharges to the house correctly', { noNa: true }),
        yn('backup_test', 'Back-up power tested by switching off the mains supply', { hint: 'N/A if it gives no back-up power.' }),
        pick('mode', 'Operating mode set', ['Self-consumption', 'Time of use / tariff', 'Back-up reserve', 'Other']),
        num('reserve', 'Back-up reserve kept', '%', { help: 'The charge kept back for power cuts. Not applicable if there’s no back-up.' }),
        yn('export_limit', 'Export limit set as the DNO approval requires', { hint: 'N/A if there is no export limit.' }),
      ],
    },
    {
      type: 'fields',
      title: 'Handing over',
      fields: [yn('monitoring', 'Monitoring connected and working'), yn('shown', 'Customer shown how the battery works and how to switch it off'), long('comments', 'Anything else to note')],
    },
    { type: 'sign', title: 'Signed', signers: SIGNERS },
  ],
};

export const SOLAR_BATTERY_TEMPLATES: DocTemplate[] = [PV_ARRAY_TEST, PV_INSPECTION, PV_SWITCH_ON, BATTERY_INSPECTION, BATTERY_COMMISSIONING];
