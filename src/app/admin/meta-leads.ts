import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { ukDay } from '@/lib/bank-holidays';
import { isProjectStage } from '@/lib/crm/stages';
import { relativeTime } from '@/lib/enquiries';
import { isMetaLead } from '@/lib/lead-source';
import { sourcesNow } from '@/lib/lead-source-server';
import { byUrgency, followUp, QUIET_AFTER_HOURS, QUIET_LEAD_DAYS, type FollowUp, type FollowUpKey } from '@/lib/meta-lead-followup';
import { missingColumn } from '@/lib/projects/server';
import type { PortalKey } from '@/lib/portals';

/** One new Meta lead on the dashboard. Times are worked out here, so the page shows what the server said. */
export type HubMetaLead = {
  id: string;
  name: string;
  /** HX-0042 (customer-refs.sql); null before that's been run. */
  ref: string | null;
  postcode: string | null;
  phone: string | null;
  /** The ad's name now, "Organic", "WhatsApp ad"… (src/lib/lead-source.ts sourceNow). */
  ad: string;
  /** "was Video 1" when the ad has been renamed since they came in. */
  note: string | null;
  at: string;
  /** "2h ago". */
  ago: string;
  /** Why they're here: "Free chat ends in 4h", "Not contacted", "Quiet for 2 days" (src/lib/meta-lead-followup.ts). */
  why: { key: FollowUpKey; label: string };
  /** Open: their open job (CRM), else their details on Enquiries; null when this person can open neither. */
  href: string | null;
  /** WhatsApp them (the Enquiries inbox); null without a phone number or access to it. */
  chat: string | null;
};
export type HubMetaLeads = {
  /** Meta leads someone needs to get to, all of them. */
  count: number;
  /** More than we read (LIMIT): show the count with a "+". */
  more: boolean;
  /** How many of them came in today (UK time). */
  today: number;
  /** The most urgent few. */
  rows: HubMetaLead[];
  /** With none to get to: when the last Meta lead came in ("3 days ago"), or null if there's never been one. */
  last: string | null;
  /** How many of them haven't been contacted (the footer's link lists those). */
  notContacted: number;
  /** The footer's link to the ones not contacted (Enquiries staff only). */
  seeAll: string | null;
};

const LIMIT = 1000;
const SHOWN = 6;
// Narrowed in the query, then exactly in code (isMetaLead): Meta's forms and ad links, and WhatsApp ad chats.
const META_OR = 'source.ilike.meta%,source.ilike.whatsapp-ad%';

/** "5 minutes ago", "yesterday", "3 days ago", "on 12 Oct": the empty panel's "The last one came in …". */
function cameIn(iso: string, now: number) {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  const days = Math.round((Date.parse(`${ukDay(now)}T12:00:00Z`) - Date.parse(`${ukDay(iso)}T12:00:00Z`)) / 86_400_000);
  if (days <= 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const d = new Date(iso);
  const sameYear = ukDay(iso).slice(0, 4) === ukDay(now).slice(0, 4);
  return `on ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'Europe/London' })}`;
}

type Row = {
  id: string;
  name: string;
  postcode: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  created_at: string;
  customer_ref?: string | null;
  wa_last_inbound_at?: string | null;
  wa_last_message_at?: string | null;
};
type Db = ReturnType<typeof createAdminClient>;
type Read = { data: unknown[] | null; error: { code?: string; message?: string } | null };

const BASE = 'id, name, postcode, phone, source, status, created_at';
const WA = 'wa_last_inbound_at, wa_last_message_at';
/** Widest first: the customer refs (customer-refs.sql) and the chat times (whatsapp.sql), until a read works. */
const COLUMNS = [`${BASE}, customer_ref, ${WA}`, `${BASE}, ${WA}`, `${BASE}, customer_ref`, BASE];
const BATCH = 100;

/** The first of COLUMNS the database has; null when even the narrowest fails. */
async function readWith(read: (cols: string) => PromiseLike<Read>): Promise<{ rows: Row[]; cols: string } | null> {
  for (const cols of COLUMNS) {
    const r = await read(cols);
    if (!r.error) return { rows: (r.data ?? []) as Row[], cols };
    if (!missingColumn(r.error)) return null;
  }
  return null;
}

/** Customers with a message lined up: pending, or going now. None when the outbox can't be read. */
async function queuedFor(db: Db): Promise<Set<string>> {
  const { data, error } = await db.from('whatsapp_outbox').select('enquiry_id').in('status', ['pending', 'sending']).limit(5000);
  return new Set(error ? [] : ((data ?? []) as { enquiry_id: string }[]).map((o) => o.enquiry_id));
}

/** Of these customers, the ones with a survey booked or done on a job. None without the CRM tables. */
async function surveysFor(db: Db, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const reads = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    reads.push(db.from('crm_projects').select('enquiry_id').in('enquiry_id', ids.slice(i, i + BATCH)).in('stage', ['survey_booked', 'surveyed']));
  }
  for (const r of await Promise.all(reads)) for (const p of r.error ? [] : ((r.data ?? []) as { enquiry_id: string }[])) out.add(p.enquiry_id);
  return out;
}

