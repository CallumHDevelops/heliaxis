/**
 * The customer handover pack's catalogue (SPEC 4.1, HANDOVER 1): every document in the owner's list
 * (the 26 rows of his compliance system) plus the combined PACK, each with the customer's one plain
 * line, its contents group, the technologies it belongs to, who makes it, its place in the pack and
 * when it isn't needed. Then each item's state on a job (D7: Complete, Missing, Waiting, Not needed,
 * Out of date), the headline ("18 of 23 complete · 3 waiting · 2 missing · 2 not needed"), whether
 * the pack can go to the customer yet (D23) and the contents in customer order (HANDOVER 2.6).
 *
 * Pure apart from one date helper, so the Handover tab, the server, the customer portal and
 * scripts/test-handover-slots.mjs all read the same rules.
 */
import { shortDay } from '../projects/deadlines';

export type Tech = 'solar' | 'battery' | 'ev' | 'heatpump';
export const TECH_LABEL: Record<Tech, string> = { solar: 'Solar PV', battery: 'Battery', ev: 'EV charger', heatpump: 'Heat pump' };

/** G: we make it from data · C: collected (uploaded: someone else issues it) · L: from the product library. */
export type SlotKind = 'G' | 'C' | 'L';
/** Who makes it: this pack's own generators, the electrician's sign-off, the EIC, the office (upload) or the library. */
export type Maker = 'pack' | 'site' | 'eic' | 'office' | 'library';

export type Group = 'cover' | 'certificates' | 'warranties' | 'using' | 'design' | 'tests' | 'grid' | 'manufacturer' | 'invoices' | 'other';
/** The contents page's groups, in pack order (the cover letter comes before them). */
export const GROUPS: { key: Exclude<Group, 'cover'>; title: string }[] = [
  { key: 'certificates', title: 'Certificates' },
  { key: 'warranties', title: 'Warranties and guarantees' },
  { key: 'using', title: 'Using and looking after your system' },
  { key: 'design', title: 'Design' },
  { key: 'tests', title: 'Test and inspection records' },
  { key: 'grid', title: 'Grid connection' },
  { key: 'manufacturer', title: 'Manufacturer information' },
  { key: 'invoices', title: 'Invoices' },
  { key: 'other', title: 'Other' },
];

export type SlotCode =
  | 'F07BI'
  | 'F19I'
  | 'F43'
  | 'F44'
  | 'F44A'
  | 'F74'
  | 'F75'
  | 'F74A'
  | 'F74B'
  | 'F78'
  | 'F16E'
  | 'F47'
  | 'F76'
  | 'F48I'
  | 'F49'
  | 'F49A'
  | 'CC4'
  | 'CC5'
  | 'CC10'
  | 'CC13'
  | 'CC14'
  | 'CC15'
  | 'CC16'
  | 'CC17'
  | 'CC21'
  | 'CCMH'
  | 'PACK';

/** What applies() looks at: the job's technologies, its DNO route and two design details. */
export type AppliesCtx = {
  products: string[];
  /** paperwork.dno_route: g98 · g99 · demand · not_needed, or null when it hasn't been chosen. */
  dnoRoute: string | null;
  /** system.pas63100: PAS 63100 applies to this battery (Job details). */
  pas63100: boolean | null;
  /** system.maintenance_plan: a maintenance plan was sold. */
  maintenancePlan: boolean | null;
};

export type SlotDef = {
  code: SlotCode;
  /** As in the owner's compliance system. */
  title: string;
  /** One plain line for the customer's portal. */
  customer: string;
  group: Group;
  /** The technologies it belongs to (its icons). Empty: every job. */
  tech: Tech[];
  kind: SlotKind;
  maker: Maker;
  /** Place in the combined pack (customer order, HANDOVER 2.6). */
  order: number;
  /** Null when it applies; otherwise why it isn't needed (automatic, HANDOVER 1.2). */
  applies: (c: AppliesCtx) => string | null;
  /** The office's own reasons for Not needed, offered before "Other: …". */
  reasons?: string[];
  /** Extras: never Missing, never counted. */
  optional?: boolean;
  /** Where an upload into it is filed (crm_documents.category). */
  category: string;
  /** "Which is it?" on + Add a document. */
  pick?: string;
};

