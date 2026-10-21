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
  /** The electrician's pack: what the forms read from the job, the roofer and the office (Unit 2). */
  el?: ElectricianFacts;
  /** The electrician's certificate (Unit 3): the office's route and what's remembered for it (site/eic/facts.ts). */
  eic?: EicFacts;
};

/**
 * What the electrician's forms know about the job beyond the design (src/lib/site/electrician-shared.ts
 * builds it from the job pack on the phone, and from the database at sign-off). Empty means not known:
 * nothing is guessed.
 */
export type ElectricianFacts = {
  /** The assignment's certificate route (D16): 'eic', 'eic_single', 'meiwc' or 'own'. */
  cert_route: string;
  /** "Jane", for "Have you told Jane…". */
  customer_first: string;
  /** The job's DNO route (paperwork.dno_route: g98, g99, demand, not_needed) and reference. */
  dno_route: string | null;
  dno_ref: string | null;
  export_limit_kw: number | null;
  inverter_kw: number | null;
  battery_kwh: number | null;
  ev_model: string | null;
  heat_pump_model: string | null;
  /** The survey's battery spot (F5), for the battery location check. */
  survey_battery_spot: string | null;
  /** What the roofer has synced: their answers (values), what Claude read from their photos, their photo counts. */
  roofer: { status: string; values: Record<string, unknown>; reads: { key: string; status: string; result: LabelReadResult | null }[]; photos: Record<string, number> } | null;
  /** Serials captured elsewhere on the job (the roofer's panels and optimisers), for "no serial twice". */
  serials_elsewhere: string[];
  /** F43: how far a measured string Voc may be from the expected before it's flagged (percent, a setting). */
  voc_tolerance: number;
  /** The test instruments this person gave on their last job, offered for F43. */
  instruments: string | null;
  /** The electrician's own name (from their contact), for "Tested by". */
  name: string | null;
  /** Their scheme and number, offered for an uploaded certificate. */
  scheme: string | null;
  scheme_number: string | null;
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

  /* The electrician's pack (Unit 2). */
  /** The question in words for this job ("Is the charger commissioned?", "Have you told Jane…"); `label` stays the record's. */
  say?: (c: FormCtx) => string;
  /** A heading above this row, starting a group of questions within the step ("Inverter"). */
  group?: string;
  /** Guidance behind an ⓘ (F74 Part 4's italic notes), shown in full when tapped. */
  info?: string;
  /** Asked once per PV string (F43): the value is a list, one per string (strings from `strings`). */
  perString?: boolean;
  /** perString: strings 2 onwards are "Same as string 1" until that's switched off. */
  same?: boolean;
  /** perString: a line beside one string's box ("Expected about 395.2 V (8 × 49.4 V)"). */
  stringNote?: (c: FormCtx, i: number) => string | null;
  /** NUM and TEXT: an N/A choice, stored as 'na' (an OCPD rating when none is fitted). */
  na?: boolean;
  /** TEXT: quick choices under the box ("None fitted", "gPV fuse"). */
  choices?: string[];
  /** Choosing this fills other rows: "None fitted" puts N/A in the three OCPD rows. */
  fills?: { when: string; keys: string[]; v: unknown };
  /** A one-tap answer for several rows at once ("N/A: no back-up"), offered while `when` holds. */
  bulk?: { label: string; keys: string[]; v: unknown; when: (c: FormCtx) => boolean };
  /** Worked out from other answers until someone answers it (F44 items 36–38, F44A): a tap changes it. */
  auto?: (c: FormCtx) => unknown;
  /** Where the worked-out answer comes from ("Done in PV tests (F43)"). */
  autoFrom?: (c: FormCtx) => string | null;
  /** Worked out from rows still to do (which the gate lists themselves): not listed again while they are. */
  autoWaits?: (c: FormCtx) => boolean;
  /** AUTO rows the gate checks: answered when this says so (the certificate until its route is built). */
  done?: (c: FormCtx) => boolean;
  /** Photo slots shown beside the row as evidence (F44: the cable route photos). */
  evidence?: string[];
  /** The roofer's photo slots shown beside the row (F44 item 13: the fixings). */
  rooferEvidence?: string[];
  /** SCAN: the label photo slot it reads from ("Read from photo" serials), and how many are expected. */
  photo?: string;
  expect?: (c: FormCtx) => number | null;
  /** PHOTOS: a PDF is taken too (a certificate from the scheme's software). */
  files?: boolean;
  /** A panel the phone draws on this row: 'missing' is the Finish screen's "Everything provided" list. */
  panel?: 'missing';

  /* The electrician's certificate (Unit 3). */
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
  /** 'strings': the F43 screen, with a tab per PV string and the per-string rows in cards (P8). */
  layout?: 'strings';
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
