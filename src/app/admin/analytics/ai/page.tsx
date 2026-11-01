import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { getSessionProfile } from '@/lib/auth';
import { averagePerProposal, byFeature, byQuote, FEATURE_LABEL, monthStart, type UsageRow } from '@/lib/ai-usage-report';
import { loadAssumptions } from '@/lib/social/assumptions';
import { createAdminClient } from '@/lib/supabase/admin';
import './ai.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'AI costs — Heliaxis CMS', robots: { index: false, follow: false } };

const SINCE_DAYS = 120;

/** The clock is read here, outside the page's render. */
const now = () => Date.now();

export default async function AiCostsPage() {
  const { profile } = await getSessionProfile();
  if (profile?.role !== 'admin') redirect('/admin?denied=1');
  const db = createAdminClient();
  const since = new Date(now() - SINCE_DAYS * 86_400_000).toISOString();
  const [a, social, fx] = await Promise.all([
    db.from('ai_usage').select('at, feature, ref, cost_usd, input_tokens, output_tokens').gte('at', since).order('at', { ascending: false }).limit(20000),
    db.from('social_usage').select('at, kind, cost_usd, input_tokens, output_tokens').gte('at', since).limit(20000),
    loadAssumptions(),
  ]);
  const missing = !!a.error;
  const rows: UsageRow[] = [
    ...((a.data ?? []) as UsageRow[]),
    ...((social.data ?? []) as { at: string; kind: string; cost_usd: number; input_tokens: number; output_tokens: number }[]).map((r) => ({ ...r, feature: `social_${r.kind}`, ref: null })),
  ];
  const gbp = (usd: number) => usd * fx.usd_to_gbp;
  const money = (usd: number) => {
    const v = gbp(usd);
    return v < 0.1 ? `£${v.toFixed(3)}` : `£${v.toFixed(2)}`;
  };
  const thisMonth = rows.filter((r) => r.at >= monthStart());
  const monthTotal = thisMonth.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
  const allTotal = rows.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
  const features = byFeature(rows);
  const quotes = byQuote(rows);
  const avg = averagePerProposal(quotes);

  const ids = quotes.slice(0, 40).map((q) => q.ref);
  const { data: qrows } = ids.length ? await db.from('crm_quotes').select('id, number, title').in('id', ids) : { data: [] };
  const info = new Map((qrows ?? []).map((q) => [q.id as string, q as { number: string; title: string }]));

  return (
    <AdminShell active="aicosts" isAdmin>
      <div className="ac">
        <h1>AI costs</h1>
        <p className="ac-muted">
          What the AI steps cost, from the calls we have recorded (the last {SINCE_DAYS} days). Priced at Anthropic’s published rates per token and shown in pounds at {fx.usd_to_gbp} to the dollar.
        </p>
        {missing && (
          <p className="ac-warn">
            Nothing is being recorded yet. Run <code>supabase/ai-usage.sql</code> in the Supabase SQL editor once, then the next AI step will show up here.
          </p>
        )}

        <div className="ac-tiles">
          <div>
            <small>This month</small>
            <b>{money(monthTotal)}</b>
          </div>
          <div>
            <small>Last {SINCE_DAYS} days</small>
            <b>{money(allTotal)}</b>
          </div>
          <div>
            <small>Average per quote with a proposal</small>
            <b>{avg === null ? 'No data yet' : money(avg)}</b>
          </div>
          <div>
            <small>Quotes with a proposal read</small>
            <b>{quotes.filter((q) => q.reads > 0).length}</b>
          </div>
        </div>

        <h2>What a proposal costs</h2>
        <p className="ac-muted">Everything spent on a quote: reading its OpenSolar proposal, then writing its introduction and What is included (each time it is written, including rewrites).</p>
        {quotes.length === 0 ? (
          <p className="ac-muted">No quotes yet.</p>
        ) : (
          <div className="ac-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quote</th>
                  <th>Reading</th>
                  <th>Introduction</th>
                  <th>What is included</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {quotes.slice(0, 40).map((q) => {
                  const i = info.get(q.ref);
                  return (
                    <tr key={q.ref}>
                      <td>
                        <a href={`/admin/sales/quotes/${q.ref}`}>{i?.number ?? 'Quote'}</a> <span className="ac-muted">{i?.title ?? ''}</span>
                      </td>
                      <td>{money(q.byFeature.proposal_read ?? 0)}</td>
                      <td>{money(q.byFeature.quote_intro ?? 0)}</td>
                      <td>{money(q.byFeature.quote_included ?? 0)}</td>
                      <td>
                        <b>{money(q.costUsd)}</b>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <h2>By feature</h2>
        <div className="ac-wrap">
          <table>
            <thead>
              <tr>
                <th>Feature</th>
                <th>Calls</th>
                <th>Tokens in / out</th>
                <th>Average per call</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {features.length === 0 && (
                <tr>
                  <td colSpan={5} className="ac-muted">
                    Nothing recorded yet.
                  </td>
                </tr>
              )}
              {features.map((f) => (
                <tr key={f.feature}>
                  <td>{FEATURE_LABEL[f.feature] ?? f.feature}</td>
                  <td>{f.calls}</td>
                  <td>
                    {f.inputTokens.toLocaleString('en-GB')} / {f.outputTokens.toLocaleString('en-GB')}
                  </td>
                  <td>{money(f.costUsd / f.calls)}</td>
                  <td>
                    <b>{money(f.costUsd)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ac-muted">Only calls made since this page was added are counted. Rates are estimates from token counts, so the Anthropic console remains the exact bill.</p>
      </div>
    </AdminShell>
  );
}