const has = (c: AppliesCtx, ...t: Tech[]) => t.some((x) => c.products.includes(x));
const NO_SOLAR = 'No solar panels on this job';
const NO_BATTERY = 'No battery on this job';
const NO_PV_OR_BATTERY = 'No solar or battery on this job';
const solar = (c: AppliesCtx) => (has(c, 'solar') ? null : NO_SOLAR);
const battery = (c: AppliesCtx) => (has(c, 'battery') ? null : NO_BATTERY);
const pvOrBattery = (c: AppliesCtx) => (has(c, 'solar', 'battery') ? null : NO_PV_OR_BATTERY);
const any = () => null;
/** MCS certifies solar, batteries and heat pumps: not an EV charger on its own. */
const mcs = (c: AppliesCtx) => (has(c, 'solar', 'battery', 'heatpump') ? null : 'No MCS certificate for this job’s technologies');
const pas = (c: AppliesCtx) => battery(c) ?? (c.pas63100 === true ? null : 'PAS 63100 isn’t ticked for this battery (Job details)');
const ROUTE_WORDS: Record<string, string> = {
  g98: 'G98 job: the DNO is told after',
  g99: 'G99 job: Form B isn’t used',
  demand: 'Demand only: no generation paperwork',
  not_needed: 'No DNO paperwork needed on this job',
};
/** F47 for G98 jobs, F76 for G99 ones. No route chosen yet: it applies (and asks for the route). */
const route = (want: 'g98' | 'g99') => (c: AppliesCtx) => pvOrBattery(c) ?? (c.dnoRoute && c.dnoRoute !== want ? (ROUTE_WORDS[c.dnoRoute] ?? 'Not this job’s DNO route') : null);
const EXISTING = 'Battery added to an existing system: the existing one still applies';
const PAS_SCOPE = ['Not a dwelling', 'Dwelling over 200 m²', 'Battery connected before the meter', 'Second-life battery'];

