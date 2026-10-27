import { describe, expect, it } from 'vitest';
import { dashStats, type DashJob, type DashQuote } from '@/lib/crm/dashboard-stats';

const NOW = Date.parse('2026-10-27T12:00:00Z');
const d = (days: number, hours = 0) => new Date(NOW - days * 86_400_000 - hours * 3_600_000).toISOString();
const job = (o: Partial<DashJob>): DashJob => ({ id: Math.random().toString(36).slice(2), enquiry_id: 'e1', stage: 'lead', value: null, created_at: d(5), first_contact_at: null, accepted_at: null, stage_changed_at: null, project_ref: null, title: null, ...o });
const names = new Map([['e1', 'Sam Williams'], ['e2', 'Jo Evans']]);
const content = (net: number) => ({ intro: '', terms: '', blocks: [{ id: 'b', type: 'items', heading: '', lines: [{ id: 'i', description: 'System', qty: 1, unit_pence: net * 100, vat_rate: 0, cost_pence: 0, mode: 'manual', markup: 0 }] }] });
const quote = (o: Partial<DashQuote>): DashQuote => ({ id: Math.random().toString(36).slice(2), number: 'Q-1001', project_id: 'p', enquiry_id: 'e1', status: 'sent', sent_at: d(3), valid_until: null, content: content(1000), ...o });
const run = (jobs: DashJob[], quotes: DashQuote[] = [], days = 30) => dashStats({ jobs, quotes, names, now: NOW, days, today: '2026-10-27' });

describe('CRM dashboard numbers', () => {
  it('adds up sales in the period, compares with the one before, by the day sold', () => {
    const r = run([
      job({ stage: 'won', value: 8000, accepted_at: d(5) }),
      job({ stage: 'installing', value: 4000, accepted_at: d(20) }),
      job({ stage: 'complete', value: 5000, accepted_at: d(45) }), // the period before
      job({ stage: 'quote_sent', value: 9999, accepted_at: null }), // not sold
      job({ stage: 'won', value: 1000, accepted_at: d(120) }), // too old
    ]);
    expect(r.sales).toMatchObject({ value: 12000, count: 2, prevValue: 5000, prevCount: 1, average: 6000 });
    expect(r.sales.change).toBeCloseTo((12000 - 5000) / 5000);
    expect(r.wins[0].value).toBe(8000);
    expect(r.wins[0].customer).toBe('Sam Williams');
  });
  it('counts a quote as live while sent and in date, and totals its value', () => {
    const r = run([], [quote({}), quote({ valid_until: '2026-12-01', content: content(2500) }), quote({ valid_until: '2026-10-01' }), quote({ status: 'accepted' }), quote({ status: 'draft' })]);
    expect(r.quotes.liveCount).toBe(2);
    expect(r.quotes.liveValue).toBe(3500);
    expect(r.quotes.rows.find((x) => x.pastValid)).toBeTruthy();
    expect(r.quotes.quotedCount).toBe(4);
  });
  it('averages the time from a new job to the first contact, and counts people still waiting', () => {
    const r = run([
      job({ created_at: d(2), first_contact_at: d(2, -0.25) }), // 15 minutes
      job({ created_at: d(3), first_contact_at: d(3, -1) }), // 60 minutes
      job({ created_at: d(1, 5), first_contact_at: null }), // waiting 29 hours
      job({ created_at: d(90), first_contact_at: d(90, -10) }), // outside the period
    ]);
    expect(r.response.n).toBe(2);
    expect(r.response.meanMins).toBeCloseTo(37.5);
    expect(r.response.medianMins).toBeCloseTo(60);
    expect(r.response.within15).toBeCloseTo(0.5);
    expect(r.response.waiting).toBe(1);
    expect(r.response.oldestWaitingMins).toBeCloseTo(29 * 60);
    expect(r.enquiries.count).toBe(3);
  });
  it('copes with nothing at all', () => {
    const r = run([]);
    expect(r.sales.value).toBe(0);
    expect(r.response.meanMins).toBeNull();
    expect(r.sales.change).toBeNull();
  });
});
