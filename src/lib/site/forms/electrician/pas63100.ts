/**
 * Battery location (SPEC 2.9), when the job has PAS 63100 ticked. Until the PAS wording is copied in
 * and verified (fixed/pas63100.ts) these are Heliaxis's own questions, labelled "Battery location
 * check" and never in PAS words: where it is (the survey's spot offered), why not outdoors,
 * ventilation, detection, knocks and notices, built from F74 Part 1's location rows and the survey's
 * battery questions. The F74A and F74B handover items wait for an upload meanwhile. Type-only
 * imports.
 */
import type { Field, FlagRule, FormCtx, Step } from '../types';
import { el, is, text, yn } from './shared';

/** The survey's battery spots (solar-schema F5); the last four are where the survey says a battery can't go. */
export const BATTERY_SPOTS = [
  { key: 'outdoors', label: 'Outdoors' },
  { key: 'detached_garage', label: 'Detached garage or outbuilding' },
  { key: 'attached_garage_fire', label: 'Attached garage with a fire door' },
  { key: 'attached_garage_open', label: 'Attached garage, open to the house' },
  { key: 'indoor_room', label: 'A room indoors' },
  { key: 'loft', label: 'Loft' },
  { key: 'escape_route', label: 'Hall, stairs or escape route' },
  { key: 'bedroom', label: 'Bedroom' },
  { key: 'cellar_no_exit', label: 'Cellar with no way out' },
];
const BLOCKED = ['loft', 'escape_route', 'bedroom', 'cellar_no_exit'];
const spotWords = (k: unknown) => BATTERY_SPOTS.find((s) => s.key === k)?.label ?? String(k);

export const LOCATION_FIELDS: Field[] = [
  {
    key: 'bl_where',
    type: 'SEL',
    label: 'Where is the battery?',
    level: 'must',
    options: BATTERY_SPOTS,
    suggest: (c) => (el(c).survey_battery_spot ? { v: el(c).survey_battery_spot, src: 'job', text: `${spotWords(el(c).survey_battery_spot)} (the survey)` } : null),
  },
  { key: 'bl_whynot', type: 'TEXT', label: 'Why isn’t it outdoors?', level: 'must', parent: 'bl_where', show: (c) => !!c.values.bl_where && !is(c, 'bl_where', 'outdoors') },
  yn('bl_vent', 'Is the space ventilated as the battery’s maker asks?'),
  yn('bl_detect', 'Is there a smoke or heat detector where the battery is?'),
  yn('bl_impact', 'Is it protected from knocks (a car, a door swinging into it)?'),
  yn('bl_notice', 'Are the battery notices up?'),
  { key: 'bl_notes', type: 'LONG', label: 'Anything else about where it is', level: 'optional' },
];

export const LOCATION_FLAGS: FlagRule[] = [
  {
    code: 'BL_SPOT',
    key: 'bl_where',
    severity: 'urgent',
    when: (c) => BLOCKED.includes(String(c.values.bl_where ?? '')),
    text: (c) => `Battery fitted in a spot the survey marks as not for a home battery: ${spotWords(c.values.bl_where)}${text(c, 'bl_whynot') ? ` (${text(c, 'bl_whynot')})` : ''}`,
  },
  ...(
    [
      ['bl_vent', 'Battery space not ventilated as the maker asks'],
      ['bl_detect', 'No smoke or heat detector where the battery is'],
      ['bl_impact', 'Battery not protected from knocks'],
      ['bl_notice', 'Battery notices not up'],
    ] as const
  ).map(([key, words]): FlagRule => ({ code: key.toUpperCase(), key, severity: 'review', when: (c: FormCtx) => is(c, key, 'no'), text: () => words })),
];

export const LOCATION_STEP: Step = {
  key: 'battery-location',
  title: 'Battery location check',
  intro: 'Where the battery is and what’s around it. The F74A and F74B paperwork is added by the office.',
  fields: LOCATION_FIELDS,
};
