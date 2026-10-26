import { describe, expect, it } from 'vitest';
import { buildReport, periodStart } from '@/lib/quotes/report';

const line = (cost: number, sell: number, qty = 1) => ({ description: 'x', qty, cost_pence: cost, mode: 'manual', unit_pence: sell, vat_rate: 20 });
const q = (id: string, status: string, month: string, lines: unknown[], extra: Record<string, unknown> = {}) => ({
  id, number: `Q-${id}`, title: 't', status, sent_at: `${month}-10T10:00:00Z`, accepted_at: status === 'accepted' ? `${month}-12T10:00:00Z` : null,
  created_at: `${month}-01T10:00:00Z`, customer: 'C', project_id: 'p', content: { blocks: [{ type: 'items', lines }] }, ...extra,
});

describe('margin report', () => {
  it('counts sent and won, leaves drafts out, ignores VAT, and flags low margins', () => {
    const r = buildReport(
      [q('1', 'accepted', '2026-10', [line(60000, 100000)]), q('2', 'sent', '2026-10', [line(90000, 100000)]), q('3', 'draft', '2026-10', [line(1, 2)]), q('4', 'accepted', '2026-09', [line(50000, 100000)])],
      { from: null, targetPct: 20 }
    );
    expect(r.sent.count).toBe(3);
    expect(r.won.count).toBe(2);
    expect(r.won.sell).toBe(200000);
    expect(r.won.profit).toBe(90000);
    expect(Math.round(r.won.marginPct ?? 0)).toBe(45);
    expect(r.rows.find((x) => x.id === '2')?.belowTarget).toBe(true); // 10% < 20%
    expect(r.rows.find((x) => x.id === '4')?.belowTarget).toBe(false);
    expect(r.months.map((m) => m.month)).toEqual(['2026-10', '2026-09']);
  });
  it('limits to a period', () => {
    expect(periodStart('3m', '2026-10-26')).toBe('2026-08-01');
    expect(periodStart('all', '2026-10-26')).toBeNull();
    const r = buildReport([q('1', 'accepted', '2026-05', [line(1, 2)]), q('2', 'accepted', '2026-10', [line(1, 2)])], { from: '2026-08-01', targetPct: 0 });
    expect(r.rows).toHaveLength(1);
  });
});
