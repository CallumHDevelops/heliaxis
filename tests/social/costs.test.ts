import { describe, expect, it } from 'vitest';
import { buildReport, callCostUsd, DEFAULT_ASSUMPTIONS, modelPrice } from '@/lib/social/costs';

describe('call cost', () => {
  it('prices Haiku at $0.10 in and $0.50 out per million tokens', () => {
    expect(callCostUsd('claude-haiku-5-5', { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(0.6, 6);
  });
  it('prices cache reads at 10% and cache writes at 125% of input', () => {
    expect(callCostUsd('claude-sonnet-5-5', { cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.2, 6);
    expect(callCostUsd('claude-sonnet-5-5', { cache_creation_input_tokens: 1_000_000 })).toBeCloseTo(2.5, 6);
  });
  it('treats missing usage as zero', () => {
    expect(callCostUsd('claude-haiku-5-5', {})).toBe(0);
    expect(callCostUsd('claude-haiku-5-5', { input_tokens: null, output_tokens: null })).toBe(0);
  });
  it('prices an unknown model like Opus, so cost is never under-stated', () => {
    expect(modelPrice('some-new-model')).toEqual(modelPrice('claude-opus-5-5'));
  });
  it('a typical comment costs a fraction of a penny', () => {
    const usd = callCostUsd('claude-haiku-5-5', { input_tokens: 1800, output_tokens: 200 }) + callCostUsd('claude-haiku-5-5', { input_tokens: 2500, output_tokens: 250 });
    expect(usd).toBeLessThan(0.005);
  });
});

describe('report', () => {
  const a = DEFAULT_ASSUMPTIONS;
  const v = { received: 100, handled: 90, draftsUsed: 60, urgentAlerts: 5, aiCalls: 200, aiCostUsd: 0.5 };
  const r = buildReport(v, a);
  it('converts AI cost to pounds and checks the monthly cap', () => {
    expect(r.aiCostGbp).toBeCloseTo(0.39, 2);
    expect(r.capUsedPct).toBeCloseTo(3.9, 1);
  });
  it('adds fixed costs to running cost', () => {
    const r2 = buildReport(v, { ...a, fixed_costs_gbp: { A: 20, B: 25 } });
    expect(r2.fixedCostsGbp).toBe(45);
    expect(r2.runningCostGbp).toBeCloseTo(45.39, 2);
  });
  it('works out hours saved from the assumptions', () => {
    expect(r.hours.triage).toBeCloseTo(3.3, 1); // 100 x 2 min
    expect(r.hours.replies).toBeCloseTo(4.5, 1); // 60 x (6 - 1.5) min
    expect(r.hours.monitoring).toBeCloseTo(7.3, 1); // 20 min x 22 days
    expect(r.hours.total).toBeCloseTo(15.2, 1);
  });
  it('values time at the hourly rate and keeps the paid-tool comparison separate', () => {
    expect(r.timeValueGbp).toBeCloseTo(r.hours.total * 20, -1);
    expect(r.vsToolSavingGbp).toBeCloseTo(a.comparison_tool_monthly_gbp - r.runningCostGbp, 2);
    expect(r.netSavingGbp).toBeCloseTo(r.timeValueGbp - r.runningCostGbp, 2);
  });
  it('quiet month: fewer comments, fewer hours saved', () => {
    const q = buildReport({ ...v, received: 0, handled: 0, draftsUsed: 0, aiCostUsd: 0 }, a);
    expect(q.hours.triage).toBe(0);
    expect(q.hours.replies).toBe(0);
    expect(q.returnPerPound).toBeNull();
  });
});
