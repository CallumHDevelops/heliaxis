/**
 * Handover pack settings (CRM settings → Handover pack), kept in cms_kv 'handover-settings' beside the
 * site app's own (settings.ts reads and saves them). Types, defaults, the cleaner and the plain drafts
 * the owner approves: safe in the browser.
 *
 * Every number and every customer-facing promise here is the owner's (SPEC 4.5, D14): the warranty
 * term and wording, the next-inspection default, the maintenance agreement. Nothing is printed until
 * he's set it. The three drafts below (cover letter, completion record, switching-off page) are our
 * plain words; each is used only once he's approved that version.
 */

export type WarrantyStart = '' | 'commissioning' | 'handover';

export type ScheduleRow = { item: string; check: string; who: string; often: string };

export type HandoverSettings = {
  /** F19I: the workmanship warranty's term in years, when it starts, and his wording. All three, or no F19I is made. */
  warrantyYears: number | null;
  warrantyStart: WarrantyStart;
  /** What's covered, what isn't and how to claim, as he writes it (paragraphs). */
  warrantyText: string;
  /** Approved draft versions (ISO time per draft key), so a changed draft needs approving again. */
  approved: Partial<Record<DraftKey, { version: string; at: string; by: string | null }>>;
  /** F78 "next inspection after not more than N years", when the EIC doesn't give it. */
  nextInspectionYears: number | null;
  /** F49A: his maintenance agreement wording. Empty: F49A can't be made. */
  maintenanceText: string;
  /** F49: his own maintenance rows, printed with Heliaxis as their source. */
  scheduleRows: ScheduleRow[];
  /** "Tell the customer" is ticked by default on uploads into the pack. */
  tellOnUpload: boolean;
};

export const DEFAULT_HANDOVER_SETTINGS: HandoverSettings = {
  warrantyYears: null,
  warrantyStart: '',
  warrantyText: '',
  approved: {},
  nextInspectionYears: null,
  maintenanceText: '',
  scheduleRows: [],
  tellOnUpload: false,
};

/* ── The drafts the owner approves ─────────────────────────────────────────── */

export type DraftKey = 'cover' | 'completion' | 'shutdown';

/**
 * Bump a version when its words change: the old approval then no longer counts. {first}, {installed}
 * and the rest are filled in per job by the generators; nothing in them is a number or a promise.
 */
export const DRAFTS: Record<DraftKey, { version: string; title: string; text: string }> = {
  cover: {
    version: 'cover-1',
    title: 'Cover letter (F07BI)',
    text: [
      'Dear {first},',
      'Thank you for choosing Heliaxis. This pack has everything about the system we installed at your home: the certificates, the warranties, how to look after it and the manufacturers’ information.',
      'What we installed: {installed}.',
      'What’s in this pack: (the list of documents, each enclosed or to follow).',
      'Your references: (each as it arrives: MCS certificate, electrical certificate, DNO, Building Control, guarantee).',
      'What to do next: apply for the Smart Export Guarantee (solar), download the monitoring app, and keep this pack safe: you may need it if you sell your home.',
      'If anything doesn’t look right, or you have a question, call us on 01633 965205 or email hello@heliaxis.co.uk.',
      'Signed with the job owner’s name, for Heliaxis.',
    ].join('\n'),
  },
  completion: {
    version: 'completion-1',
    title: 'Completion of works record (F16E)',
    text: 'I’m happy that the work at {address} has been finished, and I’ve been shown how the system works and how to switch it off.',
  },
  shutdown: {
    version: 'shutdown-1',
    title: 'How to switch your system off (CC4)',
    text: [
      '1. Switch off the circuit at your consumer unit (fuse box): {cu}.',
      '2. Switch off the AC isolator: {ac}.',
      '3. Solar: switch off the DC isolator: {dc}.',
      '4. Battery: switch it off at its own isolator, as its manual shows: {battery}.',
      'To switch it back on, go the other way: 4, 3, 2, then 1.',
      'If your battery gives back-up power, some circuits stay on in a power cut and when the consumer unit is switched off. Switch the battery off at its own isolator too before anyone works on them.',
      'If anything sparks, smells of burning or looks damaged, keep away from it and call us on 01633 965205.',
    ].join('\n'),
  },
};

/** Has the owner approved the current version of this draft? */
export const approved = (s: HandoverSettings, k: DraftKey) => s.approved[k]?.version === DRAFTS[k].version;

const DRAFT_KEYS = Object.keys(DRAFTS) as DraftKey[];
const STARTS: WarrantyStart[] = ['', 'commissioning', 'handover'];
export const WARRANTY_START_LABEL: Record<Exclude<WarrantyStart, ''>, string> = {
  commissioning: 'the day the system is switched on',
  handover: 'the day the handover pack goes to the customer',
};

const text = (v: unknown, max: number) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const whole = (v: unknown, lo: number, hi: number) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};

export function cleanHandoverSettings(b: Partial<Record<keyof HandoverSettings, unknown>>): HandoverSettings {
  const d = DEFAULT_HANDOVER_SETTINGS;
  const approvedIn = b.approved && typeof b.approved === 'object' ? (b.approved as Record<string, unknown>) : {};
  const approvedOut: HandoverSettings['approved'] = {};
  for (const k of DRAFT_KEYS) {
    const a = approvedIn[k] as { version?: unknown; at?: unknown; by?: unknown } | undefined;
    if (a && typeof a.version === 'string' && typeof a.at === 'string' && !Number.isNaN(Date.parse(a.at)))
      approvedOut[k] = { version: a.version.slice(0, 40), at: new Date(a.at).toISOString(), by: typeof a.by === 'string' ? a.by.slice(0, 80) : null };
  }
  const rows = Array.isArray(b.scheduleRows) ? b.scheduleRows : d.scheduleRows;
  return {
    warrantyYears: whole(b.warrantyYears, 1, 50),
    warrantyStart: STARTS.includes(String(b.warrantyStart ?? '') as WarrantyStart) ? (String(b.warrantyStart ?? '') as WarrantyStart) : '',
    warrantyText: text(b.warrantyText, 6000),
    approved: approvedOut,
    nextInspectionYears: whole(b.nextInspectionYears, 1, 25),
    maintenanceText: text(b.maintenanceText, 6000),
    scheduleRows: rows
      .map((r) => r as Partial<ScheduleRow>)
      .map((r) => ({ item: text(r.item, 80), check: text(r.check, 200), who: text(r.who, 40), often: text(r.often, 60) }))
      .filter((r) => r.item && r.check && r.often)
      .slice(0, 20),
    tellOnUpload: b.tellOnUpload === undefined ? d.tellOnUpload : b.tellOnUpload === true,
  };
}

/** The warranty can be made: term, start and wording all set. */
export const warrantyReady = (s: HandoverSettings) => !!(s.warrantyYears && s.warrantyStart && s.warrantyText);
