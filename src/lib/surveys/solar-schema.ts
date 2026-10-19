/**
 * The solar survey: every question, in the order of a real visit (chat with the customer, outside,
 * roof, loft, electrics, kit spots, cable routes, finish). Answers are stored in crm_surveys.answers
 * keyed by these field ids, so ids never change once used; add new ones instead and bump
 * SOLAR_SCHEMA_VERSION.
 *
 * Levels: 'must' blocks finishing ("Needed"), 'should' is listed as "Not filled" but never blocks,
 * 'optional' sits behind "More detail". About 25 things are Needed, most of them photos.
 *
 * No runtime imports (types only): scripts/test-survey-rules.mjs loads this file straight into node,
 * and the phone form, the APIs and the report all share it.
 */
import type { Markup } from './markup';

export type FieldType =
  | 'auto' // filled in by the app (header, Finish screen summaries); never counted
  | 'text'
  | 'longtext'
  | 'number'
  | 'dims' // chip key ("47x100") or { w, d } in mm for "other"
  | 'choice'
  | 'multi'
  | 'band'
  | 'yesno'
  | 'photo'
  | 'photos'
  | 'compass' // 0, 45 … 315 (or any degrees from the phone compass)
  | 'pitch' // degrees
  | 'signature' // { name, at } once the customer has signed; the image itself goes up with "Finish"
  | 'address' // { address, postcode, was? } (was: the job's address it was pre-filled from)
  | 'system'; // Z1 suggested system { panels, kwp, faces, inverter, inverterKw, batteryKwh }

export type Level = 'must' | 'should' | 'optional';
/** `warn` shows a warning when picked; `block` stops the survey being finished until it's changed. */
export type Opt = { key: string; label: string; warn?: string; block?: string };
export type RoofAnswers = Record<string, unknown> & { id: string };
export type Answers = Record<string, unknown> & { roofs?: RoofAnswers[]; skip?: Record<string, string>; send?: Record<string, boolean> };
export type Ctx = { a: Answers; roof?: RoofAnswers; products: string[] };
export type Field = {
  id: string;
  label: string;
  /** One line under the label explaining why it matters. */
  help?: string;
  type: FieldType;
  options?: Opt[];
  /** Quick-pick values for number, pitch and dims fields; "Other" opens a number box. */
  chips?: (string | number)[];
  unit?: string;
  level: Level | ((c: Ctx) => Level);
  show?: (c: Ctx) => boolean;
  /** Photo fields: how many photos count as done (default 1). */
  minPhotos?: number;
  /** Photo fields: R13, C1, C2 'needed' (may be done later, "Drawings to do"); others 'optional'. */
  drawing?: 'needed' | 'optional';
  /** "Customer will send" chip (E14, E16): counts as done. */
  canSend?: boolean;
  /** A photo field whose photo also counts as an answer to this one (E14 ← a photo of a bill, E14p). */
  orPhoto?: string;
  /** A one-tap chip that fills a text field, e.g. "None" on X6. */
  noneChip?: string;
  /** One line under a photo button, e.g. "Get the fuse rating in shot". */
  hint?: string;
};
export type SectionKey = 'A' | 'I' | 'B' | 'H' | 'C' | 'D' | 'E' | 'F' | 'G' | 'J';
export type Section = {
  key: SectionKey;
  title: string;
  /** Index into SCREENS. */
  screen: number;
  /** Repeats for each roof area (answers.roofs[]); photo slots get ":r1" etc. */
  perRoof?: boolean;
  /** Per-roof sections: fields asked once per property (R13). */
  once?: Field[];
  /** "Couldn't check this section": answers.skip[key] (or skip["D:r1"] per roof) = the reason. */
  skippable?: boolean;
  show?: (c: Ctx) => boolean;
  fields: Field[];
};

/** owner-settings line 12: the owner hasn't confirmed what "cut out image" means. Rename it here only. */
export const CUT_OUT_LABEL = 'Roof cut-out image (aerial, panel area drawn on)';

export const SCREENS: { title: string; sections: SectionKey[] }[] = [
  { title: 'Chat with the customer', sections: ['A', 'I'] },
  { title: 'Outside', sections: ['B', 'H'] },
  { title: 'Roof', sections: ['C'] },
  { title: 'Loft', sections: ['D'] },
  { title: 'Electrics', sections: ['E'] },
  { title: 'Kit spots', sections: ['F'] },
  { title: 'Cable routes', sections: ['G'] },
  { title: 'Finish', sections: ['J'] },
];

export const SOLAR_SCHEMA_VERSION = 1;
export const MAX_ROOFS = 6;
/** Photo slot ids: a field id, or a field id and a roof area ("R4:r2"). */
export const SLOT_RE = /^[A-Z][0-9A-Za-z]{0,4}(:r[1-6])?$/;
export const ROOF_ID_RE = /^r[1-6]$/;

export const hasBattery = (a: Answers): boolean => a.A4 === 'solar_battery' || a.A4 === 'battery_only' || a.A4 === 'solar_battery_ev';
export const batteryOnly = (a: Answers): boolean => a.A4 === 'battery_only';

/* ── Small helpers for the conditions below ───────────────────────────────────── */

