import { describe, expect, it } from 'vitest';
import { BENEFITS, buildValueReport, DEFAULTS, QUALITATIVE } from '@/lib/value/model';

describe('value report', () => {
  const counts = { smart_replies: 120, online_bookings: 10, handover_packs: 2, social_triage: 40, social_replies: 25 };
  const r = buildValueReport(counts, { socialAiUsd: 1, templateMessages: 100 }, DEFAULTS);
  const row = (k: string) => r.rows.find((x) => x.key === k)!;

  it('turns counts and minutes into hours', () => {
    expect(row('smart_replies').hours).toBe(3); // 120 x 1.5 min
    expect(row('online_bookings').hours).toBe(2); // 10 x 12 min
    expect(row('handover_packs').hours).toBe(1); // 2 x 30 min
  });
  it('values the monitoring saving as a flat monthly amount once comments are being tracked', () => {
    expect(row('social_monitoring').hours).toBeCloseTo(7.33, 1); // 20 min x 22 days
  });
  it('gives nothing for a benefit that could not be counted', () => {
    expect(row('purchase_orders').count).toBeNull();
    expect(row('purchase_orders').hours).toBe(0);
  });
  it('adds up hours and values them at the hourly rate', () => {
    expect(r.totalHours).toBeCloseTo(r.rows.reduce((s, x) => s + x.hours, 0), 1);
    expect(r.timeValueGbp).toBeCloseTo(r.totalHours * 20, 0);
  });
  it('measures AI and WhatsApp fees, and adds the costs you enter', () => {
    const r2 = buildValueReport(counts, { socialAiUsd: 1, templateMessages: 100 }, { ...DEFAULTS, costs_gbp: { Supabase: 20 }, metis_monthly_gbp: 5 });
    expect(r2.costs.map((c) => c.gbp)).toEqual([0.78, 2, 5, 20]);
    expect(r2.runningCostGbp).toBeCloseTo(27.78, 2);
    expect(r2.netGbp).toBeCloseTo(r2.timeValueGbp - 27.78, 1);
  });
  it('says nothing about return when nothing has been spent', () => {
    expect(buildValueReport({}, { socialAiUsd: 0, templateMessages: 0 }, DEFAULTS).returnPerPound).toBeNull();
  });
  it('lists every benefit once, with a default for each', () => {
    const keys = BENEFITS.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(DEFAULTS.minutes[k]).toBeGreaterThanOrEqual(0);
    expect(QUALITATIVE.length).toBeGreaterThan(5);
  });
});
