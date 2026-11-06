/**
 * The In-House pack's catalogue: the internal record kept against every project, by Heliaxis's own
 * code (HX-IH-01 … HX-IH-15), the same way the customer handover pack is catalogued
 * (handover/slots.ts). Each item has a title, its contents group, who makes it, when it doesn't
 * apply and its place in the pack, then its state on a job: Complete, Missing, Waiting, Not needed.
 *
 * INTERNAL. Nothing here is ever sent to a customer: the In-House pack is built by an admin-only
 * route and every page carries the "Internal, not for customers" mark (documents/inhouse/).
 *
 * The codes and titles are provisional until the owner approves them in the CODE-MAP (the quality
 * system's own list, which lives outside this repo); documents/issue.ts holds each one's issue.
 *
 * Pure: no I/O, so the project's In-House tab, the pack builder and the tests all read the same
 * rules. The RAMS items read a summary of the project's RAMS (rams-facts below), which the RAMS
 * module produces from its own tables; nothing here knows about the database.
 */
import { STATE_LABEL, TECH_LABEL, type SlotDoc, type SlotMark, type State, type Tech } from '../handover/slots';
import { isSignedOff, type RamsStatus, type RamsSummary } from '../rams/workflow';

export { STATE_LABEL, TECH_LABEL };
export type { SlotDoc, SlotMark, State, Tech };

/** G: we make it from job data · C: collected (uploaded: someone else issues it) · R: from the project's RAMS. */
export type SlotKind = 'G' | 'C' | 'R';
/** Who makes it: this pack's own generators, the RAMS module, or the office (upload). */
export type Maker = 'pack' | 'rams' | 'office';

export type Group = 'cover' | 'project' | 'site' | 'purchasing' | 'safety' | 'evidence' | 'forms' | 'other';
/** The contents page's groups, in pack order (the cover sheet comes before them). */
export const GROUPS: { key: Exclude<Group, 'cover'>; title: string }[] = [
  { key: 'project', title: 'Project record' },
  { key: 'site', title: 'Survey and design' },
  { key: 'purchasing', title: 'Purchasing and delivery' },
  { key: 'safety', title: 'Health and safety (RAMS)' },
  { key: 'evidence', title: 'Evidence of the work' },
  { key: 'forms', title: 'Forms, only if needed' },
  { key: 'other', title: 'Other' },
];

export type SlotCode =
  | 'HX-IH-01'
  | 'HX-IH-02'
  | 'HX-IH-03'
  | 'HX-IH-04'
  | 'HX-IH-05'
  | 'HX-IH-06'
  | 'HX-IH-07'
  | 'HX-IH-08'
  | 'HX-IH-09'
  | 'HX-IH-10'
  | 'HX-IH-11'
  | 'HX-IH-12'
  | 'HX-IH-13'
  | 'HX-IH-14'
  | 'HX-IH-15'
  | 'HX-IH-16'
  | 'HX-IH-17'
  | 'HX-IH-18'
  | 'HX-IH-19'
  | 'HX-IH-20';

/** What applies() looks at: the job's technologies and where the site is. */
export type AppliesCtx = { products: string[]; /** The site's postcode: decides which nation's rules apply. */ postcode?: string | null };

/** Postcode areas in Scotland. A few areas straddle the border, so the office can mark an item Not needed. */
const SCOTTISH_AREAS = new Set(['AB', 'DD', 'DG', 'EH', 'FK', 'G', 'HS', 'IV', 'KA', 'KW', 'KY', 'ML', 'PA', 'PH', 'TD', 'ZE']);
/** The nation a site is in, from its postcode area. No postcode (or one that isn't Scottish) is England and Wales. */
export function nationOf(postcode: string | null | undefined): 'scotland' | 'england_wales' {
  const area = /^[A-Z]{1,2}/.exec(String(postcode ?? '').trim().toUpperCase())?.[0] ?? '';
  // The leading letters are the area: "G1 1AA" gives G (Glasgow), "GL1 1AA" gives GL (Gloucester).
  return SCOTTISH_AREAS.has(area) ? 'scotland' : 'england_wales';
}

