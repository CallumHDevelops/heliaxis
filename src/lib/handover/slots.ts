/**
 * The customer handover pack's catalogue (SPEC 4.1, HANDOVER 1; codes and titles: CODE-MAP): every
 * document in the pack, by Heliaxis's own code (HX-HO-01 … HX-HO-19, HX-PV-01 … HX-PV-03, HX-BAT-01 …
 * HX-BAT-04), plus the combined PACK, each with the customer's one plain line, its contents group, the technologies it belongs to, who makes it, its place in the pack and
 * when it isn't needed. Then each item's state on a job (D7: Complete, Missing, Waiting, Not needed,
 * Out of date), the headline ("18 of 23 complete · 3 waiting · 2 missing · 2 not needed"), whether
 * the pack can go to the customer yet (D23) and the contents in customer order (HANDOVER 2.6).
 *
 * Pure apart from one date helper, so the Handover tab, the server, the customer portal and
 * scripts/test-handover-slots.mjs all read the same rules.
 */
import { shortDay } from '../projects/deadlines';
import { PAS63100 } from '../site/fixed/pas63100';

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
  | 'HX-HO-01'
  | 'HX-HO-02'
  | 'HX-HO-03'
  | 'HX-HO-04'
  | 'HX-HO-05'
  | 'HX-HO-06'
  | 'HX-HO-07'
  | 'HX-HO-08'
  | 'HX-HO-09'
  | 'HX-HO-10'
  | 'HX-HO-11'
  | 'HX-HO-12'
  | 'HX-HO-13'
  | 'HX-HO-14'
  | 'HX-HO-15'
  | 'HX-HO-16'
  | 'HX-HO-17'
  | 'HX-HO-18'
  | 'HX-HO-19'
  | 'HX-PV-01'
  | 'HX-PV-02'
  | 'HX-PV-03'
  | 'HX-BAT-01'
  | 'HX-BAT-02'
  | 'HX-BAT-03'
  | 'HX-BAT-04'
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
  /** Heliaxis's title (CODE-MAP). */
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
/** The G98 notice for G98 jobs, the G99 papers for G99 ones. No route chosen yet: it applies (and asks for the route). */
const route = (want: 'g98' | 'g99') => (c: AppliesCtx) => pvOrBattery(c) ?? (c.dnoRoute && c.dnoRoute !== want ? (ROUTE_WORDS[c.dnoRoute] ?? 'Not this job’s DNO route') : null);
const EXISTING = 'Battery added to an existing system: the existing one still applies';
const PAS_SCOPE = ['Not a dwelling', 'Dwelling over 200 m²', 'Battery connected before the meter', 'Second-life battery'];

