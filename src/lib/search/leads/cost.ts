import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { adSpendFigures } from '@/lib/meta-ads';
import { loadAssumptions } from '@/lib/social/assumptions';
import { addDays, costPerEnquiry, isOrganic, usdToPence, type Lead } from './aggregate';

/**
 * Cost per enquiry: organic search against Meta ads, over the same last 30 days (spec §5 M8).
 *
 * Meta's spend comes from the ad account through src/lib/meta-ads.ts (the same cached figures as CRM → Reports), and
 * Meta only gives it for 30 days, 90 days or a year: so both sides use the last 30 days, whatever period is picked.
 * Search's side is what the portal itself costs to run: every paid call it logged in seo_api_call (DataForSEO and any
 * other vendor logged there) plus AI calls whose ai_usage feature starts with "search" or "seo". It does NOT include
 * staff time, writing time, hosting or the website itself, so it is the running cost, not the full cost of organic.
 */

type Db = ReturnType<typeof createAdminClient>;

export type CostSide = {
  label: string;
  enquiries: number;
  /** Pence; null when the spend could not be read. */
  spend: number | null;
  perEnquiry: number | null;
  currency: string;
  includes: string[];
  note: string | null;
};

export type CostCompare = { start: string; end: string; organic: CostSide; meta: CostSide };

export async function costCompare(today: string, leads: Lead[], db: Db = createAdminClient()): Promise<CostCompare> {
  const start = addDays(today, -29);
  const [meta, calls, ai, fx] = await Promise.all([
    adSpendFigures(30),
    db.from('seo_api_call').select('vendor, cost_usd').gte('at', `${start}T00:00:00Z`).limit(50000),
    db
      .from('ai_usage')
      .select('feature, cost_usd')
      .gte('at', `${start}T00:00:00Z`)
      .or('feature.like.search%,feature.like.seo%')
      .limit(20000)
      .then(
        (r) => r,
        () => ({ data: [], error: null }),
      ),
    loadAssumptions(),
  ]);

  const byVendor = new Map<string, number>();
  for (const r of (calls.data ?? []) as { vendor: string; cost_usd: number | string }[]) byVendor.set(r.vendor, (byVendor.get(r.vendor) ?? 0) + Number(r.cost_usd || 0));
  const aiRows = (ai.error ? [] : (ai.data ?? [])) as { feature: string; cost_usd: number | string }[];
  const aiUsd = aiRows.reduce((s, r) => s + Number(r.cost_usd || 0), 0);
  const searchUsd = [...byVendor.values()].reduce((s, v) => s + v, 0) + aiUsd;
  const organicSpend = calls.error ? null : usdToPence(searchUsd, fx.usd_to_gbp);
  const organicN = leads.filter((l) => isOrganic(l.channel)).length;
  const metaN = leads.filter((l) => l.channel === 'paid_meta').length;
  const usd = (v: number) => `$${v.toFixed(2)}`;

  const metaSpend = meta.state === 'ok' ? (meta.account?.spend ?? meta.ads.reduce((s, a) => s + a.spend, 0)) : null;
  return {
    start,
    end: today,
    organic: {
      label: 'Organic (Google, Bing, Business Profile, AI assistants)',
      enquiries: organicN,
      spend: organicSpend,
      perEnquiry: costPerEnquiry(organicSpend, organicN),
      currency: 'GBP',
      includes: [
        ...[...byVendor.entries()].map(([v, c]) => `${v} calls logged by Search: ${usd(c)}`),
        ...(byVendor.size ? [] : ['No paid Search calls logged in these 30 days']),
        aiRows.length ? `AI calls tagged to Search (${[...new Set(aiRows.map((r) => r.feature))].join(', ')}): ${usd(aiUsd)}` : 'No AI calls tagged to Search in ai_usage (none are tagged yet)',
        `Converted at ${fx.usd_to_gbp} pounds to the dollar (Social → Costs)`,
        'Not included: staff and writing time, hosting, the website build',
      ],
      note: calls.error ? 'The Search call log could not be read.' : null,
    },
    meta: {
      label: 'Meta ads',
      enquiries: metaN,
      spend: metaSpend,
      perEnquiry: costPerEnquiry(metaSpend, metaN),
      currency: meta.state === 'ok' ? meta.currency : 'GBP',
      includes: ['Ad spend from the Meta ad account, deleted ads included (same figures as CRM → Reports)', 'Enquiries with channel Meta ads, including older Meta lead-form enquiries by their source', 'Not included: creative, staff time, agency fees'],
      note:
        meta.state === 'off'
          ? 'Meta ad spend is not connected (META_ADS_TOKEN and META_AD_ACCOUNT_ID).'
          : meta.state === 'error'
            ? meta.error
            : meta.warning,
    },
  };
}