export const SLOTS: SlotDef[] = [
  {
    code: 'F07BI',
    title: 'Handover Cover Letter',
    customer: 'Our letter to you: what we installed, what’s in this pack and what to do next.',
    group: 'cover',
    tech: [],
    kind: 'G',
    maker: 'pack',
    order: 10,
    applies: any,
    category: 'handover',
  },
  {
    code: 'F78',
    title: 'Solar PV & Battery Handover Document',
    customer: 'The handover certificate for your system: what was installed, its ratings and who signed it off.',
    group: 'certificates',
    tech: ['solar', 'battery'],
    kind: 'G',
    maker: 'pack',
    order: 20,
    applies: pvOrBattery,
    category: 'handover',
  },
  {
    code: 'CC17',
    title: 'MCS Certificate',
    customer: 'Shows your system was installed to MCS standards. You’ll need it to apply for the Smart Export Guarantee.',
    group: 'certificates',
    tech: ['solar', 'battery', 'heatpump'],
    kind: 'C',
    maker: 'office',
    order: 30,
    applies: mcs,
    reasons: [EXISTING],
    category: 'mcs',
    pick: 'MCS certificate',
  },
  {
    code: 'CC21',
    title: 'Electrical Testing Certificates',
    customer: 'Your electrical installation certificate: the safety tests on the new wiring.',
    group: 'certificates',
    tech: [],
    kind: 'G',
    maker: 'eic',
    order: 40,
    applies: any,
    reasons: [EXISTING],
    category: 'certificate',
    pick: 'Electrical certificate (EIC)',
  },
  {
    code: 'F74B',
    title: 'PAS 63100 Statement of Conformity (Battery)',
    customer: 'Confirms where your battery is fitted follows PAS 63100, the guidance for batteries in homes.',
    group: 'certificates',
    tech: ['battery'],
    kind: 'C',
    maker: 'site',
    order: 45,
    applies: pas,
    reasons: PAS_SCOPE,
    category: 'certificate',
  },
  {
    code: 'CC14',
    title: 'Building Control Notifications',
    customer: 'Shows the electrical work was notified to Building Control, as the Building Regulations ask.',
    group: 'certificates',
    tech: [],
    kind: 'C',
    maker: 'office',
    order: 50,
    applies: any,
    reasons: [EXISTING],
    category: 'certificate',
    pick: 'Building Control certificate',
  },
  {
    code: 'F19I',
    title: 'Workmanship Warranty',
    customer: 'Our workmanship warranty.',
    group: 'warranties',
    tech: [],
    kind: 'G',
    maker: 'pack',
    order: 60,
    applies: any,
    category: 'warranty',
  },
  {
    code: 'CC16',
    title: 'Insurance Backed Guarantee / MCS Financial Protection Product',
    customer: 'The insurance that backs our warranty if we ever stopped trading.',
    group: 'warranties',
    tech: ['solar', 'battery', 'heatpump'],
    kind: 'C',
    maker: 'office',
    order: 70,
    applies: mcs,
    category: 'warranty',
    pick: 'Insurance-backed guarantee',
  },
  {
    code: 'F16E',
    title: 'Completion of Works Record',
    customer: 'Your record that the work was finished and you were shown how it all works.',
    group: 'using',
    tech: [],
    kind: 'G',
    maker: 'pack',
    order: 80,
    applies: any,
    category: 'handover',
  },
  {
    code: 'CC4',
    title: 'Start Up and Shutdown Procedures',
    customer: 'How to switch your system off safely, and back on.',
    group: 'using',
    tech: [],
    kind: 'L',
    maker: 'pack',
    order: 90,
    applies: any,
    category: 'handover',
  },
  {
    code: 'F48I',
    title: 'Solar PV Shading and Maintenance',
    customer: 'Your yearly generation estimate, the shading on your roof and the simple checks you can do.',
    group: 'using',
    tech: ['solar'],
    kind: 'G',
    maker: 'pack',
    order: 100,
    applies: solar,
    category: 'handover',
  },
  {
    code: 'F49',
    title: 'Solar PV Maintenance Schedule',
    customer: 'What needs checking, by whom and how often.',
    group: 'using',
    tech: ['solar', 'battery'],
    kind: 'G',
    maker: 'pack',
    order: 110,
    applies: pvOrBattery,
    category: 'handover',
  },
  {
    code: 'F49A',
    title: 'Solar PV Maintenance Agreement',
    customer: 'Your maintenance plan, as agreed.',
    group: 'using',
    tech: ['solar', 'battery'],
    kind: 'G',
    maker: 'pack',
    order: 120,
    applies: (c) => pvOrBattery(c) ?? (c.maintenancePlan === true ? null : 'No maintenance plan sold'),
    category: 'handover',
  },
  {
    code: 'CC10',
    title: 'Schematic Diagram(s)',
    customer: 'A drawing of how your system is wired.',
    group: 'design',
    tech: ['solar', 'battery'],
    kind: 'C',
    maker: 'office',
    order: 130,
    applies: pvOrBattery,
    reasons: [EXISTING],
    category: 'design',
    pick: 'Schematic',
  },
  {
    code: 'CC15',
    title: 'Design Calculations',
    customer: 'The calculations behind your system’s design.',
    group: 'design',
    tech: ['solar', 'battery'],
    kind: 'C',
    maker: 'office',
    order: 140,
    applies: pvOrBattery,
    reasons: ['No structural or other calculations needed for this design'],
    category: 'design',
    pick: 'Design calculations',
  },
  {
    code: 'F43',
    title: 'Solar PV Array Test Form',
    customer: 'The test results for your solar panels’ wiring.',
    group: 'tests',
    tech: ['solar'],
    kind: 'G',
    maker: 'site',
    order: 150,
    applies: solar,
    category: 'commissioning',
  },
  {
    code: 'F44',
    title: 'Solar PV Installation Checklist',
    customer: 'The installer’s checklist for your solar installation.',
    group: 'tests',
    tech: ['solar'],
    kind: 'G',
    maker: 'site',
    order: 160,
    applies: solar,
    category: 'commissioning',
  },
  {
    code: 'F44A',
    title: 'Solar PV Commissioning Checklist',
    customer: 'The checks made when your solar system was switched on.',
    group: 'tests',
    tech: ['solar'],
    kind: 'G',
    maker: 'site',
    order: 170,
    applies: solar,
    category: 'commissioning',
  },
  {
    code: 'F74',
    title: 'Battery Testing Checklist',
    customer: 'The installer’s checks and tests on your battery.',
    group: 'tests',
    tech: ['battery'],
    kind: 'G',
    maker: 'site',
    order: 180,
    applies: battery,
    category: 'commissioning',
  },
  {
    code: 'F75',
    title: 'Battery Commissioning Checklist',
    customer: 'The checks made when your battery was switched on.',
    group: 'tests',
    tech: ['battery'],
    kind: 'G',
    maker: 'site',
    order: 190,
    applies: battery,
    category: 'commissioning',
  },
  {
    code: 'F74A',
    title: 'PAS 63100 Verification Checklist (Battery)',
    customer: 'The checks on where your battery is fitted (PAS 63100).',
    group: 'tests',
    tech: ['battery'],
    kind: 'C',
    maker: 'site',
    order: 200,
    applies: pas,
    reasons: PAS_SCOPE,
    category: 'commissioning',
  },
  {
    code: 'F47',
    title: 'G98 Form B',
    customer: 'The notice that tells your electricity network (DNO) about your new system.',
    group: 'grid',
    tech: ['solar', 'battery'],
    kind: 'G',
    maker: 'pack',
    order: 210,
    applies: route('g98'),
    category: 'dno',
  },
  {
    code: 'F76',
    title: 'G99 A1.2 Issue 1.9',
    customer: 'Your electricity network’s (DNO’s) approval for your system, and what was sent to them.',
    group: 'grid',
    tech: ['solar', 'battery'],
    kind: 'C',
    maker: 'office',
    order: 220,
    applies: route('g99'),
    category: 'dno',
    pick: 'G99 paperwork',
  },
  {
    code: 'CC5',
    title: 'Manufacturer Information',
    customer: 'Manuals, datasheets and warranties for the products we fitted.',
    group: 'manufacturer',
    tech: [],
    kind: 'L',
    maker: 'library',
    order: 230,
    applies: any,
    category: 'handover',
  },
  {
    code: 'CC13',
    title: 'Paid Invoice',
    customer: 'Your paid invoice and receipt.',
    group: 'invoices',
    tech: [],
    kind: 'C',
    maker: 'office',
    order: 240,
    applies: any,
    category: 'invoice',
    pick: 'Paid invoice',
  },
  {
    code: 'CCMH',
    title: 'Miscellaneous Handover Documents',
    customer: 'Anything else that’s useful to keep.',
    group: 'other',
    tech: [],
    kind: 'C',
    maker: 'office',
    order: 250,
    applies: any,
    optional: true,
    category: 'handover',
    pick: 'Something else',
  },
  {
    code: 'PACK',
    title: 'Handover pack (one PDF)',
    customer: 'Everything above in one PDF.',
    group: 'other',
    tech: [],
    kind: 'G',
    maker: 'pack',
    order: 0,
    applies: any,
    optional: true,
    category: 'handover',
  },
];