export const SLOTS: SlotDef[] = [
  {
    code: 'HX-HO-01',
    title: 'Covering letter',
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
    code: 'HX-HO-02',
    title: 'System summary and sign-off',
    customer: 'What we installed and its ratings, the records behind it, and who signed it off.',
    group: 'certificates',
    tech: ['solar', 'battery'],
    kind: 'G',
    maker: 'pack',
    order: 20,
    applies: pvOrBattery,
    category: 'handover',
  },
  {
    code: 'HX-HO-03',
    title: 'MCS certificate',
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
    code: 'HX-HO-04',
    title: 'Electrical certificate',
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
    code: 'HX-BAT-04',
    title: 'Battery location statement (PAS 63100)',
    customer: 'Our signed statement that your battery’s location and installation follow PAS 63100.',
    group: 'certificates',
    tech: ['battery'],
    kind: 'C',
    maker: 'site',
    order: 45,
    applies: pas,
    reasons: PAS_SCOPE,
    category: 'certificate',
    pick: 'Battery location statement (PAS 63100)',
  },
  {
    code: 'HX-HO-05',
    title: 'Building Regulations certificate',
    customer: 'Shows the electrical work was notified to Building Control, as the Building Regulations ask.',
    group: 'certificates',
    tech: [],
    kind: 'C',
    maker: 'office',
    order: 50,
    applies: any,
    reasons: [EXISTING],
    category: 'certificate',
    pick: 'Building Regulations certificate',
  },
  {
    code: 'HX-HO-06',
    title: 'Heliaxis workmanship warranty',
    customer: 'Our warranty on the work we did.',
    group: 'warranties',
    tech: [],
    kind: 'G',
    maker: 'pack',
    order: 60,
    applies: any,
    category: 'warranty',
  },
  {
    code: 'HX-HO-07',
    title: 'Warranty insurance',
    customer: 'The insurance that backs our warranty if we ever stopped trading.',
    group: 'warranties',
    tech: ['solar', 'battery', 'heatpump'],
    kind: 'C',
    maker: 'office',
    order: 70,
    applies: mcs,
    category: 'warranty',
    pick: 'Warranty insurance policy',
  },
  {
    code: 'HX-HO-08',
    title: 'Completion sign-off',
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
    code: 'HX-HO-09',
    title: 'Switching your system off and on',
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
    code: 'HX-HO-10',
    title: 'Solar estimate, shading and care',
    customer: 'Your yearly generation estimate, the shading on your roof and the simple checks you can do.',
    group: 'using',
    tech: ['solar'],
    kind: 'G',
    maker: 'pack',
    order: 100,
    applies: solar,
    category: 'handover',
    pick: 'Solar estimate, shading and care',
  },
  {
    code: 'HX-HO-11',
    title: 'Maintenance schedule',
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
    code: 'HX-HO-12',
    title: 'Your maintenance plan',
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
    code: 'HX-HO-13',
    title: 'Wiring diagram',
    customer: 'A drawing of how your system is wired.',
    group: 'design',
    tech: ['solar', 'battery'],
    kind: 'C',
    maker: 'office',
    order: 130,
    applies: pvOrBattery,
    reasons: [EXISTING],
    category: 'design',
    pick: 'Wiring diagram (schematic)',
  },
  {
    code: 'HX-HO-14',
    title: 'System design calculations',
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
    code: 'HX-PV-02',
    title: 'Solar PV string test results',
    customer: 'The readings taken on each string of your solar panels before the system was switched on.',
    group: 'tests',
    tech: ['solar'],
    kind: 'G',
    maker: 'site',
    order: 150,
    applies: solar,
    category: 'commissioning',
  },
  {
    code: 'HX-PV-01',
    title: 'Solar PV inspection record',
    customer: 'Our electrician’s inspection of your solar installation.',
    group: 'tests',
    tech: ['solar'],
    kind: 'G',
    maker: 'site',
    order: 160,
    applies: solar,
    category: 'commissioning',
  },
  {
    code: 'HX-PV-03',
    title: 'Solar PV switch-on record',
    customer: 'The checks made when your solar system was first switched on.',
    group: 'tests',
    tech: ['solar'],
    kind: 'G',
    maker: 'site',
    order: 170,
    applies: solar,
    category: 'commissioning',
  },
  {
    code: 'HX-BAT-01',
    title: 'Battery inspection record',
    customer: 'Our electrician’s checks on your battery installation before it was switched on.',
    group: 'tests',
    tech: ['battery'],
    kind: 'G',
    maker: 'site',
    order: 180,
    applies: battery,
    category: 'commissioning',
  },
  {
    code: 'HX-BAT-02',
    title: 'Battery switch-on and test record',
    customer: 'The tests made when your battery was switched on.',
    group: 'tests',
    tech: ['battery'],
    kind: 'G',
    maker: 'site',
    order: 190,
    applies: battery,
    category: 'commissioning',
  },
  {
    code: 'HX-BAT-03',
    title: 'Battery location check (PAS 63100)',
    customer: 'Our checks on where your battery is fitted, against PAS 63100, the fire safety specification for home batteries.',
    group: 'tests',
    tech: ['battery'],
    kind: 'C',
    maker: 'site',
    order: 200,
    applies: pas,
    reasons: PAS_SCOPE,
    category: 'commissioning',
    pick: 'Battery location check (PAS 63100)',
  },
  {
    code: 'HX-HO-15',
    title: 'Grid notice (G98)',
    customer: 'The notice that tells your electricity network (DNO) about your new system.',
    group: 'grid',
    tech: ['solar', 'battery'],
    // Done in the office (owner decision 9): the form as it went to the DNO, uploaded. The G98 data
    // sheet the app makes is the office's helper for filling it in, never in the pack.
    kind: 'C',
    maker: 'office',
    order: 210,
    applies: route('g98'),
    category: 'dno',
    pick: 'G98 notice as sent',
  },
  {
    code: 'HX-HO-16',
    title: 'Grid connection papers (G99)',
    customer: 'Your electricity network’s (DNO’s) approval for your system, and what was sent to them.',
    group: 'grid',
    tech: ['solar', 'battery'],
    kind: 'C',
    maker: 'office',
    order: 220,
    applies: route('g99'),
    category: 'dno',
    pick: 'G99 papers',
  },
  {
    code: 'HX-HO-17',
    title: 'Product manuals and warranties',
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
    code: 'HX-HO-18',
    title: 'Invoice and receipt',
    customer: 'Your paid invoice and receipt.',
    group: 'invoices',
    tech: [],
    kind: 'C',
    maker: 'office',
    order: 240,
    applies: any,
    category: 'invoice',
    pick: 'Final invoice',
  },
  {
    code: 'HX-HO-19',
    title: 'Other useful documents',
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
    title: 'Your handover pack (one PDF)',
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
/** Every item of the pack, without the combined PACK. */
export const PACK_ITEMS = SLOTS.filter((s) => s.code !== 'PACK');
/** "Which is it?" for + Add a document, ending with Something else. */
export const UPLOAD_PICKS = PACK_ITEMS.filter((s) => s.pick).sort((a, b) => (a.code === 'HX-HO-19' ? 1 : b.code === 'HX-HO-19' ? -1 : 0));

/** The documents the electrician's sign-off and certificate make: all of them Complete before Send (D23). */
export const SITE_SLOTS: SlotCode[] = ['HX-PV-01', 'HX-PV-02', 'HX-PV-03', 'HX-BAT-01', 'HX-BAT-02', 'HX-BAT-03', 'HX-BAT-04', 'HX-HO-02', 'HX-HO-04'];
/** Chased by the office after the pack goes ("On its way"). */
export const FOLLOW_SLOTS: SlotCode[] = ['HX-HO-18', 'HX-HO-05', 'HX-HO-07', 'HX-HO-03'];

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
  /** generated_key: versions of one generated document share it (HX-HO-02, HX-HO-18-RECEIPT…). */
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
  /** HX-HO-16: which G99 paper it is (application · acceptance · installation · g100). */
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
  /** What the EIC made in the app still waits for from the office (its design part), once they've signed off. */
  certWaits?: string | null;
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
function siteState(docs: SlotDoc[], c: StateCtx): Partial0 {
  if (docs.length) return docsState(docs);
  if (c.electrician === 'working') return { state: 'waiting', why: ELECTRICIAN(c) };
  if (c.electrician === 'signed') return { state: 'missing', why: 'The electrician has signed off but it isn’t here. Upload it, or open the Site tab.', fix: 'upload' };
  return { state: 'missing', why: 'Add the electrician on the Site tab, or upload it.', fix: 'site' };
}

function stateFor(d: SlotDef, docs: SlotDoc[], c: StateCtx): Partial0 {
  const p = c.paperwork;
  switch (d.code) {
    case 'HX-PV-01':
    case 'HX-PV-02':
    case 'HX-PV-03':
    case 'HX-BAT-01':
    case 'HX-BAT-02':
      return siteState(docs, c);
    case 'HX-BAT-03':
    case 'HX-BAT-04':
      // The app can't make them until PAS 63100's own wording is in (fixed/pas63100.ts): the office uploads them, nothing waits for site.
      if (PAS63100.verified) return siteState(docs, c);
      return docs.length ? docsState(docs) : { state: 'missing', why: 'Upload it for now: the app’s PAS 63100 checks haven’t been matched to the PAS yet.', fix: 'upload' };
    case 'HX-HO-04':
      if (docs.length) return docsState(docs);
      if (c.electrician === 'working') return { state: 'waiting', why: ELECTRICIAN(c) };
      if (c.electrician === 'signed' && c.certWaits) return { state: 'missing', why: c.certWaits, fix: 'site' };
      return { state: 'missing', why: c.electrician === 'signed' ? 'Upload the electrical certificate.' : 'Upload the EIC, or add the electrician on the Site tab.', fix: 'upload' };
    case 'HX-HO-03':
      if (docs.length) return docsState(docs);
      if (p.mcs_cert_no) return { state: 'missing', why: `Upload the MCS certificate (${p.mcs_cert_no}).`, fix: 'upload' };
      if (c.commissioned) return { state: 'waiting', why: dueWords(c.due.mcs, '10 working days') ?? 'Register it in the MCS database.', due: c.due.mcs ?? null, fix: 'mid' };
      return { state: 'waiting', why: 'After the system is switched on.' };
    case 'HX-HO-07':
      if (docs.length) return docsState(docs);
      // Once the MCS certificate is in (registered, its number saved or the certificate uploaded).
      if (p.mcs_registered_on || p.mcs_cert_no || c.docs.some((x) => x.slot === 'HX-HO-03'))
        return { state: 'missing', why: `Buy the warranty insurance and upload the policy.${c.due.cc16 ? ` ${dueWords(c.due.cc16, '7 days')}.` : ''}`, due: c.due.cc16 ?? null, fix: 'upload' };
      return { state: 'waiting', why: 'After the MCS certificate.' };
    case 'HX-HO-05':
      if (docs.length) return docsState(docs);
      if (p.building_regs_ref) return { state: 'waiting', why: `Notified${p.building_regs_on ? ` on ${shortDay(p.building_regs_on)}` : ''}, certificate to follow.` };
      if (!c.commissioned && c.electrician !== 'signed') return { state: 'waiting', why: 'After the electrician signs off.' };
      if (c.partPBy === 'self') return { state: 'waiting', why: `Waiting for ${c.electricianName?.split(/\s+/)[0] || 'the electrician'} to notify their scheme and send the reference.`, due: c.due.regs ?? null, fix: 'notify-bc' };
      return { state: 'missing', why: `Notify building control.${c.due.regs ? ` ${dueWords(c.due.regs, '30 days')}.` : ''}`, due: c.due.regs ?? null, fix: 'notify-bc' };
    case 'HX-HO-13':
      if (docs.length) return docsState(docs);
      return { state: 'missing', why: c.designDoc ? 'Upload the wiring diagram, or use the design document on the job.' : 'Upload the wiring diagram.', fix: 'upload' };
    case 'HX-HO-14':
      if (docs.length) return docsState(docs);
      return { state: 'missing', why: c.designDoc ? 'Upload the design calculations (or use the design document), or mark them not needed.' : 'Upload the design calculations, or mark them not needed.', fix: 'upload' };
    case 'HX-HO-17':
      if (!c.models.length) return { state: 'missing', why: 'Add the product models on Job details.', fix: 'job' };
      if (c.libraryGaps.length)
        return { state: 'missing', why: `No manual or datasheet for ${c.libraryGaps.join(', ')}: upload it once and every job with that model gets it.`, fix: 'library' };
      if (!docs.length) return { state: 'missing', why: 'Add the manuals from the library.', fix: 'library' };
      return docsState(docs);
    case 'HX-HO-18': {
      const invoices = docs.filter((x) => x.key !== 'HX-HO-18-RECEIPT');
      if (invoices.length && c.invoicePaid) return docsState(docs);
      if (invoices.length) return { state: 'waiting', why: 'Final invoice not paid yet.', fix: 'invoice' };
      return c.sent ? { state: 'missing', why: 'Upload the final invoice and send it.', fix: 'invoice' } : { state: 'waiting', why: 'After the handover pack goes.', fix: 'invoice' };
    }
    case 'HX-HO-15': {
      // An office upload (OWNER-DECISIONS 9): the notice as it went to the DNO (uploading it ticks the G98 notice as sent). The G98 data sheet helps fill it in.
      if (!c.dnoRoute) return { state: 'missing', why: 'Choose the DNO route on Paperwork.', fix: 'paperwork' };
      if (docs.length) return docsState(docs);
      if (!c.commissioned) return { state: 'waiting', why: 'After the system is switched on.' };
      return { state: 'missing', why: `Upload the G98 notice as it was sent to the DNO.${c.due.g98 ? ` ${dueWords(c.due.g98, '28 days')}.` : ''}`, due: c.due.g98 ?? null, fix: 'upload' };
    }
    case 'HX-HO-16': {
      if (!c.dnoRoute) return { state: 'missing', why: 'Choose the DNO route on Paperwork.', fix: 'paperwork' };
      const parts = new Set(docs.map((x) => x.part).filter(Boolean));
      const need = [!parts.has('acceptance') && 'the DNO’s acceptance', !parts.has('installation') && 'the installation document'].filter(Boolean) as string[];
      if (!need.length) return docsState(docs);
      if (!docs.length && c.dnoSubmitted) return { state: 'waiting', why: 'Application sent, waiting for the DNO.', fix: 'upload' };
      return { state: 'missing', why: docs.length ? `Still to upload: ${need.join(' and ')}.` : 'Upload the G99 application, the DNO’s acceptance and the installation document.', fix: 'upload' };
    }
    case 'HX-HO-19':
      return docs.length ? docsState(docs) : { state: 'na', why: 'Optional: nothing extra added.' };
    case 'HX-HO-09':
      // The switching-off page makes it Complete; the manufacturers' procedures from the library go with it.
      return genState('HX-HO-09', docs.filter((x) => x.source !== 'library'), c);
    default:
      return genState(d.code, docs, c);
  }
}

const techFits = (d: SlotDef, c: AppliesCtx) => !d.tech.length || d.tech.some((t) => c.products.includes(t));

/** Every item of the pack on this job, in pack order. */
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
 * the office's own (MCS certificate, warranty insurance, Building Regulations, invoice) and the rest can
 * follow, shown as "On its way". `blocking` lists what stops it, `following` what will follow.
 */
export function sendCheck(views: SlotView[]): { ok: boolean; blocking: SlotView[]; following: SlotView[] } {
  const open = views.filter((v) => !v.hidden && v.counted && v.state !== 'complete' && v.state !== 'na');
  const blocking = open.filter((v) => SITE_SLOTS.includes(v.code));
  return { ok: blocking.length === 0, blocking, following: open.filter((v) => !SITE_SLOTS.includes(v.code)) };
}

/**
 * Who an item that holds Send up is waiting on: the site (the electrician hasn't finished: Waiting),
 * or the office (an upload, the design signature, a detail to fill in, the Site tab's design part).
 */
export const waitsOn = (v: SlotView): 'site' | 'office' => (v.state === 'waiting' ? 'site' : 'office');

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

/* ── Product models and the library (switching off, product manuals) ───────── */

/** Model names compared ignoring case, spaces and dashes ("GIV-AIO 13.5" = "giv aio13.5"). */
export const modelKey = (s: string | null | undefined) => String(s ?? '').toLowerCase().replace(/[\s\-_–—]+/g, '');
