/**
 * Dashboard → New Meta leads: which Meta leads someone needs to get to now, and why. Not a lead
 * with a message lined up (one someone scheduled, the automatic first message, a smart reply or a
 * chaser): that's in hand. Otherwise, in this order:
 *  - Free chat ends soon: they messaged us, and the free 24-hour window closes within 6 hours.
 *  - Not contacted: still at New.
 *  - Gone quiet: we've been in touch (Contacted, no survey booked), the lead came in within the last
 *    30 days, and nothing either way on WhatsApp for a day.
 * A failed message doesn't count as lined up: it didn't go.
 *
 * Pure (no imports), so scripts/test-meta-lead-followup.mjs loads it straight into node.
 */

export const CLOSING_HOURS = 6;
export const QUIET_AFTER_HOURS = 24;
export const QUIET_LEAD_DAYS = 30;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Meta's free reply window (SERVICE_WINDOW_MS in src/lib/whatsapp/shared.ts). */
const WINDOW = 24 * HOUR;

export type FollowUpLead = {
  status: string;
  created_at: string;
  wa_last_inbound_at?: string | null;
  wa_last_message_at?: string | null;
};

export type FollowUpKey = 'closing' | 'new' | 'quiet';
export type FollowUp = {
  key: FollowUpKey;
  /** "Free chat ends in 4h", "Not contacted", "Quiet for 2 days". */
  label: string;
  /** Sorts the list: soonest-closing first, then the newest not contacted, then the most recently gone quiet. */
  sort: number;
};

const ORDER: Record<FollowUpKey, number> = { closing: 0, new: 1, quiet: 2 };

const at = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};

/** 5h 20m → "5h", 40 min → "40 min", under a minute → "a minute". */
export function leftWords(ms: number): string {
  if (ms >= HOUR) return `${Math.floor(ms / HOUR)}h`;
  const mins = Math.max(1, Math.floor(ms / MIN));
  return mins === 1 ? 'a minute' : `${mins} min`;
}

/**
 * Why this lead is on the card, or null when it isn't. `queued`: a message is lined up for them
 * (pending or going now). `surveyBooked`: one of their jobs has a survey booked or done.
 */
export function followUp(lead: FollowUpLead, opts: { queued: boolean; surveyBooked: boolean; now: number }): FollowUp | null {
  const { now } = opts;
  if (opts.queued || opts.surveyBooked) return null;
  if (lead.status !== 'new' && lead.status !== 'contacted') return null;

  const inbound = at(lead.wa_last_inbound_at);
  if (inbound !== null) {
    const left = inbound + WINDOW - now;
    if (left > 0 && left <= CLOSING_HOURS * HOUR) return { key: 'closing', label: `Free chat ends in ${leftWords(left)}`, sort: left };
  }
  if (lead.status === 'new') return { key: 'new', label: 'Not contacted', sort: -(at(lead.created_at) ?? 0) };

  const last = at(lead.wa_last_message_at);
  const came = at(lead.created_at);
  if (last === null || came === null) return null;
  if (now - came > QUIET_LEAD_DAYS * DAY || now - last < QUIET_AFTER_HOURS * HOUR) return null;
  const days = Math.floor((now - last) / DAY);
  return { key: 'quiet', label: `Quiet for ${days} day${days === 1 ? '' : 's'}`, sort: -last };
}

/** The card's order: by reason, then within each as `sort` says. */
export function byUrgency(a: FollowUp, b: FollowUp): number {
  return ORDER[a.key] - ORDER[b.key] || a.sort - b.sort;
}
