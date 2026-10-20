import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, json } from '@/lib/crm/server';
import { isWonStage, STAGE_KEYS } from '@/lib/crm/stages';
import { spendTable, type AdSpendReport, type LeadOutcome } from '@/lib/ad-spend';
import { adSpendConfigured, adSpendFigures } from '@/lib/meta-ads';

export const dynamic = 'force-dynamic';
// Meta can be slow the first time a period is asked for (after that it's cached).
export const maxDuration = 60;

const at = (s: string) => STAGE_KEYS.indexOf(s as (typeof STAGE_KEYS)[number]);

/**
 * Sales numbers for a period: by source / campaign, by person, the funnel, response times and Meta
 * ad spend. ?refresh=1 ("Refresh from Meta"): Meta's ad names and today's figures asked for now.
 */
export async function GET(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const url = new URL(req.url);
  const days = Math.min(730, Math.max(7, Number(url.searchParams.get('days')) || 90));
  const refresh = url.searchParams.get('refresh') === '1';
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const db = createAdminClient();
  // Asked for alongside the CRM's own numbers; never throws.
  const spending = adSpendFigures(days, { refresh });
  const { data: projects, error } = await db
    .from('crm_projects')
    .select('id, enquiry_id, stage, value, owner_id, created_at, first_contact_at, survey_at, accepted_at')
    .gte('created_at', since)
    .limit(5000);
  if (error) return json({ error: error.message }, 500);
  const ids = [...new Set((projects ?? []).map((p) => p.enquiry_id))];
  type Enq = { id: string; source: string | null; created_at?: string | null; meta_ad_id?: string | null };
  const enquiries = async (): Promise<Enq[]> => {
    if (!ids.length) return [];
    // The ad each lead came from (ad-spend.sql), only needed beside the ad spend.
    if (adSpendConfigured()) {
      const withAd = await db.from('enquiries').select('id, source, created_at, meta_ad_id').in('id', ids);
      if (!withAd.error) return withAd.data ?? [];
    }
    const { data } = await db.from('enquiries').select('id, source, created_at').in('id', ids);
    return data ?? [];
  };
  const [enq, { data: people }] = await Promise.all([enquiries(), db.from('profiles').select('id, full_name, email')]);
  const src = new Map(enq.map((e) => [e.id, (e.source || 'unknown').trim()]));
  const adOf = new Map(enq.map((e) => [e.id, e.meta_ad_id ?? null]));
  const cameIn = new Map(enq.map((e) => [e.id, e.created_at ?? null]));
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email || 'Someone']));

  type Row = { key: string; leads: number; surveys: number; won: number; lost: number; value: number };
  const blank = (key: string): Row => ({ key, leads: 0, surveys: 0, won: 0, lost: 0, value: 0 });
  const bySource = new Map<string, Row>();
  const byOwner = new Map<string, Row>();
  const responses: number[] = [];
  const funnel = STAGE_KEYS.filter((k) => k !== 'lost').map((k) => ({ key: k, n: 0 }));
  const outcomes: LeadOutcome[] = [];

  for (const p of projects ?? []) {
    const source = src.get(p.enquiry_id) || 'unknown';
    const owner = p.owner_id ? name.get(p.owner_id) || 'Someone' : 'Unassigned';
    const won = isWonStage(p.stage);
    const surveyed = !!p.survey_at || at(p.stage) >= at('survey_booked');
    for (const [map, key] of [
      [bySource, source],
      [byOwner, owner],
    ] as const) {
      const r = map.get(key) ?? blank(key);
      r.leads++;
      if (surveyed && p.stage !== 'lost') r.surveys++;
      if (won) {
        r.won++;
        r.value += Number(p.value) || 0;
      }
      if (p.stage === 'lost') r.lost++;
      map.set(key, r);
    }
    outcomes.push({
      source,
      metaAdId: adOf.get(p.enquiry_id),
      at: cameIn.get(p.enquiry_id),
      surveyed,
      won,
      lost: p.stage === 'lost',
      value: won ? Number(p.value) || 0 : 0,
    });
    if (p.stage !== 'lost') for (const f of funnel) if (at(p.stage) >= at(f.key)) f.n++;
    if (p.first_contact_at) responses.push((new Date(p.first_contact_at).getTime() - new Date(p.created_at).getTime()) / 60_000);
  }
  responses.sort((a, b) => a - b);
  const median = responses.length ? responses[Math.floor(responses.length / 2)] : null;
  const all = [...bySource.values()];
  const won = all.reduce((n, r) => n + r.won, 0);
  const lost = all.reduce((n, r) => n + r.lost, 0);
  const sort = (m: Map<string, Row>) => [...m.values()].sort((a, b) => b.value - a.value || b.leads - a.leads);
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
  return json({
    days,
    totals: {
      leads: (projects ?? []).length,
      won,
      value: all.reduce((n, r) => n + r.value, 0),
      winRate: won + lost ? won / (won + lost) : null,
      medianResponseMins: median,
      contactedWithin15: responses.length ? responses.filter((m) => m <= 15).length / responses.length : null,
    },
    bySource: sort(bySource),
    byOwner: sort(byOwner),
    funnel,
    /** Meta spend beside the Meta rows of bySource, grouped by campaign ('off' until it's set up). */
    adSpend,
    /** Admins get the CSV export buttons (GET /api/crm/export). */
    canExport: s.profile.role === 'admin',
  });
}