export type SlotDef = {
  code: SlotCode;
  title: string;
  /** One plain line for the office: what the document is for. */
  purpose: string;
  group: Group;
  /** The technologies it belongs to. Empty: every job. */
  tech: Tech[];
  kind: SlotKind;
  maker: Maker;
  /** Place in the combined pack. */
  order: number;
  /** Null when it applies; otherwise why it isn't needed (automatic). */
  applies: (c: AppliesCtx) => string | null;
  /** Extras: never Missing, never counted ("only if needed" forms). */
  optional?: boolean;
  /** Where an upload into it is filed (crm_documents.category). */
  category: string;
  /** "Which is it?" on + Add a document. */
  pick?: string;
};

const has = (c: AppliesCtx, ...t: Tech[]) => t.some((x) => c.products.includes(x));
const any = () => null;
const pvOrBattery = (c: AppliesCtx) => (has(c, 'solar', 'battery') ? null : 'No solar or battery on this job');
const heatPump = (c: AppliesCtx) => (has(c, 'heatpump') ? null : 'No heat pump on this job');
const noiseEnglandWales = (c: AppliesCtx) => heatPump(c) ?? (nationOf(c.postcode) === 'scotland' ? 'In Scotland: the Scotland calculation applies' : null);
const noiseScotland = (c: AppliesCtx) => heatPump(c) ?? (nationOf(c.postcode) === 'scotland' ? null : 'Not in Scotland');

