import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { averagePerProposal, byFeature, byQuote, monthStart, type UsageRow } from '@/lib/ai-usage-report';
import { adSpendConfigured, adSpendFigures } from '@/lib/meta-ads';
import { leadAreas } from '@/lib/crm/lead-geo';
import { salesReport } from '@/lib/crm/sales-report';
import { loadAssumptions } from '@/lib/social/assumptions';

/**
 * What Metis can tell the team about money and leads, read-only. Every figure comes from the same code as the reports on screen (the AI
 * costs page, CRM reports and the leads map), so she can't give a different answer from the page.
 */

const clampDays = (v: unknown, fallback = 90) => Math.min(730, Math.max(7, Math.round(Number(v)) || fallback));
const r2 = (n: number) => Math.round(n * 100) / 100;

/** AI spend (admins only: it is money). */
export async function aiSpendAnswer(userId: string, daysIn: unknown): Promise<string> {
  const db = createAdminClient();
  const { data: me } = await db.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (me?.role !== 'admin') return 'AI costs are for admins only, so I can’t share them with this account.';
  const days = clampDays(daysIn, 30);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [a, social, fx] = await Promise.all([
    db.from('ai_usage').select('at, feature, ref, cost_usd, input_tokens, output_tokens').gte('at', since).limit(20000),
    db.from('social_usage').select('at, kind, cost_usd, input_tokens, output_tokens').gte('at', since).limit(20000),
    loadAssumptions(),
  ]);
  if (a.error) return 'The AI cost log isn’t set up yet (supabase/ai-usage.sql), so nothing has been recorded.';
  const rows: UsageRow[] = [
    ...((a.data ?? []) as UsageRow[]),
    ...((social.data ?? []) as { at: string; kind: string; cost_usd: number; input_tokens: number; output_tokens: number }[]).map((r) => ({ ...r, feature: `social_${r.kind}`, ref: null })),
  ];
  const gbp = (usd: number) => r2(usd * fx.usd_to_gbp);
  const total = rows.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
  const month = rows.filter((r) => r.at >= monthStart()).reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
  const quotes = byQuote(rows);
  const avg = averagePerProposal(quotes);
  const first = rows.reduce<string | null>((m, r) => (!m || r.at < m ? r.at : m), null);
  return JSON.stringify({
    period_days: days,
    total_gbp: gbp(total),
    this_month_gbp: gbp(month),
    calls: rows.length,
    average_cost_per_quote_with_a_proposal_gbp: avg === null ? null : r2(avg * fx.usd_to_gbp * 100) / 100,
    quotes_with_a_proposal: quotes.filter((q) => q.reads > 0).length,
    by_feature: byFeature(rows).map((f) => ({ feature: f.label, calls: f.calls, cost_gbp: gbp(f.costUsd) })),
    first_recorded: first,
    note: 'Costs are estimates from token counts at published prices, in pounds at ' + fx.usd_to_gbp + ' to the dollar. Only calls since recording began (first_recorded) are counted; say so if the period is longer.',
  });
}

/** Where leads come from: by source and by place. */
export async function leadSourcesAnswer(daysIn: unknown): Promise<{ text: string; mapHref: string }> {
  const days = clampDays(daysIn);
  const off = Promise.resolve({ state: 'off' } as Awaited<ReturnType<typeof adSpendFigures>>);
  const [report, geo] = await Promise.all([salesReport(days, off, false), leadAreas(days)]);
  const rows = report.bySource.map((r) => ({ source: r.key, leads: r.leads, surveys: r.surveys, won: r.won, lost: r.lost, value_gbp: Math.round(r.value) }));
  const top = [...geo.areas].sort((a, b) => b.leads - a.leads).slice(0, 8).map((a) => ({ area: a.outcode, town: a.town, leads: a.leads, won: a.won }));
  return {
    mapHref: `/admin/crm/map?days=${days}`,
    text: JSON.stringify({
      period_days: days,
      total_leads: report.totals.leads,
      sold: report.totals.won,
      by_source: rows.slice(0, 12),
      leads_by_group: geo.bySource,
      top_areas: top,
      leads_placed_on_map: geo.located,
      leads_without_a_usable_postcode: geo.total - geo.located,
      note: 'A map of these is on the Leads map page; the link is shown under your reply. Postcode areas are the first half of the postcode.',
    }),
  };
}

/** The best (and worst) Meta ads: spend, leads, surveys and sales beside each other. */
export async function adPerformanceAnswer(daysIn: unknown): Promise<string> {
  if (!adSpendConfigured()) return 'Meta ad spend isn’t connected, so I can only see where leads came from, not what each ad cost. Ask me for lead sources instead.';
  const days = clampDays(daysIn);
  const spending = adSpendFigures(days, {});
  const report = await salesReport(days, spending, true);
  const ad = report.adSpend;
  if (ad.state !== 'ok') return ad.state === 'error' ? `Meta didn’t give the ad figures: ${ad.error}` : 'Meta ad spend isn’t set up.';
  const money = (pence: number | null) => (pence == null ? null : r2(pence / 100));
  const ads = ad.groups.flatMap((g) =>
    g.rows.map((r) => ({
      campaign: g.label,
      ad: r.label,
      leads: r.leads,
      surveys: r.surveys,
      sold: r.won,
      sold_value_gbp: Math.round(r.value),
      spend_gbp: money(r.spend),
      cost_per_lead_gbp: r.spend != null && r.leads ? r2(r.spend / 100 / r.leads) : null,
      cost_per_sale_gbp: r.spend != null && r.won ? r2(r.spend / 100 / r.won) : null,
    }))
  );
  const spent = ads.filter((a) => a.spend_gbp != null);
  return JSON.stringify({
    period_days: days,
    currency: ad.currency,
    account_total: { leads: ad.total.leads, sold: ad.total.won, spend_gbp: money(ad.total.spend) },
    best_by_cost_per_lead: [...spent].filter((a) => a.cost_per_lead_gbp != null).sort((a, b) => a.cost_per_lead_gbp! - b.cost_per_lead_gbp!).slice(0, 5),
    best_by_sales: [...ads].sort((a, b) => b.sold - a.sold || b.leads - a.leads).slice(0, 5),
    biggest_spend_with_no_sales: spent.filter((a) => !a.sold).sort((a, b) => b.spend_gbp! - a.spend_gbp!).slice(0, 3),
    note: 'Small numbers: an ad with a handful of leads is not proof. Say which measure you ranked by.',
  });
}
