/**
 * The proposal pack's catalogue: the paperwork the customer is given before they sign (the covering
 * letter, the quotation, the performance estimate, the contract of sale with its cancellation form,
 * and the consumer-protection documents MCS and RECC expect). Every document in it, by Heliaxis's own
 * code (HX-PP-01 …), with the customer's one plain line, its group, the technologies it belongs to,
 * who makes it, its place in the pack and whether the customer signs it or just receives it.
 *
 * Then each item's state on a job (the handover pack's own states: Complete, Missing, Waiting, Not
 * needed, Out of date), the headline, and the one decision the accept flow turns on: acceptPath().
 * When every item that applies is Complete the customer reviews the pack and signs; when anything is
 * still open they get the "thank you, the contract is on its way" page and the Project Admins get a
 * task listing what is missing (gapsTask). Nothing is estimated or filled in to close a gap.
 *
 * Mirrors src/lib/handover/slots.ts and shares its states. Pure: no I/O, so the office tab, the
 * server, the customer portal and the tests all read the same rules.
 */
import { STATE_LABEL, type SlotKind, type SlotMark, type State, type Tech } from '../handover/slots';

export { STATE_LABEL };
export type { State, Tech, SlotKind, SlotMark };

/** G: we make it from data · C: collected (someone else issues it, uploaded) · L: from the product library. */
export type Maker = 'pack' | 'office' | 'library';
/** sign: the customer signs it (the contract) · read: they are given it and confirm they have received it. */
export type Role = 'sign' | 'read';

export type Group = 'start' | 'quote' | 'contract' | 'protection' | 'products' | 'other';
export const GROUPS: { key: Group; title: string }[] = [
  { key: 'start', title: 'Start here' },
  { key: 'quote', title: 'Your quotation' },
  { key: 'contract', title: 'Your contract' },
  { key: 'protection', title: 'Your protection' },
  { key: 'products', title: 'Your equipment' },
  { key: 'other', title: 'Other' },
];

export type ProposalCode =
  | 'HX-PP-01'
  | 'HX-PP-02'
  | 'HX-PP-03'
  | 'HX-PP-04'
  | 'HX-PP-05'
  | 'HX-PP-06'
  | 'HX-PP-07'
  | 'HX-PP-08'
  | 'HX-PP-09'
  | 'HX-PP-10';

/** What applies() looks at: the job's technologies. */
export type AppliesCtx = { products: string[] };

export type ProposalDef = {
  code: ProposalCode;
  title: string;
  /** One plain line for the customer's portal. */
  customer: string;
  group: Group;
  /** The technologies it belongs to. Empty: every job. */
  tech: Tech[];
  kind: SlotKind;
  maker: Maker;
  role: Role;
  /** Place in the pack. */
  order: number;
  /** Null when it applies; otherwise why it isn't needed (automatic). */
  applies: (c: AppliesCtx) => string | null;
  /** What to tell the office when a collected or library item has nothing in it yet. */
  missing: string;
  /** The office's own reasons for Not needed, offered before "Other: …". */
  reasons?: string[];
  /** Extras: never Missing, never counted. */
  optional?: boolean;
  /** Where an upload into it is filed (crm_documents.category). */
  category: string;
};

const has = (c: AppliesCtx, ...t: Tech[]) => t.some((x) => c.products.includes(x));
const any = () => null;
const pvOrBattery = (c: AppliesCtx) => (has(c, 'solar', 'battery') ? null : 'No solar or battery on this job');
/** MCS certifies solar, batteries and heat pumps: not an EV charger on its own. */
const mcs = (c: AppliesCtx) => (has(c, 'solar', 'battery', 'heatpump') ? null : 'No MCS certificate for this job’s technologies');
/** The Renewable Energy Consumer Code covers these technologies (and EV charge points). */
const recc = (c: AppliesCtx) => (has(c, 'solar', 'battery', 'heatpump', 'ev') ? null : 'Not covered by the Renewable Energy Consumer Code');