export const SLOTS: SlotDef[] = [
  {
    code: 'HX-IH-01',
    title: 'Cover sheet',
    purpose: 'The project, the customer, who is on it and what is in this pack. Internal.',
    group: 'cover',
    tech: [],
    kind: 'G',
    maker: 'pack',
    order: 10,
    applies: any,
    category: 'inhouse',
  },
  {
    code: 'HX-IH-02',
    title: 'Enquiry record',
    purpose: 'How the enquiry came in and what the customer asked for.',
    group: 'project',
    tech: [],
    kind: 'G',
    maker: 'pack',
    order: 20,
    applies: any,
    category: 'inhouse',
  },
  {
    code: 'HX-IH-03',
    title: 'Survey record',
    purpose: 'The site survey: roof, electrics and anything found that changes the design.',
    group: 'site',
    tech: ['solar', 'battery'],
    kind: 'G',
    maker: 'pack',
    order: 30,
    applies: pvOrBattery,
    category: 'survey',
    pick: 'Survey record',
  },
  {
    code: 'HX-IH-16',
    title: 'Heat pump survey record',
    purpose: 'The site survey for the heat pump.',
    group: 'site',
    tech: ['heatpump'],
    kind: 'C',
    maker: 'office',
    order: 32,
    applies: heatPump,
    category: 'survey',
    pick: 'Heat pump survey record',
  },
  {
    code: 'HX-IH-17',
    title: 'Room survey record',
    purpose: 'The room-by-room survey, if one was done.',
    group: 'site',
    tech: ['heatpump'],
    kind: 'C',
    maker: 'office',
    order: 34,
    applies: heatPump,
    optional: true,
    category: 'survey',
    pick: 'Room survey record',
  },
  {
    code: 'HX-IH-18',
    title: 'ASHP noise calculation (England and Wales)',
    purpose: 'The air source heat pump noise level calculation for a site in England or Wales.',
    group: 'site',
    tech: ['heatpump'],
    kind: 'C',
    maker: 'office',
    order: 36,
    applies: noiseEnglandWales,
    category: 'design',
    pick: 'ASHP noise calculation (England and Wales)',
  },
  {
    code: 'HX-IH-19',
    title: 'ASHP noise calculation (Scotland)',
    purpose: 'The air source heat pump noise level calculation for a site in Scotland.',
    group: 'site',
    tech: ['heatpump'],
    kind: 'C',
    maker: 'office',
    order: 38,
    applies: noiseScotland,
    category: 'design',
    pick: 'ASHP noise calculation (Scotland)',
  },
  {
    code: 'HX-IH-04',
    title: 'Structural survey and calculations',
    purpose: 'The structural report and its calculations for the roof or mounting.',
    group: 'site',
    tech: ['solar'],
    kind: 'C',
    maker: 'office',
    order: 40,
    applies: (c) => (has(c, 'solar') ? null : 'No solar panels on this job'),
    category: 'structural',
    pick: 'Structural survey and calculations',
  },
  {
    code: 'HX-IH-05',
    title: 'Purchase orders',
    purpose: 'Every purchase order raised for this project, materials and labour.',
    group: 'purchasing',
    tech: [],
    kind: 'G',
    maker: 'pack',
    order: 50,
    applies: any,
    category: 'inhouse',
  },
  {
    code: 'HX-IH-06',
    title: 'Delivery notes and material invoices',
    purpose: 'What was delivered, and the suppliers’ invoices for it.',
    group: 'purchasing',
    tech: [],
    kind: 'C',
    maker: 'office',
    order: 60,
    applies: any,
    category: 'delivery',
    pick: 'Delivery note or material invoice',
  },
  {
    code: 'HX-IH-07',
    title: 'Risk assessment and method statements (RAMS)',
    purpose: 'The project’s RAMS, signed off by a project admin before any trade is sent it.',
    group: 'safety',
    tech: [],
    kind: 'R',
    maker: 'rams',
    order: 70,
    applies: any,
    category: 'rams',
  },
  {
    code: 'HX-IH-08',
    title: 'RAMS trade sign-off record',
    purpose: 'Which trades have read and signed the RAMS, and when.',
    group: 'safety',
    tech: [],
    kind: 'R',
    maker: 'rams',
    order: 80,
    applies: any,
    category: 'rams',
  },
  {
    code: 'HX-IH-09',
    title: 'Project photographs',
    purpose: 'The site photo record: before, during and after.',
    group: 'evidence',
    tech: [],
    kind: 'G',
    maker: 'pack',
    order: 90,
    applies: any,
    category: 'photo',
    pick: 'Project photographs',
  },
  {
    code: 'HX-IH-10',
    title: 'Variation of contract',
    purpose: 'A change to what was agreed, signed by the customer.',
    group: 'forms',
    tech: [],
    kind: 'C',
    maker: 'office',
    order: 100,
    applies: any,
    optional: true,
    category: 'inhouse-form',
    pick: 'Variation of contract',
  },
  {
    code: 'HX-IH-11',
    title: 'Customer complaint record',
    purpose: 'A complaint, what was done about it and how it was closed.',
    group: 'forms',
    tech: [],
    kind: 'C',
    maker: 'office',
    order: 110,
    applies: any,
    optional: true,
    category: 'inhouse-form',
    pick: 'Customer complaint record',
  },
  {
    code: 'HX-IH-12',
    title: 'Non-conformity record',
    purpose: 'Work that didn’t meet the standard, and how it was put right.',
    group: 'forms',
    tech: [],
    kind: 'C',
    maker: 'office',
    order: 120,
    applies: any,
    optional: true,
    category: 'inhouse-form',
    pick: 'Non-conformity record',
  },
  {
    code: 'HX-IH-13',
    title: 'Overstay record',
    purpose: 'Time on site beyond what was planned, and why.',
    group: 'forms',
    tech: [],
    kind: 'C',
    maker: 'office',
    order: 130,
    applies: any,
    optional: true,
    category: 'inhouse-form',
    pick: 'Overstay record',
  },
  {
    code: 'HX-IH-14',
    title: 'Letter of authority',
    purpose: 'The customer’s written authority for us to act for them.',
    group: 'forms',
    tech: ['solar', 'battery'],
    kind: 'C',
    maker: 'office',
    order: 140,
    applies: pvOrBattery,
    optional: true,
    category: 'inhouse-form',
    pick: 'Letter of authority',
  },
  {
    code: 'HX-IH-20',
    title: 'EPVS registration',
    purpose: 'The EPVS registration, if one applies.',
    group: 'other',
    tech: ['heatpump'],
    kind: 'C',
    maker: 'office',
    order: 145,
    applies: heatPump,
    optional: true,
    category: 'registration',
    pick: 'EPVS registration',
  },
  {
    code: 'HX-IH-15',
    title: 'Miscellaneous contract documents',
    purpose: 'Anything else that belongs with this contract.',
    group: 'other',
    tech: [],
    kind: 'C',
    maker: 'office',
    order: 150,
    applies: any,
    optional: true,
    category: 'inhouse',
    pick: 'Other contract document',
  },
];