const BY_CODE = new Map(SLOTS.map((s) => [s.code, s]));
export const slotDef = (code: string) => BY_CODE.get(code as SlotCode);
export const isSlot = (code: unknown): code is SlotCode => typeof code === 'string' && BY_CODE.has(code as SlotCode);
/** The owner's list (every row of his compliance system), without the combined PACK. */
export const PACK_ITEMS = SLOTS.filter((s) => s.code !== 'PACK');
/** "Which is it?" for + Add a document, ending with Something else. */
export const UPLOAD_PICKS = PACK_ITEMS.filter((s) => s.pick).sort((a, b) => (a.code === 'CCMH' ? 1 : b.code === 'CCMH' ? -1 : 0));

/** The documents the electrician's sign-off and certificate make: all of them Complete before Send (D23). */
export const SITE_SLOTS: SlotCode[] = ['F43', 'F44', 'F44A', 'F74', 'F75', 'F74A', 'F74B', 'F78', 'CC21'];
/** Chased by the office after the pack goes ("On its way"). */
export const FOLLOW_SLOTS: SlotCode[] = ['CC13', 'CC14', 'CC16', 'CC17'];

/* ── States ──────────────────────────────────────────────────────────────── */

export type State = 'complete' | 'missing' | 'waiting' | 'na' | 'stale';
export const STATE_LABEL: Record<State, string> = { complete: 'Complete', missing: 'Missing', waiting: 'Waiting', na: 'Not needed', stale: 'Out of date' };

