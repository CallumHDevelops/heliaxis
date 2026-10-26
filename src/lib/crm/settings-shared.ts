/** CRM automation settings (stored in cms_kv as 'crm-settings'). Safe for client code. */

export type SequenceStep = {
  /**
   * The step's own name, kept when its hours, Send by or words change. What a lead has had is written down by it
   * ("seq:<id>" in crm_projects.reminders_sent), not by its place in the list, so adding, moving or removing a
   * step never re-sends another. A step just added on the page has none ('') until it's saved; steps saved
   * before ids are named by their place ("1", "2"…) when read (storedSteps).
   */
  id: string;
  /** Hours after the enquiry arrived. */
  afterHours: number;
  channel: 'whatsapp' | 'email';
  /** Message text ({first_name}, {portal_link}, {booking_link}). WhatsApp uses it inside the free 24h window. */
  text: string;
  /** WhatsApp template used when the 24h window is closed ({{1}} = first name). */
  template?: string;
  subject?: string;
  /**
   * Only leads that came in from this time on get the step. Set by the server (sequenceAfterSave) to the step's
   * hours before the moment the sequence was switched on or the step added, so a lead already past it then
   * skips it quietly instead of getting it late; kept whatever the step's hours become later. None on steps
   * from before this, and then nobody skips them.
   */
  leadsFrom?: string;
};

export type CrmSettings = {
  /** New leads are given to these people in turn (empty = unassigned). */
  leadRotation: string[];
  rotationIndex: number;
  /** Alert when a new lead hasn't been contacted within this many minutes (0 = off). */
  firstResponseMinutes: number;
  /** WhatsApp countdowns before an install / survey (days before, sent at reminderHour UK time). */
  installReminderDays: number[];
  surveyReminderDays: number[];
  reminderHour: number;
  /** Templates for when the 24h window is closed. {{1}} first name, {{2}} "in 3 days" / "tomorrow", {{3}} the date. */
  installTemplate: string;
  surveyTemplate: string;
  /** Google review request after Complete. {{1}} first name, {{2}} the review link. */
  reviewUrl: string;
  reviewDelayDays: number;
  reviewTemplate: string;
  /** @deprecated The old portal booking. Survey booking settings live in cms_kv 'survey-booking' (src/lib/booking/settings.ts). Still parsed so saved settings load. */
  bookingEnabled: boolean;
  /** @deprecated See bookingEnabled. 1 = Monday … 7 = Sunday. */
  bookingDays: number[];
  /** @deprecated See bookingEnabled. "09:00", "11:00" … */
  bookingSlots: string[];
  /** @deprecated See bookingEnabled. */
  bookingMinNoticeHours: number;
  /** @deprecated See bookingEnabled. */
  bookingHorizonDays: number;
  /** Follow-up sequence for new leads; stops when they reply or the stage moves past Contacted. */
  sequenceEnabled: boolean;
  sequence: SequenceStep[];
  /** Where purchase orders can be delivered instead of the site (blank until set: "To the office" waits for it). */
  officeAddress: string;
  officePostcode: string;
};

export const DEFAULT_CRM_SETTINGS: CrmSettings = {
  leadRotation: [],
  rotationIndex: 0,
  firstResponseMinutes: 15,
  installReminderDays: [7, 3, 1],
  surveyReminderDays: [1],
  reminderHour: 9,
  installTemplate: '',
  surveyTemplate: '',
  reviewUrl: '',
  reviewDelayDays: 3,
  reviewTemplate: '',
  bookingEnabled: true,
  bookingDays: [1, 2, 3, 4, 5],
  bookingSlots: ['09:30', '12:00', '14:30'],
  bookingMinNoticeHours: 24,
  bookingHorizonDays: 21,
  sequenceEnabled: false,
  sequence: [
    {
      id: '1',
      afterHours: 24,
      channel: 'whatsapp',
      text: 'Hi {first_name}, just checking you saw our message about your enquiry? Happy to answer any questions, or just reply here to book a free survey.',
    },
    {
      id: '2',
      afterHours: 72,
      channel: 'email',
      subject: 'Your Heliaxis enquiry',
      text: 'Hi {first_name},\n\nThanks again for your enquiry. If you’d like to book a free survey, just reply with a couple of days and times that suit you.\n\nAny questions, just reply to this email.\n\nThe Heliaxis team',
    },
  ],
  officeAddress: '',
  officePostcode: '',
};

const nums = (v: unknown, lo: number, hi: number) =>
  (Array.isArray(v) ? v : String(v ?? '').split(','))
    .map((x) => Math.round(Number(x)))
    .filter((n) => Number.isFinite(n) && n >= lo && n <= hi)
    .filter((n, i, a) => a.indexOf(n) === i)
    .sort((a, b) => b - a);
const num = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};
const str = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);