const BY_CODE = new Map<SlotCode, SlotDef>(SLOTS.map((s) => [s.code, s]));
export const slotDef = (code: string) => BY_CODE.get(code as SlotCode);
export const isSlot = (code: unknown): code is SlotCode => typeof code === 'string' && BY_CODE.has(code as SlotCode);
/** The office's uploads: "+ Add a document" offers these. */
export const UPLOAD_PICKS = SLOTS.filter((s) => s.pick);
/** The items a document can be filed against by hand. */
export const UPLOAD_SLOTS: SlotCode[] = SLOTS.filter((s) => s.kind === 'C').map((s) => s.code);

/* ── The project's RAMS, as this pack sees it ─────────────────────────────── */

/**
 * The project's RAMS as this pack reads it: the current version of each document (superseded ones
 * left out) and which trades have been sent it and have signed. rams/workflow.ts owns the rules and
 * builds this (summarise).
 */
export type RamsFacts = RamsSummary;
export type { RamsStatus };
export const NO_RAMS: RamsFacts = { documents: [], trades: [] };

/** The RAMS is signed off once a project admin has approved it (approved, then issued). */
export const ramsSignedOff = (r: RamsFacts) => r.documents.length > 0 && r.documents.every((d) => isSignedOff(d.status));

/* ── States ──────────────────────────────────────────────────────────────── */

/** The button a row offers for what it still needs. */
export type Fix = 'job' | 'upload' | 'rams' | 'orders' | 'survey' | 'photos';

export type StateCtx = AppliesCtx & {
  /** The project's current In-House documents (archived ones left out). */
  docs: SlotDoc[];
  /** Office Not needed marks. */
  marks: Partial<Record<string, SlotMark>>;
  rams: RamsFacts;
  /** A survey record exists on the project. */
  surveyed: boolean;
  /** Purchase orders raised on the project (any status but cancelled). */
  orders: number;
  /** Photos in the site photo record. */
  photos: number;
};

export type SlotView = {
  code: SlotCode;
  title: string;
  purpose: string;
  group: Group;
  tech: Tech[];
  kind: SlotKind;
  maker: Maker;
  order: number;
  state: State;
  /** What's missing, who it's waiting for, or why it's not needed. */
  why: string | null;
  fix: Fix | null;
  docs: SlotDoc[];
  /** In the headline counts. */
  counted: boolean;
  /** Not for this job's technologies: folded away under "Not for this job". */
  hidden: boolean;
  /** Marked Not needed by the office (Restore offered). */
  office: SlotMark | null;
  category: string;
};

type Partial0 = { state: State; why?: string | null; fix?: Fix | null };

/** "Acme", "Acme and Bolt", "Acme, Bolt and Cole", "Acme, Bolt, Cole and 2 more". */
export function nameList(names: string[], max = 3): string {
  const n = names.filter(Boolean);
  if (n.length <= 1) return n[0] ?? '';
  if (n.length <= max) return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
  const rest = n.length - max;
  return `${n.slice(0, max).join(', ')} and ${rest} more`;
}

/** The RAMS itself: written, in review, signed off. */
function ramsState(r: RamsFacts): Partial0 {
  if (!r.documents.length) return { state: 'missing', why: 'No RAMS yet. One is written when a project is created; if this one has none, open the RAMS tab to write it.', fix: 'rams' };
  const drafts = r.documents.filter((d) => d.status === 'draft');
  if (drafts.length) return { state: 'waiting', why: `Being written: ${nameList(drafts.map((d) => d.reference))}. It goes to a project admin to review when it’s ready.`, fix: 'rams' };
  const inReview = r.documents.filter((d) => d.status === 'in_review');
  if (inReview.length) {
    const who = nameList([...new Set(inReview.map((d) => d.reviewer).filter((x): x is string => !!x))]);
    return { state: 'waiting', why: `Waiting for ${who || 'a project admin'} to review and sign it off.`, fix: 'rams' };
  }
  return { state: 'complete' };
}

/** Which trades have signed: only meaningful once the RAMS is signed off. */
function tradeState(r: RamsFacts): Partial0 {
  if (!ramsSignedOff(r)) return { state: 'waiting', why: 'After a project admin signs off the RAMS.' };
  const unsigned = r.trades.filter((t) => !t.signed);
  if (!unsigned.length) return { state: 'complete' };
  // Anyone it hasn't gone to is the office's to send; otherwise it's the trades' to sign.
  const unsent = unsigned.filter((t) => !t.sent);
  if (unsent.length) return { state: 'missing', why: `Not sent to ${nameList(unsent.map((t) => t.name))} yet.`, fix: 'rams' };
  return { state: 'waiting', why: `Waiting for ${nameList(unsigned.map((t) => t.name))} to sign.`, fix: 'rams' };
}