/** A current (not archived) job document in a pack item. */
export type SlotDoc = {
  id: string;
  slot: string;
  name: string;
  /** upload · generated · library · site */
  source: string | null;
  /** generated_key: versions of one generated document share it (F78, CC13_RECEIPT…). */
  key: string | null;
  visible: boolean;
  release: string;
  at: string;
  version: number;
  mime: string | null;
  size: number | null;
  hash: string | null;
  /** Its inputs changed after it went to the customer (the store's Out of date mark, for other units' documents). */
  stale?: boolean;
  /** F76: which G99 paper it is (application · acceptance · installation · g100). */
  part?: string | null;
  /** Who uploaded it ("Uploaded by Sarah"). */
  by?: string | null;
};

export type SlotMark = { na: boolean; reason: string | null; by: string | null; at: string | null };

/** The button a row offers for what it still needs. */
export type Fix =
  | 'job'
  | 'paperwork'
  | 'settings'
  | 'sign-design'
  | 'switches'
  | 'values'
  | 'outstanding'
  | 'upload'
  | 'site'
  | 'library'
  | 'notify-bc'
  | 'mid'
  | 'invoice'
  | 'dno-sent';

/** One of this unit's generated documents: made from these inputs now, or what it still needs. */
export type GenNeed = { ready: true; hash: string } | { ready: false; state: 'missing' | 'waiting'; why: string; fix?: Fix; due?: string | null };

export type StateCtx = AppliesCtx & {
  /** The job's current pack documents (archived ones left out). */
  docs: SlotDoc[];
  /** Office Not needed marks (handover_slots). */
  marks: Partial<Record<string, SlotMark>>;
  gen: Partial<Record<SlotCode, GenNeed>>;
  /** The electrician on the site app: none yet, working on it, or signed off. */
  electrician: 'none' | 'working' | 'signed';
  electricianName?: string | null;
  /** Building control: the electrician's own scheme notifies it ('self'), or Heliaxis does. */
  partPBy?: 'self' | 'heliaxis' | null;
  /** YYYY-MM-DD the system was switched on (commissioned_at). */
  commissioned: string | null;
  paperwork: Record<string, string>;
  /** A G99 application has gone to the DNO. */
  dnoSubmitted: boolean;
  /** The G98 notice has gone (checklist c_dno_notified). */
  dnoNotified: boolean;
  /** Deadlines (YYYY-MM-DD): the MCS certificate, Building Regs, the guarantee, G98. */
  due: { mcs?: string | null; regs?: string | null; cc16?: string | null; g98?: string | null };
  /** A final payment is recorded, or Final invoice paid is ticked. */
  invoicePaid: boolean;
  /** Product models on the job with no manual or datasheet in the library. */
  libraryGaps: string[];
  /** Product models recorded on the job. */
  models: string[];
  /** A design document is on the job (offered as the schematic or calculations). */
  designDoc: boolean;
  /** The pack has gone to the customer. */
  sent: boolean;
};

export type SlotView = {
  code: SlotCode;
  title: string;
  customer: string;
  group: Group;
  tech: Tech[];
  kind: SlotKind;
  maker: Maker;
  order: number;
  state: State;
  /** What's missing, who it's waiting for, why it's not needed, or why it's out of date. */
  why: string | null;
  due: string | null;
  fix: Fix | null;
  docs: SlotDoc[];
  /** In the headline counts. */
  counted: boolean;
  /** Not for this job's technologies: folded away under "Not for this job". */
  hidden: boolean;
  /** Marked Not needed by the office (Restore offered). */
  office: SlotMark | null;
  reasons: string[];
  category: string;
};