const val = (c: Ctx, id: string): unknown => (c.roof && id in c.roof ? c.roof[id] : c.a[id]);
const is = (c: Ctx, id: string, ...keys: string[]) => keys.includes(String(val(c, id)));
const isNot = (c: Ctx, id: string, ...keys: string[]) => !is(c, id, ...keys);
const list = (c: Ctx, id: string): string[] => {
  const v = val(c, id);
  return Array.isArray(v) ? v.map(String) : [];
};
const has = (c: Ctx, id: string, key: string) => list(c, id).includes(key);
/** Something picked other than "none". */
const someNotNone = (c: Ctx, id: string) => list(c, id).some((k) => k !== 'none');
const yes = (c: Ctx, id: string) => val(c, id) === true;
const firstRoof = (c: Ctx) => !c.roof || !c.a.roofs?.length || c.a.roofs[0]?.id === c.roof.id;
/** Loft questions for this roof area, unless it's "Same loft as roof area 1". */
const ownLoft = (c: Ctx) => firstRoof(c) || c.roof?.L0 !== true;
const loftReachable = (c: Ctx) => ownLoft(c) && isNot(c, 'L1', 'none');
const cutRoof = (c: Ctx) => loftReachable(c) && is(c, 'L2', 'cut');
const battery = (c: Ctx) => hasBattery(c.a);
const semiOrTerrace = (c: Ctx) => ['semi', 'mid_terrace', 'end_terrace'].includes(String(c.a.A5));

const YES_NO_UNKNOWN: Opt[] = [
  { key: 'yes', label: 'Yes' },
  { key: 'no', label: 'No' },
  { key: 'unknown', label: 'Don’t know' },
];
const CONDITION: Opt[] = [
  { key: 'good', label: 'Good' },
  { key: 'fair', label: 'Fair' },
  { key: 'poor', label: 'Poor' },
];
const ASBESTOS_WARN = 'Don’t drill until it’s been tested for asbestos (HSG264).';
const BATTERY_BLOCK = 'Batteries can’t go here (PAS 63100). Pick another spot.';

/* ── The survey ───────────────────────────────────────────────────────────────── */