function stateFor(d: SlotDef, docs: SlotDoc[], c: StateCtx): Partial0 {
  switch (d.code) {
    case 'HX-IH-01':
      return { state: 'complete' };
    case 'HX-IH-02':
      return { state: 'complete' };
    case 'HX-IH-03':
    case 'HX-IH-16':
      if (docs.length) return { state: 'complete' };
      return c.surveyed ? { state: 'complete' } : { state: 'missing', why: 'No survey recorded yet. Book it, or upload the survey record.', fix: 'survey' };
    case 'HX-IH-05':
      return c.orders > 0 || docs.length ? { state: 'complete' } : { state: 'missing', why: 'No purchase order raised on this project yet.', fix: 'orders' };
    case 'HX-IH-07':
      return ramsState(c.rams);
    case 'HX-IH-08':
      // No trades added yet is "not needed" until one is (applies() can't see the RAMS, so it's here).
      if (!c.rams.trades.length) return { state: 'na', why: 'No trades on this job yet. This fills in as they’re added.' };
      return tradeState(c.rams);
    case 'HX-IH-09':
      if (docs.length || c.photos > 0) return { state: 'complete' };
      return { state: 'missing', why: 'No photographs yet.', fix: 'photos' };
    default:
      // Collected documents: complete once one is uploaded. The optional forms are never "missing".
      if (docs.length) return { state: 'complete' };
      if (d.optional) return { state: 'na', why: 'Only if needed: nothing added.' };
      return { state: 'missing', why: 'Upload it.', fix: 'upload' };
  }
}

const techFits = (d: SlotDef, c: AppliesCtx) => !d.tech.length || d.tech.some((t) => c.products.includes(t));

/** Every item of the pack on this project, in pack order. */
export function slotStates(c: StateCtx): SlotView[] {
  return SLOTS.map((d) => {
    const docs = c.docs.filter((x) => x.slot === d.code);
    const auto = d.applies(c);
    const mark = c.marks[d.code];
    const base = { code: d.code, title: d.title, purpose: d.purpose, group: d.group, tech: d.tech, kind: d.kind, maker: d.maker, order: d.order, docs, category: d.category };
    if (auto) return { ...base, state: 'na' as const, why: auto, fix: null, counted: !d.optional, hidden: !techFits(d, c), office: null };
    if (mark?.na) return { ...base, state: 'na' as const, why: mark.reason || 'Not needed', fix: null, counted: !d.optional, hidden: false, office: mark };
    const s = stateFor(d, docs, c);
    return { ...base, state: s.state, why: s.why ?? null, fix: s.fix ?? null, counted: !d.optional, hidden: false, office: null };
  }).sort((a, b) => a.order - b.order);
}

export type Headline = { complete: number; total: number; waiting: number; missing: number; na: number; words: string };

/**
 * "9 of 11 complete · 1 waiting · 1 missing · 2 not needed": complete against everything that
 * applies. Not needed is listed after, not counted in the total; optional forms and items not for
 * this job's technologies aren't counted at all.
 */
export function headline(views: SlotView[]): Headline {
  const shown = views.filter((v) => !v.hidden && v.counted);
  const n = (s: State) => shown.filter((v) => v.state === s).length;
  const na = n('na');
  const complete = n('complete');
  const total = shown.filter((v) => v.state !== 'na').length;
  const parts = [`${complete} of ${total} complete`, n('waiting') && `${n('waiting')} waiting`, n('missing') && `${n('missing')} missing`, na && `${na} not needed`];
  return { complete, total, waiting: n('waiting'), missing: n('missing'), na, words: parts.filter(Boolean).join(' · ') };
}

/** The contents groups in pack order, each with its items (the cover sheet first, not in a group). */
export function contentsGroups<T extends { group: Group; order: number }>(items: T[]): { key: Exclude<Group, 'cover'>; title: string; items: T[] }[] {
  return GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.group === g.key).sort((a, b) => a.order - b.order) })).filter((g) => g.items.length);
}