const ELECTRICIAN = (c: StateCtx) => (c.electricianName ? `Waiting for ${c.electricianName.split(/\s+/)[0]} (electrician)` : 'Waiting for the electrician');
const dueWords = (ymd: string | null | undefined, rule: string) => (ymd ? `Due ${shortDay(ymd)} (${rule})` : null);

type Partial0 = { state: State; why?: string | null; due?: string | null; fix?: Fix | null };

/** A doc made from the latest inputs, or one changed after it went to the customer. */
function docsState(docs: SlotDoc[]): Partial0 {
  if (docs.some((d) => d.stale && d.visible)) return { state: 'stale', why: 'Changed after it went to the customer: regenerate it.' };
  return { state: 'complete' };
}

/** One of ours: its need, or the document made from it. A file the office uploaded instead counts too. */
function genState(code: SlotCode, docs: SlotDoc[], c: StateCtx): Partial0 {
  const uploaded = docs.filter((d) => d.source !== 'generated');
  const g = c.gen[code];
  if (uploaded.length) return docsState(uploaded);
  const mine = docs.filter((d) => d.source === 'generated');
  if (!g) return mine.length ? docsState(mine) : { state: 'missing', why: 'Not made yet.' };
  if (!g.ready) {
    // It went to the customer, but what it's made from no longer holds (a detail cleared since).
    if (mine.some((d) => d.visible)) return { state: 'stale', why: g.why, fix: g.fix ?? null };
    return { state: g.state, why: g.why, due: g.due ?? null, fix: g.fix ?? null };
  }
  const cur = mine.find((d) => d.key === code) ?? mine[0];
  if (!cur) return { state: 'missing', why: 'Not made yet: it’s made when you open this tab or build the pack.' };
  if (cur.hash !== g.hash) return { state: 'stale', why: cur.visible ? 'The details changed after it went to the customer: regenerate it.' : 'The details changed: it’s made again when you build the pack.' };
  return { state: 'complete' };
}

/** Made by the electrician's sign-off (Unit 2), or uploaded. */
function siteState(docs: SlotDoc[], c: StateCtx, made = true): Partial0 {
  if (docs.length) return docsState(docs);
  if (c.electrician === 'working') return { state: 'waiting', why: ELECTRICIAN(c) };
  if (c.electrician === 'signed')
    return made
      ? { state: 'missing', why: 'The electrician has signed off but it isn’t here. Upload it, or open the Site tab.', fix: 'upload' }
      : { state: 'missing', why: 'Upload it: the PAS 63100 wording isn’t in the app yet.', fix: 'upload' };
  return { state: 'missing', why: 'Add the electrician on the Site tab, or upload it.', fix: 'site' };
}