export const SLOTS: ProposalDef[] = [
  {
    code: 'HX-PP-01',
    title: 'Covering letter',
    customer: 'Our letter to you: what is in this pack and what happens next.',
    group: 'start',
    tech: [],
    kind: 'G',
    maker: 'pack',
    role: 'read',
    order: 10,
    applies: any,
    missing: 'The covering letter has not been made yet.',
    category: 'proposal',
  },
  {
    code: 'HX-PP-02',
    title: 'Quotation',
    customer: 'What we propose to supply and fit, what it costs, and the guarantees that come with it.',
    group: 'quote',
    tech: [],
    kind: 'G',
    maker: 'pack',
    role: 'read',
    order: 20,
    applies: any,
    missing: 'The quotation has not been made yet.',
    category: 'quote',
  },
  {
    code: 'HX-PP-03',
    title: 'Performance estimate',
    customer: 'What your system should produce and save, worked out the MCS way. A guide, not a guarantee.',
    group: 'quote',
    tech: ['solar', 'battery'],
    kind: 'G',
    maker: 'pack',
    role: 'read',
    order: 30,
    applies: pvOrBattery,
    missing: 'The performance estimate has not been made yet.',
    category: 'proposal',
  },
  {
    code: 'HX-PP-04',
    title: 'Contract of sale (with cancellation form)',
    customer: 'The terms we both agree to when you sign, and the form to use if you change your mind.',
    group: 'contract',
    tech: [],
    kind: 'G',
    maker: 'pack',
    role: 'sign',
    order: 40,
    applies: any,
    missing: 'The contract has not been made yet.',
    category: 'contract',
  },
  {
    code: 'HX-PP-05',
    title: 'MCS Customer Commitment',
    customer: 'What MCS says you can expect from us, and what we ask of you.',
    group: 'protection',
    tech: ['solar', 'battery', 'heatpump'],
    kind: 'L',
    maker: 'library',
    role: 'read',
    order: 50,
    applies: mcs,
    missing: 'Add the current MCS Customer Commitment to the library.',
    reasons: ['Not an MCS job'],
    category: 'proposal',
  },
  {
    code: 'HX-PP-06',
    title: 'Consumer Code leaflet',
    customer: 'How the Renewable Energy Consumer Code protects you.',
    group: 'protection',
    tech: ['solar', 'battery', 'heatpump', 'ev'],
    kind: 'L',
    maker: 'library',
    role: 'read',
    order: 60,
    applies: recc,
    missing: 'Add the Consumer Code leaflet to the library.',
    category: 'proposal',
  },
  {
    code: 'HX-PP-07',
    title: 'Deposit protection',
    customer: 'How your deposit is protected.',
    group: 'protection',
    tech: [],
    kind: 'C',
    maker: 'office',
    role: 'read',
    order: 70,
    applies: any,
    missing: 'Upload the deposit protection details.',
    reasons: ['No deposit on this job'],
    category: 'proposal',
  },
  {
    code: 'HX-PP-08',
    title: 'Complaints procedure',
    customer: 'Who to contact if something goes wrong, and how we deal with it.',
    group: 'protection',
    tech: [],
    kind: 'G',
    maker: 'pack',
    role: 'read',
    order: 80,
    applies: any,
    missing: 'The complaints procedure has not been made yet.',
    category: 'proposal',
  },
  {
    code: 'HX-PP-09',
    title: 'Manufacturers’ data sheets',
    customer: 'The manufacturers’ own specifications for the equipment we propose.',
    group: 'products',
    tech: [],
    kind: 'L',
    maker: 'library',
    role: 'read',
    order: 90,
    applies: any,
    missing: 'Add the data sheets for this job’s equipment to the library.',
    category: 'proposal',
  },
  {
    code: 'HX-PP-10',
    title: 'Other proposal documents',
    customer: 'Anything else we have added for your job.',
    group: 'other',
    tech: [],
    kind: 'C',
    maker: 'office',
    role: 'read',
    order: 100,
    applies: any,
    missing: 'Nothing extra added.',
    optional: true,
    category: 'proposal',
  },
];