/**
 * Dashboard → New Meta leads, for Enquiries and CRM staff: the Meta leads someone needs to get to now
 * (src/lib/meta-lead-followup.ts: free chat ending, not contacted, gone quiet; none with a message
 * lined up), most urgent first, how many came in today, and for CRM staff each one's open job. Every
 * read is defensive: a failure hides the panel rather than the dashboard.
 */
export async function newMetaLeads(keys: PortalKey[], now = Date.now()): Promise<HubMetaLeads | null> {
  const enquiries = keys.includes('enquiries');
  const crm = keys.includes('crm');
  if (!enquiries && !crm) return null;
  const db = createAdminClient();
  const iso = (ms: number) => new Date(ms).toISOString();
  const metaLeads = (cols: string) => db.from('enquiries').select(cols).or(META_OR);

  // Everyone still at New, then (once the chat times are there) those we've been in touch with whose
  // free chat is open, or who came in lately and have gone quiet.
  const fresh = await readWith((cols) => metaLeads(cols).eq('status', 'new').order('created_at', { ascending: false }).limit(LIMIT));
  if (!fresh) return null;
  const chats = fresh.cols.includes('wa_last_inbound_at');
  const [talking, quiet, queued] = await Promise.all([
    chats
      ? metaLeads(fresh.cols).eq('status', 'contacted').gte('wa_last_inbound_at', iso(now - 24 * 3_600_000)).limit(LIMIT)
      : null,
    chats
      ? metaLeads(fresh.cols)
          .eq('status', 'contacted')
          .gte('created_at', iso(now - QUIET_LEAD_DAYS * 86_400_000))
          .lte('wa_last_message_at', iso(now - QUIET_AFTER_HOURS * 3_600_000))
          .limit(LIMIT)
      : null,
    queuedFor(db),
  ]);
  const seen = new Set<string>();
  const leads = [...fresh.rows, ...((talking?.data ?? []) as unknown as Row[]), ...((quiet?.data ?? []) as unknown as Row[])].filter(
    (e) => isMetaLead(e.source) && !seen.has(e.id) && !!seen.add(e.id)
  );
  const surveys = await surveysFor(db, leads.filter((e) => e.status !== 'new').map((e) => e.id));
  const all = leads
    .map((e) => ({ e, why: followUp(e, { queued: queued.has(e.id), surveyBooked: surveys.has(e.id), now }) }))
    .filter((x): x is { e: Row; why: FollowUp } => !!x.why)
    .sort((a, b) => byUrgency(a.why, b.why));
  const today = ukDay(now);
  const top = all.slice(0, SHOWN);
  // Each one's ad by its name now (they keep the name it had when they came in).
  const shown = sourcesNow(top.map((x) => x.e));

  // Each one's jobs, newest first, for Open (CRM staff). No CRM tables yet: none.
  const jobsOf = new Map<string, { id: string; stage: string }[]>();
  if (crm && top.length) {
    const { data, error } = await db
      .from('crm_projects')
      .select('id, enquiry_id, stage, created_at')
      .in('enquiry_id', top.map((x) => x.e.id))
      .order('created_at', { ascending: false });
    for (const p of error ? [] : ((data ?? []) as { id: string; enquiry_id: string; stage: string }[])) {
      jobsOf.set(p.enquiry_id, [...(jobsOf.get(p.enquiry_id) ?? []), p]);
    }
  }
  /** Their latest open job; for someone without Enquiries (nowhere else to open them) a closed one will do. */
  const jobFor = (id: string) => {
    const theirs = jobsOf.get(id) ?? [];
    return theirs.find((p) => p.stage !== 'complete' && p.stage !== 'lost') ?? (enquiries ? undefined : theirs[0]);
  };

  let last: string | null = null;
  if (!all.length) {
    const { data } = await db.from('enquiries').select('source, created_at').or(META_OR).order('created_at', { ascending: false }).limit(50);
    const newest = ((data ?? []) as { source: string | null; created_at: string }[]).find((e) => isMetaLead(e.source));
    last = newest ? cameIn(newest.created_at, now) : null;
  }
  const ads = await shown;
  const notContacted = all.filter((x) => x.why.key === 'new').length;

  return {
    count: all.length,
    more: [fresh.rows, talking?.data, quiet?.data].some((d) => (d?.length ?? 0) >= LIMIT),
    today: all.filter((x) => ukDay(x.e.created_at) === today).length,
    rows: top.map(({ e, why }) => {
      const job = jobFor(e.id);
      return {
        id: e.id,
        name: e.name,
        ref: e.customer_ref || null,
        postcode: e.postcode || null,
        phone: e.phone || null,
        ad: ads.get(e.id)?.ad ?? 'Meta',
        note: ads.get(e.id)?.note ?? null,
        at: e.created_at,
        ago: relativeTime(e.created_at),
        why: { key: why.key, label: why.label },
        href: job ? (isProjectStage(job.stage) ? `/admin/projects/${job.id}` : `/admin/crm/${job.id}`) : enquiries ? `/admin/enquiries?open=${e.id}` : null,
        chat: enquiries && e.phone ? `/admin/enquiries/inbox/${e.id}` : null,
      };
    }),
    last,
    notContacted,
    seeAll: enquiries && notContacted ? '/admin/enquiries?source=meta&status=new' : null,
  };
}
