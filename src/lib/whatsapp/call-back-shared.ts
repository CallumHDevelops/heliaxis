/** "Call me today" / "Call me tomorrow": the welcome message's buttons, or a short message that says the same. Pure, so it can be tested. */
export type CallBackWhen = 'today' | 'tomorrow';

export function callBackWhen(body: string | null | undefined): CallBackWhen | null {
  const t = String(body ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  // Short messages only: a long one that happens to mention "call" and "tomorrow" is read by a person.
  if (!t || t.length > 60) return null;
  if (!/\b(call|ring|phone)\b/.test(t) || !/\b(me|us)\b/.test(t)) return null;
  // "don't call me", "no need to call me tomorrow", "can't talk today, message me instead" are not a request.
  if (/\b(don'?t|do not|dont|not|no need|stop|never|instead)\b/.test(t)) return null;
  if (/\b(tomorrow|tomorow|tmrw|tmw)\b/.test(t)) return 'tomorrow';
  if (/\btoday\b/.test(t)) return 'today';
  return null;
}

/** The day to ring, as YYYY-MM-DD in the UK: the day they said it (or the next). */
export function dueDay(when: CallBackWhen, at: Date): string {
  const d = new Date(at.getTime() + (when === 'tomorrow' ? 86_400_000 : 0));
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

export const taskTitle = (name: string | null | undefined, when: CallBackWhen) => {
  const first = String(name ?? '').trim().split(/\s+/)[0] || 'the customer';
  return `Ring ${first}: they asked for a call ${when}`;
};
