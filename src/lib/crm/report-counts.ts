import { isWonStage, STAGE_KEYS } from './stages';
import type { LeadOutcome } from '../ad-spend';

/**
 * CRM → Reports' own numbers (src/app/api/crm/reports/route.ts reads the rows): leads, surveys, sales
 * and value by source and by person, the funnel, response times and each lead's outcome for the ad
 * spend. Pure, so scripts/test-merge.mjs checks it.
 *
 * One lead per job made in the period, with the source, ad and came-in date of its customer, unless
 * the job has an 'own' lead origin (it moved to another customer in a merge: its own lead stays). A
 * lead joined into another job in a merge (an 'also' origin) still counts as a lead for its source, with
 * nothing sold: the sale is the job's, so it's counted once, for the job's source.
 */

export type ReportJob = {
  id: string;
  enquiry_id: string;
  stage: string;
  value: number | string | null;
  owner_id: string | null;
  created_at: string;
  first_contact_at: string | null;
  survey_at: string | null;
};
export type ReportCustomer = { id: string; source: string | null; created_at?: string | null; meta_ad_id?: string | null };
export type ReportOrigin = {
  project_id: string;
  role: 'own' | 'also';
  source: string;
  came_in_at: string | null;
  job_created_at: string;
  first_contact_at: string | null;
  owner_id: string | null;
  meta_ad_id: string | null;
};
export type ReportRow = { key: string; leads: number; surveys: number; won: number; lost: number; value: number; joined?: number };

const at = (s: string) => STAGE_KEYS.indexOf(s as (typeof STAGE_KEYS)[number]);
const since = (iso: string | null | undefined, from: string) => !!iso && Date.parse(iso) >= Date.parse(from);

export function reportCounts(p: {
  jobs: ReportJob[];
  customers: ReportCustomer[];
  origins: ReportOrigin[];
  /** Profile id → name. */
  names: Map<string, string>;
  /** The period's start (ISO). */
  from: string;
}) {
  const customer = new Map(p.customers.map((c) => [c.id, c]));
  const own = new Map(p.origins.filter((o) => o.role === 'own').map((o) => [o.project_id, o]));
  const ownerName = (id: string | null) => (id ? p.names.get(id) || 'Someone' : 'Unassigned');

  type Row = ReportRow;
  const blank = (key: string): Row => ({ key, leads: 0, surveys: 0, won: 0, lost: 0, value: 0 });
  const bySource = new Map<string, Row>();
  const byOwner = new Map<string, Row>();
  const responses: number[] = [];
  const funnel = STAGE_KEYS.filter((k) => k !== 'lost').map((k) => ({ key: k, n: 0 }));
  const outcomes: LeadOutcome[] = [];
  const row = (map: Map<string, Row>, key: string) => {
    const r = map.get(key) ?? blank(key);
    map.set(key, r);
    return r;
  };

  let leads = 0;
  for (const j of p.jobs) {
    const o = own.get(j.id);
    // A job that moved customer in a merge is counted from when its own lead came in.
    if (!since(o ? o.job_created_at : j.created_at, p.from)) continue;
    const c = customer.get(j.enquiry_id);
    const source = ((o ? o.source : c?.source) || 'unknown').trim() || 'unknown';
    const won = isWonStage(j.stage);
    const lost = j.stage === 'lost';
    const surveyed = !!j.survey_at || at(j.stage) >= at('survey_booked');
    const value = won ? Number(j.value) || 0 : 0;
    leads++;
    for (const r of [row(bySource, source), row(byOwner, ownerName(j.owner_id))]) {
      r.leads++;
      if (surveyed && !lost) r.surveys++;
      if (won) {
        r.won++;
        r.value += value;
      }
      if (lost) r.lost++;
    }
    outcomes.push({ source, metaAdId: o ? o.meta_ad_id : (c?.meta_ad_id ?? null), at: o ? o.came_in_at : (c?.created_at ?? null), surveyed, won, lost, value });
    if (!lost) for (const f of funnel) if (at(j.stage) >= at(f.key)) f.n++;
    if (j.first_contact_at) responses.push((Date.parse(j.first_contact_at) - Date.parse(j.created_at)) / 60_000);
  }

  // Leads joined into another job: one lead each for their source, nothing sold (the job's sale counts once).
  for (const o of p.origins) {
    if (o.role !== 'also' || !since(o.job_created_at, p.from)) continue;
    const source = (o.source || 'unknown').trim() || 'unknown';
    leads++;
    for (const r of [row(bySource, source), row(byOwner, ownerName(o.owner_id))]) {
      r.leads++;
      r.joined = (r.joined ?? 0) + 1;
    }
    outcomes.push({ source, metaAdId: o.meta_ad_id, at: o.came_in_at, surveyed: false, won: false, lost: false, value: 0 });
    if (o.first_contact_at) responses.push((Date.parse(o.first_contact_at) - Date.parse(o.job_created_at)) / 60_000);
  }

  responses.sort((a, b) => a - b);
  const all = [...bySource.values()];
  const won = all.reduce((n, r) => n + r.won, 0);
  const lost = all.reduce((n, r) => n + r.lost, 0);
  const sort = (m: Map<string, Row>) => [...m.values()].sort((a, b) => b.value - a.value || b.leads - a.leads);
  return {
    totals: {
      leads,
      won,
      value: all.reduce((n, r) => n + r.value, 0),
      winRate: won + lost ? won / (won + lost) : null,
      medianResponseMins: responses.length ? responses[Math.floor(responses.length / 2)] : null,
      contactedWithin15: responses.length ? responses.filter((m) => m <= 15).length / responses.length : null,
    },
    bySource: sort(bySource),
    byOwner: sort(byOwner),
    funnel,
    outcomes,
  };
}