const BY_CODE = new Map(SLOTS.map((s) => [s.code, s]));
export const slotDef = (code: string) => BY_CODE.get(code as ProposalCode);
export const isSlot = (code: unknown): code is ProposalCode => typeof code === 'string' && BY_CODE.has(code as ProposalCode);

/** Where an item's gap is fixed: the OpenSolar proposal, the job's details, the proposal settings, an upload or the library. */
export type Fix = 'opensolar' | 'job' | 'settings' | 'upload' | 'library';

/** A current (not archived) job document in a pack item. */
export type ProposalDoc = {
  id: string;
  slot: string;
  name: string;
  /** upload · generated · library */
  source: string | null;
  /** generated_key: versions of one generated document share it. */
  key: string | null;
  visible: boolean;
  at: string;
  version: number;
  hash: string | null;
};

/** One of our own documents: made from these inputs now, or what it still needs. */
export type GenNeed = { ready: true; hash: string } | { ready: false; why: string; fix?: Fix };

export type StateCtx = AppliesCtx & {
  /** The job's current pack documents (archived ones left out). */
  docs: ProposalDoc[];
  /** Office Not needed marks. */
  marks: Partial<Record<string, SlotMark>>;
  /** What each document we make still needs, or the hash of its inputs. */
  gen: Partial<Record<ProposalCode, GenNeed>>;
  /** Product models on the job with no data sheet in the library. */
  libraryGaps: string[];
};

export type ProposalView = {
  code: ProposalCode;
  title: string;
  customer: string;
  group: Group;
  tech: Tech[];
  kind: SlotKind;
  maker: Maker;
  role: Role;
  order: number;
  state: State;
  /** What is missing, or why it is not needed, or why it is out of date. */
  why: string | null;
  fix: Fix | null;
  docs: ProposalDoc[];
  /** In the headline counts and in what holds the contract back. */
  counted: boolean;
  /** Not for this job's technologies: folded away under "Not for this job". */
  hidden: boolean;
  /** Marked Not needed by the office (Restore offered). */
  office: SlotMark | null;
  reasons: string[];
  category: string;
};

type Result = { state: State; why?: string | null; fix?: Fix | null };

const newest = (docs: ProposalDoc[]) => [...docs].sort((a, b) => b.version - a.version || b.at.localeCompare(a.at))[0];

function stateFor(d: ProposalDef, docs: ProposalDoc[], c: StateCtx): Result {
  if (d.kind === 'G') {
    const need = c.gen[d.code];
    if (!need) return { state: 'missing', why: d.missing, fix: 'job' };
    if (!need.ready) return { state: 'missing', why: need.why, fix: need.fix ?? 'job' };
    const cur = newest(docs);
    if (!cur) return { state: 'missing', why: d.missing, fix: 'job' };
    // Made from different inputs than the job has now (the OpenSolar proposal or the job changed): not what the customer should see.
    if (cur.hash && cur.hash !== need.hash) return { state: 'stale', why: 'The job has changed since this was made. Make it again.', fix: 'job' };
    return { state: 'complete' };
  }
  if (d.code === 'HX-PP-09' && c.libraryGaps.length) {
    return { state: 'missing', why: `No data sheet in the library for ${c.libraryGaps.join(', ')}.`, fix: 'library' };
  }
  if (docs.length) return { state: 'complete' };
  return d.optional
    ? { state: 'na', why: d.missing }
    : { state: 'missing', why: d.missing, fix: d.kind === 'L' ? 'library' : 'upload' };
}

const techFits = (d: ProposalDef, c: AppliesCtx) => !d.tech.length || d.tech.some((t) => c.products.includes(t));

