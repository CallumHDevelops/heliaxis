/**
 * The three packs on a job, shown the same way in Docs: Proposal (what the customer is given before they sign), In-House
 * (Heliaxis's own file, never sent) and Handover (what the customer is given when the work is done). Each catalogue keeps its
 * own rules (src/lib/proposal, inhouse and handover /slots.ts); this turns any of them into one list of line items:
 * what it is, its code and document number, whether it is done, and the files behind it. Pure: no I/O.
 */
export type PackKey = 'proposal' | 'inhouse' | 'handover';
/** complete: done (a tick) · missing, waiting, stale: still needed (an orange warning) · na: not needed. */
export type ItemState = 'complete' | 'missing' | 'waiting' | 'stale' | 'na';

export type PackDoc = { id: string; name: string; at: string; version: number; generated: boolean; /** One copy in the document library, the same on every job. */ library: boolean };
export type PackItem = {
  code: string;
  title: string;
  state: ItemState;
  why: string | null;
  group: string;
  /** Not for this job's technologies. */
  hidden: boolean;
  /** In the headline counts. */
  counted: boolean;
  /** The document number: the job, the item and the version, "HX-0126-PP-01 v2". Empty until there is a document. */
  docNo: string | null;
  docs: PackDoc[];
  /** Filled in on screen (the heat pump forms): Edit opens the form, Preview and Download make its PDF. */
  form: boolean;
  /** We make it ourselves from the job (so Preview, Edit and Download work before anyone uploads anything). */
  made: boolean;
};
export type PackHeadline = { complete: number; total: number; open: number; words: string };
export type Pack = {
  key: PackKey;
  title: string;
  /** Said in a line under the title. */
  blurb: string;
  /** Goes to the customer (Send, and the customer sees it): not In-House. */
  customer: boolean;
  /** Whether this pack is set up on this system (its SQL has been run). */
  ready: boolean;
  groups: { key: string; title: string }[];
  items: PackItem[];
  headline: PackHeadline;
};

/** A slot of any of the three catalogues, as far as this needs to know. */
export type AnySlot = {
  code: string;
  title: string;
  state: ItemState;
  why: string | null;
  group: string;
  hidden: boolean;
  counted: boolean;
  maker?: string;
  docs: { id: string; name: string; at: string; version: number; source?: string | null }[];
};

/** "HX-0126" and "HX-PP-01" → "HX-0126-PP-01", and "… v2" once a second version exists. */
export function docNumber(ref: string | null, code: string, version = 1): string {
  const tail = code.replace(/^HX-/, '');
  return `${ref ?? 'HX'}-${tail}${version > 1 ? ` v${version}` : ''}`;
}

export function itemFrom(s: AnySlot, ref: string | null, extra: { form?: boolean } = {}): PackItem {
  const newest = [...s.docs].sort((a, b) => b.version - a.version || b.at.localeCompare(a.at))[0];
  return {
    code: s.code,
    title: s.title,
    state: s.state,
    why: s.why,
    group: s.group,
    hidden: s.hidden,
    counted: s.counted,
    docNo: newest ? docNumber(ref, s.code, newest.version) : extra.form ? docNumber(ref, s.code) : null,
    docs: s.docs.map((d) => ({ id: d.id, name: d.name, at: d.at, version: d.version, generated: d.source === 'generated', library: d.source === 'library' })),
    form: !!extra.form,
    made: s.maker === 'pack' || s.maker === 'site' || !!extra.form,
  };
}

/** "9 of 14 complete · 3 still needed": what counts is every item that applies and is not marked not needed. */
export function headlineOf(items: PackItem[]): PackHeadline {
  const live = items.filter((i) => !i.hidden && i.counted && i.state !== 'na');
  const complete = live.filter((i) => i.state === 'complete').length;
  const open = live.length - complete;
  return { complete, total: live.length, open, words: live.length ? `${complete} of ${live.length} complete${open ? ` · ${open} still needed` : ''}` : 'Nothing needed yet' };
}

/** The items to show: the ones that apply, in pack order within their group. Those for other technologies are left out. */
export function shown(items: PackItem[]): PackItem[] {
  return items.filter((i) => !i.hidden);
}

/** Which of an item's buttons make sense: Preview and Download need a file or a form to draw; Edit is for a form filled in on screen. */
export function buttonsFor(i: PackItem): { preview: boolean; download: boolean; edit: boolean; upload: boolean } {
  const file = i.docs.length > 0 || i.form;
  return { preview: file, download: file, edit: i.form, upload: !i.form && i.state !== 'na' };
}

/** A name for a file inside a pack's ZIP: the document number and what it is, in the file's own type. */
export function fileNameFor(item: Pick<PackItem, 'title'>, docNo: string | null, original: string): string {
  const ext = /\.[a-z0-9]{1,5}$/i.exec(original)?.[0] ?? '';
  return `${docNo ? `${docNo} ` : ''}${item.title}${ext}`;
}
