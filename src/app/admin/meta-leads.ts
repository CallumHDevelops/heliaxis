import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { ukDay } from '@/lib/bank-holidays';
import { isProjectStage } from '@/lib/crm/stages';
import { relativeTime } from '@/lib/enquiries';
import { isMetaLead, metaAdLabel } from '@/lib/lead-source';
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
  /** The ad's name, "Organic", "WhatsApp ad"… (metaAdLabel). */
  ad: string;
  at: string;
  /** "2h ago". */
  ago: string;
  /** Open: their open job (CRM), else their details on Enquiries; null when this person can open neither. */
  href: string | null;
  /** WhatsApp them (the Enquiries inbox); null without a phone number or access to it. */
  chat: string | null;
};
export type HubMetaLeads = {
  /** New Meta leads, all of them. */
  count: number;
  /** More than we read (LIMIT): show the count with a "+". */
  more: boolean;
  /** How many of them came in today (UK time). */
  today: number;
  /** The newest few. */
  rows: HubMetaLead[];
  /** With none new: when the last Meta lead came in ("3 days ago"), or null if there's never been one. */
  last: string | null;
  /** The footer's link to the list (Enquiries staff only). */
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

type Row = { id: string; name: string; postcode: string | null; phone: string | null; source: string | null; created_at: string; customer_ref?: string | null };

/**
 * Dashboard → New Meta leads, for Enquiries and CRM staff: enquiries still at New that came from Meta,
 * newest first, how many came in today, and for CRM staff each one's open job. Every read is
 * defensive: a failure hides the panel rather than the dashboard.
 */
export async function newMetaLeads(keys: PortalKey[], now = Date.now()): Promise<HubMetaLeads | null> {
  const enquiries = keys.includes('enquiries');
  const crm = keys.includes('crm');
  if (!enquiries && !crm) return null;
  const db = createAdminClient();
  const read = (cols: string) =>
    db.from('enquiries').select(cols).eq('status', 'new').or(META_OR).order('created_at', { ascending: false }).limit(LIMIT);
  let r = await read('id, name, postcode, phone, source, created_at, customer_ref');
  if (r.error && missingColumn(r.error)) r = await read('id, name, postcode, phone, source, created_at');
  if (r.error) return null;
  const all = ((r.data ?? []) as unknown as Row[]).filter((e) => isMetaLead(e.source));
  const today = ukDay(now);
  const top = all.slice(0, SHOWN);

  // Each one's jobs, newest first, for Open (CRM staff). No CRM tables yet: none.
  const jobsOf = new Map<string, { id: string; stage: string }[]>();
  if (crm && top.length) {
    const { data, error } = await db
      .from('crm_projects')
      .select('id, enquiry_id, stage, created_at')
      .in('enquiry_id', top.map((e) => e.id))
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

  return {
    count: all.length,
    more: (r.data?.length ?? 0) >= LIMIT,
    today: all.filter((e) => ukDay(e.created_at) === today).length,
    rows: top.map((e) => {
      const job = jobFor(e.id);
      return {
        id: e.id,
        name: e.name,
        ref: e.customer_ref || null,
        postcode: e.postcode || null,
        phone: e.phone || null,
        ad: metaAdLabel(e.source) ?? 'Meta',
        at: e.created_at,
        ago: relativeTime(e.created_at),
        href: job ? (isProjectStage(job.stage) ? `/admin/projects/${job.id}` : `/admin/crm/${job.id}`) : enquiries ? `/admin/enquiries?open=${e.id}` : null,
        chat: enquiries && e.phone ? `/admin/enquiries/inbox/${e.id}` : null,
      };
    }),
    last,
    seeAll: enquiries ? '/admin/enquiries?source=meta&status=new' : null,
  };
}
