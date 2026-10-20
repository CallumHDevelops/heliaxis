/** WhatsApp chaser / automation settings (stored in cms_kv). Safe for client code. */
export type WaSettings = {
  /** Chase automatically when we ask a question (a message with "?") and they go quiet. */
  chaseQuestions: boolean;
  chaseAfterHours: number;
  chaseText: string;
  /** Move a chase earlier, inside the free 24h window, rather than pay for a template. */
  keepChasesFree: boolean;
  /** A second, final nudge this many hours after the first chase (0 = off). Usually a paid template. */
  finalNudgeHours: number;
  /** Template used when a chase can't be a free message. {{1}} = first name. Blank = the default template. */
  chaseTemplate: string;
  /** First message to a new Meta lead (WhatsApp templates → Use for). Blank = WHATSAPP_DEFAULT_TEMPLATE in Vercel. */
  firstContactTemplate: string;
  /**
   * Quiet hours: nothing automatic goes to customers (chasers, nudges, reminders) between these
   * times, UK time, in minutes after midnight: 21:00 → 08:45 is 1260 → 525.
   */
  quietFromMin: number;
  quietToMin: number;
  /** Hold smart replies to messages that arrive in quiet hours until the morning. */
  smartRepliesQuietHours: boolean;
  /** Push the team if a customer's message has had no answer for this long (0 = off). */
  remindUnansweredMinutes: number;
};

export const DEFAULT_SETTINGS: WaSettings = {
  chaseQuestions: true,
  chaseAfterHours: 12,
  chaseText: 'Hi {first_name}, just checking you saw my last message? No rush — whenever you get a minute.',
  keepChasesFree: true,
  finalNudgeHours: 0,
  chaseTemplate: '',
  firstContactTemplate: '',
  quietFromMin: 21 * 60,
  quietToMin: 8 * 60 + 45,
  smartRepliesQuietHours: false,
  remindUnansweredMinutes: 30,
};

const num = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

/**
 * A time of day in minutes after midnight. Before minutes, quiet hours were saved as whole hours
 * (`quietFrom` / `quietTo`): those still count when there's nothing newer.
 */
function minuteOfDay(v: unknown, oldHour: unknown, d: number) {
  if (v !== undefined && v !== null) return Math.round(num(v, 0, 24 * 60 - 1, d));
  if (oldHour !== undefined && oldHour !== null) return Math.round(num(oldHour, 0, 23, d / 60)) * 60;
  return d;
}

/** Quiet hours used to end at 08:00 by default; the owner asked for 08:45, so a saved 8 reads as that. */
const OLD_DEFAULT_QUIET_TO = 8;

/** 525 → "08:45". */
export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** "08:45" → 525, or null if it isn't a time. */
export function fromHhmm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
}

/** What's saved, as it was saved: today's settings, or older ones with quiet hours in whole hours. */
export type SavedSettings = Partial<Record<keyof WaSettings | 'quietFrom' | 'quietTo', unknown>>;

/** Settings ready to use or save: defaults filled in, values kept in range, older saves read correctly. */
export function cleanSettings(b: SavedSettings): WaSettings {
  const d = DEFAULT_SETTINGS;
  return {
    chaseQuestions: b.chaseQuestions === undefined ? d.chaseQuestions : !!b.chaseQuestions,
    chaseAfterHours: num(b.chaseAfterHours, 0.25, 72, d.chaseAfterHours),
    chaseText: String(b.chaseText ?? d.chaseText).trim().slice(0, 1000) || d.chaseText,
    keepChasesFree: b.keepChasesFree === undefined ? d.keepChasesFree : !!b.keepChasesFree,
    finalNudgeHours: num(b.finalNudgeHours, 0, 14 * 24, d.finalNudgeHours),
    chaseTemplate: String(b.chaseTemplate ?? '').trim(),
    firstContactTemplate: String(b.firstContactTemplate ?? '').trim().slice(0, 100),
    quietFromMin: minuteOfDay(b.quietFromMin, b.quietFrom, d.quietFromMin),
    quietToMin: minuteOfDay(b.quietToMin, Number(b.quietTo) === OLD_DEFAULT_QUIET_TO ? undefined : b.quietTo, d.quietToMin),
    smartRepliesQuietHours: !!b.smartRepliesQuietHours,
    remindUnansweredMinutes: Math.round(num(b.remindUnansweredMinutes, 0, 24 * 60, d.remindUnansweredMinutes)),
  };
}
