/**
 * "When WhatsApp reply sent – move customer to Contacted", for chats imported from the WhatsApp
 * Business app: a message from us there is getting in touch, from the moment it was sent. Live
 * messages do this as they're sent (markFirstContact in src/lib/whatsapp/inbox.ts); imported ones do it
 * when they're imported, and the CRM home catches up chats imported before that
 * (src/lib/crm/chat-contacted.ts).
 *
 * Only messages sent once the job (or, without a job, the enquiry) was there count: an old
 * conversation never marks a new enquiry as contacted, and a first contact is never before the
 * enquiry came in. Nobody is moved back, or past Contacted.
 *
 * Pure (no imports), so scripts/test-imported-chats.mjs loads it straight into node.
 */

/** Imported messages are to the minute: a reply in the same minute as the enquiry still counts. */
export const GRACE_MS = 60_000;

export type RuleJob = { id: string; stage: string; created_at: string; first_contact_at: string | null };

const ms = (iso: string) => Date.parse(iso);

/** The first of our messages (times, any order) sent once `since` was there. */
export function firstOursSince(ours: string[], since: string): string | null {
  const from = ms(since) - GRACE_MS;
  let first: string | null = null;
  for (const at of ours) if (ms(at) >= from && (!first || ms(at) < ms(first))) first = at;
  return first;
}

/**
 * What a chat with messages from us changes for its customer: each job nobody has contacted yet gets
 * its first contact, the first of our messages since it opened (markContacted then moves it from Lead
 * to Contacted), and a customer without a job goes from New to Contacted.
 */
export function contactPlan(
  jobs: RuleJob[],
  enquiry: { status: string; created_at: string } | null,
  ours: string[]
): { jobs: { id: string; at: string }[]; enquiryAt: string | null } {
  const out: { id: string; at: string }[] = [];
  for (const j of jobs) {
    if (j.first_contact_at) continue;
    const at = firstOursSince(ours, j.created_at);
    if (at) out.push({ id: j.id, at });
  }
  const enquiryAt = !jobs.length && enquiry?.status === 'new' ? firstOursSince(ours, enquiry.created_at) : null;
  return { jobs: out, enquiryAt };
}

export type CatchUpJob = { id: string; enquiry_id: string; created_at: string };
export type CatchUpCustomer = { id: string; created_at: string };

/**
 * The catch-up: jobs still at Lead that nobody has contacted, and customers at New without a job,
 * whose chat has a message from us since they came in (`latest`: each customer's newest message from
 * us). `customers`: everyone it would move, once each, in a fixed order (so it can go in batches).
 */
export function catchUpPick(c: { jobs: CatchUpJob[]; loose: CatchUpCustomer[]; latest: Map<string, string> }): {
  jobs: CatchUpJob[];
  loose: CatchUpCustomer[];
  customers: string[];
} {
  const messaged = (enquiryId: string, since: string) => {
    const at = c.latest.get(enquiryId);
    return !!at && ms(at) >= ms(since) - GRACE_MS;
  };
  const jobs = c.jobs.filter((j) => messaged(j.enquiry_id, j.created_at));
  const loose = c.loose.filter((e) => messaged(e.id, e.created_at));
  const customers = [...new Set([...jobs.map((j) => j.enquiry_id), ...loose.map((e) => e.id)])].sort();
  return { jobs, loose, customers };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONDON = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: 'numeric', day: 'numeric' });

/** "messaged on WhatsApp on 3 Sep" (UK date; with the year when it isn't this year), for the timeline. */
export function contactNote(at: string, now = Date.now()): string {
  const part = (d: number, t: string) => Number(LONDON.formatToParts(d).find((p) => p.type === t)?.value);
  const when = ms(at);
  const year = part(when, 'year');
  return `messaged on WhatsApp on ${part(when, 'day')} ${MONTHS[part(when, 'month') - 1]}${year !== part(now, 'year') ? ` ${year}` : ''}`;
}