export const SOLAR_SCHEMA: Section[] = [
  /* Screen 1. Chat with the customer */
  {
    key: 'A',
    title: 'The customer and the property',
    screen: 0,
    fields: [
      { id: 'A1', label: 'Customer and project', type: 'auto', level: 'optional' },
      { id: 'A2', label: 'Surveyor and date', type: 'auto', level: 'optional' },
      {
        id: 'A3',
        label: 'Site address and postcode',
        help: 'Filled in from the job. Change it if the panels are going on a different building.',
        type: 'address',
        level: 'must',
      },
      {
        id: 'A4',
        label: 'What the survey is for',
        help: 'Filled in from the job. It decides which questions you’re asked.',
        type: 'choice',
        level: 'must',
        options: [
          { key: 'solar', label: 'Solar panels' },
          { key: 'solar_battery', label: 'Solar panels and battery' },
          { key: 'battery_only', label: 'Battery only' },
          { key: 'solar_battery_ev', label: 'Solar, battery and EV charger' },
        ],
      },
      {
        id: 'A5',
        label: 'Property type',
        type: 'choice',
        level: 'should',
        options: [
          { key: 'detached', label: 'Detached' },
          { key: 'semi', label: 'Semi-detached' },
          { key: 'mid_terrace', label: 'Mid terrace' },
          { key: 'end_terrace', label: 'End terrace' },
          { key: 'bungalow', label: 'Bungalow' },
          { key: 'flat', label: 'Flat or maisonette' },
          { key: 'commercial', label: 'Commercial' },
        ],
      },
      { id: 'A7', label: 'Does the customer own the property and live in it?', type: 'yesno', level: 'should' },
      {
        id: 'A7b',
        label: 'Landlord or freeholder’s name',
        help: 'They need to agree to the install.',
        type: 'text',
        level: 'should',
        show: (c) => c.a.A7 === false,
      },
      { id: 'A8a', label: 'Listed building?', type: 'choice', level: 'should', options: YES_NO_UNKNOWN },
      { id: 'A8b', label: 'In a conservation area?', type: 'choice', level: 'should', options: YES_NO_UNKNOWN },
      {
        id: 'A8c',
        label: 'In a National Park or AONB?',
        help: 'AONB: Area of Outstanding Natural Beauty (now called a National Landscape).',
        type: 'choice',
        level: 'should',
        options: YES_NO_UNKNOWN,
      },
      {
        id: 'A6',
        label: 'Roughly when was it built?',
        type: 'choice',
        level: 'optional',
        options: [
          { key: 'pre_1919', label: 'Before 1919' },
          { key: '1919_1944', label: '1919 to 1944' },
          { key: '1945_1964', label: '1945 to 1964' },
          { key: '1965_1990', label: '1965 to 1990' },
          { key: '1991_2010', label: '1991 to 2010' },
          { key: 'after_2010', label: 'After 2010' },
        ],
      },
      { id: 'A9', label: 'Customer there for the survey?', type: 'yesno', level: 'optional' },
    ],
  },
  {
    key: 'I',
    title: 'What the customer wants',
    screen: 0,
    fields: [
      {
        id: 'X6',
        label: 'Requests from the customer',
        help: 'Where they want (or don’t want) the panels and kit, timing, budget, grants. “Customer said…” notes land here.',
        type: 'longtext',
        level: 'must',
        noneChip: 'None',
      },
      {
        id: 'X1',
        label: 'Interested in an EV charger?',
        type: 'choice',
        level: 'should',
        options: [
          { key: 'no', label: 'No' },
          { key: 'now', label: 'Yes, now' },
          { key: 'later', label: 'Maybe later' },
        ],
      },
      { id: 'X1p', label: 'Where they’d like the EV charger', type: 'photo', level: 'optional', drawing: 'optional', show: (c) => is(c, 'X1', 'now', 'later') },
      { id: 'X2a', label: 'Wants pigeon mesh?', type: 'yesno', level: 'optional' },
      { id: 'X2b', label: 'Pigeons there now?', type: 'yesno', level: 'optional' },
      {
        id: 'X3',
        label: 'Panel look',
        type: 'choice',
        level: 'optional',
        options: [
          { key: 'all_black', label: 'All black' },
          { key: 'standard', label: 'Standard (silver frame)' },
          { key: 'no_pref', label: 'No preference' },
        ],
      },
      { id: 'X4', label: 'Interested in a hot water diverter?', type: 'yesno', level: 'optional' },
      {
        id: 'X5',
        label: 'Interested in a heat pump?',
        help: 'Yes adds a task to book a SimpliHeat heat pump survey.',
        type: 'yesno',
        level: 'optional',
      },
      { id: 'X7', label: 'Dates to avoid, or when they’d like the install', type: 'text', level: 'optional' },
      {
        id: 'X8',
        label: 'Things the customer must do before the install',
        help: 'For example clear the loft, move the car or cut back a tree.',
        type: 'longtext',
        level: 'optional',
      },
    ],
  },

  /* Screen 2. Outside */
  {
    key: 'B',
    title: 'Photos of the house',
    screen: 1,
    fields: [
      { id: 'B1', label: 'Front of the house', type: 'photo', level: 'must', drawing: 'optional', hint: 'Stand back to get the whole front and the roof in' },
      { id: 'B2', label: 'Side of the house', type: 'photos', level: 'must', minPhotos: 1, drawing: 'optional', hint: 'Both sides if you can' },
      { id: 'B3', label: 'Rear of the house', type: 'photo', level: 'must', drawing: 'optional', hint: 'Get the whole roof in' },
      { id: 'B4', label: 'Street and approach', type: 'photo', level: 'optional', drawing: 'optional', hint: 'Parking, and where a scaffold lorry would stop' },
    ],
  },
  {
    key: 'H',
    title: 'Scaffold and access',
    screen: 1,
    skippable: true,
    fields: [
      {
        id: 'S1',
        label: 'Scaffold needed on',
        type: 'multi',
        level: 'must',
        options: [
          { key: 'front', label: 'Front' },
          { key: 'rear', label: 'Rear' },
          { key: 'left', label: 'Left side' },
          { key: 'right', label: 'Right side' },
          { key: 'none', label: 'No scaffold' },
        ],
      },
      {
        id: 'S7',
        label: 'Parking',
        type: 'choice',
        level: 'must',
        options: [
          { key: 'driveway', label: 'Driveway' },
          { key: 'free_street', label: 'Free on the street' },
          { key: 'permit', label: 'Permit parking' },
          { key: 'yellow_lines', label: 'Yellow lines' },
          { key: 'suspension', label: 'Needs a bay suspension' },
        ],
      },
      {
        id: 'S2',
        label: 'Where the scaffold stands',
        type: 'photos',
        level: 'should',
        drawing: 'optional',
        hint: 'Draw where the uprights go if it helps',
        show: (c) => !has(c, 'S1', 'none'),
      },
      {
        id: 'S3',
        label: 'Ground and obstacles',
        type: 'multi',
        level: 'should',
        options: [
          { key: 'paved', label: 'Paved' },
          { key: 'grass', label: 'Grass' },
          { key: 'gravel', label: 'Gravel' },
          { key: 'slope', label: 'Slope' },
          { key: 'steps', label: 'Steps' },
          { key: 'conservatory', label: 'Conservatory' },
          { key: 'greenhouse', label: 'Greenhouse' },
          { key: 'overhead_cables', label: 'Overhead cables' },
          { key: 'trees', label: 'Trees' },
        ],
      },
      {
        id: 'S4',
        label: 'Scaffold on the pavement or road?',
        help: 'Yes needs a council licence: allow 2 to 3 weeks.',
        type: 'yesno',
        level: 'should',
      },
      {
        id: 'S5',
        label: 'Scaffold over a neighbour’s land?',
        help: 'Yes needs the neighbour’s written consent.',
        type: 'yesno',
        level: 'should',
      },
      {
        id: 'S6',
        label: 'Rear access',
        type: 'choice',
        level: 'should',
        options: [
          { key: 'side_gate', label: 'Side gate' },
          { key: 'through_house', label: 'Through the house' },
          { key: 'via_neighbour', label: 'Through a neighbour’s' },
          { key: 'back_lane', label: 'Back lane' },
        ],
      },
      { id: 'S6w', label: 'Side gate width', type: 'number', unit: 'm', chips: [0.6, 0.8, 1, 1.2], level: 'should', show: (c) => is(c, 'S6', 'side_gate') },
      { id: 'S8', label: 'Site hazards', help: 'Pets, children, fragile roofs, ponds.', type: 'longtext', level: 'optional' },
    ],
  },

  /* Screen 3. Roof (not for battery-only jobs) */
  {
    key: 'C',
    title: 'Roof',
    screen: 2,
    perRoof: true,
    show: (c) => !batteryOnly(c.a),
    once: [
      {
        id: 'R13',
        label: CUT_OUT_LABEL,
        help: 'A photo or a screenshot of the aerial view, with the panel area and any no-go areas drawn on. Draw now or later in the van.',
        type: 'photo',
        level: 'must',
        drawing: 'needed',
        hint: 'Screenshot the aerial view, then draw the panel area',
      },
    ],
    fields: [
      {
        id: 'R1',
        label: 'Name for this roof area',
        help: 'For example “Rear main” or “Garage”. Leave it as it is if there’s only one.',
        type: 'text',
        level: 'should',
      },
      {
        id: 'R2',
        label: 'Roof type',
        type: 'choice',
        level: 'must',
        options: [
          { key: 'gable', label: 'Gable' },
          { key: 'hipped', label: 'Hipped' },
          { key: 'hip_valley', label: 'Hip and valley' },
          { key: 'asymmetric', label: 'Asymmetric' },
          { key: 'lean_to', label: 'Lean-to' },
          { key: 'mansard', label: 'Mansard' },
          { key: 'flat', label: 'Flat' },
          { key: 'dormer', label: 'Dormer' },
          { key: 'other', label: 'Other' },
        ],
      },
      {
        id: 'R3',
        label: 'Roof covering',
        type: 'choice',
        level: 'must',
        options: [
          { key: 'concrete_interlocking', label: 'Concrete interlocking tiles' },
          { key: 'pantile', label: 'Pantiles' },
          { key: 'plain_clay', label: 'Plain clay tiles' },
          { key: 'plain_concrete', label: 'Plain concrete tiles' },
          { key: 'natural_slate', label: 'Natural slate' },
          { key: 'fibre_cement_slate', label: 'Fibre cement slate', warn: ASBESTOS_WARN },
          { key: 'stone_slate', label: 'Stone slate' },
          { key: 'metal_sheet', label: 'Metal sheet' },
          { key: 'metal_tile', label: 'Metal tiles' },
          { key: 'felt', label: 'Felt' },
          { key: 'epdm_grp', label: 'Rubber (EPDM) or fibreglass (GRP)' },
          { key: 'asbestos_cement', label: 'Asbestos cement sheet', warn: ASBESTOS_WARN },
          { key: 'other', label: 'Other' },
        ],
      },
      { id: 'R7', label: 'Direction the roof faces', help: 'Tap the nearest direction, or use the phone’s compass.', type: 'compass', level: 'should' },
      { id: 'R4', label: 'Close-up of a tile or slate with a tape measure', type: 'photo', level: 'should', drawing: 'optional', hint: 'Show the tape across the tile' },
      { id: 'R6', label: 'Condition of the covering', type: 'choice', level: 'should', options: CONDITION },
      { id: 'R6p', label: 'Photo of the worn or damaged covering', type: 'photo', level: 'should', drawing: 'optional', show: (c) => is(c, 'R6', 'fair', 'poor') },
      {
        id: 'R12',
        label: 'Shading',
        type: 'multi',
        level: 'should',
        options: [
          { key: 'trees', label: 'Trees' },
          { key: 'building', label: 'Buildings' },
          { key: 'chimney', label: 'Chimney' },
          { key: 'dormer_parapet', label: 'Dormer or parapet' },
          { key: 'pole_wires', label: 'Pole or wires' },
          { key: 'none', label: 'No shading' },
        ],
      },
      { id: 'R12p', label: 'Photos of what shades the roof', type: 'photos', level: 'should', drawing: 'optional', show: (c) => someNotNone(c, 'R12') },
      { id: 'R12c', label: 'Is any of it within 10 m of the panels?', type: 'yesno', level: 'should', show: (c) => someNotNone(c, 'R12') },
      {
        id: 'R16',
        label: 'Asbestos suspected?',
        help: 'In the covering, soffits or flues. Set to Suspected by itself for an asbestos cement roof.',
        type: 'choice',
        level: 'should',
        options: [
          { key: 'no', label: 'No' },
          { key: 'suspected', label: 'Suspected' },
          { key: 'confirmed', label: 'Confirmed' },
        ],
      },
      { id: 'R16p', label: 'Photo of the suspected asbestos', type: 'photo', level: 'should', drawing: 'optional', show: (c) => is(c, 'R16', 'suspected', 'confirmed') },
      { id: 'R10a', label: 'Eaves height above the ground', type: 'number', unit: 'm', chips: [2.5, 5, 7.5], level: 'should' },
      {
        id: 'R15',
        label: 'Party wall or joined-on roof on this side?',
        type: 'yesno',
        level: (c) => (semiOrTerrace(c) ? 'should' : 'optional'),
      },
      { id: 'R5a', label: 'Tile make or profile', type: 'text', level: 'optional' },
      { id: 'R5b', label: 'Batten gauge', type: 'number', unit: 'mm', level: 'optional' },
      { id: 'R9a', label: 'Usable width', help: 'Measured in OpenSolar is fine.', type: 'number', unit: 'm', level: 'optional' },
      { id: 'R9b', label: 'Eaves to ridge', help: 'Measured in OpenSolar is fine.', type: 'number', unit: 'm', level: 'optional' },
      { id: 'R10b', label: 'Ridge height', type: 'number', unit: 'm', level: 'optional' },
      {
        id: 'R11',
        label: 'Obstructions',
        type: 'multi',
        level: 'optional',
        options: [
          { key: 'chimney', label: 'Chimney' },
          { key: 'roof_window', label: 'Roof window' },
          { key: 'vent', label: 'Vent' },
          { key: 'dormer', label: 'Dormer' },
          { key: 'aerial', label: 'Aerial or dish' },
          { key: 'solar_thermal', label: 'Solar hot water panels' },
          { key: 'other', label: 'Other' },
        ],
      },
      { id: 'R14', label: 'Sun-path photo from the middle of the panel area, facing south', type: 'photo', level: 'optional' },
    ],
  },

  /* Screen 4. Loft, per roof area (not for battery-only jobs) */
  {
    key: 'D',
    title: 'Loft',
    screen: 3,
    perRoof: true,
    skippable: true,
    show: (c) => !batteryOnly(c.a),
    fields: [
      {
        id: 'L0',
        label: 'Same loft as roof area 1?',
        help: 'Yes skips the loft questions for this roof area.',
        type: 'yesno',
        level: 'optional',
        show: (c) => !firstRoof(c),
      },
      {
        id: 'L1',
        label: 'Loft access',
        type: 'choice',
        level: 'must',
        show: ownLoft,
        options: [
          { key: 'hatch_ladder', label: 'Hatch with a ladder' },
          { key: 'hatch_no_ladder', label: 'Hatch, no ladder' },
          { key: 'boarded', label: 'Boarded loft' },
          { key: 'room_in_roof', label: 'Room in the roof' },
          { key: 'none', label: 'No access', warn: 'No loft access: you’ll need an engineer or a second visit to check the roof structure.' },
        ],
      },
      {
        id: 'L2',
        label: 'Roof structure',
        type: 'choice',
        level: 'must',
        show: loftReachable,
        options: [
          { key: 'trussed', label: 'Trussed (factory trusses with metal plates)' },
          { key: 'cut', label: 'Cut roof (rafters and purlins)' },
          { key: 'room_in_roof', label: 'Room in the roof' },
          { key: 'steel', label: 'Steel' },
          { key: 'unknown', label: 'Can’t tell' },
        ],
      },
      { id: 'L3', label: 'Wide shot of the loft', type: 'photo', level: 'must', drawing: 'optional', show: loftReachable },
      {
        id: 'L4',
        label: 'Rafter or truss with a tape showing depth and width',
        type: 'photo',
        level: 'must',
        drawing: 'optional',
        hint: 'Tape on the timber, numbers readable',
        show: loftReachable,
      },
      { id: 'L5', label: 'Tape across the rafters showing the spacing', type: 'photo', level: 'must', drawing: 'optional', show: loftReachable },
      { id: 'L8', label: 'Longest unsupported rafter span', type: 'number', unit: 'm', level: 'must', show: cutRoof },
      { id: 'L9a', label: 'Purlins?', type: 'yesno', level: 'must', show: cutRoof },
      { id: 'L10', label: 'Purlins, struts and binders', type: 'photos', level: 'must', drawing: 'optional', show: cutRoof },
      {
        id: 'R8',
        label: 'Roof pitch',
        help: 'Or measure it: lay the phone along a rafter, long edge down the slope.',
        type: 'pitch',
        unit: '°',
        chips: [15, 22.5, 30, 35, 40, 45],
        level: 'should',
      },
      { id: 'L6', label: 'Rafter or truss size', type: 'dims', unit: 'mm', chips: ['35x75', '38x89', '47x100', '50x100'], level: 'should', show: loftReachable },
      { id: 'L7', label: 'Rafter centres', type: 'number', unit: 'mm', chips: [400, 450, 600], level: 'should', show: loftReachable },
      { id: 'L9b', label: 'Purlin size', type: 'dims', unit: 'mm', chips: ['75x150', '75x200', '100x200', '100x225'], level: 'should', show: (c) => cutRoof(c) && yes(c, 'L9a') },
      { id: 'L9c', label: 'Number of purlins each side', type: 'number', chips: [1, 2, 3], level: 'should', show: (c) => cutRoof(c) && yes(c, 'L9a') },
      { id: 'L9d', label: 'Purlins propped to a load-bearing wall?', type: 'choice', options: YES_NO_UNKNOWN, level: 'should', show: (c) => cutRoof(c) && yes(c, 'L9a') },
      {
        id: 'L12',
        label: 'Membrane under the tiles',
        type: 'choice',
        level: 'should',
        show: loftReachable,
        options: [
          { key: 'bitumen_felt', label: 'Bitumen felt' },
          { key: 'breathable', label: 'Breathable membrane' },
          { key: 'sarking', label: 'Sarking boards' },
          { key: 'none', label: 'None' },
          { key: 'cant_see', label: 'Can’t see' },
        ],
      },
      {
        id: 'L12c',
        label: 'Membrane condition',
        type: 'choice',
        options: CONDITION,
        level: 'should',
        show: (c) => loftReachable(c) && val(c, 'L12') != null && isNot(c, 'L12', 'none', 'cant_see'),
      },
      {
        id: 'L13',
        label: 'Signs of structural problems',
        type: 'multi',
        level: 'should',
        show: loftReachable,
        options: [
          { key: 'none', label: 'None' },
          { key: 'sagging', label: 'Sagging' },
          { key: 'spread', label: 'Roof spread' },
          { key: 'cracked', label: 'Cracked or split timbers' },
          { key: 'altered_trusses', label: 'Cut or altered trusses' },
          { key: 'woodworm', label: 'Woodworm' },
          { key: 'rot_damp', label: 'Rot or damp' },
          { key: 'staining', label: 'Water staining' },
          { key: 'daylight', label: 'Daylight through the roof' },
        ],
      },
      { id: 'L13p', label: 'Photos of the problems', type: 'photos', level: 'should', drawing: 'optional', show: (c) => loftReachable(c) && someNotNone(c, 'L13') },
      {
        id: 'L14',
        label: 'Past alterations',
        type: 'multi',
        level: 'should',
        show: ownLoft,
        options: [
          { key: 'heavier_covering', label: 'Heavier covering put on (e.g. concrete tiles over slate)' },
          { key: 'timbers_removed', label: 'Timbers removed' },
          { key: 'loft_conversion', label: 'Loft conversion' },
          { key: 'tank_removed', label: 'Water tank removed' },
          { key: 'none', label: 'None' },
        ],
      },
      {
        id: 'L17',
        label: 'Your structural verdict',
        help: 'We pick a suggestion from your answers. Change it if you know better.',
        type: 'choice',
        level: 'should',
        show: ownLoft,
        options: [
          { key: 'desktop_ok', label: 'A desktop check is enough' },
          { key: 'engineer', label: 'Needs a structural engineer' },
          { key: 'not_suitable', label: 'Not suitable for panels' },
        ],
      },
      { id: 'L11', label: 'Condition of the battens', type: 'choice', options: CONDITION, level: 'optional', show: loftReachable },
      { id: 'L15', label: 'Insulation depth', type: 'number', unit: 'mm', chips: [100, 200, 270], level: 'optional', show: loftReachable },
      { id: 'L15b', label: 'Loft boarded?', type: 'yesno', level: 'optional', show: loftReachable },
      { id: 'L16', label: 'Birds or bats nesting?', type: 'yesno', level: 'optional', show: loftReachable },
      { id: 'L16p', label: 'Photo of the nesting', type: 'photo', level: 'optional', show: (c) => loftReachable(c) && yes(c, 'L16') },
    ],
  },

  /* Screen 5. Electrics */
  {
    key: 'E',
    title: 'Electrics',
    screen: 4,
    skippable: true,
    fields: [
      { id: 'E1', label: 'DNO cut-out (main fuse) with the rating visible', type: 'photo', level: 'must', drawing: 'optional', hint: 'Get the fuse rating in shot' },
      {
        id: 'E2',
        label: 'Main fuse rating',
        type: 'choice',
        level: 'must',
        options: [
          { key: '60', label: '60A', warn: '60A main fuse: the DNO may need to upgrade it (free for homes). Ask when you apply.' },
          { key: '80', label: '80A' },
          { key: '100', label: '100A' },
          { key: 'unknown', label: 'Can’t see', warn: 'Main fuse rating not known: find out before designing the system.' },
        ],
      },
      {
        id: 'E3',
        label: 'Looped supply? (two cables into the cut-out)',
        type: 'choice',
        level: 'must',
        options: [
          { key: 'yes', label: 'Yes' },
          { key: 'no', label: 'No' },
          { key: 'not_sure', label: 'Not sure' },
        ],
      },
      { id: 'E6', label: 'Meter, with the serial number and MPAN visible', type: 'photo', level: 'must', drawing: 'optional', hint: 'The long MPAN number and the serial in shot' },
      { id: 'E10', label: 'Consumer unit, with the labels visible', type: 'photo', level: 'must', drawing: 'optional', hint: 'Cover off is not needed' },
      {
        id: 'E4',
        label: 'Phases',
        type: 'choice',
        level: 'should',
        options: [
          { key: 'single', label: 'Single phase' },
          { key: 'three', label: 'Three phase' },
        ],
      },
      {
        id: 'E5',
        label: 'Earthing',
        type: 'choice',
        level: 'should',
        options: [
          { key: 'tncs', label: 'TN-C-S (PME)' },
          { key: 'tns', label: 'TN-S' },
          { key: 'tt', label: 'TT (earth rod)', warn: 'TT earthing: check and test the earth rod before installing.' },
          { key: 'unknown', label: 'Don’t know' },
        ],
      },
      { id: 'E5p', label: 'Photo of the earthing', type: 'photo', level: 'optional', drawing: 'optional' },
      {
        id: 'E7',
        label: 'Meter type',
        type: 'choice',
        level: 'should',
        options: [
          { key: 'smets2', label: 'Smart (SMETS2)' },
          { key: 'smets1', label: 'Smart (SMETS1)' },
          { key: 'non_smart', label: 'Not smart' },
          { key: 'e7', label: 'Economy 7' },
          { key: 'unknown', label: 'Don’t know' },
        ],
      },
      {
        id: 'E11a',
        label: 'Consumer unit type',
        type: 'choice',
        level: 'should',
        options: [
          { key: 'metal', label: 'Metal' },
          { key: 'plastic', label: 'Plastic' },
          { key: 'rewireable', label: 'Old rewireable fuses' },
        ],
      },
      { id: 'E11b', label: 'Spare ways in the consumer unit?', type: 'yesno', level: 'should' },
      { id: 'E11c', label: 'RCD protection?', type: 'yesno', level: 'should' },
      { id: 'E12', label: 'Where is the consumer unit?', type: 'text', level: 'should' },
      {
        id: 'E13',
        label: 'Existing generation and storage',
        type: 'multi',
        level: 'should',
        options: [
          { key: 'pv', label: 'Solar panels' },
          { key: 'battery', label: 'Battery' },
          { key: 'heat_pump', label: 'Heat pump' },
          { key: 'ev', label: 'EV charger' },
          { key: 'solar_thermal', label: 'Solar hot water' },
          { key: 'diverter', label: 'Hot water diverter' },
          { key: 'none', label: 'None' },
        ],
      },
      { id: 'E13kw', label: 'Existing solar inverter size', type: 'number', unit: 'kW', level: 'should', show: (c) => has(c, 'E13', 'pv') },
      { id: 'E13kwh', label: 'Existing battery size', type: 'number', unit: 'kWh', level: 'should', show: (c) => has(c, 'E13', 'battery') },
      {
        id: 'E14',
        label: 'Yearly electricity use',
        help: 'From a bill or the supplier’s app. Or take a photo of a bill, or tap Customer will send.',
        type: 'number',
        unit: 'kWh',
        level: 'should',
        canSend: true,
        orPhoto: 'E14p',
      },
      { id: 'E14p', label: 'Photo of an electricity bill', type: 'photo', level: 'optional' },
      {
        id: 'E15',
        label: 'Who’s home in the day?',
        type: 'choice',
        level: 'should',
        options: [
          { key: 'home_all_day', label: 'Someone home all day' },
          { key: 'half_day', label: 'Home half the day' },
          { key: 'out_all_day', label: 'Out all day' },
          { key: 'unknown', label: 'Don’t know' },
        ],
      },
      { id: 'E16', label: 'Supplier and tariff', type: 'text', level: 'optional', canSend: true },
      { id: 'E8', label: 'Isolator after the meter?', type: 'yesno', level: 'optional' },
      {
        id: 'E9',
        label: 'Meter tails size',
        type: 'choice',
        level: 'optional',
        options: [
          { key: '16', label: '16 mm²' },
          { key: '25', label: '25 mm²' },
          { key: 'unknown', label: 'Don’t know' },
        ],
      },
    ],
  },

  /* Screen 6. Kit spots */
  {
    key: 'F',
    title: 'Kit spots',
    screen: 5,
    skippable: true,
    fields: [
      {
        id: 'F1',
        label: 'Inverter location',
        type: 'choice',
        level: 'must',
        options: [
          { key: 'garage', label: 'Garage' },
          { key: 'utility', label: 'Utility room' },
          { key: 'outside_wall', label: 'Outside wall' },
          { key: 'loft', label: 'Loft', warn: 'Not recommended: hard to reach and insurers dislike it.' },
          { key: 'other', label: 'Other' },
        ],
      },
      {
        id: 'F5',
        label: 'Battery location',
        help: 'PAS 63100 says where home batteries can go.',
        type: 'choice',
        level: 'must',
        show: battery,
        options: [
          { key: 'outdoors', label: 'Outdoors' },
          { key: 'detached_garage', label: 'Detached garage or outbuilding' },
          { key: 'attached_garage_fire', label: 'Attached garage with a fire door' },
          { key: 'attached_garage_open', label: 'Attached garage, open to the house' },
          { key: 'indoor_room', label: 'A room indoors' },
          { key: 'loft', label: 'Loft', block: BATTERY_BLOCK },
          { key: 'escape_route', label: 'Hall, stairs or escape route', block: BATTERY_BLOCK },
          { key: 'bedroom', label: 'Bedroom', block: BATTERY_BLOCK },
          { key: 'cellar_no_exit', label: 'Cellar with no way out', block: BATTERY_BLOCK },
        ],
      },
      { id: 'F1p', label: 'Inverter spot', type: 'photo', level: 'should', drawing: 'optional', hint: 'Draw where it goes if it helps' },
      { id: 'F2a', label: 'Easy to reach and switch off?', type: 'yesno', level: 'should' },
      { id: 'F2b', label: 'Space and air around it?', type: 'yesno', level: 'should' },
      {
        id: 'F3',
        label: 'WiFi at the inverter',
        type: 'choice',
        level: 'should',
        options: [
          { key: 'strong', label: 'Strong' },
          { key: 'weak', label: 'Weak' },
          { key: 'none', label: 'No WiFi' },
        ],
      },
      {
        id: 'F4a',
        label: 'Cable length: panels to inverter (DC)',
        type: 'band',
        level: 'should',
        show: (c) => !batteryOnly(c.a),
        options: [
          { key: 'lt5', label: 'Under 5 m' },
          { key: '5_10', label: '5 to 10 m' },
          { key: '10_20', label: '10 to 20 m' },
          { key: '20_plus', label: '20 m or more' },
        ],
      },
      {
        id: 'F4b',
        label: 'Cable length: inverter to consumer unit (AC)',
        type: 'band',
        level: 'should',
        options: [
          { key: 'lt5', label: 'Under 5 m' },
          { key: '5_10', label: '5 to 10 m' },
          { key: '10_20', label: '10 to 20 m' },
          { key: '20_plus', label: '20 m or more' },
        ],
      },
      { id: 'F6', label: 'Battery spot', type: 'photos', level: 'should', drawing: 'optional', show: battery },
      {
        id: 'F7',
        label: 'Mounting surface',
        type: 'choice',
        level: 'should',
        show: battery,
        options: [
          { key: 'masonry', label: 'Brick or block wall' },
          { key: 'concrete_floor', label: 'Concrete floor' },
          { key: 'timber_stud', label: 'Timber stud wall' },
          { key: 'plasterboard', label: 'Plasterboard' },
          { key: 'other', label: 'Other' },
        ],
      },
      {
        id: 'F8',
        label: 'Could a vehicle hit it?',
        help: 'Yes means fitting a bollard or guard.',
        type: 'yesno',
        level: 'should',
        show: (c) => battery(c) && is(c, 'F5', 'outdoors', 'detached_garage', 'attached_garage_fire', 'attached_garage_open'),
      },
      { id: 'F9a', label: 'Smoke alarms in the house?', type: 'yesno', level: 'should', show: battery },
      { id: 'F9b', label: 'Are the smoke alarms linked together?', type: 'yesno', level: 'should', show: (c) => battery(c) && yes(c, 'F9a') },
      { id: 'F9c', label: 'Will one be needed at the battery spot?', type: 'yesno', level: 'should', show: battery },
      { id: 'F10', label: 'Planned battery size', type: 'number', unit: 'kWh', chips: [5, 10, 15], level: 'should', show: battery },
      { id: 'F11', label: 'Backup power wanted for power cuts?', type: 'yesno', level: 'optional' },
    ],
  },

  /* Screen 7. Cable routes */
  {
    key: 'G',
    title: 'Cable routes',
    screen: 6,
    fields: [
      {
        id: 'C1',
        label: 'DC route, roof to inverter',
        help: 'Draw the route on the photo, now or later in the van.',
        type: 'photo',
        level: 'must',
        drawing: 'needed',
        hint: 'Get the roof and the inverter spot in if you can',
        show: (c) => !batteryOnly(c.a),
      },
      {
        id: 'C2',
        label: 'AC route, inverter to consumer unit',
        help: 'Draw the route on the photo, now or later in the van.',
        type: 'photo',
        level: 'must',
        drawing: 'needed',
      },
      {
        id: 'C1m',
        label: 'How the DC cable gets in',
        type: 'choice',
        level: 'should',
        show: (c) => !batteryOnly(c.a),
        options: [
          { key: 'roof_entry', label: 'Through the roof' },
          { key: 'outside_trunking', label: 'Trunking down the outside' },
          { key: 'soffit', label: 'Through the soffit' },
        ],
      },
      { id: 'C5', label: 'Customer agreed the routes?', type: 'yesno', level: 'should' },
      { id: 'C3', label: 'Drilling through walls or lifting floors', type: 'text', level: 'optional' },
      { id: 'C4', label: 'Meter clamp (CT) and Ethernet route', type: 'text', level: 'optional' },
    ],
  },

  /* Screen 8. Finish */
  {
    key: 'J',
    title: 'Finish',
    screen: 7,
    fields: [
      { id: 'Z2', label: 'DNO route', type: 'auto', level: 'optional' },
      { id: 'Z3', label: 'Planning', type: 'auto', level: 'optional' },
      { id: 'Z4', label: 'Structural', type: 'auto', level: 'optional' },
      { id: 'Z5', label: 'Red flags', type: 'auto', level: 'optional' },
      { id: 'Z7', label: 'Photos still needed', type: 'auto', level: 'optional' },
      { id: 'Z1', label: 'Suggested system', help: 'Your first idea of the system. The inverter size gives the DNO route.', type: 'system', level: 'optional' },
      { id: 'Z6', label: 'Your notes', type: 'longtext', level: 'optional' },
      {
        id: 'Z8',
        label: 'Customer sign-off',
        help: 'Their typed name, then their signature: “I agree the kit locations and cable routes we discussed”.',
        type: 'signature',
        level: 'should',
      },
    ],
  },
];