export function cleanCrmSettings(b: Partial<Record<keyof CrmSettings, unknown>>): CrmSettings {
  const d = DEFAULT_CRM_SETTINGS;
  const slots = (Array.isArray(b.bookingSlots) ? b.bookingSlots : String(b.bookingSlots ?? '').split(','))
    .map((s) => String(s).trim())
    .filter((s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s));
  const ids = new Set<string>();
  const seq = (Array.isArray(b.sequence) ? b.sequence : d.sequence)
    .map((s) => s as Partial<SequenceStep>)
    .map((s) => {
      // A step keeps its id; one just added on the page (or a repeat) gets its own.
      const id = typeof s.id === 'string' && /^[\w-]{1,40}$/.test(s.id) && !ids.has(s.id) ? s.id : crypto.randomUUID().slice(0, 8);
      ids.add(id);
      return {
        id,
        afterHours: num(s.afterHours, 1, 24 * 60, 24),
        channel: (s.channel === 'email' ? 'email' : 'whatsapp') as SequenceStep['channel'],
        text: str(s.text, 2000),
        template: str(s.template, 100) || undefined,
        subject: str(s.subject, 200) || undefined,
        leadsFrom: typeof s.leadsFrom === 'string' && !Number.isNaN(Date.parse(s.leadsFrom)) ? new Date(s.leadsFrom).toISOString() : undefined,
      };
    })
    .filter((s) => s.text)
    .sort((a, b) => a.afterHours - b.afterHours)
    .slice(0, 8);
  return {
    leadRotation: (Array.isArray(b.leadRotation) ? b.leadRotation : []).map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x)),
    rotationIndex: num(b.rotationIndex, 0, 1e6, 0),
    firstResponseMinutes: num(b.firstResponseMinutes, 0, 24 * 60, d.firstResponseMinutes),
    installReminderDays: b.installReminderDays === undefined ? d.installReminderDays : nums(b.installReminderDays, 0, 30),
    surveyReminderDays: b.surveyReminderDays === undefined ? d.surveyReminderDays : nums(b.surveyReminderDays, 0, 30),
    reminderHour: num(b.reminderHour, 7, 20, d.reminderHour),
    installTemplate: str(b.installTemplate, 100),
    surveyTemplate: str(b.surveyTemplate, 100),
    reviewUrl: /^https:\/\//.test(str(b.reviewUrl, 500)) ? str(b.reviewUrl, 500) : '',
    reviewDelayDays: num(b.reviewDelayDays, 0, 60, d.reviewDelayDays),
    reviewTemplate: str(b.reviewTemplate, 100),
    bookingEnabled: b.bookingEnabled === undefined ? d.bookingEnabled : !!b.bookingEnabled,
    bookingDays: b.bookingDays === undefined ? d.bookingDays : nums(b.bookingDays, 1, 7).sort((a, c) => a - c),
    bookingSlots: slots.length ? [...new Set(slots)].sort() : d.bookingSlots,
    bookingMinNoticeHours: num(b.bookingMinNoticeHours, 0, 24 * 14, d.bookingMinNoticeHours),
    bookingHorizonDays: num(b.bookingHorizonDays, 1, 90, d.bookingHorizonDays),
    sequenceEnabled: !!b.sequenceEnabled,
    sequence: seq,
    officeAddress: String(b.officeAddress ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n')
      .slice(0, 300),
    officePostcode: str(b.officePostcode, 10).toUpperCase(),
  };
}

/** {first_name}, {name}, {portal_link}, {booking_link} in saved replies, sequences and reminders. */
export function fillText(text: string, v: { name?: string | null; portalLink?: string | null; bookingLink?: string | null }) {
  const full = (v.name || '').trim();
  const first = full.split(/\s+/)[0] || 'there';
  return text
    .replace(/\{first_name\}/g, first)
    .replace(/\{name\}/g, full || 'there')
    .replace(/\{portal_link\}/g, v.portalLink || '')
    .replace(/\{booking_link\}/g, v.bookingLink || '')
    .replace(/[ \t]+$/gm, '');
}

/**
 * Steps as saved, for reading them back. Saved before steps had ids, they're named by their place in the list
 * ("1", "2"…), which is how a lead from then counted the ones it had had (sequenceHad).
 */
export function storedSteps(sequence: unknown): unknown {
  return Array.isArray(sequence) && !sequence.some((x) => x?.id) ? sequence.map((x, i) => ({ ...x, id: String(i + 1) })) : sequence;
}

/**
 * The steps after a save, each with its leadsFrom, set here on the server (never taken from the page). Switched
 * on, every step starts counting now; so does a new step (an id the saved settings didn't have). Any other step
 * keeps its own whatever its hours or Send by become, so editing one step never holds back another, and a step
 * moved earlier still goes to every lead that was waiting for it. Switching it off keeps them.
 */
export function sequenceAfterSave(prev: CrmSettings, next: CrmSettings, now: Date): SequenceStep[] {
  const was = new Map(prev.sequence.map((x) => [x.id, x.leadsFrom]));
  const restart = next.sequenceEnabled && !prev.sequenceEnabled;
  return next.sequence.map((x) => ({
    ...x,
    leadsFrom: restart || !was.has(x.id) ? new Date(now.getTime() - x.afterHours * 3_600_000).toISOString() : was.get(x.id),
  }));
}

/**
 * The steps a lead has had (sent, or skipped), by id: "seq:<id>" in its reminders_sent. A lead from before steps
 * had ids has only its sequence_step, how many it had had: the first ones, named by their place ("1", "2"…).
 */
export function sequenceHad(sent: string[] | null, sequenceStep: number): string[] {
  const ids = (sent ?? []).filter((k) => k.startsWith('seq:')).map((k) => k.slice(4));
  return ids.length ? ids : Array.from({ length: sequenceStep }, (_, i) => String(i + 1));
}

/**
 * A lead's next step: the first in the list it hasn't had (`at` is the list's length once it has had them all).
 * `skip` is any before it that the lead came in too early for (before the step's leadsFrom): those are passed
 * quietly, not sent late.
 */
export function sequenceNext(sequence: SequenceStep[], had: string[], createdAt: string): { at: number; skip: string[] } {
  const born = Date.parse(createdAt);
  const skip: string[] = [];
  let at = 0;
  for (; at < sequence.length; at++) {
    const x = sequence[at];
    if (had.includes(x.id)) continue;
    if (!(born < Date.parse(x.leadsFrom ?? ''))) break;
    skip.push(x.id);
  }
  return { at, skip };
}
