import { createAdminClient } from '@/lib/supabase/admin';
import { reportCounts, type ReportJob, type ReportOrigin } from '@/lib/crm/report-counts';
import { spendTable, type AdSpendReport } from '@/lib/ad-spend';
import { adSpendFigures } from '@/lib/meta-ads';

/**
 * The CRM's sales numbers for a period (by source and campaign, by person, the funnel) with Meta's ad spend beside them.
 * Shared by CRM → Reports (GET /api/crm/reports) and Metis, so both always say the same thing.
 */
export async function salesReport(days: number, spending: ReturnType<typeof adSpendFigures>, adSpendOn: boolean) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const db = createAdminClient();
  const { data: projects, error } = await db
    .from('crm_projects')
    .select('id, enquiry_id, stage, value, owner_id, created_at, first_contact_at, survey_at, accepted_at')
    .gte('created_at', since)
    .limit(5000);
  if (error) throw new Error(error.message);
  // Leads that merges moved or joined (merge.sql; none before it's run): a job's own lead, and leads
  // joined into another job, counted once, with nothing sold (src/lib/crm/report-counts.ts). A job's own
  // lead carries the job's date, so the period's jobs have theirs here.
  const origins = await db
    .from('crm_lead_origins')
    .select('project_id, role, source, came_in_at, job_created_at, first_contact_at, owner_id, meta_ad_id')
    .gte('job_created_at', since)
    .limit(5000)
    .then(
      (r) => (r.error ? [] : ((r.data ?? []) as ReportOrigin[])),
      () => [] as ReportOrigin[]
    );
  const jobs = (projects ?? []) as ReportJob[];
  const ids = [...new Set(jobs.map((p) => p.enquiry_id))];
  type Enq = { id: string; source: string | null; created_at?: string | null; meta_ad_id?: string | null };
  const enquiries = async (): Promise<Enq[]> => {
    if (!ids.length) return [];
    // The ad each lead came from (ad-spend.sql), only needed beside the ad spend.
    if (adSpendOn) {
      const withAd = await db.from('enquiries').select('id, source, created_at, meta_ad_id').in('id', ids);
      if (!withAd.error) return withAd.data ?? [];
    }
    const { data } = await db.from('enquiries').select('id, source, created_at').in('id', ids);
    return data ?? [];
  };
  const [enq, { data: people }] = await Promise.all([enquiries(), db.from('profiles').select('id, full_name, email')]);
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email || 'Someone']));
  const { totals, bySource, byOwner, funnel, outcomes } = reportCounts({ jobs, customers: enq, origins, names: name, from: since });
  const figures = await spending;
  const adSpend: AdSpendReport =
    figures.state === 'ok'
      ? {
          state: 'ok',
          currency: figures.currency,
          since: figures.since,
          until: figures.until,
          fetchedAt: figures.fetchedAt,
          todayAt: figures.todayAt,
          pastAt: figures.pastAt,
          namesAt: figures.namesAt,
          refresh: figures.refresh,
          warning: figures.warning,
          ...spendTable(outcomes, figures.ads, figures.account, figures.pastNames),
        }
      : figures;
  return { days, totals, bySource, byOwner, funnel, adSpend };
}