/** Every field by id (once fields included), for labels in lists and the report. */
export function fieldIndex(schema: Section[] = SOLAR_SCHEMA): Map<string, { field: Field; section: Section }> {
  const out = new Map<string, { field: Field; section: Section }>();
  for (const section of schema) for (const field of [...(section.once ?? []), ...section.fields]) out.set(field.id, { field, section });
  return out;
}

/* ── Survey records as the API sends them (GET /api/crm/surveys/{id}, the offline pack) ── */

export type SurveyKind = 'solar' | 'ashp';
export type SurveyStatus = 'booked' | 'draft' | 'complete' | 'cancelled';

export type SurveyPhoto = {
  id: string;
  slot: string | null;
  /** Signed for 12 hours, so a copy kept on the phone still shows them offline. */
  url: string | null;
  thumb: string | null;
  markup: Markup | null;
  markupUrl: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
  /** The phone's queue id it was uploaded from (the file is named after it), to match queued copies. */
  clientId: string | null;
};

export type SurveyDocument = { id: string; name: string; category: string; mime: string | null; size: number | null; url: string | null; created_at: string };

export type SurveyRecord = {
  id: string;
  project_id: string;
  enquiry_id: string;
  type: SurveyKind;
  status: SurveyStatus;
  surveyor_id: string | null;
  surveyor: string | null;
  booking_id: string | null;
  schema_version: number;
  answers: Answers;
  rev: number;
  answers_saved_at: string | null;
  flags: string[];
  summary: Record<string, unknown> | null;
  simpliheat_url: string | null;
  notes: string | null;
  started_at: string | null;
  finished_on_site_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completed_by_name: string | null;
  customer_signed_name: string | null;
  customer_signed_at: string | null;
  signatureUrl: string | null;
  created_at: string;
  updated_at: string;
};

export type SurveyPayload = {
  survey: SurveyRecord;
  /** Pre-filled answers (A3 address, A4 scope, the first roof area) while the answers are still empty. */
  defaults: Answers | null;
  project: {
    id: string;
    title: string | null;
    ref: string | null;
    address: string | null;
    postcode: string | null;
    products: string[];
    stage: string;
    survey_at: string | null;
    survey_minutes: number | null;
    survey_type: string | null;
    simpliheat_url: string | null;
  };
  customer: { id: string; name: string | null; phone: string | null; email: string | null } | null;
  photos: SurveyPhoto[];
  documents: SurveyDocument[];
  schemaVersion: number;
  /** When the server built it (ISO). */
  fetchedAt: string;
};
