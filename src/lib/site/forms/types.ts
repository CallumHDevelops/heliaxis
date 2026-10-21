/**
 * The shape of a site form (FORMS 0.1 and 0.2): steps of fields, each with a key that never changes
 * once used, an answer type, a level, and when it's shown. Forms are data (roofer.ts, scaffold.ts,
 * electrician/*.ts); the rules that read them are in ../rules.ts, shared by the phone and the
 * server. Type-only imports, so the tests load these files straight into node.
 */
import type { Design } from '../design';
import type { Answers, Severity, Source, Stage, Trade } from '../types';

/** FORMS 0.1 answer types. PER_STRING is one number per PV string. */
export type FieldType =
  | 'TICK'
  | 'PFN'
  | 'PF'
  | 'YNN'
  | 'YN'
  | 'CONFIRM'
  | 'NUM'
  | 'TEXT'
  | 'LONG'
  | 'SEL'
  | 'MULTI'
  | 'PHOTOS'
  | 'SCAN'
  | 'SIG'
  | 'AUTO'
  | 'PER_STRING'
  | 'CUSTOM';

/** must blocks sign-off; should is listed as "Not filled"; optional sits behind More detail. */
export type Level = 'must' | 'should' | 'optional';

/** What the rules know about a job while a form is filled in (on the phone, and again on the server). */
export type FormCtx = {
  trade: Trade;
  /** Answer values by key (Answer.v). */
  values: Record<string, unknown>;
  /** The answers with their sources (for "From the design" chips already accepted). */
  answers: Answers;
  design: Design;
  system: { kwp: number | null; panel_count: number | null; panel_model: string | null; inverter_model: string | null; battery_model: string | null };
  products: string[];
  /** Scaffold sides from the survey (front, rear, left, right). */
  sides: string[];
  /** Photos per slot: the server's, plus the phone's still waiting to send. */
  photos: Record<string, number>;
  /** Claude's reads of label photos, by the photo's slot: suggestions until a person accepts them. */
  reads: { key: string; status: string; result: LabelReadResult | null }[];
  /** "12 High Street, Maindee, Newport, NP20 4AB", for the declarations. */
  address: string;
  /** Stages already signed off on this assignment. */
  signed: Stage[];
  /** The electrician's certificate (Unit 3): the office's route and what's remembered for it (site/eic/facts.ts). */
  eic?: EicFacts;
};

/** What the EIC's questions are offered from: the route the office chose, the client, the person signing and their test instruments. */
export type EicFacts = {
  route: 'eic' | 'eic_single' | 'meiwc' | 'own';
  /** HX-0042-EIC (a second electrician on the job: HX-0042-EIC2). */
  ref: string | null;
  client: string | null;
  contact: { name: string; company: string | null; mobile: string | null; email: string | null; address: string | null; postcode: string | null; scheme: string | null; scheme_number: string | null };
  /** Serial or asset numbers from their last job, by instrument. */
  instruments: Record<string, string>;
};

/** One thing a CUSTOM field still needs ("DB1 circuit 2: test results"). Must unless it says should. */
export type Part = { label: string; why: string; level?: 'must' | 'should' };

/** What a label photo was read as (src/lib/site/vision.ts LabelRead). */
export type LabelReadResult = {
  readable: boolean;
  problem: string | null;
  kind: string;
  make: string | null;
  model: string | null;
  serials: string[];
  panel: { pmax_w: number | null; voc_v: number | null; isc_a: number | null; vmp_v: number | null; imp_a: number | null; max_system_v: number | null } | null;
  battery: { usable_kwh: number | null; nominal_kwh: number | null; rated_kw: number | null } | null;
  inverter: { rated_ac_kw: number | null } | null;
  meter: { reading_kwh: number | null } | null;
};

/** A value offered with a source chip ("From the design: 8"), accepted with one tap. */
export type Suggestion = { v: unknown; src: Source; text: string };

export type Option = { key: string; label: string };

export type Field = {
  key: string;
  type: FieldType;
  /** The question on screen (FORMS wording, tidied where FORMS says). */
  label: string;
  hint?: string;
  level: Level;
  /** Shown only when this is true. A hidden field isn't asked, isn't required and is left out of the record. */
  show?: (c: FormCtx) => boolean;
  /** A follow-up: drawn straight under this key's row with the gold rule. */
  parent?: string;
  /** SEL and MULTI choices. */
  options?: Option[];
  /** NUM: unit inside the box, decimal places, quick chips, the ">" toggle (NUM>), sensible bounds. */
  unit?: string;
  dp?: number;
  chips?: number[];
  gt?: boolean;
  min?: number;
  max?: number;
  /** PHOTOS: how many count as done. SCAN: how many are expected. */
  need?: number | ((c: FormCtx) => number);
  /** PHOTOS: one slot per scaffold side (key:front, key:rear…). */
  perSide?: boolean;
  /** PHOTOS: a label or data badge: shot larger and checked for blur. */
  label_photo?: boolean;
  /** PHOTOS: read by Claude when it reaches the server. */
  read?: boolean;
  /** PER_STRING: how many strings. */
  strings?: (c: FormCtx) => number;
  /** A value to offer ("From the design", "Read from photo"), never filled in on its own. */
  suggest?: (c: FormCtx) => Suggestion | null;
  /** A line under the question ("The design has optimisers"). */
  note?: (c: FormCtx) => string | null;
  /** YN/CONFIRM: what to say when the answer is the wrong one ("Please put this right before you come down."). */
  fix?: { when: unknown; text: string };
  /** CONFIRM: the way out ("I can't confirm this"), stored as 'cant'. */
  cant?: string;
  /** SIG: the declaration above the pad. */
  declaration?: (c: FormCtx) => string;
  /** Still takes answers after its stage is signed off (the scaffold's tag photo). */
  late?: boolean;
  /** TEXT: common answers offered as chips under the box ("BS EN 60898"). */
  picks?: string[];
  /**
   * CUSTOM: a field drawn by its own widget (the EIC's boards and circuits, a signature). It owns the
   * answers keyed KEY:anything as well as KEY; `parts` says what it still needs (the gate), `progress`
   * how far it's got, and `words` what it says on a document or the office's review.
   */
  widget?: string;
  parts?: (c: FormCtx) => Part[];
  progress?: (c: FormCtx) => { done: number; total: number };
  words?: (c: FormCtx) => string | null;
};

export type Step = {
  /** In the address: /portal/site/job/<id>/<step key>. */
  key: string;
  title: string;
  /** Shown above the questions. */
  intro?: string;
  fields: Field[];
  show?: (c: FormCtx) => boolean;
};

/** A flag rule (FORMS 5): when it's raised, how bad it is, and what the office reads. */
export type FlagRule = {
  code: string;
  severity: Severity | ((c: FormCtx) => Severity);
  key: string;
  when: (c: FormCtx) => boolean;
  text: (c: FormCtx) => string;
};

/** One stage's form: the roofer's, the scaffold going up, the scaffold coming down, the electrician's pack. */
export type SiteForm = {
  id: string;
  stage: Stage;
  title: string;
  steps: Step[];
  /** The signature field, on the Check and sign screen. */
  sig: Field;
  flags: FlagRule[];
  /** "about 10 minutes" on the job screen. */
  minutes: number;
  /** Opens only once this stage is signed (the strike after the erection). */
  after?: Stage;
};