function stateFor(d: SlotDef, docs: SlotDoc[], c: StateCtx): Partial0 {
  const p = c.paperwork;
  switch (d.code) {
    case 'F43':
    case 'F44':
    case 'F44A':
    case 'F74':
    case 'F75':
      return siteState(docs, c);
    case 'F74A':
    case 'F74B':
      return siteState(docs, c, false);
    case 'CC21':
      if (docs.length) return docsState(docs);
      if (c.electrician === 'working') return { state: 'waiting', why: ELECTRICIAN(c) };
      return { state: 'missing', why: c.electrician === 'signed' ? 'Upload the electrical certificate.' : 'Upload the EIC, or add the electrician on the Site tab.', fix: 'upload' };
    case 'CC17':
      if (docs.length) return docsState(docs);
      if (p.mcs_cert_no) return { state: 'missing', why: `Upload the MCS certificate (${p.mcs_cert_no}).`, fix: 'upload' };
      if (c.commissioned) return { state: 'waiting', why: dueWords(c.due.mcs, '10 working days') ?? 'Register it in the MCS database.', due: c.due.mcs ?? null, fix: 'mid' };
      return { state: 'waiting', why: 'After the system is switched on.' };
    case 'CC16':
      if (docs.length) return docsState(docs);
      if (p.mcs_registered_on) return { state: 'missing', why: `Buy the guarantee and upload the policy.${c.due.cc16 ? ` ${dueWords(c.due.cc16, '7 days')}.` : ''}`, due: c.due.cc16 ?? null, fix: 'upload' };
      return { state: 'waiting', why: 'After the MCS certificate.' };
    case 'CC14':
      if (docs.length) return docsState(docs);
      if (p.building_regs_ref) return { state: 'waiting', why: `Notified${p.building_regs_on ? ` on ${shortDay(p.building_regs_on)}` : ''}, certificate to follow.` };
      if (!c.commissioned && c.electrician !== 'signed') return { state: 'waiting', why: 'After the electrician signs off.' };
      if (c.partPBy === 'self') return { state: 'waiting', why: `Waiting for ${c.electricianName?.split(/\s+/)[0] || 'the electrician'} to notify their scheme and send the reference.`, due: c.due.regs ?? null, fix: 'notify-bc' };
      return { state: 'missing', why: `Notify building control.${c.due.regs ? ` ${dueWords(c.due.regs, '30 days')}.` : ''}`, due: c.due.regs ?? null, fix: 'notify-bc' };
    case 'CC10':
      if (docs.length) return docsState(docs);
      return { state: 'missing', why: c.designDoc ? 'Upload the schematic, or use the design document on the job.' : 'Upload the schematic.', fix: 'upload' };
    case 'CC15':
      if (docs.length) return docsState(docs);
      return { state: 'missing', why: c.designDoc ? 'Upload the design calculations (or use the design document), or mark them not needed.' : 'Upload the design calculations, or mark them not needed.', fix: 'upload' };
    case 'CC5':
      if (!c.models.length) return { state: 'missing', why: 'Add the product models on Job details.', fix: 'job' };
      if (c.libraryGaps.length)
        return { state: 'missing', why: `No manual or datasheet for ${c.libraryGaps.join(', ')}: upload it once and every job with that model gets it.`, fix: 'library' };
      if (!docs.length) return { state: 'missing', why: 'Add the manuals from the library.', fix: 'library' };
      return docsState(docs);
    case 'CC13': {
      const invoices = docs.filter((x) => x.key !== 'CC13_RECEIPT');
      if (invoices.length && c.invoicePaid) return docsState(docs);
      if (invoices.length) return { state: 'waiting', why: 'Final invoice not paid yet.', fix: 'invoice' };
      return c.sent ? { state: 'missing', why: 'Upload the final invoice and send it.', fix: 'invoice' } : { state: 'waiting', why: 'After the handover pack goes.', fix: 'invoice' };
    }
    case 'F47': {
      if (!c.dnoRoute) return { state: 'missing', why: 'Choose the DNO route on Paperwork.', fix: 'paperwork' };
      const uploaded = docs.filter((x) => x.source !== 'generated');
      if (uploaded.length) return docsState(uploaded);
      const g = genState('F47', docs, c);
      if (g.state !== 'complete') return g;
      if (!c.dnoNotified) return { state: 'missing', why: `Send it to the DNO, then mark it sent.${c.due.g98 ? ` ${dueWords(c.due.g98, '28 days')}.` : ''}`, due: c.due.g98 ?? null, fix: 'dno-sent' };
      return g;
    }
    case 'F76': {
      if (!c.dnoRoute) return { state: 'missing', why: 'Choose the DNO route on Paperwork.', fix: 'paperwork' };
      const parts = new Set(docs.map((x) => x.part).filter(Boolean));
      const need = [!parts.has('acceptance') && 'the DNO’s acceptance', !parts.has('installation') && 'the installation document'].filter(Boolean) as string[];
      if (!need.length) return docsState(docs);
      if (!docs.length && c.dnoSubmitted) return { state: 'waiting', why: 'Application sent, waiting for the DNO.', fix: 'upload' };
      return { state: 'missing', why: docs.length ? `Still to upload: ${need.join(' and ')}.` : 'Upload the G99 application, the DNO’s acceptance and the installation document.', fix: 'upload' };
    }
    case 'CCMH':
      return docs.length ? docsState(docs) : { state: 'na', why: 'Optional: nothing extra added.' };
    default:
      return genState(d.code, docs, c);
  }
}

