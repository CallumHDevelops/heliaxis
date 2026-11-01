import { describe, expect, it } from 'vitest';
import { averagePerProposal, byFeature, byQuote, type UsageRow } from '@/lib/ai-usage-report';

const row = (feature: string, ref: string | null, cost: number, at = '2026-11-01T10:00:00Z'): UsageRow => ({ at, feature, ref, cost_usd: cost, input_tokens: 1000, output_tokens: 200 });

describe('AI cost report', () => {
  const rows = [row('proposal_read', 'q1', 0.04), row('quote_intro', 'q1', 0.01), row('quote_included', 'q1', 0.02), row('quote_intro', 'q1', 0.01), row('quote_intro', 'q2', 0.01), row('blog', null, 0.3)];

  it('adds up by feature, dearest first', () => {
    const f = byFeature(rows);
    expect(f[0].feature).toBe('blog');
    expect(f.find((x) => x.feature === 'quote_intro')).toMatchObject({ calls: 3 });
    expect(f.find((x) => x.feature === 'quote_intro')!.costUsd).toBeCloseTo(0.03);
  });

  it('adds up everything spent on each quote, ignoring other features', () => {
    const q = byQuote(rows);
    expect(q).toHaveLength(2);
    const q1 = q.find((x) => x.ref === 'q1')!;
    expect(q1.costUsd).toBeCloseTo(0.08);
    expect(q1.reads).toBe(1);
  });

  it('averages only over quotes that had a proposal read', () => {
    expect(averagePerProposal(byQuote(rows))).toBeCloseTo(0.08);
    expect(averagePerProposal([])).toBeNull();
  });
});