/** Every item of the pack on this job, in pack order. */
export function proposalStates(c: StateCtx): ProposalView[] {
  return SLOTS.map((d): ProposalView => {
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
      role: d.role,
      order: d.order,
      docs,
      reasons: d.reasons ?? [],
      category: d.category,
    };
    if (auto) return { ...base, state: 'na', why: auto, fix: null, counted: !d.optional, hidden: !techFits(d, c), office: null };
    if (mark?.na) return { ...base, state: 'na', why: mark.reason || 'Not needed', fix: null, counted: !d.optional, hidden: false, office: mark };
    const s = stateFor(d, docs, c);
    return { ...base, state: s.state, why: s.why ?? null, fix: s.fix ?? null, counted: !d.optional, hidden: false, office: null };
  }).sort((a, b) => a.order - b.order);
}

export type Headline = { complete: number; total: number; missing: number; stale: number; na: number; words: string };

/** "7 of 9 complete · 2 missing · 1 not needed": complete against everything that applies. */
export function headline(views: ProposalView[]): Headline {
  const shown = views.filter((v) => !v.hidden && v.counted);
  const n = (s: State) => shown.filter((v) => v.state === s).length;
  const na = n('na');
  const complete = n('complete');
  const total = shown.filter((v) => v.state !== 'na').length;
  const parts = [`${complete} of ${total} complete`, n('missing') && `${n('missing')} missing`, n('stale') && `${n('stale')} out of date`, na && `${na} not needed`];
  return { complete, total, missing: n('missing'), stale: n('stale'), na, words: parts.filter(Boolean).join(' · ') };
}

/** What still stands between the job and a pack the customer can be given: every item that applies and is not Complete. */
export const openItems = (views: ProposalView[]) => views.filter((v) => !v.hidden && v.counted && v.state !== 'complete' && v.state !== 'na');

/**
 * What the customer gets when they press Accept. 'sign': every item that applies is Complete, so they
 * review the pack and sign the contract. 'hold': something is still open, so they see HOLD_MESSAGE and
 * the Project Admins are given the list (`open`). The office can always send the quote either way.
 */
export function acceptPath(views: ProposalView[]): { path: 'sign' } | { path: 'hold'; open: ProposalView[] } {
  const open = openItems(views);
  return open.length ? { path: 'hold', open } : { path: 'sign' };
}

/** Shown after the customer accepts while the paperwork is still being finished. */
export const HOLD_MESSAGE =
  'Thank you for accepting the quote, we look forward to working with you. We’ll shortly be sending you the contract for signing along with the relevant documentation as required by MCS.';

/** The source key of the one open task per job (src/lib/surveys/server addSourceTask / closeSourceTask). */
export const GAPS_TASK_KEY = 'proposal:gaps';

/** The Project Admins' task: what to finish so the contract can go to the customer. Null when nothing is open. */
export function gapsTask(views: ProposalView[], customer: string): { key: string; title: string; notes: string } | null {
  const open = openItems(views);
  if (!open.length) return null;
  const who = customer.trim() || 'the customer';
  return {
    key: GAPS_TASK_KEY,
    title: `Finish the proposal pack for ${who}: ${open.length} ${open.length === 1 ? 'item' : 'items'} open`,
    notes: open.map((v) => `${v.title}: ${v.why ?? STATE_LABEL[v.state]}`).join('\n'),
  };
}

/** What the customer sees for an item: its documents, "On its way", or nothing (not needed). */
export function customerState(v: ProposalView): 'ready' | 'coming' | null {
  if (v.hidden || v.state === 'na') return v.docs.some((d) => d.visible) ? 'ready' : null;
  if (v.docs.some((d) => d.visible) && v.state === 'complete') return 'ready';
  return v.counted ? 'coming' : null;
}

/** The contents groups in pack order, each with its items. */
export function contentsGroups<T extends { group: Group; order: number }>(items: T[]): { key: Group; title: string; items: T[] }[] {
  return GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.group === g.key).sort((a, b) => a.order - b.order) })).filter((g) => g.items.length);
}
