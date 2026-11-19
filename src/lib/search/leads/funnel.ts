import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Period } from '../metrics';
import {
  addDays,
  backfillPreview,
  buildLeads,
  channelFunnel,
  inRange,
  ukStart,
  type BackfillChange,
  type ChannelRow,
  type EnquiryRow,
  type Funnel,
  type Lead,
  type OriginRow,
  type ProjectRow,
  type QuoteRow,
  type SurveyRow,
} from './aggregate';

/**
 * Reads the rows behind the M8 funnel (spec §5 M8): enquiries that came in during a period, the CRM jobs made from
 * them (crm_projects.enquiry_id), their quotes (crm_quotes) and surveys (crm_surveys), and the leads CRM merges kept
 * (crm_lead_origins). The sums are pure, in ./aggregate.ts.
 */

type Db = ReturnType<typeof createAdminClient>;

const CHUNK = 150;
const chunks = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, (i + 1) * CHUNK));

async function inChunks<T>(ids: string[], read: (part: string[]) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  if (!ids.length) return [];
  const parts = await Promise.all(chunks(ids).map((part) => read(part)));
  return parts.flatMap((r) => (r.error ? [] : ((r.data ?? []) as T[])));
}

/** Every lead that came in between two UK dates (inclusive), with how far each got in the CRM. */
export async function loadLeads(start: string, end: string, db: Db = createAdminClient()): Promise<Lead[]> {
  const from = ukStart(start);
  const to = ukStart(addDays(end, 1));
  const [enqRes, originRes] = await Promise.all([
    db
      .from('enquiries')
      .select('id, name, created_at, source, channel, landing_path, referrer_host, postcode')
      .gte('created_at', from)
      .lt('created_at', to)
      .order('created_at', { ascending: false })
      .limit(20000),
    db
      .from('crm_lead_origins')
      .select('id, project_id, enquiry_id, role, source, came_in_at, job_created_at, channel, landing_path, referrer_host')
      .or(`and(came_in_at.gte."${from}",came_in_at.lt."${to}"),and(came_in_at.is.null,job_created_at.gte."${from}",job_created_at.lt."${to}")`)
      .limit(5000)
      .then(
        (r) => r,
        () => ({ data: [], error: null }),
      ),
  ]);
  if (enqRes.error) throw new Error(enqRes.error.message);
  const enquiries = (enqRes.data ?? []) as EnquiryRow[];
  const periodOrigins = (originRes.error ? [] : (originRes.data ?? [])) as OriginRow[];

  const byEnquiry = await inChunks<ProjectRow>(
    enquiries.map((e) => e.id),
    (part) => db.from('crm_projects').select('id, enquiry_id, stage, value, survey_at').in('enquiry_id', part),
  );
  // Jobs that moved to these customers in a merge keep their own lead (an "own" origin), which may be from another period.
  const movedOrigins = await inChunks<OriginRow>(
    byEnquiry.map((p) => p.id),
    (part) => db.from('crm_lead_origins').select('id, project_id, enquiry_id, role, source, came_in_at, job_created_at, channel, landing_path, referrer_host').eq('role', 'own').in('project_id', part),
  );
  const have = new Set(byEnquiry.map((p) => p.id));
  const originProjects = await inChunks<ProjectRow>(
    [...new Set(periodOrigins.filter((o) => o.role === 'own' && !have.has(o.project_id)).map((o) => o.project_id))],
    (part) => db.from('crm_projects').select('id, enquiry_id, stage, value, survey_at').in('id', part),
  );
  const projects = [...byEnquiry, ...originProjects];
  const ids = projects.map((p) => p.id);
  const [quotes, surveys] = await Promise.all([
    inChunks<QuoteRow>(ids, (part) => db.from('crm_quotes').select('project_id, status, sent_at').in('project_id', part)),
    inChunks<SurveyRow>(ids, (part) => db.from('crm_surveys').select('project_id, status').in('project_id', part)),
  ]);

  // The moved jobs' own origins only stop the job counting for its new customer; a lead of their own only in their period.
  const periodIds = new Set(periodOrigins.map((o) => o.id));
  const leads = buildLeads({ enquiries, projects, quotes, surveys, origins: [...periodOrigins, ...movedOrigins.filter((o) => !periodIds.has(o.id))] });
  return leads.filter((l) => inRange(l, start, end));
}

export type LeadsByChannel = {
  period: Period;
  rows: ChannelRow[];
  total: { now: Funnel; before: Funnel };
  organic: { now: Funnel; before: Funnel };
  /** What the numbers mean, for anyone quoting them (the Growth Report prints it). */
  basis: string;
};

export const LEADS_BASIS =
  'Enquiries that came in during the period (CRM enquiries plus leads kept by merges), by the channel captured on the website form. Older enquiries with no channel count as Meta when their source is a Meta lead form, otherwise as “Before tracking began”. Surveys, quotes and won jobs are how far those enquiries have got today; value is the won jobs’ price inc. VAT.';

/**
 * The per-channel funnel for a period and the period it is compared with (the Monthly Growth Report imports this).
 * Pass `leads` when they are already loaded for both ranges, to save the reads.
 */
export async function leadsByChannel(period: Period, db: Db = createAdminClient(), leads?: { now: Lead[]; before: Lead[] }): Promise<LeadsByChannel> {
  const [now, before] = leads ? [leads.now, leads.before] : await Promise.all([loadLeads(period.start, period.end, db), loadLeads(period.compareStart, period.compareEnd, db)]);
  return { period, ...channelFunnel(now, before), basis: LEADS_BASIS };
}

/** Older rows with no channel whose source names one (the backfill preview), newest first. */
export async function backfillCandidates(db: Db = createAdminClient()): Promise<BackfillChange[]> {
  const [enq, origins] = await Promise.all([
    db.from('enquiries').select('id, name, created_at, source, channel').is('channel', null).limit(20000),
    db
      .from('crm_lead_origins')
      .select('id, source, came_in_at, job_created_at, channel')
      .is('channel', null)
      .limit(5000)
      .then(
        (r) => r,
        () => ({ data: [], error: null }),
      ),
  ]);
  if (enq.error) throw new Error(enq.error.message);
  type E = { id: string; name: string | null; created_at: string; source: string | null; channel: string | null };
  type O = { id: string; source: string | null; came_in_at: string | null; job_created_at: string; channel: string | null };
  return backfillPreview([
    ...((enq.data ?? []) as E[]).map((e) => ({ table: 'enquiries' as const, id: e.id, at: e.created_at, name: e.name, source: e.source, channel: e.channel })),
    ...((origins.error ? [] : (origins.data ?? [])) as O[]).map((o) => ({ table: 'crm_lead_origins' as const, id: o.id, at: o.came_in_at ?? o.job_created_at, name: null, source: o.source, channel: o.channel })),
  ]);
}