const techFits = (d: SlotDef, c: AppliesCtx) => !d.tech.length || d.tech.some((t) => c.products.includes(t));

/** Every item of the owner's list on this job, in pack order. */
export function slotStates(c: StateCtx): SlotView[] {
  return PACK_ITEMS.map((d) => {
    const docs = c.docs.filter((x) => x.slot === d.code);
    const auto = d.applies(c);
    const mark = c.marks[d.code];
    const base = {
      code: d.code,
      title: d.title,
      customer: d.customer,
      group: d.group,
      tech: d.tech,
      kind: d.kind,
      maker: d.maker,
      order: d.order,
      docs,
      reasons: d.reasons ?? [],
      category: d.category,
    };
    if (auto) return { ...base, state: 'na' as const, why: auto, due: null, fix: null, counted: !d.optional, hidden: !techFits(d, c), office: null };
    if (mark?.na) return { ...base, state: 'na' as const, why: mark.reason || 'Not needed', due: null, fix: null, counted: !d.optional, hidden: false, office: mark };
    const s = stateFor(d, docs, c);
    return { ...base, state: s.state, why: s.why ?? null, due: s.due ?? null, fix: s.fix ?? null, counted: !d.optional, hidden: false, office: null };
  }).sort((a, b) => a.order - b.order);
}

export type Headline = { complete: number; total: number; waiting: number; missing: number; stale: number; na: number; words: string };

/**
 * "18 of 23 complete · 3 waiting · 2 missing · 2 not needed": complete against everything that
 * applies (Not needed is listed after, not counted in the total). Items not for this job's
 * technologies and the optional extras aren't counted at all.
 */
export function headline(views: SlotView[]): Headline {
  const shown = views.filter((v) => !v.hidden && v.counted);
  const n = (s: State) => shown.filter((v) => v.state === s).length;
  const na = n('na');
  const complete = n('complete');
  const total = shown.filter((v) => v.state !== 'na').length;
  const parts = [`${complete} of ${total} complete`, n('waiting') && `${n('waiting')} waiting`, n('missing') && `${n('missing')} missing`, n('stale') && `${n('stale')} out of date`, na && `${na} not needed`];
  return { complete, total, waiting: n('waiting'), missing: n('missing'), stale: n('stale'), na, words: parts.filter(Boolean).join(' · ') };
}

/**
 * Can the pack go to the customer (D23)? Every site document for the job's technologies Complete;
 * the office's own (MCS certificate, guarantee, Building Control, paid invoice) and the rest can
 * follow, shown as "On its way". `blocking` lists what stops it, `following` what will follow.
 */
export function sendCheck(views: SlotView[]): { ok: boolean; blocking: SlotView[]; following: SlotView[] } {
  const open = views.filter((v) => !v.hidden && v.counted && v.state !== 'complete' && v.state !== 'na');
  const blocking = open.filter((v) => SITE_SLOTS.includes(v.code));
  return { ok: blocking.length === 0, blocking, following: open.filter((v) => !SITE_SLOTS.includes(v.code)) };
}

/** What the customer sees for an item: its documents, "On its way", or nothing (not needed). */
export function customerState(v: SlotView): 'ready' | 'coming' | null {
  if (v.hidden || v.state === 'na') return v.docs.some((d) => d.visible) ? 'ready' : null;
  if (v.docs.some((d) => d.visible)) return 'ready';
  return v.counted ? 'coming' : null;
}

/** The contents groups in pack order, each with its items (cover first, not in a group). */
export function contentsGroups<T extends { group: Group; order: number }>(items: T[]): { key: Exclude<Group, 'cover'>; title: string; items: T[] }[] {
  return GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.group === g.key).sort((a, b) => a.order - b.order) })).filter((g) => g.items.length);
}

/* ── Product models and the library (CC4, CC5) ───────────────────────────── */

/** Model names compared ignoring case, spaces and dashes ("GIV-AIO 13.5" = "giv aio13.5"). */
export const modelKey = (s: string | null | undefined) => String(s ?? '').toLowerCase().replace(/[\s\-_–—]+/g, '');
