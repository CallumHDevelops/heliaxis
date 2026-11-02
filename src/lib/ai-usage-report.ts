/** The AI cost report's sums. Pure: the page feeds it the saved rows. */
export type UsageRow = { at: string; feature: string; ref: string | null; cost_usd: number; input_tokens: number; output_tokens: number };

export const FEATURE_LABEL: Record<string, string> = {
  proposal_read: 'Reading an OpenSolar proposal',
  quote_intro: 'Writing a quote introduction',
  quote_included: 'Writing What is included',
  mcs_read: 'Reading an MCS certificate',
  label_read: 'Reading an equipment photo',
  blog: 'Blog articles',
  assistant: 'The assistant (Metis)',
  cms_page: 'CMS page generator',
  social_classify: 'Social: sorting comments',
  social_draft: 'Social: drafting replies',
  social_geo: 'Social: AI-answer checks',
};

export type FeatureTotal = { feature: string; label: string; calls: number; costUsd: number; inputTokens: number; outputTokens: number };
export type QuoteTotal = { ref: string; reads: number; costUsd: number; byFeature: Record<string, number>; lastAt: string };

const sum = (n: number[]) => n.reduce((a, b) => a + b, 0);

export function byFeature(rows: UsageRow[]): FeatureTotal[] {
  const m = new Map<string, FeatureTotal>();
  for (const r of rows) {
    const t = m.get(r.feature) ?? { feature: r.feature, label: FEATURE_LABEL[r.feature] ?? r.feature, calls: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 };
    t.calls += 1;
    t.costUsd += Number(r.cost_usd) || 0;
    t.inputTokens += r.input_tokens || 0;
    t.outputTokens += r.output_tokens || 0;
    m.set(r.feature, t);
  }
  return [...m.values()].sort((a, b) => b.costUsd - a.costUsd);
}

/** Everything spent on each quote (reading its proposal and writing its text), newest first. */
export function byQuote(rows: UsageRow[]): QuoteTotal[] {
  const m = new Map<string, QuoteTotal>();
  for (const r of rows) {
    if (!r.ref || !r.feature.startsWith('quote_') && r.feature !== 'proposal_read') continue;
    const t = m.get(r.ref) ?? { ref: r.ref, reads: 0, costUsd: 0, byFeature: {}, lastAt: r.at };
    t.costUsd += Number(r.cost_usd) || 0;
    t.byFeature[r.feature] = (t.byFeature[r.feature] ?? 0) + (Number(r.cost_usd) || 0);
    if (r.feature === 'proposal_read') t.reads += 1;
    if (r.at > t.lastAt) t.lastAt = r.at;
    m.set(r.ref, t);
  }
  return [...m.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
}

/** Average cost of a quote that had a design proposal read: all its AI steps together. */
export function averagePerProposal(quotes: QuoteTotal[]): number | null {
  const withProposal = quotes.filter((q) => q.reads > 0);
  return withProposal.length ? sum(withProposal.map((q) => q.costUsd)) / withProposal.length : null;
}

export function monthStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
